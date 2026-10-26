@echo off
title AI TARGET STRIKE - Event Management Launcher
cls
echo ====================================================================
echo      AI TARGET STRIKE - 2-PLAYER EVENT SYSTEM LAUNCHER
echo ====================================================================
echo.
echo [1/2] Starting Python Flask Backend on http://localhost:5000 ...
start "AI TARGET STRIKE - Backend Core" cmd /k "cd /d "%~dp0teamnexus\backend" && set PYTHONPATH=. && python run.py"

echo [2/2] Starting React Vite Frontend on http://localhost:5173 ...
start "AI TARGET STRIKE - Frontend UI" cmd /k "cd /d "%~dp0teamnexus\frontend" && npm run dev"

echo.
echo ====================================================================
echo  System is Launching!
echo.
echo  - Game Station Screen:       http://localhost:5173/game
echo  - Team Registration Form:    http://localhost:5173/register
echo  - Live Queue (Projector):    http://localhost:5173/queue
echo  - Live Scoreboard:           http://localhost:5173/leaderboard
echo  - Admin Command Console:     http://localhost:5173/admin
echo.
echo  Admin credentials must be configured in teamnexus\backend\.env.
echo ====================================================================
pause
