# SPDX-License-Identifier: Apache-2.0
# LAN launcher: one port serves both the built UI and the API, so phones and
# colleagues on the same Wi-Fi can use it without a reverse proxy.
#
# Why this script exists: the repository ships source only. Publishing needs
#   (a) a built frontend served by the backend (single port),
#   (b) ZY_TRUSTED_ORIGIN_HOSTS set to the LAN IP, otherwise every POST returns
#       403 (the origin guard only trusts loopback), and
#   (c) ZY_COOKIE_SECURE=0 because the site is plain http.
# All three are easy to forget; this wires them up.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\start-lan.ps1
#   ... -Port 3000 -RequireLogin 0 -DataDir D:\somewhere
#
# Prerequisites: run .\setup.ps1 once (creates the venv and installs deps).

[CmdletBinding()]
param(
    [int]$Port = 3000,
    [int]$RequireLogin = 1,
    [string]$DataDir = (Join-Path $PSScriptRoot '..\runtime\lan-data'),
    [string]$AsrModelDir = '',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$backend = Join-Path $root 'source\ResumeForge\backend'
$frontend = Join-Path $root 'source\ResumeForge\frontend'
$python = Join-Path $backend '.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    throw "Python venv not found at $python -- run .\setup.ps1 first."
}

# 1) Build the UI once (or when -SkipBuild is not given and dist is missing).
$dist = Join-Path $frontend 'dist'
$indexHtml = Join-Path $dist 'index.html'
if (-not $SkipBuild -and -not (Test-Path $indexHtml)) {
    Write-Host 'Building frontend (npm run build) ...'
    Push-Location $frontend
    try {
        if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
            Write-Host 'node_modules missing, running npm install ...'
            & npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install failed ($LASTEXITCODE)" }
        }
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed ($LASTEXITCODE)" }
    }
    finally {
        Pop-Location
    }
}
if (-not (Test-Path $indexHtml)) { throw "Frontend build not found at $indexHtml" }

# 2) Detect the LAN IPv4 (skip virtual adapters and APIPA).
$lanIp = $null
$addresses = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notmatch 'Loopback|vEthernet|VMware|aTrust' }
if ($addresses) { $lanIp = ($addresses | Select-Object -First 1).IPAddress }
if (-not $lanIp) { $lanIp = '127.0.0.1' }

# 3) Environment for this process only.
$env:PORT = "$Port"
$env:RF_FRONTEND_DIST = $dist
$env:RF_DATA_DIR = (New-Item -ItemType Directory -Force -Path $DataDir).FullName
$env:ZY_REQUIRE_LOGIN = "$RequireLogin"
$env:ZY_COOKIE_SECURE = '0'
$env:ZY_TRUSTED_ORIGIN_HOSTS = "$lanIp,127.0.0.1,localhost"
if (-not $env:ZY_ADMIN_KEY) { $env:ZY_ADMIN_KEY = 'change-me-before-sharing' }
if ($AsrModelDir) { $env:ZY_ASR_MODEL_DIR = (Resolve-Path $AsrModelDir).Path }
elseif (-not $env:ZY_ASR_MODEL_DIR) {
    $defaultModel = Join-Path $root 'runtime\models\asr\sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09'
    if (Test-Path $defaultModel) { $env:ZY_ASR_MODEL_DIR = $defaultModel }
}

Write-Host ''
Write-Host '  Zhiyin - LAN mode'
Write-Host '  ---------------------------------------------'
Write-Host "  This machine : http://127.0.0.1:$Port"
Write-Host "  Same Wi-Fi   : http://${lanIp}:$Port"
Write-Host "  Data         : $env:RF_DATA_DIR"
if ($env:ZY_ASR_MODEL_DIR) { Write-Host "  Voice (ASR)  : $env:ZY_ASR_MODEL_DIR" }
else { Write-Host '  Voice (ASR)  : not installed (typing only) -- run scripts\fetch-asr-model.ps1' }
Write-Host '  Stop         : Ctrl+C'
Write-Host '  ---------------------------------------------'
Write-Host ''

# 4) Serve. Host 0.0.0.0 so the LAN address works; the port comes from $env:PORT.
Push-Location $backend
try {
    & $python -c "import os, uvicorn; uvicorn.run('app.main:app', host='0.0.0.0', port=int(os.environ['PORT']))"
}
finally {
    Pop-Location
}
