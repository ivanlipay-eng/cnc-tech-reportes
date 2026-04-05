$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

try {
  $backendCommand = "`$env:HOST='127.0.0.1'; `$env:PORT='3221'; `$env:CORS_ALLOWED_ORIGINS='*'; node server.js"

  Start-Process powershell -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command", $backendCommand
  ) -WindowStyle Minimized | Out-Null

  Start-Sleep -Seconds 3

  Write-Host "Backend local iniciado en http://127.0.0.1:3221" -ForegroundColor Cyan
  Write-Host "Abriendo tunel publico con Cloudflare..." -ForegroundColor Cyan
  Write-Host "Cuando aparezca la URL https://...trycloudflare.com, usala como apiBaseUrl en public/config.js" -ForegroundColor Yellow

  cloudflared tunnel --url http://127.0.0.1:3221
}
finally {
  Pop-Location
}