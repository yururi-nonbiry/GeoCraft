@echo off
echo [GeoCraft Setup ^& Start]

echo 1. Checking Python Environment...
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
) else (
    echo Virtual environment found.
)

echo Activating virtual environment...
call .venv\Scripts\activate.bat

echo Installing/Updating Python dependencies...
pip install -r src/python/requirements.txt

echo 2. Checking Node.js Environment...
if not exist "node_modules" (
    echo Installing Node dependencies ^(this may take a while^)...
    call npm install
) else (
    echo Node modules found.
)

echo 3. Starting Application...
echo Running npm start...
call npm start

pause
