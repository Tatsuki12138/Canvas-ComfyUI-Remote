@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0scripts\Configure-Canvas.ps1" -Force
if errorlevel 1 (
  echo.
  echo Canvas configuration was not changed successfully.
  pause
  exit /b 1
)
echo.
echo Canvas configuration updated. Personal prompts, settings and favorites were preserved.
pause
