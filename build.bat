@echo off
title Meteorite Build Menu
cls

:menu
echo ===========================================
echo         Meteorite Build Options
echo ===========================================
echo 1. Build Debug
echo 2. Build Release
echo 3. Publish Release (Single File EXE)
echo 4. Exit
echo ===========================================
set /p choice="Choose an option (1-4): "

if "%choice%"=="1" goto debug
if "%choice%"=="2" goto release
if "%choice%"=="3" goto singlefile
if "%choice%"=="4" goto eof

echo Invalid choice. Try again.
pause
cls
goto menu

:debug
echo Building Debug...
dotnet build -c Debug
pause
cls
goto menu

:release
echo Building Release...
dotnet build -c Release
pause
cls
goto menu

:singlefile
echo Publishing Release (Single File) Framework Dependent...
dotnet publish -c Release -r win-x64 -p:PublishSingleFile=true --self-contained false
pause
cls
goto menu

:eof
exit
