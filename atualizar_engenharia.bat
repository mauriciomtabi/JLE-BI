@echo off
chcp 65001 > nul
echo ========================================================
echo ATUALIZANDO DADOS ENGENHARIA CLARO PR - JLE TELECOM
echo ========================================================
python "%~dp0update_engenharia.py"
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo SUCESSO: Dados de Engenharia PR atualizados com exito!
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo ERRO: Ocorreu uma falha na atualizacao da Engenharia.
    echo ========================================================
)
pause
