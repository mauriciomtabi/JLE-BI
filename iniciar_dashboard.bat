@echo off
title BI Fluxo de Caixa JLE Telecom - Atualizador
echo ==========================================================
echo       JLE TELECOM - BI FLUXO DE CAIXA ANALITICO
echo ==========================================================
echo.
echo Executando script de ETL (Extracao, Limpeza e Unificacao)...
echo Lendo planilha original em rede:
echo \\10.121.21.252\financeiro\Angelita\2026\FLUXO DIARIO
echo.
powershell -ExecutionPolicy Bypass -File .\update_dashboard.ps1
powershell -ExecutionPolicy Bypass -File .\update_cobranca.ps1
echo.
echo ==========================================================
echo Processamento concluido! A base local 'data.js' foi gerada.
echo.
echo Abrindo o Painel do BI no seu navegador padrao...
echo ==========================================================
start "" "index.html"
timeout /t 3 >nul
exit
