param(
    [string]$ReleaseDirectory = '',
    [string]$Version = '1.1.1',
    [int]$Port = 3010
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$ReleaseRoot = [IO.Path]::GetFullPath((Join-Path $ProjectRoot 'release'))
if (-not $ReleaseDirectory) {
    $ReleaseDirectory = Join-Path $ReleaseRoot "staging\Canvas-Gateway-Windows-v$Version"
}
$ReleaseDirectory = [IO.Path]::GetFullPath($ReleaseDirectory)
if (-not $ReleaseDirectory.StartsWith($ReleaseRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The packaged Gateway test is restricted to the generated release directory.'
}

$Exe = Join-Path $ReleaseDirectory 'gateway\CanvasGateway.exe'
if (-not (Test-Path -LiteralPath $Exe)) { throw "Packaged Gateway is missing: $Exe" }
$SmokeData = Join-Path $env:TEMP ("CanvasGatewaySmoke-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $SmokeData -Force | Out-Null

$env:CANVAS_GATEWAY_PORT = [string]$Port
$env:CANVAS_DATA_DIR = $SmokeData
$Process = Start-Process -FilePath $Exe `
    -WorkingDirectory (Split-Path -Parent $Exe) `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $SmokeData 'out.log') `
    -RedirectStandardError (Join-Path $SmokeData 'err.log') `
    -PassThru

try {
    $deadline = (Get-Date).AddSeconds(60)
    $response = $null
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/" -TimeoutSec 2
            break
        } catch {
            Start-Sleep -Milliseconds 750
        }
    }
    if (-not $response) { throw "Packaged Gateway did not start on test port $Port." }

    $webStatus = 0
    try {
        Invoke-WebRequest -Uri "http://127.0.0.1:$Port/web" -UseBasicParsing -TimeoutSec 3 | Out-Null
        $webStatus = 200
    } catch {
        $webStatus = [int]$_.Exception.Response.StatusCode
    }
    if ($response.mode -ne 'app-only' -or $webStatus -ne 404) {
        throw 'Packaged Gateway exposed an unexpected surface.'
    }

    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
    if ($listener.LocalAddress -ne '127.0.0.1') {
        throw "Packaged Gateway listened outside loopback: $($listener.LocalAddress)"
    }

    $unauthorizedStatus = 0
    try {
        Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/config" -UseBasicParsing -TimeoutSec 3 | Out-Null
        $unauthorizedStatus = 200
    } catch {
        $unauthorizedStatus = [int]$_.Exception.Response.StatusCode
    }
    if ($unauthorizedStatus -ne 401) { throw 'Protected API was reachable without a bearer token.' }

    [pscustomobject]@{
        Name = $response.name
        Version = $response.version
        Mode = $response.mode
        WebStatus = $webStatus
        ProtectedApiStatus = $unauthorizedStatus
        ListenAddress = $listener.LocalAddress
        TestPort = $Port
    }
} finally {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        $owned = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
        if ($owned -and ([string]$owned.ExecutablePath).IndexOf('CanvasGateway.exe', [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    Remove-Item Env:CANVAS_GATEWAY_PORT -ErrorAction SilentlyContinue
    Remove-Item Env:CANVAS_DATA_DIR -ErrorAction SilentlyContinue
    $ResolvedSmoke = [IO.Path]::GetFullPath($SmokeData)
    $ResolvedTemp = [IO.Path]::GetFullPath($env:TEMP)
    if ((Test-Path -LiteralPath $ResolvedSmoke) -and
        $ResolvedSmoke.StartsWith($ResolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $ResolvedSmoke -Recurse -Force
    }
}
