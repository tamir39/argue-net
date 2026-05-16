@echo off
REM Dev launcher: opens TWO CMD windows — one for FastAPI backend,
REM one for the Next.js frontend. Then prints the URL to open.

setlocal

set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

start "ArgueNet Backend (FastAPI :8765)" cmd /k "cd /d %~dp0backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8765"
start "ArgueNet Frontend (Next.js :4321)" cmd /k "cd /d %~dp0frontend && npm run dev -- -p 4321"

echo.
echo Started two servers in separate windows:
echo   Backend  : http://localhost:8765   (FastAPI)
echo   Frontend : http://localhost:4321   (Next.js)
echo.
echo Open this URL in your browser:
echo   http://localhost:4321
echo.
echo (Close the two CMD windows to stop the servers.)
pause >nul
