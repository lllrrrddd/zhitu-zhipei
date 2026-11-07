$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$root = $PSScriptRoot
$backend = Join-Path $root 'source/ResumeForge/backend'
$frontend = Join-Path $root 'source/ResumeForge/frontend'
$venvPython = Join-Path $backend '.venv/Scripts/python.exe'

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($null -eq $pythonCommand) { throw '需要 Python 3.11 至 3.13（推荐 3.12）。' }
$python = $pythonCommand.Source
$version = & $python -c 'import sys; print(".".join(map(str, sys.version_info[:2])))'
if ($LASTEXITCODE -ne 0 -or $version -notin @('3.11', '3.12', '3.13')) { throw "Python 版本不兼容：$version。需要 3.11 至 3.13。" }

$bundledNodeDir = Join-Path $root 'runtime/node-v22.23.4-win-x64'
if (Test-Path -LiteralPath (Join-Path $bundledNodeDir 'node.exe')) {
    $nodePath = Join-Path $bundledNodeDir 'node.exe'
    $npmPath = Join-Path $bundledNodeDir 'npm.cmd'
} else {
    $node = Get-Command node -ErrorAction SilentlyContinue
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($null -eq $node -or $null -eq $npm) { throw '需要 Node.js 20.19+ 和 npm。' }
    $nodePath = $node.Source
    $npmPath = $npm.Source
}
$nodeVersion = [Version]((& $nodePath --version).TrimStart('v'))
if ($nodeVersion -lt [Version]'20.19.0') { throw '需要 Node.js 20.19+。' }

if (-not (Test-Path -LiteralPath $venvPython)) {
    & $python -m venv (Join-Path $backend '.venv')
    if ($LASTEXITCODE -ne 0) { throw '创建 Python 虚拟环境失败。' }
}
& $venvPython -m pip install -r (Join-Path $backend 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw '后端依赖安装失败。' }
if (-not (Test-Path -LiteralPath (Join-Path $frontend 'node_modules/vite/bin/vite.js'))) {
    Push-Location $frontend
    try {
        & $npmPath ci
        if ($LASTEXITCODE -ne 0) { throw '前端依赖安装失败。' }
    } finally { Pop-Location }
} else {
    Write-Host '前端依赖已存在，跳过 npm ci。'
}
Write-Host "安装完成。运行：& '$root/start-demo.ps1'"
