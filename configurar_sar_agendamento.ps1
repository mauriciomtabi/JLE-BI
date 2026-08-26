# Configura a tarefa agendada no Windows para atualizar os dados de SAR a partir da planilha de rede
# Frequencia: De segunda a sexta-feira, a cada 1 hora (das 06:00 as 23:00).

$scriptPath = Join-Path $PSScriptRoot "update_sar.ps1"
$workingDir = $PSScriptRoot

if (-not (Test-Path $scriptPath)) {
    Write-Error "O script update_sar.ps1 nao foi encontrado na pasta $workingDir."
    Exit 1
}

$taskName = "JLE_Telecom_SAR_Update"

# Remover tarefa anterior se existir
try {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
} catch {}

# Criar a acao da tarefa
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" -WorkingDirectory $workingDir

# Criar triggers para cada hora entre 06:00 e 23:00 de segunda a sexta
$triggers = @()
$daysOfWeek = @("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")

for ($hour = 6; $hour -le 23; $hour++) {
    $timeStr = "{0:D2}:00:00" -f $hour
    $triggers += New-ScheduledTaskTrigger -Weekly -DaysOfWeek $daysOfWeek -At $timeStr
}

# Configuracoes adicionais de comportamento (limite de execucao de 20 minutos)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

# Registrar a tarefa agendada no Windows
Register-ScheduledTask -TaskName $taskName -Trigger $triggers -Action $action -Settings $settings -Description "Atualizacao automatica de hora em hora (Seg a Sex, 06:00 as 23:00) da base SAR do BI JLE via rede local" -Force

Write-Output "=========================================================="
Write-Output "Tarefa agendada '$taskName' configurada com sucesso!"
Write-Output "Frequencia: De segunda a sexta-feira, a cada 1 hora (06:00 as 23:00)."
Write-Output "=========================================================="
