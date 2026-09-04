@echo off
chcp 65001 > nul
echo ============================================================
echo Configurando Agendamento SAR x Analítico Claro (12:45)
echo ============================================================

powershell.exe -ExecutionPolicy Bypass -File "%~dp0configurar_agendamento_sar_sync.ps1"

pause
