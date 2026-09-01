param(
    [switch]$Force
)

# Script PowerShell unificado para monitorar e-mail da Claro e atualizar o BI
# Delega para o motor Python com win32com para máxima estabilidade no Outlook COM e ETL ultra-rápido

$scriptDir = $PSScriptRoot
$pyScript = Join-Path $scriptDir "monitorar_email_claro.py"
$pyArgs = @("$pyScript")

if ($Force) {
    $pyArgs += "--force"
}

Write-Output "Iniciando monitoramento de e-mail da Claro via Python..."
& python.exe $pyArgs
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Output "Monitoramento concluido com sucesso!"
} else {
    Write-Error "Monitoramento falhou com codigo de saida $exitCode"
}

exit $exitCode
