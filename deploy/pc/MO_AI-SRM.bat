@echo off
chcp 65001 >nul
rem Mo AI-SRM
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0he-thong\mo.ps1" %*
if errorlevel 1 (
  echo.
  if not defined AISRM_KHONG_DUNG pause
) else (
  timeout /t 5 >nul
)
