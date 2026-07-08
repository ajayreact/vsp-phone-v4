# VSP Phone v4 — Phase 1 PowerShell helpers (Windows hosts without make)

param(
  [Parameter(Position = 0)]
  [ValidateSet('help', 'env', 'up', 'down', 'core', 'extras', 'ps', 'logs', 'health', 'validate', 'prune')]
  [string]$Command = 'help'
)

$ErrorActionPreference = 'Stop'
$Compose = 'docker'
$EnvFile = '.env'

function Ensure-Env {
  if (-not (Test-Path $EnvFile)) {
    Copy-Item '.env.example' $EnvFile
    Write-Host "Created $EnvFile"
  }
}

function Invoke-Compose {
  param([string[]]$Args)
  Ensure-Env
  & $Compose compose --env-file $EnvFile @Args
}

switch ($Command) {
  'help' {
    Write-Host @"
VSP Phone v4 Phase 1 (scripts/dev.ps1)
  .\scripts\dev.ps1 env
  .\scripts\dev.ps1 up
  .\scripts\dev.ps1 core
  .\scripts\dev.ps1 extras
  .\scripts\dev.ps1 down
  .\scripts\dev.ps1 prune
  .\scripts\dev.ps1 ps
  .\scripts\dev.ps1 logs
  .\scripts\dev.ps1 health
  .\scripts\dev.ps1 validate
"@
  }
  'env' { Ensure-Env }
  'up' { Invoke-Compose @('up', '-d', '--build') }
  'core' { Invoke-Compose @('up', '-d', 'postgres', 'redis') }
  'extras' { Invoke-Compose @('--profile', 'extras', 'up', '-d', '--build') }
  'down' { Invoke-Compose @('--profile', 'extras', 'down') }
  'prune' { Invoke-Compose @('--profile', 'extras', 'down', '-v') }
  'ps' { Invoke-Compose @('ps') }
  'logs' { Invoke-Compose @('logs', '-f', '--tail=200') }
  'validate' {
    Invoke-Compose @('config') | Out-Null
    Write-Host 'compose config OK'
  }
  'health' {
    $api = Invoke-RestMethod 'http://127.0.0.1:3000/api/health'
    $ready = Invoke-RestMethod 'http://127.0.0.1:3000/api/ready'
    $admin = Invoke-RestMethod 'http://127.0.0.1:3001/api/health'
    if ($api.status -ne 'ok' -or $ready.status -ne 'ok' -or $admin.status -ne 'ok') {
      throw 'Health check failed'
    }
    Write-Host 'Health checks passed'
    $api; $ready; $admin
  }
}
