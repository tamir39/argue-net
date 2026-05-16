@echo on
setlocal

set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

cd /d "%~dp0backend"

echo Working dir: %CD%
echo Looking for uv...
where uv
if errorlevel 1 (
    echo.
    echo ERROR: `uv` khong co trong PATH. Cai uv: https://docs.astral.sh/uv/
    pause
    exit /b 1
)

echo.
echo Starting Jarvis CLI...
echo.

uv run python -m app.cli

echo.
echo === CLI da thoat. ===
pause
