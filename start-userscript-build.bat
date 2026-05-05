@echo off
setlocal EnableExtensions

cd /d "%~dp0"
title FISCAL WEB - Build UserScript

echo.
echo [KM] Iniciando build do UserScript...
echo [KM] Pasta: %CD%
echo.

if not exist "package.json" (
  echo [ERRO] Arquivo "package.json" nao encontrado.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERRO] npm nao encontrado no PATH. Instale Node.js e tente novamente.
  pause
  exit /b 1
)

echo [KM] Instalando dependencias...
call npm install
if errorlevel 1 (
  echo [KM] "npm install" falhou. Tentando com --legacy-peer-deps...
  call npm install --legacy-peer-deps
  if errorlevel 1 (
    echo [ERRO] Falha no install, inclusive com --legacy-peer-deps.
    pause
    exit /b 1
  )
)

echo.
echo [KM] Gerando build...
call npm run build
if errorlevel 1 (
  echo [ERRO] Falha no "npm run build".
  pause
  exit /b 1
)

echo.
echo [KM] Build concluido com sucesso.
echo [KM] Arquivo esperado: dist\FISCAL 4.0.user.js
pause
exit /b 0
