const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const publicConfigPath = path.join(rootDir, "public", "config.js");
const docsConfigPath = path.join(rootDir, "docs", "config.js");

function run(command, args, allowFailure = false) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (result.error) {
    if (allowFailure) {
      return { ok: false, output: String(result.error.message || result.error) };
    }
    throw result.error;
  }

  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status !== 0) {
    if (allowFailure) {
      return { ok: false, output };
    }
    throw new Error(output || `${command} fallo con codigo ${result.status}`);
  }

  return { ok: true, output };
}

function runQuiet(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
  });

  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error || null,
  };
}

function updateApiBaseUrl(configPath, newUrl) {
  const content = fs.readFileSync(configPath, "utf8");
  const updated = content.replace(
    /apiBaseUrl:\s*"[^"]*"/,
    `apiBaseUrl: "${newUrl}"`
  );

  if (updated === content) {
    return false;
  }

  fs.writeFileSync(configPath, updated, "utf8");
  return true;
}

function readCurrentApiBaseUrl(configPath) {
  const content = fs.readFileSync(configPath, "utf8");
  const match = content.match(/apiBaseUrl:\s*"([^"]*)"/);
  return match?.[1] || "";
}

function isTrackedOrUnignored(filePath) {
  const relativePath = path.relative(rootDir, filePath).replaceAll("\\", "/");
  const checkIgnore = runQuiet("git", ["check-ignore", "-q", relativePath]);

  if (checkIgnore.error) {
    return false;
  }

  // status 0 => ignored, status 1 => not ignored
  return checkIgnore.status === 1;
}

function main() {
  const tunnelUrl = String(process.argv[2] || "").trim();
  if (!/^https:\/\/.+/i.test(tunnelUrl)) {
    throw new Error("Debes pasar una URL https valida del backend/tunel.");
  }

  const currentUrl = readCurrentApiBaseUrl(publicConfigPath);
  if (currentUrl === tunnelUrl) {
    console.log(`Sin cambios: la URL ya estaba en ${tunnelUrl}`);
    return;
  }

  const publicChanged = updateApiBaseUrl(publicConfigPath, tunnelUrl);

  let docsChanged = false;
  if (fs.existsSync(docsConfigPath) && isTrackedOrUnignored(docsConfigPath)) {
    docsChanged = updateApiBaseUrl(docsConfigPath, tunnelUrl);
  }

  if (!publicChanged && !docsChanged) {
    console.log("Sin cambios para sincronizar.");
    return;
  }

  run(process.execPath, ["scripts/bump-version-100.js"]);

  const stageCandidates = [
    "public/config.js",
    "public/index.html",
    "package.json",
    "package-lock.json",
  ];

  if (docsChanged) {
    stageCandidates.push("docs/config.js", "docs/index.html");
  }

  const stageArgs = ["add", ...stageCandidates.filter((entry) => {
    const absolutePath = path.join(rootDir, entry);
    return fs.existsSync(absolutePath) && isTrackedOrUnignored(absolutePath);
  })];

  if (stageArgs.length > 1) {
    run("git", stageArgs);
  }

  const safeHost = tunnelUrl.replace(/^https?:\/\//i, "");
  const commitMessage = `chore: sync backend url ${safeHost}`;
  const commitResult = run("git", ["commit", "-m", commitMessage], true);
  if (!commitResult.ok) {
    if (/nothing to commit/i.test(commitResult.output)) {
      console.log("Sin cambios para commit.");
      return;
    }
    throw new Error(commitResult.output || "No se pudo crear el commit.");
  }

  run("git", ["push"]);
  console.log(`URL publicada en GitHub Pages: ${tunnelUrl}`);
}

main();
