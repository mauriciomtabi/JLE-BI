# Script unificado para atualizar todos os dados do BI (Financeiro, Claro e Veículos)
$workingDir = $PSScriptRoot
Write-Output "=========================================================="
Write-Output "INICIANDO ATUALIZAÇÃO COMPLETA DOS DADOS DO BI JLE TELECOM"
Write-Output "=========================================================="
Write-Output ""

# 1. Atualizar Fluxo de Caixa (Financeiro)
Write-Output "--- [1/3] Atualizando Fluxo de Caixa (Financeiro) ---"
& "$workingDir\update_dashboard.ps1"
Write-Output ""

# 2. Atualizar Analítico Claro
Write-Output "--- [2/3] Atualizando Analítico Claro ---"
& "$workingDir\update_cobranca.ps1"
Write-Output ""

# 3. Atualizar Veículos
Write-Output "--- [3/3] Atualizando Veículos ---"
& "$workingDir\update_veiculos.ps1"
Write-Output ""

Write-Output "=========================================================="
Write-Output "ATUALIZAÇÃO CONCLUÍDA COM SUCESSO!"
Write-Output "=========================================================="
