# Script ETL para extrair dados da planilha de Cobrança e gerar cobranca_data.js
# Lê os dados da aba 'Analitico_Empreiteiras_WF1_WF2_' de 'Analítico Claro - Base Geral.xlsx' em Downloads

$downloadDir = "C:\Users\Operador\Downloads"
$file = Get-ChildItem -Path $downloadDir -Filter "*Anal*tico*Claro*.xlsx" | Select-Object -First 1

if ($null -eq $file) {
    Write-Error "Planilha 'Analítico Claro - Base Geral.xlsx' não encontrada em '$downloadDir'!"
    Exit 1
}

$filePath = $file.FullName
$outputPath = "c:\Users\Operador\.gemini\antigravity\scratch\JLE-BI\cobranca_data.js"

Write-Output "Iniciando processamento da planilha de Cobrança: $filePath"

# 1. Inicializar Excel COM
Write-Output "Abrindo Excel..."
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$workbook = $null

try {
    $workbook = $excel.Workbooks.Open($filePath, 0, $true) # Somente-leitura
    $ws = $workbook.Worksheets.Item("Analitico_Empreiteiras_WF1_WF2_")
    
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
    $requiredHeaders = @("PEP", "PROJETO_GERENCIAL", "CATEGORIA", "CONTRATO_NUMERO", "CIDADE", "UF", "OS", "FASE_ATUAL", "FASE_ATUAL_DE_PARA", "DATA_CADASTRO", "DATA_APROVACAO_MEDICAO", "USER_INCLUSAO_LPU", "NUMERO_MEDICAO", "NUMERO_PEDIDO", "USER_PEDIDO", "TIPO_DE_ATIVIDADE", "ITEM_DESCRITIVO", "TIPO_DE_DESPESA", "OBJETO_DO_CONTRATO", "VALOR_TOTAL_FINAL", "PROJETO")
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
        
        # Calcular tempo de aprovação
        $tempoAprov = Get-DaysBetween $dtCad $dtAprov
        
        # Obter mês de medição (que pode ser formatado ou string)
        $mesMedVal = $data[$r, $headers["MES_MEDICAO"]]
        $mesMed = if ($null -eq $mesMedVal) { "" } else { [string]$mesMedVal }
        
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
        
        $rowArray = @(
            $pep, $catIdx, $os, $cidadeIdx, $ufIdx, $projIdx, $projGerIdx, $tipoAtivIdx, 
            $faseIdx, $contratoIdx, $itemDescIdx, $tipoDespIdx, $objContrIdx, $valNum, 
            $dtCad, $dtAprov, $tempoAprov, $userMedIdx, $numMed, $numPed, $userPedIdx, 
            $faseDeParaIdx, $mesMed
        )
        
        [void]$rowsList.Add($rowArray)
    }
    
    Write-Output "Salvando cobranca_data.js..."
    
    # Empacotar lookups e dados
    $payload = [PSCustomObject]@{
        generated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
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
// Dados de Cobrança Compactados - Gerado em: $((Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
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
        mes_medicao: r[22]
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
    
} catch {
    Write-Error "Ocorreu um erro no script: $($_.Exception.Message)"
} finally {
    if ($null -ne $workbook) { $workbook.Close($false) }
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
