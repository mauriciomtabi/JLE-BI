@echo off
title JLE Telecom - Atualizar Dados do MDU
cls
echo ==========================================================
echo       JLE TELECOM - ATUALIZADOR MANUAL MDU
echo ==========================================================
echo.
echo Executando script de ETL (Processamento e Consolidação)...
echo Lendo arquivo mdu_data.csv...
echo.
powershell -ExecutionPolicy Bypass -File .\update_mdu.ps1
echo.
echo ==========================================================
echo Processamento concluído! Os dados de MDU foram atualizados.
echo.
echo Pressione qualquer tecla para sair.
echo ==========================================================
pause >nul
exit
