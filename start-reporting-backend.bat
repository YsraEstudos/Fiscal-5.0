@echo off
setlocal EnableExtensions

cd /d "%~dp0"
title FISCAL WEB - Start Reporting Backend

set "VENV_DIR=.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "REQ_FILE=requirements-reporting.txt"

echo.
echo [KM] Iniciando backend local de relatorios...
echo [KM] Pasta: %CD%
echo.

if not exist "%REQ_FILE%" (
  echo [ERRO] Arquivo "%REQ_FILE%" nao encontrado.
  pause
  exit /b 1
)

if not exist "%VENV_PY%" (
  echo [KM] Criando ambiente virtual em "%VENV_DIR%"...
  py -3 -m venv "%VENV_DIR%" 2>nul
  if errorlevel 1 (
    python -m venv "%VENV_DIR%"
    if errorlevel 1 (
      echo [ERRO] Nao foi possivel criar o venv. Instale Python 3 e tente novamente.
      pause
      exit /b 1
    )
  )
)

call "%VENV_DIR%\Scripts\activate.bat"
if errorlevel 1 (
  echo [ERRO] Falha ao ativar o ambiente virtual.
  pause
  exit /b 1
)

echo [KM] Instalando/atualizando dependencias...
python -m pip install -r "%REQ_FILE%"
if errorlevel 1 (
  echo [ERRO] Falha ao instalar dependencias.
  pause
  exit /b 1
)

if not defined KM_REPORT_TOKEN (
  set "KM_REPORT_TOKEN=km-local-token"
  echo [KM] KM_REPORT_TOKEN nao definido. Usando token padrao local: %KM_REPORT_TOKEN%
) else (
  echo [KM] KM_REPORT_TOKEN detectado no ambiente.
)

echo.
echo [KM] Backend subindo em http://127.0.0.1:8765
echo [KM] Health: http://127.0.0.1:8765/health
echo [KM] Pressione Ctrl+C para parar.
echo.



if exist "C:\Program Files\Tesseract-OCR" set "PATH=%PATH%;C:\Program Files\Tesseract-OCR" && echo [KM] Tesseract detectado e adicionado ao PATH.

if exist "C:\Program Files\Calibre2\app\bin" set "PATH=%PATH%;C:\Program Files\Calibre2\app\bin" && echo [KM] Poppler (via Calibre) detectado e adicionado ao PATH.

python reporting_service.py
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo [KM] Servico finalizado. Codigo de saida: %EXIT_CODE%
pause
exit /b %EXIT_CODE%
