$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

try {
    & docker info | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "docker info failed with exit code $LASTEXITCODE"
    }
} catch {
    Write-Error "Docker engine is not reachable. Start Docker Desktop before using .\stop-demo.ps1."
}

Push-Location $repoRoot
try {
    Write-Host "Stopping Docker demo stack..." -ForegroundColor Cyan
    & docker compose down
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose down failed with exit code $LASTEXITCODE"
    }
    Write-Host "Docker demo stack stopped." -ForegroundColor Green
} finally {
    Pop-Location
}
