@echo off
title JLE Telecom - Atualizar Dados do BI (Veiculos)
cls
echo ==========================================================
echo       JLE TELECOM - ATUALIZADOR MANUAL VEICULOS
echo ==========================================================
echo.
echo Executando script de ETL (Processamento e Consolidacao)...
echo Lendo planilha de rede...
echo.
powershell -ExecutionPolicy Bypass -File .\update_veiculos.ps1
echo.
echo ==========================================================
echo Processamento concluido! Os dados dos Veiculos foram atualizados.
echo.
echo Pressione qualquer tecla para sair.
echo ==========================================================
pause >nul
exit
