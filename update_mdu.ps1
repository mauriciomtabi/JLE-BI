# Script ETL para processar dados de MDU
Write-Output "Iniciando processamento de MDU..."
$pythonCmd = "python .\update_mdu.py"
Invoke-Expression $pythonCmd
if ($LASTEXITCODE -eq 0) {
    Write-Output "Dados de MDU atualizados com sucesso!"
} else {
    Write-Error "Falha ao executar o processamento em Python."
}
