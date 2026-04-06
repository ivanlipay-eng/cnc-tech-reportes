const { getManagedRuntimeStatus, STATE_FILE } = require("./managed-runtime");

function main() {
  const runtimes = getManagedRuntimeStatus();

  if (!runtimes.length) {
    console.log("No hay runtime gestionado activo.");
    console.log(`Estado: ${STATE_FILE}`);
    return;
  }

  for (const runtime of runtimes) {
    console.log(`Modo: ${runtime.mode}`);
    console.log(`  Backend: http://${runtime.host}:${runtime.port}`);
    console.log(`  Backend PID ${runtime.backendPid}: ${runtime.backendAlive ? "activo" : "no responde"}`);
    if (runtime.tunnelPid) {
      console.log(`  Tunel PID ${runtime.tunnelPid}: ${runtime.tunnelAlive ? "activo" : "no responde"}`);
    }
    if (runtime.tunnelUrl) {
      console.log(`  URL publica: ${runtime.tunnelUrl}`);
    }
    if (runtime.tunnelName) {
      console.log(`  Tunel nombrado: ${runtime.tunnelName}`);
    }
    console.log(`  Iniciado: ${runtime.startedAt}`);
  }

  console.log(`Estado: ${STATE_FILE}`);
}

main();