@echo off
setlocal

echo ==========================================
echo       GeoCraft Dev Launcher
echo ==========================================

:: Check if node_modules exists, install if not
if not exist "node_modules" (
    echo Installing Node dependencies...
    call npm install
)

echo Starting React Dev Server in background...
start "GeoCraft React Server" cmd /c "npm run dev"

echo Waiting for React Dev Server to be ready on http://localhost:5173 ...
set MAX_WAIT=300
set WAITED=0

:waitloop
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% EQU 0 goto ready
set /a WAITED+=2
if %WAITED% GEQ %MAX_WAIT% (
    echo WARNING: Timed out waiting for React Dev Server after %MAX_WAIT% seconds. Continuing anyway...
    goto ready
)
timeout /t 2 /nobreak >nul
goto waitloop

:ready
echo React Dev Server is ready.

echo Starting C# Backend...
cd src\csharp\GeoCraft.Desktop
dotnet run

echo.
echo Application closed.
pause
