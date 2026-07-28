# Script ETL para consolidar as planilhas de Fluxo de Caixa da Tecnodrill
# Le a planilha TECONDRILL da rede, gera tecnodrill_data.js para o dashboard.

$c_cedilla = [char]231
$e_acute = [char]233
$a_tilde = [char]227
$i_acute = [char]237
$e_circumflex = [char]234
$c_cedilla_caps = [char]199

$networkDir = "\\10.121.21.252\financeiro\Angelita\2026\FLUXO DIARIO"
$localTempPath = "$PSScriptRoot\temp_tecnodrill.xlsx"
$fallbackPath = "$PSScriptRoot\tecnodrill_local.xlsx"

Write-Output "======================================================="
Write-Output "Iniciando download da planilha Tecnodrill da rede..."
Write-Output "======================================================="

$useFile = $null
$networkPath = $null

if (Test-Path $networkDir) {
    try {
        $networkFile = Get-ChildItem $networkDir |
            Where-Object { $_.Name -match "Fluxo de Caixa Anal.*tico TECONDRILL.*\.xlsx$" } |
            Sort-Object @{Expression = {$_.LastWriteTime}; Descending = $true} |
            Select-Object -First 1

        if ($null -ne $networkFile) {
            $networkPath = $networkFile.FullName
            Write-Output "Arquivo Tecnodrill encontrado: $networkPath"
            Write-Output "Copiando planilha da rede localmente..."
            Copy-Item -Path $networkPath -Destination $localTempPath -Force
            Copy-Item -Path $networkPath -Destination $fallbackPath -Force
            $useFile = $localTempPath
            Write-Output "Copia realizada com sucesso."
        } else {
            Write-Warning "Arquivo TECONDRILL nao encontrado na pasta de rede."
        }
    } catch {
        Write-Warning "Falha ao copiar da rede: $($_.Exception.Message)"
    }
} else {
    Write-Warning "Diretorio de rede inacessivel: $networkDir"
}

if ($null -eq $useFile) {
    if (Test-Path $fallbackPath) {
        Write-Output "Usando planilha Tecnodrill em cache local: $fallbackPath"
        $useFile = $fallbackPath
    } else {
        Write-Error "Arquivo Tecnodrill nao encontrado! Verifique a conexao com a rede."
        Exit 1
    }
}

Write-Output "Executando ETL Tecnodrill..."

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$workbook = $null

function Normalize-String-TD ($str) {
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

function Parse-ExcelDate-TD ($excelDate) {
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
    $workbook = $excel.Workbooks.Open($useFile, 0, $true)

    $allTransactions = @()
    $categoriasEntrada = @()
    $categoriasSaida = @()
    $tiposTransacao = @()

    # Ler listas de validacao da aba 'Origem de Dados'
    try {
        Write-Output "Carregando listas de validacao de categorias..."
        $origSheet = $null
        foreach ($ws in $workbook.Worksheets) {
            if ($ws.Name.Trim() -like "*Origem*") { $origSheet = $ws; break }
        }
        if ($null -ne $origSheet) {
            $origRows = $origSheet.UsedRange.Rows.Count
            for ($r = 2; $r -le $origRows; $r++) {
                $ent = $origSheet.Cells.Item($r, 2).Value2
                $sai = $origSheet.Cells.Item($r, 4).Value2
                $tip = $origSheet.Cells.Item($r, 6).Value2
                if ($null -ne $ent -and $ent.ToString().Trim() -ne "") { $categoriasEntrada += $ent.ToString().Trim() }
                if ($null -ne $sai -and $sai.ToString().Trim() -ne "") { $categoriasSaida += $sai.ToString().Trim() }
                if ($null -ne $tip -and $tip.ToString().Trim() -ne "") { $tiposTransacao += $tip.ToString().Trim() }
            }
        }
    } catch {
        Write-Warning "Nao foi possivel carregar listas de validacao: $($_.Exception.Message)"
    }

    # Processar abas TECNODRILL
    foreach ($sheet in $workbook.Worksheets) {
        $name = $sheet.Name.Trim()

        # Pular abas que nao sao de dados Tecnodrill ou sao de anos anteriores
        if ($name.ToUpper() -notlike "*TECNODRILL*") { continue }
        if ($name -like "*2025*") { continue }

        Write-Output "Processando aba: $name..."

        $usedRange = $sheet.UsedRange
        $totalRows = $usedRange.Rows.Count
        $totalCols = $usedRange.Columns.Count

        # Extrair mes/ano do nome da aba
        $mesAba = "N/D"
        $anoAba = ""
        if ($name -match "(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)") {
            $mesCode = $Matches[1]
            switch ($mesCode) {
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
        if ($name -match "(20\d{2})") { $anoAba = $Matches[1] }
        $competenciaAba = if ($mesAba -ne "N/D" -and $anoAba -ne "") { "$mesAba/$anoAba" } else { $mesAba }

        # Localizar linha de cabecalho (busca dinamica ate linha 15)
        $headerRowIdx = -1
        for ($r = 1; $r -le [System.Math]::Min(15, $totalRows); $r++) {
            $hasData = $false
            $hasFluxo = $false
            for ($c = 1; $c -le $totalCols; $c++) {
                $val = $sheet.Cells.Item($r, $c).Value2
                if ($null -ne $val) {
                    $vStr = Normalize-String-TD $val.ToString()
                    if ($vStr -eq "data") { $hasData = $true }
                    if ($vStr -like "*entrada*" -or $vStr -eq "entradasaida") { $hasFluxo = $true }
                }
            }
            if ($hasData -and $hasFluxo) { $headerRowIdx = $r; break }
        }

        if ($headerRowIdx -eq -1) {
            Write-Warning "Cabecalho nao encontrado na aba $name. Pulando."
            continue
        }

        # Mapear colunas
        $colMap = @{}
        for ($c = 1; $c -le $totalCols; $c++) {
            $val = $sheet.Cells.Item($headerRowIdx, $c).Value2
            if ($null -ne $val) {
                $normName = Normalize-String-TD $val.ToString()
                if ($normName -ne "") { $colMap[$normName] = $c }
            }
        }

        $mesNumMap = @{
            "JANEIRO"="01"; "FEVEREIRO"="02"; "MARÇO"="03"; "ABRIL"="04";
            "MAIO"="05"; "JUNHO"="06"; "JULHO"="07"; "AGOSTO"="08";
            "SETEMBRO"="09"; "OUTUBRO"="10"; "NOVEMBRO"="11"; "DEZEMBRO"="12"
        }
        $monthNum = if ($mesNumMap.ContainsKey($mesAba)) { $mesNumMap[$mesAba] } else { "01" }
        $defaultDate = if ($anoAba -ne "") { "$anoAba-$monthNum-01" } else { "2026-01-01" }
        $lastValidDate = $defaultDate

        $txCount = 0
        for ($r = $headerRowIdx + 1; $r -le $totalRows; $r++) {
            # Entrada / Saida
            $fluxo = "N/D"
            foreach ($hk in @("entradasaida", "entrada/saida", "entradasada")) {
                if ($colMap.ContainsKey($hk)) {
                    $temp = $sheet.Cells.Item($r, $colMap[$hk]).Value2
                    if ($null -ne $temp) { $fluxo = $temp.ToString().Trim(); break }
                }
            }

            # Valor (coluna "R$(Valores)")
            $valorNominal = 0.0
            foreach ($hk in @("rvalores", "rsvalores", "rvalores", "valores")) {
                if ($colMap.ContainsKey($hk)) {
                    $temp = $sheet.Cells.Item($r, $colMap[$hk]).Value2
                    if ($null -ne $temp) {
                        if ($temp -is [double] -or $temp -is [decimal] -or $temp -is [int] -or $temp -is [float]) {
                            $valorNominal = [double]$temp
                        } else {
                            $valStr = $temp.ToString().Trim()
                            if ($valStr -match "^-?\d+,\d+$") { $valStr = $valStr -replace ",", "." }
                            elseif ($valStr -contains "." -and $valStr -contains ",") { $valStr = $valStr -replace "\.", "" -replace ",", "." }
                            $valNum = 0.0
                            if ([double]::TryParse($valStr, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$valNum)) {
                                $valorNominal = $valNum
                            }
                        }
                        break
                    }
                }
            }

            # Se não tiver valor nominal e o fluxo for N/D, pular linha
            if ($valorNominal -eq 0.0 -and ($fluxo -eq "N/D" -or $null -eq $fluxo -or $fluxo -eq "")) { continue }

            # Data
            $dataStr = ""
            if ($colMap.ContainsKey("data")) {
                $dataVal = $sheet.Cells.Item($r, $colMap["data"]).Value2
                if ($null -ne $dataVal -and $dataVal.ToString().Trim() -ne "") {
                    $dataStr = Parse-ExcelDate-TD $dataVal
                }
            }
            if ($dataStr -and $dataStr -match "^\d{4}-\d{2}-\d{2}$") {
                $lastValidDate = $dataStr
            } else {
                $dataStr = $lastValidDate
            }

            # UF
            $uf = "RS"
            if ($colMap.ContainsKey("uf")) {
                $temp = $sheet.Cells.Item($r, $colMap["uf"]).Value2
                if ($null -ne $temp -and $temp.ToString().Trim() -ne "") { $uf = $temp.ToString().Trim().ToUpper() }
            }

            # Categoria (coluna "d" na Tecnodrill)
            $categoria = "Outros"
            foreach ($hk in @("d", "movimento", "receitasdespesas", "categoria")) {
                if ($colMap.ContainsKey($hk)) {
                    $temp = $sheet.Cells.Item($r, $colMap[$hk]).Value2
                    if ($null -ne $temp -and $temp.ToString().Trim() -ne "") { $categoria = $temp.ToString().Trim(); break }
                }
            }

            # Descricao (coluna "Coluna1" na Tecnodrill)
            $descricao = ""
            foreach ($hk in @("coluna1", "descricao", "detalhamento")) {
                if ($colMap.ContainsKey($hk)) {
                    $temp = $sheet.Cells.Item($r, $colMap[$hk]).Value2
                    if ($null -ne $temp -and $temp.ToString().Trim() -ne "") { $descricao = $temp.ToString().Trim(); break }
                }
            }

            # Meio de Pagamento
            $meioPagamento = "Outros"
            foreach ($hk in @("tipotransacao", "tipotransao", "tipo")) {
                if ($colMap.ContainsKey($hk)) {
                    $temp = $sheet.Cells.Item($r, $colMap[$hk]).Value2
                    if ($null -ne $temp -and $temp.ToString().Trim() -ne "") {
                        $meioPagamento = $temp.ToString().Trim()
                        if ($meioPagamento.ToUpper() -eq "PIX") { $meioPagamento = "Pix" }
                        break
                    }
                }
            }

            # Valor Liquido (sinalizado)
            $valorLiquido = $valorNominal
            $saida_str = "Sa" + $i_acute + "da"
            if ($fluxo -eq $saida_str) { $valorLiquido = -$valorNominal }

            # Transferencia
            $isTransfer = $false
            $trans_str = "Transfer" + $e_circumflex + "ncia entre contas"
            if ($categoria -eq $trans_str) { $isTransfer = $true }

            $txObj = [PSCustomObject]@{
                id              = "$($name.Replace(' ','_'))_$($r)"
                banco           = "SICOOB"
                aba             = $name.Trim()
                remessa         = "MANUAL"
                competencia     = $competenciaAba
                data            = $dataStr
                uf              = $uf
                fluxo           = $fluxo
                categoria       = $categoria
                descricao       = $descricao
                valor_nominal   = [Math]::Round($valorNominal, 2)
                valor_liquido   = [Math]::Round($valorLiquido, 2)
                meio_pagamento  = $meioPagamento
                is_transfer     = $isTransfer
            }

            $allTransactions += $txObj
            $txCount++
        }
        Write-Output "  -> $($txCount) transacoes extraidas."
    }

    # Gerar tecnodrill_data.js
    Write-Output "Gerando tecnodrill_data.js com $($allTransactions.Count) lancamentos..."

    $payload = [PSCustomObject]@{
        generated_at       = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        empresa            = "Tecnodrill"
        categories_origin  = [PSCustomObject]@{
            entradas = $categoriasEntrada
            saidas   = $categoriasSaida
            tipos    = $tiposTransacao
        }
        transactions = $allTransactions
    }

    $jsonStr = $payload | ConvertTo-Json -Depth 6
    $jsContent = "window.TECNODRILL_DATA = " + $jsonStr + ";"
    $jsContent | Out-File -FilePath "$PSScriptRoot\tecnodrill_data.js" -Encoding utf8

    Write-Output "Tecnodrill ETL finalizado! tecnodrill_data.js gerado com sucesso."

    # Staging para git (o commit/push e feito pelo update_dashboard.ps1 em seguida)
    $gitPath = "C:\Program Files\Git\cmd\git.exe"
    if (Test-Path $gitPath) {
        $gitStatus = & $gitPath status --porcelain tecnodrill_data.js
        if ($null -ne $gitStatus -and $gitStatus.ToString().Trim() -ne "") {
            Write-Output "Adicionando tecnodrill_data.js ao staging area..."
            & $gitPath add tecnodrill_data.js
            Write-Output "tecnodrill_data.js adicionado. Commit sera feito pelo update_dashboard.ps1."
        } else {
            Write-Output "Sem novas alteracoes em tecnodrill_data.js."
        }
    }

} catch {
    Write-Error "Erro no ETL Tecnodrill: $($_.Exception.Message)"
} finally {
    if ($null -ne $workbook) { $workbook.Close($false) }
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    if (Test-Path $localTempPath) { Remove-Item -Path $localTempPath -Force }
}
