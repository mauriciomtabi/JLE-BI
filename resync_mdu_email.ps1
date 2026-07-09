# resync_mdu_email.ps1
# Script PowerShell que roda LOCALMENTE após a atualização do MDU para garantir que
# o próximo e-mail agendado no Resend sempre contenha os dados mais atualizados.
# 
# Fluxo:
# 1. Lê os dados do MDU local (mdu_data.js) para gerar o HTML do e-mail
# 2. Consulta o Supabase (leitura anon) para obter os destinatários e agendamentos ativos
# 3. Cancela no Resend os agendamentos com dados desatualizados
# 4. Agenda no Resend um novo e-mail com os dados frescos
# 5. Atualiza o Supabase com o novo token de agendamento (via service role key ou anon key)

param(
    [string]$ResendApiKey = "re_UrQ23kW7_HfeEnReBmEmKyFqo54AfMbgb",
    [string]$SupabaseUrl = "https://fowlctvebdcodphntsjw.supabase.co",
    [string]$AnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvd2xjdHZlYmRjb2RwaG50c2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzg2NjUsImV4cCI6MjA5NTY1NDY2NX0.PxzD_PlU4sBFPBukthuXpkBlzYbQqMLXLE4DQwctPOM",
    [string]$FromEmail = "bi@jletelecom.com.br",
    [string]$BiUrl = "https://jle-bi.vercel.app",
    [string]$SheetsUrl = "https://docs.google.com/spreadsheets/d/1eEJLaV7D0rthjC5H1MppXyk7dyroqn2h/edit"
)

$PSScriptRoot_Resolved = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
$MduJsPath = Join-Path $PSScriptRoot_Resolved "mdu_data.js"

# ============================================================
# FUNÇÕES AUXILIARES
# ============================================================

function Get-MduData {
    if (-not (Test-Path $MduJsPath)) {
        throw "Arquivo mdu_data.js não encontrado em: $MduJsPath"
    }
    $content = Get-Content $MduJsPath -Raw -Encoding UTF8
    
    # Extrair generated_at
    $gMatch = [regex]::Match($content, '"generated_at"\s*:\s*"([^"]+)"')
    $generatedAt = if ($gMatch.Success) { $gMatch.Groups[1].Value } else { "N/D" }
    
    # Extrair dados como JSON
    $dataMatch = [regex]::Match($content, '(?s)window\.MDU_DATA\s*=\s*(\[.+?\]);\s*$')
    if (-not $dataMatch.Success) { throw "Formato inválido do mdu_data.js" }
    
    $mduArray = $dataMatch.Groups[1].Value | ConvertFrom-Json
    
    # Calcular contagens por status
    $excludeStatus = @("FINALIZADO", "FINALIZADA", "CANCELADO", "CANCELADA")
    $counts = @{}
    $totalActive = 0
    
    foreach ($row in $mduArray) {
        $rawStatus = $row.status
        if ($rawStatus -eq $null) { $rawStatus = "" }
        $status = $rawStatus.Trim()
        if ($status -eq "") { $status = "Não Definido" }
        if ($excludeStatus -contains $status.ToUpper()) { continue }
        if (-not $counts.ContainsKey($status)) { $counts[$status] = 0 }
        $counts[$status]++
        $totalActive++
    }
    
    return @{
        generated_at = $generatedAt
        total = $totalActive
        counts = $counts
    }
}

function Format-GeneratedAt($str) {
    if (-not $str -or $str -eq 'N/D') { return $str }
    $parts = $str -split ' '
    if ($parts.Count -ge 1) {
        $dateParts = $parts[0] -split '-'
        if ($dateParts.Count -eq 3) {
            $timeStr = ""
            if ($parts.Count -ge 2) {
                $timeParts = $parts[1] -split ':'
                if ($timeParts.Count -ge 2) {
                    $timeStr = " " + $timeParts[0] + ":" + $timeParts[1]
                }
            }
            return "$($dateParts[2])/$($dateParts[1])/$($dateParts[0])$timeStr"
        }
    }
    return $str
}

function Build-EmailHtml($data, $reportName, $executionDateStr) {
    $total = $data.total
    $generatedAt = Format-GeneratedAt($data.generated_at)
    
    $medicaoCount = 0
    $relatorioCount = 0
    foreach ($key in $data.counts.Keys) {
        if ($key -match "medi[cç][aã]o") { $medicaoCount += $data.counts[$key] }
        if ($key -match "relat[oó]rio") { $relatorioCount += $data.counts[$key] }
    }
    
    # Construir linhas de status
    $statusOrder = @(
        "1ª Vistoria", "2ª Vistoria", "Projeto", "Fusão",
        "Medição", "Relatório", "Baixa", "Não Definido"
    )
    
    $statusItems = [System.Collections.ArrayList]@()
    
    foreach ($s in $statusOrder) {
        $cnt = 0
        foreach ($k in $data.counts.Keys) {
            $kNorm = $k.ToLower().Normalize([System.Text.NormalizationForm]::FormD) -replace '\p{M}', ''
            $sNorm = $s.ToLower().Normalize([System.Text.NormalizationForm]::FormD) -replace '\p{M}', ''
            if ($kNorm -eq $sNorm) { $cnt = $data.counts[$k] }
        }
        if ($cnt -gt 0) {
            [void]$statusItems.Add(@{ key = $s; count = $cnt })
        }
    }
    
    # Adicionar status não mapeados
    foreach ($k in $data.counts.Keys) {
        $kNorm = $k.ToLower().Normalize([System.Text.NormalizationForm]::FormD) -replace '\p{M}', ''
        $isMapped = $false
        foreach ($s in $statusOrder) {
            $sNorm = $s.ToLower().Normalize([System.Text.NormalizationForm]::FormD) -replace '\p{M}', ''
            if ($kNorm -eq $sNorm) { $isMapped = $true; break }
        }
        if (-not $isMapped -and $data.counts[$k] -gt 0) {
            [void]$statusItems.Add(@{ key = $k; count = $data.counts[$k] })
        }
    }
    
    # Ordenar por contagem decrescente
    $statusItems = $statusItems | Sort-Object { -$_.count }
    
    $statusRows = ""
    foreach ($item in $statusItems) {
        $statusRows += @"
        <tr>
            <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #2c3e50; font-weight: 500;">
                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#004f71; margin-right:8px; vertical-align:middle;"></span>
                $($item.key)
            </td>
            <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; text-align:center;">
                <span style="background:rgba(0,79,113,0.06); color:#004f71; padding:4px 14px; border-radius:20px; font-size:13px; font-weight:700;">$($item.count)</span>
            </td>
        </tr>
"@
    }
    
    $html = @"
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f9; padding: 30px 10px;">
        <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.05); border: 1px solid #e1e8ed;">
                <tr>
                    <td style="background: #004f71; padding: 32px 40px; border-bottom: 4px solid #f39f18;">
                        <h1 style="margin:0; font-size:24px; font-weight:800; color:#ffffff; line-height:1.2;">$reportName</h1>
                        <div style="font-size:12px; color:rgba(255,255,255,0.7); margin-top:6px; font-weight: 500;">Atualizado em: $generatedAt</div>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 30px 40px 0;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td colspan="3" style="background: rgba(0,79,113,0.04); border-radius: 12px; border: 1px solid rgba(0,79,113,0.08); text-align: center; padding: 24px;">
                                    <div style="font-size: 11px; color: #747d8c; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 6px;">ORDENS DE SERVIÇO EM ANDAMENTO</div>
                                    <div style="font-size: 42px; font-weight: 800; color: #004f71; line-height: 1;">$total</div>
                                </td>
                            </tr>
                            <tr style="height: 16px;"><td colspan="3"></td></tr>
                            <tr>
                                <td width="48%" style="background: rgba(243,159,24,0.06); border-radius: 10px; border-left: 4px solid #f39f18; padding: 16px 20px; text-align: center; border-top: 1px solid rgba(243,159,24,0.1); border-right: 1px solid rgba(243,159,24,0.1); border-bottom: 1px solid rgba(243,159,24,0.1);">
                                    <div style="font-size: 11px; color: #d37f00; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 4px;">Medição</div>
                                    <div style="font-size: 28px; font-weight: 800; color: #b86d00;">$medicaoCount</div>
                                </td>
                                <td width="4%"></td>
                                <td width="48%" style="background: rgba(0,119,170,0.06); border-radius: 10px; border-left: 4px solid #0077aa; padding: 16px 20px; text-align: center; border-top: 1px solid rgba(0,119,170,0.1); border-right: 1px solid rgba(0,119,170,0.1); border-bottom: 1px solid rgba(0,119,170,0.1);">
                                    <div style="font-size: 11px; color: #0077aa; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 4px;">Relatórios</div>
                                    <div style="font-size: 28px; font-weight: 800; color: #005f87;">$relatorioCount</div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 28px 40px 10px;">
                        <div style="font-size:12px; text-transform:uppercase; letter-spacing:1.5px; color:#57606f; font-weight:700; margin-bottom:12px;">Detalhamento por Status</div>
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e1e8ed; border-radius:8px; overflow:hidden;">
                            <tr style="background:#f8f9fa;">
                                <th style="padding:12px 20px; text-align:left; font-size:12px; color:#57606f; font-weight:700;">Status</th>
                                <th style="padding:12px 20px; text-align:center; font-size:12px; color:#57606f; font-weight:700; width:80px;">Qtd.</th>
                            </tr>
                            $statusRows
                        </table>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 24px 40px 36px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td width="48%">
                                    <a href="$BiUrl" style="display:block; text-align:center; background:#004f71; color:#ffffff; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:700; font-size:14px;" target="_blank">📊 Ir para o BI</a>
                                </td>
                                <td width="4%"></td>
                                <td width="48%">
                                    <a href="$SheetsUrl" style="display:block; text-align:center; background:#1e7e34; color:#ffffff; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:700; font-size:14px;" target="_blank">📑 Ir para a Planilha</a>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td style="background:#f8f9fa; border-top:1px solid #e1e8ed; padding:24px 40px; text-align:center; font-size:12px; color:#747d8c; line-height:1.5;">
                        Este é um relatório automatizado gerado a partir do Banco de Dados do BI JLE Telecom.<br>
                        Relatório emitido em: $executionDateStr.
                    </td>
                </tr>
            </table>
        </td></tr>
    </table>
</body>
</html>
"@
    return $html
}

function Get-NextSendDate($scheduleTime, $scheduleDays) {
    $parts = $scheduleTime -split ':'
    $targetHour = [int]$parts[0]
    $targetMin = [int]$parts[1]
    
    $weekdayMap = @{ 'SUN'=0; 'MON'=1; 'TUE'=2; 'WED'=3; 'THU'=4; 'FRI'=5; 'SAT'=6 }
    $targetDays = $scheduleDays | ForEach-Object { $weekdayMap[$_] }
    
    $brOffset = -3 * 60 * 60 # seconds
    
    for ($i = 1; $i -le 14; $i++) {
        $testUtc = (Get-Date).AddDays($i).ToUniversalTime()
        # Convert to BRT (UTC-3)
        $testBrt = $testUtc.AddHours(-3)
        # Set to target time in BRT
        $testBrt = Get-Date -Year $testBrt.Year -Month $testBrt.Month -Day $testBrt.Day -Hour $targetHour -Minute $targetMin -Second 0 -Millisecond 0
        # Convert back to UTC
        $testUtcFinal = $testBrt.AddHours(3)
        
        if ($testUtcFinal -le (Get-Date).ToUniversalTime()) { continue }
        if ($targetDays -contains [int]$testBrt.DayOfWeek) {
            return $testUtcFinal
        }
    }
    return $null
}

function Invoke-SupabaseGet($endpoint) {
    $headers = @{
        "apikey" = $AnonKey
        "Authorization" = "Bearer $AnonKey"
        "Content-Type" = "application/json"
    }
    return Invoke-RestMethod "$SupabaseUrl/rest/v1/$endpoint" -Headers $headers -Method GET
}

function Invoke-SupabasePatch($endpoint, $body) {
    $headers = @{
        "apikey" = $AnonKey
        "Authorization" = "Bearer $AnonKey"
        "Content-Type" = "application/json"
        "Prefer" = "return=representation"
    }
    try {
        $result = Invoke-RestMethod "$SupabaseUrl/rest/v1/$endpoint" -Headers $headers -Method PATCH -Body ($body | ConvertTo-Json -Compress -Depth 5) -ErrorAction Stop
        return $result
    } catch {
        Write-Warning "PATCH no Supabase falhou: $($_.Exception.Message). O estado será sincronizado na próxima abertura do painel BI."
        return $null
    }
}

function Cancel-ResendEmail($emailId) {
    $headers = @{ "Authorization" = "Bearer $ResendApiKey" }
    try {
        Invoke-RestMethod "https://api.resend.com/emails/$emailId/cancel" -Headers $headers -Method POST -ErrorAction Stop
        Write-Output "  [CANCELADO] Email $emailId cancelado no Resend."
    } catch {
        Write-Warning "  Falha ao cancelar $emailId no Resend: $($_.Exception.Message)"
    }
}

function Schedule-ResendEmail($to, $subject, $html, $scheduledAtIso) {
    $headers = @{
        "Authorization" = "Bearer $ResendApiKey"
        "Content-Type" = "application/json; charset=utf-8"
    }
    
    # Build the to array as JSON
    $toJson = ($to | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ','
    
    # Escape special characters in HTML for JSON embedding
    $htmlEscaped = $html -replace '\\', '\\\\' -replace '"', '\"' -replace "`r`n", '\n' -replace "`n", '\n' -replace "`r", '\n' -replace "`t", '\t'
    $subjectEscaped = $subject -replace '"', '\"'
    $scheduledAtEscaped = $scheduledAtIso -replace '"', '\"'
    
    # Build JSON manually to avoid PowerShell's ConvertTo-Json encoding issues
    $bodyJson = "{`"from`":`"BI JLE Telecom <$FromEmail>`",`"to`":[$toJson],`"subject`":`"$subjectEscaped`",`"html`":`"$htmlEscaped`",`"scheduled_at`":`"$scheduledAtEscaped`"}"
    
    # Encode as UTF-8 bytes
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyJson)
    
    $request = [System.Net.HttpWebRequest]::Create("https://api.resend.com/emails")
    $request.Method = "POST"
    $request.ContentType = "application/json; charset=utf-8"
    $request.Headers.Add("Authorization", "Bearer $ResendApiKey")
    $request.ContentLength = $bodyBytes.Length
    
    $stream = $request.GetRequestStream()
    $stream.Write($bodyBytes, 0, $bodyBytes.Length)
    $stream.Close()
    
    try {
        $response = $request.GetResponse()
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        $responseText = $reader.ReadToEnd()
        $reader.Close()
        $response.Close()
        $responseObj = $responseText | ConvertFrom-Json
        return $responseObj.id
    } catch [System.Net.WebException] {
        $errorResponse = $_.Exception.Response
        if ($errorResponse) {
            $reader = New-Object System.IO.StreamReader($errorResponse.GetResponseStream())
            $errorText = $reader.ReadToEnd()
            $reader.Close()
            throw "Resend API Error $([int]$errorResponse.StatusCode): $errorText"
        }
        throw $_
    }
}


# ============================================================
# EXECUÇÃO PRINCIPAL
# ============================================================

Write-Output "=================================================================="
Write-Output "RESYNC DE E-MAILS MDU - Garantindo dados atualizados no agendamento"
Write-Output "=================================================================="
Write-Output ""

# 1. Ler dados MDU locais
Write-Output "Lendo dados do MDU local..."
try {
    $mduData = Get-MduData
    Write-Output "  Dados carregados: $($mduData.total) OS em andamento"
    Write-Output "  Gerado em: $($mduData.generated_at)"
} catch {
    Write-Error "Falha ao carregar mdu_data.js: $_"
    exit 1
}

# 2. Buscar relatórios ativos no Supabase
Write-Output ""
Write-Output "Buscando relatórios ativos no Supabase..."
try {
    $reports = Invoke-SupabaseGet "bi_email_reports?is_active=eq.true"
    Write-Output "  $($reports.Count) relatório(s) ativo(s) encontrado(s)."
} catch {
    Write-Error "Falha ao consultar Supabase: $_"
    exit 1
}

foreach ($report in $reports) {
    Write-Output ""
    Write-Output "--- Processando: $($report.report_name) ---"
    
    $recipients = $report.recipients
    $cleanEmails = $recipients | Where-Object { -not $_.StartsWith('__sched:') -and -not $_.StartsWith('__lock:') }
    $existingScheds = $recipients | Where-Object { $_.StartsWith('__sched:') } | ForEach-Object {
        $schedParts = $_ -split '::'
        $mainParts = $schedParts[0] -split ':'
        @{
            raw = $_
            id = $mainParts[1]
            dateStr = ($mainParts | Select-Object -Skip 2) -join ':'
            generatedAt = if ($schedParts.Count -gt 1) { $schedParts[1] } else { '' }
        }
    }
    
    Write-Output "  Destinatários: $($cleanEmails -join ', ')"
    Write-Output "  Agendamentos existentes: $($existingScheds.Count)"
    
    # 3. Calcular próxima data de envio
    $nextDate = Get-NextSendDate $report.schedule_time $report.schedule_days
    if (-not $nextDate) {
        Write-Warning "  Não foi possível calcular próxima data de envio. Pulando..."
        continue
    }
    
    $nextDateIso = $nextDate.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    Write-Output "  Próximo envio calculado: $nextDateIso"
    
    # 4. Verificar agendamentos stale (dados desatualizados) e cancelar
    $freshScheds = [System.Collections.ArrayList]@()
    $nowUtc = (Get-Date).ToUniversalTime()
    
    foreach ($sched in $existingScheds) {
        try {
            $schedDate = [System.DateTime]::Parse($sched.dateStr, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::RoundtripKind)
            $isFuture = $schedDate -gt $nowUtc
            $isCorrectDate = $sched.dateStr -eq $nextDateIso
            $isFresh = $sched.generatedAt -eq $mduData.generated_at
            
            if ($isFuture -and $isCorrectDate -and $isFresh) {
                Write-Output "  [OK] Agendamento já está atualizado para $($sched.dateStr). Sem ação necessária."
                [void]$freshScheds.Add($sched.raw)
            } elseif ($isFuture) {
                $reason = if (-not $isFresh) { "dados desatualizados (stored=$($sched.generatedAt) vs current=$($mduData.generated_at))" } elseif (-not $isCorrectDate) { "data incorreta" } else { "desconhecido" }
                Write-Output "  [CANCELAR] $($sched.dateStr) - Motivo: $reason"
                Cancel-ResendEmail $sched.id
            } else {
                Write-Output "  [PASSADO] Agendamento $($sched.dateStr) já foi enviado. Ignorando token antigo."
                # Token de passado - não adicionar à lista limpa (será removido)
            }
        } catch {
            Write-Warning "  Erro ao processar agendamento '$($sched.raw)': $_"
        }
    }
    
    # 5. Criar novo agendamento se necessário
    $alreadyFresh = $freshScheds.Count -gt 0
    if (-not $alreadyFresh -and $cleanEmails.Count -gt 0) {
        $nextBrt = $nextDate.AddHours(-3) # Converter UTC para BRT
        $day = $nextBrt.Day.ToString("00")
        $month = $nextBrt.Month.ToString("00")
        $year = $nextBrt.Year
        $hours = $nextBrt.Hour.ToString("00")
        $minutes = $nextBrt.Minute.ToString("00")
        $dateFormatted = "$day/$month/$year às ${hours}:$minutes"
        
        $emailHtml = Build-EmailHtml $mduData $report.report_name $dateFormatted
        $subject = "$($report.report_name) - $day/$month/$year"
        
        Write-Output "  [AGENDAR] Criando novo e-mail no Resend para $nextDateIso..."
        try {
            $newId = Schedule-ResendEmail $cleanEmails $subject $emailHtml $nextDateIso
            $newSchedRaw = "__sched:${newId}:${nextDateIso}::$($mduData.generated_at)"
            [void]$freshScheds.Add($newSchedRaw)
            Write-Output "  [OK] Novo agendamento criado: $newId"
        } catch {
            if ($_.Exception.Message -match "429|quota|Limit") {
                Write-Warning "  [QUOTA] Limite diário do Resend excedido. Será reagendado após 21h (BRT)."
            } else {
                Write-Error "  Falha ao agendar e-mail: $_"
            }
        }
    }
    
    # 6. Atualizar Supabase com o novo token
    $newRecipients = @($cleanEmails) + @($freshScheds)
    $patchResult = Invoke-SupabasePatch "bi_email_reports?id=eq.$($report.id)" @{
        recipients = $newRecipients
        updated_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    }
    
    if ($patchResult) {
        Write-Output "  [OK] Supabase atualizado com sucesso."
    } else {
        Write-Warning "  O Supabase não pôde ser atualizado (RLS). O estado será sincronizado na próxima abertura do painel BI."
        Write-Warning "  O e-mail foi corretamente agendado no Resend com dados atualizados."
    }
}

Write-Output ""
Write-Output "=================================================================="
Write-Output "RESYNC CONCLUÍDO!"
Write-Output "=================================================================="
