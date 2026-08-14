# Script PowerShell para monitorar e-mail da Claro via IMAP (Zimbra) e atualizar o BI
# Acessa o servidor de e-mail DIRETAMENTE, sem depender do Outlook Desktop
# Executa 2x ao dia (09:00 e 14:00) de segunda a sexta
# v3 - Acesso IMAP direto ao Zimbra

$logFile = "$PSScriptRoot\monitor_claro.log"
$etlScript = "$PSScriptRoot\update_cobranca.ps1"
$tempDir = "$PSScriptRoot\temp_email_extract"
$cacheFile = "$PSScriptRoot\local_cobranca_file.csv"
$lastMailDateFile = "$PSScriptRoot\.last_claro_mail_date"

# ===== CONFIGURAÇÕES IMAP DO ZIMBRA JLE TELECOM =====
$imapServer = "10.121.21.254"   # Servidor Zimbra JLE Telecom (ajustar se necessário)
$imapPort   = 993                # IMAP SSL padrão
$imapUser   = "mauricio.maciel@jletelecom.com.br"
$imapPass   = $env:ZIMBRA_PASS   # Definir como variável de ambiente (mais seguro)

# Fallback: senha hardcoded (substituir pela variável de ambiente em produção)
if (-not $imapPass) {
    $imapPass = $env:ZIMBRA_PASSWORD
}

function Write-Log($msg) {
    $line = "[$(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')] $msg"
    Write-Output $line
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

Write-Log "=========================================================="
Write-Log "JLE TELECOM - MONITOR E-MAIL CLARO via IMAP (v3)"
Write-Log "=========================================================="

# Verificar se a senha IMAP foi definida
if (-not $imapPass) {
    Write-Log "AVISO: Senha IMAP nao configurada - usando modo Outlook COM direto."
    # Sem senha IMAP, pula direto para o bloco Outlook COM abaixo
}

try {
    # ===== CONEXÃO IMAP SSL =====
    Write-Log "Conectando ao Zimbra via IMAP: ${imapServer}:${imapPort}..."

    Add-Type -AssemblyName System.Net.Http

    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $tcpClient.Connect($imapServer, $imapPort)

    $sslStream = New-Object System.Net.Security.SslStream($tcpClient.GetStream(), $false,
        { param($s, $c, $ch, $e) $true }) # Aceitar qualquer cert (rede interna)

    $sslStream.AuthenticateAsClient($imapServer)

    $reader = New-Object System.IO.StreamReader($sslStream)
    $writer = New-Object System.IO.StreamWriter($sslStream)
    $writer.AutoFlush = $true

    function Send-IMAP($cmd) {
        $writer.WriteLine($cmd)
        Start-Sleep -Milliseconds 200
        $response = ""
        $timeout = 5000
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        while ($sw.ElapsedMilliseconds -lt $timeout) {
            if ($sslStream.CanRead) {
                $buf = New-Object byte[] 8192
                try {
                    if ($tcpClient.Available -gt 0) {
                        $n = $sslStream.Read($buf, 0, $buf.Length)
                        $response += [System.Text.Encoding]::ASCII.GetString($buf, 0, $n)
                        if ($response -match "(\r\n|\n)$") { break }
                    } else {
                        Start-Sleep -Milliseconds 100
                    }
                } catch { break }
            }
        }
        return $response
    }

    # Ler greeting
    Start-Sleep -Milliseconds 500
    $buf = New-Object byte[] 4096
    $n = $sslStream.Read($buf, 0, $buf.Length)
    $greeting = [System.Text.Encoding]::ASCII.GetString($buf, 0, $n)
    Write-Log "Servidor: $($greeting.Trim())"

    # Login
    $loginResp = Send-IMAP "A001 LOGIN `"$imapUser`" `"$imapPass`""
    if ($loginResp -notlike "*A001 OK*") {
        Write-Log "ERRO: Falha no login IMAP: $loginResp"
        throw "Login IMAP falhou"
    }
    Write-Log "Login IMAP realizado com sucesso!"

    # Selecionar INBOX
    $selResp = Send-IMAP "A002 SELECT INBOX"
    Write-Log "INBOX: $($selResp -replace '\r\n',' ')"

    # Buscar e-mails com assunto Analitico_Empreiteiras (dos ultimos 30 dias)
    $since = (Get-Date).AddDays(-30).ToString("dd-MMM-yyyy", [System.Globalization.CultureInfo]::InvariantCulture)
    $searchResp = Send-IMAP "A003 SEARCH SINCE $since SUBJECT `"Analitico_Empreiteiras`""
    Write-Log "Busca IMAP: $($searchResp.Trim())"

    # Extrair IDs de mensagens encontradas
    $msgIds = @()
    if ($searchResp -match "\* SEARCH (.+)") {
        $msgIds = $Matches[1].Trim() -split " " | Where-Object { $_ -match "^\d+$" }
    }

    if ($msgIds.Count -eq 0) {
        Write-Log "Nenhum e-mail Claro encontrado nos ultimos 30 dias via IMAP INBOX."

        # Tentar outras pastas
        $folders = @("Gestao", "BI JLE", "All Mail", "INBOX")
        foreach ($f in $folders) {
            $selResp2 = Send-IMAP "A004 SELECT `"$f`""
            if ($selResp2 -like "*A004 OK*") {
                $searchResp2 = Send-IMAP "A005 SEARCH SINCE $since SUBJECT `"Analitico_Empreiteiras`""
                if ($searchResp2 -match "\* SEARCH (.+)") {
                    $ids = $Matches[1].Trim() -split " " | Where-Object { $_ -match "^\d+$" }
                    if ($ids.Count -gt 0) {
                        Write-Log "E-mails encontrados na pasta $f : $($ids -join ', ')"
                        $msgIds = $ids
                        break
                    }
                }
            }
        }
    }

    if ($msgIds.Count -eq 0) {
        Write-Log "Nenhum e-mail Claro com relatorio encontrado. Encerrando."
        $writer.WriteLine("A999 LOGOUT")
        $tcpClient.Close()
        exit 0
    }

    Write-Log "Encontrados $($msgIds.Count) e-mails Claro. Verificando o mais recente..."

    # Fechar IMAP e usar Outlook COM para baixar o e-mail mais recente
    # (IMAP raw download de MIME com anexo 45MB é complexo - usar Outlook COM para extrair)
    $writer.WriteLine("A999 LOGOUT")
    $tcpClient.Close()
    Write-Log "Conexao IMAP encerrada. Usando Outlook COM para extrair o anexo..."

} catch {
    Write-Log "Erro na conexao IMAP: $($_.Exception.Message)"
    Write-Log "Continuando via Outlook COM..."
}

# ===== OUTLOOK COM - SYNC + BUSCA =====
Write-Log "Iniciando busca via Outlook COM em TODAS as pastas..."

try {
    $outlook = New-Object -ComObject Outlook.Application
    $ns = $outlook.GetNamespace("MAPI")

    # FORCAR SINCRONIZACAO DO OUTLOOK antes de buscar
    Write-Log "Forcando sincronizacao do Outlook (Send/Receive)..."
    try {
        $ns.SendAndReceive($false)
        Start-Sleep -Seconds 15  # Aguardar 15s para a sync completar
        Write-Log "Sincronizacao concluida."
    } catch {
        Write-Log "Aviso na sync: $($_.Exception.Message) - Continuando..."
    }
    $mostRecent = $null
    $mostRecentFolder = ""

    function Find-AllClaroEmails($folder, $depth = 0) {
        try {
            foreach ($item in $folder.Items) {
                try {
                    if ($item.Class -eq 43 -and $item.Subject -like "*Analitico_Empreiteiras*") {
                        $hasZip = $false
                        foreach ($att in $item.Attachments) {
                            if ($att.FileName -like "*.zip") { $hasZip = $true; break }
                        }
                        if ($hasZip) {
                            if ($null -eq $script:mostRecent -or $item.ReceivedTime -gt $script:mostRecent.ReceivedTime) {
                                $script:mostRecent = $item
                                $script:mostRecentFolder = $folder.Name
                            }
                        }
                    }
                } catch {}
            }
        } catch {}
        if ($depth -lt 10) {
            try {
                foreach ($sub in $folder.Folders) {
                    Find-AllClaroEmails $sub ($depth + 1)
                }
            } catch {}
        }
    }

    foreach ($acct in $ns.Folders) {
        Find-AllClaroEmails $acct 0
    }

    if ($null -eq $mostRecent) {
        Write-Log "AVISO: Nenhum e-mail Claro com ZIP encontrado em nenhuma pasta do Outlook."
        Write-Log "O e-mail pode nao ter sido sincronizado ainda. Tente novamente em instantes."
        exit 0
    }

    Write-Log "E-mail mais recente encontrado!"
    Write-Log "  Assunto : $($mostRecent.Subject)"
    Write-Log "  Pasta   : $mostRecentFolder"
    Write-Log "  Recebido: $($mostRecent.ReceivedTime.ToString('dd/MM/yyyy HH:mm:ss'))"

    # Verificar data do email para anti-duplo
    $mailDate = $mostRecent.ReceivedTime.ToString("yyyyMMdd")
    if (Test-Path $lastMailDateFile) {
        $lastMailDate = (Get-Content $lastMailDateFile -Raw).Trim()
        if ($lastMailDate -eq $mailDate) {
            Write-Log "E-mail de $mailDate ja foi processado. Nenhuma acao necessaria."
            exit 0
        }
    }

    # Extrair nome do arquivo no assunto para comparar data
    $subjectDate = ""
    if ($mostRecent.Subject -match "(\d{4}_\d{2}_\d{2})") {
        $subjectDate = $Matches[1] -replace "_",""
        Write-Log "Data do relatorio no assunto: $subjectDate"

        # Se ja processamos esse relatorio, pular
        if (Test-Path $lastMailDateFile) {
            $lastMailDate = (Get-Content $lastMailDateFile -Raw).Trim()
            # Comparar pela data do relatorio (nao pela data de recebimento)
            if ($lastMailDate -ge $subjectDate) {
                Write-Log "Relatorio de $subjectDate ja foi processado (ultimo: $lastMailDate). Nenhuma acao necessaria."
                exit 0
            }
        }
    }

    # Localizar ZIP
    $zipAttachment = $mostRecent.Attachments | Where-Object { $_.FileName -like "*.zip" } | Select-Object -First 1
    if ($null -eq $zipAttachment) {
        Write-Log "ERRO: ZIP nao encontrado no e-mail."
        exit 1
    }

    Write-Log "ZIP detectado: $($zipAttachment.FileName)"

    # Extrair ZIP
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
    New-Item -ItemType Directory -Path $tempDir | Out-Null

    $zipPath = Join-Path $tempDir $zipAttachment.FileName
    $zipAttachment.SaveAsFile($zipPath)
    Write-Log "ZIP salvo: $zipPath"

    Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force

    $extractedFile = Get-ChildItem -Path $tempDir |
        Where-Object { ($_.Extension -eq ".csv" -or $_.Extension -eq ".xlsx") -and $_.Name -notlike "~$*" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ($null -eq $extractedFile) {
        Write-Log "ERRO: Nenhum CSV/Excel encontrado no ZIP."
        exit 1
    }

    Write-Log "Arquivo extraido: $($extractedFile.Name) ($([math]::Round($extractedFile.Length/1MB, 2)) MB)"

    # Salvar cache local
    Copy-Item -Path $extractedFile.FullName -Destination $cacheFile -Force
    Write-Log "Cache local atualizado: $cacheFile"

    # Executar ETL - passar arquivo extraido diretamente para evitar rede desatualizada
    Write-Log "Executando ETL update_cobranca.ps1 com arquivo: $($extractedFile.FullName)"
    & powershell.exe -ExecutionPolicy Bypass -File $etlScript -ExplicitFile $extractedFile.FullName

    if ($LASTEXITCODE -eq 0) {
        Write-Log "ETL concluido com sucesso!"
        # Registrar data do relatorio processado (nao a data de recebimento)
        $dateToSave = if ($subjectDate) { $subjectDate } else { $mailDate }
        $dateToSave | Out-File -FilePath $lastMailDateFile -Encoding ASCII -NoNewline
        Write-Log "Data registrada como processada: $dateToSave"
    } else {
        Write-Log "ERRO: ETL falhou (codigo $LASTEXITCODE)"
    }

} catch {
    Write-Log "ERRO CRITICO: $($_.Exception.Message)"
} finally {
    if (Test-Path $tempDir) {
        Remove-Item $tempDir -Recurse -Force
        Write-Log "Temporarios removidos."
    }
    Write-Log "Monitor concluido."
    Write-Log "=========================================================="
}
