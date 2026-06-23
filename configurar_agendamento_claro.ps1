# Script PowerShell para criar o Agendamento de Tarefa do Windows
# Executa o monitoramento de e-mail da Claro de segunda a sexta, a cada 1 hora.

$scriptPath = Join-Path $PSScriptRoot "monitorar_email_claro.ps1"
$workingDir = $PSScriptRoot

if (-not (Test-Path $scriptPath)) {
    Write-Error "O script monitorar_email_claro.ps1 nao foi encontrado na mesma pasta."
    Exit 1
}

# Remover tarefa antiga se existir
try {
    Unregister-ScheduledTask -TaskName "JLE_Telecom_Claro_Email_Monitor" -Confirm:$false -ErrorAction SilentlyContinue
} catch {}

# Criar a ação da tarefa
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" -WorkingDirectory $workingDir

# Criar um trigger diário que repete a cada 1 hora durante o dia inteiro
$trigger = New-ScheduledTaskTrigger -Daily -At "07:00:00"
# Adicionar repetição a cada 1 hora por 12 horas
$trigger.RepetitionInterval = (New-TimeSpan -Hours 1)
$trigger.RepetitionDuration = (New-TimeSpan -Hours 12)

# Configurações de comportamento
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

# Registrar a tarefa agendada no Windows
$taskName = "JLE_Telecom_Claro_Email_Monitor"
Register-ScheduledTask -TaskName $taskName -Trigger $trigger -Action $action -Settings $settings -Description "Monitoramento automatico de email da Claro e atualizacao do BI de Cobranca" -Force

Write-Output "Tarefa agendada '$taskName' configurada com sucesso!"
Write-Output "O monitor de email rodará diariamente a cada 1 hora das 07:00 as 19:00."
