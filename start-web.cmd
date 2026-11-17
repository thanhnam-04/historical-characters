@echo off
cd /d "%~dp0"
if exist "backend\.venv\Scripts\python.exe" (
  "backend\.venv\Scripts\python.exe" scripts\run.py %*
) else (
  py -3 scripts\run.py %*
)
if errorlevel 1 pause
