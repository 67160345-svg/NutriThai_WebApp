@echo off
setlocal EnableExtensions
set "RUN_ROOT=%~dp0"
set "RUN_MODE=Docker"
set "RUN_FLAGS="
set "PAUSE_ON_ERROR=1"
:parse
if "%~1"=="" goto run
if /i "%~1"=="--native" (set "RUN_MODE=Native"& shift /1& goto parse)
if /i "%~1"=="--docker" (set "RUN_MODE=Docker"& shift /1& goto parse)
if /i "%~1"=="--no-browser" (set "RUN_FLAGS=%RUN_FLAGS% -NoBrowser"& set "PAUSE_ON_ERROR=0"& shift /1& goto parse)
if /i "%~1"=="--check" (set "RUN_FLAGS=%RUN_FLAGS% -CheckOnly"& set "PAUSE_ON_ERROR=0"& shift /1& goto parse)
if /i "%~1"=="--stop" (set "RUN_FLAGS=%RUN_FLAGS% -Stop"& shift /1& goto parse)
echo Usage: start_local.bat [--docker ^| --native] [--no-browser] [--check] [--stop]
exit /b 1
:run
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%RUN_ROOT%start_local.ps1" -Mode %RUN_MODE% %RUN_FLAGS%
set "RUN_RESULT=%ERRORLEVEL%"
if not "%RUN_RESULT%"=="0" if "%PAUSE_ON_ERROR%"=="1" pause
exit /b %RUN_RESULT%
