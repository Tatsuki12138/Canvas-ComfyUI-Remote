param()

$ErrorActionPreference = 'Stop'
$SwitchScript = Join-Path $PSScriptRoot 'Switch-CanvasMode.ps1'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$HtmlPath = Join-Path $ProjectRoot 'control-center\index.html'
$Edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$DataDir = if ($env:CANVAS_DATA_DIR) { $env:CANVAS_DATA_DIR } else { Join-Path $env:APPDATA 'CanvasGateway' }
$ControlData = Join-Path $DataDir 'control-center'
$BrowserData = Join-Path $ControlData 'browser'
$SessionInfoPath = Join-Path $ControlData 'session.json'
$ControlLogPath = Join-Path $ControlData 'control-center.log'

function Open-ControlWindow([string]$Url) {
    if ($Url -and (Test-Path -LiteralPath $Edge)) {
        Start-Process -FilePath $Edge -ArgumentList @("--app=$Url", '--new-window', '--no-first-run', '--window-size=620,820', "--user-data-dir=$BrowserData") | Out-Null
    }
}

function Write-ControlLog([string]$Message) {
    try {
        $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff') $Message"
        Add-Content -LiteralPath $ControlLogPath -Value $line -Encoding UTF8
    } catch {}
}

$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\CanvasControlCenter', [ref]$createdNew)
if (-not $createdNew) {
    try {
        $existing = Get-Content -LiteralPath $SessionInfoPath -Raw | ConvertFrom-Json
        if ($existing.url) { Open-ControlWindow ([string]$existing.url) }
    } catch {}
    exit 0
}

function Invoke-Backend([string]$Mode) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'powershell.exe'
    $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$SwitchScript`" -Mode $Mode"
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.WorkingDirectory = $ProjectRoot
    $process = [System.Diagnostics.Process]::Start($psi)
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $timeoutMs = if ($Mode -eq 'StatusJson') { 12000 } else { 150000 }
    if (-not $process.WaitForExit($timeoutMs)) {
        try { $process.Kill() } catch {}
        throw "Canvas operation timed out after $([int]($timeoutMs / 1000)) seconds."
    }
    $stdout = $stdoutTask.Result
    $stderr = $stderrTask.Result
    if ($process.ExitCode -ne 0) { throw (($stderr + "`n" + $stdout).Trim()) }
    return $stdout.Trim()
}

$script:StatusCache = $null
$script:StatusCacheAt = [DateTime]::MinValue

function Get-StatusObject([switch]$Force) {
    if (-not $Force -and $script:StatusCache -and ((Get-Date) - $script:StatusCacheAt).TotalSeconds -lt 3) {
        return $script:StatusCache
    }
    try {
        $raw = Invoke-Backend 'StatusJson'
        $script:StatusCache = ($raw | ConvertFrom-Json)
        $script:StatusCacheAt = Get-Date
        return $script:StatusCache
    } catch {
        Write-ControlLog "Status error: $($_.Exception.Message)"
        if ($script:StatusCache -and ((Get-Date) - $script:StatusCacheAt).TotalMinutes -lt 5) {
            return $script:StatusCache
        }
        throw
    }
}

function Write-JsonResponse($Context, $Value, [int]$Status = 200) {
    $json = $Value | ConvertTo-Json -Depth 6 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $Context.Response.StatusCode = $Status
    $Context.Response.ContentType = 'application/json; charset=utf-8'
    $Context.Response.Headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    $Context.Response.Headers['Pragma'] = 'no-cache'
    $Context.Response.ContentLength64 = $bytes.Length
    $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Context.Response.Close()
}

function Write-HtmlResponse($Context) {
    $bytes = [IO.File]::ReadAllBytes($HtmlPath)
    $Context.Response.StatusCode = 200
    $Context.Response.ContentType = 'text/html; charset=utf-8'
    $Context.Response.Headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    $Context.Response.Headers['Pragma'] = 'no-cache'
    $Context.Response.ContentLength64 = $bytes.Length
    $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Context.Response.Close()
}

try {
    if (-not (Test-Path -LiteralPath $HtmlPath)) { throw "Control center UI is missing: $HtmlPath" }
    if (-not (Test-Path -LiteralPath $Edge)) { throw "Microsoft Edge was not found: $Edge" }
    New-Item -ItemType Directory -Force -Path $BrowserData | Out-Null

    $tcp = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
    $tcp.Start()
    $port = ([Net.IPEndPoint]$tcp.LocalEndpoint).Port
    $tcp.Stop()

    $tokenBytes = New-Object byte[] 24
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($tokenBytes) } finally { $rng.Dispose() }
    $token = [Convert]::ToBase64String($tokenBytes).TrimEnd('=').Replace('+','-').Replace('/','_')

    $listener = New-Object Net.HttpListener
    $listener.Prefixes.Add("http://127.0.0.1:$port/")
    $listener.Start()
    $url = "http://127.0.0.1:$port/?token=$token"
    [pscustomobject]@{
        pid = $PID
        port = $port
        token = $token
        url = $url
        startedAt = (Get-Date).ToString('o')
    } | ConvertTo-Json -Compress | Set-Content -LiteralPath $SessionInfoPath -Encoding UTF8
    Open-ControlWindow $url

    $running = $true
    while ($running -and $listener.IsListening) {
        $pending = $listener.GetContextAsync()
        while (-not $pending.Wait(1000)) {}
        $context = $pending.Result
        try {
            if ($context.Request.QueryString['token'] -ne $token) {
                Write-JsonResponse $context @{ error = 'Unauthorized local control request' } 403
                continue
            }
            $path = $context.Request.Url.AbsolutePath
            if ($path -eq '/' -and $context.Request.HttpMethod -eq 'GET') {
                Write-HtmlResponse $context
            } elseif ($path -eq '/api/status' -and $context.Request.HttpMethod -eq 'GET') {
                Write-JsonResponse $context (Get-StatusObject)
            } elseif ($path -eq '/api/action' -and $context.Request.HttpMethod -eq 'POST') {
                $reader = New-Object IO.StreamReader($context.Request.InputStream, [Text.Encoding]::UTF8)
                try { $body = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
                $allowed = @('Start','PrivateOn','PrivateOff','Repair','Stop')
                $mode = [string]$body.mode
                if ($mode -notin $allowed) { throw 'Unsupported control action.' }
                $message = Invoke-Backend $mode
                $status = $null
                $statusWarning = ''
                try { $status = Get-StatusObject -Force } catch { $statusWarning = $_.Exception.Message }
                Write-JsonResponse $context @{
                    message = (($message -split "`r?`n" | Where-Object { $_ })[-1])
                    status = $status
                    statusWarning = $statusWarning
                }
            } elseif ($path -eq '/api/shutdown' -and $context.Request.HttpMethod -eq 'POST') {
                Write-JsonResponse $context @{ ok = $true }
                $running = $false
            } else {
                Write-JsonResponse $context @{ error = 'Not found' } 404
            }
        } catch {
            Write-ControlLog "Request error: $($_.Exception.Message)"
            if ($context.Response.OutputStream.CanWrite) {
                try { Write-JsonResponse $context @{ error = $_.Exception.Message } 500 } catch {}
            }
        }
    }
} finally {
    if ($listener) { try { $listener.Stop(); $listener.Close() } catch {} }
    if (Test-Path -LiteralPath $SessionInfoPath) { try { Remove-Item -LiteralPath $SessionInfoPath -Force } catch {} }
    if ($mutex) { try { $mutex.ReleaseMutex(); $mutex.Dispose() } catch {} }
}
