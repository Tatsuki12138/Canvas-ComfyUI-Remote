param(
    [string]$Version = '1.1.1',
    [string]$SigningProperties = (Join-Path $env:USERPROFILE '.canvas-release\signing.properties')
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$ReleaseRoot = [IO.Path]::GetFullPath((Join-Path $ProjectRoot 'release'))
if (-not $ReleaseRoot.StartsWith($ProjectRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Release directory escaped the project root.'
}
if (-not (Test-Path -LiteralPath $SigningProperties)) {
    throw "Signing properties were not found. Run scripts\New-ReleaseSigningKey.ps1 first: $SigningProperties"
}

$signing = @{}
Get-Content -LiteralPath $SigningProperties -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') { $signing[$matches[1].Trim()] = $matches[2].Trim() }
}
foreach ($required in @('keystorePath', 'storePassword', 'keyAlias', 'keyPassword')) {
    if (-not $signing[$required]) { throw "Signing property is missing: $required" }
}
if (-not (Test-Path -LiteralPath $signing.keystorePath)) { throw 'The configured Android keystore does not exist.' }

$env:CANVAS_KEYSTORE_PATH = $signing.keystorePath
$env:CANVAS_KEYSTORE_PASSWORD = $signing.storePassword
$env:CANVAS_KEY_ALIAS = $signing.keyAlias
$env:CANVAS_KEY_PASSWORD = $signing.keyPassword
$env:JAVA_HOME = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Program Files\Android\Android Studio\jbr' }
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

$AppRoot = Join-Path $ProjectRoot 'android-app'
Push-Location $AppRoot
try {
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    & npm test
    if ($LASTEXITCODE -ne 0) { throw 'APP tests failed.' }
    & npm run android:sync
    if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }
    & (Join-Path $AppRoot 'android\gradlew.bat') -p (Join-Path $AppRoot 'android') clean assembleRelease
    if ($LASTEXITCODE -ne 0) { throw 'Android release build failed.' }
} finally {
    Pop-Location
}

$ApkSource = Join-Path $AppRoot 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path -LiteralPath $ApkSource)) { throw "Signed APK was not created: $ApkSource" }

$GatewayRoot = Join-Path $ProjectRoot 'gateway'
$GatewayPython = Join-Path $GatewayRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $GatewayPython)) {
    $created = $false
    foreach ($pythonVersion in @('3.12', '3.11', '3.10')) {
        & py "-$pythonVersion" -m venv (Join-Path $GatewayRoot '.venv') 2>$null
        if ($LASTEXITCODE -eq 0) { $created = $true; break }
    }
    if (-not $created) { throw 'Python 3.10-3.12 is required to package Canvas Gateway.' }
}
& $GatewayPython -m pip install --disable-pip-version-check -r (Join-Path $GatewayRoot 'requirements-build.txt')
if ($LASTEXITCODE -ne 0) { throw 'Gateway build dependencies failed to install.' }
Push-Location $GatewayRoot
try {
    & $GatewayPython -m PyInstaller --clean --noconfirm CanvasGateway.spec
    if ($LASTEXITCODE -ne 0) { throw 'Gateway packaging failed.' }
} finally {
    Pop-Location
}

$GatewayExe = Join-Path $GatewayRoot 'dist\CanvasGateway.exe'
if (-not (Test-Path -LiteralPath $GatewayExe)) { throw 'CanvasGateway.exe was not created.' }

$VersionDir = Join-Path $ReleaseRoot "v$Version"
$StageDir = Join-Path $ReleaseRoot "staging\Canvas-Gateway-Windows-v$Version"
foreach ($generatedDir in @($VersionDir, (Split-Path -Parent $StageDir))) {
    $resolved = [IO.Path]::GetFullPath($generatedDir)
    if (-not $resolved.StartsWith($ReleaseRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clear unexpected path: $resolved"
    }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
New-Item -ItemType Directory -Path $VersionDir, $StageDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $StageDir 'gateway'), (Join-Path $StageDir 'scripts'), (Join-Path $StageDir 'control-center'), (Join-Path $StageDir 'docs') | Out-Null

Copy-Item -LiteralPath $GatewayExe -Destination (Join-Path $StageDir 'gateway\CanvasGateway.exe')
Copy-Item -LiteralPath $ApkSource -Destination (Join-Path $StageDir 'gateway\Canvas.apk')
Copy-Item -LiteralPath (Join-Path $GatewayRoot 'workflows') -Destination (Join-Path $StageDir 'gateway\workflows') -Recurse
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'Canvas-Control-Center.cmd'), (Join-Path $ProjectRoot 'Canvas-App-Mode.cmd'), (Join-Path $ProjectRoot 'First-Run-Setup.cmd'), (Join-Path $ProjectRoot 'Configure-Canvas.cmd'), (Join-Path $ProjectRoot 'config.example.json'), (Join-Path $ProjectRoot 'README.md'), (Join-Path $ProjectRoot 'LICENSE') -Destination $StageDir
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'README.en.md'), (Join-Path $ProjectRoot 'SECURITY.md'), (Join-Path $ProjectRoot 'THIRD_PARTY_NOTICES.md') -Destination $StageDir
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'scripts\Canvas-Control-Center.ps1'), (Join-Path $ProjectRoot 'scripts\Configure-Canvas.ps1'), (Join-Path $ProjectRoot 'scripts\Switch-CanvasMode.ps1'), (Join-Path $ProjectRoot 'scripts\start-gateway.ps1') -Destination (Join-Path $StageDir 'scripts')
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'control-center\index.html') -Destination (Join-Path $StageDir 'control-center')
Copy-Item -Path (Join-Path $ProjectRoot 'docs\*') -Destination (Join-Path $StageDir 'docs') -Recurse

& (Join-Path $PSScriptRoot 'Test-PackagedGateway.ps1') -ReleaseDirectory $StageDir -Version $Version
if ($LASTEXITCODE -ne 0) { throw 'Packaged Gateway verification failed.' }

$ApkAsset = Join-Path $VersionDir "Canvas-Android-v$Version.apk"
$ZipAsset = Join-Path $VersionDir "Canvas-Gateway-Windows-v$Version.zip"
$SetupAsset = Join-Path $VersionDir "Canvas-Gateway-Setup-v$Version.exe"
Copy-Item -LiteralPath $ApkSource -Destination $ApkAsset
Compress-Archive -Path (Join-Path $StageDir '*') -DestinationPath $ZipAsset -CompressionLevel Optimal

$InnoCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 7\ISCC.exe'),
    'C:\Program Files\Inno Setup 7\ISCC.exe',
    'C:\Program Files (x86)\Inno Setup 7\ISCC.exe'
)
$InnoCompiler = $InnoCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $InnoCompiler) {
    throw 'Inno Setup 7 is required to build the bilingual Windows installer: https://jrsoftware.org/isdl.php'
}
$InstallerScript = Join-Path $ProjectRoot 'installer\CanvasGateway.iss'
& $InnoCompiler "/DMyAppVersion=$Version" "/DStageDir=$StageDir" "/DOutputDir=$VersionDir" $InstallerScript
if ($LASTEXITCODE -ne 0) { throw 'Windows installer build failed.' }
if (-not (Test-Path -LiteralPath $SetupAsset)) { throw "Installer was not created: $SetupAsset" }
& (Join-Path $PSScriptRoot 'Test-Installer.ps1') -SetupPath $SetupAsset
if ($LASTEXITCODE -ne 0) { throw 'Windows installer verification failed.' }

$ChecksumPath = Join-Path $VersionDir 'SHA256SUMS.txt'
@($ApkAsset, $ZipAsset, $SetupAsset) | ForEach-Object {
    $hash = (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $([IO.Path]::GetFileName($_))"
} | Set-Content -LiteralPath $ChecksumPath -Encoding ASCII

Write-Host ''
Write-Host "Canvas v$Version release assets are ready:" -ForegroundColor Green
Get-ChildItem -LiteralPath $VersionDir | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
Write-Host "Signing identity: $SigningProperties" -ForegroundColor Yellow
