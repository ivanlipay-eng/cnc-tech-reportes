param(
  [ValidateSet("install", "start", "stop", "restart", "status", "uninstall")]
  [string]$Action = "status",
  [string]$ServiceName = "CncTechBackend",
  [string]$BindHost = "127.0.0.1",
  [int]$Port = 3221,
  [string]$AllowedOrigins = "*"
)

$ErrorActionPreference = "Stop"

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-Admin {
  if (-not (Test-IsAdministrator)) {
    throw "Debes ejecutar este comando en una terminal de PowerShell abierta como Administrador."
  }
}

function Get-NodePath {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    throw "No se encontro node en PATH. Instala Node.js o agrega node.exe al PATH."
  }
  return $nodeCommand.Source
}

function Get-ServiceSafe([string]$Name) {
  return Get-Service -Name $Name -ErrorAction SilentlyContinue
}

function New-OrUpdateService {
  Assert-Admin

  $root = Split-Path -Parent $PSScriptRoot
  $nodePath = Get-NodePath
  $escapedRoot = $root.Replace('"', '""')
  $escapedNode = $nodePath.Replace('"', '""')
  $escapedHost = $BindHost.Replace('"', '""')
  $escapedAllowedOrigins = $AllowedOrigins.Replace('"', '""')

  $command = "`"$env:ComSpec`" /d /s /c `"set HOST=$escapedHost&& set PORT=$Port&& set CORS_ALLOWED_ORIGINS=$escapedAllowedOrigins&& cd /d `"`"$escapedRoot`"`" && `"`"$escapedNode`"`" server.js`""

  $existing = Get-ServiceSafe -Name $ServiceName

  if ($existing) {
    & sc.exe config $ServiceName binPath= $command start= auto | Out-Null
  }
  else {
    New-Service -Name $ServiceName -BinaryPathName $command -DisplayName "CNC Tech Backend" -StartupType Automatic | Out-Null
  }

  & sc.exe failure $ServiceName reset= 0 actions= restart/5000/restart/5000/restart/5000 | Out-Null
  & sc.exe failureflag $ServiceName 1 | Out-Null
  & sc.exe description $ServiceName "Backend local CNC Tech siempre activo mientras Windows este encendido." | Out-Null

  Start-Service -Name $ServiceName
  Start-Sleep -Seconds 1
}

function Stop-ServiceSafe {
  Assert-Admin
  $service = Get-ServiceSafe -Name $ServiceName
  if (-not $service) {
    Write-Output "Servicio no encontrado: $ServiceName"
    return
  }

  if ($service.Status -ne "Stopped") {
    Stop-Service -Name $ServiceName -Force
  }
}

function Remove-ServiceSafe {
  Assert-Admin
  $service = Get-ServiceSafe -Name $ServiceName
  if (-not $service) {
    Write-Output "Servicio no encontrado: $ServiceName"
    return
  }

  if ($service.Status -ne "Stopped") {
    Stop-Service -Name $ServiceName -Force
  }

  & sc.exe delete $ServiceName | Out-Null
}

function Show-ServiceStatus {
  $service = Get-ServiceSafe -Name $ServiceName
  if (-not $service) {
    Write-Output "Servicio no encontrado: $ServiceName"
    return
  }

  Write-Output "Servicio: $($service.Name)"
  Write-Output "Estado: $($service.Status)"
  Write-Output "Tipo de inicio: $(Get-CimInstance Win32_Service -Filter \"Name='$ServiceName'\" | Select-Object -ExpandProperty StartMode)"
}

switch ($Action) {
  "install" {
    New-OrUpdateService
    Show-ServiceStatus
    break
  }
  "start" {
    Assert-Admin
    Start-Service -Name $ServiceName
    Show-ServiceStatus
    break
  }
  "stop" {
    Stop-ServiceSafe
    Show-ServiceStatus
    break
  }
  "restart" {
    Assert-Admin
    Restart-Service -Name $ServiceName -Force
    Start-Sleep -Seconds 1
    Show-ServiceStatus
    break
  }
  "uninstall" {
    Remove-ServiceSafe
    Write-Output "Servicio eliminado: $ServiceName"
    break
  }
  default {
    Show-ServiceStatus
    break
  }
}