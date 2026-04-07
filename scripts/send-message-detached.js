const fs = require("node:fs/promises");

async function main() {
  const [url, promptPath, outputPath] = process.argv.slice(2);
  if (!url || !promptPath || !outputPath) {
    throw new Error("Uso: node send-message-detached.js <url> <promptPath> <outputPath>");
  }

  const prompt = await fs.readFile(promptPath, "utf8");
  await fs.writeFile(outputPath, JSON.stringify({ status: "started" }, null, 2), "utf8");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: prompt }),
  });

  const text = await response.text();
  await fs.writeFile(
    outputPath,
    JSON.stringify(
      {
        status: response.ok ? "completed" : "failed",
        statusCode: response.status,
        body: text,
      },
      null,
      2
    ),
    "utf8"
  );
}

main().catch(async (error) => {
  const outputPath = process.argv[4];
  if (outputPath) {
    await fs.writeFile(
      outputPath,
      JSON.stringify(
        {
          status: "error",
          error: error && error.stack ? error.stack : String(error),
        },
        null,
        2
      ),
      "utf8"
    ).catch(() => {});
  }
  process.exitCode = 1;
});