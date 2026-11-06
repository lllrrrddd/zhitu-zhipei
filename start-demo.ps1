param(
    [ValidateRange(1024, 65535)][int]$BackendPort = 8005,
    [ValidateRange(1024, 65535)][int]$FrontendPort = 5173,
    [switch]$NoBrowser,
    [switch]$LegacySamples
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$backendDir = Join-Path $projectRoot 'source/ResumeForge/backend'
$frontendDir = Join-Path $projectRoot 'source/ResumeForge/frontend'
$runtimeDir = Join-Path $projectRoot 'runtime/demo'
$python = Join-Path $backendDir '.venv/Scripts/python.exe'
$node = Join-Path $projectRoot 'runtime/node-v22.23.4-win-x64/node.exe'
$vite = Join-Path $frontendDir 'node_modules/vite/bin/vite.js'
$pidFile = Join-Path $runtimeDir 'processes.json'

if (-not (Test-Path -LiteralPath $node)) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($null -ne $nodeCommand) { $node = $nodeCommand.Source }
}

foreach ($required in @($python, $node, $vite)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "缺少启动文件：$required。请先运行 & '$projectRoot/setup.ps1'。"
    }
}
if (Test-Path -LiteralPath $pidFile) {
    $previous = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
    $activeDemo = @(
        @{ id = $previous.backend_pid; marker = 'uvicorn app.main:app' },
        @{ id = $previous.frontend_pid; marker = 'vite.js' }
    ) | Where-Object {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.id)"
        $null -ne $process -and $process.CommandLine -like "*$($_.marker)*"
    }
    if ($activeDemo.Count -gt 0) {
        throw "已有演示进程正在运行。请先运行 stop-demo.ps1。"
    }
    Remove-Item -LiteralPath $pidFile
    Write-Host '发现上次演示的失效进程记录，已清理。'
}
if ($BackendPort -eq $FrontendPort) {
    throw '前后端端口不能相同。'
}
foreach ($port in @($BackendPort, $FrontendPort)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        throw "端口 $port 已被占用，请换一个端口。"
    }
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$env:RF_DATA_DIR = Join-Path $runtimeDir 'data'
$env:VITE_BACKEND_URL = "http://127.0.0.1:$BackendPort"
$backend = $null
$frontend = $null
try {
    $backend = Start-Process -FilePath $python -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', "$BackendPort") -WorkingDirectory $backendDir -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'backend.out.log') -RedirectStandardError (Join-Path $runtimeDir 'backend.err.log')
    $frontend = Start-Process -FilePath $node -ArgumentList @($vite, '--host', '127.0.0.1', '--port', "$FrontendPort", '--strictPort') -WorkingDirectory $frontendDir -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'frontend.out.log') -RedirectStandardError (Join-Path $runtimeDir 'frontend.err.log')

    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            $api = Invoke-WebRequest -Uri "http://127.0.0.1:$BackendPort/api/health" -TimeoutSec 2 -UseBasicParsing
            $web = Invoke-WebRequest -Uri "http://127.0.0.1:$FrontendPort/" -TimeoutSec 2 -UseBasicParsing
            if ($api.StatusCode -eq 200 -and $web.StatusCode -eq 200) {
                $ready = $true
                break
            }
        } catch {
            if ($backend.HasExited -or $frontend.HasExited) { break }
        }
    }
    if (-not $ready) {
        throw "启动未就绪。请检查 $runtimeDir 下的 backend.err.log 和 frontend.err.log。"
    }
    if ($LegacySamples) {
        & $python (Join-Path $projectRoot 'scripts/seed_official_jobs.py') $BackendPort (Join-Path $runtimeDir 'data/official-seed-state.json')
        if ($LASTEXITCODE -ne 0) {
            throw '旧版样本导入失败，请检查后端日志。'
        }
    }
    @{ backend_pid = $backend.Id; frontend_pid = $frontend.Id; backend_port = $BackendPort; frontend_port = $FrontendPort } |
        ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding utf8
    $url = "http://127.0.0.1:$FrontendPort/"
    Write-Host "职途智配已启动：$url"
    Write-Host "停止演示：& '$projectRoot/stop-demo.ps1'"
    if (-not $NoBrowser) {
        Start-Process $url
    }
} catch {
    foreach ($process in @($frontend, $backend)) {
        if ($null -ne $process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
    throw
}
