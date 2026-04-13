const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const TMP_DIR = path.join(ROOT_DIR, "tmp");
const LOG_DIR = path.join(TMP_DIR, "runtime-logs");

function parseArgs(argv) {
  const args = {
    mode: argv[2] || process.env.MANAGED_RUNTIME_MODE || "permanent",
    intervalMs: Number(process.env.MANAGED_RUNTIME_MONITOR_INTERVAL_MS || 15000),
  };

  for (let index = 3; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--interval" && next) {
      const value = Number(next);
      if (Number.isFinite(value) && value >= 2000) {
        args.intervalMs = value;
      }
      index += 1;
      continue;
    }

    if (current === "--tunnel-name" && next) {
      args.tunnelName = next;
      index += 1;
    }
  }

  return args;
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

function lockPathForMode(mode) {
  return path.join(TMP_DIR, `managed-runtime-monitor-${mode}.lock`);
}

function readLock(lockPath) {
  if (!fs.existsSync(lockPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(LOG_DIR, { recursive: true });

  const lockPath = lockPathForMode(args.mode);
  const existingLock = readLock(lockPath);
  if (existingLock && isProcessAlive(existingLock.pid)) {
    console.log(`El monitor ya esta activo para ${args.mode} (PID ${existingLock.pid}).`);
    return;
  }

  const timestamp = Date.now();
  const monitorLogPath = path.join(LOG_DIR, `${args.mode}-monitor-${timestamp}.log`);
  const logFd = fs.openSync(monitorLogPath, "a");

  const childArgs = ["scripts/monitor-managed-runtime.js", args.mode, "--interval", String(args.intervalMs)];
  if (args.tunnelName) {
    childArgs.push("--tunnel-name", args.tunnelName);
  }

  const monitor = spawn(process.execPath, childArgs, {
    cwd: ROOT_DIR,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      MANAGED_RUNTIME_MODE: args.mode,
      MANAGED_RUNTIME_MONITOR_INTERVAL_MS: String(args.intervalMs),
    },
  });

  monitor.unref();
  fs.closeSync(logFd);

  console.log(`Monitor 24x7 iniciado: ${args.mode}`);
  console.log(`PID: ${monitor.pid}`);
  console.log(`Log: ${monitorLogPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
