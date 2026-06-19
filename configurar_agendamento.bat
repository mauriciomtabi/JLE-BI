@echo off
:: Verifica permissões de administrador
openfiles >nul 2>&1
if %errorlevel% neq 0 (
    echo ==========================================================
    echo  ATENCAO: Este script precisa ser executado como Administrador.
    echo ==========================================================
    echo Tentando abrir uma nova janela com privilegios elevados...
    powershell -Command "Start-Process -FilePath '%0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo ==========================================================
echo  CONFIGURANDO ATUALIZACAO AUTOMATICA DO BI JLE TELECOM
echo ==========================================================
echo Frequencia: De segunda a sexta-feira, as 10:00 e as 15:00.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File .\configurar_agendamento.ps1
echo.
echo ==========================================================
echo Processo concluido. Pressione qualquer tecla para sair.
echo ==========================================================
pause >nul
