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
# 候选顺序：先 py launcher 的具体版本（Windows 上 3.12 常装在那儿），再退回 PATH 里的 python。
# 两个坑都踩过了：
# 1. $arr[1..($arr.Count-1)] 在 Count=1 时是 1..0 = @(1,0)，会把 "1" "0" 当参数传出去；
# 2. 用 -c 传代码时，代码里的双引号会被 Windows 的参数拼接吃掉，python 收到语法错误。
#    所以这里只用 --version 取版本号，不传任何代码。
$candidates = @(
    @{ Exe = 'py'; Pre = @('-3.12') },
    @{ Exe = 'py'; Pre = @('-3.11') },
    @{ Exe = 'py'; Pre = @('-3.13') },
    @{ Exe = 'python'; Pre = @() },
    @{ Exe = 'python3'; Pre = @() }
)

$python = $null
$seen = @()
foreach ($candidate in $candidates) {
    $found = Get-Command $candidate.Exe -ErrorAction SilentlyContinue
    if ($null -eq $found) { continue }
    $exe = $found.Source
    $callArgs = @($candidate.Pre) + @('--version')
    $raw = (& $exe @callArgs 2>&1 | Select-Object -First 1)
    $text = if ($null -eq $raw) { '' } else { $raw.ToString() }
    $version = ''
    if ($text -match '(\d+)\.(\d+)') { $version = "$($Matches[1]).$($Matches[2])" }
    $ok = ($version -in $acceptedVersions)
    $label = (@($candidate.Exe) + $candidate.Pre) -join ' '
    $seen += "$label -> " + $(if ($ok) { $version } else { "不可用（$text）" })
    if ($ok) {
        $python = @{ Exe = $exe; Pre = $candidate.Pre }
        break
    }
}

if ($null -eq $python) {
    $detail = if ($seen.Count) { "已尝试：`n  " + ($seen -join "`n  ") } else { 'PATH 里既没有 python 也没有 py launcher。' }
    throw "需要 Python 3.11 至 3.13（推荐 3.12），但没找到可用的解释器。`n$detail`n安装地址：https://www.python.org/downloads/"
}
Write-Host "使用 Python：$($python.Exe) $($python.Pre -join ' ')"

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
    $venvArgs = @($python.Pre) + @('-m', 'venv', (Join-Path $backend '.venv'))
    & $python.Exe @venvArgs
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
