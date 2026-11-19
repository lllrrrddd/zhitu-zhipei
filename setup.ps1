$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$root = $PSScriptRoot
$backend = Join-Path $root 'source/ResumeForge/backend'
$frontend = Join-Path $root 'source/ResumeForge/frontend'
$venvPython = Join-Path $backend '.venv/Scripts/python.exe'

# Python 探测：不能只看 PATH 里的 `python`。
# Windows 上常见情况是 PATH 指向 3.10，而 3.12 是通过 py launcher 装的
# （`py -3.12`），只看 `python` 会直接判"版本不兼容"，用户还不知道自己明明装了。
$acceptedVersions = @('3.11', '3.12', '3.13')
$candidates = @(
    @{ Exe = 'py'; Args = @('-3.12') },
    @{ Exe = 'py'; Args = @('-3.11') },
    @{ Exe = 'py'; Args = @('-3.13') },
    @{ Exe = 'python'; Args = @() },
    @{ Exe = 'python3'; Args = @() }
)

$python = $null
$seen = @()
foreach ($candidate in $candidates) {
    $found = Get-Command $candidate.Exe -ErrorAction SilentlyContinue
    if ($null -eq $found) { continue }
    $probe = @($found.Source) + $candidate.Args
    $out = & $probe[0] @($probe[1..($probe.Count - 1)]) -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>$null
    $code = $LASTEXITCODE
    $version = ($out | Select-Object -First 1)
    $seen += "$($candidate.Exe) $($candidate.Args -join ' ') -> $(if ($code -eq 0 -and $version) { $version } else { '不可用' })"
    if ($code -eq 0 -and $version -in $acceptedVersions) {
        $python = $probe
        break
    }
}

if ($null -eq $python) {
    $detail = if ($seen.Count) { "已尝试：`n  " + ($seen -join "`n  ") } else { 'PATH 里既没有 python 也没有 py launcher。' }
    throw "需要 Python 3.11 至 3.13（推荐 3.12），但没找到可用的解释器。`n$detail`n安装地址：https://www.python.org/downloads/"
}

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
    $venvArgs = @($python[1..($python.Count - 1)]) + @('-m', 'venv', (Join-Path $backend '.venv'))
    & $python[0] @venvArgs
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
