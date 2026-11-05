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
Remove-Item -LiteralPath $pidFile
Write-Host '职途智配演示已停止。'
