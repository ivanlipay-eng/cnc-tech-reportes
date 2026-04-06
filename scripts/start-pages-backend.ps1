$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

try {
  node scripts/start-managed-runtime.js pages
}
finally {
  Pop-Location
}