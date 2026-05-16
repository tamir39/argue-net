@echo off
REM ArgueNet one-click launcher.
REM Opens TWO new CMD windows:
REM   - FastAPI backend  (http://localhost:8765)
REM   - Next.js frontend (http://localhost:4321)
REM Then prints the URL to open in your browser.

setlocal

set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

start "ArgueNet Backend (FastAPI :9090)" cmd /k "cd /d %~dp0backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 9090"
start "ArgueNet Frontend (Next.js :4173)" cmd /k "cd /d %~dp0frontend && npm run dev -- -p 4173"

echo.
echo Started two servers in separate CMD windows.
echo.
echo   Backend  : http://localhost:9090
echo   Frontend : http://localhost:4173
echo.
echo === Open this in your browser ===
echo   http://localhost:4173
echo =================================
echo.
echo Close the two CMD windows to stop the servers.
echo (This launcher window can be closed safely.)
pause >nul
