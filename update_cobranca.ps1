# Script ETL para extrair dados da planilha de Cobrança e gerar cobranca_data.js
# Lê os dados da aba 'Analitico_Empreiteiras_WF1_WF2_' de 'Analítico Claro - Base Geral.xlsx'
# Aceita parametro -ExplicitFile para usar um arquivo especifico (passado pelo monitor)

param(
    [string]$ExplicitFile = ""
)

$i_caps_acute = [char]205
$folderName = "ANAL" + $i_caps_acute + "TICO CLARO"
$networkDir = "\\10.121.21.252\mauricio.maciel@jletelecom.com.br\$folderName"
$outputPath = "$PSScriptRoot\cobranca_data.js"
$useFile = $null

# Se um arquivo foi passado explicitamente pelo monitor, usa-lo diretamente (prioridade maxima)
if ($ExplicitFile -and (Test-Path $ExplicitFile)) {
    Write-Output "Usando arquivo fornecido pelo monitor: $ExplicitFile"
    $ext = [System.IO.Path]::GetExtension($ExplicitFile)
    $localTempPath = "$PSScriptRoot\temp_cobranca_read$ext"
    Copy-Item -Path $ExplicitFile -Destination $localTempPath -Force
    Copy-Item -Path $ExplicitFile -Destination "$PSScriptRoot\local_cobranca_file$ext" -Force
    $useFile = $localTempPath
    Write-Output "Arquivo do monitor copiado com sucesso."
}

# Buscar na rede APENAS se nao recebemos um arquivo explicito do monitor
if ($null -eq $useFile -and (Test-Path $networkDir)) {
    try {
        $networkFile = Get-ChildItem -Path $networkDir -Filter "*Anal*tico*" | Where-Object { $_.Name -notlike "~$*" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        $fallbackFile = Get-ChildItem -Path $PSScriptRoot -Filter "local_cobranca_file.*" | Select-Object -First 1
        
        $useNetwork = $true
        if ($null -ne $networkFile -and $null -ne $fallbackFile) {
            # Comparar datas dos arquivos no nome ou ultima modificacao
            $netDate = if ($networkFile.Name -match "(\d{4}_\d{2}_\d{2})") { $Matches[1] -replace "_","" } else { $networkFile.LastWriteTime.ToString("yyyyMMdd") }
            $localDate = if ($fallbackFile.Name -match "(\d{4}_\d{2}_\d{2})") { $Matches[1] -replace "_","" } else { $fallbackFile.LastWriteTime.ToString("yyyyMMdd") }
            
            # Tambem checar .last_claro_mail_date se existir
            $mailDateFile = "$PSScriptRoot\.last_claro_mail_date"
            if (Test-Path $mailDateFile) {
                $savedMailDate = (Get-Content $mailDateFile -Raw).Trim()
                if ($savedMailDate -gt $localDate) { $localDate = $savedMailDate }
            }

            if ($localDate -gt $netDate) {
                Write-Output "Arquivo de rede ($netDate) e MAIS ANTIGO que o cache local/email ($localDate). Mantendo arquivo local mais recente!"
                $useNetwork = $false
                $useFile = $fallbackFile.FullName
            }
        }

        if ($useNetwork -and $null -ne $networkFile) {
            $ext = $networkFile.Extension
            $localTempPath = "$PSScriptRoot\temp_cobranca_read$ext"
            $fallbackPath = "$PSScriptRoot\local_cobranca_file$ext"
            $networkPath = $networkFile.FullName
            Write-Output "Arquivo de rede encontrado: $networkPath"
            Write-Output "Copiando planilha da rede localmente..."
            Copy-Item -Path $networkPath -Destination $localTempPath -Force
            Copy-Item -Path $networkPath -Destination $fallbackPath -Force
            $useFile = $localTempPath
            Write-Output "Cópia realizada e cache local atualizado com sucesso."
        }
    } catch {
        Write-Warning "Falha ao copiar da rede: $($_.Exception.Message)"
    }
} elseif ($null -eq $useFile) {
    Write-Warning "Diretório de rede inacessível: $networkDir"
} else {
    Write-Output "Arquivo explicito definido - ignorando verificacao de rede."
}


if ($null -eq $useFile) {
    # Tenta obter do diretório Downloads do usuário atual como segunda opção
    $userProfile = $env:USERPROFILE
    $downloadDir = "$userProfile\Downloads"
    if (Test-Path $downloadDir) {
        $downloadFile = Get-ChildItem -Path $downloadDir -Filter "*Anal*tico*" | Where-Object { $_.Name -notlike "~$*" } | Select-Object -First 1
        if ($null -ne $downloadFile) {
            Write-Output "Arquivo encontrado em Downloads: $($downloadFile.FullName)"
            $useFile = $downloadFile.FullName
        }
    }
}

if ($null -eq $useFile) {
    # Procura por qualquer arquivo de cache local
    $fallbackFile = Get-ChildItem -Path $PSScriptRoot -Filter "local_cobranca_file.*" | Select-Object -First 1
    if ($null -ne $fallbackFile) {
        Write-Output "Usando planilha em cache local como fallback: $($fallbackFile.FullName)"
        $useFile = $fallbackFile.FullName
    } else {
        Write-Error "Arquivo de dados não encontrado! Certifique-se de estar conectado à rede ou de ter o arquivo em downloads/cache."
        Exit 1
    }
}

$filePath = $useFile

# Extrair data de atualizacao do relatorio
$reportDate = $null
$fileObject = Get-Item -Path $filePath
if ($fileObject.Name -match "(\d{4})_(\d{2})_(\d{2})") {
    # Encontrou a data no formato YYYY_MM_DD no nome do arquivo (ex: 2026_06_16)
    $reportDate = "$($Matches[1])-$($Matches[2])-$($Matches[3]) 18:00:00"
} else {
    # Fallback para a data de modificacao do arquivo
    $reportDate = $fileObject.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
}
Write-Output "Data de atualizacao identificada para o relatorio: $reportDate"

Write-Output "Iniciando processamento da planilha de Cobrança: $filePath"

# 1. Inicializar Excel COM
Write-Output "Abrindo Excel..."
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$workbook = $null

try {
    $workbook = $excel.Workbooks.Open($filePath, 0, $true) # Somente-leitura
    $ws = $workbook.Worksheets.Item(1)
    
    Write-Output "Lendo intervalo de dados..."
    $range = $ws.UsedRange
    $data = $range.Value2
    $rowCount = $data.GetLength(0)
    $colCount = $data.GetLength(1)
    Write-Output "Carregados $rowCount linhas e $colCount colunas."
    
    # 2. Mapear cabeçalhos
    $headers = @{}
    for ($c = 1; $c -le $colCount; $c++) {
        $name = [string]$data[1, $c]
        if ($name) { $headers[$name] = $c }
    }
    
    # Validar cabeçalhos necessários
    $requiredHeaders = @("PEP", "PROJETO_GERENCIAL", "CATEGORIA", "CONTRATO_NUMERO", "CIDADE", "UF", "OS", "FASE_ATUAL", "FASE_ATUAL_DE_PARA", "DATA_CADASTRO", "DATA_APROVACAO_MEDICAO", "USER_INCLUSAO_LPU", "NUMERO_MEDICAO", "NUMERO_PEDIDO", "USER_PEDIDO", "TIPO_DE_ATIVIDADE", "ITEM_DESCRITIVO", "TIPO_DE_DESPESA", "OBJETO_DO_CONTRATO", "VALOR_TOTAL_FINAL", "PROJETO", "DATA_INCLUSAO_LPU")
    foreach ($rh in $requiredHeaders) {
        if (-not $headers.ContainsKey($rh)) {
            Write-Error "Cabeçalho obrigatório '$rh' não encontrado na planilha!"
            Exit 1
        }
    }
    
    $idxPEP = $headers["PEP"]
    $idxProjGer = $headers["PROJETO_GERENCIAL"]
    $idxCat = $headers["CATEGORIA"]
    $idxContrato = $headers["CONTRATO_NUMERO"]
    $idxCidade = $headers["CIDADE"]
    $idxUF = $headers["UF"]
    $idxOS = $headers["OS"]
    $idxFase = $headers["FASE_ATUAL"]
    $idxFaseDePara = $headers["FASE_ATUAL_DE_PARA"]
    $idxDtCad = $headers["DATA_CADASTRO"]
    $idxDtAprov = $headers["DATA_APROVACAO_MEDICAO"]
    $idxUserMed = $headers["USER_INCLUSAO_LPU"]
    $idxNumMed = $headers["NUMERO_MEDICAO"]
    $idxNumPed = $headers["NUMERO_PEDIDO"]
    $idxUserPed = $headers["USER_PEDIDO"]
    $idxTipoAtiv = $headers["TIPO_DE_ATIVIDADE"]
    $idxItemDesc = $headers["ITEM_DESCRITIVO"]
    $idxTipoDesp = $headers["TIPO_DE_DESPESA"]
    $idxObjContr = $headers["OBJETO_DO_CONTRATO"]
    $idxValTotal = $headers["VALOR_TOTAL_FINAL"]
    $idxProj = $headers["PROJETO"]
    $idxDtInclLPU = $headers["DATA_INCLUSAO_LPU"]
    
    # Helpers para datas
    function Parse-ExcelDate ($excelDate) {
        if ($null -eq $excelDate) { return "" }
        $doubleVal = 0.0
        if ([double]::TryParse($excelDate.ToString(), [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$doubleVal)) {
            try {
                return [System.DateTime]::FromOADate($doubleVal).ToString("yyyy-MM-dd")
            } catch {
                return $excelDate.ToString()
            }
        }
        return $excelDate.ToString()
    }
    
    function Get-DaysBetween ($dateStr1, $dateStr2) {
        if ($dateStr1 -eq "" -or $dateStr2 -eq "") { return $null }
        try {
            $d1 = [System.DateTime]::ParseExact($dateStr1, "yyyy-MM-dd", $null)
            $d2 = [System.DateTime]::ParseExact($dateStr2, "yyyy-MM-dd", $null)
            $diff = $d2 - $d1
            return [int]$diff.TotalDays
        } catch {
            return $null
        }
    }
    
    # 3. Dicionários para compressão
    $lookup_categorias = @()
    $map_categorias = @{}
    
    $lookup_cidades = @()
    $map_cidades = @{}
    
    $lookup_ufs = @()
    $map_ufs = @{}
    
    $lookup_projetos = @()
    $map_projetos = @{}
    
    $lookup_projetos_gerenciais = @()
    $map_projetos_gerenciais = @{}
    
    $lookup_tipos_atividade = @()
    $map_tipos_atividade = @{}
    
    $lookup_fase_atual = @()
    $map_fase_atual = @{}
    
    $lookup_contratos = @()
    $map_contratos = @{}
    
    $lookup_itens_descritivos = @()
    $map_itens_descritivos = @{}
    
    $lookup_tipos_despesa = @()
    $map_tipos_despesa = @{}
    
    $lookup_objetos_contrato = @()
    $map_objetos_contrato = @{}
    
    $lookup_users = @()
    $map_users = @{}
    
    $lookup_fase_de_para = @()
    $map_fase_de_para = @{}
    
    function Get-LookupIndex ($val, [ref]$lookupList, $mapTable) {
        if ($null -eq $val) { $val = "" }
        $vStr = [string]$val
        $vStrTrim = $vStr.Trim()
        
        if ($mapTable.ContainsKey($vStrTrim)) {
            return $mapTable[$vStrTrim]
        }
        
        $idx = $lookupList.Value.Count
        $lookupList.Value += $vStrTrim
        $mapTable[$vStrTrim] = $idx
        return $idx
    }
    
    # 4. Extração e Compressão
    Write-Output "Processando e comprimindo registros..."
    $rowsList = New-Object System.Collections.Generic.List[object]
    
    for ($r = 2; $r -le $rowCount; $r++) {
        $valNum = 0.0
        $valTF = $data[$r, $idxValTotal]
        if ($valTF -is [double] -or $valTF -is [int]) {
            $valNum = [Math]::Round([double]$valTF, 2)
        }
        
        # Filtro de segurança: se o valor for zero, pula
        if ($valNum -eq 0) {
            continue
        }
        
        # Obter campos indexados
        $catIdx = Get-LookupIndex $data[$r, $idxCat] ([ref]$lookup_categorias) $map_categorias
        $cidadeIdx = Get-LookupIndex $data[$r, $idxCidade] ([ref]$lookup_cidades) $map_cidades
        $ufIdx = Get-LookupIndex $data[$r, $idxUF] ([ref]$lookup_ufs) $map_ufs
        $projIdx = Get-LookupIndex $data[$r, $idxProj] ([ref]$lookup_projetos) $map_projetos
        $projGerIdx = Get-LookupIndex $data[$r, $idxProjGer] ([ref]$lookup_projetos_gerenciais) $map_projetos_gerenciais
        $tipoAtivIdx = Get-LookupIndex $data[$r, $idxTipoAtiv] ([ref]$lookup_tipos_atividade) $map_tipos_atividade
        $faseIdx = Get-LookupIndex $data[$r, $idxFase] ([ref]$lookup_fase_atual) $map_fase_atual
        $contratoIdx = Get-LookupIndex $data[$r, $idxContrato] ([ref]$lookup_contratos) $map_contratos
        $itemDescIdx = Get-LookupIndex $data[$r, $idxItemDesc] ([ref]$lookup_itens_descritivos) $map_itens_descritivos
        $tipoDespIdx = Get-LookupIndex $data[$r, $idxTipoDesp] ([ref]$lookup_tipos_despesa) $map_tipos_despesa
        $objContrIdx = Get-LookupIndex $data[$r, $idxObjContr] ([ref]$lookup_objetos_contrato) $map_objetos_contrato
        $userMedIdx = Get-LookupIndex $data[$r, $idxUserMed] ([ref]$lookup_users) $map_users
        $userPedIdx = Get-LookupIndex $data[$r, $idxUserPed] ([ref]$lookup_users) $map_users # mesmo lookup de usuários
        $faseDeParaIdx = Get-LookupIndex $data[$r, $idxFaseDePara] ([ref]$lookup_fase_de_para) $map_fase_de_para
        
        # Obter campos crus
        $pep = if ($null -eq $data[$r, $idxPEP]) { "" } else { [string]$data[$r, $idxPEP] }
        $os = if ($null -eq $data[$r, $idxOS]) { "" } else { [string]$data[$r, $idxOS] }
        $numMed = if ($null -eq $data[$r, $idxNumMed]) { "" } else { [string]$data[$r, $idxNumMed] }
        $numPed = if ($null -eq $data[$r, $idxNumPed]) { "" } else { [string]$data[$r, $idxNumPed] }
        
        # Obter e tratar datas
        $dtCad = Parse-ExcelDate $data[$r, $idxDtCad]
        $dtAprov = Parse-ExcelDate $data[$r, $idxDtAprov]
        $dtInclLPU = Parse-ExcelDate $data[$r, $idxDtInclLPU]
        
        # Calcular tempo de aprovação
        $tempoAprov = Get-DaysBetween $dtCad $dtAprov
        
        # Determinar data de referência dinâmica para o mês de medição:
        # Se a OS estiver aprovada (fase_de_para = APROVADO ou PEDIDO EMITIDO), usar DATA_APROVACAO_MEDICAO
        # Se não estiver aprovada (Em Execução ou Executado), usar DATA_INCLUSAO_LPU
        $dtRef = ""
        $faseDeParaVal = $data[$r, $idxFaseDePara]
        if ($null -eq $faseDeParaVal) { $faseDeParaVal = "" }
        $faseDeParaValStr = [string]$faseDeParaVal.ToString().ToUpper().Trim()
        
        if ($faseDeParaValStr -eq "APROVADO" -or $faseDeParaValStr -eq "PEDIDO EMITIDO") {
            $dtRef = $dtAprov
        } else {
            $dtRef = $dtInclLPU
        }
        
        # Obter mês de medição a partir da data de referência
        $mesMed = "PREVISTO"
        if ($dtRef -match "^\d{4}-\d{2}-\d{2}$") {
            $mesMed = $dtRef.Substring(0, 4) + "/" + $dtRef.Substring(5, 2)
        }
        
        # Estrutura ultra compacta de array:
        # 0: pep (str)
        # 1: categoria (idx)
        # 2: os (str)
        # 3: cidade (idx)
        # 4: uf (idx)
        # 5: projeto (idx)
        # 6: projeto_gerencial (idx)
        # 7: tipo_atividade (idx)
        # 8: fase_atual (idx)
        # 9: contrato_numero (idx)
        # 10: item_descritivo (idx)
        # 11: tipo_despesa (idx)
        # 12: objeto_do_contrato (idx)
        # 13: valor_total (num)
        # 14: data_cadastro (str)
        # 15: data_aprovacao (str)
        # 16: tempo_aprovacao (num/null)
        # 17: user_inclusao_medicao (idx)
        # 18: numero_medicao (str)
        # 19: numero_pedido (str)
        # 20: user_pedido (idx)
        # 21: fase_atual_de_para (idx)
        # 22: mes_medicao (str)
        # 23: data_inclusao_lpu (str)
        
        $rowArray = @(
            $pep, $catIdx, $os, $cidadeIdx, $ufIdx, $projIdx, $projGerIdx, $tipoAtivIdx, 
            $faseIdx, $contratoIdx, $itemDescIdx, $tipoDespIdx, $objContrIdx, $valNum, 
            $dtCad, $dtAprov, $tempoAprov, $userMedIdx, $numMed, $numPed, $userPedIdx, 
            $faseDeParaIdx, $mesMed, $dtInclLPU
        )
        
        [void]$rowsList.Add($rowArray)
    }
    
    Write-Output "Salvando cobranca_data.js..."
    
    # Empacotar lookups e dados
    $payload = [PSCustomObject]@{
        generated_at = $reportDate
        lookups = [PSCustomObject]@{
            categorias = $lookup_categorias
            cidades = $lookup_cidades
            ufs = $lookup_ufs
            projetos = $lookup_projetos
            projetos_gerenciais = $lookup_projetos_gerenciais
            tipos_atividade = $lookup_tipos_atividade
            fase_atual = $lookup_fase_atual
            contratos = $lookup_contratos
            itens_descritivos = $lookup_itens_descritivos
            tipos_despesa = $lookup_tipos_despesa
            objetos_contrato = $lookup_objetos_contrato
            users = $lookup_users
            fase_de_para = $lookup_fase_de_para
        }
        rows = $rowsList
    }
    
    $jsonStr = $payload | ConvertTo-Json -Depth 10
    
    # Criar wrapper de descompressão automática em JavaScript
    $jsContent = @"
// Dados de Cobrança Compactados - Gerado em: $reportDate
(function() {
    const db = $jsonStr;
    const l = db.lookups;
    
    // Descomprimir na memória
    window.COBRANCA_DATA = db.rows.map(r => ({
        pep: r[0],
        categoria: l.categorias[r[1]],
        os: r[2],
        cidade: l.cidades[r[3]],
        uf: l.ufs[r[4]],
        projeto: l.projetos[r[5]],
        projeto_gerencial: l.projetos_gerenciais[r[6]],
        tipo_atividade: l.tipos_atividade[r[7]],
        fase_atual: l.fase_atual[r[8]],
        contrato_numero: l.contratos[r[9]],
        item_descritivo: l.itens_descritivos[r[10]],
        tipo_despesa: l.tipos_despesa[r[11]],
        objeto_do_contrato: l.objetos_contrato[r[12]],
        valor_total: r[13],
        data_cadastro: r[14],
        data_aprovacao: r[15],
        tempo_aprovacao: r[16],
        user_inclusao_medicao: l.users[r[17]],
        numero_medicao: r[18],
        numero_pedido: r[19],
        user_pedido: l.users[r[20]],
        fase_atual_de_para: l.fase_de_para[r[21]],
        mes_medicao: r[22],
        data_inclusao_lpu: r[23]
    }));
    
    window.COBRANCA_METADATA = {
        generated_at: db.generated_at,
        count: db.rows.length
    };
    
    console.log('Base de Cobrança carregada:', window.COBRANCA_DATA.length, 'registros.');
})();
"@

    $jsContent | Out-File -FilePath $outputPath -Encoding utf8
    Write-Output "Concluído! Salvo em $outputPath com $($rowsList.Count) registros."

    # 4.5. Gerar cobranca_simple.json mapeando OS -> { status, pedido }
    Write-Output "Gerando cobranca_simple.json..."
    $simpleMap = [System.Collections.Generic.Dictionary[string, object]]::new()
    foreach ($row in $rowsList) {
        $osVal = $row[2]
        if (-not $osVal) { continue }
        $osKey = $osVal.ToString().Trim().ToUpper()
        if ($osKey -eq "") { continue }

        $statusVal = $lookup_fase_de_para[$row[21]]
        $pedidoVal = $row[19]
        $pedidoStr = if ($null -eq $pedidoVal) { "" } else { $pedidoVal.ToString().Trim() }

        if ($simpleMap.ContainsKey($osKey)) {
            $existing = $simpleMap[$osKey]
            if ($pedidoStr -ne "" -and $existing.pedido -eq "") {
                $existing.pedido = $pedidoStr
            }
            if ($statusVal -ne "" -and $existing.status -eq "") {
                $existing.status = $statusVal
            }
        } else {
            $simpleMap[$osKey] = [PSCustomObject]@{
                status = $statusVal
                pedido = $pedidoStr
            }
        }
    }

    $simplePayload = [PSCustomObject]@{
        generated_at = $reportDate
        os = $simpleMap
    }
    $simpleJsonStr = $simplePayload | ConvertTo-Json -Depth 10
    $simpleJsonStr | Out-File -FilePath "$PSScriptRoot\cobranca_simple.json" -Encoding utf8
    Write-Output "cobranca_simple.json salvo com sucesso."

    # 5. Publicar atualizações no GitHub se houver alterações em cobranca_data.js
    Write-Output "Verificando se houve alteracoes nos dados para publicar no GitHub..."
    $gitPath = "C:\Program Files\Git\cmd\git.exe"
    if (Test-Path $gitPath) {
        $gitStatus = & $gitPath status --porcelain "$PSScriptRoot\cobranca_data.js"
        if ($null -ne $gitStatus -and $gitStatus.ToString().Trim() -ne "") {
            Write-Output "Novas transacoes de cobranca detectadas! Atualizando a versao do Cache no Service Worker (sw.js)..."
            $swPath = "$PSScriptRoot\sw.js"
            if (Test-Path $swPath) {
                try {
                    $swContent = [System.IO.File]::ReadAllText($swPath)
                    $timestamp = Get-Date -Format "yyyyMMddHHmmss"
                    $newCacheNameLine = "const CACHE_NAME = 'jle-bi-v3.16.$timestamp';"
                    $swContent = $swContent -replace "const CACHE_NAME = '([^']+)';", $newCacheNameLine
                    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                    [System.IO.File]::WriteAllText($swPath, $swContent, $utf8NoBom)
                    Write-Output "Cache do Service Worker atualizado com sucesso para: jle-bi-v3.16.$timestamp"
                } catch {
                    Write-Warning "Nao foi possivel atualizar o sw.js: $($_.Exception.Message)"
                }
            }

            Write-Output "Fazendo commit e push para o GitHub..."
            & $gitPath add "$PSScriptRoot\cobranca_data.js" "$PSScriptRoot\cobranca_simple.json" "$PSScriptRoot\sw.js"
            & $gitPath commit -m "data(auto): atualizacao automatica de dados de cobranca e cache PWA"
            & $gitPath push origin main
            Write-Output "Dados de cobranca e Service Worker publicados com sucesso no GitHub!"
            
            # 6. Trigger automatic sync in Services JLE system
            try {
                Write-Output "Disparando sincronizacao em tempo real no Servicos JLE..."
                $webhookUrlProd = "https://jle-monitoramento-tecnico.vercel.app/api/sync-bi"
                $headers = @{
                    "Authorization" = "Bearer jle-bi-sync-token-2026"
                    "Content-Type"  = "application/json"
                }
                $response = Invoke-RestMethod -Uri $webhookUrlProd -Method Post -Headers $headers -TimeoutSec 15
                Write-Output "Sincronizacao em producao disparada com sucesso: $($response.mensagem)"
            } catch {
                Write-Warning "Falha ao disparar sincronizacao automatica: $_"
            }
        } else {
            Write-Output "Sem novas alteracoes nos dados de cobranca. Nenhuma publicacao necessaria."
        }
    } else {
        Write-Warning "Executavel do Git nao encontrado em '$gitPath'. Nao foi possivel publicar no GitHub."
    }
    
} catch {
    Write-Error "Ocorreu um erro no script: $($_.Exception.Message)"
} finally {
    if ($null -ne $workbook) { $workbook.Close($false) }
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    
    if ($null -ne $localTempPath -and (Test-Path $localTempPath)) {
        Remove-Item -Path $localTempPath -Force
    }
    
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
