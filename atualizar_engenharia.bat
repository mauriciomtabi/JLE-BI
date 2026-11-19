@echo off
title JLE Telecom - Atualizar Dados Engenharia Claro PR
cls
echo ==========================================================
echo       JLE TELECOM - ATUALIZADOR ENGENHARIA CLARO PR
echo ==========================================================
echo.
echo Executando script de ETL e Sincronizacao...
echo Lendo planilha da rede local e gerando dados...
echo.
powershell -ExecutionPolicy Bypass -File .\update_engenharia.ps1
echo.
echo ==========================================================
echo Processamento concluido! Os dados de Engenharia foram atualizados.
echo.
echo Pressione qualquer tecla para sair.
echo ==========================================================
pause >nul
exit
