$userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
$sysPath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
$env:Path = "$userPath;$sysPath;$env:Path"
# Script ETL para consolidar as planilhas de Fluxo de Caixa da Tecnodrill
# Le a planilha TECONDRILL da rede, gera tecnodrill_data.js para o dashboard.

$c_cedilla = [char]231
$e_acute = [char]233
$a_tilde = [char]227
$i_acute = [char]237
$a_acute = [char]225
$e_circumflex = [char]234
$c_cedilla_caps = [char]199

# Diretórios candidatos ORDENADOS POR PRIORIDADE (FLUXO CAIXA primeiro)
$primaryDir = "\\10.121.21.252\financeiro\Angelita\2026\TECNODRILL\FLUXO CAIXA"
$fallbackDirs = @(
    "\\10.121.21.252\financeiro\Angelita\2026\FLUXO DIARIO",
    "\\10.121.21.252\financeiro\Angelita\2026\TECNODRILL",
    "\\10.121.21.252\financeiro\Angelita\2026\FLUXO DIARIO\PLANILHAS ANTIGAS"
)
$localTempPath = "$PSScriptRoot\temp_tecnodrill.xlsx"
$fallbackPath = "$PSScriptRoot\tecnodrill_local.xlsx"

# Configuracao para Planilha de Caixa (Carlos e Denilson)
$caixaPrimaryDir = "\\10.121.21.252\financeiro\Angelita\2026\TECNODRILL\CARLOS\CAIXA_BI"
$caixaFallbackDirs = @(
    "\\10.121.21.252\financeiro\Angelita\2026\TECNODRILL\CARLOS",
    "\\10.121.21.252\financeiro\Angelita\2026\TECNODRILL"
)
$caixaLocalTempPath = "$PSScriptRoot\temp_tecnodrill_caixa.xlsx"
$caixaFallbackPath = "$PSScriptRoot\tecnodrill_caixa_local.xlsx"
$caixaWorkbook = $null

Write-Output "======================================================="
Write-Output "Iniciando download da planilha Tecnodrill da rede..."
Write-Output "======================================================="

$useFile = $null
$networkPath = $null
$foundFiles = @()

# Filtro de nome de arquivo para Tecnodrill
$fileFilter = {
    ($_.Name -match "Fluxo de Caixa Anal.*tico TEC.*NDRILL.*\.xlsx$" -or $_.Name -like "*TECONDRILL*.xlsx" -or $_.Name -like "*TECNODRILL*.xlsx") -and
    $_.Name -notlike "~$*" -and
    $_.Name -notlike "*Confer*" -and
    $_.Name -notlike "*Revisado*"
}

# 1. Buscar primeiro no diretorio primario (FLUXO CAIXA)
if (Test-Path $primaryDir) {
    try {
        $files = Get-ChildItem -Path $primaryDir -Filter "*.xlsx" -ErrorAction SilentlyContinue | Where-Object $fileFilter
        if ($null -ne $files) { $foundFiles += $files }
    } catch {
        Write-Warning "Falha ao inspecionar diretorio primario: $($_.Exception.Message)"
    }
}

# 2. Se nao encontrou no primario, buscar nos fallbacks
if ($foundFiles.Count -eq 0) {
    foreach ($dir in $fallbackDirs) {
        if (Test-Path $dir) {
            try {
                $files = Get-ChildItem -Path $dir -Filter "*.xlsx" -ErrorAction SilentlyContinue | Where-Object $fileFilter
                if ($null -ne $files) { $foundFiles += $files }
            } catch {
                Write-Warning "Falha ao inspecionar diretorio $dir : $($_.Exception.Message)"
            }
        }
    }
}

if ($foundFiles.Count -gt 0) {
    $networkFile = $foundFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $networkPath = $networkFile.FullName
    Write-Output "Arquivo Tecnodrill selecionado: $networkPath (Modificado em: $($networkFile.LastWriteTime))"
    try {
        Write-Output "Copiando planilha da rede localmente..."
        Copy-Item -Path $networkPath -Destination $localTempPath -Force
        Copy-Item -Path $networkPath -Destination $fallbackPath -Force
        $useFile = $localTempPath
        Write-Output "Copia realizada com sucesso e cache local sincronizado."
    } catch {
        Write-Warning "Falha ao copiar da rede: $($_.Exception.Message)"
    }
} else {
    Write-Warning "Nenhum arquivo Tecnodrill encontrado nos diretorios de rede consultados."
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

function Get-Caixa-Category ($desc, $fluxo) {
    if ($fluxo -eq "Entrada") { return "Aporte de Caixa" }
    $d = if ($null -ne $desc) { $desc.ToString().ToUpper() } else { "" }
    if ($d -match "DIESEL|COMBUST|GASOLINA|POSTO|ALCOOL") { return ("Combust" + $i_acute + "vel") }
    if ($d -match "REFEI|ALMO|JANTA|CAF|LANCH|CHURRAS|RESTAUR|PIZZ|XIS|PADARIA|ACAI|SORVETE") { return ("Alimenta" + $c_cedilla + $a_tilde + "o") }
    if ($d -match "HOTEL|HOSPEDAGEM|POUSADA|DIARIA") { return "Hospedagem" }
    if ($d -match "PEDAGIO|RODOVIARIA|EGR") { return ("Ped" + $a_acute + "gio") }
    if ($d -match "UBER|PASSAGEM|TRANSPORTE|DESLOCAMENTO") { return "Transporte / Uber" }
    if ($d -match "MANUTEN|VIDRO|AUTO CENTER|PNEU|CHAVE|MECANIC|PECA|OFICINA|COMPACTA") { return ("Manuten" + $c_cedilla + $a_tilde + "o Veicular") }
    if ($d -match "EPI|CREDENCIAL|SEGURAN") { return ("EPIs e Seguran" + $c_cedilla + "a") }
    if ($d -match "MOVEIS|COLCH|CAFETEIRA|MERCADO|HAVAN|LIMPEZA") { return "Alojamento e Suprimentos" }
    return "Outros e Diversos"
}

function Parse-Caixa-Number ($val) {
    if ($null -eq $val) { return 0.0 }
    if ($val -is [double] -or $val -is [decimal] -or $val -is [int] -or $val -is [float] -or $val -is [int64]) {
        return [double]$val
    }
    $valStr = $val.ToString().Trim() -replace "R\$", "" -replace "\s", ""
    if ($valStr -eq "" -or $valStr -eq "-") { return 0.0 }
    if ($valStr -match "\." -and $valStr -match ",") {
        $valStr = $valStr -replace "\.", "" -replace ",", "."
    } else {
        $valStr = $valStr -replace ",", "."
    }
    $num = 0.0
    if ([double]::TryParse($valStr, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$num)) {
        return $num
    }
    return 0.0
}

function Parse-Caixa-Date ($excelDate, $textDate) {
    if ($null -ne $excelDate) {
        $doubleVal = 0.0
        if ([double]::TryParse($excelDate.ToString(), [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$doubleVal)) {
            try {
                $dt = [System.DateTime]::FromOADate($doubleVal)
                return @{
                    iso = $dt.ToString("yyyy-MM-dd")
                    fmt = $dt.ToString("dd/MM/yyyy")
                    monthNum = $dt.Month
                    year = $dt.Year
                }
            } catch {}
        }
    }
    if ($null -ne $textDate -and $textDate.Trim() -ne "") {
        $t = $textDate.Trim()
        if ($t -match "^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$") {
            $d = [int]$Matches[1]
            $m = [int]$Matches[2]
            $y = [int]$Matches[3]
            try {
                $dt = New-Object System.DateTime($y, $m, $d)
                return @{
                    iso = $dt.ToString("yyyy-MM-dd")
                    fmt = $dt.ToString("dd/MM/yyyy")
                    monthNum = $dt.Month
                    year = $dt.Year
                }
            } catch {}
        }
    }
    return @{
        iso = ""
        fmt = if ($null -ne $textDate) { $textDate.Trim() } else { "" }
        monthNum = 0
        year = 2026
    }
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
        if ($name -match "(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGOS|AGO|SET|OUT|NOV|DEZ)") {
            $mesCode = $Matches[1]
            switch ($mesCode) {
                "JAN" { $mesAba = "JANEIRO" }
                "FEV" { $mesAba = "FEVEREIRO" }
                "MAR" { $mesAba = "MAR" + $c_cedilla_caps + "O" }
                "ABR" { $mesAba = "ABRIL" }
                "MAI" { $mesAba = "MAIO" }
                "JUN" { $mesAba = "JUNHO" }
                "JUL" { $mesAba = "JULHO" }
                "AGOS" { $mesAba = "AGOSTO" }
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

    # Fechar pasta de trabalho principal para liberar memoria
    if ($null -ne $workbook) {
        $workbook.Close($false)
        $workbook = $null
    }

    # =======================================================
    # Processar Planilha de Caixa (Carlos e Denilson)
    # =======================================================
    Write-Output "======================================================="
    Write-Output "Iniciando download da planilha de Caixa (Carlos e Denilson)..."
    Write-Output "======================================================="

    $useCaixaFile = $null
    $foundCaixaFiles = @()
    $caixaFileFilter = {
        ($_.Name -match "CAIXA.*TECNODRILL.*\.xlsx$" -or $_.Name -like "*CAIXA*.xlsx") -and
        $_.Name -notlike "~$*"
    }

    if (Test-Path $caixaPrimaryDir) {
        try {
            $cFiles = Get-ChildItem -Path $caixaPrimaryDir -Filter "*.xlsx" -ErrorAction SilentlyContinue | Where-Object $caixaFileFilter
            if ($null -ne $cFiles) { $foundCaixaFiles += $cFiles }
        } catch {
            Write-Warning "Falha ao consultar diretorio primario de caixa: $($_.Exception.Message)"
        }
    }

    if ($foundCaixaFiles.Count -eq 0) {
        foreach ($d in $caixaFallbackDirs) {
            if (Test-Path $d) {
                try {
                    $cFiles = Get-ChildItem -Path $d -Filter "*.xlsx" -ErrorAction SilentlyContinue | Where-Object $caixaFileFilter
                    if ($null -ne $cFiles) { $foundCaixaFiles += $cFiles }
                } catch {
                    Write-Warning "Falha ao consultar diretorio fallback de caixa: $($_.Exception.Message)"
                }
            }
        }
    }

    if ($foundCaixaFiles.Count -gt 0) {
        $caixaNetworkFile = $foundCaixaFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        $caixaNetPath = $caixaNetworkFile.FullName
        Write-Output "Arquivo de Caixa selecionado: $caixaNetPath (Modificado em: $($caixaNetworkFile.LastWriteTime))"
        try {
            Copy-Item -Path $caixaNetPath -Destination $caixaLocalTempPath -Force
            Copy-Item -Path $caixaNetPath -Destination $caixaFallbackPath -Force
            $useCaixaFile = $caixaLocalTempPath
            Write-Output "Planilha de Caixa copiada localmente e cache sincronizado."
        } catch {
            Write-Warning "Falha ao copiar planilha de Caixa da rede: $($_.Exception.Message)"
        }
    }

    if ($null -eq $useCaixaFile) {
        if (Test-Path $caixaFallbackPath) {
            Write-Output "Usando planilha de Caixa em cache local: $caixaFallbackPath"
            $useCaixaFile = $caixaFallbackPath
        } else {
            Write-Warning "Planilha de Caixa nao encontrada na rede nem no cache local."
        }
    }

    $caixaPayload = [PSCustomObject]@{
        gerado_em = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        carlos    = @()
        denilson  = @()
    }

    if ($null -ne $useCaixaFile -and (Test-Path $useCaixaFile)) {
        Write-Output "Abrindo planilha de Caixa..."
        $caixaWorkbook = $excel.Workbooks.Open($useCaixaFile, 0, $true)

        $mesMapNum = @{
            1="JANEIRO"; 2="FEVEREIRO"; 3=("MAR" + $c_cedilla_caps + "O"); 4="ABRIL";
            5="MAIO"; 6="JUNHO"; 7="JULHO"; 8="AGOSTO";
            9="SETEMBRO"; 10="OUTUBRO"; 11="NOVEMBRO"; 12="DEZEMBRO"
        }

        foreach ($person in @("carlos", "denilson")) {
            $sName = $person.ToUpper()
            $cWs = $null
            foreach ($sheet in $caixaWorkbook.Worksheets) {
                if ($sheet.Name.Trim().ToUpper() -eq $sName) {
                    $cWs = $sheet
                    break
                }
            }

            if ($null -eq $cWs) {
                Write-Warning "Aba '$sName' nao encontrada na planilha de Caixa."
                continue
            }

            Write-Output "Processando Caixa de $person (Aba $sName)..."
            $cTotalRows = $cWs.UsedRange.Rows.Count
            $pList = @()
            $pIdx = 0

            for ($r = 5; $r -le $cTotalRows; $r++) {
                $dtVal = $cWs.Cells.Item($r, 2).Value2
                $dtText = $cWs.Cells.Item($r, 2).Text
                $cVal = $cWs.Cells.Item($r, 3).Value2
                $dVal = $cWs.Cells.Item($r, 4).Value2
                $sVal = $cWs.Cells.Item($r, 5).Value2
                $descText = $cWs.Cells.Item($r, 6).Text

                $hasData = (($null -ne $dtText -and $dtText.Trim() -ne "") -or 
                            ($null -ne $cVal -and $cVal -ne 0) -or 
                            ($null -ne $dVal -and $dVal -ne 0) -or 
                            ($null -ne $descText -and $descText.Trim() -ne ""))

                if (-not $hasData) { continue }

                $dtInfo = Parse-Caixa-Date $dtVal $dtText
                $comp = if ($dtInfo.monthNum -gt 0) { "$($mesMapNum[$dtInfo.monthNum])/$($dtInfo.year)" } else { "OUTROS" }

                $cred = Parse-Caixa-Number $cVal
                $deb = Parse-Caixa-Number $dVal
                $saldo = Parse-Caixa-Number $sVal

                $fluxo = if ($cred -gt 0) { "Entrada" } else { ("Sa" + $i_acute + "da") }
                $valor = if ($fluxo -eq "Entrada") { $cred } else { $deb }
                $categoria = Get-Caixa-Category $descText $fluxo

                $pIdx++
                $txCaixa = [PSCustomObject]@{
                    id             = "$person-$pIdx"
                    linha          = $r
                    responsavel    = if ($person -eq "carlos") { "Carlos" } else { "Denilson" }
                    data           = $dtInfo.iso
                    data_fmt       = $dtInfo.fmt
                    competencia    = $comp
                    fluxo          = $fluxo
                    categoria      = $categoria
                    credito        = [Math]::Round($cred, 2)
                    debito         = [Math]::Round($deb, 2)
                    valor          = [Math]::Round($valor, 2)
                    saldo          = [Math]::Round($saldo, 2)
                    descricao      = if ($null -ne $descText) { $descText.Trim() } else { "" }
                }
                $pList += $txCaixa
            }

            if ($person -eq "carlos") {
                $caixaPayload.carlos = $pList
            } else {
                $caixaPayload.denilson = $pList
            }
            Write-Output "  -> Caixa de $($person): $($pList.Count) lancamentos extraidos."
        }

        $caixaWorkbook.Close($false)
        $caixaWorkbook = $null
    }

    # Gerar tecnodrill_data.js
    Write-Output "Gerando tecnodrill_data.js com $($allTransactions.Count) lancamentos principais e $($caixaPayload.carlos.Count + $caixaPayload.denilson.Count) lancamentos de caixa..."

    $payload = [PSCustomObject]@{
        generated_at       = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        empresa            = "Tecnodrill"
        categories_origin  = [PSCustomObject]@{
            entradas = $categoriasEntrada
            saidas   = $categoriasSaida
            tipos    = $tiposTransacao
        }
        transactions = $allTransactions
        caixa        = $caixaPayload
    }

    $jsonStr = $payload | ConvertTo-Json -Depth 6
    $jsContent = "window.TECNODRILL_DATA = " + $jsonStr + ";"
    [System.IO.File]::WriteAllText("$PSScriptRoot\tecnodrill_data.js", $jsContent, [System.Text.Encoding]::UTF8)

    Write-Output "Tecnodrill ETL finalizado! tecnodrill_data.js gerado com sucesso."

    # 6. Publicar atualizações no GitHub se houver alterações em tecnodrill_data.js
    Write-Output "Verificando se houve alteracoes em tecnodrill_data.js para publicar no GitHub..."
    $gitPath = if (Test-Path "C:\Program Files\Git\cmd\git.exe") { "C:\Program Files\Git\cmd\git.exe" } elseif (Test-Path "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe") { "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe" } else { (Get-Command git -ErrorAction SilentlyContinue).Source }
    if (Test-Path $gitPath) {
        $gitStatus = & $gitPath status --porcelain tecnodrill_data.js
        if ($null -ne $gitStatus -and $gitStatus.ToString().Trim() -ne "") {
            Write-Output "Novas alteracoes detectadas em tecnodrill_data.js! Atualizando a versao do Cache no Service Worker (sw.js)..."
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
            & $gitPath add tecnodrill_data.js sw.js
            & $gitPath commit -m "data(auto): atualizacao automatica de dados Tecnodrill e cache do PWA"
            & $gitPath push origin main
            Write-Output "Dados Tecnodrill e Service Worker publicados com sucesso no GitHub!"
        } else {
            Write-Output "Sem novas alteracoes em tecnodrill_data.js. Nenhuma publicacao necessaria."
        }
    } else {
        Write-Warning "Executavel do Git nao encontrado em '$gitPath'."
    }

} catch {
    Write-Error "Erro no ETL Tecnodrill: $($_.Exception.Message)"
} finally {
    if ($null -ne $workbook) { $workbook.Close($false) }
    if ($null -ne $caixaWorkbook) { $caixaWorkbook.Close($false) }
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    if (Test-Path $localTempPath) { Remove-Item -Path $localTempPath -Force }
    if (Test-Path $caixaLocalTempPath) { Remove-Item -Path $caixaLocalTempPath -Force }
}
