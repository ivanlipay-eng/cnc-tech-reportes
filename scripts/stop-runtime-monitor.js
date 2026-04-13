const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const TMP_DIR = path.join(ROOT_DIR, "tmp");

function parseArgs(argv) {
  return {
    mode: argv[2] || "all",
  };
}

function isProcessAlive(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function listMonitorLocks() {
  if (!fs.existsSync(TMP_DIR)) {
    return [];
  }

  return fs.readdirSync(TMP_DIR)
    .filter((name) => name.startsWith("managed-runtime-monitor-") && name.endsWith(".lock"))
    .map((name) => path.join(TMP_DIR, name));
}

function modeFromLockPath(lockPath) {
  const fileName = path.basename(lockPath);
  return fileName.replace("managed-runtime-monitor-", "").replace(".lock", "");
}

function readLock(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    return null;
  }
}

function stopOne(lockPath) {
  const mode = modeFromLockPath(lockPath);
  const lock = readLock(lockPath);

  if (!lock) {
    fs.rmSync(lockPath, { force: true });
    return { mode, pid: null, stopped: false, reason: "lock invalido" };
  }

  if (!isProcessAlive(lock.pid)) {
    fs.rmSync(lockPath, { force: true });
    return { mode, pid: lock.pid, stopped: false, reason: "ya no existia" };
  }

  process.kill(lock.pid, "SIGTERM");
  fs.rmSync(lockPath, { force: true });
  return { mode, pid: lock.pid, stopped: true, reason: "cerrado" };
}

function main() {
  const args = parseArgs(process.argv);
  const locks = listMonitorLocks();
  if (!locks.length) {
    console.log("No hay monitor 24x7 para detener.");
    return;
  }

  const selected = args.mode === "all"
    ? locks
    : locks.filter((lockPath) => modeFromLockPath(lockPath) === args.mode);

  if (!selected.length) {
    console.log(`No se encontro monitor para modo: ${args.mode}`);
    return;
  }

  for (const lockPath of selected) {
    const result = stopOne(lockPath);
    console.log(`Monitor ${result.mode}: PID ${result.pid || "-"} ${result.reason}`);
  }
}

main();
