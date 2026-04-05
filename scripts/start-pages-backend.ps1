$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

try {
  $env:HOST = "127.0.0.1"
  $env:PORT = "3221"
  $env:CORS_ALLOWED_ORIGINS = "https://ivanlipay-eng.github.io"

  Write-Host "Iniciando backend local para GitHub Pages en http://localhost:3221" -ForegroundColor Cyan
  Write-Host "Origen permitido: https://ivanlipay-eng.github.io" -ForegroundColor Cyan

  node server.js
}
finally {
  Pop-Location
}