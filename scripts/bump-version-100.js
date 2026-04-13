const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJsonPath = path.join(root, "package.json");
const packageLockPath = path.join(root, "package-lock.json");
const publicIndexPath = path.join(root, "public", "index.html");
const docsIndexPath = path.join(root, "docs", "index.html");

function parseVersion(version) {
  const match = String(version || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Version invalida: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function nextVersionHundred(version) {
  const parsed = parseVersion(version);
  let { major, minor, patch } = parsed;

  patch += 1;

  if (patch >= 100) {
    patch = 0;
    minor += 1;
  }

  if (minor >= 100) {
    minor = 0;
    major += 1;
  }

  return `${major}.${minor}.${patch}`;
}

function updatePackageJson(oldVersion, newVersion) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

function updatePackageLock(oldVersion, newVersion) {
  const packageLock = JSON.parse(fs.readFileSync(packageLockPath, "utf8"));
  packageLock.version = newVersion;
  if (packageLock.packages && packageLock.packages[""]) {
    packageLock.packages[""].version = newVersion;
  }
  fs.writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`, "utf8");
}

function updateIndexHtml(filePath, oldVersion, newVersion) {
  const content = fs.readFileSync(filePath, "utf8");
  const escapedOld = oldVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const versionRegex = new RegExp(escapedOld, "g");
  fs.writeFileSync(filePath, content.replace(versionRegex, newVersion), "utf8");
}

function main() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const oldVersion = String(packageJson.version || "").trim();
  const newVersion = nextVersionHundred(oldVersion);

  updatePackageJson(oldVersion, newVersion);
  updatePackageLock(oldVersion, newVersion);
  updateIndexHtml(publicIndexPath, oldVersion, newVersion);
  updateIndexHtml(docsIndexPath, oldVersion, newVersion);

  console.log(`Version actualizada: ${oldVersion} -> ${newVersion}`);
}

main();
