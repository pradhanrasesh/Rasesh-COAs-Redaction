@echo off
setlocal

REM Make script portable: run from the folder this .cmd lives in
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

cd /d "%ROOT%"
title COA Redaction Tool (Single Window Mode)

echo ============================================
echo    Starting COA Redaction Tool ( Rasesh )
echo ============================================

REM --- Check if backend port 8000 is already in use ---
echo Checking if backend server is already running on port 8000...
netstat -ano | findstr :8000 >nul
if %errorlevel% equ 0 (
    echo [✓] Backend server is already running on port 8000.
    set "BACKEND_RUNNING=1"
) else (
    echo [→] Starting API server on port 8000...
    start "" /b cmd /c "python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload"
    set "BACKEND_RUNNING=0"
    echo [⏳] Waiting 5 seconds for backend server to start...
    timeout /t 5 >nul
)

REM --- Check if frontend port 5500 is already in use ---
echo Checking if frontend server is already running on port 5500...
netstat -ano | findstr :5500 >nul
if %errorlevel% equ 0 (
    echo [✓] Frontend server is already running on port 5500.
    set "FRONTEND_RUNNING=1"
) else (
    echo [→] Starting frontend server on port 5500...
    start "" /b python -m http.server 5500 --bind 127.0.0.1 --directory "%ROOT%\frontend"
    set "FRONTEND_RUNNING=0"
    echo [⏳] Waiting 3 seconds for frontend server to start...
    timeout /t 3 >nul
)

REM --- Verify servers are reachable ---
echo.
echo [🔍] Verifying servers are reachable...

if %BACKEND_RUNNING% equ 0 (
    echo Testing backend connection...
    curl -s -o nul -w "Backend: %%{http_code}\n" http://127.0.0.1:8000/docs
) else (
    echo Backend: Already running (http://127.0.0.1:8000)
)

if %FRONTEND_RUNNING% equ 0 (
    echo Testing frontend connection...
    curl -s -o nul -w "Frontend: %%{http_code}\n" http://127.0.0.1:5500/index.html
) else (
    echo Frontend: Already running (http://127.0.0.1:5500)
)

REM --- Open browser automatically ---
echo.
echo [🌐] Opening browser to http://127.0.0.1:5500/index.html...
start "" "http://127.0.0.1:5500/index.html"

echo ============================================
echo   COA Redaction Tool is running!
echo.
echo   Backend URL:  http://127.0.0.1:8000
echo   Frontend URL: http://127.0.0.1:5500
echo   API Docs:     http://127.0.0.1:8000/docs
echo   PDF Tools:    http://127.0.0.1:5500/html/pdf-tools.html
echo.
echo   Press any key to keep this window open...
echo ============================================

REM Keep window open
pause >nul
