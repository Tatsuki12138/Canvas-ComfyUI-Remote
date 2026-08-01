param(
    [Parameter(Mandatory = $true)]
    [string]$SetupPath
)

$ErrorActionPreference = 'Stop'
$SetupPath = [IO.Path]::GetFullPath($SetupPath)
if (-not (Test-Path -LiteralPath $SetupPath)) { throw "Installer not found: $SetupPath" }

$TestRoot = Join-Path $env:TEMP ("CanvasInstallerTest-" + [guid]::NewGuid().ToString('N'))
$InstallDir = Join-Path $TestRoot 'program'
$DataDir = Join-Path $TestRoot 'data'
$FakeComfy = Join-Path $TestRoot 'ComfyUI'
$FakePython = Join-Path $TestRoot 'python\python.exe'
$OldDataDir = $env:CANVAS_DATA_DIR
$OldTestFlag = $env:CANVAS_INSTALLER_TEST

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

try {
    New-Item -ItemType Directory -Path $DataDir, $FakeComfy, (Split-Path -Parent $FakePython) -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $FakeComfy 'main.py') -Value '# installer test fixture' -Encoding ASCII
    Copy-Item -LiteralPath $env:ComSpec -Destination $FakePython

    $env:CANVAS_DATA_DIR = $DataDir
    $env:CANVAS_INSTALLER_TEST = '1'
    $Arguments = @(
        '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-',
        "/DIR=$InstallDir", "/COMFYUIPATH=$FakeComfy", "/COMFYPYTHON=$FakePython",
        '/MERGETASKS=!desktopicon,!autostart'
    )

    $Install = Start-Process -FilePath $SetupPath -ArgumentList $Arguments -Wait -PassThru
    Assert-True ($Install.ExitCode -eq 0) "Fresh install failed with exit code $($Install.ExitCode)."
    foreach ($RelativePath in @(
        'gateway\CanvasGateway.exe', 'scripts\Configure-Canvas.ps1',
        'Canvas-Control-Center.cmd', 'Configure-Canvas.cmd', 'unins000.exe'
    )) {
        Assert-True (Test-Path -LiteralPath (Join-Path $InstallDir $RelativePath)) "Missing installed file: $RelativePath"
    }

    $ConfigPath = Join-Path $DataDir 'config.json'
    Assert-True (Test-Path -LiteralPath $ConfigPath) 'Fresh install did not create config.json.'
    $ConfigHashBefore = (Get-FileHash -LiteralPath $ConfigPath -Algorithm SHA256).Hash
    $MarkerPath = Join-Path $DataDir 'prompt-preservation.marker'
    Set-Content -LiteralPath $MarkerPath -Value 'must survive upgrade and uninstall' -Encoding UTF8

    $Upgrade = Start-Process -FilePath $SetupPath -ArgumentList $Arguments -Wait -PassThru
    Assert-True ($Upgrade.ExitCode -eq 0) "Upgrade failed with exit code $($Upgrade.ExitCode)."
    $ConfigHashAfter = (Get-FileHash -LiteralPath $ConfigPath -Algorithm SHA256).Hash
    Assert-True ($ConfigHashBefore -eq $ConfigHashAfter) 'Upgrade changed the existing Canvas configuration.'
    Assert-True (Test-Path -LiteralPath $MarkerPath) 'Upgrade removed personal data.'

    $Uninstaller = Join-Path $InstallDir 'unins000.exe'
    $Uninstall = Start-Process -FilePath $Uninstaller -ArgumentList @(
        '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'
    ) -Wait -PassThru
    Assert-True ($Uninstall.ExitCode -eq 0) "Uninstall failed with exit code $($Uninstall.ExitCode)."
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $InstallDir 'gateway\CanvasGateway.exe'))) 'Uninstall left program files behind.'
    Assert-True (Test-Path -LiteralPath $ConfigPath) 'Uninstall removed config.json without explicit permission.'
    Assert-True (Test-Path -LiteralPath $MarkerPath) 'Uninstall removed personal data without explicit permission.'

    [pscustomobject]@{
        FreshInstall = 'PASS'
        UpgradePreservedConfig = $true
        UpgradePreservedPersonalData = $true
        UninstallRemovedProgram = $true
        UninstallPreservedPersonalData = $true
    } | Format-List
} finally {
    $env:CANVAS_DATA_DIR = $OldDataDir
    $env:CANVAS_INSTALLER_TEST = $OldTestFlag
    $ResolvedTestRoot = [IO.Path]::GetFullPath($TestRoot)
    $ResolvedTemp = [IO.Path]::GetFullPath($env:TEMP)
    if ((Test-Path -LiteralPath $ResolvedTestRoot) -and
        $ResolvedTestRoot.StartsWith($ResolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $ResolvedTestRoot -Recurse -Force
    }
}
