# send_mdu_email.ps1
# Script de disparo automatico de e-mail de relatorio MDU via Microsoft Outlook COM
# Consulta as configuracoes na tabela bi_email_reports do Supabase e decide se deve enviar

$supabaseUrl = "https://fowlctvebdcodphntsjw.supabase.co"
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvd2xjdHZlYmRjb2RwaG50c2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzg2NjUsImV4cCI6MjA5NTY1NDY2NX0.PxzD_PlU4sBFPBukthuXpkBlzYbQqMLXLE4DQwctPOM"
$biUrl = "https://jle-bi.vercel.app"
$sheetsUrl = "https://docs.google.com/spreadsheets/d/1eEJLaV7D0rthjC5H1MppXyk7dyroqn2h/edit"
$mduDataJs = "$PSScriptRoot\mdu_data.js"
$headers = @{ "apikey"=$anonKey; "Authorization"="Bearer $anonKey"; "Content-Type"="application/json" }

Write-Output "=========================================================="
Write-Output "JLE TELECOM - AGENTE DE DISPARO DE E-MAILS DO BI"
Write-Output "Horario: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
Write-Output "=========================================================="

# --- FUNCOES AUXILIARES ---

function Get-DayCode {
    $dow = (Get-Date).DayOfWeek
    switch ($dow) {
        "Monday"    { return "MON" }
        "Tuesday"   { return "TUE" }
        "Wednesday" { return "WED" }
        "Thursday"  { return "THU" }
        "Friday"    { return "FRI" }
        "Saturday"  { return "SAT" }
        "Sunday"    { return "SUN" }
    }
}

function Get-MduStatusCounts {
    param ($jsPath)
    
    if (-not (Test-Path $jsPath)) {
        Write-Warning "Arquivo mdu_data.js nao encontrado em: $jsPath"
        return $null
    }
    
    $content = [System.IO.File]::ReadAllText($jsPath, [System.Text.Encoding]::UTF8)
    
    # Extrair generated_at dos metadados
    $generatedAt = "N/D"
    if ($content -match '"generated_at"\s*:\s*"([^"]+)"') {
        $generatedAt = $Matches[1]
    }
    
    # Estatuses a excluir (Finalizado/Finalizada)
    $excludeStatus = @("FINALIZADO", "FINALIZADA")
    
    # Contagem manual dos status via regex no JSON
    # Extrair todos os valores de "status" no JSON
    $statusPattern = '"status"\s*:\s*"([^"]*)"'
    $statusMatches = [regex]::Matches($content, $statusPattern)
    
    $counts = @{}
    $totalActive = 0
    
    foreach ($m in $statusMatches) {
        $statusVal = $m.Groups[1].Value.Trim().ToUpper()
        if ($excludeStatus -contains $statusVal) { continue }
        if ($statusVal -eq "") { $statusVal = "NAO DEFINIDO" }
        if (-not $counts.ContainsKey($statusVal)) { $counts[$statusVal] = 0 }
        $counts[$statusVal]++
        $totalActive++
    }
    
    return @{
        counts = $counts
        total = $totalActive
        generated_at = $generatedAt
    }
}

function Build-EmailHtml {
    param ($data, $reportName)
    
    $generatedAt = $data.generated_at
    $total = $data.total
    $now = Get-Date -Format "dd/MM/yyyy HH:mm"
    
    # Construir as linhas de status ordenadas por contagem decrescente
    $statusRows = ""
    $statusOrder = @(
        @{ key="1ª VISTORIA"; label="1ª Vistoria"; color="#70a1ff"; bg="rgba(112,161,255,0.1)" },
        @{ key="2ª VISTORIA"; label="2ª Vistoria"; color="#7bed9f"; bg="rgba(123,237,159,0.1)" },
        @{ key="PROJETO";     label="Projeto";     color="#ff6b81"; bg="rgba(255,107,129,0.1)" },
        @{ key="FUSÃO";       label="Fusão";       color="#1e90ff"; bg="rgba(30,144,255,0.1)"  },
        @{ key="MEDIÇÃO";     label="Medição";     color="#ffa502"; bg="rgba(255,165,2,0.1)"   },
        @{ key="RELATÓRIO";   label="Relatório";   color="#a4b0be"; bg="rgba(164,176,190,0.1)" },
        @{ key="BAIXA";       label="Baixa";       color="#2f3542"; bg="rgba(47,53,66,0.1)"    }
    )
    
    foreach ($s in $statusOrder) {
        $cnt = 0
        foreach ($k in $data.counts.Keys) {
            $kNorm = $k.ToUpper().Trim()
            $sNorm = $s.key.ToUpper().Trim()
            if ($kNorm -eq $sNorm -or $kNorm -match $sNorm) {
                $cnt = $data.counts[$k]
                break
            }
        }
        
        if ($cnt -gt 0) {
            $statusRows += @"
                    <tr>
                        <td style='padding: 10px 20px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #2c3e50;'>
                            <span style='display:inline-block; width:10px; height:10px; border-radius:50%; background:$($s.color); margin-right:8px;'></span>
                            $($s.label)
                        </td>
                        <td style='padding: 10px 20px; border-bottom: 1px solid #f0f0f0; text-align:center;'>
                            <span style='background:$($s.bg); color:$($s.color); padding:4px 14px; border-radius:20px; font-size:14px; font-weight:700;'>$cnt</span>
                        </td>
                    </tr>
"@
        }
    }
    
    # Adicionar outros status nao mapeados acima
    foreach ($k in ($data.counts.Keys | Sort-Object { -$data.counts[$_] })) {
        $kNorm = $k.ToUpper().Trim()
        $isKnown = $false
        foreach ($s in $statusOrder) {
            if ($kNorm -eq $s.key -or $kNorm -match $s.key) { $isKnown = $true; break }
        }
        if (-not $isKnown -and $data.counts[$k] -gt 0) {
            $cnt = $data.counts[$k]
            $statusRows += @"
                    <tr>
                        <td style='padding: 10px 20px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #2c3e50;'>
                            <span style='display:inline-block; width:10px; height:10px; border-radius:50%; background:#636e72; margin-right:8px;'></span>
                            $k
                        </td>
                        <td style='padding: 10px 20px; border-bottom: 1px solid #f0f0f0; text-align:center;'>
                            <span style='background:rgba(99,110,114,0.1); color:#636e72; padding:4px 14px; border-radius:20px; font-size:14px; font-weight:700;'>$cnt</span>
                        </td>
                    </tr>
"@
        }
    }
    
    $html = @"
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>$reportName - JLE Telecom BI</title>
</head>
<body style='margin:0; padding:0; background:#f4f6f9; font-family: Arial, Helvetica, sans-serif;'>

  <table width='100%' cellpadding='0' cellspacing='0' border='0' style='background:#f4f6f9;'>
    <tr><td align='center' style='padding: 30px 20px;'>

      <!-- Container Principal -->
      <table width='620' cellpadding='0' cellspacing='0' border='0' style='background:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);'>

        <!-- HEADER -->
        <tr>
          <td style='background: linear-gradient(135deg, #004f71 0%, #007baf 100%); padding: 36px 40px;'>
            <table width='100%' cellpadding='0' cellspacing='0'>
              <tr>
                <td>
                  <div style='font-size:11px; text-transform:uppercase; letter-spacing:2px; color:rgba(255,255,255,0.65); margin-bottom:6px;'>JLE Telecom — BI Automático</div>
                  <div style='font-size:26px; font-weight:700; color:#ffffff; line-height:1.2;'>$reportName</div>
                  <div style='font-size:13px; color:rgba(255,255,255,0.75); margin-top:8px;'>Gerado em $now • Dados de $generatedAt</div>
                </td>
                <td align='right' valign='middle'>
                  <div style='width:56px; height:56px; background:rgba(255,255,255,0.12); border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:28px; line-height:56px; text-align:center;'>📡</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- RESUMO TOTAL -->
        <tr>
          <td style='background:#004f71; padding: 0 40px 30px;'>
            <table width='100%' cellpadding='0' cellspacing='0'>
              <tr>
                <td style='background:rgba(255,255,255,0.1); border-radius:12px; padding: 20px 24px; text-align:center;'>
                  <div style='font-size:13px; color:rgba(255,255,255,0.7); margin-bottom:6px; text-transform:uppercase; letter-spacing:1px;'>Total de OS em Andamento</div>
                  <div style='font-size:48px; font-weight:800; color:#ffffff; line-height:1;'>$total</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- TABELA DE STATUS -->
        <tr>
          <td style='padding: 30px 40px 10px;'>
            <div style='font-size:12px; text-transform:uppercase; letter-spacing:1.5px; color:#636e72; font-weight:600; margin-bottom:16px;'>Distribuição por Status em Andamento</div>
            <table width='100%' cellpadding='0' cellspacing='0' style='border-radius:10px; overflow:hidden; border:1px solid #f0f0f0;'>
              <thead>
                <tr style='background:#f8f9fa;'>
                  <th style='padding:10px 20px; text-align:left; font-size:12px; color:#636e72; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;'>Status</th>
                  <th style='padding:10px 20px; text-align:center; font-size:12px; color:#636e72; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;'>Qtd.</th>
                </tr>
              </thead>
              <tbody>
$statusRows
              </tbody>
            </table>
          </td>
        </tr>

        <!-- BOTOES DE ACAO -->
        <tr>
          <td style='padding: 30px 40px;'>
            <table width='100%' cellpadding='0' cellspacing='0'>
              <tr>
                <td width='48%' align='center'>
                  <a href='$biUrl/#mdu' style='display:block; background:linear-gradient(135deg, #004f71, #007baf); color:#ffffff; text-decoration:none; padding:14px 20px; border-radius:10px; font-size:14px; font-weight:700; text-align:center;'>
                    📊 Acessar Painel BI
                  </a>
                </td>
                <td width='4%'></td>
                <td width='48%' align='center'>
                  <a href='$sheetsUrl' style='display:block; background:linear-gradient(135deg, #1a7a4a, #27ae60); color:#ffffff; text-decoration:none; padding:14px 20px; border-radius:10px; font-size:14px; font-weight:700; text-align:center;'>
                    📋 Abrir Planilha Base
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style='background:#f8f9fa; padding: 20px 40px; border-top:1px solid #f0f0f0;'>
            <p style='margin:0; font-size:12px; color:#a0aab4; text-align:center;'>
              Este é um relatório automático gerado pelo <strong>BI JLE Telecom</strong>.<br>
              Para gerenciar as configurações de envio, acesse o painel de administração.
            </p>
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

function Update-LastSent {
    param ($reportId)
    
    $patchUrl = "$supabaseUrl/rest/v1/bi_email_reports?id=eq.$reportId"
    $body = @{ last_sent_at = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"); updated_at = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ") } | ConvertTo-Json
    $patchHeaders = $headers.Clone()
    $patchHeaders["Prefer"] = "return=minimal"
    
    try {
        Invoke-WebRequest -Uri $patchUrl -Method PATCH -Headers $patchHeaders -Body $body -UseBasicParsing | Out-Null
        Write-Output "Timestamp last_sent_at atualizado para o relatorio $reportId"
    } catch {
        Write-Warning "Nao foi possivel atualizar last_sent_at: $($_.Exception.Message)"
    }
}

# --- EXECUCAO PRINCIPAL ---

# 1. Buscar configuracoes ativas no Supabase
Write-Output "Buscando configuracoes de e-mail ativas no Supabase..."
$configsUrl = "$supabaseUrl/rest/v1/bi_email_reports?is_active=eq.true&select=*"

try {
    $response = Invoke-WebRequest -Uri $configsUrl -Headers $headers -UseBasicParsing
    $configs = $response.Content | ConvertFrom-Json
    Write-Output "Encontradas $($configs.Count) configuracao(oes) ativa(s)."
} catch {
    Write-Error "Falha ao buscar configuracoes do Supabase: $($_.Exception.Message)"
    Exit 1
}

if ($configs.Count -eq 0) {
    Write-Output "Nenhuma configuracao de e-mail ativa encontrada. Nada a enviar."
    Exit 0
}

# 2. Verificar hora e dia atuais
$currentTime = Get-Date -Format "HH:mm"
$currentDay = Get-DayCode

Write-Output "Hora atual: $currentTime | Dia atual: $currentDay"

# 3. Para cada configuracao, verificar se deve enviar agora
$outlook = $null
$sentCount = 0

foreach ($config in $configs) {
    $configTime = $config.schedule_time.Substring(0, 5)  # "08:00"
    $configDays = $config.schedule_days
    
    Write-Output "---"
    Write-Output "Verificando relatorio: '$($config.report_name)' (Horario: $configTime, Dias: $($configDays -join ','))"
    
    # Verificar se e o momento de enviar (janela de tolerancia de 10 minutos apos horario configurado)
    $confHour = [int]$configTime.Split(":")[0]
    $confMin = [int]$configTime.Split(":")[1]
    $confTotalMin = $confHour * 60 + $confMin
    
    $nowHour = [int](Get-Date -Format "HH")
    $nowMin = [int](Get-Date -Format "mm")
    $nowTotalMin = $nowHour * 60 + $nowMin
    
    $diffMin = $nowTotalMin - $confTotalMin
    $isRightTime = ($diffMin -ge 0 -and $diffMin -le 14)  # Janela de 15 minutos
    $isRightDay = $configDays -contains $currentDay
    
    if (-not $isRightDay) {
        Write-Output "  PULANDO: Hoje ($currentDay) nao esta nos dias configurados ($($configDays -join ','))."
        continue
    }
    
    if (-not $isRightTime) {
        Write-Output "  PULANDO: Fora da janela de horario. Config: $configTime | Atual: $currentTime."
        continue
    }
    
    Write-Output "  DENTRO DA JANELA! Preparando envio..."
    
    # 4. Calcular dados MDU
    $mduData = Get-MduStatusCounts -jsPath $mduDataJs
    if ($null -eq $mduData) {
        Write-Warning "  Nao foi possivel ler os dados do MDU. Pulando este relatorio."
        continue
    }
    
    Write-Output "  Total de OS em andamento: $($mduData.total)"
    
    # 5. Gerar HTML do e-mail
    $emailHtml = Build-EmailHtml -data $mduData -reportName $config.report_name
    
    # 6. Inicializar Outlook COM (apenas uma vez)
    if ($null -eq $outlook) {
        Write-Output "  Iniciando Outlook COM..."
        try {
            $outlook = New-Object -ComObject Outlook.Application
        } catch {
            Write-Error "  Nao foi possivel abrir o Outlook: $($_.Exception.Message)"
            Exit 1
        }
    }
    
    # 7. Enviar e-mail para cada destinatario
    $recipients = $config.recipients
    Write-Output "  Enviando para $($recipients.Count) destinatario(s): $($recipients -join ', ')"
    
    try {
        $mail = $outlook.CreateItem(0)  # 0 = olMailItem
        $mail.Subject = "[BI JLE] $($config.report_name) - $(Get-Date -Format 'dd/MM/yyyy')"
        $mail.HTMLBody = $emailHtml
        
        foreach ($recipient in $recipients) {
            $mail.Recipients.Add($recipient.Trim()) | Out-Null
        }
        
        $mail.Send()
        Write-Output "  E-mail enviado com sucesso!"
        $sentCount++
        
        # 8. Atualizar last_sent_at no Supabase
        Update-LastSent -reportId $config.id
        
    } catch {
        Write-Warning "  Falha ao enviar e-mail: $($_.Exception.Message)"
    }
}

# 9. Liberacao do COM Object
if ($null -ne $outlook) {
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) | Out-Null
    $outlook = $null
}

Write-Output ""
Write-Output "=========================================================="
Write-Output "PROCESSO CONCLUIDO! Total de e-mails enviados: $sentCount"
Write-Output "=========================================================="
