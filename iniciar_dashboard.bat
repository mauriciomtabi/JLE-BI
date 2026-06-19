@echo off
title BI Fluxo de Caixa JLE Telecom - Atualizador
echo ==========================================================
echo       JLE TELECOM - BI FLUXO DE CAIXA ANALITICO
echo ==========================================================
echo.
echo Executando script de ETL (Extracao, Limpeza e Unificacao)...
echo Lendo planilha original em rede...
echo.
powershell -ExecutionPolicy Bypass -File .\update_dashboard.ps1
echo.
echo ==========================================================
echo Processamento concluido! A base local 'data.js' foi gerada.
echo.
echo Pressione qualquer tecla para sair.
echo ==========================================================
pause >nul
exit
