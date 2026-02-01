@echo off
echo [GeoCraft Setup ^& Start]



echo 1. Checking Node.js Environment...
if not exist "node_modules" (
    echo Installing Node dependencies ^(this may take a while^)...
    call npm install
) else (
    echo Node modules found.
)

echo 2. Starting Application...
echo Running npm start...
call npm start

pause
