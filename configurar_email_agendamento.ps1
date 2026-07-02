# configurar_email_agendamento.ps1
# Registra a tarefa agendada no Windows para verificar e disparar e-mails a cada 15 minutos
# O script send_mdu_email.ps1 e inteligente: so envia se estiver dentro da janela de horario configurada

$scriptPath = Join-Path $PSScriptRoot "send_mdu_email.ps1"
$workingDir = $PSScriptRoot
$taskName = "JLE_Telecom_Email_Check"

if (-not (Test-Path $scriptPath)) {
    Write-Error "O script send_mdu_email.ps1 nao foi encontrado na pasta: $PSScriptRoot"
    Exit 1
}

# Remover tarefa antiga se existir
try {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
} catch {}

# Acao: Rodar o PowerShell script silenciosamente
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" `
    -WorkingDirectory $workingDir

# Trigger: A cada 15 minutos (verificacao de janela, o script decide quando enviar)
$trigger = New-ScheduledTaskTrigger -At "00:00:00" -Once -RepetitionInterval (New-TimeSpan -Minutes 15)

# Configuracoes: rodar mesmo se o PC estiver na bateria, iniciar se disponivel, timeout de 5 minutos
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

# Registrar a tarefa
Register-ScheduledTask `
    -TaskName $taskName `
    -Trigger $trigger `
    -Action $action `
    -Settings $settings `
    -Description "Verificacao a cada 15 minutos para disparo de e-mails automaticos do BI JLE Telecom" `
    -Force

Write-Output "============================================================"
Write-Output "Tarefa '$taskName' registrada com sucesso!"
Write-Output "Verificacao de e-mails a cada 15 minutos ativada."
Write-Output "Configure horarios e destinatarios no painel Admin > E-mails."
Write-Output "============================================================"
