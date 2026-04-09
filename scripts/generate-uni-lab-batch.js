const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const API_ROOT = process.env.CNC_API_ROOT || "http://127.0.0.1:3221/api";
const DESKTOP_DIR = path.join(process.env.USERPROFILE || process.env.HOME || process.cwd(), "Desktop");
const OUTPUT_ROOT = process.env.CNC_OUTPUT_DIR || path.join(DESKTOP_DIR, "informes");
const PREFERRED_IMAGE_DIR = process.env.CNC_IMAGE_POOL_DIR || path.join(DESKTOP_DIR, "imagenes");
const FALLBACK_IMAGE_DIR = path.join(process.env.USERPROFILE || process.env.HOME || process.cwd(), "Pictures", "Screenshots");
const FORMAT_ID = "informes-uni";
const CASE_COUNT = Math.max(1, Number(process.env.CNC_CASE_COUNT || 18));
const MAX_TURNS = Math.max(4, Number(process.env.CNC_MAX_TURNS || 6));
const TERM = process.env.CNC_TERM || "2026-I";
const REPORT_DATE = process.env.CNC_REPORT_DATE || "09/04/2026";

const STUDENT_GROUPS = [
  "Ivan Lipay - 20261234\nPaula Rojas - 20264567",
  "Lucero Vega - 20262111\nDiego Torres - 20263220",
  "Mariana Paredes - 20264418\nJose Alarcon - 20261129",
  "Adrian Quispe - 20263304\nFiorella Ruiz - 20265518",
  "Carlos Salcedo - 20264012\nNayeli Contreras - 20261834",
  "Renzo Caceres - 20262455\nValeria Soto - 20264790"
];

const LAB_TEMPLATES = [
  {
    slug: "sensor-inductivo-conteo",
    title: "Evaluacion de sensor inductivo para conteo de piezas",
    course: "Instrumentacion Industrial",
    teacher: "Ing. Luis Quispe",
    section: "B1",
    reportType: "laboratorio",
    activityType: "prueba",
    nextStep: "analisis",
    objective: "Verificar la capacidad de un sensor inductivo para detectar y contar piezas metalicas en una secuencia de paso controlada.",
    theory: "El sensor inductivo opera mediante la perturbacion de un campo electromagnetico. La distancia de deteccion depende del material, la orientacion y la geometria del objeto, por lo que el conteo confiable exige alineacion mecanica y una separacion estable.",
    procedure: "Se conecto el sensor a 24 VDC, se ajusto la distancia de deteccion, se hizo pasar una serie de piezas metalicas una por una y se comparo el numero detectado contra el numero real en ciclos repetidos.",
    results: "En la configuracion alineada se obtuvo deteccion completa en 10 de 10 piezas. Cuando la separacion lateral aumento, aparecieron 2 fallos de deteccion en 10 ciclos.",
    observations: "La lectura fue estable mientras la guia mecanica mantuvo centrada la pieza. Los fallos aparecieron por desalineacion y no por perdida total de sensibilidad del sensor.",
    conclusion: "El sistema de conteo es funcional para condiciones controladas de laboratorio, pero requiere mejor guiado mecanico para asegurar repetibilidad en una aplicacion continua.",
    references: "Omron. (2023). Proximity sensors technical guide. https://www.omron.com/\nAutomationDirect. (2022). Inductive proximity sensor principles. https://www.automationdirect.com/"
  },
  {
    slug: "fuente-regulada-modulo-cnc",
    title: "Evaluacion de fuente regulada para modulo CNC",
    course: "Electronica de Potencia",
    teacher: "Mg. Andrea Salazar",
    section: "B2",
    reportType: "laboratorio",
    activityType: "medicion",
    nextStep: "conclusiones",
    objective: "Evaluar la estabilidad de una fuente regulada de 24 VDC destinada a alimentar un modulo de control CNC en condiciones de laboratorio.",
    theory: "Una fuente regulada debe mantener la tension dentro de un margen estrecho frente a cambios de carga. En aplicaciones de control, la estabilidad de tension reduce errores en sensores, drivers y modulos logicos.",
    procedure: "Se midio la tension de salida en vacio y bajo dos niveles de carga resistiva. Tambien se observo el incremento de temperatura y el comportamiento general de la fuente durante el ensayo.",
    results: "La fuente entrego 24.2 V en vacio, 23.8 V con carga media y 23.5 V con carga mayor de prueba. El calentamiento fue moderado y no se detectaron oscilaciones visibles.",
    observations: "La regulacion fue suficiente para el rango de laboratorio, aunque se noto una ligera caida al incrementar la carga. No se percibieron signos de saturacion ni olor de sobrecalentamiento.",
    conclusion: "La fuente es apta para pruebas del modulo CNC, pero antes de uso continuo conviene revisar el margen de corriente y la ventilacion del sistema.",
    references: "Horowitz, P., & Hill, W. (2015). The art of electronics. Cambridge University Press.\nKeysight. (2021). DC power supply fundamentals. https://www.keysight.com/"
  },
  {
    slug: "calibracion-eje-lineal",
    title: "Calibracion y prueba de desplazamiento de un eje lineal",
    course: "Control de Movimiento",
    teacher: "Ing. Roberto Sifuentes",
    section: "C1",
    reportType: "laboratorio",
    activityType: "calibracion",
    nextStep: "compilar",
    objective: "Calibrar un eje lineal accionado por motor paso a paso y verificar la repetibilidad del retorno al origen.",
    theory: "La calibracion de un eje lineal depende de la relacion entre pasos del motor, transmision mecanica y referencia de homing. La repetibilidad del origen confirma coherencia entre control y referencia mecanica.",
    procedure: "Se ejecuto homing inicial, ajuste del final de carrera y desplazamientos cortos repetidos con retorno al origen para observar repetibilidad y posibles perdidas de paso.",
    results: "Despues del ajuste del punto de activacion del final de carrera, el retorno al origen fue consistente en varias repeticiones y no se detectaron perdidas de pasos en los desplazamientos cortos.",
    observations: "La consistencia mejoro cuando se corrigio la posicion del sensor de referencia. La estructura se mantuvo estable en los recorridos usados para la practica.",
    conclusion: "La calibracion inicial fue satisfactoria y deja el eje preparado para integrar rutinas de posicionamiento mas exigentes.",
    references: "MachMotion. (2023). CNC homing and limit switch basics. https://www.machmotion.com/\nNXP. (2022). Stepper motion control overview. https://www.nxp.com/"
  },
  {
    slug: "driver-motor-paso",
    title: "Verificacion de driver para motor paso a paso",
    course: "Automatizacion Industrial",
    teacher: "Ing. Carla Mendoza",
    section: "A1",
    reportType: "laboratorio",
    activityType: "montaje",
    nextStep: "prueba",
    objective: "Comprobar el conexionado basico y la respuesta inicial de un driver para motor paso a paso.",
    theory: "La secuencia STEP-DIR gobierna la energizacion del motor paso a paso. Una conexion correcta de bobinas y una frecuencia moderada permiten validar el sentido de giro y la estabilidad inicial del sistema.",
    procedure: "Se verificaron alimentacion, continuidad, conexion de bobinas y respuesta a pulsos de prueba con cambio de direccion.",
    results: "El giro fue estable a baja frecuencia y el cambio de direccion funciono correctamente luego de corregir el orden inicial de una bobina.",
    observations: "No hubo ruido anormal ni calentamiento critico durante la prueba. La correccion del conexionado resolvio el unico inconveniente detectado.",
    conclusion: "El driver quedo validado para pruebas iniciales y el conjunto puede pasar a una etapa posterior de control mas fino.",
    references: "Texas Instruments. (2022). Stepper motor control basics. https://www.ti.com/\nAnalog Devices. (2023). Motor driver fundamentals. https://www.analog.com/"
  },
  {
    slug: "plc-secuencia-arranque",
    title: "Prueba de secuencia de arranque y paro con PLC",
    course: "Controladores Logicos Programables",
    teacher: "Ing. Marco Benites",
    section: "C2",
    reportType: "laboratorio",
    activityType: "programacion",
    nextStep: "analisis",
    objective: "Implementar y verificar una secuencia de arranque, paro y enclavamiento basica en un PLC de laboratorio.",
    theory: "La logica de enclavamiento asegura continuidad del estado de marcha hasta recibir una condicion de paro. En PLC, la secuencia debe contemplar estado inicial, seguridad y realimentacion de salidas.",
    procedure: "Se programo la logica ladder de arranque y paro, se cablearon pulsadores y piloto de estado, y luego se ejecuto la secuencia en varias repeticiones.",
    results: "El arranque se mantuvo enclavado al activar la entrada correspondiente y el paro interrumpio la salida de forma inmediata y repetible.",
    observations: "La secuencia fue estable durante las pruebas. El comportamiento esperado se obtuvo una vez corregida una asignacion inicial de entrada en el programa.",
    conclusion: "La secuencia implementada cumple el objetivo de control basico y puede ampliarse con condiciones adicionales de seguridad o temporizacion.",
    references: "Siemens. (2023). SIMATIC basic automation concepts. https://www.siemens.com/\nIEC. (2016). IEC 61131-3 programmable controllers. https://webstore.iec.ch/"
  },
  {
    slug: "sensor-temperatura-acondicionamiento",
    title: "Caracterizacion de sensor de temperatura y etapa de acondicionamiento",
    course: "Instrumentacion Electronica",
    teacher: "Mg. Rosa Palomino",
    section: "B3",
    reportType: "laboratorio",
    activityType: "medicion",
    nextStep: "analisis",
    objective: "Relacionar la variacion de temperatura con la salida electrica del sensor y evaluar la utilidad de la etapa de acondicionamiento.",
    theory: "Los sensores de temperatura requieren acondicionamiento para convertir pequenas variaciones electricas en señales medibles y comparables. La linealidad y la sensibilidad condicionan la calidad de la lectura.",
    procedure: "Se sometio el sensor a cambios termicos moderados, se registraron lecturas en la salida acondicionada y se comparo la tendencia observada con la respuesta esperada.",
    results: "La señal de salida aumento de forma consistente con el incremento de temperatura y se redujo el ruido de lectura al usar la etapa de acondicionamiento.",
    observations: "La lectura fue mas estable que la medicion directa. La principal limitacion fue el tiempo de estabilizacion entre una medicion y la siguiente.",
    conclusion: "La etapa de acondicionamiento mejora la interpretacion de la señal y hace viable el uso del sensor en un entorno de practicas instrumentales.",
    references: "National Instruments. (2022). Temperature sensor measurement fundamentals. https://www.ni.com/\nOmega. (2023). Temperature measurement handbook. https://www.omega.com/"
  },
  {
    slug: "cilindro-neumatico-secuencia",
    title: "Evaluacion de secuencia basica con cilindro neumatico",
    course: "Neumatica y Electroneumatica",
    teacher: "Ing. Victor Arroyo",
    section: "D1",
    reportType: "laboratorio",
    activityType: "prueba",
    nextStep: "conclusiones",
    objective: "Evaluar la extension y retraccion controlada de un cilindro neumatico en una secuencia basica de laboratorio.",
    theory: "El comportamiento del cilindro depende de la presion disponible, el caudal y el estado de la valvula direccional. La secuencia correcta evita golpes y mejora repetibilidad.",
    procedure: "Se conecto el circuito, se ajusto la presion de trabajo y se ejecutaron ciclos de extension y retraccion observando continuidad, respuesta y estabilidad del actuador.",
    results: "El cilindro completo los ciclos programados sin atascos. La velocidad mejoro despues de un ajuste moderado en el regulador de caudal.",
    observations: "La secuencia fue estable en el rango de presion definido. El mayor cambio se obtuvo al ajustar el caudal, no la presion nominal.",
    conclusion: "La secuencia es funcional para laboratorio y evidencia la importancia del ajuste de caudal en el comportamiento del actuador.",
    references: "Festo. (2023). Pneumatics basic level. https://www.festo.com/\nSMC. (2022). Pneumatic actuator fundamentals. https://www.smcworld.com/"
  },
  {
    slug: "variador-frecuencia-rampa",
    title: "Prueba de rampa de aceleracion en variador de frecuencia",
    course: "Accionamientos Electricos",
    teacher: "Ing. Javier Huertas",
    section: "D2",
    reportType: "laboratorio",
    activityType: "configuracion",
    nextStep: "prueba",
    objective: "Evaluar el efecto de la rampa de aceleracion sobre el arranque controlado de un motor trifasico con variador de frecuencia.",
    theory: "El variador modifica frecuencia y tension para controlar la velocidad del motor. Una rampa adecuada reduce corrientes abruptas y esfuerzos mecanicos en el arranque.",
    procedure: "Se configuraron tiempos de rampa, se ejecuto el arranque del motor y se comparo el comportamiento con una configuracion mas corta de aceleracion.",
    results: "Con una rampa mayor el arranque fue mas suave y se redujo la sensacion de esfuerzo brusco en el sistema. Con la rampa corta el motor alcanzo velocidad mas rapido pero con respuesta menos progresiva.",
    observations: "La diferencia principal se percibio en la suavidad del arranque. No se registraron alarmas del variador durante la prueba.",
    conclusion: "La parametrizacion de la rampa mejora el control del arranque y debe ajustarse segun la exigencia mecanica de la carga.",
    references: "ABB. (2023). Variable frequency drives fundamentals. https://new.abb.com/\nSchneider Electric. (2022). Motor control and drive basics. https://www.se.com/"
  },
  {
    slug: "caudal-venturi",
    title: "Determinacion experimental de caudal con tubo Venturi",
    course: "Mecanica de Fluidos",
    teacher: "Dr. Miguel Huaman",
    section: "A2",
    reportType: "laboratorio",
    activityType: "medicion",
    nextStep: "analisis",
    objective: "Estimar el caudal de un flujo a partir de la diferencia de presion medida en un tubo Venturi de laboratorio.",
    theory: "El tubo Venturi aplica continuidad y Bernoulli para relacionar el estrechamiento de seccion con el incremento de velocidad y la disminucion de presion. La diferencia de presion permite estimar el caudal.",
    procedure: "Se registraron presiones en la entrada y la garganta, se mantuvo un flujo estable y luego se calculo el caudal a partir de la expresion teorica correspondiente.",
    results: "La diferencia de presion aumento con el incremento del flujo y el caudal calculado siguio la tendencia esperada para el montaje usado en la practica.",
    observations: "La principal fuente de incertidumbre fue la lectura manual de presion. Aun asi, la tendencia general coincidió con el comportamiento teorico esperado.",
    conclusion: "El ensayo confirmo la utilidad del Venturi para estimar caudal y reforzo la relacion entre velocidad, seccion y presion en un conducto.",
    references: "Fox, R., McDonald, A., & Pritchard, P. (2015). Introduction to fluid mechanics. Wiley.\nWhite, F. (2016). Fluid mechanics. McGraw-Hill."
  }
];

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildScenarios(total) {
  const scenarios = [];
  for (let index = 0; index < total; index += 1) {
    const template = LAB_TEMPLATES[index % LAB_TEMPLATES.length];
    const group = STUDENT_GROUPS[index % STUDENT_GROUPS.length];
    const variantNumber = index + 1;
    scenarios.push({
      slug: `${String(variantNumber).padStart(2, "0")}-${slugify(template.slug)}`,
      title: template.title,
      course: template.course,
      teacher: template.teacher,
      students: group,
      section: template.section,
      reportType: template.reportType,
      activityType: template.activityType,
      nextStep: template.nextStep,
      date: REPORT_DATE,
      term: TERM,
      objective: template.objective,
      theory: template.theory,
      procedure: template.procedure,
      results: template.results,
      observations: template.observations,
      conclusion: template.conclusion,
      references: template.references
    });
  }
  return scenarios;
}

function extractPageResponse(rawText) {
  const text = String(rawText || "");
  const startMarker = "--respuesta de pagina--";
  const endMarker = "--finalice--";
  const startIndex = text.indexOf(startMarker);
  if (startIndex < 0) {
    return text.trim();
  }
  const contentStart = startIndex + startMarker.length;
  const endIndex = text.indexOf(endMarker, contentStart);
  return (endIndex >= 0 ? text.slice(contentStart, endIndex) : text.slice(contentStart))
    .replace(/\[\[progreso_reporte\]\][\s\S]*?\[\[\/progreso_reporte\]\]/gi, "")
    .trim();
}

function parseQuickReplies(text) {
  const match = String(text || "").match(/\[\[respuestas_rapidas\]\]([\s\S]*?)\[\[\/respuestas_rapidas\]\]/i);
  if (!match?.[1]) {
    return [];
  }
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function sanitizeVisibleText(text) {
  return String(text || "")
    .replace(/\[\[respuestas_rapidas\]\][\s\S]*?\[\[\/respuestas_rapidas\]\]/gi, "")
    .replace(/\[\[progreso_reporte\]\][\s\S]*?\[\[\/progreso_reporte\]\]/gi, "")
    .trim();
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function apiJson(relativePath, options = {}) {
  const response = await fetch(`${API_ROOT}${relativePath}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Fallo ${response.status} en ${relativePath}`);
  }
  return data;
}

async function createSession(scenario) {
  return apiJson("/sessions", {
    method: "POST",
    body: JSON.stringify({
      name: scenario.slug,
      formatId: FORMAT_ID,
      openInVsCode: false
    })
  });
}

async function applyQuickFields(sessionId, scenario) {
  const quickFields = {
    reportCourse: scenario.course,
    reportTopic: scenario.title,
    teacherName: scenario.teacher,
    studentNames: scenario.students,
    sectionGroup: scenario.section,
    reportDate: scenario.date,
    academicTerm: scenario.term,
    reportType: scenario.reportType,
    generalObjective: scenario.objective,
    specificData: scenario.results,
    theoryBase: scenario.theory,
    observations: scenario.observations,
    conclusionFocus: scenario.conclusion,
    references: scenario.references
  };
  await apiJson(`/sessions/${sessionId}/quick-fields`, {
    method: "POST",
    body: JSON.stringify(quickFields)
  });
  await apiJson(`/sessions/${sessionId}/quick-fields-apply`, {
    method: "POST",
    body: JSON.stringify(quickFields)
  });
}

function guessImageContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  return "image/jpeg";
}

async function uploadImage(sessionId, targetName, filePath) {
  const body = await fs.readFile(filePath);
  const query = new URLSearchParams({
    targetName,
    originalName: path.basename(filePath)
  });
  const response = await fetch(`${API_ROOT}/sessions/${sessionId}/upload-image?${query.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": guessImageContentType(filePath)
    },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `No se pudo subir ${filePath}`);
  }
  return data;
}

async function sendMessage(sessionId, message) {
  const data = await apiJson(`/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message })
  });
  return data.result || {};
}

async function getSession(sessionId) {
  return apiJson(`/sessions/${sessionId}`);
}

function pickQuickReply(options, questionText, scenario) {
  if (!options.length) {
    return "";
  }
  const normalizedOptions = options.map((item) => item.toLowerCase());
  const question = String(questionText || "").toLowerCase();
  if (question.includes("tipo") || normalizedOptions.some((item) => item.includes("laboratorio"))) {
    const typeIndex = normalizedOptions.findIndex((item) => item.includes("laboratorio"));
    if (typeIndex >= 0) {
      return options[typeIndex];
    }
  }
  const activityIndex = normalizedOptions.findIndex((item) => item.includes(scenario.activityType));
  if (activityIndex >= 0) {
    return options[activityIndex];
  }
  const nextStepIndex = normalizedOptions.findIndex((item) => item.includes(scenario.nextStep));
  if (nextStepIndex >= 0) {
    return options[nextStepIndex];
  }
  return options[0];
}

function simulateStudentReply(assistantText, scenario, turnIndex, uploadedImageNames) {
  const visible = sanitizeVisibleText(extractPageResponse(assistantText));
  const lower = visible.toLowerCase();
  const quickReplies = parseQuickReplies(assistantText);
  const quickReplyChoice = pickQuickReply(quickReplies, lower, scenario);
  if (quickReplyChoice) {
    return quickReplyChoice;
  }

  if (/de que trata|tema|practica|informe trata/.test(lower)) {
    return `Trata sobre ${scenario.title} en el curso de ${scenario.course}. Fue una practica de laboratorio ya realizada y quiero dejarla en formato final.`;
  }
  if (/objetivo|buscaba|proposito/.test(lower)) {
    return scenario.objective;
  }
  if (/teoria|fundamento|ecuacion|marco tecnico/.test(lower)) {
    return scenario.theory;
  }
  if (/procedimiento|metodolog|pasos|como se hizo|desarrollo/.test(lower)) {
    return scenario.procedure;
  }
  if (/resultado|medicion|dato|valor|obtuvo|obtuvieron|registro/.test(lower)) {
    return scenario.results;
  }
  if (/observ|limitacion|error|problema|incidencia/.test(lower)) {
    return scenario.observations;
  }
  if (/conclusion|cierre|defender/.test(lower)) {
    return scenario.conclusion;
  }
  if (/referencia|bibliograf|fuente|apa/.test(lower)) {
    return scenario.references;
  }
  if (/imagen|evidencia|captura|foto/.test(lower)) {
    return `Usa como evidencia ${uploadedImageNames.join(", ")}. Son imagenes reales del montaje, de la medicion y del estado final de la practica.`;
  }
  if (/docente|curso|seccion|fecha|estudiante|codigo/.test(lower)) {
    return `Curso ${scenario.course}, docente ${scenario.teacher}, seccion ${scenario.section}, fecha ${scenario.date}, estudiantes ${scenario.students.replace(/\n/g, "; ")}.`;
  }

  const fallbackReplies = [
    `El informe corresponde a ${scenario.title} y quiero que quede tecnico pero no inventado.`,
    scenario.objective,
    scenario.procedure,
    scenario.results,
    scenario.observations,
    scenario.conclusion
  ];
  return fallbackReplies[Math.min(turnIndex, fallbackReplies.length - 1)];
}

async function renderGraphvizAssets(workspacePath) {
  const sourceDir = path.join(workspacePath, "archivos");
  const targetDir = path.join(workspacePath, "imagenes");
  const dotCandidates = [
    process.env.GRAPHVIZ_DOT,
    path.join("C:\\Program Files\\Graphviz\\bin", "dot.exe"),
    path.join("C:\\Program Files (x86)\\Graphviz\\bin", "dot.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Graphviz", "bin", "dot.exe")
  ].filter(Boolean);
  const dotCommand = dotCandidates.find((candidate) => fsSync.existsSync(candidate));
  if (!dotCommand || !fsSync.existsSync(sourceDir)) {
    return;
  }
  const entries = await fs.readdir(sourceDir);
  for (const entry of entries) {
    if (!/\.(dot|gv)$/i.test(entry)) {
      continue;
    }
    const sourcePath = path.join(sourceDir, entry);
    const outputPath = path.join(targetDir, `${path.parse(entry).name}.png`);
    await new Promise((resolve, reject) => {
      const child = spawn(dotCommand, ["-Tpng", sourcePath, "-o", outputPath], { windowsHide: true });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk || "");
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `dot termino con codigo ${code}`));
      });
    });
  }
}

async function compileWorkspaceLocally(reportProjectPath) {
  await renderGraphvizAssets(path.dirname(reportProjectPath));
  await new Promise((resolve, reject) => {
    const child = spawn("latexmk", ["-xelatex", "-interaction=nonstopmode", "-halt-on-error", "reporte.tex"], {
      cwd: reportProjectPath,
      windowsHide: true
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `latexmk termino con codigo ${code}`));
    });
  });
}

async function resolveImagePool() {
  const candidates = [PREFERRED_IMAGE_DIR, FALLBACK_IMAGE_DIR].filter(Boolean);
  for (const candidate of candidates) {
    if (!fsSync.existsSync(candidate)) {
      continue;
    }
    const entries = (await fs.readdir(candidate))
      .filter((entry) => /\.(png|jpg|jpeg|webp)$/i.test(entry))
      .map((entry) => path.join(candidate, entry))
      .sort();
    if (entries.length) {
      return { dir: candidate, files: entries };
    }
  }
  throw new Error(`No se encontro un pool de imagenes en ${PREFERRED_IMAGE_DIR} ni en ${FALLBACK_IMAGE_DIR}.`);
}

function buildInitialPrompt(scenario, uploadedImageNames) {
  return [
    `Mi informe es sobre ${scenario.title}.`,
    `Es un laboratorio ya realizado del curso ${scenario.course}.`,
    `Quiero reconstruirlo bien en formato UNI usando datos reales y las evidencias ${uploadedImageNames.join(", ")}.`,
    "Empieza guiandome con preguntas cortas para cerrarlo como informe final."
  ].join(" ");
}

function buildClosingPrompt(scenario, uploadedImageNames) {
  return [
    `Con eso ya tienes el contexto necesario para cerrar el informe final de ${scenario.title}.`,
    `Usa como evidencia ${uploadedImageNames.join(", ")}, integra la teoria real, deja conclusiones prudentes y no inventes nada fuera de estos datos.`,
    "Si falta una aclaracion menor, resuelvela con lo ya conversado y deja el TEX listo para compilar."
  ].join(" ");
}

async function runScenario(scenario, imagePool, imageCursor) {
  log(`Creando sesion para ${scenario.slug}`);
  const session = await createSession(scenario);
  await applyQuickFields(session.id, scenario);

  const uploadedImageNames = [];
  for (let index = 0; index < 2; index += 1) {
    const imagePath = imagePool.files[(imageCursor.value + index) % imagePool.files.length];
    const targetName = `${scenario.slug}-evidencia-${String(index + 1).padStart(2, "0")}${path.extname(imagePath).toLowerCase() || ".png"}`;
    const uploadResult = await uploadImage(session.id, targetName, imagePath);
    uploadedImageNames.push(uploadResult.fileName);
  }
  imageCursor.value += 2;

  const transcript = [];
  let userMessage = buildInitialPrompt(scenario, uploadedImageNames);
  let lastAssistantText = "";

  for (let turnIndex = 0; turnIndex < MAX_TURNS; turnIndex += 1) {
    transcript.push(`## Usuario\n\n${userMessage}\n`);
    const result = await sendMessage(session.id, userMessage);
    lastAssistantText = String(result.assistantText || "");
    const visibleAssistant = extractPageResponse(lastAssistantText) || lastAssistantText;
    transcript.push(`## Asistente\n\n${visibleAssistant.trim()}\n`);

    if (/estado\s*:\s*terminado/i.test(lastAssistantText) || /informe terminado/i.test(visibleAssistant)) {
      break;
    }

    userMessage = simulateStudentReply(lastAssistantText, scenario, turnIndex, uploadedImageNames);
  }

  const closingPrompt = buildClosingPrompt(scenario, uploadedImageNames);
  transcript.push(`## Usuario\n\n${closingPrompt}\n`);
  const closingResult = await sendMessage(session.id, closingPrompt);
  lastAssistantText = String(closingResult.assistantText || lastAssistantText || "");
  transcript.push(`## Asistente\n\n${(extractPageResponse(lastAssistantText) || lastAssistantText).trim()}\n`);

  const finalSnapshot = await getSession(session.id);
  await compileWorkspaceLocally(finalSnapshot.reportProjectPath);

  const projectDir = path.join(OUTPUT_ROOT, scenario.slug);
  await fs.rm(projectDir, { recursive: true, force: true });
  await fs.cp(finalSnapshot.workspacePath, projectDir, { recursive: true });
  await fs.writeFile(path.join(projectDir, "transcript.md"), transcript.join("\n"), "utf8");
  await fs.writeFile(
    path.join(projectDir, "resumen.json"),
    JSON.stringify(
      {
        slug: scenario.slug,
        sessionId: session.id,
        imagePoolDir: imagePool.dir,
        uploadedImageNames,
        workspacePath: finalSnapshot.workspacePath,
        copiedProjectPath: projectDir,
        reportPdfPath: path.join(projectDir, "reporte", "reporte.pdf")
      },
      null,
      2
    ),
    "utf8"
  );

  log(`Proyecto final copiado a ${projectDir}`);
  return {
    slug: scenario.slug,
    projectDir,
    pdfPath: path.join(projectDir, "reporte", "reporte.pdf")
  };
}

async function main() {
  await ensureDir(OUTPUT_ROOT);
  const imagePool = await resolveImagePool();
  log(`Pool de imagenes: ${imagePool.dir} (${imagePool.files.length} archivos)`);
  const scenarios = buildScenarios(CASE_COUNT);
  const imageCursor = { value: 0 };
  const results = [];

  for (const scenario of scenarios) {
    const result = await runScenario(scenario, imagePool, imageCursor);
    results.push(result);
  }

  await fs.writeFile(path.join(OUTPUT_ROOT, "resumen-lote.json"), JSON.stringify(results, null, 2), "utf8");
  log(`Lote finalizado con ${results.length} informes en ${OUTPUT_ROOT}`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});