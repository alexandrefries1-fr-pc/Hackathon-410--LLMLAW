@echo off
rem Lance le Copilote penal local (Electron installe hors OneDrive par setup_windows.ps1)
set "ELECTRON=%LOCALAPPDATA%\LLMLAW\deps\node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON%" (
  echo Dependances manquantes : executez d'abord setup_windows.ps1
  pause
  exit /b 1
)
start "" "%ELECTRON%" "%~dp0app"
