@echo off
chcp 65001 >nul
rem Tat AI-SRM (giu du lieu)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0he-thong\tat.ps1" %*
echo.
pause
