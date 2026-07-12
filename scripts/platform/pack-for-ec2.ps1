# Pack Extension-First workspace for EC2 sync (does not include .env)
param(
  [string]$OutDir = "$PSScriptRoot\..\..\dist"
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot\..\.."
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tarName = "vsp-extension-first-$stamp.tgz"
$outPath = Join-Path $OutDir $tarName

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Push-Location $root
try {
  $commit = (git rev-parse HEAD 2>$null)
  $dirty = (git status --porcelain 2>$null)
  @"
{
  "packedAt": "$(Get-Date -Format o)",
  "commit": "$commit",
  "dirty": $(if ($dirty) { 'true' } else { 'false' }),
  "note": "Extension-First deploy bundle — preserve EC2 .env on extract"
}
"@ | Set-Content -Encoding utf8 (Join-Path $root 'static\runtime-verification\DEPLOY_MANIFEST.json')

  # tar via git archive + untracked extension-first files is complex; use tar if available
  $tar = Get-Command tar -ErrorAction SilentlyContinue
  if (-not $tar) {
    throw 'tar not found — install Git for Windows or use WSL to create tarball'
  }

  $exclude = @(
    '--exclude=node_modules',
    '--exclude=.git',
    '--exclude=.next',
    '--exclude=dist',
    '--exclude=.env',
    '--exclude=.env.backup*',
    '--exclude=static/runtime-verification/playwright/test-results'
  )

  & tar -czf $outPath @exclude -C $root .
  Write-Host "Created: $outPath"
  Write-Host "Commit: $commit"
  Write-Host ""
  Write-Host "Upload to EC2:"
  Write-Host "  scp -i YOUR_KEY.pem $outPath ubuntu@32.196.41.160:/tmp/"
  Write-Host ""
  Write-Host "On EC2:"
  Write-Host "  cd /opt/vsp-phone-v4"
  Write-Host "  cp .env /tmp/vsp-env-backup"
  Write-Host "  sudo tar -xzf /tmp/$tarName -C /opt/vsp-phone-v4"
  Write-Host "  cp /tmp/vsp-env-backup .env"
  Write-Host "  sudo bash scripts/platform/ec2-deploy-extension-first.sh"
}
finally {
  Pop-Location
}
