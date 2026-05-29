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
    # Replace non-alphanumeric with nothing, convert to lowercase
    $clean = $sb.ToString().ToLower()
    $clean = $clean -replace "[^a-z0-9]", ""
    return $clean
}

$detailJson = Get-Content -Raw -Path "sheets_detail.json" | ConvertFrom-Json
$summaryJson = Get-Content -Raw -Path "sheets_analysis_summary.json" | ConvertFrom-Json

$uniqueEntradaSaida = [System.Collections.Generic.HashSet[string]]::new()
$uniqueCategorias = [System.Collections.Generic.HashSet[string]]::new()
$uniqueTipos = [System.Collections.Generic.HashSet[string]]::new()
$uniqueUFs = [System.Collections.Generic.HashSet[string]]::new()
$uniqueRemessas = [System.Collections.Generic.HashSet[string]]::new()
$uniqueCompetencias = [System.Collections.Generic.HashSet[string]]::new()

foreach ($sheet in $detailJson) {
    $summarySheet = $summaryJson | Where-Object { $_.Name -eq $sheet.Name }
    if ($null -eq $summarySheet -or $summarySheet.HeaderRowIndex -eq -1) {
        continue
    }
    
    $headerRowIndex = $summarySheet.HeaderRowIndex
    $sample = $sheet.SampleData
    $headers = $sample[$headerRowIndex]
    
    # Map normalized header names to column index
    $colMap = @{}
    for ($c = 0; $c -lt $headers.Count; $c++) {
        if ($headers[$c] -ne $null) {
            $hName = $headers[$c].ToString().Trim()
            $normName = Normalize-String $hName
            if ($normName -ne "") {
                $colMap[$normName] = $c
            }
        }
    }
    
    # Let's inspect rows starting from headerRowIndex + 1
    for ($r = $headerRowIndex + 1; $r -lt $sample.Count; $r++) {
        $row = $sample[$r]
        
        $isRowEmpty = $true
        foreach ($val in $row) {
            if ($val -ne $null -and $val.ToString().Trim() -ne "") {
                $isRowEmpty = $false
                break
            }
        }
        if ($isRowEmpty) { continue }
        
        # Helper to extract value by normalized header names
        filter Get-Val ($names) {
            foreach ($name in $names) {
                if ($colMap.ContainsKey($name)) {
                    $idx = $colMap[$name]
                    if ($idx -lt $row.Count -and $row[$idx] -ne $null) {
                        return $row[$idx].ToString().Trim()
                    }
                }
            }
            return $null
        }
        
        # 1. Entrada/Saida
        $esVal = Get-Val @("entradasaida")
        if ($esVal -ne $null -and $esVal -ne "") {
            [void]$uniqueEntradaSaida.Add($esVal)
        }
        
        # 2. Categoria
        $catVal = Get-Val @("movimento", "receitasdespesas", "fornecedores", "d")
        if ($catVal -ne $null -and $catVal -ne "") {
            [void]$uniqueCategorias.Add($catVal)
        }
        
        # 3. Tipo Transacao
        $tipoVal = Get-Val @("tipotransacao")
        if ($tipoVal -ne $null -and $tipoVal -ne "") {
            [void]$uniqueTipos.Add($tipoVal)
        }
        
        # 4. UF
        $ufVal = Get-Val @("uf")
        if ($ufVal -ne $null -and $ufVal -ne "") {
            [void]$uniqueUFs.Add($ufVal)
        }
        
        # 5. Remessa
        $remVal = Get-Val @("remessa")
        if ($remVal -ne $null -and $remVal -ne "") {
            [void]$uniqueRemessas.Add($remVal)
        }
        
        # 6. Competencia
        $compVal = Get-Val @("competencia")
        if ($compVal -ne $null -and $compVal -ne "") {
            [void]$uniqueCompetencias.Add($compVal)
        }
    }
}

$summary = [PSCustomObject]@{
    EntradaSaida = @($uniqueEntradaSaida)
    Categorias = @($uniqueCategorias)
    TiposTransacao = @($uniqueTipos)
    UFs = @($uniqueUFs)
    Remessas = @($uniqueRemessas)
    Competencias = @($uniqueCompetencias)
}

$summary | ConvertTo-Json -Depth 4 | Out-File -FilePath "unique_values.json" -Encoding utf8
Write-Output "Normalized unique values analysis written to unique_values.json"
