$ErrorActionPreference = "Stop"

function Get-CloudflaredPath {
  $command = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $wingetPath = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
  if (Test-Path $wingetPath) {
    return $wingetPath
  }

  throw "No se encontro cloudflared. Instala Cloudflare Tunnel o agrega cloudflared.exe al PATH."
}

$root = Split-Path -Parent $PSScriptRoot
$tunnelName = $env:CLOUDFLARED_TUNNEL_NAME
$port = if ($env:PORT) { $env:PORT } else { "3226" }
$allowedOrigins = if ($env:CORS_ALLOWED_ORIGINS) { $env:CORS_ALLOWED_ORIGINS } else { "https://ivanlipay-eng.github.io" }

if ([string]::IsNullOrWhiteSpace($tunnelName)) {
  throw "Define CLOUDFLARED_TUNNEL_NAME antes de ejecutar este script. Ejemplo: `$env:CLOUDFLARED_TUNNEL_NAME='cnc-tech-reportes'"
}

Push-Location $root

try {
  $cloudflaredPath = Get-CloudflaredPath
  $backendCommand = "`$env:HOST='127.0.0.1'; `$env:PORT='$port'; `$env:CORS_ALLOWED_ORIGINS='$allowedOrigins'; node server.js"

  Start-Process powershell -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command", $backendCommand
  ) -WindowStyle Minimized | Out-Null

  Start-Sleep -Seconds 3

  Write-Host "Backend local iniciado en http://127.0.0.1:$port" -ForegroundColor Cyan
  Write-Host "Origen permitido: $allowedOrigins" -ForegroundColor Cyan
  Write-Host "Iniciando tunel permanente: $tunnelName" -ForegroundColor Cyan

  & $cloudflaredPath tunnel run $tunnelName
}
finally {
  Pop-Location
}