@echo off
REM ArgueNet one-click launcher.
REM 1) Cleans up any orphan node/python processes still running from a previous
REM    launch of THIS project (matched by commandline path containing ArgueNet).
REM 2) Opens TWO new CMD windows: FastAPI backend + Next.js frontend.
REM 3) Prints the URL to open in your browser.

setlocal

set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo === Cleanup: killing any orphan ArgueNet dev servers ===
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine -like '*ArgueNet\frontend*' -or $_.CommandLine -like '*ArgueNet\backend*') -and ($_.Name -in 'node.exe','python.exe','uvicorn.exe') } | ForEach-Object { Write-Host ('  killing PID ' + $_.ProcessId + '  ' + $_.Name); try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch { Write-Host ('    (failed: ' + $_.Exception.Message + ')') } }"

REM Brief pause so the OS releases the ports before we re-bind.
timeout /t 1 /nobreak >nul

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
echo (Next run of run.bat will also auto-clean any leftover orphans.)
pause >nul
