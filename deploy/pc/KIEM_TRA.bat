@echo off
chcp 65001 >nul
rem Kiem tra tinh trang AI-SRM
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0he-thong\kiem-tra.ps1" %*
echo.
pause
