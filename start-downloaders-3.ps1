param(
    [string]$ExePath = "D:\tomato\TomatoNovelDownloader-Win64-v2.4.7.exe",
    [int[]]$Ports = @(18423, 18424, 18425),
    [string]$Password = "",
    [switch]$UseIsolatedDataDirs,
    [string]$DataRoot = ".runtime\downloaders"
)

# Start three TomatoNovelDownloader engine instances for local development.
chcp 65001 | Out-Null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "=== Start Tomato downloader engines ==="

function Resolve-DownloaderExe {
    param([string]$InputPath)

    if ($InputPath) {
        $resolved = Resolve-Path $InputPath -ErrorAction SilentlyContinue
        if ($resolved) {
            return $resolved.Path
        }
        throw "Downloader exe not found: $InputPath"
    }

    $candidates = @(
        ".\TomatoNovelDownloader.exe",
        ".\tomato-novel-downloader.exe",
        ".\Tomato-Novel-Downloader-main\TomatoNovelDownloader.exe",
        ".\Tomato-Novel-Downloader-main\tomato-novel-downloader.exe",
        ".\Tomato-Novel-Downloader-main\target\release\tomato-novel-downloader.exe",
        ".\Tomato-Novel-Downloader-main\target\release\TomatoNovelDownloader.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return (Resolve-Path $candidate).Path
        }
    }

    throw "Downloader exe not found. Put TomatoNovelDownloader.exe in the project root or run: .\start-downloaders-3.ps1 -ExePath C:\path\TomatoNovelDownloader.exe"
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

$exe = Resolve-DownloaderExe -InputPath $ExePath
$exeDir = Split-Path -Parent $exe
$logsDir = Join-Path $root ".runtime\logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

if ($UseIsolatedDataDirs) {
    New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null
}

$urls = @()
foreach ($port in $Ports) {
    Stop-PortOwner -Port $port
    $urls += "http://127.0.0.1:$port"
}

Write-Host "Downloader exe: $exe"
Write-Host "Engine URLs:    $($urls -join ',')"

foreach ($port in $Ports) {
    $env:TOMATO_WEB_ADDR = "127.0.0.1:$port"
    if ($Password) {
        $env:TOMATO_WEB_PASSWORD = $Password
    }

    $args = @("--server")
    if ($UseIsolatedDataDirs) {
        $dataDir = Join-Path $DataRoot "engine-$port"
        New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
        $args += @("--data-dir", (Resolve-Path $dataDir).Path)
    }

    $stdout = Join-Path $logsDir "downloader-$port.out.log"
    $stderr = Join-Path $logsDir "downloader-$port.err.log"

    Write-Host "Starting engine on http://127.0.0.1:$port ..."
    Start-Process `
        -FilePath $exe `
        -ArgumentList $args `
        -WorkingDirectory $exeDir `
        -WindowStyle Minimized `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr
}

$env:TOMATO_SERVER_URLS = $urls -join ","
Write-Host ""
Write-Host "Started $($Ports.Count) downloader engine(s)."
Write-Host "Use this for Node:"
Write-Host "`$env:TOMATO_SERVER_URLS=`"$env:TOMATO_SERVER_URLS`""
Write-Host ""
Write-Host "Logs: $logsDir"
