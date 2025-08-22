@echo off
echo ================================
echo   Starting Your Node.js Project
echo ================================

:: Go to the folder of this .bat file
cd /d %~dp0

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js first.
    pause
    exit /b
)

:: Create downloads folder if it doesn't exist
if not exist downloads (
    echo Creating downloads folder...
    mkdir downloads
)

:: Check if node_modules folder exists
if not exist node_modules (
    echo Installing dependencies...
    call npm install
) else (
    echo Dependencies already installed.
)

:: Run the Node.js script and keep window open
echo Running download.js ...
node download.js

echo.
echo ================================
echo   Script finished successfully
echo ================================
pause
