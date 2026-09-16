@echo off
title Configurar Novo Notebook - BI JLE Telecom
echo ==========================================================
echo  CONFIGURANDO O NOVO NOTEBOOK PARA O BI JLE TELECOM
echo ==========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0configurar_novo_notebook.ps1"

echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul
