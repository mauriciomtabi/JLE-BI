@echo off
title JLE Telecom - Atualizar Dados do BI
cls
echo ==========================================================
echo       JLE TELECOM - ATUALIZADOR MANUAL DO BI
echo ==========================================================
echo.
echo Executando script de ETL (Processamento e Unificacao de dados)...
echo Lendo planilha original em rede:
echo \\10.121.21.252\financeiro\Angelita\2026\FLUXO DIARIO
echo.
powershell -ExecutionPolicy Bypass -File .\update_dashboard.ps1
echo.
echo ==========================================================
echo Processamento concluido! Os dados em 'data.js' foram atualizados.
echo.
echo Pressione qualquer tecla para sair.
echo ==========================================================
pause >nul
exit
