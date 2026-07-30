param(
    [string]$SigningDirectory = (Join-Path $env:USERPROFILE '.canvas-release')
)

$ErrorActionPreference = 'Stop'
$SigningDirectory = [IO.Path]::GetFullPath($SigningDirectory)
$KeystorePath = Join-Path $SigningDirectory 'canvas-release.jks'
$PropertiesPath = Join-Path $SigningDirectory 'signing.properties'

if ((Test-Path -LiteralPath $KeystorePath) -or (Test-Path -LiteralPath $PropertiesPath)) {
    throw "A Canvas signing identity already exists at $SigningDirectory. It was not replaced."
}

$keytoolCandidates = @(
    $(if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\keytool.exe' }),
    'C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe',
    $(try { (Get-Command keytool.exe -ErrorAction Stop).Source } catch { $null })
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
$Keytool = $keytoolCandidates | Select-Object -First 1
if (-not $Keytool) { throw 'keytool.exe was not found. Install Android Studio or JDK 17 first.' }

function New-RandomPassword([int]$Length = 40) {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    $bytes = New-Object byte[] $Length
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
}

New-Item -ItemType Directory -Path $SigningDirectory -Force | Out-Null
$Password = New-RandomPassword
$Alias = 'canvas-release'

& $Keytool -genkeypair -v `
    -keystore $KeystorePath `
    -storepass $Password `
    -keypass $Password `
    -alias $Alias `
    -keyalg RSA `
    -keysize 4096 `
    -validity 10000 `
    -dname 'CN=Canvas ComfyUI Remote, OU=Open Source Release, O=Canvas, C=CN'
if ($LASTEXITCODE -ne 0) { throw 'Android signing key creation failed.' }

@(
    "keystorePath=$($KeystorePath.Replace('\', '/'))"
    "storePassword=$Password"
    "keyAlias=$Alias"
    "keyPassword=$Password"
) | Set-Content -LiteralPath $PropertiesPath -Encoding UTF8

Write-Host ''
Write-Host 'Canvas release signing identity created.' -ForegroundColor Green
Write-Host "Keystore:  $KeystorePath"
Write-Host "Build data: $PropertiesPath"
Write-Host 'Back up this entire directory securely. Losing it prevents future APK upgrades.' -ForegroundColor Yellow
