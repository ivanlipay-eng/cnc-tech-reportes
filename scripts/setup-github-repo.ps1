param(
  [string]$Owner,
  [string]$RepoName = "cnc-tech-reportes",
  [ValidateSet("public", "private")]
  [string]$Visibility = "private"
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "No se encontro el comando requerido: $Name"
  }
}

function Run-Git([string[]]$Arguments) {
  & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo git $($Arguments -join ' ')"
  }
}

function Run-Gh([string[]]$Arguments) {
  & gh @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo gh $($Arguments -join ' ')"
  }
}

function Get-CurrentBranch() {
  $branch = & git symbolic-ref --short HEAD 2>$null
  if ($LASTEXITCODE -eq 0 -and $branch) {
    return $branch.Trim()
  }

  return ""
}

function Get-OriginUrl() {
  $remoteUrl = & cmd /c "git remote get-url origin 2>nul"
  if ($LASTEXITCODE -eq 0 -and $remoteUrl) {
    return $remoteUrl.Trim()
  }

  return ""
}

function Test-RepoExists([string]$Slug) {
  & cmd /c "gh repo view $Slug 1>nul 2>nul"
  return $LASTEXITCODE -eq 0
}

Require-Command "git"
Require-Command "gh"

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

try {
  gh auth status *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Abriendo autenticacion web de GitHub..." -ForegroundColor Cyan
    Run-Gh @("auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web")
  }

  if (-not $Owner) {
    $Owner = (& gh api user --jq ".login").Trim()
  }

  if (-not $Owner) {
    $Owner = Read-Host "Cuenta u organizacion de GitHub"
  }

  if (-not $Owner) {
    throw "Debes indicar una cuenta u organizacion de GitHub."
  }

  Run-Gh @("auth", "setup-git")

  if (-not (Test-Path ".git")) {
    Run-Git @("init")
  }

  $currentBranch = Get-CurrentBranch

  if ($currentBranch -ne "main") {
    Run-Git @("branch", "-M", "main")
  }

  $remoteUrl = "https://github.com/$Owner/$RepoName.git"
  $existingOrigin = Get-OriginUrl
  if ($existingOrigin) {
    Run-Git @("remote", "set-url", "origin", $remoteUrl)
  }
  else {
    Run-Git @("remote", "add", "origin", $remoteUrl)
  }

  if (-not (Test-RepoExists "$Owner/$RepoName")) {
    Write-Host "Creando repositorio $Owner/$RepoName..." -ForegroundColor Cyan
    Run-Gh @("repo", "create", "$Owner/$RepoName", "--$Visibility", "--source", ".", "--remote", "origin", "--description", "CNC Tech Reportes")
  }

  Run-Git @("add", ".")

  & git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    Run-Git @("commit", "-m", "Initial GitHub Pages setup")
  }

  Run-Git @("push", "-u", "origin", "main")

  Write-Host "Intentando activar GitHub Pages desde la raiz del repositorio..." -ForegroundColor Cyan
  & gh api --method POST "/repos/$Owner/$RepoName/pages" --field source[branch]=main --field source[path]="/" *> $null

  if ($LASTEXITCODE -ne 0) {
    Write-Host "No se pudo activar Pages automaticamente. Puedes activarlo en Settings > Pages." -ForegroundColor Yellow
  }
  else {
    Write-Host "GitHub Pages activado correctamente." -ForegroundColor Green
  }

  Write-Host "Repositorio listo: https://github.com/$Owner/$RepoName" -ForegroundColor Green
  Write-Host "URL esperada de Pages: https://$Owner.github.io/$RepoName/" -ForegroundColor Green
}
finally {
  Pop-Location
}