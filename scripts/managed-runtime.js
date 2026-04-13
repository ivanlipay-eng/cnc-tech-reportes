const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const TMP_DIR = path.join(ROOT_DIR, "tmp");
const LOG_DIR = path.join(TMP_DIR, "runtime-logs");
const STATE_FILE = path.join(TMP_DIR, "managed-runtime.json");

const DEFAULTS = {
  pages: {
    mode: "pages",
    host: "127.0.0.1",
    port: 3221,
    allowedOrigins: "https://ivanlipay-eng.github.io",
  },
  public: {
    mode: "public",
    host: "127.0.0.1",
    port: 3221,
    allowedOrigins: "*",
  },
  permanent: {
    mode: "permanent",
    host: "127.0.0.1",
    port: 3226,
    allowedOrigins: "https://ivanlipay-eng.github.io",
  },
};

function ensureDirs() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { runtimes: [] };
  }
}

function writeState(state) {
  ensureDirs();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function runPowerShell(command, { allowFailure = false } = {}) {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      cwd: ROOT_DIR,
      encoding: "utf8",
    }
  );

  if (result.error) {
    if (allowFailure) {
      return "";
    }
    throw result.error;
  }

  if (result.status !== 0) {
    if (allowFailure) {
      return result.stdout || "";
    }
    throw new Error(result.stderr || `PowerShell termino con codigo ${result.status}`);
  }

  return result.stdout || "";
}

function readPowerShellJson(command, { allowFailure = false } = {}) {
  const output = runPowerShell(command, { allowFailure }).trim();
  if (!output) {
    return [];
  }

  return normalizeArray(JSON.parse(output));
}

function getCloudflaredPath() {
  const bundledPath = path.join(
    process.env.LOCALAPPDATA || "",
    "Microsoft",
    "WinGet",
    "Packages",
    "Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe",
    "cloudflared.exe"
  );

  if (bundledPath && fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  const whereResult = spawnSync("where.exe", ["cloudflared"], { encoding: "utf8" });
  if (whereResult.status === 0) {
    const firstMatch = (whereResult.stdout || "").split(/\r?\n/).find(Boolean);
    if (firstMatch) {
      return firstMatch.trim();
    }
  }

  throw new Error("No se encontro cloudflared. Instala Cloudflare Tunnel o agrega cloudflared.exe al PATH.");
}

function getListeningPids(port) {
  const command = `$items = @(Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); if ($items.Count -eq 0) { '[]' } else { $items | ConvertTo-Json -Compress }`;
  return readPowerShellJson(command, { allowFailure: true }).map((value) => Number(value)).filter(Boolean);
}

function listCandidateProcesses() {
  const command = "$items = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('node.exe','cloudflared.exe','node','cloudflared') } | Select-Object ProcessId,Name,CommandLine); if ($items.Count -eq 0) { '[]' } else { $items | ConvertTo-Json -Compress }";
  return readPowerShellJson(command, { allowFailure: true }).map((item) => ({
    pid: Number(item.ProcessId),
    name: item.Name || "",
    commandLine: item.CommandLine || "",
  }));
}

function getProcessInfo(pid) {
  const command = `$item = Get-CimInstance Win32_Process -Filter \"ProcessId = ${Number(pid)}\" | Select-Object ProcessId,Name,CommandLine; if ($null -eq $item) { '[]' } else { @($item) | ConvertTo-Json -Compress }`;
  const items = readPowerShellJson(command, { allowFailure: true });
  if (!items.length) {
    return null;
  }

  return {
    pid: Number(items[0].ProcessId),
    name: items[0].Name || "",
    commandLine: items[0].CommandLine || "",
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

async function killPid(pid) {
  if (!pid || !isProcessAlive(pid)) {
    return false;
  }

  process.kill(pid, "SIGKILL");

  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return true;
    }
    await sleep(150);
  }

  return !isProcessAlive(pid);
}

function isManagedBackendProcess(info) {
  return /node(\.exe)?$/i.test(info.name) && /server\.js/.test(info.commandLine) && /--managed-runtime=/.test(info.commandLine);
}

function isLegacyProjectBackendProcess(info) {
  return /node(\.exe)?$/i.test(info.name) && /server\.js/.test(info.commandLine);
}

function isQuickTunnelForPort(info, port) {
  return /cloudflared(\.exe)?$/i.test(info.name) && info.commandLine.includes(`http://127.0.0.1:${port}`);
}

function isNamedTunnel(info, tunnelName) {
  return /cloudflared(\.exe)?$/i.test(info.name) && info.commandLine.includes(`tunnel run ${tunnelName}`);
}

async function cleanupManagedState() {
  const state = readState();
  if (!Array.isArray(state.runtimes) || !state.runtimes.length) {
    return [];
  }

  const stopped = [];
  for (const runtime of state.runtimes) {
    if (runtime.tunnelPid) {
      await killPid(runtime.tunnelPid);
    }
    if (runtime.backendPid) {
      await killPid(runtime.backendPid);
    }
    stopped.push(runtime.mode);
  }

  writeState({ runtimes: [] });
  return stopped;
}

async function cleanupPortConflicts(port) {
  const pids = getListeningPids(port);
  for (const pid of pids) {
    const info = getProcessInfo(pid);
    if (!info) {
      continue;
    }

    if (isManagedBackendProcess(info) || isLegacyProjectBackendProcess(info)) {
      await killPid(pid);
      continue;
    }

    throw new Error(`El puerto ${port} ya esta ocupado por un proceso no reconocido: PID ${pid} (${info.name}).`);
  }
}

async function cleanupTunnelConflicts(mode, port, tunnelName) {
  const processes = listCandidateProcesses();
  for (const info of processes) {
    const matchesQuickTunnel = mode === "public" && isQuickTunnelForPort(info, port);
    const matchesNamedTunnel = mode === "permanent" && tunnelName && isNamedTunnel(info, tunnelName);
    if (matchesQuickTunnel || matchesNamedTunnel) {
      await killPid(info.pid);
    }
  }
}

async function waitForPort(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const isOpen = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port }, () => {
        socket.end();
        resolve(true);
      });

      socket.on("error", () => {
        resolve(false);
      });
    });

    if (isOpen) {
      return true;
    }

    await sleep(250);
  }

  throw new Error(`El backend no respondio en ${host}:${port} dentro del tiempo esperado.`);
}

async function waitForQuickTunnelUrl(logPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const urlRegex = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

  while (Date.now() < deadline) {
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, "utf8");
      const match = content.match(urlRegex);
      if (match) {
        return match[0];
      }
    }

    await sleep(250);
  }

  throw new Error("No se pudo obtener la URL publica del tunel quick de Cloudflare.");
}

function buildRuntimeRecord(config, details) {
  return {
    mode: config.mode,
    host: config.host,
    port: config.port,
    allowedOrigins: config.allowedOrigins,
    tunnelName: config.tunnelName || null,
    backendPid: details.backendPid,
    tunnelPid: details.tunnelPid || null,
    backendLogPath: details.backendLogPath,
    tunnelLogPath: details.tunnelLogPath || null,
    tunnelUrl: details.tunnelUrl || null,
    startedAt: new Date().toISOString(),
  };
}

function createConfig(mode, overrides = {}) {
  const base = DEFAULTS[mode];
  if (!base) {
    throw new Error(`Modo no soportado: ${mode}`);
  }

  const port = Number(overrides.port || process.env.PORT || base.port);
  const allowedOrigins = overrides.allowedOrigins || process.env.CORS_ALLOWED_ORIGINS || base.allowedOrigins;
  const host = overrides.host || process.env.HOST || base.host;
  const tunnelName = overrides.tunnelName || process.env.CLOUDFLARED_TUNNEL_NAME || "";

  if (mode === "permanent" && !tunnelName) {
    throw new Error("Define CLOUDFLARED_TUNNEL_NAME antes de iniciar el tunel permanente.");
  }

  return {
    mode,
    host,
    port,
    allowedOrigins,
    tunnelName,
  };
}

function openLogFile(logPath) {
  ensureDirs();
  return fs.openSync(logPath, "a");
}

async function startManagedRuntime(mode, overrides = {}) {
  const config = createConfig(mode, overrides);
  ensureDirs();

  await cleanupManagedState();
  await cleanupPortConflicts(config.port);
  await cleanupTunnelConflicts(config.mode, config.port, config.tunnelName);

  const timestamp = Date.now();
  const backendLogPath = path.join(LOG_DIR, `${config.mode}-backend-${timestamp}.log`);
  const backendLogFd = openLogFile(backendLogPath);
  const backend = spawn(process.execPath, ["server.js", `--managed-runtime=${config.mode}`], {
    cwd: ROOT_DIR,
    detached: true,
    stdio: ["ignore", backendLogFd, backendLogFd],
    env: {
      ...process.env,
      HOST: config.host,
      PORT: String(config.port),
      CORS_ALLOWED_ORIGINS: config.allowedOrigins,
    },
  });
  backend.unref();
  fs.closeSync(backendLogFd);

  await waitForPort(config.host, config.port, 12000);

  let tunnelPid = null;
  let tunnelLogPath = null;
  let tunnelUrl = null;

  if (config.mode === "public" || config.mode === "permanent") {
    const cloudflaredPath = getCloudflaredPath();
    tunnelLogPath = path.join(LOG_DIR, `${config.mode}-tunnel-${timestamp}.log`);
    const tunnelLogFd = openLogFile(tunnelLogPath);
    const tunnelArgs = config.mode === "public"
      ? ["tunnel", "--url", `http://${config.host}:${config.port}`, "--logfile", tunnelLogPath]
      : ["tunnel", "run", config.tunnelName, "--logfile", tunnelLogPath];

    const tunnel = spawn(cloudflaredPath, tunnelArgs, {
      cwd: ROOT_DIR,
      detached: true,
      stdio: ["ignore", tunnelLogFd, tunnelLogFd],
      env: {
        ...process.env,
      },
    });
    tunnel.unref();
    fs.closeSync(tunnelLogFd);
    tunnelPid = tunnel.pid;

    if (config.mode === "public") {
      tunnelUrl = await waitForQuickTunnelUrl(tunnelLogPath, 20000);
    }
  }

  const runtime = buildRuntimeRecord(config, {
    backendPid: backend.pid,
    tunnelPid,
    backendLogPath,
    tunnelLogPath,
    tunnelUrl,
  });

  writeState({ runtimes: [runtime] });
  return runtime;
}

async function stopManagedRuntime() {
  const state = readState();
  const runtimes = Array.isArray(state.runtimes) ? state.runtimes : [];
  const stopped = [];

  for (const runtime of runtimes) {
    const tunnelStopped = runtime.tunnelPid ? await killPid(runtime.tunnelPid) : false;
    const backendStopped = runtime.backendPid ? await killPid(runtime.backendPid) : false;
    stopped.push({
      mode: runtime.mode,
      backendPid: runtime.backendPid,
      backendStopped,
      tunnelPid: runtime.tunnelPid,
      tunnelStopped,
    });
  }

  writeState({ runtimes: [] });
  return stopped;
}

function getManagedRuntimeStatus() {
  const state = readState();
  const runtimes = Array.isArray(state.runtimes) ? state.runtimes : [];
  return runtimes.map((runtime) => ({
    ...runtime,
    backendAlive: isProcessAlive(runtime.backendPid),
    tunnelAlive: runtime.tunnelPid ? isProcessAlive(runtime.tunnelPid) : false,
  }));
}

async function ensureManagedRuntimeHealthy(options = {}) {
  const preferredMode = options.mode || process.env.MANAGED_RUNTIME_MODE || "permanent";
  const status = getManagedRuntimeStatus();

  if (!status.length) {
    const runtime = await startManagedRuntime(preferredMode, options);
    return {
      action: "started",
      runtime,
    };
  }

  const runtimeStatus = status[0];
  const needsTunnel = runtimeStatus.mode === "public" || runtimeStatus.mode === "permanent";
  const unhealthy = !runtimeStatus.backendAlive || (needsTunnel && !runtimeStatus.tunnelAlive);

  if (!unhealthy) {
    return {
      action: "healthy",
      runtime: runtimeStatus,
    };
  }

  const restarted = await startManagedRuntime(runtimeStatus.mode, {
    host: runtimeStatus.host,
    port: runtimeStatus.port,
    allowedOrigins: runtimeStatus.allowedOrigins,
    tunnelName: runtimeStatus.tunnelName || options.tunnelName || process.env.CLOUDFLARED_TUNNEL_NAME || "",
  });

  return {
    action: "restarted",
    previousRuntime: runtimeStatus,
    runtime: restarted,
  };
}

module.exports = {
  STATE_FILE,
  ensureManagedRuntimeHealthy,
  getManagedRuntimeStatus,
  startManagedRuntime,
  stopManagedRuntime,
};