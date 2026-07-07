# Script PowerShell para monitorar e-mail da Claro no Outlook e atualizar o BI
# Executa localmente usando o Outlook COM para a conta mauricio.maciel@jletelecom.com.br
# VERSÃO CORRIGIDA: Busca em TODAS as subpastas da Caixa de Entrada e aceita e-mails encaminhados

$i_caps_acute = [char]205
$folderName = "ANAL" + $i_caps_acute + "TICO CLARO"
$networkDir = "\\10.121.21.252\mauricio.maciel@jletelecom.com.br\$folderName"
$etlScript = "$PSScriptRoot\update_cobranca.ps1"

Write-Output "=========================================================="
Write-Output "JLE TELECOM - MONITOR E-MAIL CLARO E ATUALIZACAO AUTOMATICA"
Write-Output "=========================================================="
Write-Output "Iniciando verificacao no Outlook..."

# Função para buscar e-mails Claro recursivamente em todas as subpastas
function Find-ClaroEmail($folder, $mostRecent = $null, $depth = 0) {
    try {
        foreach ($item in $folder.Items) {
            try {
                if ($item.Class -eq 43) { # MailItem
                    $subj = $item.Subject
                    # Aceita tanto o assunto original quanto encaminhado (ENC:, FW:, Fwd:, etc.)
                    $isClaro = ($subj -like "*Analitico_Empreiteiras_WF1_WF2_JLE_TELECOMUNICACOES_*")
                    if ($isClaro -and $item.Attachments.Count -gt 0) {
                        $hasZip = $false
                        foreach ($att in $item.Attachments) {
                            if ($att.FileName -like "*.zip") { $hasZip = $true; break }
                        }
                        if ($hasZip) {
                            if ($null -eq $mostRecent -or $item.ReceivedTime -gt $mostRecent.ReceivedTime) {
                                $mostRecent = $item
                            }
                        }
                    }
                }
            } catch {}
        }
    } catch {}
    
    # Recursão em subpastas
    try {
        foreach ($sub in $folder.Folders) {
            $mostRecent = Find-ClaroEmail $sub $mostRecent ($depth + 1)
        }
    } catch {}
    
    return $mostRecent
}

try {
    # 1. Conectar ao Outlook COM
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    
    # 2. Busca recursiva em TODA a Caixa de Entrada e subpastas
    Write-Output "Buscando e-mail mais recente da Claro em todas as subpastas do Outlook..."
    $inbox = $namespace.GetDefaultFolder(6)
    $targetMail = Find-ClaroEmail $inbox

    if ($null -ne $targetMail) {
        Write-Output "E-mail mais recente encontrado!"
        Write-Output "  Assunto: $($targetMail.Subject)"
        Write-Output "  Remetente: $($targetMail.SenderName)"
        Write-Output "  Recebido em: $($targetMail.ReceivedTime.ToString('dd/MM/yyyy HH:mm:ss'))"
        
        # 3. Localizar anexo ZIP
        $zipAttachment = $targetMail.Attachments | Where-Object { $_.FileName -like "*.zip" } | Select-Object -First 1
        
        if ($null -ne $zipAttachment) {
            Write-Output "Anexo ZIP detectado: $($zipAttachment.FileName)"
            
            # Criar pasta temporária local para extração
            $tempDir = Join-Path $PSScriptRoot "temp_email_extract"
            if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
            New-Item -ItemType Directory -Path $tempDir | Out-Null
            
            # Salvar anexo ZIP localmente
            $zipPath = Join-Path $tempDir $zipAttachment.FileName
            $zipAttachment.SaveAsFile($zipPath)
            Write-Output "Anexo salvo temporariamente em: $zipPath"
            
            # Extrair o ZIP
            Write-Output "Descompactando arquivo ZIP..."
            Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force
            
            # Encontrar arquivo CSV ou Excel descompactado
            $extractedFile = Get-ChildItem -Path $tempDir | Where-Object { $_.Extension -eq ".csv" -or $_.Extension -eq ".xlsx" } | Select-Object -First 1
            
            if ($null -ne $extractedFile) {
                Write-Output "Arquivo extraido encontrado: $($extractedFile.Name) ($([math]::round($extractedFile.Length/1MB, 2)) MB)"
                
                # 4. Copiar para o diretório de rede (apenas se for um arquivo novo)
                if (Test-Path $networkDir) {
                    $destinationPath = Join-Path $networkDir $extractedFile.Name
                    
                    if (Test-Path $destinationPath) {
                        Write-Output "O arquivo '$($extractedFile.Name)' ja existe na rede local."
                        Write-Output "Este e-mail ja foi processado anteriormente. Pulando copia e ETL para evitar redundancia."
                    } else {
                        Write-Output "Copiando para a pasta de rede: $destinationPath ..."
                        Copy-Item -Path $extractedFile.FullName -Destination $destinationPath -Force
                        Write-Output "Copia concluida com sucesso na rede local!"
                        
                        # 5. Executar o ETL de atualizacao
                        if (Test-Path $etlScript) {
                            Write-Output "Disparando script ETL ($etlScript)..."
                            powershell.exe -ExecutionPolicy Bypass -File $etlScript
                            Write-Output "BI atualizado com sucesso!"
                        } else {
                            Write-Warning "Aviso: O script ETL '$etlScript' nao foi encontrado."
                        }
                    }
                } else {
                    Write-Error "Erro: O diretorio de rede '$networkDir' nao esta acessivel. Certifique-se de estar conectado a rede JLE Telecom."
                }
            } else {
                Write-Warning "Nenhum arquivo CSV ou Excel extraido de dentro do ZIP."
            }
            
            # Limpeza dos temporários
            Write-Output "Limpando diretorios temporarios..."
            Remove-Item $tempDir -Recurse -Force
        } else {
            Write-Warning "Nenhum anexo .zip encontrado no e-mail correspondente."
        }
    } else {
        Write-Output "Nenhum e-mail da Claro com anexo ZIP foi encontrado em nenhuma pasta do Outlook."
        Write-Output "O e-mail pode ainda nao ter chegado ou estar em outra conta de e-mail."
    }
    
} catch {
    Write-Error "Ocorreu um erro inesperado durante a execucao: $($_.Exception.Message)"
} finally {
    Write-Output "Monitoramento concluido!"
    Write-Output "=========================================================="
}
