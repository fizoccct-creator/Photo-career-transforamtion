@echo off
rem Double-click this file to start the Career Transformation booth on Windows.
rem Keep the black window open while the booth runs. Close it to stop the booth.
title Career Transformation booth
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode
node -e "process.exit(typeof process.loadEnvFile === 'function' ? 0 : 1)"
if errorlevel 1 goto nonode

if exist node_modules goto run
echo First start: installing (needs internet, about a minute)...
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 (
  echo Install failed. Check the internet connection and try again.
  pause
  exit /b 1
)

:run
echo.
echo Starting the booth. Keep this window open; close it to stop the booth.
echo.
set OPEN_BROWSER=1
node server.js
echo The booth stopped.
pause
exit /b 0

:nonode
echo The booth needs Node.js (version 20.12 or newer, free).
echo Opening nodejs.org: install the LTS version, then double-click Start Booth again.
start "" https://nodejs.org/
pause
exit /b 1
