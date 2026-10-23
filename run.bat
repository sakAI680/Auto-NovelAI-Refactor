@echo off
chcp 65001 >nul

rem Relaunch once in the mode selected by hide_terminal.
if not "%~1"=="" goto begin
cd /d "%~dp0"
set "HIDE="
rem Prefer settings.json in the project root; also support the legacy data location.
set "SETTINGS_FILE=settings.json"
if not exist "%SETTINGS_FILE%" set "SETTINGS_FILE=data\settings.json"
rem A fresh installation defaults to hidden mode, matching DEFAULTS.hide_terminal.
if not exist "%SETTINGS_FILE%" goto hide_mode
for /f "tokens=2 delims=:{," %%A in ('findstr /i /c:"hide_terminal" "%SETTINGS_FILE%" 2^>nul') do set "HIDE=%%A"
if defined HIDE set "HIDE=%HIDE: =%"
if /i "%HIDE%"=="false" (
    start /max "" "%~f0" max
    exit
)
:hide_mode
echo [ANR] Starting in hidden mode; this window will close shortly...
powershell -NoProfile -Command "try { Start-Process -FilePath '%~f0' -ArgumentList 'hidden' -WorkingDirectory '%~dp0' -WindowStyle Hidden -ErrorAction Stop } catch { exit 1 }"
if errorlevel 1 (
    echo [ANR] WARNING: Hidden launch failed; starting in this window...
    goto begin
)
rem The background instance is independent. Keep this notice visible for two seconds.
timeout /t 2 >nul || ping -n 3 127.0.0.1 >nul
exit

:begin

title Auto-NovelAI-Refactor
cd /d "%~dp0"

rem Add bundled Git to PATH for GitPython when using a portable installation.
if exist "Git\cmd\git.exe" (
    set "PATH=%~dp0Git\cmd;%~dp0Git\bin;%~dp0Git\usr\bin;%PATH%"
    set "GIT_PYTHON_GIT_EXECUTABLE=%~dp0Git\cmd\git.exe"
    rem Use the bundled CA certificate instead of a system Git installation.
    if exist "%~dp0Git\mingw64\etc\ssl\certs\ca-bundle.crt" set "GIT_SSL_CAINFO=%~dp0Git\mingw64\etc\ssl\certs\ca-bundle.crt"
)

rem Prefer a valid venv interpreter, then the bundled Python interpreter.
set "PYTHON="
if exist "venv\Scripts\python.exe" call :try_python "venv\Scripts\python.exe" PYTHON
if not defined PYTHON if exist "Python\python.exe" call :try_python "Python\python.exe" PYTHON
if defined PYTHON goto :got_python

rem Otherwise, create venv using a system Python 3.10 or newer.
set "SYSTEM_PY="
for /f "delims=" %%P in ('where python 2^>nul') do (
    if not defined SYSTEM_PY call :try_python "%%P" SYSTEM_PY
)
if not defined SYSTEM_PY (
    echo [ANR] ERROR: No local interpreter or system Python 3.10+ was found.
    echo [ANR] Install Python with Add to PATH enabled, then try again.
    pause
    exit /b 1
)
echo [ANR] Creating venv with system Python: %SYSTEM_PY%
"%SYSTEM_PY%" -X utf8 -m venv venv
if not exist "venv\Scripts\python.exe" (
    echo [ANR] ERROR: Could not create venv. Check your system Python installation.
    pause
    exit /b 1
)
set "PYTHON=venv\Scripts\python.exe"

:got_python
echo [ANR] Using interpreter: %PYTHON%

rem Check dependency metadata without importing the packages.
rem An incomplete installation may still fail when main.py imports a package.
"%PYTHON%" -X utf8 -c "import importlib.util as u, sys; sys.exit(1 if any(u.find_spec(m) is None for m in ('fastapi','uvicorn','requests','PIL','loguru','ujson','psutil','pystray')) else 0)" >nul 2>nul
if errorlevel 1 (
    echo [ANR] Checking/installing dependencies; the first run may take a few minutes...
    "%PYTHON%" -X utf8 -s -m pip install -r requirements.txt -q --disable-pip-version-check
    if errorlevel 1 (
        echo [ANR] WARNING: Dependency installation failed; trying to start anyway...
    ) else (
        echo [ANR] Dependencies installed.
    )
) else (
    echo [ANR] Dependencies are ready.
)

echo [ANR] Starting Auto-NovelAI-Refactor ...
"%PYTHON%" -X utf8 main.py

echo.
echo [ANR] Process ended.
rem hidden instance has nobody to press a key - a plain pause there would hang the cmd forever
if /i "%~1"=="hidden" exit /b 0
pause
exit /b 0

rem Validate Python 3.10+ and reject unusable Microsoft Store placeholders.
:try_python
"%~1" -X utf8 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul
if not errorlevel 1 set "%~2=%~1"
exit /b
