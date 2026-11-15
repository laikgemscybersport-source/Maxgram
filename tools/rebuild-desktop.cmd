@echo off
REM Полная пересборка десктопа: снимает запущенные экземпляры (иначе Windows
REM блокирует dll и electron-builder падает с EPERM), чистит выход и собирает заново.
set PATH=C:\PROGRA~1\nodejs;%PATH%
cd /d "%~dp0.."

powershell -NoProfile -Command "Get-Process MAXgram -ErrorAction SilentlyContinue | Stop-Process -Force"
timeout /t 4 /nobreak > NUL

if exist desktop\win-unpacked rd /s /q desktop\win-unpacked
node_modules\.bin\electron-builder.cmd --win > build5.log 2>&1
echo BUILD_EXIT=%ERRORLEVEL%
dir desktop\*.exe
