const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      ...options,
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
      reject(new Error(stderr.trim() || `${command} termino con codigo ${code}`));
    });
  });
}

async function renderGraphvizAssets(workspacePath) {
  const sourceDir = path.join(workspacePath, "archivos");
  const targetDir = path.join(workspacePath, "imagenes");
  if (!fsSync.existsSync(sourceDir)) {
    return;
  }

  const entries = await fs.readdir(sourceDir);
  for (const entry of entries) {
    if (!/\.(dot|gv)$/i.test(entry)) {
      continue;
    }
    const sourcePath = path.join(sourceDir, entry);
    const outputPath = path.join(targetDir, `${path.parse(entry).name}.png`);
    await runCommand("dot", ["-Tpng", sourcePath, "-o", outputPath]);
  }
}

async function main() {
  const summaryPath = process.argv[2];
  if (!summaryPath) {
    throw new Error("Uso: node finalize-test-report.js <ruta-resumen.json>");
  }

  const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
  const caseDir = path.dirname(summaryPath);
  const workspacePath = summary.workspacePath;
  const reportProjectPath = path.join(workspacePath, "reporte");

  await renderGraphvizAssets(workspacePath);
  await runCommand("latexmk", ["-xelatex", "-interaction=nonstopmode", "-halt-on-error", "reporte.tex"], {
    cwd: reportProjectPath,
  });

  await fs.cp(workspacePath, path.join(caseDir, "workspace"), { recursive: true });
  summary.outputWorkspace = path.join(caseDir, "workspace");
  summary.finalizedAt = new Date().toISOString();
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});