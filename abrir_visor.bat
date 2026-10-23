@echo off
rem Visor de revision HERMES: levanta el servidor local y abre http://localhost:8765
chcp 65001 >nul
cd /d "%~dp0"
title Visor HERMES

set "PY="
for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
    if exist "%%D\python.exe" set "PY=%%D\python.exe"
)
if not defined PY (
    where py >nul 2>nul && set "PY=py"
)
if not defined PY (
    python -c "import sys" >nul 2>nul && set "PY=python"
)
if not defined PY (
    echo No encontre Python 3. Instalalo desde python.org y vuelve a abrir este archivo.
    pause
    exit /b 1
)

"%PY%" servidor.py
if errorlevel 1 pause
