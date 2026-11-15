# SPDX-License-Identifier: Apache-2.0
# Download the offline ASR model used by interview voice answers.
#
# Why a script instead of "pip install and it works": the weights are ~160 MB and
# HuggingFace is unreachable from mainland networks, so we pull them from the
# GitHub release asset API (which works there) and unpack with tar.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\fetch-asr-model.ps1
#   powershell ... -File scripts\fetch-asr-model.ps1 -Target D:\models\asr
#
# Idempotent: if the model directory already exists, nothing is downloaded.

[CmdletBinding()]
param(
    [string]$Target = (Join-Path $PSScriptRoot '..\runtime\models\asr'),
    [string]$AssetName = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09'
)

$ErrorActionPreference = 'Stop'
$repo = 'k2-fsa/sherpa-onnx'
$releaseTag = 'asr-models'

New-Item -ItemType Directory -Force -Path $Target | Out-Null
$modelDir = Join-Path $Target $AssetName

if (Test-Path (Join-Path $modelDir 'model.int8.onnx')) {
    Write-Host "Model already present: $modelDir"
    Write-Host "Set this before starting the app:"
    Write-Host "  ZY_ASR_MODEL_DIR=$modelDir"
    exit 0
}

Write-Host "Looking up $AssetName in $repo@$releaseTag ..."
$api = "https://api.github.com/repos/$repo/releases/tags/$releaseTag"
$release = Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent' = 'zhiyin-setup' } -TimeoutSec 30
$asset = $release.assets | Where-Object { $_.name -eq "$AssetName.tar.bz2" } | Select-Object -First 1
if (-not $asset) {
    throw "Asset $AssetName.tar.bz2 not found in release $releaseTag"
}

$archive = Join-Path $Target "$AssetName.tar.bz2"
$sizeMb = [math]::Round($asset.size / 1MB, 1)
Write-Host "Downloading $sizeMb MB ..."

# The asset URL from the API needs Accept: application/octet-stream; the plain
# releases/download URL redirects to a host that is often blocked or very slow.
Invoke-WebRequest -Uri $asset.url `
    -Headers @{ 'Accept' = 'application/octet-stream'; 'User-Agent' = 'zhiyin-setup' } `
    -OutFile $archive -TimeoutSec 900

Write-Host "Extracting ..."
& tar -xjf $archive -C $Target
if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
Remove-Item $archive -Force

if (-not (Test-Path (Join-Path $modelDir 'model.int8.onnx'))) {
    throw "Extraction finished but $modelDir\model.int8.onnx is missing"
}

Write-Host ""
Write-Host "Done. Model directory:"
Write-Host "  $modelDir"
Write-Host ""
Write-Host "Set this environment variable before starting the app:"
Write-Host "  ZY_ASR_MODEL_DIR=$modelDir"
