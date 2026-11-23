@echo off
chcp 65001 >nul
rem Khoi phuc: keo tha thu muc sao luu (he-thong\sao-luu\<thoi diem>) vao tep nay
if "%~1"=="" (
  echo Keo tha thu muc sao luu ^(trong he-thong\sao-luu^) vao tep KHOI_PHUC.bat
  pause
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0he-thong\khoi-phuc.ps1" -ThuMuc "%~1"
echo.
pause
