@echo off
title JLE Telecom - Atualizar Dados do BI (Financeiro)
cls
echo ==========================================================
echo       JLE TELECOM - ATUALIZADOR MANUAL FINANCEIRO
echo ==========================================================
echo.
echo Executando script de ETL (Processamento e Consolidacao)...
echo Lendo planilha original em rede...
echo.
powershell -ExecutionPolicy Bypass -File .\update_dashboard.ps1
echo.
echo ==========================================================
echo Processamento concluido! Os dados do Financeiro foram atualizados.
echo.
echo Pressione qualquer tecla para sair.
echo ==========================================================
pause >nul
exit
