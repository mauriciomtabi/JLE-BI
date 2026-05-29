$json = Get-Content -Raw -Path "sheets_detail.json" | ConvertFrom-Json

$results = @()

foreach ($sheet in $json) {
    if ($sheet.Name -eq "Instrucoes" -or $sheet.Name -eq "Origem de Dados ") {
        continue
    }
    
    $sample = $sheet.SampleData
    $rowCount = $sheet.RowCount
    $colCount = $sheet.ColCount
    
    # Find header row
    $headerRowIndex = -1
    $headers = @()
    
    for ($r = 0; $r -lt $sample.Count; $r++) {
        $row = $sample[$r]
        $hasData = $false
        $hasEntradaSaida = $false
        foreach ($val in $row) {
            if ($val -ne $null) {
                $valStr = $val.ToString().Trim()
                if ($valStr -eq "Data") { $hasData = $true }
                if ($valStr -eq "Entrada / Saída" -or $valStr -eq "Entrada/Saída") { $hasEntradaSaida = $true }
            }
        }
        
        if ($hasData -and $hasEntradaSaida) {
            $headerRowIndex = $r
            for ($c = 0; $c -lt $row.Count; $c++) {
                $val = $row[$c]
                if ($val -ne $null) {
                    $headers += $val.ToString().Trim()
                } else {
                    $headers += ""
                }
            }
            break
        }
    }
    
    if ($headerRowIndex -eq -1) {
        for ($r = 0; $r -lt $sample.Count; $r++) {
            $row = $sample[$r]
            $hasData = $false
            foreach ($val in $row) {
                if ($val -ne $null -and $val.ToString().Trim() -eq "Data") {
                    $hasData = $true
                    break
                }
            }
            if ($hasData) {
                $headerRowIndex = $r
                for ($c = 0; $c -lt $row.Count; $c++) {
                    $val = $row[$c]
                    if ($val -ne $null) {
                        $headers += $val.ToString().Trim()
                    } else {
                        $headers += ""
                    }
                }
                break
            }
        }
    }
    
    $nonEmptyHeaders = @()
    if ($headerRowIndex -ne -1) {
        for ($c = 0; $c -lt $headers.Count; $c++) {
            if ($headers[$c] -ne "") {
                $nonEmptyHeaders += "$(${c}): $($headers[$c])"
            }
        }
    }
    
    $sheetSummary = [PSCustomObject]@{
        Name = $sheet.Name
        Visible = $sheet.Visible
        TotalRows = $rowCount
        TotalCols = $colCount
        HeaderRowIndex = $headerRowIndex
        Headers = $nonEmptyHeaders
    }
    $results += $sheetSummary
}

$results | ConvertTo-Json -Depth 4 | Out-File -FilePath "sheets_analysis_summary.json" -Encoding utf8
Write-Output "Summarized analysis written to sheets_analysis_summary.json"
