const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const TMP_DIR = path.join(ROOT_DIR, "tmp");

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

function readLock(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    return null;
  }
}

function modeFromLockPath(lockPath) {
  const fileName = path.basename(lockPath);
  return fileName.replace("managed-runtime-monitor-", "").replace(".lock", "");
}

function main() {
  const locks = listMonitorLocks();
  if (!locks.length) {
    console.log("No hay monitor 24x7 activo.");
    return;
  }

  let activeCount = 0;
  for (const lockPath of locks) {
    const mode = modeFromLockPath(lockPath);
    const lock = readLock(lockPath);
    if (!lock) {
      console.log(`Monitor ${mode}: lock invalido`);
      continue;
    }

    const alive = isProcessAlive(lock.pid);
    if (alive) {
      activeCount += 1;
    }

    console.log(`Monitor ${mode}: ${alive ? "activo" : "caido"}`);
    console.log(`  PID: ${lock.pid || "-"}`);
    console.log(`  Inicio: ${lock.startedAt || "-"}`);
  }

  if (!activeCount) {
    console.log("No hay monitores activos; puedes iniciarlos con start:permanent-24x7 o start:public-24x7.");
  }
}

main();
