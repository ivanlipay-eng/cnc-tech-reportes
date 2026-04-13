const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  ensureManagedRuntimeHealthy,
  STATE_FILE,
} = require("./managed-runtime");

const TMP_DIR = path.resolve(__dirname, "..", "tmp");

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function buildLockPath(mode) {
  return path.join(TMP_DIR, `managed-runtime-monitor-${mode}.lock`);
}

function shouldContinue(runningFlag) {
  return runningFlag.current && !process.exitCode;
}

function acquireLock(mode) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const lockPath = buildLockPath(mode);

  if (fs.existsSync(lockPath)) {
    try {
      const raw = fs.readFileSync(lockPath, "utf8");
      const data = JSON.parse(raw);
      if (isProcessAlive(data.pid)) {
        throw new Error(`Ya existe un monitor activo para ${mode} (PID ${data.pid}).`);
      }
    } catch (error) {
      if (error.message.startsWith("Ya existe")) {
        throw error;
      }
      // Si el lock no es valido, se sobrescribe.
    }
  }

  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2));
  return lockPath;
}

function syncTunnelUrlToGitHubPages(runtime) {
  if (runtime?.mode !== "public" || !runtime?.tunnelUrl) {
    return;
  }

  const result = spawnSync(process.execPath, ["scripts/sync-public-backend-url.js", runtime.tunnelUrl], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
  });

  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.error) {
    console.error(`[monitor] No se pudo sincronizar URL publica: ${result.error.message || result.error}`);
    return;
  }

  if (result.status !== 0) {
    const detail = output || `codigo ${result.status}`;
    console.error(`[monitor] Error al publicar URL del tunel: ${detail}`);
    return;
  }

  if (output) {
    console.log(`[monitor] ${output}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const lockPath = acquireLock(args.mode);
  const runningFlag = { current: true };

  const releaseLock = () => {
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    } catch {
      // Ignora errores de limpieza.
    }
  };

  process.on("SIGINT", () => {
    runningFlag.current = false;
    releaseLock();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    runningFlag.current = false;
    releaseLock();
    process.exit(0);
  });

  console.log(`Monitor runtime activo (${args.mode}) cada ${args.intervalMs} ms`);
  console.log(`Estado: ${STATE_FILE}`);

  while (shouldContinue(runningFlag)) {
    try {
      const result = await ensureManagedRuntimeHealthy(args);
      if (result.action === "started") {
        console.log(`[monitor] Runtime iniciado: ${result.runtime.mode} (${result.runtime.host}:${result.runtime.port})`);
        syncTunnelUrlToGitHubPages(result.runtime);
      } else if (result.action === "restarted") {
        console.log(`[monitor] Runtime reiniciado: ${result.runtime.mode} (${result.runtime.host}:${result.runtime.port})`);
        syncTunnelUrlToGitHubPages(result.runtime);
      }
    } catch (error) {
      console.error(`[monitor] ${error.message || error}`);
    }

    await sleep(args.intervalMs);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
