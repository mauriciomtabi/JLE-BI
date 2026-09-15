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

# 3. Definir disparos semanais: Segunda a Sexta às 08:45, 12:45 e 16:45
$daysOfWeek = @("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
$trigger1 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $daysOfWeek -At "08:45:00"
$trigger2 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $daysOfWeek -At "12:45:00"
$trigger3 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $daysOfWeek -At "16:45:00"
$triggers = @($trigger1, $trigger2, $trigger3)

# 4. Configurações de execução
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

# 5. Registrar no Windows Task Scheduler
Register-ScheduledTask -TaskName $taskName `
    -Trigger $triggers `
    -Action $action `
    -Settings $settings `
    -Description "Sincronizacao automatica SAR x Analitico Claro (Seg a Sex as 08:45, 12:45 e 16:45)" `
    -Force

Write-Output "=========================================================="
Write-Output "Tarefa agendada '$taskName' registrada com sucesso!"
Write-Output "Horários: Segunda a Sexta-feira às 08:45, 12:45 e 16:45"
Write-Output "Configuração: StartWhenAvailable ATIVO (executa ao ligar se o note estava desligado)"
Write-Output "Script: $scriptPath"
Write-Output "=========================================================="
