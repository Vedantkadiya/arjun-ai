@echo off
title Arjun AI - Local Server
color 0A
echo.
echo  ================================
echo    Arjun AI - Starting Server...
echo  ================================
echo.

REM Try Python 3 first
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo  [OK] Python found! Starting server on http://localhost:3000
    echo  [OK] Opening browser automatically...
    echo.
    echo  Press Ctrl+C to stop the server when done.
    echo.
    start "" "http://localhost:3000"
    python -m http.server 3000
    goto end
)

REM Try python3 command
python3 --version >nul 2>&1
if %errorlevel% == 0 (
    echo  [OK] Python3 found! Starting server on http://localhost:3000
    start "" "http://localhost:3000"
    python3 -m http.server 3000
    goto end
)

REM Try Node.js npx serve
npx --version >nul 2>&1
if %errorlevel% == 0 (
    echo  [OK] Node.js found! Starting server on http://localhost:3000
    start "" "http://localhost:3000"
    npx serve . -p 3000
    goto end
)

REM Nothing found
echo  [ERROR] Could not find Python or Node.js on your computer.
echo.
echo  Please install one of these (free):
echo    Python: https://www.python.org/downloads/
echo    Node.js: https://nodejs.org/
echo.
echo  OR just open index.html in Chrome and it may work directly.
echo.
pause

:end
