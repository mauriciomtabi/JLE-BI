@echo off
:: Verifica permissões de administrador
openfiles >nul 2>&1
if %errorlevel% neq 0 (
    echo ==========================================================
    echo  ATENÇÃO: Este script precisa ser executado como Administrador.
    echo ==========================================================
    echo Tentando abrir uma nova janela com privilégios elevados...
    powershell -Command "Start-Process -FilePath '%0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo ==========================================================
echo  CONFIGURANDO MONITORAMENTO E ATUALIZAÇÃO AUTOMÁTICA CLARO
echo ==========================================================
echo Frequência: De segunda a sexta, às 10h30 e às 15h30.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File .\configurar_agendamento_claro.ps1
echo.
echo ==========================================================
echo Processo concluído. Pressione qualquer tecla para sair.
echo ==========================================================
pause >nul
