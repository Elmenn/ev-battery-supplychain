param(
    [switch]$NoBuild,
    [int]$TimeoutSeconds = 300
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendEnvPath = Join-Path $repoRoot "frontend/.env"

function Assert-DockerEngineReady {
    try {
        & docker info | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "docker info failed with exit code $LASTEXITCODE"
        }
    } catch {
        Write-Error "Docker Desktop is installed, but the Docker engine is not reachable. Start Docker Desktop and wait until it is fully running, then rerun .\start-demo.ps1."
    }
}

function Test-HttpOk {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
    } catch {
        return $false
    }
}

if (-not (Test-Path $frontendEnvPath)) {
    Write-Error "Missing frontend/.env. Create it from frontend/.env.sepolia.example before running the demo stack."
}

Assert-DockerEngineReady

Push-Location $repoRoot
try {
    $composeArgs = @("compose", "up", "-d")
    if (-not $NoBuild) {
        $composeArgs += "--build"
    }

    Write-Host "Starting Docker demo stack from $repoRoot..." -ForegroundColor Cyan
    & docker @composeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose up failed with exit code $LASTEXITCODE"
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $targets = @(
        @{ Name = "Backend API"; Url = "http://localhost:5000/health" },
        @{ Name = "Indexer"; Url = "http://localhost:5000/indexer/health" },
        @{ Name = "ZKP Backend"; Url = "http://localhost:5010/health" },
        @{ Name = "Frontend"; Url = "http://localhost:3000" }
    )

    Write-Host "Waiting for services to become healthy..." -ForegroundColor Cyan
    while ((Get-Date) -lt $deadline) {
        $results = foreach ($target in $targets) {
            [pscustomobject]@{
                Name = $target.Name
                Url = $target.Url
                Ready = Test-HttpOk -Url $target.Url
            }
        }

        if (($results | Where-Object { -not $_.Ready }).Count -eq 0) {
            Write-Host ""
            Write-Host "Docker demo stack is ready." -ForegroundColor Green
            $results | Format-Table -AutoSize
            Write-Host ""
            Write-Host "Useful commands:" -ForegroundColor Yellow
            Write-Host "  docker compose logs -f"
            Write-Host "  .\stop-demo.ps1"
            exit 0
        }

        Start-Sleep -Seconds 5
    }

    Write-Warning "Timed out waiting for full readiness after $TimeoutSeconds seconds."
    Write-Host "Current container status:" -ForegroundColor Yellow
    & docker compose ps
    Write-Host ""
    Write-Host "Recent logs:" -ForegroundColor Yellow
    & docker compose logs --tail 100
    exit 1
} finally {
    Pop-Location
}
