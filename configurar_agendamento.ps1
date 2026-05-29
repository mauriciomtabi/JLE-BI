# Configura a tarefa agendada no Windows para atualizar o dashboard da JLE Telecom
# Frequência: de segunda a sexta, de hora em hora das 8h às 18h.

$scriptPath = Join-Path $PSScriptRoot "update_dashboard.ps1"
$workingDir = $PSScriptRoot

if (-not (Test-Path $scriptPath)) {
    Write-Error "O script update_dashboard.ps1 nao foi encontrado na mesma pasta."
    Exit 1
}

# Criar a ação da tarefa
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" -WorkingDirectory $workingDir

# Criar o trigger: semanal, seg a sex, às 8:00
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At "08:00:00"

# Criar um trigger temporário para obter as configurações de repetição compatíveis
$tempTrigger = New-ScheduledTaskTrigger -Once -At "08:00:00" -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Hours 10)

# Copiar as configurações de repetição do trigger temporário para o principal
$trigger.Repetition = $tempTrigger.Repetition

# Configurações adicionais de comportamento
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

# Registrar a tarefa agendada no Windows
$taskName = "JLE_Telecom_FluxoCaixa_Update"
Register-ScheduledTask -TaskName $taskName -Trigger $trigger -Action $action -Settings $settings -Description "Atualizacao automatica a cada 1h (seg-sex, 8h-18h) do dashboard JLE Telecom" -Force

Write-Output "Tarefa agendada '$taskName' configurada com sucesso!"
Write-Output "O dashboard sera atualizado automaticamente de segunda a sexta-feira, de hora em hora, entre 8:00 e 18:00."
