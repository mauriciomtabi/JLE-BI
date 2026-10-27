# ==============================================================================
# SCRIPT DE RESTAURAÇÃO DE TAREFAS AGENDADAS - BI JLE TELECOM
# Execute este script como Administrador no PowerShell do NOVO NOTEBOOK
# ==============================================================================

$baseDir = $PSScriptRoot
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " CONFIGURANDO AGENDAMENTOS AUTOMATICOS - BI JLE TELECOM" -ForegroundColor Yellow
Write-Host " Diretorio Base : $baseDir"
Write-Host " Usuario Windows: $currentUser"
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

function Criar-Tarefa {
    param (
        [string]$Nome,
        [string]$ScriptRelativo,
        [array]$Triggers,
        [string]$Descricao
    )

    $fullPath = Join-Path $baseDir $ScriptRelativo
    if (!(Test-Path $fullPath)) {
        Write-Warning "Arquivo nao encontrado: $fullPath (Pulando criacao de $Nome)"
        return
    }

    # Desregistrar se ja existir
    Unregister-ScheduledTask -TaskName $Nome -Confirm:$false -ErrorAction SilentlyContinue

    $action = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$fullPath`"" `
        -WorkingDirectory $baseDir

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Hours 2)

    try {
        Register-ScheduledTask `
            -TaskName $Nome `
            -Action $action `
            -Trigger $Triggers `
            -Settings $settings `
            -Description $Descricao `
            -Force | Out-Null
        Write-Host "[OK] Tarefa '$Nome' registrada com sucesso!" -ForegroundColor Green
    } catch {
        Write-Host "[ERRO] Falha ao registrar '$Nome': $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 1. JLE_Telecom_BI_Update (Seg a Sex às 08h30, 13h00 e 17h30)
$trig1 = @(
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At "08:30AM"),
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At "01:00PM"),
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At "05:30PM")
)
Criar-Tarefa -Nome "JLE_Telecom_BI_Update" -ScriptRelativo "update_all.ps1" -Triggers $trig1 -Descricao "Atualizacao automatica unificada do BI JLE (Financeiro e Modulos Operacionais) as 08h30, 13h00 e 17h30 (seg-sex)"

# 2. JLE_Telecom_Claro_Email_Monitor (Terças às 15h e 22h)
$trig2 = @(
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Tuesday -At "03:00PM"),
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Tuesday -At "10:00PM")
)
Criar-Tarefa -Nome "JLE_Telecom_Claro_Email_Monitor" -ScriptRelativo "monitorar_email_claro.ps1" -Triggers $trig2 -Descricao "Monitoramento de e-mail da Claro via Outlook e atualizacao do BI de Cobranca"

# 4. JLE_Telecom_Manutencao_Update (Seg a Sex de hora em hora das 08h às 18h)
$trig4 = @()
8..18 | ForEach-Object {
    $hourStr = "{0:D2}:00" -f $_
    $trig4 += (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At $hourStr)
}
Criar-Tarefa -Nome "JLE_Telecom_Manutencao_Update" -ScriptRelativo "update_manutencao.ps1" -Triggers $trig4 -Descricao "Atualizacao de Manutencao Claro JLE Telecom (8h as 18h)"

# 5. JLE_Telecom_MDU_Update (Diário de hora em hora das 06h às 23h)
$trig5 = @()
6..23 | ForEach-Object {
    $hourStr = "{0:D2}:00" -f $_
    $trig5 += (New-ScheduledTaskTrigger -Daily -At $hourStr)
}
Criar-Tarefa -Nome "JLE_Telecom_MDU_Update" -ScriptRelativo "update_mdu.ps1" -Triggers $trig5 -Descricao "Atualizacao do BI MDU JLE Telecom"

# 6. JLE_Telecom_SAR_Claro_Sync (Seg a Sex às 08h45, 12h45 e 16h45)
$trig6 = @(
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At "08:45AM"),
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At "12:45PM"),
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At "04:45PM")
)
Criar-Tarefa -Nome "JLE_Telecom_SAR_Claro_Sync" -ScriptRelativo "sync_sar_claro.ps1" -Triggers $trig6 -Descricao "Cruzamento SAR x Analitico Claro JLE Telecom"

# 7. JLE_Telecom_SAR_Update (Seg a Sex de hora em hora das 06h às 23h)
$trig7 = @()
6..23 | ForEach-Object {
    $hourStr = "{0:D2}:00" -f $_
    $trig7 += (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At $hourStr)
}
Criar-Tarefa -Nome "JLE_Telecom_SAR_Update" -ScriptRelativo "update_sar.ps1" -Triggers $trig7 -Descricao "Atualizacao SAR Operacional JLE Telecom"

# 8. JLE_Telecom_Financiamentos_Update (Seg a Sex a cada 30 min das 08h às 18h)
$trig8 = @()
8..18 | ForEach-Object {
    $h = $_
    $trig8 += (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At ("{0:D2}:00" -f $h))
    if ($h -lt 18) {
        $trig8 += (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At ("{0:D2}:30" -f $h))
    }
}
Criar-Tarefa -Nome "JLE_Telecom_Financiamentos_Update" -ScriptRelativo "update_financiamentos.ps1" -Triggers $trig8 -Descricao "Atualizacao Financiamentos & PMTs JLE Telecom (8h as 18h a cada 30m)"

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Processo concluido! Verifique o Agendador de Tarefas." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
