@echo off
echo Starting React Dev Server...
start "GeoCraft React Server" cmd /c "npm run dev"

echo Waiting for server to start...
timeout /t 5

echo Starting C# Backend...
cd src\csharp\GeoCraft.Desktop
dotnet run
cd ..\..\..
