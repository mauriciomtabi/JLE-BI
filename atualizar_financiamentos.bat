@echo off
chcp 65001 > nul
title Atualizar Financiamentos e PMTs - BI JLE Telecom
echo ============================================================
echo   INICIANDO ATUALIZAÇÃO: FINANCIAMENTOS E PMTS
echo ============================================================
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -NoProfile -File ".\update_financiamentos.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Falha durante a atualização de Financiamentos.
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo [SUCESSO] Atualização de Financiamentos finalizada!
timeout /t 5
