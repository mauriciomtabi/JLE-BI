@echo off
title JLE Telecom - Atualizar Dados do BI (Financeiro + Tecnodrill)
cls
echo ==========================================================
echo       JLE TELECOM - ATUALIZADOR MANUAL FINANCEIRO
echo ==========================================================
echo.
echo [1/2] Processando planilha JLE Financeiro...
echo.
powershell -ExecutionPolicy Bypass -File .\update_dashboard.ps1
echo.
echo ==========================================================
echo [2/2] Processando planilha Tecnodrill...
echo.
powershell -ExecutionPolicy Bypass -File .\update_tecnodrill.ps1
echo.
echo ==========================================================
echo Processamento concluido! Financeiro JLE e Tecnodrill atualizados.
echo.
echo Pressione qualquer tecla para sair.
echo ==========================================================
pause >nul
exit
