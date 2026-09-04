# ============================================================
# sync_sar_claro.ps1 — Orquestrador de Sincronização SAR x Claro
# Disparado automaticamente pelo Agendador do Windows (12:45)
# ============================================================

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $PSScriptRoot

$logFile = "$PSScriptRoot\sync_sar_claro.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Write-Log {
    param([string]$Message)
    $msg = "[$([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss'))] $Message"
    Write-Output $msg
    Add-Content -Path $logFile -Value $msg -Encoding utf8
}

Write-Log "------------------------------------------------------------"
Write-Log "INÍCIO DA EXECUÇÃO AGENDADA (sync_sar_claro.ps1)"
Write-Log "------------------------------------------------------------"

# 1. Executar o sincronizador em Python
$pythonExe = "python"
if (Get-Command "python" -ErrorAction SilentlyContinue) {
    Write-Log "Executando sync_sar_claro.py..."
    & $pythonExe "$PSScriptRoot\sync_sar_claro.py" *>> $logFile
    $exitCode = $LASTEXITCODE
    Write-Log "sync_sar_claro.py finalizado com código de saída: $exitCode"
} else {
    Write-Log "ERRO: Python não encontrado no PATH do sistema."
    exit 1
}

# 2. Atualizar a base SAR do BI local (sar_data.js e PWA)
if (Test-Path "$PSScriptRoot\update_sar.ps1") {
    Write-Log "Disparando atualização do BI local (update_sar.ps1)..."
    & powershell.exe -ExecutionPolicy Bypass -File "$PSScriptRoot\update_sar.ps1" *>> $logFile
    Write-Log "update_sar.ps1 finalizado."
}

Write-Log "------------------------------------------------------------"
Write-Log "FIM DA EXECUÇÃO AGENDADA"
Write-Log "------------------------------------------------------------"
