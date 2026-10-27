# Configura a tarefa agendada no Windows para atualizar todos os dados do BI JLE Telecom
# Frequência: de segunda a sexta, 3 vezes ao dia: às 08:30, 13:00 e 17:30.

$scriptPath = Join-Path $PSScriptRoot "update_all.ps1"
$workingDir = $PSScriptRoot

if (-not (Test-Path $scriptPath)) {
    Write-Error "O script update_all.ps1 nao foi encontrado na mesma pasta."
    Exit 1
}

# Remover tarefas legadas/redundantes para garantir que todos os módulos rodem juntos sincronizados
try {
    Unregister-ScheduledTask -TaskName "JLE_Telecom_FluxoCaixa_Update" -Confirm:$false -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName "JLE_Telecom_Impostos_Diario" -Confirm:$false -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName "JLE_Telecom_Financiamentos_Update" -Confirm:$false -ErrorAction SilentlyContinue
} catch {}

# Criar a ação da tarefa
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" -WorkingDirectory $workingDir

# Criar os 3 triggers (08h30, 13h00 e 17h30 de Seg-Sex)
$trigger1 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At "08:30:00"
$trigger2 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At "13:00:00"
$trigger3 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At "17:30:00"

# Configurações adicionais de comportamento
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 45)

# Registrar a tarefa agendada no Windows
$taskName = "JLE_Telecom_BI_Update"
Register-ScheduledTask -TaskName $taskName -Trigger @($trigger1, $trigger2, $trigger3) -Action $action -Settings $settings -Description "Atualizacao automatica unificada de todos os modulos do BI JLE Telecom (08h30, 13h00 e 17h30)" -Force

Write-Output "Tarefa agendada '$taskName' configurada com sucesso!"
Write-Output "O BI sera atualizado de segunda a sexta-feira 3 vezes ao dia: 08h30, 13h00 e 17h30."
