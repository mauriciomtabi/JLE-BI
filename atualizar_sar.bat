@echo off
title JLE Telecom - Atualizar Dados do SAR
cls
echo ==========================================================
echo       JLE TELECOM - ATUALIZADOR MANUAL SAR
echo ==========================================================
echo.
echo Executando script de ETL (Processamento e Consolidacao)...
echo Lendo planilha SAR na rede / cache local...
echo.
powershell -ExecutionPolicy Bypass -File .\update_sar.ps1
echo.
echo ==========================================================
echo Processamento concluido! Os dados do SAR foram atualizados.
echo.
echo Pressione qualquer tecla para sair.
echo ==========================================================
pause >nul
exit
