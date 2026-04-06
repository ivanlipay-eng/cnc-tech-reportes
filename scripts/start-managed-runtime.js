const { startManagedRuntime, STATE_FILE } = require("./managed-runtime");

function parseArgs(argv) {
  const args = { mode: argv[2] || "public" };

  for (let index = 3; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--port" && next) {
      args.port = Number(next);
      index += 1;
      continue;
    }

    if (current === "--host" && next) {
      args.host = next;
      index += 1;
      continue;
    }

    if (current === "--allowed-origins" && next) {
      args.allowedOrigins = next;
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

async function main() {
  const args = parseArgs(process.argv);
  const runtime = await startManagedRuntime(args.mode, args);

  console.log(`Runtime gestionado iniciado: ${runtime.mode}`);
  console.log(`Backend: http://${runtime.host}:${runtime.port}`);
  console.log(`CORS: ${runtime.allowedOrigins}`);
  if (runtime.tunnelUrl) {
    console.log(`Tunel publico: ${runtime.tunnelUrl}`);
  }
  if (runtime.tunnelName) {
    console.log(`Tunel nombrado: ${runtime.tunnelName}`);
  }
  console.log(`Estado: ${STATE_FILE}`);
  if (runtime.mode === "public") {
    console.log("Actualiza public/config.js con la URL del tunel si quieres publicar esta sesion.");
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});