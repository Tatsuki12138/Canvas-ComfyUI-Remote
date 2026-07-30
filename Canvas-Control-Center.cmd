@echo off
setlocal
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "%~dp0scripts\Canvas-Control-Center.ps1"
