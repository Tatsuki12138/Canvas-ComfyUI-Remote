param(
    [int]$GatewayPort = 3000,
    [int]$TailnetPort = 3001
)

$ErrorActionPreference = 'Stop'
$SwitchScript = Join-Path $PSScriptRoot 'Switch-CanvasMode.ps1'
& $SwitchScript -Mode Start -GatewayPort $GatewayPort -TailnetPort $TailnetPort
