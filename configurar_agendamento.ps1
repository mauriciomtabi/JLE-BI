# Configura a tarefa agendada no Windows para atualizar todos os dados do BI (Fluxo de Caixa e Analítico Claro)
# Frequência: de segunda a sexta, às 10:00 e às 15:00.

$scriptPath = Join-Path $PSScriptRoot "update_all.ps1"
$workingDir = $PSScriptRoot

if (-not (Test-Path $scriptPath)) {
    Write-Error "O script update_all.ps1 nao foi encontrado na mesma pasta."
    Exit 1
}

# Remover tarefa legado se existir
try {
    Unregister-ScheduledTask -TaskName "JLE_Telecom_FluxoCaixa_Update" -Confirm:$false -ErrorAction SilentlyContinue
} catch {}

# Criar a ação da tarefa
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" -WorkingDirectory $workingDir

# Criar os dois triggers (10h e 15h de Seg-Sex)
$trigger1 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At "10:00:00"
$trigger2 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At "15:00:00"

# Configurações adicionais de comportamento
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

# Registrar a tarefa agendada no Windows
$taskName = "JLE_Telecom_BI_Update"
Register-ScheduledTask -TaskName $taskName -Trigger @($trigger1, $trigger2) -Action $action -Settings $settings -Description "Atualizacao automatica do BI JLE (Financeiro e Analitico Claro) as 10h e 15h (seg-sex)" -Force

Write-Output "Tarefa agendada '$taskName' configurada com sucesso!"
Write-Output "O BI sera atualizado de segunda a sexta-feira nos seguintes horarios: 10h00 e 15h00."
