# Rotate development certificates (PowerShell).
# Usage: .\scripts\tls\rotate-dev-certs.ps1 [-RotateCa]
param([switch]$RotateCa)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$TlsEnv = if ($env:TLS_ENV) { $env:TLS_ENV } else { 'development' }
$Live = Join-Path $Root "infrastructure\tls\$TlsEnv\live"
$Stamp = Get-Date -Format 'yyyyMMddTHHmmssZ'
$Backup = Join-Path $Root "infrastructure\tls\var\backup-$Stamp"

New-Item -ItemType Directory -Path $Backup -Force | Out-Null
if (Test-Path $Live) {
  Copy-Item $Live (Join-Path $Backup 'live') -Recurse -Force
  Write-Host "[ok] backed up live → $Backup\live"
}

if ($RotateCa) {
  if (Test-Path $Live) { Remove-Item $Live -Recurse -Force }
} else {
  foreach ($name in @('api', 'admin', 'sip', 'wss', 'prov', 'kamailio')) {
    $p = Join-Path $Live $name
    if (Test-Path $p) { Remove-Item $p -Recurse -Force }
  }
}

& (Join-Path $PSScriptRoot 'generate-dev-certs.ps1') -Force -TlsEnv $TlsEnv
Write-Host "[ok] rotation complete. Previous material: $Backup"
Write-Host 'Reload Kamailio / API after distributing new material. Dual-publish period is ops-owned.'
