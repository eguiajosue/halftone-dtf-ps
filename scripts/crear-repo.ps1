param([string]$RepoName = 'halftone-dtf-ps')
$ErrorActionPreference = 'Stop'
if ($RepoName -notmatch '^[A-Za-z0-9_.-]+$') { throw 'Nombre de repositorio inválido.' }
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Instala Git primero.' }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Instala GitHub CLI primero.' }
gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Ejecuta gh auth login antes de usar este script.' }
if (-not (Test-Path .git)) {
  git init -b main
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo inicializar Git.' }
}
git add .
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron preparar los archivos.' }
git diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
  git commit -m 'Add Halftone DTF Photoshop UXP beta'
  if ($LASTEXITCODE -ne 0) { throw 'Configura tu nombre/correo de Git y repite.' }
}
gh repo create $RepoName --private --source . --remote origin --push
if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear/subir el repositorio. Revisa si ya existe o si hay un remote origin configurado.' }
