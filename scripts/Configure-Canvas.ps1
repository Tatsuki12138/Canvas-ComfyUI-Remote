param(
    [string]$ComfyUIPath = '',
    [string]$ComfyPython = '',
    [string]$ProxyUrl = '',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$TemplatePath = Join-Path $ProjectRoot 'config.example.json'
$DataDir = if ($env:CANVAS_DATA_DIR) { $env:CANVAS_DATA_DIR } else { Join-Path $env:APPDATA 'CanvasGateway' }
$ConfigPath = if ($env:CANVAS_CONFIG) { $env:CANVAS_CONFIG } else { Join-Path $DataDir 'config.json' }

function Normalize-Path([string]$Value) {
    if (-not $Value) { return '' }
    return ([IO.Path]::GetFullPath($Value)).Replace('\', '/')
}

function Select-ComfyFolder {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = 'Select the ComfyUI folder that contains main.py'
    $dialog.ShowNewFolderButton = $false
    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        throw 'Configuration cancelled.'
    }
    return $dialog.SelectedPath
}

if ((Test-Path -LiteralPath $ConfigPath) -and -not $Force) {
    Write-Host "Canvas is already configured: $ConfigPath"
    Write-Host 'Run again with -Force to replace it.'
    exit 0
}

if (-not $ComfyUIPath) { $ComfyUIPath = Select-ComfyFolder }
$ComfyUIPath = [IO.Path]::GetFullPath($ComfyUIPath)
if (-not (Test-Path -LiteralPath (Join-Path $ComfyUIPath 'main.py'))) {
    throw "The selected folder does not contain main.py: $ComfyUIPath"
}

if (-not $ComfyPython) {
    $candidates = @(
        (Join-Path (Split-Path -Parent $ComfyUIPath) 'python\python.exe'),
        (Join-Path (Split-Path -Parent $ComfyUIPath) 'python_embeded\python.exe'),
        (Join-Path $ComfyUIPath 'python_embeded\python.exe'),
        (Join-Path $ComfyUIPath 'venv\Scripts\python.exe'),
        (Join-Path $ComfyUIPath '.venv\Scripts\python.exe')
    )
    $ComfyPython = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $ComfyPython -or -not (Test-Path -LiteralPath $ComfyPython)) {
    throw 'ComfyUI Python was not detected. Run Configure-Canvas.ps1 with -ComfyPython C:\path\to\python.exe.'
}

$config = Get-Content -LiteralPath $TemplatePath -Raw -Encoding UTF8 | ConvertFrom-Json
$config.comfy_python = Normalize-Path $ComfyPython
$config.comfy_workdir = Normalize-Path $ComfyUIPath
$config.comfy_output_dir = Normalize-Path (Join-Path $ComfyUIPath 'output')
$config.lora_dirs = @((Normalize-Path (Join-Path $ComfyUIPath 'models\loras')))
$config.checkpoint_dirs = @(
    (Normalize-Path (Join-Path $ComfyUIPath 'models\diffusion_models')),
    (Normalize-Path (Join-Path $ComfyUIPath 'models\unet')),
    (Normalize-Path (Join-Path $ComfyUIPath 'models\checkpoints'))
)
$config.proxy_url = $ProxyUrl

$parent = Split-Path -Parent $ConfigPath
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$config | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8

Write-Host ''
Write-Host 'Canvas configuration saved.' -ForegroundColor Green
Write-Host "Config:  $ConfigPath"
Write-Host "ComfyUI: $ComfyUIPath"
Write-Host "Python:  $ComfyPython"
Write-Host 'Your config and runtime data are outside the source repository.'
