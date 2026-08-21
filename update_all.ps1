# Script unificado para atualizar todos os dados do BI (Financeiro, Claro, Veículos, Manutenção e MDU)
$workingDir = $PSScriptRoot
Write-Output "=========================================================="
Write-Output "INICIANDO ATUALIZACAO COMPLETA DOS DADOS DO BI JLE TELECOM"
Write-Output "=========================================================="
Write-Output ""

# 1. Atualizar Fluxo de Caixa (Financeiro)
Write-Output "--- [1/5] Atualizando Fluxo de Caixa (Financeiro) ---"
if (Test-Path "$workingDir\update_dashboard.ps1") {
    & "$workingDir\update_dashboard.ps1"
}
Write-Output ""

# 2. Atualizar Analítico Claro (Monitora e-mail e executa ETL)
Write-Output "--- [2/5] Atualizando Analítico Claro ---"
$claroMonitor = "$workingDir\monitorar_email_claro.ps1"
if (Test-Path $claroMonitor) {
    & "$claroMonitor"
} elseif (Test-Path "$workingDir\update_cobranca.ps1") {
    & "$workingDir\update_cobranca.ps1"
}
Write-Output ""

# 3. Atualizar Veículos
Write-Output "--- [3/5] Atualizando Veículos ---"
if (Test-Path "$workingDir\update_veiculos.ps1") {
    & "$workingDir\update_veiculos.ps1"
}
Write-Output ""

# 4. Atualizar Manutenção
Write-Output "--- [4/5] Atualizando Manutenção ---"
if (Test-Path "$workingDir\update_manutencao.ps1") {
    & "$workingDir\update_manutencao.ps1"
}
Write-Output ""

# 5. Atualizar MDU
Write-Output "--- [5/5] Atualizando MDU ---"
if (Test-Path "$workingDir\update_mdu.ps1") {
    & "$workingDir\update_mdu.ps1"
}
Write-Output ""

Write-Output "=========================================================="
Write-Output "ATUALIZACAO COMPLETA CONCLUIDA COM SUCESSO!"
Write-Output "=========================================================="
