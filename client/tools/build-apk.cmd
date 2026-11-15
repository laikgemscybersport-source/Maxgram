@echo off
REM === Скрипт сборки APK для MAXgram ===
REM
REM ТРЕБОВАНИЯ:
REM   1. JDK 17+ (не 1.8!) — https://adoptium.net
REM   2. Android SDK (tools/cmdline-tools) или Android Studio
REM   3. Gradle в PATH (или gradlew из android/ папки)
REM
REM ЗАПУСК:
REM   cd messenger\client
REM   npm run build
REM   npx cap sync
REM   tools\build-apk.cmd
REM
REM Для CI (GitHub Actions) используется аналогичная последовательность.

setlocal enabledelayedexpansion

echo [1/3] Building web assets...
call npm run build
if errorlevel 1 (
  echo ERROR: build failed
  exit /b 1
)

echo [2/3] Syncing Capacitor assets...
call npx cap sync
if errorlevel 1 (
  echo ERROR: cap sync failed
  exit /b 1
)

echo [3/3] Building APK with Gradle...
cd android
call gradlew.bat assembleDebug
if errorlevel 1 (
  echo ERROR: gradle build failed
  echo Make sure JDK 17+ and Android SDK are installed.
  exit /b 1
)

echo.
echo ========================================
echo APK built successfully!
echo ========================================
for /f "tokens=*" %%f in ('dir /b /o:-d app\build\outputs\apk\debug\*.apk 2^>nul') do (
  echo   app\build\outputs\apk\debug\%%f
)
echo ========================================
echo.
echo To install on a device:
echo   adb install app\build\outputs\apk\debug\*.apk
