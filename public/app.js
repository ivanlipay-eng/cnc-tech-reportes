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
  reportProgress: null,
  uploadedFiles: [],
  secondarySuggestions: [],
  availableFormats: [],
  selectedFormatId: "",
  recentProjects: [],
  lastRecentProjectsParticipantName: "",
  rubenAnimationShownForSessionId: "",
  forcedProfileTheme: "",
  manualTheme: "default",
};

const appConfig = window.CNC_TECH_CONFIG || {};
const apiBaseUrl = normalizeBaseUrl(appConfig.apiBaseUrl || "");
const apiRoot = apiBaseUrl ? `${apiBaseUrl}/api` : "/api";

const form = document.getElementById("session-form");
const folderInput = document.getElementById("folder-name");
const reportFormatSelect = document.getElementById("report-format");
const collaborationShell = document.getElementById("collaboration-shell");
const collaborationToggle = document.getElementById("collaboration-toggle");
const collaborationToggleHint = document.getElementById("collaboration-toggle-hint");
const collaborationPanel = document.getElementById("collaboration-panel");
const sharedProjectIdInput = document.getElementById("shared-project-id");
const copySharedProjectIdButton = document.getElementById("copy-shared-project-id");
const loadSharedProjectIdInput = document.getElementById("load-shared-project-id");
const loadSharedProjectButton = document.getElementById("load-shared-project");
const collaborationStatus = document.getElementById("collaboration-status");
const sessionMeta = document.getElementById("session-meta");
const downloadZipLink = document.getElementById("download-zip");
const uploadDriveButton = document.getElementById("upload-drive");
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
const uploadWordSourceTrigger = document.getElementById("upload-word-source-trigger");
const uploadWordSourceInput = document.getElementById("upload-word-source");
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
const themeToggle = document.getElementById("theme-toggle");
const ribbonTabs = Array.from(document.querySelectorAll("[data-toolbar-target]"));
const ribbonPanels = Array.from(document.querySelectorAll("[data-toolbar-panel]"));
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendButton = document.getElementById("send-message");
const statusPill = document.getElementById("status-pill");
const messages = document.getElementById("messages");
const botThinking = document.getElementById("bot-thinking");
const thinkingFactBar = document.getElementById("thinking-fact-bar");
const thinkingFactText = document.getElementById("thinking-fact-text");
const reportProgressBar = document.getElementById("report-progress-bar");
const reportProgressLabel = document.getElementById("report-progress-label");
const reportProgressPercent = document.getElementById("report-progress-percent");
const reportProgressNote = document.getElementById("report-progress-note");
const reportProgressChecklist = document.getElementById("report-progress-checklist");
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
const participantAnimationOverlay = document.getElementById("participant-animation-overlay");
const participantAnimationVideo = document.getElementById("participant-animation-video");
const participantAnimationMp4Source = document.getElementById("participant-animation-source-mp4");
const participantAnimationWebmSource = document.getElementById("participant-animation-source-webm");
let uploadOverlayHideTimer = null;
let pdfLoadedOnce = false;
let currentPdfObjectUrl = null;
let dragDepth = 0;
let inlineImageSequence = 0;
let quickFieldSaveTimer = null;
let participantAnimationHideTimer = null;
let collaborationPanelOpen = false;
let thinkingFactTimer = null;
let thinkingFactQueue = [];
let thinkingFactIndex = 0;
const PAGE_RESPONSE_START = "--respuesta de pagina--";
const PAGE_RESPONSE_END = "--finalice--";
const QUICK_REPLIES_START = "[[respuestas_rapidas]]";
const QUICK_REPLIES_END = "[[/respuestas_rapidas]]";
const REPORT_PROGRESS_START = "[[progreso_reporte]]";
const REPORT_PROGRESS_END = "[[/progreso_reporte]]";
const stateRequestedImages = new Map();
const IMAGE_EXTENSION_PATTERN = "jpg|jpeg|png|webp|gif|bmp|tif|tiff|svg|heic|heif|avif|jfif";
const IMAGE_EXTENSION_REGEX = /\.(jpg|jpeg|png|webp|gif|bmp|tif|tiff|svg|heic|heif|avif|jfif)$/i;
const WORD_SOURCE_EXTENSION_REGEX = /\.(doc|docx)$/i;
const quickPanelInputRegistry = new Map();
const quickPanelActionButtons = [];
const THEME_STORAGE_KEY = "cnc-tech-theme";
const GROUP_COLLABORATION_FORMAT_IDS = new Set(["informes-uni"]);
const CNC_TECH_CURIOUS_FACTS = [
  "El husillo es el corazon de la maquina CNC: su rigidez y concentricidad afectan directamente el acabado superficial.",
  "Un portaherramientas mal balanceado puede introducir vibracion incluso si el husillo esta en buen estado.",
  "La pinza ER trabaja mejor cuando su zona elastica esta limpia; una viruta minima cambia la concentricidad.",
  "Los rodamientos del husillo suelen delatar desgaste por un aumento de temperatura antes de fallar de forma visible.",
  "En un eje de bolas recirculantes, la precarga reduce holgura pero tambien aumenta friccion y calor.",
  "Las guias lineales sufren mas por contaminacion fina que por carga pura cuando el sellado es deficiente.",
  "Una bancada pesada no solo da estabilidad: tambien ayuda a amortiguar frecuencias que degradan el corte.",
  "La torreta de una CNC de torno gana precision cuando el enclavamiento repite siempre la misma referencia mecanica.",
  "El backlash no siempre viene del tornillo; tambien puede venir de acoples flexibles fatigados o soportes flojos.",
  "Un servo bien afinado puede parecer mas lento al inicio, pero deja trayectorias mucho mas limpias al acelerar.",
  "Los motores paso a paso pierden sincronismo sin avisar; los servos permiten detectar error de seguimiento.",
  "El encoder no mide fuerza: mide posicion. Por eso una estructura debil puede deformarse aunque el control lea bien el eje.",
  "En muchas fresadoras CNC, la calidad del refrigerante influye tanto en la herramienta como en el estado de los sellos.",
  "Una boquilla mal orientada puede enfriar la pieza y no el filo, acortando la vida util de la herramienta.",
  "El cambiador automatico de herramientas depende mas de repetibilidad mecanica que de velocidad para evitar colisiones.",
  "El cono BT o CAT necesita superficies de contacto impecables; una marca pequena puede alterar el asiento completo.",
  "El cono HSK gana rigidez a alta velocidad porque apoya por cara y por cono al mismo tiempo.",
  "Un magazine de herramientas mal alineado puede provocar fallos intermitentes que parecen errores de software.",
  "El lubricante de guias no debe sustituirse por aceite cualquiera; su adherencia evita el efecto stick-slip.",
  "El stick-slip hace que un eje se mueva a saltos pequenos, algo especialmente visible en interpolaciones lentas.",
  "La escuadra de la maquina no depende solo del montaje inicial; golpes, temperatura y esfuerzos la cambian con el tiempo.",
  "Una maquina puede repetir muy bien una posicion y aun asi estar mal calibrada respecto a la geometria real.",
  "En un torno CNC, el contrapunto mal alineado genera conos aunque la herramienta y el programa sean correctos.",
  "La luneta no solo sostiene piezas largas: bien ajustada reduce vibraciones y mejora el acabado en pasadas finas.",
  "El plato autocentrante pierde precision radial con desgaste desigual de sus garras, aunque siga cerrando fuerte.",
  "Las garras blandas permiten corregir descentramiento porque se mecanizan en la misma condicion de sujecion.",
  "El cero pieza es una convencion del proceso; el cero maquina pertenece a la cinematica interna del equipo.",
  "Una sonda de palpado bien usada reduce tiempos de preparacion y tambien detecta desviaciones termicas tempranas.",
  "La compensacion de longitud de herramienta evita reprogramar alturas, pero depende de una medicion confiable del filo real.",
  "Cuando una herramienta de carburo vibra, el problema puede estar en la salida excesiva y no en el material de la fresa.",
  "La salida de herramienta es una palanca: duplicarla puede bajar rigidez mucho mas de lo que parece.",
  "El chatter aparece cuando estructura, herramienta y material entran en resonancia; no siempre se resuelve bajando rpm.",
  "A veces subir ligeramente las rpm saca el proceso de una frecuencia inestable y mejora el acabado.",
  "Las tapas telescopicas protegen ejes, pero si acumulan viruta pueden frenar el movimiento y cargar mas al servo.",
  "Un fuelle roto deja entrar abrasivo fino a zonas donde la grasa ya no puede proteger por si sola.",
  "El sistema de refrigeracion por niebla reduce consumo, pero no sustituye un buen control termico en cortes pesados.",
  "La temperatura del husillo cambia la longitud efectiva del conjunto y eso altera cotas en mecanizados largos.",
  "Por eso algunas maquinas calientan el husillo antes de piezas criticas: buscan estabilidad termica, no velocidad.",
  "Una herramienta de desbaste puede soportar mayor carga, pero una evacuacion pobre de viruta termina dañandola antes.",
  "La viruta recortada varias veces actua como abrasivo y empeora tanto el filo como la superficie mecanizada.",
  "En aluminio, la adherencia al filo suele deberse mas a parametros y lubricacion que a la dureza del material.",
  "En acero inoxidable, mantener el filo cortando evita el endurecimiento por deformacion superficial.",
  "Las reglas opticas dan lectura muy precisa, pero necesitan buena proteccion frente a niebla de aceite y polvo fino.",
  "Un sistema de medicion directa en regla puede compensar errores del tornillo, pero no corrige flexiones estructurales.",
  "La puesta a tierra en una CNC no es solo electrica: tambien evita ruido que afecta variadores, encoders y sensores.",
  "Un variador con mala ventilacion puede generar alarmas termicas que parecen fallos aleatorios del eje.",
  "El gabinete electrico necesita flujo de aire estable; abrirlo sin control a veces empeora el problema por polvo y humedad.",
  "Los finales de carrera son proteccion, pero el homing fino depende del sensor de referencia y su repetibilidad.",
  "Un sensor inductivo detecta metal, pero su distancia efectiva cambia con el material y la geometria del objetivo.",
  "Los cables de encoder y potencia no deberian ir juntos demasiado tiempo; el ruido inducido degrada la lectura.",
  "El acople elastico corrige pequenas desalineaciones, pero no compensa errores grandes sin castigar el eje.",
  "La mesa de vacio depende tanto del sellado como del area efectiva de contacto para sujetar piezas delgadas.",
  "En routers CNC, la succion de polvo protege guias y husillo tanto como mejora la visibilidad del operador.",
  "Una cremallera bien lubricada puede ser rapida y robusta, pero no iguala la fineza de un husillo de bolas en micras.",
  "Las maquinas de gran formato usan cremalleras porque recorren mas distancia con menor riesgo de pandeo del tornillo.",
  "El preajuste de herramienta fuera de maquina reduce tiempo muerto y evita usar el husillo como unico instrumento de medicion.",
  "Un rompevirutas bien elegido cambia la forma de la viruta y con eso mejora evacuacion, temperatura y seguridad.",
  "El acabado espejo no depende solo de una pasada fina: exige rigidez, herramienta sana y control de vibracion.",
  "Una alarma de sobrecarga del servo puede venir de un eje duro por contaminacion mecanica y no por error de programa.",
  "El mantenimiento preventivo en CNC tiene mucho de metrologia: medir desvio a tiempo evita reparaciones costosas.",
  "Una maquina CNC puede parecer perfectamente funcional y aun asi estar perdiendo precision por deriva termica acumulada.",
  "La repetibilidad alta no garantiza exactitud absoluta; una maquina puede equivocarse siempre en el mismo valor.",
  "Los ejes rotativos agregan complejidad porque cualquier juego angular se amplifica lejos del centro de giro.",
  "En 5 ejes, una pequena desviacion de pivote cambia trayectorias enteras aunque los ejes lineales esten calibrados.",
  "El postprocesador no inventa precision; solo traduce estrategia CAM a la cinematica real de la maquina.",
  "Una estrategia CAM excelente puede fallar si el control no filtra bien esquinas o no anticipa aceleraciones.",
  "La rigidez de amarre de la pieza importa tanto como la rigidez de la maquina en trabajos de precision.",
  "En piezas delgadas, a veces el mayor error no lo produce la herramienta sino la deformacion durante la sujecion.",
  "Las mordazas paralelas pueden marcar menos, pero una mordaza escalonada bien usada mejora apoyo y repetibilidad.",
  "El control de desgaste de herramienta evita piezas fuera de tolerancia antes de que el filo llegue a falla total.",
  "La compensacion de radio en torno permite corregir geometria de punta sin reescribir el contorno completo.",
  "En fresado trocoidal, la carga radial baja ayuda a la vida de herramienta, pero exige una maquina con buena dinamica.",
  "Una CNC bien afinada suena uniforme; cambios de sonido suelen anticipar problemas de corte, amarre o rodamiento.",
  "Las vibraciones que casi no se ven en la pieza a veces ya estan castigando spindle, portaherramienta y filos.",
  "La limpieza del cono y del tirante en cada cambio de herramienta tiene impacto real en repetibilidad axial.",
  "En mecanizado de alta velocidad, la calidad del balanceo del conjunto herramienta-porta influye mas de lo que parece.",
  "Una sonda rota suele deberse menos al palpado y mas a referencias mal gestionadas o offsets cruzados.",
  "El mejor indicador de salud de una CNC no es solo que corte: es que repita, mida y mantenga temperatura estable."
];

const WINDOWS_PATH_REGEX = /[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*/g;

initializeThemeToggle();
initializeRibbon();
initializeBrandLogo();
loadAppVersion();
initializeQuickPanel();
initializeQuickDrawer();
initializeParticipantAnimation();
initializeGlobalShortcuts();
syncCollaborationControls();

function initializeThemeToggle() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  state.manualTheme = savedTheme === "dark" ? "dark" : "default";
  syncTheme();

  themeToggle?.addEventListener("click", () => {
    state.manualTheme = state.manualTheme === "dark" ? "default" : "dark";
    syncTheme();
    persistManualTheme();
  });
}

function persistManualTheme() {
  if (state.manualTheme === "dark") {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
  } else {
    localStorage.removeItem(THEME_STORAGE_KEY);
  }
}

function isSteysiProfile(profile) {
  const tokens = collectProfileIdentityTokens(profile);
  return tokens.some(
    (normalized) => normalized
      && (normalized.includes("steysi")
        || normalized.includes("steyci")
        || normalized.includes("steisy")
        || normalized.includes("steicy"))
  );
}

function syncTheme() {
  const effectiveTheme = isSteysiProfile(state.participantProfile) || state.forcedProfileTheme === "rose"
    ? "rose"
    : state.manualTheme;
  const isRose = effectiveTheme === "rose";
  const isDark = effectiveTheme === "dark";
  document.body.classList.toggle("theme-rose", isRose);
  document.body.classList.toggle("theme-dark", isDark);

  if (themeToggle) {
    const darkSelected = state.manualTheme === "dark";
    themeToggle.classList.toggle("is-active", darkSelected);
    themeToggle.setAttribute("aria-pressed", darkSelected ? "true" : "false");
    themeToggle.textContent = darkSelected ? "Tema claro" : "Tema oscuro";
    if (isRose) {
      themeToggle.setAttribute("title", "Tema rosa activado automaticamente para Steysi");
    } else {
      themeToggle.setAttribute("title", darkSelected ? "Volver al tema claro" : "Activar tema oscuro");
    }
  }
}

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
    emptyStatus: "Sin sesión activa",
    readyStatus: "Panel rapido listo",
    saveSuccessText: "Panel rapido guardado",
    applyingText: "Aplicando datos del panel al reporte...",
    applySuccessText: "Panel aplicado al reporte",
    fields: [],
    actions: [],
  };
}

function isGroupCollaborationFormat(formatDefinition = null) {
  const definition = formatDefinition
    || (state.session?.reportFormat?.id ? getFormatDefinitionById(state.session.reportFormat.id) : null)
    || getCurrentFormatDefinition();
  return GROUP_COLLABORATION_FORMAT_IDS.has(String(definition?.id || "").trim());
}

function setCollaborationPanelOpen(isOpen) {
  collaborationPanelOpen = Boolean(isOpen);

  if (collaborationShell) {
    collaborationShell.classList.toggle("is-open", collaborationPanelOpen);
  }

  if (collaborationPanel) {
    collaborationPanel.hidden = !collaborationPanelOpen;
  }

  if (collaborationToggle) {
    collaborationToggle.setAttribute("aria-expanded", collaborationPanelOpen ? "true" : "false");
  }

  if (collaborationToggleHint) {
    collaborationToggleHint.textContent = collaborationPanelOpen
      ? "Ocultar opciones de colaboracion"
      : "Mostrar opciones de colaboracion";
  }
}

function getThinkingFactDuration(fact) {
  const length = String(fact || "").trim().length;
  if (length <= 90) {
    return 8000;
  }
  if (length <= 140) {
    return 10000;
  }
  if (length <= 190) {
    return 12000;
  }
  return 15000;
}

function refillThinkingFactQueue() {
  thinkingFactQueue = [...CNC_TECH_CURIOUS_FACTS]
    .map((fact, index) => ({ fact, sort: Math.random(), index }))
    .sort((left, right) => left.sort - right.sort || left.index - right.index)
    .map((entry) => entry.fact);
  thinkingFactIndex = 0;
}

function stopThinkingFacts() {
  if (thinkingFactTimer) {
    clearTimeout(thinkingFactTimer);
    thinkingFactTimer = null;
  }
  if (thinkingFactBar) {
    thinkingFactBar.hidden = true;
  }
  if (thinkingFactText) {
    thinkingFactText.textContent = "";
  }
}

function showNextThinkingFact() {
  if (!thinkingFactText || !thinkingFactBar) {
    return;
  }

  if (botThinking?.hidden) {
    stopThinkingFacts();
    return;
  }

  if (!thinkingFactQueue.length || thinkingFactIndex >= thinkingFactQueue.length) {
    refillThinkingFactQueue();
  }

  const fact = thinkingFactQueue[thinkingFactIndex] || CNC_TECH_CURIOUS_FACTS[0] || "";
  thinkingFactIndex += 1;
  thinkingFactBar.hidden = false;
  thinkingFactText.textContent = fact;
  thinkingFactTimer = setTimeout(showNextThinkingFact, getThinkingFactDuration(fact));
}

function startThinkingFacts() {
  stopThinkingFacts();
  showNextThinkingFact();
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

function setCollaborationStatus(text, isError = false) {
  if (!collaborationStatus) {
    return;
  }
  collaborationStatus.textContent = text;
  collaborationStatus.classList.toggle("error", Boolean(isError));
}

function formatRecentProjectsText(projects = []) {
  if (!projects.length) {
    return "No hay proyectos anteriores registrados para tu perfil en este formato.";
  }

  const rows = projects.slice(0, 8).map((project, index) => {
    const savedAt = project.savedAt
      ? new Date(project.savedAt).toLocaleString()
      : "fecha no disponible";
    return `${index + 1}. ${project.sessionName || project.projectId} | ID: ${project.projectId} | ${savedAt}`;
  });

  return rows.join("\n");
}

async function loadRecentProjectsByParticipant(participantName, options = {}) {
  const normalizedName = String(participantName || "").trim();
  if (!normalizedName) {
    state.recentProjects = [];
    return [];
  }

  state.lastRecentProjectsParticipantName = normalizedName.toLowerCase();
  const formatId = String(state.selectedFormatId || state.session?.reportFormat?.id || "").trim();
  const query = new URLSearchParams({ participantName: normalizedName, limit: "8" });
  if (formatId) {
    query.set("formatId", formatId);
  }

  try {
    const response = await fetch(buildApiUrl(`/shared-projects/recent-by-participant?${query.toString()}`), {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo cargar historial de proyectos.");
    }

    state.recentProjects = Array.isArray(data.projects) ? data.projects : [];
    return state.recentProjects;
  } catch {
    state.recentProjects = [];
    if (!options.silent) {
      appendMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        text: "No pude recuperar tus proyectos anteriores en este momento.",
      });
    }
    return [];
  }
}

function parseProjectOpenCommand(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    return null;
  }

  const commandMatch = text.match(/^(abre|abrir|cargar|carga)\s+(.+)$/i);
  if (!commandMatch) {
    return null;
  }

  const selector = String(commandMatch[2] || "").trim();
  if (!selector) {
    return null;
  }

  if (/^[A-Z]{3}-[A-Z0-9]{6,20}$/i.test(selector)) {
    return { type: "id", value: selector.toUpperCase() };
  }

  if (/^\d{1,2}$/.test(selector)) {
    return { type: "index", value: Number(selector) };
  }

  return { type: "name", value: selector };
}

function resolveProjectFromCommand(command) {
  if (!command) {
    return null;
  }

  if (command.type === "id") {
    return state.recentProjects.find((item) => String(item.projectId || "").toUpperCase() === command.value) || null;
  }

  if (command.type === "index") {
    return state.recentProjects[command.value - 1] || null;
  }

  const needle = String(command.value || "").toLowerCase();
  const candidates = state.recentProjects.filter((item) => String(item.sessionName || "").toLowerCase().includes(needle));
  if (candidates.length === 1) {
    return candidates[0];
  }
  return null;
}

async function tryHandleProjectOpenCommand(rawMessage) {
  const command = parseProjectOpenCommand(rawMessage);
  if (!command) {
    return false;
  }

  if (!isGroupCollaborationFormat()) {
    appendMessage({
      id: crypto.randomUUID(),
      role: "assistant",
      text: "La orden de apertura rapida solo esta activa en formatos de trabajo en grupo.",
    });
    return true;
  }

  if (!state.participantProfile?.name) {
    appendMessage({
      id: crypto.randomUUID(),
      role: "assistant",
      text: "Primero debo identificarte para recuperar tus proyectos anteriores. Responde 'quien soy' o indica tu nombre completo.",
    });
    return true;
  }

  if (!state.recentProjects.length) {
    await loadRecentProjectsByParticipant(state.participantProfile.name, { silent: true });
  }

  const selectedProject = resolveProjectFromCommand(command);
  if (!selectedProject) {
    appendMessage({
      id: crypto.randomUUID(),
      role: "assistant",
      text: `No encontre ese proyecto. Estos son tus proyectos recientes:\n${formatRecentProjectsText(state.recentProjects)}\n\nPuedes escribir: abre 1 o abre ID.`,
    });
    return true;
  }

  appendMessage({
    id: crypto.randomUUID(),
    role: "assistant",
    text: `Abriendo proyecto ${selectedProject.projectId}...`,
  });
  await loadSharedProjectById(selectedProject.projectId || "");
  return true;
}

function syncCollaborationControls() {
  if (!collaborationPanel || !collaborationShell) {
    return;
  }

  const collaborationEnabled = isGroupCollaborationFormat();
  collaborationShell.hidden = !collaborationEnabled;
  if (!collaborationEnabled) {
    setCollaborationPanelOpen(false);
    state.recentProjects = [];
    return;
  }

  setCollaborationPanelOpen(collaborationPanelOpen);

  const sharedProjectId = String(state.session?.sharedProject?.id || "").trim();
  if (sharedProjectIdInput) {
    sharedProjectIdInput.value = sharedProjectId;
  }

  if (copySharedProjectIdButton) {
    copySharedProjectIdButton.disabled = !sharedProjectId;
  }
  if (loadSharedProjectButton) {
    loadSharedProjectButton.disabled = false;
  }

  if (sharedProjectId) {
    setCollaborationStatus(`ID listo para compartir: ${sharedProjectId}`);
    return;
  }

  if (state.session) {
    setCollaborationStatus("Este proyecto se sincronizara y mostrara su ID compartido al crear la sesion.");
    return;
  }

  setCollaborationStatus("Crea un proyecto nuevo o carga uno por ID. Ambas PCs deben usar este mismo backend.");
}

function hasVisibleHistory(snapshot) {
  return Array.isArray(snapshot?.history)
    && snapshot.history.some((event) => event?.type === "chat-message" || event?.type === "turn-complete");
}

async function activateSessionSnapshot(snapshot, options = {}) {
  hydrateSessionState(snapshot);
  state.assistantNodes.clear();
  stateRequestedImages.clear();
  pdfLoadedOnce = false;
  state.lastAssistantMessageId = null;
  state.userMessageCount = 0;
  messages.innerHTML = "";
  setReportProgress(snapshot?.reportProgress || { percent: 0, status: "en_proceso" });
  clearPdfViewer("Cargando PDF inicial del proyecto...");
  renderUploadedFiles(snapshot?.uploadedFiles || []);
  renderRequestedImages();
  renderMeta(snapshot);
  restoreHistory(snapshot?.history || []);
  renderRequestedImages();

  if (options.showOpeningQuestion !== false && !hasVisibleHistory(snapshot) && snapshot?.openingQuestion) {
    appendMessage({
      id: crypto.randomUUID(),
      role: "assistant",
      text: snapshot.openingQuestion,
    });
  }

  connectEvents(snapshot.id);
  chatInput.disabled = false;
  sendButton.disabled = false;
  compileButton.disabled = false;
  syncImagesButton.disabled = false;
  setPdfViewButtonEnabled(true);
  try {
    await loadInitialPdfViewer();
  } catch {
    clearPdfViewer("El PDF inicial no estuvo disponible todavia");
  }
  chatInput.focus();
  setStatus(options.statusText || "Proyecto listo");
  setThinking(false);
  if (!pdfLoadedOnce) {
    pdfStatus.textContent = "El PDF inicial no estuvo disponible todavia";
  }
  await loadRecentProjectsByParticipant(state.participantProfile?.name || "", { silent: true });
}

async function loadSharedProjectById(projectId, options = {}) {
  const normalizedProjectId = String(projectId || "").trim().toUpperCase();
  if (!normalizedProjectId) {
    setCollaborationStatus("Escribe primero un ID de proyecto.", true);
    return;
  }

  if (state.session && options.skipWarning !== true) {
    const confirmed = window.confirm(
      "Advertencia: si cargas otro proyecto, la sesion actual en esta pagina se reemplazara. Guarda el ID del proyecto actual antes de continuar.\n\n¿Deseas cargar el proyecto solicitado?"
    );
    if (!confirmed) {
      setCollaborationStatus("Carga cancelada para conservar el proyecto actual.");
      return;
    }
  }

  setStatus("Cargando proyecto grupal...");
  setCollaborationStatus(`Buscando ${normalizedProjectId}...`);

  try {
    const response = await fetch(buildApiUrl("/sessions/load-shared"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: normalizedProjectId,
        openInVsCode: true,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo cargar el proyecto compartido.");
    }

    await activateSessionSnapshot(data, {
      statusText: "Proyecto grupal cargado",
      showOpeningQuestion: !hasVisibleHistory(data),
    });
    setCollaborationStatus(`Proyecto ${normalizedProjectId} cargado en esta PC.`);
    await loadRecentProjectsByParticipant(state.participantProfile?.name || "", { silent: true });
  } catch (error) {
    setStatus("No se pudo cargar el proyecto grupal.", true);
    setCollaborationStatus(error.message || "No se pudo cargar el proyecto compartido.", true);
    setThinking(false);
  } finally {
    syncCollaborationControls();
  }
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

    await activateSessionSnapshot(data, {
      statusText: "Proyecto listo",
      showOpeningQuestion: true,
    });
  } catch (error) {
    setStatus("No se pudo crear el proyecto.", true);
    setThinking(false);
  }
});

copySharedProjectIdButton?.addEventListener("click", async () => {
  const sharedProjectId = String(state.session?.sharedProject?.id || "").trim();
  if (!sharedProjectId) {
    setCollaborationStatus("Este proyecto todavia no tiene un ID disponible.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(sharedProjectId);
    setCollaborationStatus(`ID copiado: ${sharedProjectId}`);
  } catch {
    if (sharedProjectIdInput) {
      sharedProjectIdInput.focus();
      sharedProjectIdInput.select();
    }
    setCollaborationStatus(`Copia manualmente este ID: ${sharedProjectId}`);
  }
});

loadSharedProjectIdInput?.addEventListener("input", () => {
  syncCollaborationControls();
});

collaborationToggle?.addEventListener("click", () => {
  setCollaborationPanelOpen(!collaborationPanelOpen);
});

loadSharedProjectButton?.addEventListener("click", async () => {
  loadSharedProjectButton.disabled = false;
  await loadSharedProjectById(loadSharedProjectIdInput?.value || "");
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

uploadWordSourceInput?.addEventListener("change", async () => {
  if (!state.session || uploadWordSourceInput.files.length === 0) {
    return;
  }

  const file = uploadWordSourceInput.files[0];
  if (!isWordSourceFileLike(file)) {
    setUploadStatus("Sube un archivo Word .doc o .docx.", true);
    uploadWordSourceInput.value = "";
    return;
  }

  setUploadStatus(`Subiendo y analizando ${file.name}...`);
  showUploadOverlay("Analizando Word", 0, file.name);
  setWordSourceEnabled(false);
  chatInput.disabled = true;
  sendButton.disabled = true;
  compileButton.disabled = true;
  syncImagesButton.disabled = true;
  state.activeMode = "word-source-analysis";
  setThinking(true, "leyendo Word");

  try {
    const uploadData = await uploadBinaryWithProgress({
      url: buildApiUrl(`/sessions/${state.session.id}/upload?name=${encodeURIComponent(file.name)}`),
      file,
      onProgress: ({ loaded, total, speedBytesPerSecond }) => {
        const filePercent = total > 0 ? (loaded / total) * 100 : 0;
        const percent = Math.min(filePercent * 0.7, 70);
        showUploadOverlay(
          "Analizando Word",
          percent,
          `${file.name} - ${formatUploadProgress(loaded, total, speedBytesPerSecond)}`
        );
        setUploadStatus(`${file.name} - ${formatUploadProgress(loaded, total, speedBytesPerSecond)}`);
      },
    });

    addUploadedFile(withLocalPreview(uploadData.fileInfo, file));
    showUploadOverlay("Analizando Word", 78, "Extrayendo texto y contrastando con el reporte");

    const response = await fetch(buildApiUrl(`/sessions/${state.session.id}/analyze-word-source`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: uploadData.fileInfo?.name || uploadData.fileName || file.name,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo analizar el Word.");
    }

    applyAssistantFallback(data.result);
    const visible = extractPageResponse(data.result?.assistantText || "").text || "Word analizado y contrastado con el reporte";
    setUploadStatus(visible);
    completeUploadOverlay("Word analizado", file.name);
  } catch (error) {
    setUploadStatus(error.message || "No se pudo analizar el Word.", true);
    failUploadOverlay("Analisis interrumpido", error.message || "No se pudo analizar el Word.");
    chatInput.disabled = false;
    sendButton.disabled = false;
    compileButton.disabled = false;
    syncImagesButton.disabled = false;
    state.activeMode = null;
    setThinking(false);
  } finally {
    uploadWordSourceInput.value = "";
    setWordSourceEnabled(Boolean(state.session));
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

uploadWordSourceTrigger?.addEventListener("click", () => {
  if (uploadWordSourceTrigger.disabled || !state.session) {
    return;
  }
  openFilePicker(uploadWordSourceInput);
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
      setStatus("Procesando");
    } else {
      setStatus("Sesión lista");
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
      setStatus("Reconectando la sesión en tiempo real...");
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

uploadDriveButton?.addEventListener("click", async () => {
  if (state.activeMode === "drive-upload") {
    return;
  }

  if (!state.session) {
    setExperimentalStatus("Primero crea una sesión antes de subir a Drive.", true);
    setStatus("No hay sesión activa.", true);
    return;
  }

  uploadDriveButton.disabled = true;
  uploadDriveButton.classList.add("disabled");
  uploadDriveButton.setAttribute("aria-disabled", "true");
  downloadZipLink.classList.add("disabled");
  downloadZipLink.setAttribute("aria-disabled", "true");
  compileButton.disabled = true;
  setPdfViewButtonEnabled(false);
  syncImagesButton.disabled = true;
  chatInput.disabled = true;
  sendButton.disabled = true;
  state.activeMode = "drive-upload";
  setStatus("Compilando y subiendo a Drive...");
  pdfStatus.textContent = "Compilando y copiando el ZIP a la carpeta asignada...";
  setThinking(true, "subiendo a drive");
  showDownloadOverlay("Subiendo a Drive", 18, "Preparando el proyecto...");

  try {
    const response = await fetch(buildApiUrl(`/sessions/${state.session.id}/upload-drive`), {
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "No se pudo subir el proyecto a Drive.");
    }

    const result = data.result || {};
    showDownloadOverlay("Subido a Drive", 100, result.participantFolderName || "Proyecto entregado en la carpeta asignada");
    pdfStatus.textContent = result.targetPath
      ? `Proyecto subido a Drive en: ${result.targetPath}`
      : "Proyecto subido a Drive.";
    setStatus("Proyecto subido a Drive");
  } catch (error) {
    pdfStatus.textContent = error.message || "No se pudo subir el proyecto a Drive.";
    setExperimentalStatus(error.message || "No se pudo subir el proyecto a Drive.", true);
    setStatus("No se pudo subir a Drive.", true);
    hideDownloadOverlay();
  } finally {
    uploadDriveButton.disabled = false;
    uploadDriveButton.classList.remove("disabled");
    uploadDriveButton.setAttribute("aria-disabled", "false");
    downloadZipLink.classList.remove("disabled");
    downloadZipLink.setAttribute("aria-disabled", "false");
    compileButton.disabled = false;
    setPdfViewButtonEnabled(Boolean(state.session));
    syncImagesButton.disabled = false;
    chatInput.disabled = false;
    sendButton.disabled = false;
    state.activeMode = null;
    setThinking(false);
    setTimeout(() => hideDownloadOverlay(), 900);
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
      setStatus("Sesión lista");
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
        if (state.activeMode === "compile" || state.activeMode === "download" || state.activeMode === "sync-images" || state.activeMode === "drive-upload") {
          break;
        }
      } else {
        appendMessage(event.payload);
      }
      break;
    case "assistant-delta":
      if (!event.payload.internal && state.activeMode !== "compile" && state.activeMode !== "download" && state.activeMode !== "sync-images" && state.activeMode !== "drive-upload") {
        updateAssistantMessage(event.payload);
      }
      break;
    case "assistant-complete":
      if (!event.payload.internal && state.activeMode !== "compile" && state.activeMode !== "download" && state.activeMode !== "sync-images" && state.activeMode !== "drive-upload") {
        setThinking(true, "pensando");
      }
      break;
    case "turn-complete":
      if (event.payload?.internal) {
        break;
      }
      if (state.activeMode !== "compile" && state.activeMode !== "download" && state.activeMode !== "sync-images" && state.activeMode !== "drive-upload") {
        if (event.payload?.assistantText) {
          updateAssistantMessage(
            {
              id: event.payload.assistantItemId || event.payload.turnId || crypto.randomUUID(),
              text: event.payload.assistantText,
            },
            true
          );
          collectRequestedImages(event.payload.assistantText || "");
          collectAssistantSignals(event.payload.assistantText || "");
        }
      }
      chatInput.disabled = false;
      sendButton.disabled = false;
      compileButton.disabled = false;
      syncImagesButton.disabled = false;
      setWordSourceEnabled(Boolean(state.session));
      if (uploadDriveButton) {
        uploadDriveButton.disabled = false;
        uploadDriveButton.classList.remove("disabled");
        uploadDriveButton.setAttribute("aria-disabled", "false");
      }
      chatInput.focus();
      setStatus("Listo");
      state.activeMode = null;
      setThinking(false);
      break;
    case "status":
      if (state.activeMode === "compile" || state.activeMode === "download" || state.activeMode === "drive-upload") {
        setStatus("Compilando...");
        setThinking(event.payload.status === "running" || event.payload.status === "active", "compilando");
      } else if (state.activeMode === "chat") {
        setStatus(event.payload.status === "running" || event.payload.status === "active" ? "Procesando" : "Listo");
        setThinking(event.payload.status === "running" || event.payload.status === "active", "pensando");
      } else {
        setStatus(event.payload.status === "running" ? "Procesando" : "Listo");
        setThinking(event.payload.status === "running" || event.payload.status === "active");
      }
      break;
    case "session-error":
      chatInput.disabled = false;
      sendButton.disabled = false;
      compileButton.disabled = false;
      syncImagesButton.disabled = false;
      setWordSourceEnabled(Boolean(state.session));
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
    lastMessage.dataset.renderedText === sanitizedText
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
  collectAssistantSignals(result.assistantText);
  chatInput.disabled = false;
  sendButton.disabled = false;
  compileButton.disabled = false;
  syncImagesButton.disabled = false;
  setWordSourceEnabled(Boolean(state.session));
  state.activeMode = null;
  setThinking(false);
  setStatus("Listo");
}

function setWordSourceEnabled(enabled) {
  if (!uploadWordSourceTrigger || !uploadWordSourceInput) {
    return;
  }

  uploadWordSourceTrigger.disabled = !enabled;
  uploadWordSourceInput.disabled = !enabled;
  uploadWordSourceTrigger.classList.toggle("disabled", !enabled);
  uploadWordSourceTrigger.setAttribute("aria-disabled", enabled ? "false" : "true");
}

function isWordSourceFileLike(file) {
  const fileName = typeof file === "string" ? file : file?.name;
  return WORD_SOURCE_EXTENSION_REGEX.test(String(fileName || ""));
}

async function submitChatMessage(rawMessage) {
  if (!state.session) {
    return;
  }

  const message = String(rawMessage || "").trim();
  if (!message) {
    return;
  }

  if (await tryHandleProjectOpenCommand(message)) {
    chatInput.value = "";
    chatInput.focus();
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
  setStatus("Procesando");
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
    article.dataset.renderedText = message.text || "";
    renderMessageMath(textNode);
    const existingQuickReplies = article.querySelector(".quick-replies");
    if (existingQuickReplies) {
      existingQuickReplies.remove();
    }
    return;
  }

  const parsedContent = parseAssistantDisplayContent(message.text || "");
  textNode.textContent = parsedContent.text;
  article.dataset.renderedText = parsedContent.text;
  renderMessageMath(textNode);

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
  state.participantProfile = session.participantProfile || null;
  if (isSteysiProfile(state.participantProfile)) {
    state.forcedProfileTheme = "rose";
  } else if (state.participantProfile) {
    state.forcedProfileTheme = "";
  }
  state.quickFields = buildNormalizedQuickFields(session.quickFields || state.quickFields || {}, getCurrentFormatDefinition());
  state.reportProgress = session.reportProgress || state.reportProgress;
  state.selectedFormatId = session.reportFormat?.id || state.selectedFormatId;
  syncTheme();
  maybeTriggerRubenAnimationFromProfile();
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
    `<strong>Proyecto:</strong> ${escapeHtml(session.name || "Sesión activa")}`,
    `<strong>Formato:</strong> ${escapeHtml(reportFormat)}`,
  ];

  if (session.sharedProject?.id) {
    metaLines.push(`<strong>ID grupal:</strong> ${escapeHtml(session.sharedProject.id)}`);
  }

  if (session.reportFormat?.usesParticipantProfiles) {
    metaLines.push(`<strong>Participante:</strong> ${escapeHtml(participantName)}`);
    metaLines.push(`<strong>Area:</strong> ${escapeHtml(participantArea)}`);
  }

  metaLines.push(`<strong>Resumen rapido:</strong> ${escapeHtml(quickSummary)}`);
  sessionMeta.innerHTML = metaLines.join("<br />");
  renderReportProgressAudit(state.reportProgress, getCurrentFormatDefinition());
  downloadZipLink.href = buildApiUrl(`/sessions/${session.id}/download`);
  downloadZipLink.classList.remove("disabled");
  downloadZipLink.setAttribute("aria-disabled", "false");
  if (uploadDriveButton) {
    uploadDriveButton.disabled = false;
    uploadDriveButton.classList.remove("disabled");
    uploadDriveButton.setAttribute("aria-disabled", "false");
  }
  uploadInput.disabled = false;
  uploadTrigger.disabled = false;
  uploadTrigger.classList.remove("disabled");
  uploadTrigger.setAttribute("aria-disabled", "false");
  setWordSourceEnabled(true);
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

  const participantKey = String(state.participantProfile?.name || "").trim().toLowerCase();
  if (participantKey && participantKey !== state.lastRecentProjectsParticipantName) {
    loadRecentProjectsByParticipant(state.participantProfile.name, { silent: true });
  }

  syncCollaborationControls();
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

function normalizeMathMarkup(value) {
  return String(value || "")
    .replace(/```(?:katex|latex|tex)\s*\r?\n([\s\S]*?)```/gi, (_match, expression) => `\n$$\n${String(expression || "").trim()}\n$$\n`)
    .replace(/\\\$/g, "$")
    .replace(/\\\[/g, "\\[")
    .replace(/\\\]/g, "\\]")
    .replace(/\\\(/g, "\\(")
    .replace(/\\\)/g, "\\)");
}

function renderMessageMath(textNode) {
  if (!textNode || typeof window.renderMathInElement !== "function") {
    return;
  }

  window.renderMathInElement(textNode, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "\\[", right: "\\]", display: true },
      { left: "$", right: "$", display: false },
      { left: "\\(", right: "\\)", display: false },
    ],
    throwOnError: false,
    strict: "ignore",
  });
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
  if (!botThinking) {
    return;
  }

  const shouldShowChatThinking = Boolean(isThinking) && String(label || "pensando").trim().toLowerCase() === "pensando";
  botThinking.hidden = !shouldShowChatThinking;
  botThinking.setAttribute("aria-label", shouldShowChatThinking ? "Procesando respuesta" : "Procesando respuesta");

  if (shouldShowChatThinking) {
    startThinkingFacts();
    return;
  }

  stopThinkingFacts();
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
  if (snapshot?.id && snapshot.id !== state.session?.id) {
    state.rubenAnimationShownForSessionId = "";
    state.forcedProfileTheme = "";
  }
  state.session = snapshot;
  state.selectedFormatId = snapshot?.reportFormat?.id || state.selectedFormatId;
  state.participantProfile = snapshot?.participantProfile || null;
  if (isSteysiProfile(state.participantProfile)) {
    state.forcedProfileTheme = "rose";
  } else if (state.participantProfile) {
    state.forcedProfileTheme = "";
  }
  state.quickFields = buildNormalizedQuickFields(snapshot?.quickFields || state.quickFields || {}, getCurrentFormatDefinition());
  state.reportProgress = snapshot?.reportProgress || state.reportProgress;
  state.uploadedFiles = Array.isArray(snapshot?.uploadedFiles) ? [...snapshot.uploadedFiles] : [];
  syncTheme();
  maybeTriggerRubenAnimationFromProfile();
  renderQuickPanel(state.quickFields, getCurrentFormatDefinition());
  syncCollaborationControls();
}

function initializeParticipantAnimation() {
  if (participantAnimationOverlay) {
    participantAnimationOverlay.hidden = true;
    participantAnimationOverlay.setAttribute("aria-hidden", "true");
  }
  if (!participantAnimationVideo) {
    return;
  }
  participantAnimationVideo.muted = true;
  participantAnimationVideo.defaultMuted = true;
  participantAnimationVideo.playsInline = true;
  participantAnimationVideo.load();
  participantAnimationVideo.pause();
  participantAnimationVideo.addEventListener("ended", hideParticipantAnimation);
}

function initializeGlobalShortcuts() {
  document.addEventListener("keydown", (event) => {
    const isShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey;
    if (!isShortcut) {
      return;
    }

    if (String(event.key || "").toLowerCase() !== "p") {
      return;
    }

    event.preventDefault();
    showParticipantAnimation("transparent");
  });
}

function setParticipantAnimationPlaybackMode(mode = "auto") {
  if (!participantAnimationVideo || !participantAnimationMp4Source || !participantAnimationWebmSource) {
    return;
  }

  if (mode === "transparent") {
    participantAnimationVideo.prepend(participantAnimationWebmSource);
    participantAnimationVideo.append(participantAnimationMp4Source);
    return;
  }

  participantAnimationVideo.poster = "";
  participantAnimationVideo.prepend(participantAnimationMp4Source);
  participantAnimationVideo.append(participantAnimationWebmSource);
}

function normalizeIdentityToken(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function collectProfileIdentityTokens(profile) {
  const candidates = [
    profile?.name,
    profile?.fullName,
    profile?.displayName,
    ...(Array.isArray(profile?.aliases) ? profile.aliases : []),
    ...(Array.isArray(profile?.apodos) ? profile.apodos : []),
  ];

  return candidates
    .map((value) => normalizeIdentityToken(value))
    .filter(Boolean);
}

function isRubenPinasProfile(profile) {
  const tokens = collectProfileIdentityTokens(profile);
  return tokens.some((normalized) => {
    if (!normalized) {
      return false;
    }
    if (normalized.includes("ruben pinas rafael")) {
      return true;
    }
    if (normalized.includes("pineapple")) {
      return true;
    }
    if (normalized === "pinas" || normalized === "pina") {
      return true;
    }
    return normalized.includes("ruben") && normalized.includes("pinas");
  });
}

function textContainsRubenFullName(value) {
  const rawText = String(value || "");
  const normalized = normalizeIdentityToken(rawText);
  if (!normalized) {
    return false;
  }

  return /\brub[eé]n\s+pi(?:ñ|n)as(?:\s+rafael)?\b/iu.test(rawText)
    || normalized.includes("ruben pinas rafael")
    || normalized.includes("ruben pinas");
}

function textMentionsRubenPinas(value) {
  const normalized = normalizeIdentityToken(value);
  if (!normalized) {
    return false;
  }

  const directPatterns = [
    "ruben pinas rafael",
    "ruben pinas",
    "ruben pina",
    "sr pinas",
    "senor pinas",
    "senor pina",
    "pineapple",
  ];

  const identityCues = [
    "participante identificado",
    "autor identificado",
    "autor del reporte",
    "autor es",
    "el autor es",
    "la autora es",
    "he identificado a",
    "identifique a",
    "identificado como",
    "corresponde a",
    "ya te tengo identificado",
    "te tengo identificado",
    "ya quedo identificado",
    "ya quedaste identificado",
    "quedo identificado",
    "quedaste identificado",
    "ya esta identificado",
    "ya esta identificado en el reporte",
    "ya te deje identificado",
    "ya te deje tu area",
  ];

  const sentences = normalized
    .split(/[\n\r.!?;:]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return sentences.some((sentence) => {
    const hasIdentityCue = identityCues.some((cue) => sentence.includes(cue));
    if (!hasIdentityCue) {
      return false;
    }

    if (directPatterns.some((pattern) => sentence.includes(pattern))) {
      return true;
    }

    if (/(^| )pinas($| )/.test(sentence) || /(^| )pina($| )/.test(sentence)) {
      return true;
    }

    return sentence.includes("ruben") && sentence.includes("pinas");
  });
}

function textMentionsSteyciIdentification(value) {
  const rawText = String(value || "");
  const normalized = normalizeIdentityToken(rawText);
  if (!normalized) {
    return false;
  }

  const identityCues = [
    "perfecto",
    "participante identificado",
    "identificado como",
    "ya te identifique",
    "ya te tengo identificado",
    "te tengo identificado",
    "quedaste identificado",
    "ya esta identificado",
    "corresponde a",
    "eres",
    "tu reporte",
    "auditoria",
    "auditor",
    "para construir bien tu reporte",
    "para reconstruir bien tu reporte",
  ];

  const mentionsSteyci = /steyci|steysi|steicy|steisy/i.test(rawText)
    || normalized.includes("steyci")
    || normalized.includes("steysi");

  return mentionsSteyci && identityCues.some((cue) => normalized.includes(normalizeIdentityToken(cue)));
}

function maybeActivateSteyciThemeFromText(visibleText) {
  if (!textMentionsSteyciIdentification(visibleText)) {
    return;
  }

  if (state.forcedProfileTheme !== "rose") {
    state.forcedProfileTheme = "rose";
    syncTheme();
  }
}

function maybeTriggerRubenAnimationFromProfile() {
  if (!state.session?.id) {
    return;
  }

  if (state.rubenAnimationShownForSessionId === state.session.id) {
    return;
  }

  if (!isRubenPinasProfile(state.participantProfile)) {
    return;
  }

  state.rubenAnimationShownForSessionId = state.session.id;
  showParticipantAnimation("transparent");
}

function maybeTriggerRubenAnimationFromText(visibleText) {
  if (!state.session?.id) {
    return;
  }

  if (state.rubenAnimationShownForSessionId === state.session.id) {
    return;
  }

  const normalizedVisibleText = normalizeIdentityToken(visibleText);
  const profileTokens = collectProfileIdentityTokens(state.participantProfile);
  const textMentionsIdentity = textMentionsRubenPinas(visibleText);
  const mentionsProfileToken = profileTokens.some((token) => token && normalizedVisibleText.includes(token));
  const mentionsRubenFullName = textContainsRubenFullName(visibleText);
  const looksLikeIdentificationReply = /\bidentificad[oa]|corresponde a|autor del reporte|autor es|participante identificado\b/i.test(normalizedVisibleText);
  const firstReplyAfterIdentification = isRubenPinasProfile(state.participantProfile)
    && (mentionsProfileToken || mentionsRubenFullName);

  if (!textMentionsIdentity && !(mentionsRubenFullName && looksLikeIdentificationReply) && !firstReplyAfterIdentification) {
    return;
  }

  state.rubenAnimationShownForSessionId = state.session.id;
  showParticipantAnimation("transparent");
}

function showParticipantAnimation(mode = "auto") {
  if (!participantAnimationOverlay || !participantAnimationVideo) {
    return;
  }

  clearTimeout(participantAnimationHideTimer);
  participantAnimationOverlay.hidden = false;
  participantAnimationOverlay.setAttribute("aria-hidden", "false");
  participantAnimationOverlay.classList.add("is-visible");
  setParticipantAnimationPlaybackMode(mode);
  participantAnimationVideo.load();
  participantAnimationVideo.currentTime = 0;
  const playAttempt = participantAnimationVideo.play();
  if (playAttempt && typeof playAttempt.catch === "function") {
    playAttempt.catch(() => {});
  }
  participantAnimationHideTimer = setTimeout(hideParticipantAnimation, 5600);
}

function hideParticipantAnimation() {
  clearTimeout(participantAnimationHideTimer);
  participantAnimationHideTimer = null;
  if (!participantAnimationOverlay || !participantAnimationVideo) {
    return;
  }
  participantAnimationOverlay.classList.remove("is-visible");
  participantAnimationOverlay.hidden = true;
  participantAnimationOverlay.setAttribute("aria-hidden", "true");
  participantAnimationVideo.pause();
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
  syncCollaborationControls();
}

reportFormatSelect?.addEventListener("change", () => {
  state.selectedFormatId = reportFormatSelect.value;
  if (!state.session) {
    state.quickFields = buildEmptyQuickFields(getCurrentFormatDefinition());
    renderQuickPanel(state.quickFields, getCurrentFormatDefinition());
    setQuickPanelStatus(getCurrentQuickPanel().readyStatus || "Panel rapido listo para el formato seleccionado");
  }
  syncCollaborationControls();
  loadRecentProjectsByParticipant(state.participantProfile?.name || "", { silent: true });
});

function setReportProgress(meta) {
  if (!reportProgressBar) {
    return;
  }

  const percentValue = Number(meta?.percent);
  const percent = Number.isFinite(percentValue) ? Math.max(0, Math.min(percentValue, 100)) : 0;
  const status = String(meta?.status || "en_proceso").toLowerCase() === "terminado"
    ? "terminado"
    : "en_proceso";
  const hue = Math.round((percent / 100) * 120);
  reportProgressBar.style.width = `${percent}%`;
  reportProgressBar.style.background = `linear-gradient(90deg, hsl(${hue} 78% 46%) 0%, hsl(${Math.min(120, hue + 10)} 72% 42%) 100%)`;
  reportProgressBar.style.opacity = percent > 0 ? "0.9" : "0.35";
  reportProgressBar.title = status === "terminado"
    ? `Informe terminado - ${Math.round(percent)}%`
    : `Avance del informe - ${Math.round(percent)}%`;

  if (!state.reportProgress || Number(state.reportProgress.percent) !== percent || String(state.reportProgress.status || "") !== status) {
    state.reportProgress = buildFallbackReportProgress({ percent, status }, getCurrentFormatDefinition());
  }

  renderReportProgressAudit(state.reportProgress, getCurrentFormatDefinition());
}

function getReportProgressStages() {
  return [
    { index: 0, min: 0, max: 9, label: "Etapa 0", title: "Arranque" },
    { index: 1, min: 10, max: 24, label: "Etapa 1", title: "Base confirmada" },
    { index: 2, min: 25, max: 44, label: "Etapa 2", title: "Panorama entendido" },
    { index: 3, min: 45, max: 64, label: "Etapa 3", title: "Desarrollo tecnico" },
    { index: 4, min: 65, max: 79, label: "Etapa 4", title: "Cuerpo casi cerrado" },
    { index: 5, min: 80, max: 89, label: "Etapa 5", title: "Cierre de contenido" },
    { index: 6, min: 90, max: 96, label: "Etapa 6", title: "Revision tecnica" },
    { index: 7, min: 97, max: 99, label: "Etapa 7", title: "Revision final integral" },
    { index: 8, min: 100, max: 100, label: "Etapa 8", title: "Listo para entrega" },
  ];
}

function getReportProgressStage(percent) {
  const clamped = Math.max(0, Math.min(Number(percent) || 0, 100));
  return getReportProgressStages().find((stage) => clamped >= stage.min && clamped <= stage.max)
    || getReportProgressStages()[0];
}

function getReportChecklistBlueprint(formatDefinition) {
  if (formatDefinition?.id === "informes-uni") {
    return [
      { key: "context", threshold: 10, label: "Portada y tema base confirmados" },
      { key: "scope", threshold: 25, label: "Objetivo y enfoque entendidos" },
      { key: "body", threshold: 45, label: "Desarrollo tecnico con sustento" },
      { key: "support", threshold: 80, label: "Datos, resultados y referencias reunidos" },
      { key: "final", threshold: 97, label: "Revision final integral" },
    ];
  }

  return [
    { key: "context", threshold: 10, label: "Identificacion y contexto base confirmados" },
    { key: "scope", threshold: 25, label: "Avance principal entendido" },
    { key: "body", threshold: 45, label: "Desarrollo tecnico con sustento" },
    { key: "support", threshold: 80, label: "Evidencia, cierre y referencias reunidas" },
    { key: "final", threshold: 97, label: "Revision final integral" },
  ];
}

function buildFallbackReportProgress(meta, formatDefinition) {
  const percent = Math.max(0, Math.min(Number(meta?.percent) || 0, 100));
  const status = String(meta?.status || "en_proceso").toLowerCase() === "terminado" ? "terminado" : "en_proceso";
  const stage = getReportProgressStage(percent);
  const checklistBlueprint = getReportChecklistBlueprint(formatDefinition);
  const firstPendingIndex = checklistBlueprint.findIndex((item) => percent < item.threshold);
  const checklist = checklistBlueprint.map((item, index) => ({
    key: item.key,
    label: item.label,
    threshold: item.threshold,
    status: percent >= item.threshold ? "done" : (firstPendingIndex === index ? "current" : "pending"),
    detail: percent >= item.threshold ? "Cumplido" : (firstPendingIndex === index ? "Es la siguiente etapa a consolidar." : "Pendiente"),
  }));

  return {
    percent,
    status,
    stageIndex: stage.index,
    stageLabel: stage.label,
    stageTitle: stage.title,
    stageRange: `${stage.min}-${stage.max}`,
    adjusted: false,
    blockers: [],
    checklist,
    summary: status === "terminado"
      ? "Informe marcado como terminado."
      : `Progreso ubicado en ${stage.label} (${stage.min}-${stage.max}).`,
  };
}

function renderReportProgressAudit(progressAudit, formatDefinition = getCurrentFormatDefinition()) {
  if (!reportProgressLabel || !reportProgressPercent || !reportProgressNote || !reportProgressChecklist) {
    return;
  }

  const audit = progressAudit || buildFallbackReportProgress({ percent: 0, status: "en_proceso" }, formatDefinition);
  const stageLabel = `${audit.stageLabel || "Etapa"} · ${audit.stageTitle || "Arranque"}`;
  reportProgressLabel.textContent = stageLabel;
  reportProgressPercent.textContent = `${Math.round(Number(audit.percent) || 0)}%`;

  const blockerText = Array.isArray(audit.blockers) && audit.blockers.length
    ? audit.blockers.map((item) => item.message || item.detail || "Bloqueo pendiente").slice(0, 2).join(". ")
    : "";
  reportProgressNote.textContent = blockerText || audit.summary || "Sin avance registrado todavia.";
  reportProgressNote.classList.toggle("is-warning", Boolean(blockerText || audit.adjusted));

  reportProgressChecklist.innerHTML = "";
  const checklist = Array.isArray(audit.checklist) && audit.checklist.length
    ? audit.checklist
    : buildFallbackReportProgress(audit, formatDefinition).checklist;

  for (const item of checklist) {
    const entry = document.createElement("li");
    entry.className = `report-progress-item is-${item.status || "pending"}`;

    const bullet = document.createElement("span");
    bullet.className = "report-progress-bullet";
    bullet.setAttribute("aria-hidden", "true");

    const content = document.createElement("div");
    content.className = "report-progress-item-content";

    const title = document.createElement("strong");
    title.textContent = item.label || "Paso";

    const detail = document.createElement("span");
    detail.className = "report-progress-item-detail";
    detail.textContent = item.detail || "Pendiente";

    content.append(title, detail);
    entry.append(bullet, content);
    reportProgressChecklist.append(entry);
  }
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
    setWordSourceEnabled(Boolean(state.session));
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

function collectAssistantSignals(rawText) {
  const visibleText = extractPageResponse(rawText).text;
  if (!visibleText) {
    return;
  }

  maybeActivateSteyciThemeFromText(visibleText);
  maybeTriggerRubenAnimationFromText(visibleText);
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
    setRequestedImageStatus("Imagen borrada de la sesión");
  } else {
    setUploadStatus("Archivo borrado de la sesión");
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

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function loadInitialPdfViewer() {
  let lastError = null;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      pdfStatus.textContent = attempt === 1
        ? "Cargando PDF inicial del proyecto..."
        : `Reintentando carga del PDF inicial (${attempt}/4)...`;
      await refreshPdfViewer(true);
      return true;
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        await delay(450);
      }
    }
  }

  throw lastError || new Error("No se pudo cargar el PDF inicial del proyecto.");
}

async function refreshPdfViewer(force = false) {
  if (!state.session) {
    clearPdfViewer("Sin sesión activa");
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
  return normalizeMathMarkup(String(value || ""))
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
