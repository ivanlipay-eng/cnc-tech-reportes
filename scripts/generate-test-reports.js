const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const API_ROOT = process.env.CNC_API_ROOT || "http://127.0.0.1:3221/api";
const DESKTOP_DIR = path.join(process.env.USERPROFILE || process.env.HOME || process.cwd(), "Desktop");
const OUTPUT_DIR = process.env.CNC_OUTPUT_DIR || path.join(DESKTOP_DIR, "pruebas-bot-reportes-20260407");
const SCREENSHOTS_DIR = path.join(process.env.USERPROFILE || process.env.HOME || process.cwd(), "Pictures", "Screenshots");
const FORMAT_ID = process.env.CNC_TEST_FORMAT || "informes-uni";
const CASE_LIMIT = Number(process.env.CNC_CASE_LIMIT || 0);
const CASE_SLUG = process.env.CNC_CASE_SLUG || "";
const START_ONLY = process.env.CNC_START_ONLY === "1";
const SKIP_CLEAN = process.env.CNC_SKIP_CLEAN === "1";
const LOG_FILE = path.join(OUTPUT_DIR, "progress.log");
const GRAPHVIZ_DOT_COMMAND = resolveGraphvizDotCommand();

const cases = [
  {
    slug: "01-corto-driver-motor",
    lengthLabel: "corto",
    reportRequest: "Quiero un informe corto, muy sintetico y limpio.",
    title: "Verificacion basica de driver para motor paso a paso",
    course: "Automatizacion Industrial",
    teacher: "Ing. Carla Mendoza",
    students: "Ivan Lipay - 20261234",
    section: "A1",
    date: "07/04/2026",
    term: "2026-I",
    reportType: "tecnico",
    objective: "Verificar el conexionado minimo, el sentido de giro y la estabilidad inicial de un driver para motor paso a paso.",
    specificData: "Fuente de 24 V, driver microstep, motor NEMA 17, pulsos manuales desde generador basico, medicion visual del giro y respuesta a cambios de direccion.",
    theory: "Relacion entre pulsos STEP, direccion DIR y energizacion secuencial de fases. Importancia de corriente limitada, masa comun y frecuencia de pulsos moderada para evitar perdida de pasos en la prueba inicial.",
    observations: "El motor respondio estable a baja velocidad, sin calentamiento critico. Hubo una inversion inicial de bobinas que se corrigio rapidamente. Las capturas solo sirven como evidencia visual del armado y prueba.",
    conclusion: "Se confirmo que el driver opera de forma estable en prueba basica y que el sistema queda listo para una etapa posterior de control mas fino.",
    references: "Texas Instruments. (2022). Stepper motor control basics. https://www.ti.com/\nAnalog Devices. (2023). Motor driver fundamentals. https://www.analog.com/",
    message1: [
      "El informe trata sobre una verificacion basica de un driver para motor paso a paso en una practica de automatizacion.",
      "Se reviso alimentacion, continuidad, conexion de bobinas, sentido de giro y respuesta a pulsos de prueba.",
      "Quiero que el desarrollo sea corto pero tecnico, sin relleno.",
      "Si puedes sintetizar el procedimiento con un diagrama Graphviz compacto, hazlo automaticamente.",
      "Las imagenes subidas deben usarse como evidencias visuales del montaje y la prueba.",
      "Objetivo: comprobar que el driver y el motor queden operativos para pruebas posteriores.",
    ].join(" "),
    message2: [
      "Resultados reales: el giro fue estable a baja frecuencia, la inversion de direccion funciono y no hubo ruido anormal despues de corregir el orden de una bobina.",
      "Observaciones finales: el sistema queda validado solo para prueba inicial, no para carga mecanica.",
      "Con eso ya puedes cerrar el informe corto.",
    ].join(" "),
    imageCount: 1,
  },
  {
    slug: "02-normal-sensor-inductivo",
    lengthLabel: "normal",
    reportRequest: "Quiero un informe normal, con desarrollo tecnico claro y una sintesis visual si aplica.",
    title: "Integracion de sensor inductivo para conteo de piezas",
    course: "Instrumentacion y Sensores",
    teacher: "Ing. Luis Quispe",
    students: "Ivan Lipay - 20261234",
    section: "B1",
    date: "07/04/2026",
    term: "2026-I",
    reportType: "laboratorio",
    objective: "Integrar un sensor inductivo a un sistema de conteo de piezas metalicas y evaluar estabilidad de deteccion.",
    specificData: "Sensor inductivo NPN de 12 a 24 V, modulo de interfaz, contador digital, piezas metalicas de prueba, separacion aproximada de 5 mm, diez ciclos de conteo.",
    theory: "Principio de deteccion por campo electromagnetico, distancia nominal, influencia del material y necesidad de acondicionamiento de señal para lectura confiable en la etapa de conteo.",
    observations: "La deteccion fue confiable con piezas alineadas. Cuando la separacion lateral crecio, aparecieron perdidas de conteo esporadicas. Se recomendo guiar mejor el paso de piezas.",
    conclusion: "La integracion fue funcional y permite conteo estable en condiciones controladas, aunque requiere mejor guiado mecanico para produccion continua.",
    references: "Omron. (2023). Proximity sensors technical guide. https://www.omron.com/\nAutomationDirect. (2022). Inductive proximity sensor principles. https://www.automationdirect.com/",
    message1: [
      "Necesito un informe normal sobre la integracion de un sensor inductivo para conteo de piezas metalicas.",
      "Se monto el sensor, se alimento el circuito, se ajusto la distancia de deteccion y se hicieron ciclos de conteo con piezas metalicas.",
      "Quiero un desarrollo tecnico claro, con resultados y observaciones reales.",
      "Si ves viable, usa Graphviz para sintetizar el flujo de deteccion y conteo.",
      "Las capturas subidas son solo evidencias del montaje y de la lectura del sistema.",
    ].join(" "),
    message2: [
      "Resultados: con piezas centradas se obtuvieron 10 de 10 detecciones correctas. Con desalineacion lateral aparecieron 2 fallos en 10 ciclos.",
      "Incluye una recomendacion de mejora mecanica y deja el informe en un nivel normal, no extenso.",
    ].join(" "),
    imageCount: 2,
  },
  {
    slug: "03-normal-fuente-regulada",
    lengthLabel: "normal",
    reportRequest: "Quiero un informe normal, tecnico, bien ordenado y con tabla o grafico si aporta.",
    title: "Evaluacion de una fuente regulada para modulo CNC",
    course: "Electronica de Potencia",
    teacher: "Mg. Andrea Salazar",
    students: "Ivan Lipay - 20261234",
    section: "B2",
    date: "07/04/2026",
    term: "2026-I",
    reportType: "tecnico",
    objective: "Evaluar la estabilidad de una fuente regulada destinada a alimentar un modulo de control CNC en condiciones de laboratorio.",
    specificData: "Entrada de 220 VAC, salida regulada de 24 VDC, medicion con multimetro, variacion de carga resistiva, observacion de calentamiento y caida de tension.",
    theory: "Rectificacion, filtrado, regulacion de voltaje, margen de corriente y efecto de la carga sobre la estabilidad de la salida en sistemas de control.",
    observations: "La fuente mantuvo tension cercana a 24 V con carga media. A mayor carga hubo una caida ligera y aumento moderado de temperatura, aun dentro de un rango aceptable para la prueba.",
    conclusion: "La fuente es adecuada para pruebas del modulo CNC, pero conviene verificar ventilacion y margen de corriente antes de uso continuo.",
    references: "Horowitz, P., & Hill, W. (2015). The art of electronics. Cambridge University Press.\nKeysight. (2021). DC power supply fundamentals. https://www.keysight.com/",
    message1: [
      "El informe es sobre la evaluacion de una fuente regulada para alimentar un modulo CNC.",
      "Se midio la salida en vacio y con carga, se observo estabilidad y calentamiento, y se comparo el comportamiento con lo esperado para una fuente regulada.",
      "Quiero un informe normal, claro y sin exagerar longitud.",
      "Si una tabla de componentes y funciones resume mejor que un Graphviz, puedes usarla; si no, usa un diagrama compacto.",
    ].join(" "),
    message2: [
      "Datos concretos: 24.2 V en vacio, 23.8 V con carga media, 23.5 V con carga mayor de prueba. Calentamiento moderado sin olor ni inestabilidad visible.",
      "Deja una recomendacion final sobre margen de corriente y ventilacion.",
    ].join(" "),
    imageCount: 2,
  },
  {
    slug: "04-normal-calibracion-eje",
    lengthLabel: "normal",
    reportRequest: "Quiero un informe normal con buena secuencia tecnica y una sintesis visual compacta.",
    title: "Calibracion y prueba de desplazamiento de un eje controlado",
    course: "Control de Movimiento",
    teacher: "Ing. Roberto Sifuentes",
    students: "Ivan Lipay - 20261234",
    section: "C1",
    date: "07/04/2026",
    term: "2026-I",
    reportType: "laboratorio",
    objective: "Calibrar un eje controlado por motor paso a paso y verificar respuesta a movimientos de referencia y retorno.",
    specificData: "Motor paso a paso, driver, finales de carrera, estructura lineal de prueba, secuencia de homing, desplazamientos cortos y retorno al origen.",
    theory: "Relacion entre resolucion de paso, homing, referencias mecanicas y validacion del retorno al origen en sistemas de movimiento controlado.",
    observations: "El homing fue consistente luego de ajustar el punto de activacion del final de carrera. El retorno al origen se mantuvo repetible en varias pruebas cortas.",
    conclusion: "La calibracion inicial fue exitosa y deja el eje listo para integrar rutinas mas complejas de posicionamiento.",
    references: "MachMotion. (2023). CNC homing and limit switch basics. https://www.machmotion.com/\nNXP. (2022). Stepper motion control overview. https://www.nxp.com/",
    message1: [
      "Necesito un informe normal sobre calibracion y prueba de desplazamiento de un eje controlado por motor paso a paso.",
      "Se hizo homing, prueba de finales de carrera, desplazamientos cortos y retorno al origen.",
      "Quiero que se note la secuencia tecnica del procedimiento.",
      "Si puedes, usa Graphviz para sintetizar la secuencia de homing, validacion y movimiento.",
    ].join(" "),
    message2: [
      "Resultado principal: despues del ajuste del final de carrera, el retorno al origen fue repetible y los desplazamientos cortos no mostraron perdida de pasos.",
      "Deja observaciones sobre la importancia del punto de referencia mecanico y cierra el informe en extension normal.",
    ].join(" "),
    imageCount: 2,
  },
  {
    slug: "05-extenso-estacion-automatizada",
    lengthLabel: "extenso",
    reportRequest: "Quiero un informe extenso, bien desarrollado, con buena estructura tecnica y uno o dos elementos visuales si aportan.",
    title: "Arquitectura y validacion de una estacion automatizada de prueba",
    course: "Sistemas de Automatizacion",
    teacher: "Dr. Miguel Huaman",
    students: "Ivan Lipay - 20261234\nPaula Rojas - 20264567",
    section: "D1",
    date: "07/04/2026",
    term: "2026-I",
    reportType: "investigacion",
    objective: "Describir la arquitectura funcional de una estacion automatizada de prueba y validar su secuencia de operacion, supervison y registro basico de eventos.",
    specificData: "Fuente principal de 24 VDC, PLC compacto, HMI, sensores de presencia, actuador lineal, parada de emergencia, registro de eventos, secuencia de habilitacion, ciclo de prueba y cierre seguro.",
    theory: "Integracion entre control, sensado, actuacion y supervison. Importancia del enclavamiento de seguridad, estados del sistema, secuencia operativa y trazabilidad basica de eventos en celdas automatizadas.",
    observations: "La arquitectura fue funcional, la secuencia de arranque y prueba se mantuvo coherente y el sistema pudo registrar eventos basicos. Se detecto como mejora pendiente la ampliacion del manejo de fallas y alarmas.",
    conclusion: "La estacion queda validada a nivel de arquitectura y secuencia principal, con potencial de escalar hacia un control mas robusto y trazabilidad ampliada.",
    references: "IEC. (2016). IEC 61131-3 programmable controllers. https://webstore.iec.ch/\nSiemens. (2023). Basics of industrial automation architecture. https://www.siemens.com/\nRockwell Automation. (2022). Machine safety fundamentals. https://www.rockwellautomation.com/",
    message1: [
      "Necesito un informe extenso sobre la arquitectura y validacion de una estacion automatizada de prueba.",
      "El sistema tiene fuente de 24 V, PLC, HMI, sensores de presencia, actuador lineal, parada de emergencia y registro basico de eventos.",
      "La secuencia general fue habilitacion del sistema, verificacion de seguridad, deteccion de pieza, actuacion, confirmacion y cierre seguro.",
      "Quiero que el informe sea realmente mas desarrollado que los normales.",
      "Si es posible, usa al menos un Graphviz para arquitectura o flujo principal, y si conviene agrega tambien un cuadro sintesis.",
      "Las capturas subidas solo sirven como evidencias visuales del montaje, interfaz y estados observados.",
    ].join(" "),
    message2: [
      "Resultados y observaciones: el arranque fue estable, la parada de emergencia interrumpio correctamente la secuencia, la deteccion de pieza habilito el actuador solo cuando la condicion de seguridad estaba valida y el cierre seguro quedo registrado.",
      "Limitaciones: el sistema todavia tiene manejo basico de alarmas y registro limitado de fallas.",
      "Desarrolla bien el marco tecnico, la arquitectura y las recomendaciones finales.",
    ].join(" "),
    imageCount: 4,
  },
];

async function ensureOutputDir() {
  if (!SKIP_CLEAN) {
    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  }
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  if (!SKIP_CLEAN || !fsSync.existsSync(LOG_FILE)) {
    await fs.writeFile(LOG_FILE, "", "utf8");
  }
}

async function logProgress(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fsSync.appendFileSync(LOG_FILE, line, "utf8");
  console.log(line.trim());
}

async function getScreenshotPool() {
  const entries = await fs.readdir(SCREENSHOTS_DIR);
  return entries
    .filter((entry) => /\.(png|jpg|jpeg|webp)$/i.test(entry))
    .map((entry) => path.join(SCREENSHOTS_DIR, entry))
    .sort();
}

async function apiJson(relativePath, options = {}) {
  const response = await fetch(`${API_ROOT}${relativePath}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Fallo ${response.status} en ${relativePath}`);
  }
  return data;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveGraphvizDotCommand() {
  const candidatePaths = [
    process.env.GRAPHVIZ_DOT,
    path.join("C:\\Program Files\\Graphviz\\bin", "dot.exe"),
    path.join("C:\\Program Files (x86)\\Graphviz\\bin", "dot.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Graphviz", "bin", "dot.exe"),
  ].filter(Boolean);

  return candidatePaths.find((candidate) => fsSync.existsSync(candidate)) || "";
}

async function waitWithHeartbeat(totalMs, label) {
  const chunkMs = 15000;
  let remainingMs = totalMs;
  while (remainingMs > 0) {
    const currentWait = Math.min(chunkMs, remainingMs);
    await delay(currentWait);
    remainingMs -= currentWait;
    await logProgress(`${label}: espera restante ${Math.ceil(remainingMs / 1000)} s`);
  }
}

function getSettleTimeMs(testCase) {
  if (testCase.lengthLabel === "extenso") {
    return 720000;
  }
  if (testCase.lengthLabel === "corto") {
    return 360000;
  }
  return 480000;
}

function launchDetachedMessage(sessionId, prompt, outputFile) {
  const promptPath = outputFile.replace(/message-response(?:-\d+)?\.json$/i, "message-payload.txt");
  fsSync.writeFileSync(promptPath, prompt, "utf8");
  const child = spawn(process.execPath, [
    path.join(__dirname, "send-message-detached.js"),
    `${API_ROOT}/sessions/${sessionId}/messages`,
    promptPath,
    outputFile,
  ], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  return {
    pid: child.pid,
    promptPath,
    outputFile,
  };
}

async function getSessionSnapshot(sessionId) {
  return apiJson(`/sessions/${sessionId}`);
}

function extractAssistantTextFromHistory(history, baselineIndex) {
  if (!Array.isArray(history) || !history.length) {
    return "";
  }

  for (let index = history.length - 1; index >= baselineIndex; index -= 1) {
    const entry = history[index];
    if (entry?.type === "assistant-complete" && entry.payload?.text) {
      return String(entry.payload.text);
    }
  }

  return "";
}

function isLikelyFinalReport(reportText) {
  const text = String(reportText || "");
  if (text.length < 2500) {
    return false;
  }

  if (!text.includes("\\section{Introduccion}") || !text.includes("\\section{Conclusiones}")) {
    return false;
  }

  return !/lorem ipsum|placeholder|completar|texto de ejemplo|seccion de ejemplo/i.test(text);
}

function tryKillDetachedProcess(pid) {
  if (!pid) {
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // El proceso probablemente ya termino.
  }
}

async function waitForSessionTurn(sessionId, baselineHistoryCount, label, timeoutMs, reportTexPath) {
  const startedAt = Date.now();
  let stableReadyAt = 0;
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await getSessionSnapshot(sessionId);
    const history = Array.isArray(snapshot.history) ? snapshot.history : [];
    const assistantText = extractAssistantTextFromHistory(history, baselineHistoryCount);
    let reportReady = false;

    if (reportTexPath && fsSync.existsSync(reportTexPath)) {
      try {
        const reportText = fsSync.readFileSync(reportTexPath, "utf8");
        reportReady = isLikelyFinalReport(reportText);
      } catch {
        reportReady = false;
      }
    }

    if (snapshot.status === "idle" && !snapshot.busy && assistantText) {
      await logProgress(`${label}: turno completado segun snapshot`);
      return {
        status: "completed",
        body: JSON.stringify({ result: { assistantText } }),
        snapshot,
      };
    }

    if (assistantText && reportReady) {
      stableReadyAt = stableReadyAt || Date.now();
      if (Date.now() - stableReadyAt >= 30000) {
        await logProgress(`${label}: reporte estabilizado con sesion aun ocupada`);
        return {
          status: "completed",
          body: JSON.stringify({ result: { assistantText } }),
          snapshot,
        };
      }
    } else {
      stableReadyAt = 0;
    }

    await delay(5000);
    await logProgress(`${label}: esperando respuesta del bot`);
  }

  throw new Error(`${label}: timeout esperando respuesta del bot`);
}

function parseDetachedAssistantText(payload) {
  if (!payload?.body) {
    return "";
  }

  try {
    const parsed = JSON.parse(payload.body);
    return parsed?.result?.assistantText || "";
  } catch {
    return "";
  }
}

async function compileWorkspaceLocally(reportProjectPath) {
  const workspacePath = path.dirname(reportProjectPath);
  const graphvizSourceDir = path.join(workspacePath, "archivos");
  const graphvizTargetDir = path.join(workspacePath, "imagenes");
  const reportFile = path.join(reportProjectPath, "reporte.tex");

  if (GRAPHVIZ_DOT_COMMAND && fsSync.existsSync(graphvizSourceDir)) {
    const sourceEntries = fsSync.readdirSync(graphvizSourceDir);
    for (const entry of sourceEntries) {
      if (!/\.(dot|gv)$/i.test(entry)) {
        continue;
      }
      const sourcePath = path.join(graphvizSourceDir, entry);
      const outputPath = path.join(graphvizTargetDir, `${path.parse(entry).name}.png`);
      await new Promise((resolve, reject) => {
        const child = spawn(GRAPHVIZ_DOT_COMMAND, ["-Tpng", sourcePath, "-o", outputPath], {
          windowsHide: true,
        });

        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += String(chunk || "");
        });

        child.on("error", reject);
        child.on("exit", (code) => {
          if (code === 0 && fsSync.existsSync(outputPath)) {
            resolve();
            return;
          }
          reject(new Error(stderr.trim() || `dot termino con codigo ${code} para ${entry}`));
        });
      });
    }
  }

  await new Promise((resolve, reject) => {
    const child = spawn("latexmk", ["-xelatex", "-interaction=nonstopmode", "-halt-on-error", "reporte.tex"], {
      cwd: reportProjectPath,
      windowsHide: true,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 && fsSync.existsSync(reportFile.replace(/\.tex$/i, ".pdf"))) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `latexmk termino con codigo ${code}`));
    });
  });
}

async function uploadImage(sessionId, targetName, filePath) {
  const contentType = guessImageContentType(filePath);
  const body = await fs.readFile(filePath);
  const query = new URLSearchParams({
    targetName,
    originalName: path.basename(filePath),
  });
  const response = await fetch(`${API_ROOT}/sessions/${sessionId}/upload-image?${query.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
    },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `No se pudo subir ${filePath}`);
  }
  return data;
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

function toTranscriptEntry(role, text) {
  return `## ${role}\n\n${String(text || "").trim()}\n`;
}

async function runCase(testCase, screenshotFiles) {
  await logProgress(`Inicio de caso ${testCase.slug}`);
  const caseDir = path.join(OUTPUT_DIR, testCase.slug);
  await fs.mkdir(caseDir, { recursive: true });
  const session = await apiJson("/sessions", {
    method: "POST",
    body: JSON.stringify({
      name: testCase.slug,
      formatId: FORMAT_ID,
      openInVsCode: false,
    }),
  });

  const conversation = [];
  const usedImages = [];
  await logProgress(`Sesion creada ${session.id} para ${testCase.slug}`);
  for (let index = 0; index < screenshotFiles.length; index += 1) {
    const screenshotPath = screenshotFiles[index];
    const targetName = `${testCase.slug}-evidencia-${String(index + 1).padStart(2, "0")}.jpg`;
    const uploadResult = await uploadImage(session.id, targetName, screenshotPath);
    await logProgress(`Imagen subida ${uploadResult.fileName} para ${testCase.slug}`);
    usedImages.push({
      source: screenshotPath,
      uploadedAs: uploadResult.fileName,
    });
  }

  const imageListText = usedImages.map((item) => item.uploadedAs).join(", ");
  const firstPrompt = [
    testCase.reportRequest,
    testCase.message1,
    `Datos adicionales para el cierre del informe: ${testCase.message2}`,
    "Datos estructurados del informe:",
    `Curso: ${testCase.course}`,
    `Tema: ${testCase.title}`,
    `Docente: ${testCase.teacher}`,
    `Estudiante(s): ${testCase.students}`,
    `Seccion: ${testCase.section}`,
    `Fecha: ${testCase.date}`,
    `Ciclo: ${testCase.term}`,
    `Tipo de informe: ${testCase.reportType}`,
    `Objetivo general: ${testCase.objective}`,
    `Datos e insumos clave: ${testCase.specificData}`,
    `Base teorica: ${testCase.theory}`,
    `Observaciones reales: ${testCase.observations}`,
    `Conclusion o cierre esperado: ${testCase.conclusion}`,
    `Referencias iniciales: ${testCase.references}`,
    `Imagenes de prueba subidas como evidencia visual: ${imageListText}.`,
  ].join(" ");
  conversation.push(toTranscriptEntry("Usuario", firstPrompt));
  await fs.writeFile(path.join(caseDir, "prompt-principal.txt"), firstPrompt, "utf8");

  const beforeFirstTurn = await getSessionSnapshot(session.id);
  const firstResponsePath = path.join(caseDir, "message-response-1.json");
  const firstLaunch = launchDetachedMessage(session.id, firstPrompt, firstResponsePath);
  await logProgress(`Primer mensaje lanzado en ${testCase.slug}`);
  const firstPayload = await waitForSessionTurn(
    session.id,
    Array.isArray(beforeFirstTurn.history) ? beforeFirstTurn.history.length : 0,
    `${testCase.slug} turno 1`,
    getSettleTimeMs(testCase),
    session.reportTexPath
  );
  await fs.writeFile(firstResponsePath, JSON.stringify(firstPayload, null, 2), "utf8");
  tryKillDetachedProcess(firstLaunch.pid);
  conversation.push(toTranscriptEntry("Asistente", parseDetachedAssistantText(firstPayload) || "Sin respuesta visible."));
  await logProgress(`Conversacion completada en ${testCase.slug}`);

  try {
    await compileWorkspaceLocally(session.reportProjectPath);
  } catch (error) {
    await logProgress(`Primer intento de compilacion fallo en ${testCase.slug}: ${error.message}`);
    await waitWithHeartbeat(45000, `Reintento ${testCase.slug}`);
    await compileWorkspaceLocally(session.reportProjectPath);
  }
  await logProgress(`Compilacion local completada en ${testCase.slug}`);

  if (session.workspacePath && fsSync.existsSync(session.workspacePath)) {
    await fs.cp(session.workspacePath, path.join(caseDir, "workspace"), { recursive: true });
    await logProgress(`Workspace copiado al escritorio para ${testCase.slug}`);
  }

  const summary = {
    slug: testCase.slug,
    formatId: FORMAT_ID,
    requestedLength: testCase.lengthLabel,
    sessionId: session.id,
    workspacePath: session.workspacePath,
    reportPdfPath: session.reportPdfPath,
    imagesUsed: usedImages,
  };

  if (START_ONLY) {
    await fs.writeFile(path.join(caseDir, "resumen.json"), JSON.stringify(summary, null, 2), "utf8");
    await fs.writeFile(path.join(caseDir, "transcript.md"), conversation.join("\n"), "utf8");
    await logProgress(`Caso iniciado en modo start-only ${testCase.slug}`);
    return summary;
  }

  summary.outputWorkspace = path.join(caseDir, "workspace");
  await fs.writeFile(path.join(caseDir, "resumen.json"), JSON.stringify(summary, null, 2), "utf8");
  await fs.writeFile(path.join(caseDir, "transcript.md"), conversation.join("\n"), "utf8");
  await logProgress(`Caso finalizado ${testCase.slug}`);

  return summary;
}

async function main() {
  await ensureOutputDir();
  await logProgress(`Inicio general con formato ${FORMAT_ID}`);
  const screenshotPool = await getScreenshotPool();
  if (screenshotPool.length < 11) {
    throw new Error("No hay suficientes screenshots para las cinco pruebas.");
  }

  let plannedCases = CASE_LIMIT > 0 ? cases.slice(0, CASE_LIMIT) : cases;
  if (CASE_SLUG) {
    plannedCases = plannedCases.filter((item) => item.slug === CASE_SLUG);
  }
  if (!plannedCases.length) {
    throw new Error("No hay casos coincidentes para ejecutar.");
  }
  const summaries = [];
  let cursor = Math.max(0, screenshotPool.length - 20);
  for (const testCase of plannedCases) {
    const slice = screenshotPool.slice(cursor, cursor + testCase.imageCount);
    cursor += testCase.imageCount;
    const result = await runCase(testCase, slice);
    summaries.push(result);
    console.log(`Caso generado: ${testCase.slug}`);
  }

  await fs.writeFile(path.join(OUTPUT_DIR, "resumen-general.json"), JSON.stringify(summaries, null, 2), "utf8");
  await logProgress(`Final general con ${summaries.length} casos`);
  console.log(`Salida lista en: ${OUTPUT_DIR}`);
}

main().catch((error) => {
  try {
    fsSync.mkdirSync(OUTPUT_DIR, { recursive: true });
    fsSync.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ERROR FATAL ${error && error.stack ? error.stack : String(error)}\n`, "utf8");
  } catch {
    // Ignora errores de logging final.
  }
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});