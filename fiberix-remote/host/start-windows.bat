@echo off
cd /d "%~dp0\.."
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js LTS dulu: https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules\ws (
  echo Menginstall dependency...
  call npm install
)
echo.
echo Set alamat relay jika bukan localhost:
echo   set REMOTE_RELAY=ws://IP-SERVER:18789/ws
echo.
node host\agent.js %REMOTE_RELAY%
pause
