# Script unificado para atualizar todos os dados do BI (Fluxo de Caixa e Analítico Claro)
$workingDir = $PSScriptRoot
Write-Output "=========================================================="
Write-Output "INICIANDO ATUALIZAÇÃO COMPLETA DOS DADOS DO BI JLE TELECOM"
Write-Output "=========================================================="
Write-Output ""

# 1. Atualizar Fluxo de Caixa (Financeiro)
Write-Output "--- [1/2] Atualizando Fluxo de Caixa (Financeiro) ---"
& "$workingDir\update_dashboard.ps1"
Write-Output ""

# 2. Atualizar Analítico Claro
Write-Output "--- [2/2] Atualizando Analítico Claro ---"
& "$workingDir\update_cobranca.ps1"
Write-Output ""

Write-Output "=========================================================="
Write-Output "ATUALIZAÇÃO CONCLUÍDA COM SUCESSO!"
Write-Output "=========================================================="
