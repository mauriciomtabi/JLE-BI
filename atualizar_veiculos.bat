@echo off
title JLE Telecom - Atualizar Dados do BI (Veiculos)
cls
echo ==========================================================
echo       JLE TELECOM - ATUALIZADOR MANUAL VEICULOS
echo ==========================================================
echo.
echo Executando script de ETL (Processamento e Consolidacao)...
echo Consultando API Ticket Log...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0update_veiculos.ps1"
if errorlevel 1 (
    echo Falha na consulta Ticket. Dados anteriores preservados.
    pause
    exit /b 1
)
echo.
echo ==========================================================
echo Processamento concluido! Os dados dos Veiculos foram atualizados.
echo.
echo Pressione qualquer tecla para sair.
echo ==========================================================
pause >nul
exit
