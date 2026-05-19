# Windows development launcher: backend 3001, Vite 5174.
chcp 65001 | Out-Null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "=== Start dev servers (backend 3001, frontend 5174) ==="

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "pnpm not found. Install it first: npm install -g pnpm" -ForegroundColor Red
    exit 1
}

# Backend proxy port must match client/vite.config.js.
$env:PORT = "3001"

# Development always uses the local three-engine pool. This intentionally
# overrides stale shell variables from previous one-engine runs.
$env:TOMATO_SERVER_URLS = "http://127.0.0.1:18423,http://127.0.0.1:18424,http://127.0.0.1:18425"
Remove-Item Env:TOMATO_SERVER_URL -ErrorAction SilentlyContinue

# Install workspace dependencies when local binaries are missing.
$missingDeps = @(
    -not (Test-Path "node_modules\.bin\concurrently.cmd"),
    -not (Test-Path "client\node_modules\vite\bin\vite.js"),
    -not (Test-Path "server\node_modules\better-sqlite3")
) -contains $true

if ($missingDeps) {
    Write-Host "Dependencies are missing, running pnpm install..."
    pnpm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "pnpm install failed" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

function Stop-PortOwner {
    param([int]$Port)

    $processIds = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
        Where-Object { $_.OwningProcess -and $_.OwningProcess -ne $PID } |
        Select-Object -ExpandProperty OwningProcess -Unique

    foreach ($processId in $processIds) {
        Write-Host "Port $Port is used by process $processId, stopping it..."
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Write-Host "Released port $Port"
        } catch {
            Write-Host "Failed to release port $Port`: $_" -ForegroundColor Yellow
        }
    }
}

# Ports: backend 3001, frontend Vite 5174. Do not stop Rust engine ports here.
@(3001, 5174) | ForEach-Object { Stop-PortOwner -Port $_ }

Start-Sleep -Seconds 1

Write-Host "Backend URL:  http://127.0.0.1:$env:PORT"
Write-Host "Frontend URL: http://localhost:5174"
$engineUrls = $env:TOMATO_SERVER_URLS
if (-not $engineUrls) {
    $engineUrls = $env:TOMATO_SERVER_URL
}
Write-Host "Engine URLs:  $engineUrls"
Write-Host "Starting dev servers..."
pnpm dev
