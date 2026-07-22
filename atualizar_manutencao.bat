@echo off
title JLE Telecom - Atualizar Dados de Manutenção
cls
echo ==========================================================
echo       JLE TELECOM - ATUALIZADOR MANUAL MANUTENÇÃO
echo ==========================================================
echo.
echo Executando script de ETL (Processamento e Consolidação)...
echo Lendo planilha de Manutenção do Google Sheets...
echo.
powershell -ExecutionPolicy Bypass -File .\update_manutencao.ps1
echo.
echo ==========================================================
echo Processamento concluído! Os dados de Manutenção foram atualizados.
echo.
echo Pressione qualquer tecla para sair.
echo ==========================================================
pause >nul
exit
