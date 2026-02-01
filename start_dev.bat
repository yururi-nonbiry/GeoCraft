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

echo Waiting for React server to initialize...
timeout /t 15

echo Starting C# Backend...
cd src\csharp\GeoCraft.Desktop
dotnet run

echo.
echo Application closed.
pause
