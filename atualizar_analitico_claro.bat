@echo off
title JLE Telecom - Atualizar Dados Analitico Claro
cls
echo ==========================================================
echo       JLE TELECOM - ATUALIZADOR DO ANALITICO CLARO
echo ==========================================================
echo.
echo Executando script de ETL (Processamento e Compressao)...
echo Lendo planilha original em rede:
echo \\10.121.21.252\mauricio.maciel@jletelecom.com.br\ANALITICO CLARO
echo.
powershell -ExecutionPolicy Bypass -File .\update_cobranca.ps1
echo.
echo ==========================================================
echo Processamento concluido! Os dados foram salvos.
echo.
echo Pressione qualquer tecla para sair.
echo ==========================================================
pause >nul
exit
