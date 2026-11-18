<#
.SYNOPSIS
    Script PowerShell para orquestração da atualização de dados de Engenharia Claro PR.
#>

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "ATUALIZANDO ENGENHARIA CLARO PR - JLE TELECOM" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$pyScript = Join-Path $ScriptDir "update_engenharia.py"

if (Test-Path $pyScript) {
    python $pyScript
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Sucesso na atualizacao da Engenharia PR!" -ForegroundColor Green
    } else {
        Write-Error "Falha na execucao do script Python (ExitCode: $LASTEXITCODE)"
    }
} else {
    Write-Error "Arquivo $pyScript nao encontrado."
}
