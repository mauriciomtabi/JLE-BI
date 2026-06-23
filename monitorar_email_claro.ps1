# Script PowerShell para monitorar e-mail da Claro no Outlook e atualizar o BI
# Executa localmente usando o Outlook COM para a conta mauricio.maciel@jletelecom.com.br

$i_caps_acute = [char]205
$folderName = "ANAL" + $i_caps_acute + "TICO CLARO"
$networkDir = "\\10.121.21.252\mauricio.maciel@jletelecom.com.br\$folderName"
$etlScript = "$PSScriptRoot\update_cobranca.ps1"

Write-Output "=========================================================="
Write-Output "JLE TELECOM - MONITOR E-MAIL CLARO E ATUALIZAÇÃO AUTOMÁTICA"
Write-Output "=========================================================="
Write-Output "Iniciando verificação no Outlook..."

try {
    # 1. Conectar ao Outlook COM
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    
    # Obter a Caixa de Entrada padrão (Folder 6)
    $inbox = $namespace.GetDefaultFolder(6) 
    
    # 2. Filtrar e-mails recentes (últimos 7 dias)
    $sevenDaysAgo = (Get-Date).AddDays(-7).ToString("dd/MM/yyyy HH:mm")
    # Filtro DASL para e-mails recebidos nos últimos 7 dias
    $filter = "[ReceivedTime] >= '$sevenDaysAgo'"
    $items = $inbox.Items.Restrict($filter)
    
    # Filtrar por assunto e remetente (pode ser o e-mail do Eduardo Costa ou Suporte Claro)
    $targetMail = $items | Where-Object {
        ($_.Subject -like "*Analitico_Empreiteiras_WF1_WF2_JLE_TELECOMUNICACOES_*") -and 
        ($_.Attachments.Count -gt 0)
    } | Sort-Object ReceivedTime -Descending | Select-Object -First 1

    if ($null -eq $targetMail) {
        # Tentar buscar em pastas filhas da Caixa de Entrada (como a pasta 'BI JLE')
        $biFolder = $inbox.Folders | Where-Object { $_.Name -eq "BI JLE" }
        if ($null -ne $biFolder) {
            $items = $biFolder.Items.Restrict($filter)
            $targetMail = $items | Where-Object {
                ($_.Subject -like "*Analitico_Empreiteiras_WF1_WF2_JLE_TELECOMUNICACOES_*") -and 
                ($_.Attachments.Count -gt 0)
            } | Sort-Object ReceivedTime -Descending | Select-Object -First 1
        }
    }

    if ($null -ne $targetMail) {
        Write-Output "E-mail encontrado! Assunto: $($targetMail.Subject)"
        Write-Output "Recebido em: $($targetMail.ReceivedTime.ToString('dd/MM/yyyy HH:mm:ss'))"
        
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
            Write-Output "Anexo saved temporariamente em: $zipPath"
            
            # Extrair o ZIP
            Write-Output "Descompactando arquivo ZIP..."
            Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force
            
            # Encontrar arquivo CSV ou Excel descompactado
            $extractedFile = Get-ChildItem -Path $tempDir | Where-Object { $_.Extension -eq ".csv" -or $_.Extension -eq ".xlsx" } | Select-Object -First 1
            
            if ($null -ne $extractedFile) {
                Write-Output "Arquivo extraído encontrado: $($extractedFile.Name) ($([math]::round($extractedFile.Length/1MB, 2)) MB)"
                
                # 4. Copiar para o diretório de rede (apenas se for um arquivo novo)
                if (Test-Path $networkDir) {
                    $destinationPath = Join-Path $networkDir $extractedFile.Name
                    
                    if (Test-Path $destinationPath) {
                        Write-Output "O arquivo '$($extractedFile.Name)' ja existe na rede local."
                        Write-Output "Este e-mail ja foi processado anteriormente. Pulando copia e processamento ETL para evitar redundancia."
                    } else {
                        Write-Output "Copiando para a pasta de rede: $destinationPath ..."
                        Copy-Item -Path $extractedFile.FullName -Destination $destinationPath -Force
                        Write-Output "Cópia concluída com sucesso na rede local!"
                        
                        # 5. Executar o ETL de atualização
                        if (Test-Path $etlScript) {
                            Write-Output "Disparando script ETL ($etlScript)..."
                            powershell.exe -ExecutionPolicy Bypass -File $etlScript
                            Write-Output "BI atualizado com sucesso!"
                        } else {
                            Write-Warning "Aviso: O script ETL '$etlScript' não foi encontrado."
                        }
                    }
                } else {
                    Write-Error "Erro: O diretório de rede '$networkDir' não está acessível. Certifique-se de estar conectado à rede JLE Telecom."
                }
            } else {
                Write-Warning "Nenhum arquivo CSV ou Excel extraído de dentro do ZIP."
            }
            
            # Limpeza dos temporários
            Write-Output "Limpando diretórios temporários..."
            Remove-Item $tempDir -Recurse -Force
        } else {
            Write-Warning "Nenhum anexo .zip encontrado no e-mail correspondente."
        }
    } else {
        Write-Output "Nenhum e-mail de faturamento Claro recebido nos últimos 7 dias foi detectado."
    }
    
} catch {
    Write-Error "Ocorreu um erro inesperado durante a execução: $($_.Exception.Message)"
} finally {
    Write-Output "Monitoramento concluído!"
    Write-Output "=========================================================="
}
