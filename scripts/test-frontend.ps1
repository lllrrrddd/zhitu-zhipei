param([ValidateRange(1, 4)][int]$Workers = 2)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$frontendDir = Join-Path $projectRoot 'source/ResumeForge/frontend'
$node = Join-Path $projectRoot 'runtime/node-v22.23.4-win-x64/node.exe'
$vitest = Join-Path $frontendDir 'node_modules/vitest/vitest.mjs'
$testTmp = Join-Path $projectRoot 'runtime/vitest-temp'

foreach ($required in @($node, $vitest)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "缺少测试文件：$required"
    }
}
New-Item -ItemType Directory -Path $testTmp -Force | Out-Null
$env:TEMP = $testTmp
$env:TMP = $testTmp
Push-Location $frontendDir
try {
    & $node $vitest run --reporter=dot --maxWorkers=$Workers
    if ($LASTEXITCODE -ne 0) {
        throw "前端测试失败，退出码：$LASTEXITCODE"
    }
} finally {
    Pop-Location
}
