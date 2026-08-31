# Script ETL em PowerShell para sincronização de Dados de Gestão Tributária e Parcelamentos JLE
$workingDir = $PSScriptRoot
Write-Output "=========================================================="
Write-Output "ATUALIZACAO: GESTAO TRIBUTARIA & CONTROLE DE PARCELAMENTOS"
Write-Output "Data/Hora: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
Write-Output "=========================================================="

$pythonScript = "$workingDir\update_parcelamentos.py"

if (-not (Test-Path $pythonScript)) {
    Write-Error "Script Python nao encontrado: $pythonScript"
    exit 1
}

# Executar o extrator Python
try {
    & python $pythonScript
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Falha na execucao do extrator Python de Parcelamentos."
        exit $LASTEXITCODE
    }
} catch {
    Write-Error "Erro ao invocar Python: $($_.Exception.Message)"
    exit 1
}

Write-Output "[ETL PowerShell] Processamento de Parcelamentos finalizado com sucesso."
