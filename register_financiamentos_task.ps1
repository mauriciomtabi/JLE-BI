# register_financiamentos_task.ps1
# Registra a tarefa automatizada no Agendador de Tarefas do Windows (Task Scheduler)
# Executa de Segunda a Sexta-feira das 08h às 18h (de hora em hora)

$taskName = "JLE_Telecom_Financiamentos_Update"
$scriptPath = "$PSScriptRoot\update_financiamentos.ps1"
$workingDir = $PSScriptRoot

Write-Output "=========================================================="
Write-Output "REGISTRANDO AGENDAMENTO AUTOMATICO - FINANCIAMENTOS JLE"
Write-Output "=========================================================="

# Definir ação: Powershell com execução oculta
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" -WorkingDirectory "$workingDir"

# Definir gatilhos: Segunda a Sexta das 08h às 18h (de hora em hora)
$triggers = @()
8..18 | ForEach-Object {
    $hourStr = "{0:D2}:00" -f $_
    $triggers += (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At $hourStr)
}

# Definir configurações de resiliência
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)

# Registrar a tarefa para o usuário atual
try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -User "$env:USERNAME" -Force
    Write-Output "Tarefa '$taskName' registrada com sucesso!"
    Write-Output "Frequencia: Segunda a Sexta-feira das 08h as 18h (horaria)"
    Write-Output "Script associado: $scriptPath"
} catch {
    Write-Error "Erro ao registrar a tarefa no Windows: $($_.Exception.Message)"
}
