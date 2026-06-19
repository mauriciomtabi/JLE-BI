@echo off
title JLE Telecom - Atualizar Dados do BI
cls
echo ==========================================================
echo       JLE TELECOM - ATUALIZADOR MANUAL DO BI
echo ==========================================================
echo.
echo Executando script de ETL (Processamento e Consolidação)...
echo Lendo planilhas em rede...
echo.
powershell -ExecutionPolicy Bypass -File .\update_all.ps1
echo.
echo ==========================================================
echo Processamento concluído! Todos os dados foram atualizados.
echo.
echo Pressione qualquer tecla para sair.
echo ==========================================================
pause >nul
exit
