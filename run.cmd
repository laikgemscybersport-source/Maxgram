@echo off
cd /d "%~dp0"
set PATH=C:\PROGRA~1\nodejs;%PATH%
rem Демо-аккаунты u1-u5 нужны только для локальной разработки.
rem Без этой строки база стартует пустой — как на публичном сайте.
if "%SEED_DEMO%"=="" set SEED_DEMO=1
node server.js > server.log 2>&1
