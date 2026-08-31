@echo off
chcp 65001 > nul
echo ========================================================
echo ATUALIZANDO DADOS TRIBUTARIOS E PARCELAMENTOS - JLE TELECOM
echo ========================================================
python "%~dp0update_parcelamentos.py"
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo SUCESSO: Dados de Parcelamentos atualizados com exito!
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo ERRO: Ocorreu uma falha na atualizacao dos dados.
    echo ========================================================
)
pause
