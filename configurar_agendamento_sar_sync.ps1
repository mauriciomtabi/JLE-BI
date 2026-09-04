# ============================================================
# configurar_agendamento_sar_sync.ps1
# Registra tarefa no Agendador do Windows para rodar
# de Segunda a Sexta-feira às 12:45.
# ============================================================

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$scriptPath = Join-Path $PSScriptRoot "sync_sar_claro.ps1"
$workingDir = $PSScriptRoot

if (-not (Test-Path $scriptPath)) {
    Write-Error "O script sync_sar_claro.ps1 não foi encontrado em $workingDir."
    Exit 1
}

$taskName = "JLE_Telecom_SAR_Claro_Sync"

# 1. Remover tarefa anterior se já existir
try {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
} catch {}

# 2. Definir ação
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" `
    -WorkingDirectory $workingDir

# 3. Definir disparo semanal: Segunda a Sexta às 12:45
$daysOfWeek = @("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $daysOfWeek -At "12:45:00"

# 4. Configurações de execução
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

# 5. Registrar no Windows Task Scheduler
Register-ScheduledTask -TaskName $taskName `
    -Trigger $trigger `
    -Action $action `
    -Settings $settings `
    -Description "Sincronizacao automatica SAR x Analitico Claro (Seg a Sex as 12:45)" `
    -Force

Write-Output "=========================================================="
Write-Output "Tarefa agendada '$taskName' registrada com sucesso!"
Write-Output "Horario: Segunda a Sexta-feira as 12:45:00"
Write-Output "Script: $scriptPath"
Write-Output "=========================================================="
