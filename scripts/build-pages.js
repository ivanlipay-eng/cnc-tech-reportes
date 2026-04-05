const fs = require("node:fs/promises");
const path = require("node:path");

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, "public");
const targetDir = path.join(rootDir, "docs");

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
  await copyRecursive(sourceDir, targetDir);
  await fs.writeFile(path.join(targetDir, ".nojekyll"), "", "utf8");
  console.log("GitHub Pages listo en docs/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});