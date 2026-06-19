@echo off
title BI JLE Telecom - Atualizador de Dados
echo ==========================================================
echo       JLE TELECOM - ATUALIZADOR DO BI (COMPLETO)
echo ==========================================================
echo.
echo Executando script de ETL (Processamento e Consolidação)...
echo Lendo planilhas em rede...
echo.
powershell -ExecutionPolicy Bypass -File .\update_all.ps1
echo.
echo ==========================================================
echo Processamento concluído! As bases de dados foram geradas.
echo.
echo Abrindo o Painel do BI no seu navegador padrão...
echo ==========================================================
start "" "index.html"
timeout /t 3 >nul
exit
