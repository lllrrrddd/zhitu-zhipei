param(
    [ValidateRange(1024, 65535)][int]$BackendPort = 8005,
    [ValidateRange(1024, 65535)][int]$FrontendPort = 5173,
    [switch]$NoBrowser,
    # 默认启动后灌一份演示岗位（否则岗位列表是空的，README 里的"177 条"对不上）。
    # 抓取要好网；离线或不想等就加 -NoSeed，自己再刷新岗位。
    [switch]$NoSeed,
    # 兼容旧调用：等价于默认行为（灌数据），保留这个名字免得外部脚本报参数错误。
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
        # 只有一半活着（后端挂了、前端还开着）是最常见的情况：以前这里直接抛
        # "已有演示进程正在运行"，用户去 stop-demo 又因为端口没释放而卡住。
        # 这些进程是我们自己的（按命令行 marker 认过），直接清掉继续启动更省事。
        foreach ($item in $activeDemo) {
            try {
                Stop-Process -Id $item.id -Force -ErrorAction Stop
                Write-Host "已结束后台上残留的演示进程 PID=$($item.id)（$($item.marker)）"
            } catch {
                Write-Warning "残留进程 PID=$($item.id) 结束失败，请手动处理后再试。"
            }
        }
        Start-Sleep -Milliseconds 800
    }
    try { Remove-Item -LiteralPath $pidFile -Force -ErrorAction Stop } catch { }
    Write-Host '已清理上次演示的进程记录。'
}
if ($BackendPort -eq $FrontendPort) {
    throw '前后端端口不能相同。'
}
foreach ($port in @($BackendPort, $FrontendPort)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        $owner = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
        $name = ''
        if ($null -ne $owner) {
            $proc = Get-Process -Id $owner.OwningProcess -ErrorAction SilentlyContinue
            if ($null -ne $proc) { $name = "（PID=$($proc.Id) $($proc.ProcessName)）" }
        }
        throw "端口 $port 已被占用$name。要么结束该进程，要么换端口：start-demo.ps1 -BackendPort 8010 -FrontendPort 5180"
    }
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$env:RF_DATA_DIR = Join-Path $runtimeDir 'data'
$env:VITE_BACKEND_URL = "http://127.0.0.1:$BackendPort"
$backend = $null
$frontend = $null
# PowerShell 5.1 的 Start-Process 会把环境变量复制进一个**大小写不敏感**的字典。
# 机器上同时有 HTTPS_PROXY 与 https_proxy 时（Git Bash、多数代理客户端都会这么设），
# 复制过程抛 "已添加项。字典中的关键字:HTTPS_PROXY…"，脚本在启动任何进程前就失败。
# Windows 的环境变量本身不分大小写，删掉小写重复项后大写变量仍然在，子进程照常拿到代理。
foreach ($name in @('http_proxy', 'https_proxy', 'all_proxy', 'no_proxy')) {
    if ($null -ne [Environment]::GetEnvironmentVariable($name)) {
        [Environment]::SetEnvironmentVariable($name, $null)
    }
}
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
    if (-not $NoSeed) {
        Write-Host '正在导入演示岗位（读本地样例，几秒完成；不想导入可加 -NoSeed）…'
        & $python (Join-Path $projectRoot 'scripts/seed_official_jobs.py') $BackendPort (Join-Path $runtimeDir 'data/official-seed-state.json')
        if ($LASTEXITCODE -ne 0) {
            # 不抛异常：种子失败通常是网络问题，页面本身是可用的，让用户自己点"刷新岗位"。
            Write-Warning '演示岗位导入失败（多为网络原因）。页面仍可使用，进首页点「刷新岗位」重试。'
        }
    }
    @{ backend_pid = $backend.Id; frontend_pid = $frontend.Id; backend_port = $BackendPort; frontend_port = $FrontendPort } |
        ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding utf8
    $url = "http://127.0.0.1:$FrontendPort/"
    Write-Host "职引已启动：$url"
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
