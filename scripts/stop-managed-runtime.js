const { stopManagedRuntime, STATE_FILE } = require("./managed-runtime");

async function main() {
  const stopped = await stopManagedRuntime();

  if (!stopped.length) {
    console.log("No habia runtime gestionado activo.");
    console.log(`Estado: ${STATE_FILE}`);
    return;
  }

  for (const runtime of stopped) {
    console.log(`Detenido: ${runtime.mode}`);
    console.log(`  backend PID ${runtime.backendPid}: ${runtime.backendStopped ? "cerrado" : "ya no existia"}`);
    if (runtime.tunnelPid) {
      console.log(`  tunel PID ${runtime.tunnelPid}: ${runtime.tunnelStopped ? "cerrado" : "ya no existia"}`);
    }
  }

  console.log(`Estado: ${STATE_FILE}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});