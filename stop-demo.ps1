$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'runtime/demo/processes.json'
if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Host '没有演示进程记录。'
    exit 0
}
$record = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
foreach ($entry in @(
    @{ id = $record.frontend_pid; marker = 'vite.js' },
    @{ id = $record.backend_pid; marker = 'uvicorn app.main:app' }
)) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($entry.id)"
    if ($null -ne $process) {
        if ($process.CommandLine -notlike "*$($entry.marker)*") {
            throw "进程 $($entry.id) 已被其他程序占用，请手动核对，不会结束它。"
        }
        Stop-Process -Id $entry.id -Force
    }
}
# 进程已经停了，删记录文件只是收尾：被占用/被杀软拦下时不该让用户看到一堆报错。
try {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction Stop
} catch {
    Write-Warning "演示已停止，但进程记录文件没删掉：$pidFile（可手动删除，不影响使用）"
}
Write-Host '职引演示已停止。'
