@echo off
chcp 65001 >nul
echo ========================================================
echo CONFIGURAR AGENDAMENTO DE ATUALIZACAO SAR (DE 1 EM 1 HORA)
echo ========================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0configurar_sar_agendamento.ps1"
echo.
pause
