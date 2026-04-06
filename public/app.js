const state = {
  session: null,
  eventSource: null,
  assistantNodes: new Map(),
  activeMode: null,
  reconnectTimer: null,
  lastAssistantMessageId: null,
  userMessageCount: 0,
  participantProfile: null,
  quickFields: null,
  uploadedFiles: [],
  secondarySuggestions: [],
  availableFormats: [],
  selectedFormatId: "",
};

const appConfig = window.CNC_TECH_CONFIG || {};
const apiBaseUrl = normalizeBaseUrl(appConfig.apiBaseUrl || "");
const apiRoot = apiBaseUrl ? `${apiBaseUrl}/api` : "/api";

const form = document.getElementById("session-form");
const folderInput = document.getElementById("folder-name");
const reportFormatSelect = document.getElementById("report-format");
const sessionMeta = document.getElementById("session-meta");
const downloadZipLink = document.getElementById("download-zip");
const compileButton = document.getElementById("compile-report");
const viewPdfButton = document.getElementById("view-pdf");
const syncImagesButton = document.getElementById("sync-images");
const quickPanelTitle = document.getElementById("quick-panel-title");
const quickPanelDescription = document.getElementById("quick-panel-description");
const quickPanelFields = document.getElementById("quick-panel-fields");
const applyQuickFieldsButton = document.getElementById("apply-quick-fields");
const quickPanelStatus = document.getElementById("quick-panel-status");
const quickDrawer = document.getElementById("quick-drawer");
const quickDrawerToggle = document.getElementById("quick-drawer-toggle");
const quickDrawerToggleLabel = document.getElementById("quick-drawer-toggle-label");
const quickDrawerBody = document.getElementById("quick-drawer-body");
const workspaceMain = document.querySelector(".workspace-main");
const uploadTrigger = document.getElementById("upload-files-trigger");
const uploadInput = document.getElementById("upload-files");
const uploadStatus = document.getElementById("upload-status");
const requestedImageSelect = document.getElementById("requested-image-select");
const requestedImageTrigger = document.getElementById("upload-requested-image-trigger");
const requestedImageInput = document.getElementById("upload-requested-image");
const requestedImageExistingSelect = document.getElementById("requested-image-existing-select");
const associateRequestedImageTrigger = document.getElementById("associate-requested-image-trigger");
const requestedImageStatus = document.getElementById("requested-image-status");
const uploadedFilesList = document.getElementById("uploaded-files-list");
const experimentalActions = document.getElementById("experimental-actions");
const experimentalStatus = document.getElementById("experimental-status");
const ribbonTabs = Array.from(document.querySelectorAll("[data-toolbar-target]"));
const ribbonPanels = Array.from(document.querySelectorAll("[data-toolbar-panel]"));
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendButton = document.getElementById("send-message");
const statusPill = document.getElementById("status-pill");
const messages = document.getElementById("messages");
const botThinking = document.getElementById("bot-thinking");
const reportProgressBar = document.getElementById("report-progress-bar");
const chatDropHint = document.getElementById("chat-drop-hint");
const chatPanel = document.querySelector(".chat-panel");
const reportPdfFrame = document.getElementById("report-pdf-frame");
const pdfStatus = document.getElementById("pdf-status");
const appVersionBadge = document.getElementById("app-version-badge");
const uploadOverlay = document.getElementById("upload-overlay");
const uploadCard = document.getElementById("upload-card");
const uploadTitle = document.getElementById("upload-title");
const uploadProgressBar = document.getElementById("upload-progress-bar");
const uploadProgressPercent = document.getElementById("upload-progress-percent");
const uploadProgressDetail = document.getElementById("upload-progress-detail");
const uploadCompleteIcon = document.getElementById("upload-complete-icon");
const downloadOverlay = document.getElementById("download-overlay");
const downloadTitle = document.getElementById("download-title");
const downloadProgressBar = document.getElementById("download-progress-bar");
const downloadProgressPercent = document.getElementById("download-progress-percent");
const downloadProgressDetail = document.getElementById("download-progress-detail");
let uploadOverlayHideTimer = null;
let pdfLoadedOnce = false;
let currentPdfObjectUrl = null;
let dragDepth = 0;
let inlineImageSequence = 0;
let quickFieldSaveTimer = null;
const PAGE_RESPONSE_START = "--respuesta de pagina--";
const PAGE_RESPONSE_END = "--finalice--";
const QUICK_REPLIES_START = "[[respuestas_rapidas]]";
const QUICK_REPLIES_END = "[[/respuestas_rapidas]]";
const REPORT_PROGRESS_START = "[[progreso_reporte]]";
const REPORT_PROGRESS_END = "[[/progreso_reporte]]";
const stateRequestedImages = new Map();
const IMAGE_EXTENSION_PATTERN = "jpg|jpeg|png|webp|gif|bmp|tif|tiff|svg|heic|heif|avif|jfif";
const IMAGE_EXTENSION_REGEX = /\.(jpg|jpeg|png|webp|gif|bmp|tif|tiff|svg|heic|heif|avif|jfif)$/i;
const quickPanelInputRegistry = new Map();
const quickPanelActionButtons = [];

const WINDOWS_PATH_REGEX = /[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*/g;

initializeRibbon();
initializeBrandLogo();
loadAppVersion();
initializeQuickPanel();
initializeQuickDrawer();

function getFormatDefinitionById(formatId) {
  const normalizedId = String(formatId || "").trim();
  return state.availableFormats.find((format) => format.id === normalizedId) || null;
}

function getCurrentFormatDefinition() {
  const sessionFormatId = state.session?.reportFormat?.id || "";
  return getFormatDefinitionById(sessionFormatId)
    || getFormatDefinitionById(state.selectedFormatId)
    || state.availableFormats[0]
    || null;
}

function getCurrentQuickPanel() {
  return getCurrentFormatDefinition()?.quickPanel || {
    title: "Panel rapido",
    description: "Campos segun el formato activo",
    emptyStatus: "Sin sesion activa",
    readyStatus: "Panel rapido listo",
    saveSuccessText: "Panel rapido guardado",
    applyingText: "Aplicando datos del panel al reporte...",
    applySuccessText: "Panel aplicado al reporte",
    fields: [],
    actions: [],
  };
}

function buildEmptyQuickFields(formatDefinition = getCurrentFormatDefinition()) {
  const quickPanel = formatDefinition?.quickPanel;
  const fields = Array.isArray(quickPanel?.fields) ? quickPanel.fields : [];
  return Object.fromEntries(fields.map((field) => [field.key, ""]));
}

function buildNormalizedQuickFields(quickFields = {}, formatDefinition = getCurrentFormatDefinition()) {
  return {
    ...buildEmptyQuickFields(formatDefinition),
    ...(quickFields || {}),
  };
}

function normalizeBaseUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.replace(/\/+$/, "");
}

function buildApiUrl(pathname) {
  const normalizedPath = String(pathname || "").startsWith("/") ? pathname : `/${pathname}`;
  return `${apiRoot}${normalizedPath}`;
}

function buildBackendUrl(pathname) {
  const normalizedPath = String(pathname || "").startsWith("/") ? pathname : `/${pathname}`;
  return apiBaseUrl ? `${apiBaseUrl}${normalizedPath}` : normalizedPath;
}

function initializeBrandLogo() {
  const brandLogo = document.querySelector(".brand-logo");
  if (!brandLogo) {
    return;
  }

  const configuredLogo = normalizeBaseUrl(appConfig.brandLogoUrl || "");
  if (configuredLogo) {
    brandLogo.src = configuredLogo;
  }
}

function initializeRibbon() {
  ribbonTabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveRibbonPanel(tab.dataset.toolbarTarget || ""));
  });
}

function initializeQuickPanel() {
  renderQuickPanel(state.quickFields || buildEmptyQuickFields());
  applyQuickFieldsButton?.addEventListener("click", async () => {
    await applyQuickFieldsToReport();
  });
}

function renderQuickPanel(quickFields = {}, formatDefinition = getCurrentFormatDefinition()) {
  if (!quickPanelFields) {
    return;
  }

  const quickPanel = formatDefinition?.quickPanel || getCurrentQuickPanel();
  const mergedFields = buildNormalizedQuickFields(quickFields, formatDefinition);
  state.quickFields = mergedFields;
  quickPanelInputRegistry.clear();
  quickPanelActionButtons.length = 0;
  quickPanelFields.innerHTML = "";

  if (quickPanelTitle) {
    quickPanelTitle.textContent = quickPanel.title || "Panel rapido";
  }

  if (quickPanelDescription) {
    quickPanelDescription.textContent = quickPanel.description || "Campos segun el formato activo";
  }

  for (const field of quickPanel.fields || []) {
    const fieldNode = createQuickFieldNode(field, mergedFields[field.key] || "");
    if (fieldNode) {
      quickPanelFields.append(fieldNode);
    }
  }

  if ((quickPanel.actions || []).length) {
    const actionsRow = document.createElement("div");
    actionsRow.className = "quick-panel-actions-row quick-panel-actions-row-wide";
    for (const action of quickPanel.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button";
      button.textContent = action.label;
      button.disabled = !state.session;
      button.addEventListener("click", () => applyQuickAction(action));
      quickPanelActionButtons.push(button);
      actionsRow.append(button);
    }
    quickPanelFields.append(actionsRow);
  }

  setQuickPanelEnabled(Boolean(state.session));
}

function createQuickFieldNode(field, value) {
  const wrapper = document.createElement("label");
  wrapper.className = `field quick-panel-field ${field.width === "half" ? "quick-panel-field-half" : "quick-panel-field-full"}`;

  const label = document.createElement("span");
  label.textContent = field.label;
  wrapper.append(label);

  let control;
  if (field.type === "textarea") {
    control = document.createElement("textarea");
    control.rows = Number(field.rows) || 3;
  } else if (field.type === "select") {
    control = document.createElement("select");
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = field.placeholder || "Selecciona una opcion";
    control.append(emptyOption);
    for (const option of field.options || []) {
      const optionNode = document.createElement("option");
      optionNode.value = option.value;
      optionNode.textContent = option.label;
      control.append(optionNode);
    }
  } else {
    control = document.createElement("input");
    control.type = field.type || "text";
  }

  control.dataset.quickFieldKey = field.key;
  control.disabled = !state.session;
  control.value = value || "";

  if (field.placeholder && field.type !== "select") {
    control.placeholder = field.placeholder;
  }

  if (field.type === "number") {
    if (field.min !== null && field.min !== undefined && field.min !== "") {
      control.min = field.min;
    }
    if (field.max !== null && field.max !== undefined && field.max !== "") {
      control.max = field.max;
    }
    if (field.step !== null && field.step !== undefined && field.step !== "") {
      control.step = field.step;
    }
  }

  control.addEventListener("input", () => handleQuickFieldChange(field));
  control.addEventListener("change", () => handleQuickFieldChange(field));
  quickPanelInputRegistry.set(field.key, control);
  wrapper.append(control);
  return wrapper;
}

function handleQuickFieldChange(field) {
  if (field.autoRangeEndKey && field.autoRangeEndDays && field.type === "date") {
    const startInput = quickPanelInputRegistry.get(field.key);
    const endInput = quickPanelInputRegistry.get(field.autoRangeEndKey);
    const startValue = startInput?.value || "";
    if (startValue && endInput && (!endInput.value || endInput.value < startValue)) {
      const endDate = new Date(`${startValue}T00:00:00`);
      endDate.setDate(endDate.getDate() + Number(field.autoRangeEndDays || 0));
      endInput.value = formatDateInput(endDate);
    }
  }
  scheduleQuickFieldsSave();
}

function applyQuickAction(action) {
  if (!action || action.type !== "weekRange") {
    return;
  }

  const range = buildWeekRange(action.dayOffset || 0);
  const startInput = quickPanelInputRegistry.get(action.startKey);
  const endInput = quickPanelInputRegistry.get(action.endKey);
  if (startInput) {
    startInput.value = range.start;
  }
  if (endInput) {
    endInput.value = range.end;
  }
  scheduleQuickFieldsSave();
}

function initializeQuickDrawer() {
  if (!quickDrawer || !quickDrawerToggle || !quickDrawerBody) {
    return;
  }

  const updateQuickDrawerToggle = (isOpen) => {
    quickDrawerToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    quickDrawerToggle.title = isOpen ? "Cerrar panel rapido" : "Abrir panel rapido";
    if (quickDrawerToggleLabel) {
      quickDrawerToggleLabel.textContent = isOpen ? "Panel rapido" : "Abrir panel";
    }
  };

  quickDrawer.classList.remove("is-open");
  workspaceMain?.classList.remove("quick-drawer-open");
  quickDrawerBody.hidden = true;
  updateQuickDrawerToggle(false);

  quickDrawerToggle.addEventListener("click", () => {
    const nextOpen = !quickDrawer.classList.contains("is-open");
    quickDrawer.classList.toggle("is-open", nextOpen);
    workspaceMain?.classList.toggle("quick-drawer-open", nextOpen);
    quickDrawerBody.hidden = !nextOpen;
    updateQuickDrawerToggle(nextOpen);
  });
}

function setActiveRibbonPanel(target) {
  if (!target) {
    return;
  }

  ribbonTabs.forEach((tab) => {
    const isActive = tab.dataset.toolbarTarget === target;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  ribbonPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.toolbarPanel === target);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Creando proyecto...");

  try {
    const response = await fetch(buildApiUrl("/sessions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: folderInput.value,
        formatId: reportFormatSelect?.value || state.selectedFormatId || "",
        openInVsCode: true,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo crear el proyecto.");
    }

    hydrateSessionState(data);
    state.assistantNodes.clear();
    stateRequestedImages.clear();
    pdfLoadedOnce = false;
    state.lastAssistantMessageId = null;
    state.userMessageCount = 0;
    messages.innerHTML = "";
    setReportProgress({ percent: 0, status: "en_proceso" });
    clearPdfViewer("Cargando PDF inicial del proyecto...");
    renderUploadedFiles(data.uploadedFiles || []);
    renderRequestedImages();
    renderMeta(data);
    if (data.openingQuestion) {
      appendMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        text: data.openingQuestion,
      });
    }
    connectEvents(data.id);
    chatInput.disabled = false;
    sendButton.disabled = false;
    compileButton.disabled = false;
    syncImagesButton.disabled = false;
    setPdfViewButtonEnabled(true);
    try {
      await refreshPdfViewer(true);
    } catch (error) {
      clearPdfViewer("El PDF inicial no estuvo disponible todavia");
    }
    chatInput.focus();
    setStatus("Proyecto listo");
    setThinking(false);
    if (!pdfLoadedOnce) {
      pdfStatus.textContent = "El PDF inicial no estuvo disponible todavia";
    }
  } catch (error) {
    setStatus("No se pudo crear el proyecto.", true);
    setThinking(false);
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitChatMessage(chatInput.value);
});

chatInput.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }

  if (event.isComposing || chatInput.disabled || sendButton.disabled) {
    return;
  }

  event.preventDefault();
  await submitChatMessage(chatInput.value);
});

messages.addEventListener("click", async (event) => {
  const quickReplyButton = event.target.closest("[data-quick-reply]");
  if (!quickReplyButton || !state.session) {
    return;
  }

  const reply = String(quickReplyButton.dataset.quickReply || "").trim();
  if (!reply || chatInput.disabled || sendButton.disabled) {
    return;
  }

  await submitChatMessage(reply);
});

chatInput.addEventListener("paste", async (event) => {
  if (!state.session || !event.clipboardData) {
    return;
  }

  const pastedFiles = Array.from(event.clipboardData.files || []).filter(Boolean);
  const imageFiles = pastedFiles.filter((file) => isImageLikeFile(file));
  if (!imageFiles.length) {
    return;
  }

  event.preventDefault();

  for (const file of imageFiles) {
    await uploadInlineImage(file, "pegando");
  }
});

chatPanel?.addEventListener("dragenter", (event) => {
  if (!state.session || !hasImageFiles(event.dataTransfer)) {
    return;
  }

  event.preventDefault();
  dragDepth += 1;
  setChatDropActive(true);
});

chatPanel?.addEventListener("dragover", (event) => {
  if (!state.session || !hasImageFiles(event.dataTransfer)) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  setChatDropActive(true);
});

chatPanel?.addEventListener("dragleave", (event) => {
  if (!state.session) {
    return;
  }

  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    setChatDropActive(false);
  }
});

chatPanel?.addEventListener("drop", async (event) => {
  if (!state.session || !event.dataTransfer) {
    return;
  }

  const droppedFiles = Array.from(event.dataTransfer.files || []).filter((file) => isImageLikeFile(file));
  dragDepth = 0;
  setChatDropActive(false);
  if (!droppedFiles.length) {
    return;
  }

  event.preventDefault();
  for (const file of droppedFiles) {
    await uploadInlineImage(file, "arrastrando");
  }
});

uploadInput.addEventListener("change", async () => {
  if (!state.session || uploadInput.files.length === 0) {
    return;
  }

  const files = Array.from(uploadInput.files);
  setUploadStatus(`Subiendo ${files.length} archivo(s)...`);
  showUploadOverlay("Subiendo archivos", 0, `0/${files.length} archivos`);
  uploadInput.disabled = true;
  uploadTrigger.disabled = true;
  uploadTrigger.classList.add("disabled");

  try {
    for (const [index, file] of files.entries()) {
      const data = await uploadBinaryWithProgress({
        url: buildApiUrl(`/sessions/${state.session.id}/upload?name=${encodeURIComponent(file.name)}`),
        file,
        onProgress: ({ loaded, total, speedBytesPerSecond }) => {
          const filePercent = total > 0 ? (loaded / total) * 100 : 0;
          const percent = ((index + Math.min(filePercent, 100) / 100) / files.length) * 100;
          showUploadOverlay(
            "Subiendo archivos",
            percent,
            `${index + 1}/${files.length} ${file.name} - ${formatUploadProgress(loaded, total, speedBytesPerSecond)}`
          );
          setUploadStatus(
            `${index + 1}/${files.length} ${file.name} - ${formatUploadProgress(loaded, total, speedBytesPerSecond)}`
          );
        },
      });

      addUploadedFile(withLocalPreview(data.fileInfo, file));
    }

    setUploadStatus("Archivos subidos al proyecto");
    completeUploadOverlay("Carga completada", `${files.length} archivo(s) subidos`);
  } catch (error) {
    setUploadStatus(error.message || "No se pudieron subir los archivos.", true);
    failUploadOverlay("Carga interrumpida", error.message || "No se pudieron subir los archivos.");
  } finally {
    uploadInput.value = "";
    uploadInput.disabled = false;
    uploadTrigger.disabled = false;
    uploadTrigger.classList.remove("disabled");
  }
});

requestedImageInput.addEventListener("change", async () => {
  if (!state.session || requestedImageInput.files.length === 0) {
    return;
  }

  const requestedName = requestedImageSelect.value.trim();
  if (!requestedName) {
    setRequestedImageStatus("Elige primero una imagen solicitada por el bot.", true);
    requestedImageInput.value = "";
    return;
  }

  const requestedImage = stateRequestedImages.get(requestedName);
  const file = requestedImageInput.files[0];
  requestedImageInput.disabled = true;
  requestedImageTrigger.disabled = true;
  requestedImageTrigger.classList.add("disabled");
  setRequestedImageStatus(`Subiendo imagen de ${requestedImage?.label || requestedName}...`);
  showUploadOverlay("Subiendo imagen solicitada", 0, file.name);

  try {
    const data = await uploadBinaryWithProgress({
      url: buildApiUrl(`/sessions/${state.session.id}/upload-image?targetName=${encodeURIComponent(requestedName)}&originalName=${encodeURIComponent(file.name)}`),
      file,
      onProgress: ({ loaded, total, speedBytesPerSecond }) => {
        const percent = total > 0 ? (loaded / total) * 100 : 0;
        showUploadOverlay(
          "Subiendo imagen solicitada",
          percent,
          `${requestedImage?.label || requestedName} - ${formatUploadProgress(loaded, total, speedBytesPerSecond)}`
        );
        setRequestedImageStatus(
          `${requestedImage?.label || requestedName} - ${formatUploadProgress(loaded, total, speedBytesPerSecond)}`
        );
      },
    });

    addUploadedFile(withLocalPreview(data.fileInfo, file));
    completeRequestedImage(data.requestedName || data.fileName);
    setRequestedImageStatus(
      data.texUpdated
        ? `Imagen guardada para ${requestedImage?.label || data.fileName} y TEX ajustado al tipo real`
        : `Imagen guardada para ${requestedImage?.label || data.fileName}`
    );
    completeUploadOverlay("Imagen subida", requestedImage?.label || data.fileName);
  } catch (error) {
    setRequestedImageStatus(error.message || "No se pudo subir la imagen solicitada.", true);
    failUploadOverlay("Carga interrumpida", error.message || "No se pudo subir la imagen solicitada.");
  } finally {
    requestedImageInput.value = "";
    requestedImageInput.disabled = false;
    requestedImageTrigger.disabled = stateRequestedImages.size === 0;
    requestedImageTrigger.classList.toggle("disabled", stateRequestedImages.size === 0);
  }
});

uploadTrigger.addEventListener("click", () => {
  if (uploadTrigger.disabled || !state.session) {
    return;
  }
  openFilePicker(uploadInput);
});

requestedImageTrigger.addEventListener("click", () => {
  if (requestedImageTrigger.disabled || !state.session || stateRequestedImages.size === 0) {
    return;
  }
  openFilePicker(requestedImageInput);
});

associateRequestedImageTrigger?.addEventListener("click", async () => {
  if (!state.session || associateRequestedImageTrigger.disabled) {
    return;
  }

  const requestedName = requestedImageSelect.value.trim();
  const existingName = requestedImageExistingSelect?.value.trim() || "";
  if (!requestedName) {
    setRequestedImageStatus("Elige primero una imagen solicitada por el bot.", true);
    return;
  }

  if (!existingName) {
    setRequestedImageStatus("Elige una imagen ya subida para asociarla.", true);
    return;
  }

  const requestedImage = stateRequestedImages.get(requestedName);
  associateRequestedImageTrigger.disabled = true;
  associateRequestedImageTrigger.classList.add("disabled");
  setRequestedImageStatus(`Asociando imagen ya subida a ${requestedImage?.label || requestedName}...`);

  try {
    const response = await fetch(
      buildApiUrl(`/sessions/${state.session.id}/associate-uploaded-image?targetName=${encodeURIComponent(requestedName)}&sourceName=${encodeURIComponent(existingName)}`),
      { method: "POST" }
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo asociar la imagen ya subida.");
    }

    replaceUploadedFile(data.previousFileInfo, data.fileInfo);
    completeRequestedImage(data.requestedName || requestedName);
    setRequestedImageStatus(
      data.texUpdated
        ? `Imagen ya subida asociada a ${requestedImage?.label || requestedName} y TEX ajustado al tipo real`
        : `Imagen ya subida asociada a ${requestedImage?.label || requestedName}`
    );
  } catch (error) {
    setRequestedImageStatus(error.message || "No se pudo asociar la imagen ya subida.", true);
  } finally {
    renderAvailableRequestedImages();
  }
});

function connectEvents(sessionId) {
  if (state.eventSource) {
    state.eventSource.close();
  }
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }

  const eventSource = new EventSource(buildApiUrl(`/sessions/${sessionId}/events`));
  state.eventSource = eventSource;

  eventSource.onopen = () => {
    if (state.activeMode === "chat") {
      setStatus("Contexto pensando...");
    } else {
      setStatus("Sesion lista");
    }
  };

  eventSource.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    handleServerEvent(payload);
  };

  eventSource.onerror = () => {
    if (state.eventSource?.readyState === EventSource.CLOSED) {
      state.eventSource.close();
      state.eventSource = null;
    }
    if (!state.reconnectTimer && state.session?.id) {
      setStatus("Reconectando la sesion en tiempo real...");
      state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = null;
        if (state.session?.id) {
          connectEvents(state.session.id);
        }
      }, 2000);
    }
  };
}

async function compileCurrentReport(openViewer = false) {
  if (!state.session) {
    return;
  }

  compileButton.disabled = true;
  setPdfViewButtonEnabled(false);
  syncImagesButton.disabled = true;
  chatInput.disabled = true;
  sendButton.disabled = true;
  state.activeMode = openViewer ? "compile-and-open" : "compile";
  setStatus(openViewer ? "Compilando y abriendo PDF..." : "Compilando PDF...");
  pdfStatus.textContent = openViewer ? "Compilando y cargando PDF..." : "Compilando con Contexto...";
  setThinking(true, "compilando");

  try {
    const response = await fetch(buildApiUrl(`/sessions/${state.session.id}/compile`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo compilar el PDF.");
    }

    if (openViewer) {
      await refreshPdfViewer(true);
      pdfStatus.textContent = "PDF compilado y abierto";
    } else {
      pdfStatus.textContent = "PDF compilado";
    }
    setStatus("Listo");
  } catch (error) {
    pdfStatus.textContent = openViewer ? "No se pudo compilar ni abrir el PDF" : "No se pudo actualizar el PDF";
    setStatus(openViewer ? "No se pudo compilar ni abrir el PDF." : "No se pudo compilar el PDF.", true);
  } finally {
    compileButton.disabled = false;
    setPdfViewButtonEnabled(Boolean(state.session));
    syncImagesButton.disabled = false;
    chatInput.disabled = false;
    sendButton.disabled = false;
    state.activeMode = null;
    setThinking(false);
    chatInput.focus();
  }
}

compileButton.addEventListener("click", async () => {
  await compileCurrentReport(false);
});

viewPdfButton.addEventListener("click", async () => {
  await compileCurrentReport(true);
});

syncImagesButton.addEventListener("click", async () => {
  if (!state.session) {
    return;
  }

  syncImagesButton.disabled = true;
  compileButton.disabled = true;
  chatInput.disabled = true;
  sendButton.disabled = true;
  state.activeMode = "sync-images";
  setStatus("Actualizando imagenes...");
  pdfStatus.textContent = "Revisando referencias de imagen...";
  setThinking(true, "revisando imagenes");

  try {
    const response = await fetch(buildApiUrl(`/sessions/${state.session.id}/sync-images`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudieron actualizar las referencias de imagen.");
    }

    pdfStatus.textContent = "Referencias de imagen actualizadas en el TEX";
    setStatus("Listo");
  } catch (error) {
    pdfStatus.textContent = "No se pudieron actualizar las imagenes";
    setStatus("No se pudieron actualizar las imagenes.", true);
  } finally {
    syncImagesButton.disabled = false;
    compileButton.disabled = false;
    chatInput.disabled = false;
    sendButton.disabled = false;
    state.activeMode = null;
    setThinking(false);
    chatInput.focus();
  }
});

downloadZipLink.addEventListener("click", async (event) => {
  if (!state.session || downloadZipLink.classList.contains("disabled")) {
    event.preventDefault();
    return;
  }

  event.preventDefault();
  downloadZipLink.classList.add("disabled");
  downloadZipLink.setAttribute("aria-disabled", "true");
  compileButton.disabled = true;
  setPdfViewButtonEnabled(false);
  syncImagesButton.disabled = true;
  chatInput.disabled = true;
  sendButton.disabled = true;
  state.activeMode = "download";
  setStatus("Compilando y preparando ZIP...");
  pdfStatus.textContent = "Compilando antes de descargar...";
  setThinking(true, "compilando");
  showDownloadOverlay("Preparando ZIP", 0, "Esperando respuesta del servidor...");

  try {
    const response = await fetch(buildApiUrl(`/sessions/${state.session.id}/download`));
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "No se pudo descargar el proyecto.");
    }

    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^\"]+)"?/i);
    const fileName = match?.[1] ? decodeURIComponent(match[1]) : `${state.session.name || "proyecto"}.zip`;
    const blob = await readResponseWithProgress(response, (progress) => {
      showDownloadOverlay(
        "Descargando ZIP",
        progress.percent,
        progress.total > 0
          ? `${formatBytes(progress.loaded)} de ${formatBytes(progress.total)}`
          : `${formatBytes(progress.loaded)} descargados`
      );
    });
    const url = URL.createObjectURL(blob);
    const tempLink = document.createElement("a");
    tempLink.href = url;
    tempLink.download = fileName;
    document.body.append(tempLink);
    tempLink.click();
    tempLink.remove();
    URL.revokeObjectURL(url);
    pdfStatus.textContent = "ZIP descargado. Usa Ver PDF si quieres abrir el reporte";
    setStatus("ZIP descargado");
    showDownloadOverlay("ZIP listo", 100, "Descarga completada");
  } catch (error) {
    pdfStatus.textContent = "La descarga no pudo compilar el PDF";
    setStatus("No se pudo preparar el ZIP.", true);
    hideDownloadOverlay();
  } finally {
    downloadZipLink.classList.remove("disabled");
    downloadZipLink.setAttribute("aria-disabled", "false");
    compileButton.disabled = false;
    setPdfViewButtonEnabled(Boolean(state.session));
    syncImagesButton.disabled = false;
    chatInput.disabled = false;
    sendButton.disabled = false;
    state.activeMode = null;
    setThinking(false);
    setTimeout(() => hideDownloadOverlay(), 700);
  }
});

function handleServerEvent(event) {
  switch (event.type) {
    case "snapshot":
      hydrateSessionState(event.payload);
      renderMeta(event.payload);
      renderUploadedFiles(event.payload.uploadedFiles || []);
      restoreHistory(event.payload.history || []);
      break;
    case "session-ready":
      hydrateSessionState(event.payload);
      renderMeta(event.payload);
      renderUploadedFiles(event.payload.uploadedFiles || []);
      setStatus("Sesion lista");
      break;
    case "session-updated":
      hydrateSessionState(event.payload);
      renderMeta(event.payload);
      break;
    case "file-uploaded":
      addUploadedFile(event.payload);
      break;
    case "chat-message":
      if (event.payload.internal) {
        break;
      }
      if (event.payload.role === "user" && isInternalCompilePrompt(event.payload.text || "")) {
        break;
      }
      if (event.payload.role === "user") {
        break;
      }
      if (event.payload.role === "assistant") {
        if (state.activeMode === "compile" || state.activeMode === "download" || state.activeMode === "sync-images") {
          break;
        }
      } else {
        appendMessage(event.payload);
      }
      break;
    case "assistant-delta":
      if (!event.payload.internal && state.activeMode !== "compile" && state.activeMode !== "download" && state.activeMode !== "sync-images") {
        updateAssistantMessage(event.payload);
      }
      break;
    case "assistant-complete":
      if (!event.payload.internal && state.activeMode !== "compile" && state.activeMode !== "download" && state.activeMode !== "sync-images") {
        setThinking(true, "pensando");
      }
      break;
    case "turn-complete":
      if (event.payload?.internal) {
        break;
      }
      if (state.activeMode !== "compile" && state.activeMode !== "download" && state.activeMode !== "sync-images") {
        if (event.payload?.assistantText) {
          updateAssistantMessage(
            {
              id: event.payload.assistantItemId || event.payload.turnId || crypto.randomUUID(),
              text: event.payload.assistantText,
            },
            true
          );
          collectRequestedImages(event.payload.assistantText || "");
        }
      }
      chatInput.disabled = false;
      sendButton.disabled = false;
      compileButton.disabled = false;
      syncImagesButton.disabled = false;
      chatInput.focus();
      setStatus("Listo");
      state.activeMode = null;
      setThinking(false);
      break;
    case "status":
      if (state.activeMode === "compile" || state.activeMode === "download") {
        setStatus("Compilando...");
        setThinking(event.payload.status === "running" || event.payload.status === "active", "compilando");
      } else if (state.activeMode === "chat") {
        setStatus(event.payload.status === "running" || event.payload.status === "active" ? "Contexto pensando..." : "Listo");
        setThinking(event.payload.status === "running" || event.payload.status === "active", "pensando");
      } else {
        setStatus(event.payload.status === "running" ? "Contexto pensando..." : "Listo");
        setThinking(event.payload.status === "running" || event.payload.status === "active");
      }
      break;
    case "session-error":
      chatInput.disabled = false;
      sendButton.disabled = false;
      compileButton.disabled = false;
      syncImagesButton.disabled = false;
      state.activeMode = null;
      if (pdfStatus.textContent.includes("Compilando") || pdfStatus.textContent.includes("descargar")) {
        pdfStatus.textContent = "No se pudo completar la compilacion";
      }
      setStatus("No se pudo completar la accion actual.", true);
      setThinking(false);
      break;
    default:
      break;
  }
}

function restoreHistory(history) {
  if (messages.children.length > 0) {
    return;
  }

  state.userMessageCount = 0;

  for (const event of history) {
    if (event.type === "chat-message") {
      if (event.payload.internal) {
        continue;
      }
      if (event.payload.role === "user" && isInternalCompilePrompt(event.payload.text || "")) {
        continue;
      }
      if (event.payload.role === "system") {
        continue;
      }
      if (event.payload.role === "user") {
        state.userMessageCount += 1;
      }
      if (event.payload.role !== "assistant") {
        appendMessage(event.payload);
      }
    }
    if (event.type === "turn-complete" && event.payload?.assistantText) {
      if (event.payload.internal) {
        continue;
      }
      collectRequestedImages(event.payload.assistantText || "");
      updateAssistantMessage(
        {
          id: event.payload.assistantItemId || event.payload.turnId || crypto.randomUUID(),
          text: event.payload.assistantText,
        },
        true
      );
    }
  }
}

function appendMessage(message) {
  if (message.role === "system" || message.internal) {
    return;
  }

  const existingMessage = document.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
  if (existingMessage) {
    updateMessageContent(existingMessage, message);
    messages.scrollTop = messages.scrollHeight;
    return;
  }

  const article = document.createElement("article");
  article.className = `message ${message.role}`;
  article.dataset.messageId = message.id;
  if (message.role === "assistant" && !String(message.text || "").trim()) {
    article.hidden = true;
  }

  const label = document.createElement("div");
  label.className = "label";
  label.textContent =
    message.role === "user"
      ? "Tu"
      : message.role === "assistant"
        ? "Contexto"
        : "Sistema";

  const text = document.createElement("div");
  text.className = "text";

  article.append(label, text);
  updateMessageContent(article, message);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
}

function getLastMessageTextNode() {
  const last = messages.lastElementChild;
  return last ? last.querySelector(".text") : null;
}

function updateAssistantMessage(payload, completed = false) {
  const parsed = extractPageResponse(payload.text || "");
  if (!completed) {
    return;
  }
  if (!parsed.text) {
    return;
  }
  const progressMeta = extractReportProgressMeta(parsed.text);
  if (progressMeta) {
    setReportProgress(progressMeta);
  }
  const sanitizedText = sanitizeVisibleText(parsed.text);
  const lastMessage = messages.lastElementChild;
  if (
    lastMessage &&
    lastMessage.classList.contains("assistant") &&
    lastMessage.querySelector(".text")?.textContent === sanitizedText
  ) {
    return;
  }
  appendMessage({
    id: payload.id,
    role: "assistant",
    text: sanitizedText,
  });
  state.lastAssistantMessageId = payload.id;
  if (parsed.finished) {
    setThinking(false);
    setStatus("Listo");
  }
  messages.scrollTop = messages.scrollHeight;
}

function applyAssistantFallback(result) {
  if (!result || !result.assistantText) {
    return;
  }

  if (result.assistantItemId && state.lastAssistantMessageId === result.assistantItemId) {
    return;
  }

  updateAssistantMessage(
    {
      id: result.assistantItemId || crypto.randomUUID(),
      text: result.assistantText,
    },
    true
  );
  collectRequestedImages(result.assistantText);
  chatInput.disabled = false;
  sendButton.disabled = false;
  compileButton.disabled = false;
  syncImagesButton.disabled = false;
  state.activeMode = null;
  setThinking(false);
  setStatus("Listo");
}

async function submitChatMessage(rawMessage) {
  if (!state.session) {
    return;
  }

  const message = String(rawMessage || "").trim();
  if (!message) {
    return;
  }

  appendMessage({
    id: crypto.randomUUID(),
    role: "user",
    text: message,
  });
  state.userMessageCount += 1;

  chatInput.value = "";
  chatInput.focus();
  sendButton.disabled = true;
  chatInput.disabled = true;
  compileButton.disabled = true;
  state.activeMode = "chat";
  setStatus("Contexto pensando...");
  setThinking(true, "pensando");

  try {
    const response = await fetch(buildApiUrl(`/sessions/${state.session.id}/messages`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo enviar el mensaje.");
    }

    applyAssistantFallback(data.result);
  } catch (error) {
    chatInput.disabled = false;
    sendButton.disabled = false;
    compileButton.disabled = false;
    syncImagesButton.disabled = false;
    state.activeMode = null;
    setStatus("No se pudo enviar el mensaje.", true);
    setThinking(false);
  }
}

function updateMessageContent(article, message) {
  const textNode = article.querySelector(".text");
  if (!textNode) {
    return;
  }

  if (message.role !== "assistant") {
    textNode.textContent = message.text || "";
    const existingQuickReplies = article.querySelector(".quick-replies");
    if (existingQuickReplies) {
      existingQuickReplies.remove();
    }
    return;
  }

  const parsedContent = parseAssistantDisplayContent(message.text || "");
  textNode.textContent = parsedContent.text;

  const existingQuickReplies = article.querySelector(".quick-replies");
  if (existingQuickReplies) {
    existingQuickReplies.remove();
  }

  if (!parsedContent.quickReplies.length || !shouldRenderQuickReplies()) {
    return;
  }

  const quickReplies = document.createElement("div");
  quickReplies.className = "quick-replies";

  const quickRepliesLabel = document.createElement("div");
  quickRepliesLabel.className = "quick-replies-label";
  quickRepliesLabel.textContent = "Respuesta rapida";

  const quickRepliesButtons = document.createElement("div");
  quickRepliesButtons.className = "quick-replies-buttons";

  for (const option of parsedContent.quickReplies) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-reply-button";
    button.dataset.quickReply = option;
    button.textContent = option;
    quickRepliesButtons.append(button);
  }

  quickReplies.append(quickRepliesLabel, quickRepliesButtons);
  article.append(quickReplies);
}

function renderMeta(session) {
  state.participantProfile = session.participantProfile || state.participantProfile;
  state.quickFields = buildNormalizedQuickFields(session.quickFields || state.quickFields || {}, getCurrentFormatDefinition());
  state.selectedFormatId = session.reportFormat?.id || state.selectedFormatId;
  if (reportFormatSelect && state.selectedFormatId) {
    reportFormatSelect.value = state.selectedFormatId;
  }
  renderQuickPanel(state.quickFields, getCurrentFormatDefinition());
  sessionMeta.classList.remove("empty");
  const participantName = state.participantProfile?.name || "Pendiente de identificar";
  const participantArea = state.participantProfile?.area || "Pendiente";
  const reportFormat = session.reportFormat?.label || "Pendiente";
  const quickSummary = buildQuickMetaSummary();
  const metaLines = [
    `<strong>Proyecto:</strong> ${escapeHtml(session.name || "Sesion activa")}`,
    `<strong>Formato:</strong> ${escapeHtml(reportFormat)}`,
  ];

  if (session.reportFormat?.usesParticipantProfiles) {
    metaLines.push(`<strong>Participante:</strong> ${escapeHtml(participantName)}`);
    metaLines.push(`<strong>Area:</strong> ${escapeHtml(participantArea)}`);
  }

  metaLines.push(`<strong>Resumen rapido:</strong> ${escapeHtml(quickSummary)}`);
  sessionMeta.innerHTML = metaLines.join("<br />");
  downloadZipLink.href = buildApiUrl(`/sessions/${session.id}/download`);
  downloadZipLink.classList.remove("disabled");
  downloadZipLink.setAttribute("aria-disabled", "false");
  uploadInput.disabled = false;
  uploadTrigger.disabled = false;
  uploadTrigger.classList.remove("disabled");
  uploadTrigger.setAttribute("aria-disabled", "false");
  compileButton.disabled = false;
  setPdfViewButtonEnabled(true);
  syncImagesButton.disabled = false;
  setQuickPanelEnabled(true);
  setExperimentalActionsEnabled(true);
  requestedImageSelect.disabled = stateRequestedImages.size === 0;
  requestedImageInput.disabled = stateRequestedImages.size === 0;
  requestedImageTrigger.disabled = stateRequestedImages.size === 0;
  requestedImageTrigger.classList.toggle("disabled", stateRequestedImages.size === 0);
  requestedImageTrigger.setAttribute("aria-disabled", stateRequestedImages.size === 0 ? "true" : "false");
  setUploadStatus("Puedes subir archivos al proyecto");
  if (stateRequestedImages.size === 0) {
    setRequestedImageStatus("Cuando el bot pida una imagen, aparecera aqui para subirla");
  }
  setQuickPanelStatus(getCurrentQuickPanel().readyStatus || "Panel rapido listo para completar datos de cierre");
  setExperimentalStatus("Funciones experimentales listas para usar");
  if (!pdfLoadedOnce) {
    clearPdfViewer("Al crear el proyecto se intentara abrir el PDF automaticamente");
  } else {
    pdfStatus.textContent = "PDF listo. Pulsa Compilar PDF para actualizarlo";
  }
}

function renderUploadedFiles(files) {
  state.uploadedFiles = Array.isArray(files) ? [...files] : [];
  uploadedFilesList.innerHTML = "";
  if (!state.uploadedFiles.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Nada todavia";
    uploadedFilesList.append(empty);
    renderAvailableRequestedImages();
    return;
  }

  for (const file of state.uploadedFiles.slice(0, 12)) {
    uploadedFilesList.append(createUploadedFileItem(file));
  }

  renderAvailableRequestedImages();
}

function addUploadedFile(file) {
  if (!file) {
    return;
  }

  state.uploadedFiles = [file, ...state.uploadedFiles.filter((item) => item.path !== file.path)].slice(0, 12);

  const empty = uploadedFilesList.querySelector(".empty");
  if (empty) {
    empty.remove();
  }

  const existing = Array.from(uploadedFilesList.children).find(
    (item) => item.dataset.path === file.path
  );
  if (existing) {
    existing.remove();
  }

  uploadedFilesList.prepend(createUploadedFileItem(file));
  while (uploadedFilesList.children.length > 12) {
    uploadedFilesList.removeChild(uploadedFilesList.lastElementChild);
  }

  pulseRibbonTab("subidos");
  renderAvailableRequestedImages();
}

function replaceUploadedFile(previousFile, nextFile) {
  if (!nextFile) {
    return;
  }

  state.uploadedFiles = state.uploadedFiles
    .filter((item) => item.path !== previousFile?.path && item.name !== previousFile?.name)
    .filter((item) => item.path !== nextFile.path)
    .slice(0, 11);
  state.uploadedFiles.unshift(nextFile);
  renderUploadedFiles(state.uploadedFiles);
}

function createUploadedFileItem(file) {
  const item = document.createElement("li");
  item.className = "uploaded-file-item";
  item.dataset.path = file.path;
  item.dataset.name = file.name;
  item.dataset.kind = file.kind || "archivo";

  if (shouldRenderImagePreview(file) && state.session?.id) {
    const preview = document.createElement("img");
    preview.className = "uploaded-file-preview";
    preview.src = file.previewUrl || buildImagePreviewUrl(file);
    preview.alt = "";
    preview.title = file.name;
    preview.loading = "lazy";
    preview.decoding = "async";
    preview.addEventListener("error", () => {
      const fallbackUrl = buildImagePreviewUrl(file);
      if (file.previewUrl && preview.src !== fallbackUrl) {
        preview.src = fallbackUrl;
        return;
      }
      preview.classList.add("is-broken");
    }, { once: true });
    item.append(preview);
  } else {
    item.append(createFileIconPreview(file));
  }

  const name = document.createElement("span");
  name.className = "uploaded-file-name";
  name.textContent = file.name;

  const meta = document.createElement("span");
  meta.className = "uploaded-file-meta";
  meta.textContent = formatBytes(file.size || 0);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "uploaded-file-delete";
  removeButton.textContent = "Borrar";
  removeButton.dataset.action = "delete-upload";
  removeButton.dataset.name = file.name;
  removeButton.dataset.kind = file.kind || "archivo";
  removeButton.setAttribute("aria-label", `Borrar ${file.name}`);

  item.append(name, meta, removeButton);
  return item;
}

function createFileIconPreview(file) {
  const iconType = getFileIconType(file.name || file.path || "archivo");
  const wrapper = document.createElement("div");
  wrapper.className = `uploaded-file-icon type-${iconType.type}`;
  wrapper.setAttribute("aria-hidden", "true");
  wrapper.title = `${iconType.label}: ${file.name || "archivo"}`;

  const glyph = document.createElement("span");
  glyph.className = "uploaded-file-icon-glyph";
  glyph.textContent = iconType.glyph;

  const ext = document.createElement("span");
  ext.className = "uploaded-file-icon-ext";
  ext.textContent = getFileExtensionLabel(file.name || file.path || "archivo");

  wrapper.append(glyph, ext);
  return wrapper;
}

function getFileExtensionLabel(name) {
  const parts = String(name || "").split(".");
  if (parts.length < 2) {
    return "FILE";
  }

  return String(parts[parts.length - 1] || "file")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 4)
    .toUpperCase() || "FILE";
}

function getFileIconType(name) {
  const ext = getFileExtensionLabel(name).toLowerCase();

  if (ext === "pdf") {
    return { type: "pdf", glyph: "PDF", label: "Documento PDF" };
  }

  if (["doc", "docx", "odt", "rtf"].includes(ext)) {
    return { type: "word", glyph: "W", label: "Documento de texto" };
  }

  if (["xls", "xlsx", "csv", "ods"].includes(ext)) {
    return { type: "excel", glyph: "X", label: "Hoja de calculo" };
  }

  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return { type: "zip", glyph: "ZIP", label: "Archivo comprimido" };
  }

  if (["txt", "md", "log", "tex"].includes(ext)) {
    return { type: "text", glyph: "TXT", label: "Archivo de texto" };
  }

  return { type: "text", glyph: "DOC", label: "Archivo" };
}

function pulseRibbonTab(target) {
  const tab = ribbonTabs.find((item) => item.dataset.toolbarTarget === target);
  if (!tab) {
    return;
  }

  tab.classList.remove("has-upload-alert");
  void tab.offsetWidth;
  tab.classList.add("has-upload-alert");
  setTimeout(() => {
    tab.classList.remove("has-upload-alert");
  }, 760);
}

uploadedFilesList.addEventListener("click", async (event) => {
  const removeButton = event.target.closest('[data-action="delete-upload"]');
  if (!removeButton || !state.session) {
    return;
  }

  const fileName = String(removeButton.dataset.name || "").trim();
  const fileKind = String(removeButton.dataset.kind || "archivo").trim();
  if (!fileName) {
    return;
  }

  removeButton.disabled = true;
  try {
    await deleteUploadedFile(fileName, fileKind);
  } catch (error) {
    removeButton.disabled = false;
  }
});

function removeUploadedFile(name, kind) {
  state.uploadedFiles = state.uploadedFiles.filter(
    (item) => !(item.name === name && String(item.kind || "archivo") === kind)
  );

  const existing = Array.from(uploadedFilesList.children).find(
    (item) => item.dataset.name === name && item.dataset.kind === kind
  );

  if (existing) {
    existing.remove();
  }

  if (!uploadedFilesList.children.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Nada todavia";
    uploadedFilesList.append(empty);
  }

  renderAvailableRequestedImages();
}

function setStatus(text, isError = false) {
  statusPill.textContent = text;
  statusPill.classList.toggle("error", Boolean(isError));
}

function setThinking(isThinking, label = "pensando") {
  botThinking.hidden = !isThinking;
  botThinking.textContent = isThinking ? label : "";
}

function setUploadStatus(text, isError = false) {
  uploadStatus.textContent = text;
  uploadStatus.classList.toggle("error", Boolean(isError));
}

function setRequestedImageStatus(text, isError = false) {
  requestedImageStatus.textContent = text;
  requestedImageStatus.classList.toggle("error", Boolean(isError));
}

function setQuickPanelStatus(text, isError = false) {
  if (!quickPanelStatus) {
    return;
  }
  quickPanelStatus.textContent = text;
  quickPanelStatus.classList.toggle("error", Boolean(isError));
}

function setExperimentalStatus(text, isError = false) {
  if (!experimentalStatus) {
    return;
  }
  experimentalStatus.textContent = text;
  experimentalStatus.classList.toggle("error", Boolean(isError));
}

function hydrateSessionState(snapshot) {
  state.session = snapshot;
  state.selectedFormatId = snapshot?.reportFormat?.id || state.selectedFormatId;
  state.participantProfile = snapshot?.participantProfile || state.participantProfile;
  state.quickFields = buildNormalizedQuickFields(snapshot?.quickFields || state.quickFields || {}, getCurrentFormatDefinition());
  state.uploadedFiles = Array.isArray(snapshot?.uploadedFiles) ? [...snapshot.uploadedFiles] : [];
  renderQuickPanel(state.quickFields, getCurrentFormatDefinition());
}

function populateFormatOptions(formats, preferredFormatId = "") {
  if (!reportFormatSelect) {
    return;
  }

  state.availableFormats = Array.isArray(formats) ? [...formats] : [];
  const candidateId = state.selectedFormatId || preferredFormatId || state.availableFormats[0]?.id || "";

  reportFormatSelect.innerHTML = "";
  if (!state.availableFormats.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No hay formatos disponibles";
    reportFormatSelect.append(option);
    reportFormatSelect.disabled = true;
    state.selectedFormatId = "";
    return;
  }

  for (const format of state.availableFormats) {
    const option = document.createElement("option");
    option.value = format.id;
    option.textContent = format.label;
    if (format.description) {
      option.title = format.description;
    }
    reportFormatSelect.append(option);
  }

  reportFormatSelect.disabled = false;
  reportFormatSelect.value = state.availableFormats.some((format) => format.id === candidateId)
    ? candidateId
    : state.availableFormats[0].id;
  state.selectedFormatId = reportFormatSelect.value;
  if (!state.session) {
    state.quickFields = buildEmptyQuickFields(getCurrentFormatDefinition());
  }
  renderQuickPanel(state.quickFields || buildEmptyQuickFields(getCurrentFormatDefinition()), getCurrentFormatDefinition());
}

reportFormatSelect?.addEventListener("change", () => {
  state.selectedFormatId = reportFormatSelect.value;
  if (!state.session) {
    state.quickFields = buildEmptyQuickFields(getCurrentFormatDefinition());
    renderQuickPanel(state.quickFields, getCurrentFormatDefinition());
    setQuickPanelStatus(getCurrentQuickPanel().readyStatus || "Panel rapido listo para el formato seleccionado");
  }
});

function setReportProgress(meta) {
  if (!reportProgressBar) {
    return;
  }

  const percentValue = Number(meta?.percent);
  const percent = Number.isFinite(percentValue) ? Math.max(0, Math.min(percentValue, 100)) : 0;
  const hue = Math.round((percent / 100) * 120);
  reportProgressBar.style.width = `${percent}%`;
  reportProgressBar.style.background = `linear-gradient(90deg, hsl(${hue} 78% 46%) 0%, hsl(${Math.min(120, hue + 10)} 72% 42%) 100%)`;
  reportProgressBar.style.opacity = percent > 0 ? "0.9" : "0.35";
  reportProgressBar.title = meta?.status === "terminado"
    ? `Informe terminado - ${Math.round(percent)}%`
    : `Avance del informe - ${Math.round(percent)}%`;
}

function buildQuickMetaSummary() {
  const formatDefinition = getCurrentFormatDefinition();
  const metaFields = (formatDefinition?.quickPanel?.fields || []).filter((field) => field.meta);
  const summaryParts = metaFields
    .map((field) => {
      const value = String(state.quickFields?.[field.key] || "").trim();
      return value ? `${field.label}: ${value}` : "";
    })
    .filter(Boolean)
    .slice(0, 3);

  return summaryParts.join(" | ") || "Pendiente";
}

function collectQuickFields() {
  const quickFields = {};
  for (const [key, input] of quickPanelInputRegistry.entries()) {
    quickFields[key] = (input?.value || "").trim();
  }
  return buildNormalizedQuickFields(quickFields, getCurrentFormatDefinition());
}

function scheduleQuickFieldsSave() {
  if (!state.session) {
    return;
  }
  clearTimeout(quickFieldSaveTimer);
  quickFieldSaveTimer = setTimeout(() => {
    saveQuickFields(true).catch(() => {});
  }, 280);
}

async function saveQuickFields(isSilent = false) {
  if (!state.session) {
    return null;
  }

  const quickFields = collectQuickFields();
  state.quickFields = quickFields;
  const response = await fetch(buildApiUrl(`/sessions/${state.session.id}/quick-fields`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(quickFields),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "No se pudo guardar el panel rapido.");
  }

  state.quickFields = buildNormalizedQuickFields(data.quickFields || quickFields, getCurrentFormatDefinition());
  if (!isSilent) {
    setQuickPanelStatus(getCurrentQuickPanel().saveSuccessText || "Panel rapido guardado");
  }
  return data;
}

async function applyQuickFieldsToReport() {
  if (!state.session) {
    return;
  }

  applyQuickFieldsButton.disabled = true;
  setQuickPanelStatus(getCurrentQuickPanel().applyingText || "Aplicando datos del panel al reporte...");
  state.activeMode = "quick-fields-apply";
  setThinking(true, "aplicando panel");

  try {
    const quickFields = collectQuickFields();
    const response = await fetch(buildApiUrl(`/sessions/${state.session.id}/quick-fields-apply`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quickFields),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo aplicar el panel rapido.");
    }

    state.quickFields = buildNormalizedQuickFields(data.quickFields || quickFields, getCurrentFormatDefinition());
    const visible = extractPageResponse(data.result?.assistantText || "").text
      || getCurrentQuickPanel().applySuccessText
      || "Panel aplicado al reporte";
    setQuickPanelStatus(visible);
  } catch (error) {
    setQuickPanelStatus(error.message || "No se pudo aplicar el panel rapido.", true);
  } finally {
    applyQuickFieldsButton.disabled = false;
    state.activeMode = null;
    setThinking(false);
  }
}

function setQuickPanelEnabled(enabled) {
  const inputs = [
    ...Array.from(quickPanelInputRegistry.values()),
    ...quickPanelActionButtons,
    applyQuickFieldsButton,
  ].filter(Boolean);

  for (const input of inputs) {
    input.disabled = !enabled;
  }
}

function setExperimentalActionsEnabled(enabled) {
  const buttons = Array.from(document.querySelectorAll("[data-experimental-action]"));
  for (const button of buttons) {
    button.disabled = !enabled;
    button.classList.toggle("disabled", !enabled);
    button.setAttribute("aria-disabled", enabled ? "false" : "true");
  }
}

function getExperimentalActionLabel(actionId) {
  const labels = {
    "graphviz-opportunities": "Añadir graficos",
    "improve-syntax": "Mejorar sintaxis",
    "technical-enrichment": "Enriquecer tecnica",
    "strengthen-conclusions": "Reforzar conclusiones",
    "find-missing-references": "Buscar referencias faltantes",
    "convert-lists-to-tables": "Convertir listas en cuadros",
    "detect-repetitions": "Detectar repeticiones",
    "review-chronology": "Revisar coherencia cronologica",
    "normalize-consistency": "Unificar estilo",
    "detect-gaps": "Detectar huecos",
    "compress-report": "Compactar reporte",
  };

  return labels[actionId] || "Accion experimental";
}

async function runExperimentalAction(actionId) {
  if (!state.session) {
    return;
  }

  const label = getExperimentalActionLabel(actionId);
  setExperimentalActionsEnabled(false);
  chatInput.disabled = true;
  sendButton.disabled = true;
  compileButton.disabled = true;
  syncImagesButton.disabled = true;
  setExperimentalStatus(`Ejecutando: ${label}...`);
  setStatus(`Ejecutando ${label}...`);
  state.activeMode = "experimental-action";
  setThinking(true, "probando mejoras");

  try {
    const response = await fetch(buildApiUrl(`/sessions/${state.session.id}/experimental-action`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo ejecutar la funcion experimental.");
    }

    applyAssistantFallback(data.result);
    const visible = extractPageResponse(data.result?.assistantText || "").text || `${label} completado`;
    setExperimentalStatus(visible);
  } catch (error) {
    setExperimentalStatus(error.message || "No se pudo ejecutar la funcion experimental.", true);
    setStatus("No se pudo ejecutar la funcion experimental.", true);
  } finally {
    setExperimentalActionsEnabled(Boolean(state.session));
    chatInput.disabled = false;
    sendButton.disabled = false;
    compileButton.disabled = false;
    syncImagesButton.disabled = false;
    state.activeMode = null;
    setThinking(false);
    chatInput.focus();
  }
}

experimentalActions?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-experimental-action]");
  if (!button || button.disabled) {
    return;
  }

  await runExperimentalAction(String(button.dataset.experimentalAction || "").trim());
});

function buildWeekRange(dayOffset) {
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + dayOffset);
  const day = baseDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: formatDateInput(monday),
    end: formatDateInput(sunday),
  };
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function collectRequestedImages(rawText) {
  const visibleText = extractPageResponse(rawText).text;
  if (!visibleText) {
    return;
  }

  const requests = parseRequestedImages(visibleText);
  let changed = false;
  for (const request of requests) {
    if (!stateRequestedImages.has(request.fileName)) {
      stateRequestedImages.set(request.fileName, request);
      changed = true;
    }
  }

  if (changed) {
    renderRequestedImages();
    requestedImageSelect.disabled = false;
    requestedImageInput.disabled = false;
    requestedImageTrigger.disabled = false;
    requestedImageTrigger.classList.remove("disabled");
    requestedImageTrigger.setAttribute("aria-disabled", "false");
    setRequestedImageStatus("Elige una imagen solicitada y subela directamente");
  }
}

function parseRequestedImages(text) {
  const requests = [];
  const addRequest = (fileName, label) => {
    const normalizedFileName = String(fileName || "").trim();
    if (!normalizedFileName) {
      return;
    }

    const alreadyExists = requests.some(
      (item) => item.fileName.toLowerCase() === normalizedFileName.toLowerCase()
    );
    if (alreadyExists) {
      return;
    }

    requests.push({
      fileName: normalizedFileName,
      label: humanizeImageLabel(label || stripImageExtension(normalizedFileName).replaceAll("_", " ")),
    });
  };

  const explicitPatterns = [
    new RegExp(`(?:Sube|Carga|Adjunta|Envia|Comparte|Agrega|Necesito)\\s+(?:la\\s+)?(?:imagen|foto|evidencia|captura)\\s+(.+?)\\s+como\\s+\\*\\*([a-zA-Z0-9_\\-.]+\\.(?:${IMAGE_EXTENSION_PATTERN}))\\*\\*`, "gi"),
    new RegExp(`(?:Sube|Carga|Adjunta|Envia|Comparte|Agrega|Necesito)\\s+(?:la\\s+)?(?:imagen|foto|evidencia|captura)\\s+(.+?)\\s+como\\s+([a-zA-Z0-9_\\-.]+\\.(?:${IMAGE_EXTENSION_PATTERN}))`, "gi"),
    new RegExp(`(?:usa|utiliza|guardar|guarda|nombra|nombrala|nombralo)\\s+(?:como\\s+)?\\*\\*([a-zA-Z0-9_\\-.]+\\.(?:${IMAGE_EXTENSION_PATTERN}))\\*\\*`, "gi"),
  ];

  for (const pattern of explicitPatterns) {
    for (const match of text.matchAll(pattern)) {
      if (match.length >= 3) {
        addRequest(match[2], match[1]);
      } else if (match.length >= 2) {
        addRequest(match[1], deriveImageLabelFromContext(text, match.index || 0, match[1]));
      }
    }
  }

  const highlightedFiles = new RegExp(`\\*\\*([a-zA-Z0-9_\\-.]+\\.(?:${IMAGE_EXTENSION_PATTERN}))\\*\\*`, "gi");
  for (const match of text.matchAll(highlightedFiles)) {
    addRequest(match[1], deriveImageLabelFromContext(text, match.index || 0, match[1]));
  }

  const plainFiles = new RegExp(`([a-zA-Z0-9_\\-.]+\\.(?:${IMAGE_EXTENSION_PATTERN}))`, "gi");
  for (const match of text.matchAll(plainFiles)) {
    const fileName = match[1];
    const prefix = text.slice(Math.max(0, (match.index || 0) - 90), match.index || 0).toLowerCase();
    if (/(imagen|foto|evidencia|captura|adjunta|sube|carga|comparte|envia)/.test(prefix)) {
      addRequest(fileName, deriveImageLabelFromContext(text, match.index || 0, fileName));
    }
  }

  return requests;
}

function humanizeImageLabel(value) {
  return String(value || "")
    .replace(/^[\s:;,.\-]+|[\s:;,.\-]+$/g, "")
    .replace(/^(de|del|la|el|una|un)\s+/i, "")
    .replace(/\s+/g, " ")
    .replaceAll("_", " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function stripImageExtension(value) {
  return String(value || "").replace(/\.(jpg|jpeg|png|webp|gif|bmp|tif|tiff|svg|heic|heif|avif|jfif)$/i, "");
}

function deriveImageLabelFromContext(text, index, fileName) {
  const start = Math.max(0, index - 140);
  const before = text.slice(start, index).replace(/\s+/g, " ").trim();
  const after = text.slice(index, Math.min(text.length, index + 140)).replace(/\s+/g, " ").trim();
  const combined = `${before} ${after}`;

  const descriptivePatterns = [
    /(?:imagen|foto|evidencia|captura)\s+(?:de|del|para)?\s*"?([^"*.]+?)"?\s+(?:como|en|usa|utiliza)/i,
    /(?:imagen|foto|evidencia|captura)\s+(?:de|del|para)?\s*"?([^"*.]+?)"?$/i,
    /"([^"]+)"\s+como/i,
  ];

  for (const pattern of descriptivePatterns) {
    const match = combined.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return stripImageExtension(fileName).replaceAll("_", " ");
}

function renderRequestedImages() {
  requestedImageSelect.innerHTML = "";
  if (stateRequestedImages.size === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Todavia no hay imagenes pendientes";
    requestedImageSelect.append(option);
    requestedImageSelect.disabled = true;
    requestedImageInput.disabled = true;
    requestedImageTrigger.disabled = true;
    requestedImageTrigger.classList.add("disabled");
    requestedImageTrigger.setAttribute("aria-disabled", "true");
    renderAvailableRequestedImages();
    return;
  }

  requestedImageSelect.disabled = false;
  requestedImageInput.disabled = false;
  requestedImageTrigger.disabled = false;
  requestedImageTrigger.classList.remove("disabled");
  requestedImageTrigger.setAttribute("aria-disabled", "false");

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Elige una imagen solicitada";
  requestedImageSelect.append(placeholder);

  for (const item of stateRequestedImages.values()) {
    const option = document.createElement("option");
    option.value = item.fileName;
    option.textContent = `Subir imagen de "${item.label}"`;
    requestedImageSelect.append(option);
  }

  renderAvailableRequestedImages();
}

function renderAvailableRequestedImages() {
  if (!requestedImageExistingSelect || !associateRequestedImageTrigger) {
    return;
  }

  requestedImageExistingSelect.innerHTML = "";
  const imageFiles = state.uploadedFiles.filter((file) => String(file?.kind || "") === "imagen");
  const selectedRequest = requestedImageSelect?.value.trim() || "";
  const disabled = stateRequestedImages.size === 0 || imageFiles.length === 0;

  if (disabled) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = stateRequestedImages.size === 0
      ? "Primero debe existir una imagen solicitada"
      : "No hay imagenes subidas disponibles";
    requestedImageExistingSelect.append(option);
    requestedImageExistingSelect.disabled = true;
    associateRequestedImageTrigger.disabled = true;
    associateRequestedImageTrigger.classList.add("disabled");
    associateRequestedImageTrigger.setAttribute("aria-disabled", "true");
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = selectedRequest
    ? "Elige una imagen ya subida"
    : "Elige primero una imagen solicitada";
  requestedImageExistingSelect.append(placeholder);

  for (const file of imageFiles) {
    const option = document.createElement("option");
    option.value = file.name;
    option.textContent = file.name;
    requestedImageExistingSelect.append(option);
  }

  requestedImageExistingSelect.disabled = false;
  associateRequestedImageTrigger.disabled = !selectedRequest || !requestedImageExistingSelect.value;
  associateRequestedImageTrigger.classList.toggle("disabled", associateRequestedImageTrigger.disabled);
  associateRequestedImageTrigger.setAttribute("aria-disabled", associateRequestedImageTrigger.disabled ? "true" : "false");
}

requestedImageSelect?.addEventListener("change", () => {
  renderAvailableRequestedImages();
});

requestedImageExistingSelect?.addEventListener("change", () => {
  if (!associateRequestedImageTrigger) {
    return;
  }

  const enabled = Boolean(requestedImageSelect?.value.trim()) && Boolean(requestedImageExistingSelect.value.trim());
  associateRequestedImageTrigger.disabled = !enabled;
  associateRequestedImageTrigger.classList.toggle("disabled", !enabled);
  associateRequestedImageTrigger.setAttribute("aria-disabled", enabled ? "false" : "true");
});

function completeRequestedImage(fileName) {
  if (!stateRequestedImages.has(fileName)) {
    return;
  }
  stateRequestedImages.delete(fileName);
  renderRequestedImages();
}

function restoreRequestedImage(fileName) {
  if (!fileName || stateRequestedImages.has(fileName)) {
    return;
  }

  stateRequestedImages.set(fileName, {
    fileName,
    label: humanizeImageLabel(stripImageExtension(fileName).replaceAll("_", " ")),
  });
  renderRequestedImages();
}

function formatBytes(bytes) {
  const safeBytes = Number(bytes || 0);
  if (safeBytes < 1024) {
    return `${safeBytes.toFixed(0)} B`;
  }
  if (safeBytes < 1024 * 1024) {
    return `${(safeBytes / 1024).toFixed(1)} KB`;
  }
  if (safeBytes < 1024 * 1024 * 1024) {
    return `${(safeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(safeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatUploadProgress(loaded, total, speedBytesPerSecond) {
  const speedText = `${formatBytes(speedBytesPerSecond)}/s`;
  if (total > 0) {
    const percent = Math.min((loaded / total) * 100, 100);
    return `${percent.toFixed(1)}% (${formatBytes(loaded)} / ${formatBytes(total)}) - ${speedText}`;
  }
  return `${formatBytes(loaded)} - ${speedText}`;
}

async function readResponseWithProgress(response, onProgress) {
  const total = Number(response.headers.get("Content-Length") || 0);
  if (!response.body) {
    const blob = await response.blob();
    onProgress?.({ loaded: blob.size, total: blob.size, percent: 100 });
    return blob;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
      loaded += value.length;
      const percent = total > 0 ? Math.min((loaded / total) * 100, 100) : 0;
      onProgress?.({ loaded, total, percent });
    }
  }

  onProgress?.({ loaded, total: total || loaded, percent: 100 });
  return new Blob(chunks, { type: response.headers.get("Content-Type") || "application/zip" });
}

function showDownloadOverlay(title, percent, detail) {
  if (!downloadOverlay) {
    return;
  }
  downloadOverlay.hidden = false;
  downloadTitle.textContent = title;
  downloadProgressBar.style.width = `${Math.max(0, Math.min(percent || 0, 100))}%`;
  downloadProgressPercent.textContent = `${Math.round(Math.max(0, Math.min(percent || 0, 100)))}%`;
  downloadProgressDetail.textContent = detail || "";
}

function hideDownloadOverlay() {
  if (!downloadOverlay) {
    return;
  }
  downloadOverlay.hidden = true;
}

function showUploadOverlay(title, percent, detail, state = "progress") {
  if (!uploadOverlay || !uploadTitle || !uploadProgressBar || !uploadProgressPercent || !uploadProgressDetail) {
    return;
  }

  if (uploadOverlayHideTimer) {
    clearTimeout(uploadOverlayHideTimer);
    uploadOverlayHideTimer = null;
  }

  const clampedPercent = Math.max(0, Math.min(percent || 0, 100));
  uploadOverlay.hidden = false;
  uploadTitle.textContent = title;
  uploadProgressBar.style.width = `${clampedPercent}%`;
  uploadProgressPercent.textContent = `${Math.round(clampedPercent)}%`;
  uploadProgressDetail.textContent = detail || "";
  uploadCard?.classList.toggle("is-success", state === "success");
  if (uploadCompleteIcon) {
    uploadCompleteIcon.hidden = state !== "success";
  }
}

function hideUploadOverlay() {
  if (!uploadOverlay) {
    return;
  }

  uploadOverlay.hidden = true;
  uploadCard?.classList.remove("is-success");
  if (uploadCompleteIcon) {
    uploadCompleteIcon.hidden = true;
  }
}

function completeUploadOverlay(title, detail) {
  showUploadOverlay(title, 100, detail, "success");
  uploadOverlayHideTimer = setTimeout(() => {
    hideUploadOverlay();
    uploadOverlayHideTimer = null;
  }, 1200);
}

function failUploadOverlay(title, detail) {
  showUploadOverlay(title, 100, detail, "progress");
  uploadOverlayHideTimer = setTimeout(() => {
    hideUploadOverlay();
    uploadOverlayHideTimer = null;
  }, 1400);
}

function uploadBinaryWithProgress({ url, file, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startedAt = performance.now();

    xhr.open("POST", url, true);
    xhr.responseType = "json";
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.1);
      const loaded = event.loaded || 0;
      const total = event.lengthComputable ? event.total : file.size || 0;
      const speedBytesPerSecond = loaded / elapsedSeconds;
      onProgress?.({ loaded, total, speedBytesPerSecond });
    };

    xhr.onerror = () => reject(new Error("No se pudo completar la subida."));

    xhr.onload = () => {
      const response = xhr.response || JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(response);
        return;
      }
      reject(new Error(response.error || "No se pudo completar la subida."));
    };

    xhr.send(file);
  });
}

function withLocalPreview(fileInfo, sourceFile) {
  if (!sourceFile || !shouldRenderImagePreview({ name: sourceFile.name, kind: fileInfo?.kind })) {
    return fileInfo;
  }

  return {
    ...fileInfo,
    previewUrl: URL.createObjectURL(sourceFile),
  };
}

async function uploadInlineImage(file, sourceLabel = "subiendo") {
  const originalName = buildClipboardImageName(file);
  const requestedTarget = resolveRequestedImageTarget(originalName);
  const usingRequestedImage = requestedTarget !== originalName;
  const requestedImage = stateRequestedImages.get(requestedTarget);

  showUploadOverlay(
    capitalizeWord(sourceLabel),
    0,
    usingRequestedImage ? (requestedImage?.label || requestedTarget) : file.name
  );

  setRequestedImageStatus(
    usingRequestedImage
      ? `${capitalizeWord(sourceLabel)} imagen para ${requestedImage?.label || requestedTarget}...`
      : `${capitalizeWord(sourceLabel)} imagen en la carpeta de imagenes...`
  );

  try {
    const data = await uploadBinaryWithProgress({
      url: buildApiUrl(`/sessions/${state.session.id}/upload-image?targetName=${encodeURIComponent(requestedTarget)}&originalName=${encodeURIComponent(originalName)}`),
      file,
      onProgress: ({ loaded, total, speedBytesPerSecond }) => {
        const label = usingRequestedImage
          ? (requestedImage?.label || requestedTarget)
          : originalName;
        const percent = total > 0 ? (loaded / total) * 100 : 0;
        showUploadOverlay(
          capitalizeWord(sourceLabel),
          percent,
          `${label} - ${formatUploadProgress(loaded, total, speedBytesPerSecond)}`
        );
        setRequestedImageStatus(`${label} - ${formatUploadProgress(loaded, total, speedBytesPerSecond)}`);
      },
    });

    addUploadedFile(withLocalPreview(data.fileInfo, file));
    if (usingRequestedImage) {
      completeRequestedImage(data.requestedName || data.fileName);
      setRequestedImageStatus(
        data.texUpdated
          ? `Imagen subida para ${requestedImage?.label || data.fileName} y TEX ajustado al tipo real`
          : `Imagen subida para ${requestedImage?.label || data.fileName}`
      );
      completeUploadOverlay("Imagen subida", requestedImage?.label || data.fileName);
    } else {
      setRequestedImageStatus("Imagen subida guardada en la carpeta de imagenes");
      completeUploadOverlay("Imagen subida", data.fileName || file.name);
    }
  } catch (error) {
    setRequestedImageStatus(error.message || "No se pudo subir la imagen.", true);
    failUploadOverlay("Carga interrumpida", error.message || "No se pudo subir la imagen.");
    throw error;
  }
}

async function deleteUploadedFile(fileName, fileKind) {
  const response = await fetch(
    buildApiUrl(`/sessions/${state.session.id}/uploaded-file?name=${encodeURIComponent(fileName)}&kind=${encodeURIComponent(fileKind)}`),
    { method: "DELETE" }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "No se pudo borrar el archivo.");
  }

  removeUploadedFile(fileName, fileKind);
  if (data.restoredRequest?.fileName) {
    restoreRequestedImage(data.restoredRequest.fileName);
    setRequestedImageStatus("Imagen borrada. La solicitud vuelve a quedar pendiente.");
  } else if (fileKind === "imagen") {
    setRequestedImageStatus("Imagen borrada de la sesion");
  } else {
    setUploadStatus("Archivo borrado de la sesion");
  }
}

function hasImageFiles(dataTransfer) {
  if (!dataTransfer) {
    return false;
  }

  const files = Array.from(dataTransfer.files || []);
  return files.some((file) => isImageLikeFile(file));
}

function shouldRenderImagePreview(file) {
  if (!file) {
    return false;
  }

  return file.kind === "imagen" || IMAGE_EXTENSION_REGEX.test(String(file.name || ""));
}

function buildImagePreviewUrl(file) {
  const kind = encodeURIComponent(String(file.kind || "archivo"));
  const version = encodeURIComponent(String(file.uploadedAt || Date.now()));
  return buildApiUrl(`/sessions/${state.session.id}/image-preview?name=${encodeURIComponent(file.name)}&kind=${kind}&v=${version}`);
}

function setChatDropActive(isActive) {
  chatPanel?.classList.toggle("drag-active", Boolean(isActive));
  chatDropHint?.classList.toggle("drag-active", Boolean(isActive));
}

function capitalizeWord(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "Subiendo";
  }
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function resolveRequestedImageTarget(fallbackName) {
  const selectedName = requestedImageSelect.value.trim();
  if (selectedName && stateRequestedImages.has(selectedName)) {
    return selectedName;
  }

  const firstPending = stateRequestedImages.keys().next();
  if (!firstPending.done) {
    return firstPending.value;
  }

  return fallbackName;
}

function buildClipboardImageName(file) {
  const extension = inferImageExtension(file);
  inlineImageSequence += 1;
  const uniqueSuffix = `${Date.now()}_${inlineImageSequence}`;
  return `captura_${uniqueSuffix}${extension}`;
}

function inferImageExtension(file) {
  const mime = String(file?.type || "").toLowerCase().split(";")[0].trim();
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

  return mimeMap[mime] || ".png";
}

function isImageLikeFile(file) {
  return String(file?.type || "").toLowerCase().startsWith("image/")
    || IMAGE_EXTENSION_REGEX.test(String(file?.name || ""));
}

function clearPdfViewer(message) {
  if (currentPdfObjectUrl) {
    URL.revokeObjectURL(currentPdfObjectUrl);
    currentPdfObjectUrl = null;
  }
  reportPdfFrame.src = "about:blank";
  pdfStatus.textContent = message;
  pdfLoadedOnce = false;
}

function setPdfViewButtonEnabled(enabled) {
  if (!viewPdfButton) {
    return;
  }

  viewPdfButton.disabled = !enabled;
  viewPdfButton.classList.toggle("disabled", !enabled);
  viewPdfButton.setAttribute("aria-disabled", enabled ? "false" : "true");
}

async function refreshPdfViewer(force = false) {
  if (!state.session) {
    clearPdfViewer("Sin sesion activa");
    return;
  }

  if (!force && pdfLoadedOnce) {
    return;
  }

  pdfStatus.textContent = "Cargando PDF...";
  const url = buildApiUrl(`/sessions/${state.session.id}/report-pdf?t=${Date.now()}`);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("No se pudo cargar el PDF del reporte.");
  }

  const pdfBlob = await response.blob();
  if (currentPdfObjectUrl) {
    URL.revokeObjectURL(currentPdfObjectUrl);
  }

  currentPdfObjectUrl = URL.createObjectURL(pdfBlob);
  reportPdfFrame.src = currentPdfObjectUrl;
  pdfStatus.textContent = pdfLoadedOnce ? "Vista PDF actualizada" : "PDF cargado";
  pdfLoadedOnce = true;
}

function extractPageResponse(rawText) {
  const text = String(rawText || "");
  const startIndex = text.indexOf(PAGE_RESPONSE_START);
  if (startIndex < 0) {
    return { text: "", finished: false };
  }

  const contentStart = startIndex + PAGE_RESPONSE_START.length;
  const endIndex = text.indexOf(PAGE_RESPONSE_END, contentStart);
  const visible = (endIndex >= 0 ? text.slice(contentStart, endIndex) : text.slice(contentStart)).trim();
  return {
    text: visible,
    finished: endIndex >= 0,
  };
}

function parseAssistantDisplayContent(value) {
  const visibleText = sanitizeVisibleText(value);
  const quickReplies = parseQuickReplies(visibleText);
  const textWithoutQuickReplies = sanitizeVisibleText(removeQuickRepliesBlock(visibleText));
  return {
    text: textWithoutQuickReplies,
    quickReplies,
  };
}

function shouldRenderQuickReplies() {
  return state.userMessageCount >= 2;
}

function sanitizeVisibleText(value) {
  return String(value || "")
    .replace(/\[\[progreso_reporte\]\][\s\S]*?\[\[\/progreso_reporte\]\]/gi, "")
    .replace(WINDOWS_PATH_REGEX, "archivo local")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractReportProgressMeta(text) {
  const match = String(text || "").match(/\[\[progreso_reporte\]\]([\s\S]*?)\[\[\/progreso_reporte\]\]/i);
  if (!match?.[1]) {
    return null;
  }

  const block = match[1];
  const percentMatch = block.match(/porcentaje\s*:\s*(\d{1,3})/i);
  const statusMatch = block.match(/estado\s*:\s*([a-z_]+)/i);
  if (!percentMatch) {
    return null;
  }

  return {
    percent: Number(percentMatch[1]),
    status: (statusMatch?.[1] || "en_proceso").toLowerCase(),
  };
}

function parseQuickReplies(text) {
  const match = String(text || "").match(/\[\[respuestas_rapidas\]\]([\s\S]*?)\[\[\/respuestas_rapidas\]\]/i);
  if (!match?.[1]) {
    return [];
  }

  const seen = new Set();
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((line) => {
      const normalized = line.toLowerCase();
      if (!normalized || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    })
    .slice(0, 5);
}

function removeQuickRepliesBlock(text) {
  return String(text || "")
    .replace(/\[\[respuestas_rapidas\]\][\s\S]*?\[\[\/respuestas_rapidas\]\]/gi, "")
    .trim();
}

function openFilePicker(input) {
  if (!input) {
    return;
  }
  if (typeof input.showPicker === "function") {
    input.showPicker();
    return;
  }
  input.click();
}

async function loadAppVersion() {
  if (!appVersionBadge) {
    return;
  }

  const frontendVersion = String(appVersionBadge.textContent || "").trim();

  try {
    const response = await fetch(buildApiUrl("/health"), { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    populateFormatOptions(data.formats || [], data.defaultFormatId || "");
    if (data.version) {
      appVersionBadge.textContent = frontendVersion || `Version ${data.version}`;
      appVersionBadge.title = `Frontend ${frontendVersion || "desconocido"} | Backend ${data.version}`;
    }
  } catch {
    // Mantiene el valor inicial renderizado en HTML si la lectura falla.
  }
}

function isInternalCompilePrompt(text) {
  return String(text || "").includes("Compila ahora el PDF del reporte con la informacion actual del proyecto.")
    || String(text || "").includes("Revisa ahora las referencias de imagen del reporte y actualiza el TEX segun la extension real de los archivos subidos.");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
