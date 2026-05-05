param(
  [switch]$RemoveReports,
  [switch]$RemovePycache
)

$ErrorActionPreference = "Stop"

Write-Host "Limpando artefatos locais..."

if ($RemovePycache) {
  Get-ChildItem -Path . -Recurse -Directory -Filter "__pycache__" | ForEach-Object {
    Write-Host "Removendo $($_.FullName)"
    Remove-Item -Recurse -Force $_.FullName
  }
}

if ($RemoveReports -and (Test-Path "reports")) {
  Write-Host "Removendo reports/"
  Remove-Item -Recurse -Force "reports"
}

Write-Host "Concluido."
