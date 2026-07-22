# Configura a tarefa agendada no Windows para atualizar os dados de Manutenção a partir do Google Sheets
# Frequência: A cada 1 hora, de Segunda a Sexta-feira, entre 8h e 18h.

$scriptPath = Join-Path $PSScriptRoot "update_manutencao.ps1"
$workingDir = $PSScriptRoot

if (-not (Test-Path $scriptPath)) {
    Write-Error "O script update_manutencao.ps1 nao foi encontrado na mesma pasta."
    Exit 1
}

# Remover tarefa anterior se existir
try {
    Unregister-ScheduledTask -TaskName "JLE_Telecom_Manutencao_Update" -Confirm:$false -ErrorAction SilentlyContinue
} catch {}

# Criar a ação da tarefa
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" -WorkingDirectory $workingDir

# Criar triggers para cada hora entre 08:00 e 18:00 de segunda a sexta-feira
$triggers = @()
$daysOfWeek = @('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')

for ($hour = 8; $hour -le 18; $hour++) {
    $timeStr = "{0:D2}:00:00" -f $hour
    $triggers += New-ScheduledTaskTrigger -Weekly -DaysOfWeek $daysOfWeek -At $timeStr
}

# Configurações adicionais de comportamento (limite de execução de 20 minutos)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

# Registrar a tarefa agendada no Windows
$taskName = "JLE_Telecom_Manutencao_Update"
Register-ScheduledTask -TaskName $taskName -Trigger $triggers -Action $action -Settings $settings -Description "Atualizacao automatica a cada 1h de Segunda a Sexta (8h as 18h) da pagina Manutencao do BI JLE via Google Sheets" -Force

Write-Output "=========================================================="
Write-Output "Tarefa agendada '$taskName' configurada com sucesso!"
Write-Output "Frequencia: A cada 1 hora de Segunda a Sexta-feira (08:00 as 18:00)."
Write-Output "=========================================================="
