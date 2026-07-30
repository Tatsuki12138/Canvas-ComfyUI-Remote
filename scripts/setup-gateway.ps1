$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Gateway = Join-Path $ProjectRoot 'gateway'
$Venv = Join-Path $Gateway '.venv'
$ConfigPath = if ($env:CANVAS_CONFIG) { $env:CANVAS_CONFIG } elseif ($env:CANVAS_DATA_DIR) { Join-Path $env:CANVAS_DATA_DIR 'config.json' } else { Join-Path $env:APPDATA 'CanvasGateway\config.json' }

if (-not (Test-Path -LiteralPath (Join-Path $Venv 'Scripts\python.exe'))) {
    $created = $false
    foreach ($version in @('3.12', '3.11', '3.10')) {
        & py "-$version" -m venv $Venv 2>$null
        if ($LASTEXITCODE -eq 0) { $created = $true; break }
    }
    if (-not $created) { throw 'Python 3.10-3.12 was not found. Install Python, then run this script again.' }
}

& (Join-Path $Venv 'Scripts\python.exe') -m pip install --disable-pip-version-check -r (Join-Path $Gateway 'requirements.txt')
if (-not (Test-Path -LiteralPath $ConfigPath)) {
    & (Join-Path $PSScriptRoot 'Configure-Canvas.ps1')
}
Write-Host 'Canvas Gateway setup complete.'
