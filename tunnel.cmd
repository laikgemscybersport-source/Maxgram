@echo off
REM Скачивает cloudflared (если нет) и поднимает публичный HTTPS-туннель на localhost:3000
set PATH=C:\PROGRA~1\nodejs;%PATH%
cd /d "%~dp0"

if not exist bin mkdir bin
if not exist bin\cloudflared.exe (
  echo Скачиваю cloudflared.exe в bin\ ...
  curl -L -o bin\cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
)
node tools\tunnel.js
