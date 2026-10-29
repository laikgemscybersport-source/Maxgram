@echo off
cd /d "%~dp0"
set PATH=C:\PROGRA~1\nodejs;%PATH%
node server.js > server.log 2>&1
