@echo off
cd /d "%~dp0"
set "LONGVAN_NODE=C:\Program Files\nodejs\node.exe"
if not exist "%LONGVAN_NODE%" set "LONGVAN_NODE=node"
echo Long Van: http://127.0.0.1:8767
"%LONGVAN_NODE%" scripts\start-local.mjs
pause
