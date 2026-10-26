@echo off
title AI TARGET STRIKE — Dedicated Admin Terminal Portal
color 0B
cls

echo ====================================================================
echo      AI TARGET STRIKE — DEDICATED ADMIN COMMAND PORTAL
echo ====================================================================
echo.
echo Launching Dedicated Admin Terminal Console...
echo.

cd /d "%~dp0"
set PYTHONPATH=%~dp0teamnexus\backend

if exist "%~dp0teamnexus\backend\venv\Scripts\python.exe" (
    "%~dp0teamnexus\backend\venv\Scripts\python.exe" "%~dp0teamnexus\backend\admin_terminal.py"
) else (
    python "%~dp0teamnexus\backend\admin_terminal.py"
)

pause
