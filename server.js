const http = require("node:http");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { EventEmitter } = require("node:events");
const { version: APP_VERSION } = require("./package.json");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3100);
const APP_ROOT = process.cwd();
const PUBLIC_DIR = path.join(APP_ROOT, "public");
const WORKSPACES_ROOT = path.join(APP_ROOT, "workspaces");
const TEMP_ZIP_DIR = path.join(os.tmpdir(), "codex-web-bridge-zips");
const FORMAT_CONFIG_FILE = "format.config.json";
const MAX_HISTORY_EVENTS = 500;
const SSE_HEARTBEAT_MS = 15000;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const CORS_ALLOWED_ORIGINS = String(process.env.CORS_ALLOWED_ORIGINS || "*")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const GRAPHVIZ_DOT_COMMAND = resolveGraphvizDotCommand();
const CODEX_COMMAND = resolveCodexCommand();

const sessions = new Map();
const participantRegistryCache = new Map();
const reportFormats = new Map();
let defaultReportFormatId = "";

class CodexSession extends EventEmitter {
  constructor({ id, name, workspacePath, formatDefinition }) {
    super();
    this.id = id;
    this.name = name;
    this.workspacePath = workspacePath;
    this.formatDefinition = formatDefinition || null;
    this.reportFormat = formatDefinition ? formatPublicSummary(formatDefinition) : null;
    this.threadId = null;
    this.codexProcess = null;
    this.buffer = "";
    this.pending = new Map();
    this.requestId = 1;
    this.history = [];
    this.status = "starting";
    this.busy = false;
    this.currentTurnId = null;
    this.currentAssistantItemId = null;
    this.currentAssistantText = "";
    this.closed = false;
    this.uploadedFiles = [];
    this.imageAssignments = [];
    this.participantProfile = null;
    this.quickFields = buildDefaultQuickFields(formatDefinition);
    this.currentTurnMeta = { visible: true, mode: "chat" };
    this.openingQuestion = formatDefinition?.bot?.openingQuestion || "Quien eres?";
    this.serviceName = formatDefinition?.bot?.serviceName || "Contexto";
  }

  async start(options = {}) {
    const developerInstructions = String(options.developerInstructions || "");
    const openingQuestion = String(options.openingQuestion || this.openingQuestion || "Quien eres?").trim();
    const serviceName = String(options.serviceName || this.serviceName || "Contexto").trim();

    this.openingQuestion = openingQuestion || "Quien eres?";
    this.serviceName = serviceName || "Contexto";
    this.codexProcess = await spawnCodexProcess(this.workspacePath);

    this.codexProcess.stdout.setEncoding("utf8");
    this.codexProcess.stdout.on("data", (chunk) => this.#handleStdout(chunk));
    this.codexProcess.stderr.setEncoding("utf8");
    this.codexProcess.stderr.on("data", (chunk) => this.#handleStderr(chunk));
    this.codexProcess.on("exit", (code, signal) => {
      this.closed = true;
      this.busy = false;
      this.status = "closed";
      this.#emitEvent("session-exit", {
        code,
        signal,
        message: "La sesion de Contexto se cerro.",
      });
      for (const { reject } of this.pending.values()) {
        reject(new Error("Contexto se cerro antes de responder."));
      }
      this.pending.clear();
    });

    await this.#sendRequest("initialize", {
      clientInfo: {
        name: "codex-web-bridge",
        version: APP_VERSION,
      },
      capabilities: {
        experimentalApi: true,
      },
    });

    const started = await this.#sendRequest("thread/start", {
      cwd: this.workspacePath,
      approvalPolicy: "never",
      sandbox: "danger-full-access",
      personality: "friendly",
      developerInstructions: developerInstructions ||
        "Estas siendo usado desde una interfaz web local. Responde de forma clara y util.",
      serviceName: this.serviceName,
    });

    this.threadId = started.thread.id;
    this.status = "idle";
    this.#emitEvent("session-ready", this.snapshot(false));
    return this.snapshot();
  }

  snapshot(includeHistory = true) {
    return {
      id: this.id,
      name: this.name,
      workspacePath: this.workspacePath,
      reportProjectPath: this.reportProjectPath || null,
      reportTexPath: this.reportTexPath || null,
      reportPdfPath: this.reportPdfPath || null,
      imagesDir: this.imagesDir || null,
      filesDir: this.filesDir || null,
      exportDir: this.exportDir || null,
      threadId: this.threadId,
      status: this.status,
      busy: this.busy,
      uploadedFiles: this.uploadedFiles,
      participantProfile: this.participantProfile,
      quickFields: this.quickFields,
      reportFormat: this.reportFormat,
      openingQuestion: this.openingQuestion || "Quien eres?",
      history: includeHistory ? this.history : undefined,
    };
  }

  async sendUserMessage(text, options = {}) {
    if (this.closed) {
      throw new Error("La sesion ya esta cerrada.");
    }
    if (!this.threadId) {
      throw new Error("La sesion todavia no esta lista.");
    }
    if (this.busy) {
      throw new Error("Contexto todavia esta respondiendo el mensaje anterior.");
    }

    const content = String(text || "").trim();
    if (!content) {
      throw new Error("El mensaje no puede estar vacio.");
    }

    const turnMeta = {
      visible: options.visible !== false,
      mode: String(options.mode || "chat"),
    };
    this.currentTurnMeta = turnMeta;

    this.busy = true;
    this.status = "running";
    this.currentAssistantItemId = null;
    this.currentAssistantText = "";

    const userMessage = {
      id: randomUUID(),
      role: "user",
      text: content,
      createdAt: new Date().toISOString(),
      internal: !turnMeta.visible,
      interactionMode: turnMeta.mode,
    };
    this.#emitEvent("chat-message", userMessage);
    this.#emitEvent("status", { status: this.status, busy: this.busy });

    const turn = await this.#sendRequest("turn/start", {
      threadId: this.threadId,
      input: [{ type: "text", text: content }],
    });

    this.currentTurnId = turn.turn.id;
    const turnId = turn.turn.id;

    return new Promise((resolve, reject) => {
      const onComplete = (payload) => {
        if (payload.turnId !== turnId) {
          return;
        }
        cleanup();
        resolve(payload);
      };

      const onError = (payload) => {
        if (payload.turnId && payload.turnId !== turnId) {
          return;
        }
        cleanup();
        reject(new Error(payload.message || "La sesion recibio un error."));
      };

      const cleanup = () => {
        this.off("turn-complete", onComplete);
        this.off("session-error", onError);
      };

      this.on("turn-complete", onComplete);
      this.on("session-error", onError);
    });
  }

  close() {
    if (this.codexProcess && !this.codexProcess.killed) {
      this.codexProcess.kill();
    }
  }

  registerUpload(fileInfo) {
    this.uploadedFiles = [
      fileInfo,
      ...this.uploadedFiles.filter((item) => item.path !== fileInfo.path),
    ].slice(0, 12);
    this.#emitEvent("file-uploaded", fileInfo);
  }

  unregisterUpload(filePath) {
    const existing = this.uploadedFiles.find((item) => item.path === filePath);
    if (!existing) {
      return null;
    }

    this.uploadedFiles = this.uploadedFiles.filter((item) => item.path !== filePath);
    this.#emitEvent("file-deleted", existing);
    return existing;
  }

  registerImageAssignment(imageInfo) {
    this.imageAssignments = [
      imageInfo,
      ...this.imageAssignments.filter((item) => item.requestedName !== imageInfo.requestedName),
    ].slice(0, 20);
  }

  unregisterImageAssignment(finalName) {
    const existing = this.imageAssignments.find((item) => item.finalName === finalName);
    if (!existing) {
      return null;
    }

    this.imageAssignments = this.imageAssignments.filter((item) => item.finalName !== finalName);
    return existing;
  }

  setParticipantProfile(profile) {
    this.participantProfile = profile;
    this.#emitEvent("session-updated", this.snapshot(false));
  }

  mergeQuickFields(partialFields = {}) {
    this.quickFields = {
      ...buildDefaultQuickFields(this.formatDefinition),
      ...this.quickFields,
      ...sanitizeQuickFields(partialFields, this.formatDefinition),
    };
    this.#emitEvent("session-updated", this.snapshot(false));
    return this.quickFields;
  }

  async #sendRequest(method, params) {
    const id = this.requestId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.codexProcess.stdin.write(payload, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  #handleStdout(chunk) {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line) {
        this.#handleMessage(line);
      }
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  #handleMessage(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      this.#emitEvent("session-error", {
        message: "No se pudo procesar una respuesta de Contexto.",
        detail: error.message,
      });
      return;
    }

    if (Object.prototype.hasOwnProperty.call(message, "id")) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || "Error de JSON-RPC."));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    this.#handleNotification(message.method, message.params || {});
  }

  #handleNotification(method, params) {
    if (method === "thread/status/changed") {
      this.status = params.status?.type || this.status;
      this.#emitEvent("status", { status: this.status, busy: this.busy });
      return;
    }

    if (method === "item/started" && params.item?.type === "agentMessage") {
      this.currentAssistantItemId = params.item.id;
      this.currentAssistantText = params.item.text || "";
      const assistantMessage = {
        id: params.item.id,
        role: "assistant",
        text: this.currentAssistantText,
        createdAt: new Date().toISOString(),
        streaming: true,
        internal: !this.currentTurnMeta.visible,
        interactionMode: this.currentTurnMeta.mode,
      };
      this.#emitEvent("chat-message", assistantMessage);
      return;
    }

    if (method === "item/agentMessage/delta") {
      if (params.itemId !== this.currentAssistantItemId) {
        this.currentAssistantItemId = params.itemId;
        this.currentAssistantText = "";
      }
      this.currentAssistantText += params.delta || "";
      this.#emitEvent("assistant-delta", {
        id: params.itemId,
        delta: params.delta || "",
        text: this.currentAssistantText,
        internal: !this.currentTurnMeta.visible,
        interactionMode: this.currentTurnMeta.mode,
      });
      return;
    }

    if (method === "item/completed" && params.item?.type === "agentMessage") {
      this.currentAssistantItemId = params.item.id;
      this.currentAssistantText = params.item.text || this.currentAssistantText;
      this.#emitEvent("assistant-complete", {
        id: params.item.id,
        text: this.currentAssistantText,
        internal: !this.currentTurnMeta.visible,
        interactionMode: this.currentTurnMeta.mode,
      });
      return;
    }

    if (method === "turn/completed") {
      this.busy = false;
      this.status = "idle";
      const payload = {
        turnId: params.turn?.id || this.currentTurnId,
        status: params.turn?.status || "completed",
        assistantItemId: this.currentAssistantItemId,
        assistantText: this.currentAssistantText,
        internal: !this.currentTurnMeta.visible,
        interactionMode: this.currentTurnMeta.mode,
      };
      this.currentTurnId = null;
      this.currentTurnMeta = { visible: true, mode: "chat" };
      this.#emitEvent("status", { status: this.status, busy: this.busy });
      this.#emitEvent("turn-complete", payload);
      return;
    }

    if (method === "error") {
      this.busy = false;
      this.status = "error";
      this.currentTurnMeta = { visible: true, mode: "chat" };
      this.#emitEvent("status", { status: this.status, busy: this.busy });
      this.#emitEvent("session-error", {
        turnId: this.currentTurnId,
        message: params.message || "Contexto devolvio un error.",
        detail: params,
      });
    }
  }

  #handleStderr(chunk) {
    const text = String(chunk || "").trim();
    if (!text) {
      return;
    }
    console.warn(`[codex ${this.id}] ${text}`);
  }

  #emitEvent(type, payload) {
    const event = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    this.history.push(event);
    if (this.history.length > MAX_HISTORY_EVENTS) {
      this.history.splice(0, this.history.length - MAX_HISTORY_EVENTS);
    }
    this.emit("event", event);
    this.emit(type, payload);
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function resolveConfigPath(baseDir, targetPath) {
  if (!targetPath) {
    return "";
  }

  return path.isAbsolute(targetPath)
    ? path.normalize(targetPath)
    : path.join(baseDir, targetPath);
}

function formatPublicSummary(formatDefinition) {
  const quickPanel = formatDefinition?.quickPanel || null;
  return {
    id: formatDefinition.id,
    label: formatDefinition.label,
    description: formatDefinition.description,
    usesParticipantProfiles: Boolean(formatDefinition?.context?.participantProfilesDir),
    quickPanel: quickPanel
      ? {
          title: quickPanel.title,
          description: quickPanel.description,
          emptyStatus: quickPanel.emptyStatus,
          readyStatus: quickPanel.readyStatus,
          saveSuccessText: quickPanel.saveSuccessText,
          applyingText: quickPanel.applyingText,
          applySuccessText: quickPanel.applySuccessText,
          fields: quickPanel.fields.map((field) => ({
            key: field.key,
            label: field.label,
            type: field.type,
            width: field.width,
            placeholder: field.placeholder,
            rows: field.rows,
            min: field.min,
            max: field.max,
            step: field.step,
            options: field.options,
            meta: field.meta,
          })),
          actions: quickPanel.actions.map((action) => ({
            type: action.type,
            label: action.label,
            dayOffset: action.dayOffset,
            startKey: action.startKey,
            endKey: action.endKey,
          })),
        }
      : null,
  };
}

function getAvailableFormatSummaries() {
  return Array.from(reportFormats.values()).map(formatPublicSummary);
}

function getDefaultFormatDefinition() {
  return reportFormats.get(defaultReportFormatId) || Array.from(reportFormats.values())[0] || null;
}

function getFormatDefinition(formatId) {
  return reportFormats.get(String(formatId || "").trim()) || getDefaultFormatDefinition();
}

function buildParticipantContextDefinition(formatDir, contextConfig = {}) {
  const participantProfilesDir = resolveConfigPath(formatDir, contextConfig.participantProfilesDir || "");
  const scheduleDir = resolveConfigPath(formatDir, contextConfig.scheduleDir || "");
  const scheduleRegistryMd = contextConfig.scheduleRegistryMd || "registro_horarios_participantes.md";
  const schedulePdf = contextConfig.schedulePdf || "horarios_participantes.pdf";
  const participantIndexTex = contextConfig.participantIndexTex || "indice_participantes.tex";
  const participantIndexPdf = contextConfig.participantIndexPdf || "indice_participantes.pdf";

  return {
    formatFiles: Array.isArray(contextConfig.formatFiles)
      ? contextConfig.formatFiles.map((entry) => resolveConfigPath(formatDir, entry))
      : [],
    participantProfilesDir,
    scheduleDir,
    scheduleRegistryMdPath: participantProfilesDir ? path.join(participantProfilesDir, scheduleRegistryMd) : "",
    schedulePdfPath: scheduleDir ? path.join(scheduleDir, schedulePdf) : "",
    participantIndexTexPath: participantProfilesDir ? path.join(participantProfilesDir, participantIndexTex) : "",
    participantIndexPdfPath: participantProfilesDir ? path.join(participantProfilesDir, participantIndexPdf) : "",
  };
}

function buildDefaultQuickPanelConfig() {
  return {
    title: "Panel rapido",
    description: "Datos estructurados para cerrar el reporte semanal.",
    emptyStatus: "Sin sesion activa",
    readyStatus: "Panel rapido listo para completar datos de cierre",
    saveSuccessText: "Panel rapido guardado",
    applyingText: "Aplicando datos del panel al reporte...",
    applySuccessText: "Panel aplicado al reporte",
    fields: [
      {
        key: "periodStart",
        label: "Inicio del periodo",
        type: "date",
        width: "half",
        defaultPreset: "currentWeekStart",
        autoRangeEndKey: "periodEnd",
        autoRangeEndDays: 6,
        meta: true,
      },
      {
        key: "periodEnd",
        label: "Fin del periodo",
        type: "date",
        width: "half",
        defaultPreset: "currentWeekEnd",
        meta: true,
      },
      {
        key: "hoursRemote",
        label: "Horas remotas",
        type: "number",
        width: "half",
        min: 0,
        step: 0.5,
        placeholder: "0",
      },
      {
        key: "hoursOnsite",
        label: "Horas presenciales",
        type: "number",
        width: "half",
        min: 0,
        step: 0.5,
        placeholder: "0",
      },
      {
        key: "modality",
        label: "Modalidad",
        type: "text",
        width: "full",
        placeholder: "Presencial, remota o mixta",
      },
      {
        key: "progressPercent",
        label: "Porcentaje de avance",
        type: "number",
        width: "full",
        min: 0,
        max: 100,
        step: 1,
        placeholder: "0-100",
        meta: true,
      },
      {
        key: "risks",
        label: "Riesgos",
        type: "textarea",
        width: "full",
        rows: 2,
        placeholder: "Riesgos detectados",
      },
      {
        key: "blockers",
        label: "Bloqueos",
        type: "textarea",
        width: "full",
        rows: 2,
        placeholder: "Bloqueos o dependencias",
      },
      {
        key: "resourcesNeeded",
        label: "Necesidades",
        type: "textarea",
        width: "full",
        rows: 2,
        placeholder: "Piezas, accesos o aprobaciones",
      },
      {
        key: "nextSteps",
        label: "Proximos pasos",
        type: "textarea",
        width: "full",
        rows: 2,
        placeholder: "Siguiente paso o cierre esperado",
      },
      {
        key: "references",
        label: "Referencias",
        type: "textarea",
        width: "full",
        rows: 3,
        placeholder: "Manual, ficha tecnica, bitacora o URL",
      },
    ],
    actions: [
      {
        type: "weekRange",
        label: "Esta semana",
        dayOffset: 0,
        startKey: "periodStart",
        endKey: "periodEnd",
      },
      {
        type: "weekRange",
        label: "Semana anterior",
        dayOffset: -7,
        startKey: "periodStart",
        endKey: "periodEnd",
      },
    ],
  };
}

function normalizeQuickPanelField(rawField = {}, index = 0) {
  const key = String(rawField.key || `campo_${index + 1}`).trim();
  const supportedType = new Set(["text", "textarea", "number", "date", "select"]);
  const type = supportedType.has(String(rawField.type || "text").trim())
    ? String(rawField.type || "text").trim()
    : "text";

  return {
    key,
    label: String(rawField.label || key).trim(),
    type,
    width: rawField.width === "half" ? "half" : "full",
    placeholder: String(rawField.placeholder || "").trim(),
    rows: Number.isFinite(Number(rawField.rows)) ? Math.max(2, Number(rawField.rows)) : 3,
    min: rawField.min ?? null,
    max: rawField.max ?? null,
    step: rawField.step ?? null,
    options: type === "select" && Array.isArray(rawField.options)
      ? rawField.options
          .map((option) => {
            if (option && typeof option === "object") {
              return {
                value: String(option.value ?? option.label ?? "").trim(),
                label: String(option.label ?? option.value ?? "").trim(),
              };
            }
            const value = String(option || "").trim();
            return { value, label: value };
          })
          .filter((option) => option.value)
      : [],
    defaultValue: String(rawField.defaultValue || "").trim(),
    defaultPreset: String(rawField.defaultPreset || "").trim(),
    autoRangeEndKey: String(rawField.autoRangeEndKey || "").trim(),
    autoRangeEndDays: Number.isFinite(Number(rawField.autoRangeEndDays)) ? Number(rawField.autoRangeEndDays) : 0,
    meta: rawField.meta === true,
  };
}

function normalizeQuickPanelAction(rawAction = {}) {
  return {
    type: String(rawAction.type || "").trim(),
    label: String(rawAction.label || "").trim(),
    dayOffset: Number.isFinite(Number(rawAction.dayOffset)) ? Number(rawAction.dayOffset) : 0,
    startKey: String(rawAction.startKey || "").trim(),
    endKey: String(rawAction.endKey || "").trim(),
  };
}

function normalizeQuickPanelConfig(rawQuickPanel) {
  const baseConfig = rawQuickPanel && typeof rawQuickPanel === "object"
    ? rawQuickPanel
    : buildDefaultQuickPanelConfig();
  const baseFields = Array.isArray(baseConfig.fields) && baseConfig.fields.length
    ? baseConfig.fields
    : buildDefaultQuickPanelConfig().fields;

  return {
    title: String(baseConfig.title || "Panel rapido").trim() || "Panel rapido",
    description: String(baseConfig.description || "").trim(),
    emptyStatus: String(baseConfig.emptyStatus || "Sin sesion activa").trim() || "Sin sesion activa",
    readyStatus: String(baseConfig.readyStatus || "Panel rapido listo").trim() || "Panel rapido listo",
    saveSuccessText: String(baseConfig.saveSuccessText || "Panel guardado").trim() || "Panel guardado",
    applyingText: String(baseConfig.applyingText || "Aplicando datos del panel al reporte...").trim()
      || "Aplicando datos del panel al reporte...",
    applySuccessText: String(baseConfig.applySuccessText || "Panel aplicado al reporte").trim()
      || "Panel aplicado al reporte",
    fields: baseFields.map((field, index) => normalizeQuickPanelField(field, index)).filter((field) => field.key),
    actions: Array.isArray(baseConfig.actions)
      ? baseConfig.actions.map(normalizeQuickPanelAction).filter((action) => action.type && action.label)
      : [],
  };
}

function resolveQuickFieldDefault(field) {
  if (!field) {
    return "";
  }

  if (field.defaultPreset === "currentWeekStart") {
    return formatDateForInput(getCurrentWeekRange().monday);
  }

  if (field.defaultPreset === "currentWeekEnd") {
    return formatDateForInput(getCurrentWeekRange().sunday);
  }

  if (field.defaultValue) {
    return field.defaultValue;
  }

  return "";
}

function getQuickPanelFields(formatDefinition) {
  return Array.isArray(formatDefinition?.quickPanel?.fields) ? formatDefinition.quickPanel.fields : [];
}

function normalizeFormatDefinition(formatDir, rawConfig = {}) {
  const templateConfig = rawConfig.template || {};
  const workspaceConfig = rawConfig.workspace || {};
  const botConfig = rawConfig.bot || {};
  const context = buildParticipantContextDefinition(formatDir, rawConfig.context || {});
  const id = String(rawConfig.id || path.basename(formatDir)).trim();
  const label = String(rawConfig.label || id).trim();

  if (!id) {
    throw new Error(`Formato invalido en ${formatDir}: falta id.`);
  }

  return {
    id,
    label,
    description: String(rawConfig.description || "").trim(),
    isDefault: rawConfig.default === true,
    formatDir,
    workspace: {
      reportDir: workspaceConfig.reportDir || "reporte",
      imagesDir: workspaceConfig.imagesDir || "imagenes",
      filesDir: workspaceConfig.filesDir || "archivos",
      exportDir: workspaceConfig.exportDir || "export",
      reportTexName: workspaceConfig.reportTexName || "reporte.tex",
      reportPdfName: workspaceConfig.reportPdfName || "reporte.pdf",
    },
    template: {
      sourceTexPath: resolveConfigPath(formatDir, templateConfig.sourceTex || ""),
      sourcePdfPath: resolveConfigPath(formatDir, templateConfig.sourcePdf || ""),
      assetsToImages: Array.isArray(templateConfig.assetsToImages) ? [...templateConfig.assetsToImages] : [],
      texReplacements: Array.isArray(templateConfig.texReplacements)
        ? templateConfig.texReplacements
            .filter((entry) => entry && typeof entry.search === "string")
            .map((entry) => ({
              search: String(entry.search),
              replace: String(entry.replace || ""),
            }))
        : [],
    },
    bot: {
      instructionsPath: resolveConfigPath(formatDir, botConfig.instructionsFile || "bot.instructions.md"),
      openingQuestion: String(botConfig.openingQuestion || "Quien eres?").trim() || "Quien eres?",
      serviceName: String(botConfig.serviceName || "Contexto").trim() || "Contexto",
    },
    context,
    quickPanel: normalizeQuickPanelConfig(rawConfig.quickPanel),
  };
}

async function loadReportFormats() {
  reportFormats.clear();
  defaultReportFormatId = "";

  const entries = await fs.readdir(APP_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const formatDir = path.join(APP_ROOT, entry.name);
    const configPath = path.join(formatDir, FORMAT_CONFIG_FILE);
    if (!(await pathExists(configPath))) {
      continue;
    }

    const rawConfig = JSON.parse(await fs.readFile(configPath, "utf8"));
    const formatDefinition = normalizeFormatDefinition(formatDir, rawConfig);

    if (!formatDefinition.template.sourceTexPath || !formatDefinition.template.sourcePdfPath) {
      throw new Error(`Formato ${formatDefinition.id} invalido: faltan archivos de plantilla.`);
    }

    reportFormats.set(formatDefinition.id, formatDefinition);
    if (formatDefinition.isDefault || !defaultReportFormatId) {
      defaultReportFormatId = formatDefinition.id;
    }
  }

  if (!reportFormats.size) {
    throw new Error("No se encontro ningun formato configurado.");
  }
}

function resolveCodexCommand() {
  const candidatePaths = [
    process.env.CODEX_PATH,
    path.join(
      os.homedir(),
      ".vscode",
      "extensions",
      "openai.chatgpt-26.325.31654-win32-x64",
      "bin",
      "windows-x86_64",
      "codex.exe"
    ),
    "codex",
  ].filter(Boolean);

  const foundPath = candidatePaths.find((candidate) => candidate === "codex" || fsSync.existsSync(candidate));
  return foundPath || "codex";
}

function resolveGraphvizDotCommand() {
  const candidatePaths = [
    process.env.GRAPHVIZ_DOT,
    path.join("C:\\Program Files\\Graphviz\\bin", "dot.exe"),
    path.join("C:\\Program Files (x86)\\Graphviz\\bin", "dot.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Graphviz", "bin", "dot.exe"),
  ].filter(Boolean);

  const foundPath = candidatePaths.find((candidate) => fsSync.existsSync(candidate));
  return foundPath || "";
}

async function spawnCodexProcess(workspacePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(CODEX_COMMAND, ["app-server"], {
      cwd: workspacePath,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let settled = false;
    const finishResolve = () => {
      if (settled) {
        return;
      }
      settled = true;
      child.off("error", onError);
      resolve(child);
    };

    const onError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(`No se pudo iniciar Contexto: ${error.message}`));
    };

    child.once("error", onError);
    child.once("spawn", finishResolve);
  });
}

function aliasesForName(fullName) {
  const tokens = String(fullName || "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (!tokens.length) {
    return [];
  }

  const aliases = new Set();
  aliases.add(tokens[0]);
  if (tokens.length > 1) {
    aliases.add(`${tokens[0]} ${tokens[1]}`);
  }
  aliases.add(tokens.join(" "));

  return Array.from(aliases);
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentWeekRange(referenceDate = new Date()) {
  const date = new Date(referenceDate);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}

function buildDefaultQuickFields(formatDefinition) {
  const fields = getQuickPanelFields(formatDefinition);
  return Object.fromEntries(fields.map((field) => [field.key, resolveQuickFieldDefault(field)]));
}

function sanitizeQuickFields(fields = {}, formatDefinition) {
  const currentDefaults = buildDefaultQuickFields(formatDefinition);
  return Object.fromEntries(
    Object.keys(currentDefaults).map((key) => [key, String(fields[key] ?? currentDefaults[key] ?? "").trim()])
  );
}

function parseMarkdownSections(markdown) {
  const sections = new Map();
  let currentTitle = "intro";
  let buffer = [];

  const flush = () => {
    sections.set(currentTitle, buffer.join("\n").trim());
    buffer = [];
  };

  for (const line of String(markdown || "").split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      flush();
      currentTitle = heading[1].trim().toLowerCase();
      continue;
    }
    buffer.push(line);
  }

  flush();
  return sections;
}

function extractBulletItems(markdownSection, limit = 5) {
  return String(markdownSection || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function extractFirstParagraph(markdownSection) {
  const normalized = String(markdownSection || "")
    .split(/\r?\n\s*\r?\n/)
    .map((part) => part.replace(/\r?\n/g, " ").trim())
    .find(Boolean);
  return normalized || "";
}

function cleanupTexInline(text) {
  return String(text || "")
    .replace(/\\textbf\{([^}]*)\}/g, "$1")
    .replace(/\\cncmeta\{[^}]*\}\{([^}]*)\}/g, "$1")
    .replace(/\\item/g, "")
    .replace(/\\[a-zA-Z*]+\{([^}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z*]+/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferAreaFromText(text) {
  const normalized = normalizeSearchText(text);
  if (normalized.includes("electronica") || normalized.includes("pcb tech")) {
    return "Electronica";
  }
  if (normalized.includes("mecanica")) {
    return "Mecanica";
  }
  if (normalized.includes("programacion") || normalized.includes("software")) {
    return "Programacion";
  }
  if (normalized.includes("administrativa") || normalized.includes("auditoria") || normalized.includes("auditora")) {
    return "Administrativa / Auditoria";
  }
  return "";
}

async function getParticipantRegistry(formatDefinition) {
  if (!formatDefinition?.context?.participantProfilesDir) {
    return [];
  }

  if (!participantRegistryCache.has(formatDefinition.id)) {
    participantRegistryCache.set(formatDefinition.id, await buildParticipantRegistry(formatDefinition));
  }

  return participantRegistryCache.get(formatDefinition.id) || [];
}

function scoreParticipantAliasMatch(input, alias) {
  const normalizedInput = normalizeSearchText(input);
  const normalizedAlias = normalizeSearchText(alias);
  if (!normalizedInput || !normalizedAlias) {
    return 0;
  }
  if (normalizedInput === normalizedAlias) {
    return 100 + normalizedAlias.length;
  }
  if ((` ${normalizedInput} `).includes(` ${normalizedAlias} `)) {
    return 80 + normalizedAlias.length;
  }
  if (normalizedAlias.split(" ").length > 1 && normalizedAlias.includes(normalizedInput) && normalizedInput.length >= 4) {
    return 60 + normalizedInput.length;
  }
  return 0;
}

async function findParticipantMatch(input, formatDefinition) {
  const registry = await getParticipantRegistry(formatDefinition);
  let bestMatch = null;

  for (const participant of registry) {
    for (const alias of participant.aliases || []) {
      const score = scoreParticipantAliasMatch(input, alias);
      if (!score) {
        continue;
      }
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { participant, score };
      }
    }
  }

  return bestMatch?.participant || null;
}

function extractTaskSummary(taskTex) {
  const objectiveMatch = String(taskTex || "").match(/\\section\*\{Objetivo principal de la semana\}([\s\S]*?)\\section\*/i);
  const taskMatch = String(taskTex || "").match(/\\cncmeta\{Tarea\}\{([^}]*)\}/i);
  return {
    currentFocus: cleanupTexInline(objectiveMatch?.[1] || ""),
    taskSummary: cleanupTexInline(taskMatch?.[1] || ""),
  };
}

async function buildParticipantProfile(participant) {
  const contextMarkdown = participant.contextMd ? await fs.readFile(participant.contextMd, "utf8").catch(() => "") : "";
  const taskTexContent = participant.taskTex ? await fs.readFile(participant.taskTex, "utf8").catch(() => "") : "";
  const sections = parseMarkdownSections(contextMarkdown);
  const roleSummary = extractFirstParagraph(sections.get("rol dentro del ecosistema") || sections.get("naturaleza de su trabajo"));
  const skillHighlights = extractBulletItems(sections.get("nivel tecnico asumido"), 5);
  const workStyle = extractFirstParagraph(sections.get("como asignarle tareas a nicole") || sections.get("como debe auditar nadia") || sections.get("regla para ia o coordinacion"));
  const availabilityNotes = extractFirstParagraph(sections.get("disponibilidad horaria registrada"));
  const taskData = extractTaskSummary(taskTexContent);
  const area = inferAreaFromText(`${roleSummary}\n${contextMarkdown}`) || participant.area || "";

  return {
    name: participant.name,
    aliases: participant.aliases,
    schedule: participant.schedule,
    area,
    roleSummary,
    skillHighlights,
    workStyle,
    availabilityNotes,
    currentFocus: taskData.currentFocus,
    taskSummary: taskData.taskSummary,
    contextTex: participant.contextTex,
    taskTex: participant.taskTex,
  };
}

async function maybeResolveParticipantProfile(session, inputText) {
  if (session.participantProfile) {
    return session.participantProfile;
  }

  if (!session.formatDefinition?.context?.participantProfilesDir) {
    return null;
  }

  const participant = await findParticipantMatch(inputText, session.formatDefinition);
  if (!participant) {
    return null;
  }

  const profile = await buildParticipantProfile(participant);
  session.setParticipantProfile(profile);
  return profile;
}

function slugFromName(fullName) {
  return String(fullName || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseScheduleParticipants(markdown) {
  const participants = [];
  const lines = String(markdown || "").split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^- ([^:]+):\s*(.+)$/);
    if (!match) {
      continue;
    }
    participants.push({
      name: match[1].trim(),
      schedule: match[2].trim(),
    });
  }

  return participants;
}

async function buildParticipantRegistry(formatDefinition) {
  const participantContext = formatDefinition?.context;
  const participantProfilesDir = participantContext?.participantProfilesDir;
  if (!participantProfilesDir) {
    return [];
  }

  const scheduleMdPath = participantContext.scheduleRegistryMdPath;
  const scheduleMarkdown = await fs.readFile(scheduleMdPath, "utf8");
  const participants = parseScheduleParticipants(scheduleMarkdown);
  const directoryEntries = await fs.readdir(participantProfilesDir);

  return participants.map((participant) => {
    const slug = slugFromName(participant.name);
    const nameTokens = slug.split("_").filter(Boolean);
    const profilePrefix = nameTokens[0] || slug;

    const matchedFiles = directoryEntries.filter((fileName) => {
      const lower = fileName.toLowerCase();
      return (
        lower.includes(profilePrefix) ||
        lower.includes(slug) ||
        aliasesForName(participant.name).some((alias) =>
          lower.includes(
            alias
              .normalize("NFKD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
          )
        )
      );
    });

    const contextTex = matchedFiles.find((fileName) => fileName.endsWith(".tex") && fileName.startsWith("contexto_"));
    const contextPdf = matchedFiles.find((fileName) => fileName.endsWith(".pdf") && fileName.startsWith("contexto_"));
    const contextMd = matchedFiles.find((fileName) => fileName.endsWith(".md") && fileName.startsWith("contexto_"));
    const taskTex = matchedFiles.find((fileName) => fileName.endsWith(".tex") && fileName.startsWith("tarea_"));
    const taskPdf = matchedFiles.find((fileName) => fileName.endsWith(".pdf") && fileName.startsWith("tarea_"));
    const taskMd = matchedFiles.find((fileName) => fileName.endsWith(".md") && fileName.startsWith("tarea_"));

    return {
      ...participant,
      aliases: aliasesForName(participant.name),
      slug,
      area: inferAreaFromText([contextMd, contextTex, taskTex].filter(Boolean).join(" ")),
      contextMd: contextMd ? path.join(participantProfilesDir, contextMd) : null,
      contextTex: contextTex ? path.join(participantProfilesDir, contextTex) : null,
      contextPdf: contextPdf ? path.join(participantProfilesDir, contextPdf) : null,
      taskMd: taskMd ? path.join(participantProfilesDir, taskMd) : null,
      taskTex: taskTex ? path.join(participantProfilesDir, taskTex) : null,
      taskPdf: taskPdf ? path.join(participantProfilesDir, taskPdf) : null,
    };
  });
}

function escapeLatex(value) {
  return String(value || "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([#$%&{}_])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

async function ensureParticipantIndex(formatDefinition) {
  const participantContext = formatDefinition?.context;
  if (!participantContext?.participantProfilesDir) {
    return { participants: [] };
  }

  const participants = await buildParticipantRegistry(formatDefinition);
  participantRegistryCache.set(formatDefinition.id, participants);

  const body = participants
    .map((participant) => {
      const aliases = participant.aliases.length
        ? participant.aliases.map(escapeLatex).join(", ")
        : "Sin alias registrado";

      const contextTex = participant.contextTex ? escapeLatex(participant.contextTex) : "Pendiente";
      const contextPdf = participant.contextPdf ? escapeLatex(participant.contextPdf) : "Pendiente";
      const taskTex = participant.taskTex ? escapeLatex(participant.taskTex) : "Pendiente";
      const taskPdf = participant.taskPdf ? escapeLatex(participant.taskPdf) : "Pendiente";

      return [
        `\\subsection*{${escapeLatex(participant.name)}}`,
        `\\textbf{Apodos / formas de referencia}: ${aliases}\\\\`,
        `\\textbf{Horario registrado}: ${escapeLatex(participant.schedule)}\\\\`,
        `\\textbf{Contexto TEX asociado}: \\texttt{${contextTex}}\\\\`,
        `\\textbf{Contexto PDF asociado}: \\texttt{${contextPdf}}\\\\`,
        `\\textbf{Tarea TEX asociada}: \\texttt{${taskTex}}\\\\`,
        `\\textbf{Tarea PDF asociada}: \\texttt{${taskPdf}}`,
        "\\vspace{2mm}",
      ].join("\n");
    })
    .join("\n\n");

  const texContent = `
\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[spanish]{babel}
\\usepackage{geometry}
\\usepackage{hyperref}
\\usepackage{xcolor}
\\geometry{margin=2cm}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{6pt}

\\begin{document}

\\begin{center}
{\\LARGE\\textbf{Indice de Participantes CNC Tech Formativo}}\\\\
\\vspace{2mm}
{\\large Archivo de identificacion para lectura automatica del bot}
\\end{center}

Este archivo debe leerse al inicio para identificar participantes, reconocer sus apodos o formas de referencia y decidir que PDF o TEX leer despues segun la persona mencionada por el usuario.

\\section*{Fuentes base}
\\textbf{Horarios PDF}: \\texttt{${escapeLatex(participantContext.schedulePdfPath || "Pendiente")}}\\\\
\\textbf{Registro de horarios MD}: \\texttt{${escapeLatex(participantContext.scheduleRegistryMdPath || "Pendiente")}}

\\section*{Participantes}
${body}

\\end{document}
`.trim();

  await fs.writeFile(participantContext.participantIndexTexPath, texContent, "utf8");

  await new Promise((resolve, reject) => {
    const child = spawn(
      "latexmk",
      ["-pdf", "-interaction=nonstopmode", "-halt-on-error", path.basename(participantContext.participantIndexTexPath)],
      {
        cwd: participantContext.participantProfilesDir,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || "No se pudo compilar el indice de participantes."));
    });
  });

  return { participants };
}

async function seedWorkspaceReportProject(workspacePath, formatDefinition) {
  const workspaceConfig = formatDefinition.workspace;
  const reportDir = path.join(workspacePath, workspaceConfig.reportDir);
  const imagesDir = path.join(workspacePath, workspaceConfig.imagesDir);
  const filesDir = path.join(workspacePath, workspaceConfig.filesDir);
  const exportDir = path.join(workspacePath, workspaceConfig.exportDir);

  await fs.mkdir(reportDir, { recursive: true });
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(filesDir, { recursive: true });
  await fs.mkdir(exportDir, { recursive: true });

  const targetTexPath = path.join(reportDir, workspaceConfig.reportTexName);
  const targetPdfPath = path.join(reportDir, workspaceConfig.reportPdfName);

  let texContent = await fs.readFile(formatDefinition.template.sourceTexPath, "utf8");
  for (const replacement of formatDefinition.template.texReplacements) {
    texContent = texContent.replaceAll(replacement.search, replacement.replace);
  }

  await fs.writeFile(targetTexPath, texContent, "utf8");
  await fs.copyFile(formatDefinition.template.sourcePdfPath, targetPdfPath);

  for (const assetName of formatDefinition.template.assetsToImages) {
    const sourcePath = path.join(formatDefinition.formatDir, assetName);
    if (await pathExists(sourcePath)) {
      await fs.copyFile(sourcePath, path.join(imagesDir, assetName));
    }
  }

  return {
    reportProjectPath: reportDir,
    reportTexPath: targetTexPath,
    reportPdfPath: targetPdfPath,
    imagesDir,
    filesDir,
    exportDir,
  };
}

function renderInstructionTemplate(template, replacements) {
  let output = String(template || "");
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(`{{${key}}}`, String(value || ""));
  }
  return output;
}

function buildGraphvizInstructions(sessionWorkspacePath, reportProjectPath, formatDefinition) {
  const reportTexPath = path.join(reportProjectPath, formatDefinition.workspace.reportTexName);
  const filesDir = path.join(sessionWorkspacePath, formatDefinition.workspace.filesDir);
  const imagesDir = path.join(sessionWorkspacePath, formatDefinition.workspace.imagesDir);

  return (GRAPHVIZ_DOT_COMMAND
    ? [
        `Graphviz disponible en esta PC: ${GRAPHVIZ_DOT_COMMAND}`,
        `Si generas un diagrama, guarda primero el archivo fuente .dot en ${filesDir}.`,
        `Renderiza luego el diagrama como .png o .svg dentro de ${imagesDir} y referencialo en ${reportTexPath} cuando aporte claridad.`,
      ]
    : [
        "Si el caso necesita diagrama, primero intenta localizar dot.exe de Graphviz en esta PC y usalo si esta disponible.",
      ]).join("\n");
}

function buildParticipantContextBlock(formatDefinition) {
  const participantContext = formatDefinition.context;
  if (!participantContext?.participantProfilesDir) {
    return "Este formato no requiere indice de participantes ni contexto personal previo.";
  }

  const nextIndex = (participantContext.formatFiles || []).length + 1;
  return [
    `${nextIndex}. ${participantContext.participantIndexTexPath}`,
    "Luego, cuando el usuario diga quien es o se identifique, debes buscar a esa persona en el indice y leer su TEX asociado y su PDF asociado si existen.",
    `La primera respuesta del usuario a '${formatDefinition.bot.openingQuestion}' solo debe usarse para identificarlo en el contexto; desde ahi debes recuperar nombre, area, trabajo actual, disponibilidad y habilidades desde los archivos de contexto ya registrados.`,
    "No debes volver a preguntar el area si ya puede inferirse de ese contexto; solo pide confirmacion de nombre y area manualmente si la identificacion falla.",
    `Tambien puedes consultar material en: ${participantContext.participantProfilesDir}`,
    participantContext.schedulePdfPath ? `Y el PDF de horarios en: ${participantContext.schedulePdfPath}` : "",
  ].filter(Boolean).join("\n");
}

async function buildReportBotInstructions(sessionWorkspacePath, projectLayout, formatDefinition) {
  const instructionTemplate = await fs.readFile(formatDefinition.bot.instructionsPath, "utf8");
  const participantContext = formatDefinition.context;
  const formatContextFiles = (participantContext.formatFiles || []).length
    ? participantContext.formatFiles.map((filePath, index) => `${index + 1}. ${filePath}`).join("\n")
    : "1. Sin archivos de contexto registrados para este formato.";

  return renderInstructionTemplate(instructionTemplate, {
    FORMAT_LABEL: formatDefinition.label,
    OPENING_QUESTION: formatDefinition.bot.openingQuestion,
    FORMAT_CONTEXT_FILES: formatContextFiles,
    PARTICIPANT_CONTEXT_BLOCK: buildParticipantContextBlock(formatDefinition),
    GRAPHVIZ_INSTRUCTIONS: buildGraphvizInstructions(sessionWorkspacePath, projectLayout.reportProjectPath, formatDefinition),
    WORKSPACE_PATH: sessionWorkspacePath,
    REPORT_PROJECT_PATH: projectLayout.reportProjectPath,
    REPORT_TEX_PATH: projectLayout.reportTexPath,
    REPORT_PDF_PATH: projectLayout.reportPdfPath,
    IMAGES_DIR: projectLayout.imagesDir,
    FILES_DIR: projectLayout.filesDir,
  });
}

function buildParticipantProfileSummary(profile) {
  if (!profile) {
    return "";
  }

  const lines = [
    `Participante identificado: ${profile.name}`,
    profile.area ? `Area inferida desde contexto: ${profile.area}` : "",
    profile.schedule ? `Disponibilidad registrada: ${profile.schedule}` : "",
    profile.roleSummary ? `Rol actual: ${profile.roleSummary}` : "",
    profile.currentFocus ? `Foco actual conocido: ${profile.currentFocus}` : "",
    profile.taskSummary ? `Tarea o eje recomendado: ${profile.taskSummary}` : "",
    ...(profile.skillHighlights || []).map((item) => `- ${item}`),
  ].filter(Boolean);

  return lines.join("\n");
}

function buildQuickFieldsSummary(session) {
  const quickFields = sanitizeQuickFields(session.quickFields, session.formatDefinition);
  const labels = Object.fromEntries(
    getQuickPanelFields(session.formatDefinition).map((field) => [field.key, field.label])
  );

  return Object.entries(quickFields)
    .filter(([, value]) => String(value || "").trim())
    .map(([key, value]) => `- ${labels[key] || key}: ${value}`)
    .join("\n");
}

function buildQuickFieldsApplyMessage(session) {
  const summary = buildQuickFieldsSummary(session);
  const participantSummary = buildParticipantProfileSummary(session.participantProfile);
  const quickPanelTitle = session.formatDefinition?.quickPanel?.title || "panel rapido";

  return [
    `Actualiza el reporte usando los datos estructurados enviados desde el ${quickPanelTitle.toLowerCase()} de la interfaz.`,
    `Trabaja sobre este archivo TEX: ${session.reportTexPath}`,
    participantSummary ? `Datos confirmados del participante:\n${participantSummary}` : "",
    summary ? `Datos del panel:\n${summary}` : "No se recibieron datos utiles desde el panel.",
    "Usa estos datos solo para actualizar campos y secciones realmente correspondientes dentro del TEX.",
    "No conviertas esto en una nueva entrevista; solo ajusta el contenido del reporte con cambios conservadores y coherentes.",
    "Si algun campo esta vacio, no lo inventes.",
    "Si llegan referencias, objetivos, observaciones u otros datos listos para usar, integralos sin volver a preguntarlos.",
    "La respuesta visible debe ir dentro del bloque --respuesta de pagina-- ... --finalice-- y limitarse a confirmar brevemente que el panel fue aplicado.",
  ].filter(Boolean).join("\n");
}

function buildSecondaryActivitySuggestionMessage(session) {
  const participantSummary = buildParticipantProfileSummary(session.participantProfile);
  const quickFieldsSummary = buildQuickFieldsSummary(session);

  return [
    "Con base en la conversacion acumulada y en el estado actual del reporte, genera entre 3 y 5 opciones posibles de actividad secundaria.",
    participantSummary ? `Contexto del participante:\n${participantSummary}` : "",
    quickFieldsSummary ? `Datos rapidos actuales:\n${quickFieldsSummary}` : "",
    "Las opciones deben nacer del entendimiento de la actividad principal ya conversada, no ser genericas.",
    "La persona debe poder ignorar esas opciones y responder libremente despues.",
    "Devuelve la respuesta visible solo con este formato:",
    "--respuesta de pagina--",
    "Elige una actividad secundaria sugerida o escribe una propia.",
    "[[respuestas_rapidas]]",
    "Opcion 1",
    "Opcion 2",
    "[[/respuestas_rapidas]]",
    "--finalice--",
  ].filter(Boolean).join("\n");
}

function buildCompileRequestMessage(session) {
  const imageAssignmentsText = (session.imageAssignments || []).length
    ? [
        "Estas imagenes ya fueron asociadas en la sesion y debes tratarlas como evidencia valida:",
        ...session.imageAssignments.map((item) =>
          `- ${item.requestedName} corresponde al archivo real ${item.finalName} (subido originalmente como ${item.originalName})`
        ),
        "Si el TEX aun usa el nombre solicitado originalmente, adaptalo al nombre final guardado con su extension real.",
      ].join("\n")
    : "";

  return [
    "Compila ahora el PDF del reporte con la informacion actual del proyecto.",
    `Trabaja sobre este archivo TEX: ${session.reportTexPath}`,
    `El PDF final debe quedar actualizado en: ${session.reportPdfPath}`,
    "Usa latexmk o la herramienta adecuada para compilar el TEX existente.",
    "Antes de compilar, usa las respuestas de la conversacion acumuladas hasta este momento para dejar el TEX en su version mas actual.",
    "La version compilada del PDF debe reflejar las respuestas y ajustes conversados hasta la respuesta actual.",
    "Haz cambios conservadores: solo actualiza campos y secciones realmente sustentados por respuestas del usuario o por hechos objetivos ya verificados.",
    "Antes de compilar, revisa si el cuerpo del reporte ya quedo en una extension razonable; salvo que el usuario haya pedido otro tamano, apunta a unas 2 paginas de contenido despues de portada y hoja de datos/avance.",
    "Antes de compilar, elimina secciones, bullets, placeholders, figuras o referencias de ejemplo que no hayan sido realmente usadas.",
    "No dejes texto genericamente pendiente como 'agregar URL o documento', 'resultado de pruebas', 'paso 1' o placeholders de imagen sin justificacion real.",
    "Si aun faltan referencias tecnicas y el tema ya esta claro, buscarlas en internet forma parte del cierre antes de compilar.",
    "Si faltan evidencias importantes, intenta pedirlas o dejar solo las secciones que realmente quedaron sustentadas; no mantengas bloques vacios por cumplir formato.",
    "No pegues en el reporte texto explicativo tomado del contexto personal del participante.",
    "Si la ultima respuesta solo confirma identidad o un dato puntual, conserva el resto del reporte sin reescrituras amplias.",
    imageAssignmentsText,
    "La respuesta visible de esta accion tambien debe venir dentro del bloque --respuesta de pagina-- ... --finalice--.",
    "En ese bloque explica el resultado de forma normal y breve, sin rutas locales ni detalles internos de la PC.",
    "No redisenes el reporte ni abras una nueva conversacion; solo deja el PDF sincronizado con el contenido actual.",
    "Si falta algun recurso, explica brevemente el bloqueo.",
  ].join("\n");
}

async function requestReportCompilation(session) {
  return session.sendUserMessage(buildCompileRequestMessage(session));
}

function buildSyncImagesRequestMessage(session) {
  const imageAssignmentsText = (session.imageAssignments || []).length
    ? session.imageAssignments.map((item) =>
        `- ${item.requestedName} corresponde al archivo real ${item.finalName} (subido originalmente como ${item.originalName})`
      ).join("\n")
    : "No hay imagenes asociadas registradas en esta sesion.";

  return [
    "Revisa ahora las referencias de imagen del reporte y actualiza el TEX segun la extension real de los archivos subidos.",
    `Trabaja solo sobre este archivo TEX: ${session.reportTexPath}`,
    `La carpeta de imagenes del reporte es: ${session.imagesDir}`,
    "No recompiles el PDF en esta accion; solo corrige referencias de imagen en el TEX cuando haga falta.",
    "Si el TEX aun usa nombres como .jpg pero el archivo real subido termino siendo .png, .webp u otra extension valida, cambia la referencia en el TEX al archivo real.",
    "Si una imagen fue subida con cualquier nombre original, toma como valido el nombre final ya guardado por el sistema.",
    "Estas son las asociaciones actuales registradas:",
    imageAssignmentsText,
    "La respuesta visible de esta accion tambien debe venir dentro del bloque --respuesta de pagina-- ... --finalice--.",
    "Dentro de ese bloque responde de forma breve si ajustaste o no las referencias.",
  ].join("\n");
}

async function requestImageSync(session) {
  return session.sendUserMessage(buildSyncImagesRequestMessage(session));
}

function buildExperimentalActionMessage(session, actionId) {
  const participantSummary = buildParticipantProfileSummary(session.participantProfile);
  const quickFieldsSummary = buildQuickFieldsSummary(session);
  const shared = [
    `Trabaja sobre este archivo TEX: ${session.reportTexPath}`,
    `PDF asociado: ${session.reportPdfPath}`,
    `Carpeta de imagenes: ${session.imagesDir}`,
    `Carpeta de archivos: ${session.filesDir}`,
    participantSummary ? `Contexto confirmado del participante:\n${participantSummary}` : "",
    quickFieldsSummary ? `Datos rapidos actuales:\n${quickFieldsSummary}` : "",
    "No inventes datos tecnicos ni hechos no sustentados.",
    "La respuesta visible final debe venir dentro del bloque --respuesta de pagina-- ... --finalice--.",
    "En esa respuesta visible explica de forma breve que mejoraste o que limite encontraste.",
  ].filter(Boolean);

  const messages = {
    "graphviz-opportunities": [
      "Activa un modo experimental de mejora visual del reporte.",
      "Despues de entender el estado actual del reporte, busca donde conviene insertar graficos, diagramas o cuadros tecnicos que mejoren la comprension.",
      "Prioriza Graphviz para flujos, procesos, arquitectura, secuencias, relaciones entre componentes y decisiones.",
      "Si detectas una oportunidad clara y tienes contexto suficiente, genera el .dot en la carpeta archivos, renderiza PNG o SVG en imagenes, inserta la referencia en el TEX y ajusta el texto alrededor para que el grafico tenga sentido.",
      "Si aun falta contexto para un diagrama, no inventes. En ese caso deja una respuesta visible muy breve pidiendo solo el dato faltante mas importante.",
      ...shared,
    ],
    "improve-syntax": [
      "Activa un modo experimental de mejora linguistica agresiva pero fiel.",
      "Analiza el documento completo y mejora sintaxis, puntuacion, concordancia, claridad, fluidez y tono institucional.",
      "Haz mejoras que normalmente no aplicarias en modo conservador si ves que elevan claramente la calidad del reporte.",
      "No cambies hechos ni agregues contenido nuevo no sustentado.",
      ...shared,
    ],
    "technical-enrichment": [
      "Activa un modo experimental de enriquecimiento tecnico.",
      "Busca secciones donde el trabajo ya esta identificado pero se puede explicar mejor con mas precision tecnica, mejores pasos, criterios, resultados o referencias confiables.",
      "Amplia solo donde haya base real en la conversacion o en fuentes tecnicas verificables.",
      "Si agregas referencias, integrarlas al reporte con naturalidad.",
      ...shared,
    ],
    "strengthen-conclusions": [
      "Activa un modo experimental de refuerzo de conclusiones.",
      "Revisa la seccion de conclusiones y fortalece cierre, hallazgos, impacto, aprendizaje y siguiente paso con base estricta en el trabajo ya documentado.",
      "Haz que la conclusion quede mas solida, concreta y profesional sin inventar resultados ni promesas no sustentadas.",
      ...shared,
    ],
    "find-missing-references": [
      "Activa un modo experimental de busqueda de referencias faltantes.",
      "Detecta afirmaciones tecnicas, procesos, componentes o decisiones que merecen respaldo externo y agrega referencias confiables cuando puedas verificarlas.",
      "Prioriza manuales, fichas tecnicas, documentacion oficial, normas o fuentes tecnicas serias.",
      "Integra las referencias en el reporte solo si realmente fortalecen el contenido existente.",
      ...shared,
    ],
    "convert-lists-to-tables": [
      "Activa un modo experimental de conversion estructural.",
      "Busca listas, comparaciones, secuencias o resumentes que se entiendan mejor como cuadros o tablas tecnicas dentro del TEX.",
      "Convierte solo donde el cambio mejore legibilidad y orden; evita tablas decorativas o innecesarias.",
      "Ajusta el texto circundante para que la nueva estructura se lea natural.",
      ...shared,
    ],
    "detect-repetitions": [
      "Activa un modo experimental de depuracion por repeticiones.",
      "Analiza el documento para detectar ideas, frases, datos o explicaciones repetidas entre secciones cercanas o lejanas.",
      "Elimina o fusiona repeticiones sin perder informacion importante ni volver el texto seco.",
      ...shared,
    ],
    "review-chronology": [
      "Activa un modo experimental de revision cronologica.",
      "Revisa si el reporte mantiene una secuencia temporal coherente entre actividades, avances, resultados, bloqueos y proximos pasos.",
      "Si detectas saltos, contradicciones o desorden temporal, reordena o ajusta la redaccion para que la progresion del trabajo se entienda claramente.",
      ...shared,
    ],
    "normalize-consistency": [
      "Activa un modo experimental de normalizacion editorial.",
      "Revisa consistencia de tiempos verbales, terminologia, nombres de componentes, formato de subtitulos, estilo de listas y voz institucional.",
      "Unifica el documento para que parezca escrito de una sola vez y con una sola voz.",
      ...shared,
    ],
    "detect-gaps": [
      "Activa un modo experimental de auditoria del reporte.",
      "Analiza el documento y detecta huecos tecnicos, secciones debiles, evidencias faltantes, referencias insuficientes o afirmaciones poco justificadas.",
      "Si puedes resolver alguno de esos huecos sin inventar, resuelvelo directamente en el TEX.",
      "Si quedan huecos que requieren preguntar, formula una sola pregunta breve y precisa en la respuesta visible.",
      ...shared,
    ],
    "compress-report": [
      "Activa un modo experimental de compactacion editorial.",
      "Reduce redundancias, frases flojas, rodeos y repeticiones para que el documento quede mas directo y elegante sin perder contenido real.",
      "No lo vuelvas telegráfico; solo elimina peso innecesario.",
      ...shared,
    ],
  };

  return (messages[actionId] || [
    "Ejecuta una mejora experimental general del reporte sin inventar informacion.",
    ...shared,
  ]).join("\n");
}

async function requestExperimentalAction(session, actionId) {
  return session.sendUserMessage(buildExperimentalActionMessage(session, actionId), {
    visible: false,
    mode: `experimental-${actionId}`,
  });
}

async function compileReportPdf(session) {
  const reportDir = session.reportProjectPath || path.dirname(session.reportTexPath || session.workspacePath);
  const reportTexPath = session.reportTexPath || path.join(reportDir, "reporte.tex");
  const reportPdfPath = session.reportPdfPath || path.join(reportDir, "reporte.pdf");

  await new Promise((resolve, reject) => {
    const child = spawn(
      "latexmk",
      ["-pdf", "-interaction=nonstopmode", "-halt-on-error", path.basename(reportTexPath)],
      {
        cwd: reportDir,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 120000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error("La compilacion del PDF supero el tiempo limite."));
        return;
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || "No se pudo compilar el PDF del reporte."));
    });
  });

  if (!(await pathExists(reportPdfPath))) {
    throw new Error("La compilacion termino sin generar el PDF del reporte.");
  }

  return {
    reportPdfPath,
    compiledAt: new Date().toISOString(),
  };
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("La peticion es demasiado grande."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("JSON invalido."));
      }
    });
    request.on("error", reject);
  });
}

async function streamRequestToFile(request, targetPath, maxBytes = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    let total = 0;
    let settled = false;
    const declaredLength = Number(request.headers["content-length"] || 0);
    const fileStream = fsSync.createWriteStream(targetPath);

    const cleanupFile = async () => {
      fileStream.destroy();
      await fs.unlink(targetPath).catch(() => {});
    };

    const fail = async (error) => {
      if (settled) {
        return;
      }
      settled = true;
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      request.off("aborted", onAborted);
      fileStream.off("error", onFileError);
      await cleanupFile();
      reject(error);
    };

    if (declaredLength > maxBytes) {
      request.destroy();
      void fail(new Error("El archivo supera el limite de 2 GB."));
      return;
    }

    const onData = (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        request.destroy();
        void fail(new Error("El archivo supera el limite de 2 GB."));
        return;
      }

      if (!fileStream.write(chunk)) {
        request.pause();
        fileStream.once("drain", () => request.resume());
      }
    };

    const onEnd = () => {
      if (settled) {
        return;
      }
      settled = true;
      fileStream.end(() => resolve(total));
    };

    const onError = (error) => {
      void fail(error);
    };

    const onAborted = () => {
      void fail(new Error("La subida fue cancelada antes de completarse."));
    };

    const onFileError = (error) => {
      void fail(error);
    };

    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
    request.on("aborted", onAborted);
    fileStream.on("error", onFileError);
  });
}

function safeName(input) {
  const cleaned = String(input || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return cleaned || "proyecto-contexto";
}

function safeUploadName(input) {
  const baseName = path.basename(String(input || "").trim());
  const cleaned = baseName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new Error("Nombre de archivo invalido.");
  }
  return cleaned;
}

async function ensureUniqueFileTarget(directoryPath, requestedName) {
  const safeRequestedName = safeUploadName(requestedName);
  const parsedName = path.parse(safeRequestedName);
  let candidateName = safeRequestedName;
  let attempt = 1;

  while (await pathExists(path.join(directoryPath, candidateName))) {
    attempt += 1;
    candidateName = `${parsedName.name}_${attempt}${parsedName.ext}`;
  }

  return {
    fileName: candidateName,
    targetPath: path.join(directoryPath, candidateName),
  };
}

function extensionFromMimeType(contentType) {
  const mime = String(contentType || "").toLowerCase().split(";")[0].trim();
  const mimeMap = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/bmp": ".bmp",
    "image/tiff": ".tif",
    "image/svg+xml": ".svg",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "image/avif": ".avif",
  };

  return mimeMap[mime] || "";
}

function contentTypeFromFileName(fileName) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  const mimeMap = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".svg": "image/svg+xml",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".avif": "image/avif",
    ".jfif": "image/jpeg",
  };

  return mimeMap[ext] || "application/octet-stream";
}

function isImageFileName(fileName) {
  return /\.(jpg|jpeg|png|webp|gif|bmp|tif|tiff|svg|heic|heif|avif|jfif)$/i.test(String(fileName || ""));
}

async function syncTexImageReference(session, requestedName, finalName) {
  if (!session?.reportTexPath || requestedName === finalName) {
    return false;
  }

  const requestedBase = path.basename(requestedName);
  const finalBase = path.basename(finalName);
  let texContent = await fs.readFile(session.reportTexPath, "utf8");

  if (!texContent.includes(requestedBase)) {
    return false;
  }

  texContent = texContent.replaceAll(requestedBase, finalBase);
  await fs.writeFile(session.reportTexPath, texContent, "utf8");
  return true;
}

async function revertTexImageReference(session, finalName, requestedName) {
  if (!session?.reportTexPath || requestedName === finalName) {
    return false;
  }

  const finalBase = path.basename(finalName);
  const requestedBase = path.basename(requestedName);
  let texContent = await fs.readFile(session.reportTexPath, "utf8");

  if (!texContent.includes(finalBase)) {
    return false;
  }

  texContent = texContent.replaceAll(finalBase, requestedBase);
  await fs.writeFile(session.reportTexPath, texContent, "utf8");
  return true;
}

async function createWorkspaceFolder(requestedName, formatDefinition) {
  const folderName = `${safeName(requestedName)}-${Date.now()}`;
  const workspacePath = path.join(WORKSPACES_ROOT, folderName);
  await fs.mkdir(workspacePath, { recursive: true });
  const projectLayout = await seedWorkspaceReportProject(workspacePath, formatDefinition);
  return { folderName, workspacePath, ...projectLayout };
}

function openWorkspaceInVsCode(workspacePath) {
  if (process.platform === "win32") {
    const child = spawn(
      "powershell",
      [
        "-NoProfile",
        "-WindowStyle",
        "Hidden",
        "-Command",
        `Start-Process -FilePath 'code' -ArgumentList @('-n', ${quotePowerShell(workspacePath)}) -WindowStyle Minimized`,
      ],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }
    );
    child.unref();
    return;
  }

  const child = spawn("code", ["-n", workspacePath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function sendSseEvent(response, event) {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function quotePowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function createWorkspaceZip(session) {
  await fs.mkdir(TEMP_ZIP_DIR, { recursive: true });

  const zipFileName = `${session.name}.zip`;
  const zipPath = path.join(TEMP_ZIP_DIR, `${session.id}-${Date.now()}.zip`);
  const command =
    "$ErrorActionPreference='Stop'; " +
    `Compress-Archive -LiteralPath ${quotePowerShell(session.workspacePath)} ` +
    `-DestinationPath ${quotePowerShell(zipPath)} -Force`;

  await new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || "No se pudo crear el archivo ZIP."));
    });
  });

  return { zipPath, zipFileName };
}

function applyCorsHeaders(request, response) {
  const origin = String(request.headers.origin || "").trim();
  if (!origin) {
    return;
  }

  const allowsAnyOrigin = CORS_ALLOWED_ORIGINS.includes("*");
  const allowsOrigin = allowsAnyOrigin || CORS_ALLOWED_ORIGINS.includes(origin);
  if (!allowsOrigin) {
    return;
  }

  response.setHeader("Access-Control-Allow-Origin", allowsAnyOrigin ? "*" : origin);
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,Cache-Control");
  response.setHeader("Access-Control-Expose-Headers", "Content-Type,Content-Length,Content-Disposition");
  response.setHeader("Vary", "Origin");
}

async function serveStaticFile(requestPath, response) {
  const relativePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.join(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    json(response, 403, { error: "Ruta no permitida." });
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentTypeMap = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".ico": "image/x-icon",
      ".pdf": "application/pdf",
      ".txt": "text/plain; charset=utf-8",
    };
    const contentType = contentTypeMap[ext] || "application/octet-stream";

    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });
    response.end(content);
  } catch {
    json(response, 404, { error: "Archivo no encontrado." });
  }
}

async function handleApi(request, response) {
  applyCorsHeaders(request, response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);
  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/api/health") {
    const defaultFormat = getDefaultFormatDefinition();
    json(response, 200, {
      ok: true,
      version: APP_VERSION,
      sessions: sessions.size,
      workspacesRoot: WORKSPACES_ROOT,
      formats: getAvailableFormatSummaries(),
      defaultFormatId: defaultFormat?.id || "",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/sessions") {
    const body = await readRequestBody(request);
    const formatDefinition = getFormatDefinition(body.formatId);
    if (!formatDefinition) {
      json(response, 400, { error: "Formato no encontrado." });
      return;
    }

    await ensureParticipantIndex(formatDefinition);
    const {
      folderName,
      workspacePath,
      reportProjectPath,
      reportTexPath,
      reportPdfPath,
      imagesDir,
      filesDir,
      exportDir,
    } = await createWorkspaceFolder(body.name, formatDefinition);
    if (body.openInVsCode) {
      openWorkspaceInVsCode(workspacePath);
    }

    const session = new CodexSession({
      id: randomUUID(),
      name: folderName,
      workspacePath,
      formatDefinition,
    });
    session.reportProjectPath = reportProjectPath;
    session.reportTexPath = reportTexPath;
    session.reportPdfPath = reportPdfPath;
    session.imagesDir = imagesDir;
    session.filesDir = filesDir;
    session.exportDir = exportDir;
    sessions.set(session.id, session);
    const developerInstructions = await buildReportBotInstructions(
      workspacePath,
      {
        reportProjectPath,
        reportTexPath,
        reportPdfPath,
        imagesDir,
        filesDir,
      },
      formatDefinition
    );
    const snapshot = await session.start({
      developerInstructions,
      openingQuestion: formatDefinition.bot.openingQuestion,
      serviceName: formatDefinition.bot.serviceName,
    });
    json(response, 201, snapshot);
    return;
  }

  if (segments[0] !== "api" || segments[1] !== "sessions" || !segments[2]) {
    json(response, 404, { error: "Endpoint no encontrado." });
    return;
  }

  const session = sessions.get(segments[2]);
  if (!session) {
    json(response, 404, { error: "Sesion no encontrada." });
    return;
  }

  if (request.method === "GET" && segments.length === 3) {
    json(response, 200, session.snapshot());
    return;
  }

  if (request.method === "GET" && segments[3] === "events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    request.socket?.setTimeout(0);
    response.socket?.setKeepAlive(true, SSE_HEARTBEAT_MS);
    response.write(`retry: 2000\n\n`);
    response.write(`: connected\n\n`);

    sendSseEvent(response, {
      type: "snapshot",
      payload: session.snapshot(),
      timestamp: new Date().toISOString(),
    });

    const listener = (event) => sendSseEvent(response, event);
    const heartbeat = setInterval(() => {
      response.write(`: heartbeat ${Date.now()}\n\n`);
    }, SSE_HEARTBEAT_MS);
    session.on("event", listener);

    request.on("close", () => {
      clearInterval(heartbeat);
      session.off("event", listener);
    });
    return;
  }

  if (request.method === "POST" && segments[3] === "messages") {
    const body = await readRequestBody(request);
    try {
      await maybeResolveParticipantProfile(session, body.message);
      const result = await session.sendUserMessage(body.message);
      json(response, 200, { ok: true, result });
    } catch (error) {
      json(response, 409, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && segments[3] === "quick-fields") {
    const body = await readRequestBody(request);
    const quickFields = session.mergeQuickFields(body || {});
    json(response, 200, { ok: true, quickFields, snapshot: session.snapshot(false) });
    return;
  }

  if (request.method === "POST" && segments[3] === "quick-fields-apply") {
    const body = await readRequestBody(request);
    if (body && typeof body === "object") {
      session.mergeQuickFields(body);
    }

    try {
      const result = await session.sendUserMessage(buildQuickFieldsApplyMessage(session), {
        visible: false,
        mode: "quick-fields-apply",
      });
      json(response, 200, { ok: true, result, quickFields: session.quickFields });
    } catch (error) {
      json(response, 409, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && segments[3] === "secondary-activity-suggestions") {
    try {
      const result = await session.sendUserMessage(buildSecondaryActivitySuggestionMessage(session), {
        visible: false,
        mode: "secondary-suggestions",
      });
      json(response, 200, { ok: true, result });
    } catch (error) {
      json(response, 409, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && segments[3] === "compile") {
    try {
      const result = await compileReportPdf(session);
      json(response, 200, { ok: true, result });
    } catch (error) {
      json(response, 409, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && segments[3] === "sync-images") {
    try {
      const result = await requestImageSync(session);
      json(response, 200, { ok: true, result });
    } catch (error) {
      json(response, 409, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && segments[3] === "experimental-action") {
    const body = await readRequestBody(request);
    const actionId = String(body?.actionId || "").trim();
    if (!actionId) {
      json(response, 400, { error: "Falta la accion experimental." });
      return;
    }

    try {
      const result = await requestExperimentalAction(session, actionId);
      json(response, 200, { ok: true, result });
    } catch (error) {
      json(response, 409, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && segments[3] === "upload") {
    const uploadTarget = await ensureUniqueFileTarget(
      session.filesDir || session.workspacePath,
      url.searchParams.get("name")
    );
    const fileName = uploadTarget.fileName;
    const targetPath = uploadTarget.targetPath;
    const uploadedSize = await streamRequestToFile(request, targetPath);
    const fileInfo = {
      name: fileName,
      path: targetPath,
      size: uploadedSize,
      uploadedAt: new Date().toISOString(),
      kind: "archivo",
    };
    session.registerUpload(fileInfo);
    json(response, 200, {
      ok: true,
      fileName,
      targetPath,
      size: uploadedSize,
      fileInfo,
    });
    return;
  }

  if (request.method === "POST" && segments[3] === "upload-image") {
    const requestedName = safeUploadName(url.searchParams.get("targetName"));
    const originalName = safeUploadName(url.searchParams.get("originalName") || requestedName);
    const originalExt = path.extname(originalName) || extensionFromMimeType(request.headers["content-type"]);
    const requestedParsed = path.parse(requestedName);
    const requestedExt = requestedParsed.ext;
    const finalName =
      originalExt && originalExt.toLowerCase() !== requestedExt.toLowerCase()
        ? `${requestedParsed.name}${originalExt}`
        : requestedExt
          ? requestedName
          : `${requestedName}${originalExt || ".jpg"}`;
    const uploadTarget = await ensureUniqueFileTarget(session.imagesDir || session.workspacePath, finalName);
    const resolvedFinalName = uploadTarget.fileName;
    const targetPath = uploadTarget.targetPath;
    const uploadedSize = await streamRequestToFile(request, targetPath);
    const texUpdated = await syncTexImageReference(session, requestedName, resolvedFinalName);
    const fileInfo = {
      name: resolvedFinalName,
      path: targetPath,
      size: uploadedSize,
      uploadedAt: new Date().toISOString(),
      kind: "imagen",
    };
    session.registerImageAssignment({
      requestedName,
      finalName: resolvedFinalName,
      originalName,
      texUpdated,
    });
    session.registerUpload(fileInfo);
    json(response, 200, {
      ok: true,
      fileName: resolvedFinalName,
      requestedName,
      targetPath,
      size: uploadedSize,
      fileInfo,
      texUpdated,
    });
    return;
  }

  if (request.method === "POST" && segments[3] === "associate-uploaded-image") {
    const requestedName = safeUploadName(url.searchParams.get("targetName"));
    const sourceName = safeUploadName(url.searchParams.get("sourceName"));

    if (!isImageFileName(sourceName)) {
      json(response, 400, { error: "Solo puedes asociar archivos de imagen." });
      return;
    }

    const imagesDir = session.imagesDir || session.workspacePath;
    const filesDir = session.filesDir || session.workspacePath;
    const candidatePaths = [
      path.join(imagesDir, sourceName),
      path.join(filesDir, sourceName),
    ];
    const sourcePath = candidatePaths.find((candidatePath) => fsSync.existsSync(candidatePath));
    if (!sourcePath) {
      json(response, 404, { error: "La imagen seleccionada ya no existe en la sesion." });
      return;
    }

    const sourceAssignment = session.imageAssignments.find((item) => item.finalName === sourceName);
    if (sourceAssignment && sourceAssignment.requestedName !== requestedName) {
      json(response, 409, { error: "Esa imagen ya estaba asociada a otra solicitud." });
      return;
    }

    const sourceExt = path.extname(sourceName);
    const requestedParsed = path.parse(requestedName);
    const requestedExt = requestedParsed.ext;
    const desiredName =
      sourceExt && sourceExt.toLowerCase() !== requestedExt.toLowerCase()
        ? `${requestedParsed.name}${sourceExt}`
        : requestedExt
          ? requestedName
          : `${requestedName}${sourceExt || ".jpg"}`;

    let resolvedFinalName = desiredName;
    let targetPath = path.join(imagesDir, resolvedFinalName);
    if (targetPath !== sourcePath) {
      const uploadTarget = await ensureUniqueFileTarget(imagesDir, desiredName);
      resolvedFinalName = uploadTarget.fileName;
      targetPath = uploadTarget.targetPath;
      await fs.rename(sourcePath, targetPath);
    }

    const fileStat = await fs.stat(targetPath);
    const texUpdated = await syncTexImageReference(session, requestedName, resolvedFinalName);
    const previousFileInfo = session.unregisterUpload(sourcePath) || {
      name: sourceName,
      path: sourcePath,
      size: fileStat.size,
      uploadedAt: new Date().toISOString(),
      kind: sourcePath.startsWith(imagesDir) ? "imagen" : "archivo",
    };
    const fileInfo = {
      name: resolvedFinalName,
      path: targetPath,
      size: fileStat.size,
      uploadedAt: new Date().toISOString(),
      kind: "imagen",
    };

    session.registerImageAssignment({
      requestedName,
      finalName: resolvedFinalName,
      originalName: sourceName,
      texUpdated,
    });
    session.registerUpload(fileInfo);

    json(response, 200, {
      ok: true,
      requestedName,
      fileName: resolvedFinalName,
      previousFileInfo,
      fileInfo,
      texUpdated,
    });
    return;
  }

  if (request.method === "DELETE" && segments[3] === "uploaded-file") {
    const fileName = safeUploadName(url.searchParams.get("name"));
    const fileKind = String(url.searchParams.get("kind") || "archivo").trim().toLowerCase();
    const baseDir = fileKind === "imagen"
      ? (session.imagesDir || session.workspacePath)
      : (session.filesDir || session.workspacePath);
    const targetPath = path.join(baseDir, fileName);
    const knownUpload = session.uploadedFiles.find((item) => item.path === targetPath);

    if (!knownUpload && !(await pathExists(targetPath))) {
      json(response, 404, { error: "Archivo no encontrado." });
      return;
    }

    if (await pathExists(targetPath)) {
      await fs.unlink(targetPath).catch((error) => {
        throw new Error(error.message || "No se pudo borrar el archivo.");
      });
    }

    const deletedFile = session.unregisterUpload(targetPath) || {
      name: fileName,
      path: targetPath,
      kind: fileKind,
    };

    let restoredRequest = null;
    if (fileKind === "imagen") {
      const assignment = session.unregisterImageAssignment(fileName);
      if (assignment) {
        await revertTexImageReference(session, assignment.finalName, assignment.requestedName).catch(() => {});
        restoredRequest = {
          fileName: assignment.requestedName,
        };
      }
    }

    json(response, 200, {
      ok: true,
      fileInfo: deletedFile,
      restoredRequest,
    });
    return;
  }

  if (request.method === "GET" && segments[3] === "image-preview") {
    const imageName = safeUploadName(url.searchParams.get("name"));
    const requestedKind = String(url.searchParams.get("kind") || "").trim().toLowerCase();
    const candidatePaths = [];

    if (requestedKind === "imagen") {
      candidatePaths.push(path.join(session.imagesDir || session.workspacePath, imageName));
    }

    if (requestedKind === "archivo") {
      candidatePaths.push(path.join(session.filesDir || session.workspacePath, imageName));
    }

    candidatePaths.push(
      path.join(session.imagesDir || session.workspacePath, imageName),
      path.join(session.filesDir || session.workspacePath, imageName)
    );

    const imagePath = candidatePaths.find((candidatePath, index) => (
      candidatePaths.indexOf(candidatePath) === index && fsSync.existsSync(candidatePath)
    ));

    if (!imagePath || !isImageFileName(imageName)) {
      json(response, 404, { error: "Imagen no encontrada." });
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypeFromFileName(imageName),
      "Cache-Control": "no-store",
    });
    fsSync.createReadStream(imagePath).pipe(response);
    return;
  }

  if (request.method === "GET" && segments[3] === "report-pdf") {
    if (!(await pathExists(session.reportPdfPath))) {
      try {
        await compileReportPdf(session);
      } catch (error) {
        json(response, 404, { error: `PDF del reporte no encontrado: ${error.message}` });
        return;
      }
    }

    response.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(path.basename(session.reportPdfPath))}"`,
      "Cache-Control": "no-store",
    });
    fsSync.createReadStream(session.reportPdfPath).pipe(response);
    return;
  }

  if (request.method === "GET" && segments[3] === "download") {
    try {
      await compileReportPdf(session);
    } catch (error) {
      json(response, 409, { error: `No se pudo compilar antes de descargar: ${error.message}` });
      return;
    }

    const { zipPath, zipFileName } = await createWorkspaceZip(session);
    const zipStat = await fs.stat(zipPath);

    response.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(zipFileName)}"`,
      "Content-Length": String(zipStat.size),
      "Cache-Control": "no-store",
    });

    const readStream = fsSync.createReadStream(zipPath);
    readStream.on("error", () => {
      if (!response.headersSent) {
        json(response, 500, { error: "No se pudo leer el ZIP generado." });
      } else {
        response.destroy();
      }
    });

    response.on("close", () => {
      fs.unlink(zipPath).catch(() => {});
    });

    readStream.pipe(response);
    return;
  }

  json(response, 404, { error: "Endpoint no encontrado." });
}

const server = http.createServer(async (request, response) => {
  try {
    if (!request.url) {
      json(response, 400, { error: "Solicitud invalida." });
      return;
    }

    if (request.url.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }

    if (request.url === "/brand/cnc-logo.png") {
      const defaultFormat = getDefaultFormatDefinition();
      const logoPath = defaultFormat
        ? path.join(defaultFormat.formatDir, "cnc_tech_logo_clean.png")
        : "";
      if (!logoPath || !(await pathExists(logoPath))) {
        json(response, 404, { error: "Logo no encontrado." });
        return;
      }
      const content = await fs.readFile(logoPath);
      response.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      });
      response.end(content);
      return;
    }

    await serveStaticFile(new URL(request.url, `http://${request.headers.host}`).pathname, response);
  } catch (error) {
    if (!response.headersSent) {
      json(response, 500, { error: error.message || "Error interno del servidor." });
      return;
    }
    response.end();
  }
});

async function bootstrap() {
  await fs.mkdir(WORKSPACES_ROOT, { recursive: true });
  await fs.mkdir(TEMP_ZIP_DIR, { recursive: true });
  await loadReportFormats();
  server.listen(PORT, HOST, () => {
    console.log(`Contexto listo en http://${HOST}:${PORT}`);
  });
}

process.on("SIGINT", () => {
  for (const session of sessions.values()) {
    session.close();
  }
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  for (const session of sessions.values()) {
    session.close();
  }
  server.close(() => process.exit(0));
});

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
