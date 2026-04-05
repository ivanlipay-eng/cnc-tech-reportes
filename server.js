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
const REPORT_TEMPLATE_DIR = path.join(APP_ROOT, "reporte_cnc_tech_formativo");
const PARTICIPANT_CONTEXT_DIR = "C:\\Users\\Ivan\\Desktop\\contexto\\10_perfiles_participantes";
const SCHEDULE_CONTEXT_DIR = "C:\\Users\\Ivan\\Desktop\\contexto\\horarios";
const PARTICIPANT_INDEX_TEX = path.join(PARTICIPANT_CONTEXT_DIR, "indice_participantes_cnc.tex");
const PARTICIPANT_INDEX_PDF = path.join(PARTICIPANT_CONTEXT_DIR, "indice_participantes_cnc.pdf");
const MAX_HISTORY_EVENTS = 500;
const SSE_HEARTBEAT_MS = 15000;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const CORS_ALLOWED_ORIGINS = String(process.env.CORS_ALLOWED_ORIGINS || "*")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const CODEX_COMMAND = resolveCodexCommand();

const sessions = new Map();

class CodexSession extends EventEmitter {
  constructor({ id, name, workspacePath }) {
    super();
    this.id = id;
    this.name = name;
    this.workspacePath = workspacePath;
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
  }

  async start(customDeveloperInstructions = "") {
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
      developerInstructions: customDeveloperInstructions ||
        "Estas siendo usado desde una interfaz web local. Responde de forma clara y util.",
      serviceName: "Contexto",
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
      openingQuestion: "Quien eres?",
      history: includeHistory ? this.history : undefined,
    };
  }

  async sendUserMessage(text) {
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

    this.busy = true;
    this.status = "running";
    this.currentAssistantItemId = null;
    this.currentAssistantText = "";

    const userMessage = {
      id: randomUUID(),
      role: "user",
      text: content,
      createdAt: new Date().toISOString(),
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
      });
      return;
    }

    if (method === "item/completed" && params.item?.type === "agentMessage") {
      this.currentAssistantItemId = params.item.id;
      this.currentAssistantText = params.item.text || this.currentAssistantText;
      this.#emitEvent("assistant-complete", {
        id: params.item.id,
        text: this.currentAssistantText,
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
      };
      this.currentTurnId = null;
      this.#emitEvent("status", { status: this.status, busy: this.busy });
      this.#emitEvent("turn-complete", payload);
      return;
    }

    if (method === "error") {
      this.busy = false;
      this.status = "error";
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

async function buildParticipantRegistry() {
  const scheduleMdPath = path.join(PARTICIPANT_CONTEXT_DIR, "registro_horarios_participantes.md");
  const scheduleMarkdown = await fs.readFile(scheduleMdPath, "utf8");
  const participants = parseScheduleParticipants(scheduleMarkdown);
  const directoryEntries = await fs.readdir(PARTICIPANT_CONTEXT_DIR);

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
    const taskTex = matchedFiles.find((fileName) => fileName.endsWith(".tex") && fileName.startsWith("tarea_"));
    const taskPdf = matchedFiles.find((fileName) => fileName.endsWith(".pdf") && fileName.startsWith("tarea_"));

    return {
      ...participant,
      aliases: aliasesForName(participant.name),
      slug,
      contextTex: contextTex ? path.join(PARTICIPANT_CONTEXT_DIR, contextTex) : null,
      contextPdf: contextPdf ? path.join(PARTICIPANT_CONTEXT_DIR, contextPdf) : null,
      taskTex: taskTex ? path.join(PARTICIPANT_CONTEXT_DIR, taskTex) : null,
      taskPdf: taskPdf ? path.join(PARTICIPANT_CONTEXT_DIR, taskPdf) : null,
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

async function ensureParticipantIndex() {
  const participants = await buildParticipantRegistry();

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
\\textbf{Horarios PDF}: \\texttt{${escapeLatex(path.join(SCHEDULE_CONTEXT_DIR, "horarios_participantes.pdf"))}}\\\\
\\textbf{Registro de horarios MD}: \\texttt{${escapeLatex(path.join(PARTICIPANT_CONTEXT_DIR, "registro_horarios_participantes.md"))}}

\\section*{Participantes}
${body}

\\end{document}
`.trim();

  await fs.writeFile(PARTICIPANT_INDEX_TEX, texContent, "utf8");

  await new Promise((resolve, reject) => {
    const child = spawn(
      "latexmk",
      ["-pdf", "-interaction=nonstopmode", "-halt-on-error", path.basename(PARTICIPANT_INDEX_TEX)],
      {
        cwd: PARTICIPANT_CONTEXT_DIR,
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

async function seedWorkspaceReportProject(workspacePath) {
  const reportDir = path.join(workspacePath, "reporte");
  const imagesDir = path.join(workspacePath, "imagenes");
  const filesDir = path.join(workspacePath, "archivos");
  const exportDir = path.join(workspacePath, "export");

  await fs.mkdir(reportDir, { recursive: true });
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(filesDir, { recursive: true });
  await fs.mkdir(exportDir, { recursive: true });

  const templateTexPath = path.join(REPORT_TEMPLATE_DIR, "reporte_cnc_tech_formativo.tex");
  const templatePdfPath = path.join(REPORT_TEMPLATE_DIR, "reporte_cnc_tech_formativo.pdf");
  const targetTexPath = path.join(reportDir, "reporte.tex");
  const targetPdfPath = path.join(reportDir, "reporte.pdf");

  let texContent = await fs.readFile(templateTexPath, "utf8");
  texContent = texContent
    .replace("\\newcommand{\\LogoCNC}{cnc_tech_logo_clean.png}", "\\newcommand{\\LogoCNC}{../archivos/cnc_tech_logo_clean.png}")
    .replace("\\newcommand{\\LogoFormativo}{cnc_tech_formativo_logo_white.png}", "\\newcommand{\\LogoFormativo}{../archivos/cnc_tech_formativo_logo_white.png}")
    .replaceAll("\\SmartFigure{evidencia_01.jpg}", "\\SmartFigure{../imagenes/evidencia_01.jpg}")
    .replaceAll("\\SmartFigure{evidencia_02.jpg}", "\\SmartFigure{../imagenes/evidencia_02.jpg}")
    .replaceAll("\\SmartFigure{paso_1.jpg}", "\\SmartFigure{../imagenes/paso_1.jpg}")
    .replaceAll("\\SmartFigure{paso_2.jpg}", "\\SmartFigure{../imagenes/paso_2.jpg}");

  await fs.writeFile(targetTexPath, texContent, "utf8");
  await fs.copyFile(templatePdfPath, targetPdfPath);

  for (const assetName of [
    "cnc_tech_logo_clean.png",
    "cnc_tech_formativo_logo_white.png",
    "cnc_tech_formativo_logo_clean.png",
    "cnc_tech_formativo_logo_clean2.png",
    "cnc_tech_formativo_logo.png",
    "cnc_tech_logo.png",
  ]) {
    const sourcePath = path.join(REPORT_TEMPLATE_DIR, assetName);
    if (await pathExists(sourcePath)) {
      await fs.copyFile(sourcePath, path.join(filesDir, assetName));
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

function buildReportBotInstructions(sessionWorkspacePath, reportProjectPath) {
  const lines = [
    "Esta sesion esta dedicada unicamente a crear, actualizar, revisar y cerrar reportes CNC Tech Formativo.",
    "El chat puede ser libre, pero siempre debes reconducirlo hacia la generacion del reporte semanal institucional usando la plantilla oficial.",
    "Debes leer primero estos archivos de contexto antes de responder en serio:",
    `1. ${path.join(REPORT_TEMPLATE_DIR, "contexto_formato_reporte", "contexto_reporte_cnc_tech.tex")}`,
    `2. ${path.join(REPORT_TEMPLATE_DIR, "reporte_cnc_tech_formativo.tex")}`,
    `3. ${PARTICIPANT_INDEX_TEX}`,
    "Luego, cuando el usuario diga quien es o se identifique, debes buscar a esa persona en el indice y leer su TEX asociado y su PDF asociado si existen.",
    `Tambien puedes consultar material en: ${PARTICIPANT_CONTEXT_DIR}`,
    `Y el PDF de horarios en: ${path.join(SCHEDULE_CONTEXT_DIR, "horarios_participantes.pdf")}`,
    "El estilo de conversacion debe ser ping pong, con preguntas cortas y utiles, no en rondas numeradas.",
    "La unica constante de arranque es identificar primero a la persona; una forma valida y simple de hacerlo es preguntar: 'Quien eres?'.",
    "Despues de identificarla, ve directo al avance principal de la semana y adapta las preguntas a lo que esa persona realmente hizo.",
    "No repitas siempre la misma secuencia ni el mismo orden de preguntas.",
    "Si la persona responde poco, propone un resumen tentativo abierto a correcciones para ayudar a reconstruir el avance real.",
    "Si la persona se dispersa o responde demasiado, resume lo entendido y valida antes de seguir.",
    "Haz pequenos bloques de preguntas relacionadas y reacciona a lo dicho; no conviertas el chat en un formulario fijo.",
    "No debes abrir conversaciones genericas; debes trabajar como copiloto de reportes CNC Tech Formativo.",
    "Cuando falte contexto, pregunta una sola cosa a la vez o un bloque corto muy relacionado, segun lo que ayude mas a esa persona.",
    "Debes trabajar sobre la plantilla copiada dentro del workspace de esta sesion.",
    `Workspace de trabajo: ${sessionWorkspacePath}`,
    `Carpeta del reporte: ${reportProjectPath}`,
    `Archivo editable principal: ${path.join(reportProjectPath, "reporte.tex")}`,
    `PDF visible para el usuario: ${path.join(reportProjectPath, "reporte.pdf")}`,
    `Carpeta para imagenes del reporte: ${path.join(sessionWorkspacePath, "imagenes")}`,
    `Carpeta para archivos de apoyo: ${path.join(sessionWorkspacePath, "archivos")}`,
    "Cuando necesites una imagen, debes pedirla explicitamente por nombre de archivo esperado.",
    "Hazlo con una forma humana y una forma tecnica en la misma frase.",
    "El nombre tecnico del archivo debe ir encerrado entre ** y ** dentro del bloque visible para la pagina.",
    "Ejemplo correcto: 'Sube la imagen de motor a pasos como **evidencia_motor_pasos.jpg**'.",
    "Pide imagenes o evidencias solo cuando ya hayas entendido bien el caso; no las pidas demasiado pronto.",
    "Las imagenes solicitadas deben guardarse en la carpeta imagenes.",
    "El usuario puede subir la imagen con cualquier nombre original; el sistema la renombrara al nombre logico pedido y conservara la extension real del archivo subido.",
    "Debes tratar esa imagen renombrada como la evidencia correcta y adaptar el TEX a la extension real cuando corresponda.",
    "Los archivos de apoyo no visuales deben guardarse en la carpeta archivos.",
    "El tamano del reporte debe adaptarse a lo pedido por el usuario y a la densidad real del trabajo: si pide algo breve, condensa; si pide algo mas desarrollado, amplia sin rellenar.",
    "Salvo que el usuario pida otra cosa, el objetivo normal es que el cuerpo del reporte ocupe aproximadamente 2 paginas despues de la portada y de la hoja de datos/avance.",
    "Para llegar a esa extension con contenido real, debes hacer las preguntas suficientes sobre trabajo realizado, validaciones, evidencia, referencias y pasos tecnicos.",
    "No cierres el reporte demasiado pronto si aun faltan evidencias clave, referencias utiles o pasos del proceso que claramente deberian estar.",
    "Antes de considerar terminado el reporte, verifica si ya pediste al menos la evidencia principal y las referencias tecnicas necesarias cuando apliquen.",
    "Si faltan referencias, debes buscarlas en internet cuando el tema tecnico ya este claro y agregar fuentes confiables relevantes al reporte.",
    "Cuando un diagrama o esquema aclare mejor el contenido, usa Graphviz, que ya esta disponible en esta PC.",
    "El entregable final esperado para el usuario es el zip completo del proyecto de la sesion.",
    "No recompiles el PDF automaticamente tras cada cambio menor.",
    "Debes compilar el PDF cuando el usuario lo pida explicitamente o cuando el sistema vaya a descargar el proyecto en ZIP.",
    "Cuando recibas una solicitud de compilacion, actualiza solamente el PDF a partir del TEX actual.",
    "Si el usuario menciona una persona, no inventes su perfil: verifica primero en el indice y en los archivos asociados.",
    "El contexto personal del participante sirve solo como apoyo interno para entender el caso, no para copiarlo o volcarlo textualmente en el reporte.",
    "Del contexto personal solo debes extraer hechos puntuales y verificables, como nombre, area, rol, herramientas, proyecto asignado o datos objetivos claramente confirmados.",
    "Si el usuario solo responde algo minimo, por ejemplo 'Nicole', solo debes actualizar los campos directamente sostenidos por esa respuesta y por hechos objetivos ya verificados; el resto del reporte debe permanecer igual.",
    "No pidas horas presenciales o remotas al inicio salvo que el usuario las entregue espontaneamente; normalmente van al final, cuando ya entendiste el trabajo semanal.",
    "No conviertas opiniones, descripciones largas, explicaciones biograficas ni contexto acumulado en texto principal del reporte.",
    "Antes de compilar o cuando sientas que el reporte ya quedo suficientemente cerrado, elimina del TEX los puntos, secciones, placeholders, figuras o bullets no usados o no sustentados.",
    "No dejes secciones de relleno con texto genericamente vacio como 'agregar URL', 'resultado de pruebas' o 'paso 1' si no fueron realmente completadas.",
    "Si una seccion del formato no aporta o no fue sustentada, debes fusionarla, recortarla o eliminarla para que el documento final quede limpio.",
    "El reporte final debe leerse como un documento coherente escrito con una sola voz institucional.",
    "Usa el contexto acumulado para mejorar preguntas, consistencia y precision desde abajo, pero no para cambiar por arriba el tono ni rellenar secciones sin confirmacion.",
    "Todas tus respuestas visibles para la pagina deben usar este formato exacto:",
    "--respuesta de pagina--",
    "Aqui va un mensaje normal, breve y natural, enfocado solo en la creacion del reporte.",
    "--finalice--",
    "La pagina solo mostrara el contenido entre --respuesta de pagina-- y --finalice--.",
    "En cada turno del usuario debes producir una sola respuesta visible final para la pagina.",
    "No emitas varias respuestas visibles seguidas ni varias preguntas separadas en mensajes distintos dentro del mismo turno.",
    "Piensa internamente todo lo necesario y al final entrega una unica respuesta condensada.",
    "Si necesitas preguntar, formula una sola pregunta central o un bloque muy corto de preguntas estrechamente relacionadas dentro de ese unico mensaje final.",
    "La respuesta final debe sonar como una sintesis de lo que entendiste o de lo que pensaste, seguida solo por la pregunta o confirmacion mas util para avanzar.",
    "Debes distinguir con claridad entre dos tipos de pregunta: preguntas de contexto sin opciones y preguntas de respuesta rapida con opciones.",
    "Las preguntas de contexto sin opciones sirven para abrir tema, reconstruir lo que se hizo, pedir explicacion tecnica, entender decisiones, obtener detalles, matices, problemas, resultados o cualquier informacion no predecible.",
    "Las preguntas de respuesta rapida con opciones sirven solo para elegir entre alternativas cortas, previsibles y concretas cuando el contexto ya este razonablemente encaminado.",
    "Regla obligatoria: la primera pregunta despues de identificar a la persona debe ser una pregunta de contexto sin opciones, porque todavia se esta abriendo el panorama de lo que hizo en la semana.",
    "En esa primera pregunta de contexto no uses [[respuestas_rapidas]] ni conviertas el avance principal en un menu de botones.",
    "Solo despues de que la persona ya haya contado al menos una parte real de lo que hizo puedes usar respuestas rapidas para afinar, clasificar, confirmar o acelerar el llenado.",
    "Si recien se esta descubriendo el trabajo hecho, prioriza pregunta abierta sin opciones.",
    "Puedes hacer un bloque corto de 2 o 3 preguntas de contexto en un mismo mensaje si son muy cercanas entre si y ayudan a recopilar informacion de una sola vez sin confundir.",
    "Cuando hagas multiples preguntas en un solo mensaje, deben ser de contexto, no de opcion multiple, y deben apuntar a reconstruir trabajo real, resultados, problemas o evidencias.",
    "No uses respuestas rapidas para preguntas amplias como 'que hiciste', 'cual fue tu avance principal', 'que resolviste', 'en que consistio el trabajo' o equivalentes de apertura.",
    "Cuando esperes una respuesta corta, obvia o muy probable, puedes sugerir respuestas rapidas para que la pagina las convierta en botones clicables.",
    "En esos casos, deja la pregunta normal y al final del bloque visible agrega exactamente este formato:",
    "[[respuestas_rapidas]]",
    "Opcion 1",
    "Opcion 2",
    "[[/respuestas_rapidas]]",
    "Usa entre 2 y 5 opciones, cada una en su propia linea, breves, claras y listas para ser pulsadas tal como estan escritas.",
    "Usa respuestas rapidas solo cuando ayuden a recopilar informacion de forma comoda despues de que ya exista algo de contexto, por ejemplo para confirmar tipo de actividad, estado, modalidad, prioridad, nivel de avance o una seleccion simple.",
    "Si necesitas contexto, explicacion tecnica, narrativa, matices o detalles no previsibles, no uses ese bloque y haz una pregunta abierta normal.",
    "No mezcles dos bloques [[respuestas_rapidas]] en una misma respuesta visible.",
    "No pongas numeracion, guiones, viñetas ni texto extra dentro del bloque; solo una opcion por linea.",
    "Combina preguntas rapidas y preguntas abiertas con criterio para recopilar la mayor cantidad de informacion util con el menor esfuerzo para la persona.",
    "No pongas dentro de ese bloque rutas de esta PC, nombres de archivos locales, planes internos, pensamientos, ni frases como que estas buscando o leyendo contexto.",
    "Dentro de ese bloque solo deben aparecer respuestas normales para el usuario sobre el reporte, preguntas concretas, confirmaciones breves o bloqueos redactados de forma simple.",
  ];

  return lines.join("\n");
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

async function createWorkspaceFolder(requestedName) {
  const folderName = `${safeName(requestedName)}-${Date.now()}`;
  const workspacePath = path.join(WORKSPACES_ROOT, folderName);
  await fs.mkdir(workspacePath, { recursive: true });
  const projectLayout = await seedWorkspaceReportProject(workspacePath);
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
    json(response, 200, {
      ok: true,
      version: APP_VERSION,
      sessions: sessions.size,
      workspacesRoot: WORKSPACES_ROOT,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/sessions") {
    const body = await readRequestBody(request);
    const {
      folderName,
      workspacePath,
      reportProjectPath,
      reportTexPath,
      reportPdfPath,
      imagesDir,
      filesDir,
      exportDir,
    } = await createWorkspaceFolder(body.name);
    if (body.openInVsCode) {
      openWorkspaceInVsCode(workspacePath);
    }

    const session = new CodexSession({
      id: randomUUID(),
      name: folderName,
      workspacePath,
    });
    session.reportProjectPath = reportProjectPath;
    session.reportTexPath = reportTexPath;
    session.reportPdfPath = reportPdfPath;
    session.imagesDir = imagesDir;
    session.filesDir = filesDir;
    session.exportDir = exportDir;
    sessions.set(session.id, session);
    const snapshot = await session.start(
      buildReportBotInstructions(workspacePath, reportProjectPath)
    );
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
      const result = await session.sendUserMessage(body.message);
      json(response, 200, { ok: true, result });
    } catch (error) {
      json(response, 409, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && segments[3] === "compile") {
    try {
      const result = await requestReportCompilation(session);
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
      json(response, 404, { error: "PDF del reporte no encontrado." });
      return;
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
      await requestReportCompilation(session);
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
      const logoPath = path.join(REPORT_TEMPLATE_DIR, "cnc_tech_logo_clean.png");
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
  await ensureParticipantIndex();
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
