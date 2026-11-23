@echo off
chcp 65001 >nul
rem Mo AI-SRM
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0he-thong\mo.ps1" %*
echo.
pause
