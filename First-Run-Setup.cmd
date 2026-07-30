@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0scripts\Configure-Canvas.ps1"
if errorlevel 1 (
  echo.
  echo Canvas setup failed. Review the error above, then run this file again.
  pause
  exit /b 1
)
start "" "%~dp0Canvas-Control-Center.cmd"
