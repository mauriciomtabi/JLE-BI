# Configura a tarefa agendada no Windows para atualizar os dados de MDU a partir do Google Sheets
# Frequência: A cada 1 hora, todos os dias, por tempo indeterminado.

$scriptPath = Join-Path $PSScriptRoot  update_mdu.ps1
$workingDir = $PSScriptRoot

if (-not (Test-Path $scriptPath)) {
    Write-Error O script update_mdu.ps1 nao foi encontrado na mesma pasta.
    Exit 1
}

# Remover tarefa anterior se existir
try {
    Unregister-ScheduledTask -TaskName JLE_Telecom_MDU_Update -Confirm:$false -ErrorAction SilentlyContinue
} catch {}

# Criar a ação da tarefa
$action = New-ScheduledTaskAction -Execute powershell.exe -Argument -ExecutionPolicy Bypass -WindowStyle Hidden -File $scriptPath -WorkingDirectory $workingDir

# Criar o trigger com repetição de hora em hora por tempo indeterminado (9999 dias)
$trigger = New-ScheduledTaskTrigger -Daily -At 00:00:00
$trigger.Repetition = (New-ScheduledTaskRepetitionPattern -Interval (New-TimeSpan -Hours 1) -Duration (New-TimeSpan -Days 9999))
$trigger.Repetition.StopAtDurationEnd = $false

# Configurações adicionais de comportamento
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

# Registrar a tarefa agendada no Windows
$taskName = JLE_Telecom_MDU_Update
Register-ScheduledTask -TaskName $taskName -Trigger $trigger -Action $action -Settings $settings -Description Atualizacao automatica de hora em hora do MDU do BI JLE via Google Sheets -Force

Write-Output Tarefa agendada `$taskName configurada com sucesso!
Write-Output O MDU sera atualizado automaticamente a cada 1 hora indefinidamente.
