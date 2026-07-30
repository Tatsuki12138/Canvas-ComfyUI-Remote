param(
    [ValidateSet('Start', 'PrivateOn', 'PrivateOff', 'Repair', 'Stop', 'Status', 'StatusJson')]
    [string]$Mode = 'Status',
    [int]$GatewayPort = 3000,
    [int]$ComfyPort = 8188,
    [int]$TailnetPort = 3001
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Gateway = Join-Path $ProjectRoot 'gateway'
$Python = Join-Path $Gateway '.venv\Scripts\python.exe'
$GatewayExe = Join-Path $Gateway 'CanvasGateway.exe'
$Tailscale = (Get-Command tailscale.exe -ErrorAction SilentlyContinue).Source
if (-not $Tailscale -and (Test-Path 'C:\Program Files\Tailscale\tailscale.exe')) {
    $Tailscale = 'C:\Program Files\Tailscale\tailscale.exe'
}
$DataDir = if ($env:CANVAS_DATA_DIR) { $env:CANVAS_DATA_DIR } else { Join-Path $env:APPDATA 'CanvasGateway' }
$ConfigPath = if ($env:CANVAS_CONFIG) { $env:CANVAS_CONFIG } else { Join-Path $DataDir 'config.json' }
$PairingCodePath = Join-Path $DataDir 'pairing-code.txt'
$LogDir = Join-Path $DataDir 'logs'
$LocalBaseUrl = "http://127.0.0.1:$GatewayPort"

function Write-Step([string]$Message) { Write-Host "[Canvas] $Message" }

function Ensure-Tools {
    if (-not (Test-Path -LiteralPath $Python) -and -not (Test-Path -LiteralPath $GatewayExe)) {
        throw 'Gateway environment is missing. Run scripts\setup-gateway.ps1 first.'
    }
    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        throw 'Canvas is not configured. Run scripts\Configure-Canvas.ps1 first.'
    }
    if (-not $Tailscale -or -not (Test-Path -LiteralPath $Tailscale)) {
        throw 'Tailscale was not found. Install it and sign in on this PC.'
    }
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Test-LocalPort([int]$Port) {
    try {
        return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1)
    } catch { return $false }
}

function Test-LocalGateway {
    try {
        $response = Invoke-WebRequest -Uri "$LocalBaseUrl/api/health" -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch { return $false }
}

function Get-TailscaleIdentity {
    $json = (& $Tailscale status --json 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $json) { throw 'Tailscale is not connected.' }
    $status = $json | ConvertFrom-Json
    $dns = ([string]$status.Self.DNSName).TrimEnd('.')
    $ip = @($status.Self.TailscaleIPs | Where-Object { $_ -match '^100\.' } | Select-Object -First 1)[0]
    if (-not $dns -and -not $ip) { throw 'No Tailscale hostname or IPv4 address was found.' }
    [pscustomobject]@{
        DnsName = $dns
        IPv4 = $ip
        AppUrl = if ($dns) { "http://$dns`:$TailnetPort" } else { "http://$ip`:$TailnetPort" }
    }
}

function Get-ServeText {
    try { return ((& $Tailscale serve status 2>&1 | Out-String).Trim()) } catch { return '' }
}

function Test-PrivateEntry {
    $text = Get-ServeText
    return ($text -match ":$TailnetPort\b" -and $text -match "127\.0\.0\.1:$GatewayPort|localhost:$GatewayPort")
}

function Stop-Gateway {
    $listeners = @(Get-NetTCPConnection -LocalPort $GatewayPort -State Listen -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
        if (-not $process) { continue }
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ParentProcessId)" -ErrorAction SilentlyContinue
        $chain = "$($process.CommandLine) $($process.ExecutablePath) $($parent.CommandLine) $($parent.ExecutablePath)"
        if ($chain.IndexOf($Gateway, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
            throw "Port $GatewayPort belongs to another program (PID $($listener.OwningProcess)); nothing was stopped."
        }
        Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
        if ($parent -and ([string]$parent.CommandLine).IndexOf($Gateway, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            Stop-Process -Id $parent.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
}

function Start-Gateway {
    Ensure-Tools
    if (Test-LocalGateway) { return }
    if (Test-LocalPort $GatewayPort) {
        throw "Port $GatewayPort is already in use by another service."
    }
    $stdout = Join-Path $LogDir 'gateway.out.log'
    $stderr = Join-Path $LogDir 'gateway.err.log'
    Write-Step "Starting Gateway on $LocalBaseUrl"
    if (Test-Path -LiteralPath $GatewayExe) {
        Start-Process -FilePath $GatewayExe -WorkingDirectory $Gateway -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
    } else {
        Start-Process -FilePath $Python -ArgumentList @('app.py') -WorkingDirectory $Gateway -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
    }
    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline) {
        if (Test-LocalGateway) { return }
        Start-Sleep -Seconds 1
    }
    throw "Gateway did not start. Check $stderr"
}

function Enable-PrivateEntry {
    Ensure-Tools
    if (Test-PrivateEntry) { return }
    Write-Step "Enabling the private Tailscale entry on port $TailnetPort"
    & $Tailscale serve --yes --bg "--http=$TailnetPort" "$GatewayPort" | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Tailscale Serve failed.' }
}

function Disable-PrivateEntry {
    Ensure-Tools
    if (-not (Test-PrivateEntry)) { return }
    Write-Step "Disabling Canvas Tailscale port $TailnetPort"
    & $Tailscale serve "--http=$TailnetPort" off | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Could not disable the Canvas Tailscale entry.' }
}

function Get-CanvasStatus {
    Ensure-Tools
    $identity = Get-TailscaleIdentity
    [pscustomobject]@{
        gatewayRunning = (Test-LocalGateway)
        privateAppEnabled = (Test-PrivateEntry)
        comfyRunning = (Test-LocalPort $ComfyPort)
        appUrl = $identity.AppUrl
        tailscaleDnsName = $identity.DnsName
        tailscaleIPv4 = $identity.IPv4
        pairingCode = if (Test-Path -LiteralPath $PairingCodePath) { (Get-Content -LiteralPath $PairingCodePath -Raw).Trim() } else { '' }
        pairingCodePath = $PairingCodePath
        configPath = $ConfigPath
        gatewayLogDirectory = $LogDir
    }
}

function Start-Canvas {
    Start-Gateway
    Enable-PrivateEntry
    $status = Get-CanvasStatus
    Write-Host ''
    Write-Host 'CANVAS APP READY' -ForegroundColor Green
    Write-Host "APP URL: $($status.appUrl)"
    Write-Host "Pairing code: $($status.pairingCode)"
}

function Show-Status {
    $status = Get-CanvasStatus
    Write-Host "Gateway:  $(if ($status.gatewayRunning) { 'running' } else { 'stopped' })"
    Write-Host "Tailscale: $(if ($status.privateAppEnabled) { 'enabled' } else { 'disabled' })"
    Write-Host "ComfyUI:  $(if ($status.comfyRunning) { 'running' } else { 'stopped' })"
    Write-Host "APP URL:  $($status.appUrl)"
    if ($status.pairingCode) { Write-Host "Pair code: $($status.pairingCode)" }
}

switch ($Mode) {
    'Start' { Start-Canvas }
    'PrivateOn' { Start-Gateway; Enable-PrivateEntry; Show-Status }
    'PrivateOff' { Disable-PrivateEntry; Show-Status }
    'Repair' { Disable-PrivateEntry; Start-Gateway; Enable-PrivateEntry; Show-Status }
    'Stop' { Disable-PrivateEntry; Stop-Gateway; Write-Host 'Canvas Gateway stopped. Tailscale and ComfyUI were left running.' }
    'Status' { Show-Status }
    'StatusJson' { Get-CanvasStatus | ConvertTo-Json -Depth 4 -Compress }
}
