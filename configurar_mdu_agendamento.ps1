# Configura a tarefa agendada no Windows para atualizar os dados de MDU a partir do Google Sheets
# Frequencia: A cada 1 hora (das 06:00 as 23:00), todos os dias.

$scriptPath = Join-Path $PSScriptRoot "update_mdu.ps1"
$workingDir = $PSScriptRoot

if (-not (Test-Path $scriptPath)) {
    Write-Error "O script update_mdu.ps1 nao foi encontrado na mesma pasta."
    Exit 1
}

# Remover tarefa anterior se existir
try {
    Unregister-ScheduledTask -TaskName "JLE_Telecom_MDU_Update" -Confirm:$false -ErrorAction SilentlyContinue
} catch {}

# Criar a acao da tarefa
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" -WorkingDirectory $workingDir

# Criar triggers para cada hora entre 06:00 e 23:00 diariamente
$triggers = @()
for ($hour = 6; $hour -le 23; $hour++) {
    $timeStr = "{0:D2}:00:00" -f $hour
    $triggers += New-ScheduledTaskTrigger -Daily -At $timeStr
}

# Configuracoes adicionais de comportamento (limite de execucao de 20 minutos)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

# Registrar a tarefa agendada no Windows
$taskName = "JLE_Telecom_MDU_Update"
Register-ScheduledTask -TaskName $taskName -Trigger $triggers -Action $action -Settings $settings -Description "Atualizacao automatica a cada 1 hora da base MDU do BI JLE via Google Sheets" -Force

Write-Output "=========================================================="
Write-Output "Tarefa agendada '$taskName' configurada com sucesso!"
Write-Output "Frequencia: A cada 1 hora todos os dias (06:00 as 23:00)."
Write-Output "=========================================================="
