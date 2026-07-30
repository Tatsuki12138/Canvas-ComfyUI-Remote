@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Switch-CanvasMode.ps1" -Mode Start
echo.
pause
