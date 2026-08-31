# register_parcelamentos_task.ps1
# Registra a tarefa automatizada no Agendador de Tarefas do Windows (Task Scheduler)
# Executa de Segunda a Sexta-feira às 09:00 AM

$taskName = "JLE_Telecom_Impostos_Diario"
$scriptPath = "$PSScriptRoot\update_parcelamentos.ps1"
$workingDir = $PSScriptRoot

Write-Output "=========================================================="
Write-Output "REGISTRANDO AGENDAMENTO AUTOMATICO - IMPOSTOS JLE TELECOM"
Write-Output "=========================================================="

# Definir ação: Powershell com execução oculta
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" -WorkingDirectory "$workingDir"

# Definir gatilho: Segunda a Sexta às 09:00 AM
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At "09:00AM"

# Definir configurações de resiliência
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)

# Registrar a tarefa para o usuário atual
try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -User "$env:USERNAME" -Force
    Write-Output "Tarefa '$taskName' registrada com sucesso!"
    Write-Output "Frequencia: Segunda a Sexta-feira às 09:00 AM"
    Write-Output "Script associado: $scriptPath"
} catch {
    Write-Error "Erro ao registrar a tarefa no Windows: $($_.Exception.Message)"
}
