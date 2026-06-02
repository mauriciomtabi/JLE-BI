# Script ETL para consolidar as planilhas de Fluxo de Caixa da JLE Telecom
# Sem alterar o arquivo original, lê os dados e gera data.js para o dashboard.
# Usando reconstrução de caracteres via [char] e conversão numérica robusta.

$c_cedilla = [char]231
$e_acute = [char]233
$a_tilde = [char]227
$i_acute = [char]237
$e_circumflex = [char]234
$c_cedilla_caps = [char]199

$networkDir = "\\10.121.21.252\financeiro\Angelita\2026\FLUXO DIARIO"
$localTempPath = "C:\Users\jlema\.gemini\antigravity\scratch\fluxo_caixa_mapping\temp_read.xlsx"
$fallbackPath = "C:\Users\jlema\.gemini\antigravity\scratch\fluxo_caixa_mapping\local_file.xlsx"

Write-Output "Iniciando processo de ETL..."

# 1. Copiar arquivo da rede localmente (utilizando busca com wildcard para tolerar variações de acentuação na rede)
$useFile = $null
$networkPath = $null

if (Test-Path $networkDir) {
    try {
        $networkFile = Get-ChildItem $networkDir | Where-Object { $_.Name -like "*Fluxo de Caixa*11.05.2026.xlsx" } | Select-Object -First 1
        if ($null -ne $networkFile) {
            $networkPath = $networkFile.FullName
            Write-Output "Arquivo de rede encontrado: $networkPath"
            Write-Output "Copiando planilha da rede localmente..."
            Copy-Item -Path $networkPath -Destination $localTempPath -Force
            # Atualiza também a cópia de fallback local para manter o cache sincronizado
            Copy-Item -Path $networkPath -Destination $fallbackPath -Force
            $useFile = $localTempPath
            Write-Output "Cópia realizada e cache local atualizado com sucesso."
        } else {
            Write-Warning "Nenhum arquivo correspondente a '*Fluxo de Caixa*11.05.2026.xlsx' foi encontrado na pasta de rede."
        }
    } catch {
        Write-Warning "Falha ao copiar da rede: $($_.Exception.Message)"
    }
} else {
    Write-Warning "Diretório de rede inacessível: $networkDir"
}

if ($null -eq $useFile) {
    if (Test-Path $fallbackPath) {
        Write-Output "Usando planilha em cache local como fallback: $fallbackPath"
        $useFile = $fallbackPath
    } else {
        Write-Error "Arquivo de dados não encontrado! Certifique-se de estar conectado à rede."
        Exit 1
    }
}

# 2. Inicializar Excel COM
Write-Output "Abrindo Excel..."
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$workbook = $null

function Normalize-String ($str) {
    if ($null -eq $str) { return "" }
    $normalized = $str.ToString().Normalize([System.Text.NormalizationForm]::FormD)
    $sb = New-Object System.Text.StringBuilder
    foreach ($c in $normalized.ToCharArray()) {
        $category = [System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($c)
        if ($category -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$sb.Append($c)
        }
    }
    $clean = $sb.ToString().ToLower()
    $clean = $clean -replace "[^a-z0-9]", ""
    return $clean
}

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

try {
    $workbook = $excel.Workbooks.Open($useFile, 0, $true) # Somente-leitura
    
    $allTransactions = @()
    $categoriasEntrada = @()
    $categoriasSaida = @()
    $tiposTransacao = @()
    
    # 3. Ler listas de validação da aba 'Origem de Dados '
    try {
        Write-Output "Carregando listas de validação de categorias..."
        $origSheet = $workbook.Worksheets.Item("Origem de Dados ")
        $origRows = $origSheet.UsedRange.Rows.Count
        for ($r = 2; $r -le $origRows; $r++) {
            $ent = $origSheet.Cells.Item($r, 1).Value2
            $sai = $origSheet.Cells.Item($r, 3).Value2
            $tip = $origSheet.Cells.Item($r, 5).Value2
            
            if ($null -ne $ent -and $ent.ToString().Trim() -ne "") { $categoriasEntrada += $ent.ToString().Trim() }
            if ($null -ne $sai -and $sai.ToString().Trim() -ne "") { $categoriasSaida += $sai.ToString().Trim() }
            if ($null -ne $tip -and $tip.ToString().Trim() -ne "") { $tiposTransacao += $tip.ToString().Trim() }
        }
    } catch {
        Write-Warning "Não foi possível carregar listas de validação: $($_.Exception.Message)"
    }
    
    # 4. Processar abas transacionais
    foreach ($sheet in $workbook.Worksheets) {
        $name = $sheet.Name.Trim()
        
        if ($name -eq "Instrucoes" -or $name -eq "Origem de Dados" -or $name -like "*2025*") {
            continue
        }
        
        $banco = "Outros"
        if ($name -like "*BRADESCO*") {
            $banco = "Bradesco"
        } elseif ($name -like "*CONFIAN*") {
            $banco = "Sicoob Confian" + $c_cedilla + "a"
        } elseif ($name -like "*MAXCREDITO*" -or $name -like "*MAXICREDITO*") {
            $banco = "Sicoob MaxiCr" + $e_acute + "dito"
        } elseif ($name -like "*Cartao*" -or $name -like "*Cartão*") {
            $banco = "Cart" + $a_tilde + "o de Cr" + $e_acute + "dito"
        }
        
        Write-Output "Processando aba $($name) ($banco)..."
        
        $usedRange = $sheet.UsedRange
        $totalRows = $usedRange.Rows.Count
        $totalCols = $usedRange.Columns.Count
        
        $headerRowIdx = -1
        for ($r = 1; $r -le [System.Math]::Min(15, $totalRows); $r++) {
            $hasData = $false
            $hasEntradaSaida = $false
            for ($c = 1; $c -le $totalCols; $c++) {
                $val = $sheet.Cells.Item($r, $c).Value2
                if ($null -ne $val) {
                    $vStr = Normalize-String $val.ToString()
                    if ($vStr -eq "data") { $hasData = $true }
                    if ($vStr -eq "entradasaida") { $hasEntradaSaida = $true }
                }
            }
            if ($hasData -and $hasEntradaSaida) {
                $headerRowIdx = $r
                break
            }
        }
        
        if ($headerRowIdx -eq -1) {
            continue
        }
        
        $colMap = @{}
        for ($c = 1; $c -le $totalCols; $c++) {
            $val = $sheet.Cells.Item($headerRowIdx, $c).Value2
            if ($null -ne $val) {
                $normName = Normalize-String $val.ToString()
                if ($normName -ne "") {
                    $colMap[$normName] = $c
                }
            }
        }
        
        $isLayoutB = $colMap.ContainsKey("remessa")
        
        $mesAba = "N/D"
        if ($name -match "(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)") {
            $mesAba = $Matches[1]
            switch ($mesAba) {
                "JAN" { $mesAba = "JANEIRO" }
                "FEV" { $mesAba = "FEVEREIRO" }
                "MAR" { $mesAba = "MAR" + $c_cedilla_caps + "O" }
                "ABR" { $mesAba = "ABRIL" }
                "MAI" { $mesAba = "MAIO" }
                "JUN" { $mesAba = "JUNHO" }
                "JUL" { $mesAba = "JULHO" }
                "AGO" { $mesAba = "AGOSTO" }
                "SET" { $mesAba = "SETEMBRO" }
                "OUT" { $mesAba = "OUTUBRO" }
                "NOV" { $mesAba = "NOVEMBRO" }
                "DEZ" { $mesAba = "DEZEMBRO" }
            }
        }
        
        $txCount = 0
        for ($r = $headerRowIdx + 1; $r -le $totalRows; $r++) {
            $dataIdx = $colMap["data"]
            if ($null -eq $dataIdx) { continue }
            
            $dataVal = $sheet.Cells.Item($r, $dataIdx).Value2
            if ($null -eq $dataVal -or $dataVal.ToString().Trim() -eq "") {
                continue
            }
            
            $dataStr = Parse-ExcelDate $dataVal
            
            # 1. Remessa
            $remessa = "MANUAL"
            if ($isLayoutB -and $colMap.ContainsKey("remessa")) {
                $temp = $sheet.Cells.Item($r, $colMap["remessa"]).Value2
                if ($null -ne $temp) { $remessa = $temp.ToString().Trim().ToUpper() }
            }
            
            # 2. Competência
            $competencia = $mesAba
            if ($isLayoutB -and $colMap.ContainsKey("competencia")) {
                $temp = $sheet.Cells.Item($r, $colMap["competencia"]).Value2
                if ($null -ne $temp) { $competencia = $temp.ToString().Trim().ToUpper() }
            }
            
            # 3. UF
            $uf = "N/D"
            if ($isLayoutB -and $colMap.ContainsKey("uf")) {
                $temp = $sheet.Cells.Item($r, $colMap["uf"]).Value2
                if ($null -ne $temp) { $uf = $temp.ToString().Trim().ToUpper() }
            }
            
            # 4. Entrada/Saída
            $fluxo = "N/D"
            $esIdx = $null
            if ($colMap.ContainsKey("entradasaida")) { $esIdx = $colMap["entradasaida"] }
            if ($null -ne $esIdx) {
                $temp = $sheet.Cells.Item($r, $esIdx).Value2
                if ($null -ne $temp) { $fluxo = $temp.ToString().Trim() }
            }
            
            # 5. Categoria
            $categoria = "Outros"
            $catColIdx = $null
            foreach ($h in @("movimento", "receitasdespesas", "fornecedores", "d")) {
                if ($colMap.ContainsKey($h)) {
                    $catColIdx = $colMap[$h]
                    break
                }
            }
            if ($null -ne $catColIdx) {
                $temp = $sheet.Cells.Item($r, $catColIdx).Value2
                if ($null -ne $temp) { $categoria = $temp.ToString().Trim() }
            }
            
            # 6. Descrição
            $descricao = ""
            $descColIdx = $null
            foreach ($h in @("descricao", "detalhamento", "coluna1")) {
                if ($colMap.ContainsKey($h)) {
                    $descColIdx = $colMap[$h]
                    break
                }
            }
            if ($null -ne $descColIdx) {
                $temp = $sheet.Cells.Item($r, $descColIdx).Value2
                if ($null -ne $temp) { $descricao = $temp.ToString().Trim() }
            }
            
            # 7. Valor Nominal (CONVERSÃO DE NÚMEROS CORRIGIDA)
            $valorNominal = 0.0
            $valIdx = $colMap["rvalores"]
            if ($null -ne $valIdx) {
                $temp = $sheet.Cells.Item($r, $valIdx).Value2
                if ($null -ne $temp) {
                    if ($temp -is [double] -or $temp -is [decimal] -or $temp -is [int] -or $temp -is [float]) {
                        # Se já for tipo numérico nativo do Excel COM, atribui diretamente!
                        $valorNominal = [double]$temp
                    } else {
                        # Se for string (fallback), trata vírgulas e pontos
                        $valStr = $temp.ToString().Trim()
                        
                        # Se for formato brasileiro simples (ex: 123,45)
                        if ($valStr -match "^-?\d+,\d+$") {
                            $valStr = $valStr -replace ",", "."
                        }
                        # Se for formato brasileiro completo (ex: 1.234,56)
                        elseif ($valStr -contains "." -and $valStr -contains ",") {
                            $valStr = $valStr -replace "\.", "" -replace ",", "."
                        }
                        
                        $valNum = 0.0
                        if ([double]::TryParse($valStr, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$valNum)) {
                            $valorNominal = $valNum
                        }
                    }
                }
            }
            
            # 8. Tipo Transação
            $meioPagamento = "Outros"
            $tipoIdx = $colMap["tipotransacao"]
            if ($null -ne $tipoIdx) {
                $temp = $sheet.Cells.Item($r, $tipoIdx).Value2
                if ($null -ne $temp) { 
                    $meioPagamento = $temp.ToString().Trim() 
                    if ($meioPagamento.ToUpper() -eq "PIX") {
                        $meioPagamento = "Pix"
                    }
                }
            }
            
            # 9. Valor Líquido (sinalizado)
            $valorLiquido = $valorNominal
            $saida_str = "Sa" + $i_acute + "da"
            if ($fluxo -eq $saida_str) {
                $valorLiquido = -$valorNominal
            }
            
            # 10. Identificar Transferência
            $isTransfer = $false
            $trans_str = "Transfer" + $e_circumflex + "ncia entre contas"
            if ($categoria -eq $trans_str) {
                $isTransfer = $true
            }
            
            $txObj = [PSCustomObject]@{
                id = "$($name)_$($r)"
                banco = $banco
                aba = $name
                remessa = $remessa
                competencia = $competencia
                data = $dataStr
                uf = $uf
                fluxo = $fluxo
                categoria = $categoria
                descricao = $descricao
                valor_nominal = [Math]::Round($valorNominal, 2)
                valor_liquido = [Math]::Round($valorLiquido, 2)
                meio_pagamento = $meioPagamento
                is_transfer = $isTransfer
            }
            
            $allTransactions += $txObj
            $txCount++
        }
        Write-Output "Aba $($name): $($txCount) transacoes reais extraidas."
    }
    
    # 5. Gerar arquivo data.js
    Write-Output "Consolidando dados em formato JSON..."
    
    $payload = [PSCustomObject]@{
        generated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        categories_origin = [PSCustomObject]@{
            entradas = $categoriasEntrada
            saidas = $categoriasSaida
            tipos = $tiposTransacao
        }
        transactions = $allTransactions
    }
    
    $jsonStr = $payload | ConvertTo-Json -Depth 6
    $jsContent = "window.CASH_FLOW_DATA = " + $jsonStr + ";"
    $jsContent | Out-File -FilePath "C:\Users\jlema\.gemini\antigravity\scratch\fluxo_caixa_mapping\data.js" -Encoding utf8
    
    Write-Output "ETL Finalizado! Dados salvos em data.js com $($allTransactions.Count) lancamentos."

    # 6. Publicar atualizações no GitHub se houver alterações em data.js
    Write-Output "Verificando se houve alteracoes nos dados para publicar no GitHub..."
    $gitPath = "C:\Program Files\Git\cmd\git.exe"
    if (Test-Path $gitPath) {
        $gitStatus = & $gitPath status --porcelain data.js
        if ($null -ne $gitStatus -and $gitStatus.ToString().Trim() -ne "") {
            Write-Output "Novas transacoes detectadas! Atualizando a versao do Cache no Service Worker (sw.js)..."
            $swPath = "C:\Users\jlema\.gemini\antigravity\scratch\fluxo_caixa_mapping\sw.js"
            if (Test-Path $swPath) {
                try {
                    $swContent = [System.IO.File]::ReadAllText($swPath)
                    $timestamp = Get-Date -Format "yyyyMMddHHmmss"
                    $newCacheNameLine = "const CACHE_NAME = 'jle-bi-v3.12.$timestamp';"
                    $swContent = $swContent -replace "const CACHE_NAME = '([^']+)';", $newCacheNameLine
                    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                    [System.IO.File]::WriteAllText($swPath, $swContent, $utf8NoBom)
                    Write-Output "Cache do Service Worker atualizado com sucesso para: jle-bi-v3.12.$timestamp"
                } catch {
                    Write-Warning "Nao foi possivel atualizar o sw.js: $($_.Exception.Message)"
                }
            }

            Write-Output "Fazendo commit e push para o GitHub..."
            & $gitPath add data.js sw.js
            & $gitPath commit -m "data(auto): atualizacao automatica de dados e cache do PWA"
            & $gitPath push origin main
            Write-Output "Dados e Service Worker publicados com sucesso no GitHub!"
        } else {
            Write-Output "Sem novas alteracoes nos dados. Nenhuma publicacao necessaria."
        }
    } else {
        Write-Warning "Executavel do Git nao encontrado em '$gitPath'. Nao foi possivel publicar no GitHub."
    }
    
} catch {
    Write-Error "Ocorreu um erro no ETL: $($_.Exception.Message)"
} finally {
    if ($null -ne $workbook) { $workbook.Close($false) }
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    
    if (Test-Path $localTempPath) {
        Remove-Item -Path $localTempPath -Force
    }
}
