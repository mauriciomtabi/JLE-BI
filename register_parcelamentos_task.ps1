# register_parcelamentos_task.ps1
# Registra a tarefa automatizada no Agendador de Tarefas do Windows (Task Scheduler)
# Executa de Segunda a Sexta-feira a cada hora no minuto :15 (08:15 ate 18:15)
# O deslocamento para :15 evita colisoes no Git com as rotinas de :00 (SAR, MDU, Manutencao) e :30 (Financiamentos)

$taskName = "JLE_Telecom_Impostos_Diario"
$scriptPath = "$PSScriptRoot\update_parcelamentos.ps1"
$workingDir = $PSScriptRoot

Write-Output "=========================================================="
Write-Output "REGISTRANDO AGENDAMENTO AUTOMATICO - IMPOSTOS JLE TELECOM"
Write-Output "=========================================================="

# Definir ação: Powershell com execução oculta
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" -WorkingDirectory "$workingDir"

# Definir gatilhos escalonados no minuto :15 de hora em hora (08h15 às 18h15)
$hours = @("08:15AM", "09:15AM", "10:15AM", "11:15AM", "12:15PM", "01:15PM", "02:15PM", "03:15PM", "04:15PM", "05:15PM", "06:15PM")
$triggers = @()
foreach ($h in $hours) {
    $triggers += New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At $h
}

# Definir configurações de resiliência
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)

# Registrar a tarefa para o usuário atual
try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -User "$env:USERNAME" -Force
    Write-Output "Tarefa '$taskName' registrada com sucesso!"
    Write-Output "Frequencia: Segunda a Sexta-feira de hora em hora no minuto :15 (08h15 as 18h15)"
    Write-Output "Script associado: $scriptPath"
} catch {
    Write-Error "Erro ao registrar a tarefa no Windows: $($_.Exception.Message)"
}
