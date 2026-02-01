@echo off
setlocal
echo ==========================================
echo       GeoCraft Build Script
echo ==========================================

echo [1/3] Building React Frontend...
call npm install
call npm run build-react
if %ERRORLEVEL% NEQ 0 (
    echo Frontend build failed.
    exit /b %ERRORLEVEL%
)

echo [2/3] Building C# Backend...
cd src\csharp\GeoCraft.Desktop
dotnet publish -c Release -o ..\..\..\bin\Release\net8.0-windows\publish
if %ERRORLEVEL% NEQ 0 (
    echo Backend build failed.
    cd ..\..\..
    exit /b %ERRORLEVEL%
)
cd ..\..\..

echo [3/3] Assembling Artifacts...
set TARGET_DIR=bin\Release\net8.0-windows\publish
if not exist "%TARGET_DIR%\wwwroot" mkdir "%TARGET_DIR%\wwwroot"
xcopy /E /Y /I dist "%TARGET_DIR%\wwwroot"

echo.
echo ==========================================
echo       Build Complete!
echo ==========================================
echo Output location: %TARGET_DIR%
echo Run start.bat to launch.
pause
