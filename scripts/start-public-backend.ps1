$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

try {
  node scripts/start-runtime-monitor.js public
}
finally {
  Pop-Location
}