# Script PowerShell para criar o Agendamento de Tarefa do Windows
# Executa o monitoramento de e-mail da Claro de segunda a sexta, duas vezes ao dia.

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

# Criar triggers de 2 em 2 horas das 07:30 às 21:30 (Seg-Dom)
$triggers = @(
    (New-ScheduledTaskTrigger -Daily -At "07:30:00"),
    (New-ScheduledTaskTrigger -Daily -At "09:30:00"),
    (New-ScheduledTaskTrigger -Daily -At "11:30:00"),
    (New-ScheduledTaskTrigger -Daily -At "13:30:00"),
    (New-ScheduledTaskTrigger -Daily -At "15:30:00"),
    (New-ScheduledTaskTrigger -Daily -At "17:30:00"),
    (New-ScheduledTaskTrigger -Daily -At "19:30:00"),
    (New-ScheduledTaskTrigger -Daily -At "21:30:00")
)

# Configurações de comportamento
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

# Registrar a tarefa agendada no Windows
$taskName = "JLE_Telecom_Claro_Email_Monitor"
Register-ScheduledTask -TaskName $taskName -Trigger $triggers -Action $action -Settings $settings -Description "Monitoramento automatico de email da Claro e atualizacao do BI de Cobranca" -Force

Write-Output "Tarefa agendada '$taskName' configurada com sucesso!"
Write-Output "O monitor de email rodará de segunda a sexta às 10:30 e às 15:30."
