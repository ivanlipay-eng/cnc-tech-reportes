const fs = require("node:fs/promises");
const path = require("node:path");

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, "public");
const targetDir = path.join(rootDir, "docs");
const targetPublicDir = path.join(targetDir, "public");

async function copyRecursive(sourcePath, targetPath) {
  const stat = await fs.stat(sourcePath);
  if (stat.isDirectory()) {
    await fs.mkdir(targetPath, { recursive: true });
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      await copyRecursive(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
    }
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

async function main() {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
  await copyRecursive(sourceDir, targetPublicDir);
  await fs.writeFile(path.join(targetDir, ".nojekyll"), "", "utf8");
  await fs.writeFile(
    path.join(targetDir, "index.html"),
    `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=./public/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CNC Tech Reportes</title>
    <script>
      window.location.replace("./public/");
    </script>
  </head>
  <body>
    <p>Redirigiendo a CNC Tech Reportes...</p>
  </body>
</html>
`,
    "utf8",
  );
  console.log("GitHub Pages listo en docs/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
