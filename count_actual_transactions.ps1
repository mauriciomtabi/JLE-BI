$detailJson = Get-Content -Raw -Path "sheets_detail.json" | ConvertFrom-Json
$summaryJson = Get-Content -Raw -Path "sheets_analysis_summary.json" | ConvertFrom-Json

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

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$filePath = "C:\Users\jlema\.gemini\antigravity\scratch\fluxo_caixa_mapping\local_file.xlsx"
$workbook = $excel.Workbooks.Open($filePath, 0, $true) # Read-only

try {
    $results = @()
    
    foreach ($summarySheet in $summaryJson) {
        $sheetName = $summarySheet.Name
        $headerRowIndex = $summarySheet.HeaderRowIndex
        
        if ($headerRowIndex -eq -1) {
            continue
        }
        
        $sheet = $workbook.Worksheets.Item($sheetName)
        $usedRange = $sheet.UsedRange
        $totalRows = $usedRange.Rows.Count
        $totalCols = $usedRange.Columns.Count
        
        # Read the headers
        $headers = @()
        for ($c = 1; $c -le $totalCols; $c++) {
            $headers += $sheet.Cells.Item($headerRowIndex + 1, $c).Value2
        }
        
        # Map normalized header names to column index
        $colMap = @{}
        for ($c = 0; $c -lt $headers.Count; $c++) {
            if ($headers[$c] -ne $null) {
                $hName = $headers[$c].ToString().Trim()
                $normName = Normalize-String $hName
                if ($normName -ne "") {
                    $colMap[$normName] = $c + 1 # 1-based index for Excel cells
                }
            }
        }
        
        $actualTransactionCount = 0
        $sumEntradas = 0.0
        $sumSaidas = 0.0
        $firstDate = $null
        $lastDate = $null
        
        # Loop through all rows from headerRowIndex + 2 to totalRows
        for ($r = $headerRowIndex + 2; $r -le $totalRows; $r++) {
            $dataColIdx = $colMap["data"]
            if ($null -eq $dataColIdx) {
                continue
            }
            
            $dataCellVal = $sheet.Cells.Item($r, $dataColIdx).Value2
            if ($null -eq $dataCellVal -or $dataCellVal.ToString().Trim() -eq "") {
                continue
            }
            
            $actualTransactionCount++
            
            $txDate = $dataCellVal
            if ($null -eq $firstDate) { $firstDate = $txDate }
            $lastDate = $txDate
            
            # Extract values
            $valColIdx = $colMap["rvalores"]
            $esColIdx = $colMap["entradasaida"]
            
            if ($null -ne $valColIdx -and $null -ne $esColIdx) {
                $valStr = $sheet.Cells.Item($r, $valColIdx).Value2
                $esStr = $sheet.Cells.Item($r, $esColIdx).Value2
                
                if ($null -ne $valStr -and $valStr.ToString().Trim() -ne "") {
                    $valNum = 0.0
                    if ([double]::TryParse($valStr.ToString(), [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$valNum)) {
                        # Parsed successfully
                    } elseif ([double]::TryParse($valStr.ToString(), [System.Globalization.NumberStyles]::Any, (New-Object System.Globalization.CultureInfo("pt-BR")), [ref]$valNum)) {
                        # Parsed with Brazilian culture
                    }
                    
                    if ($esStr -ne $null) {
                        $esNorm = Normalize-String $esStr.ToString()
                        if ($esNorm -eq "entrada") {
                            $sumEntradas += $valNum
                        } elseif ($esNorm -eq "saida") {
                            $sumSaidas += $valNum
                        }
                    }
                }
            }
        }
        
        # Convert Excel date serial to date string if numeric
        $firstDateStr = $null
        $lastDateStr = $null
        
        filter Parse-ExcelDate ($excelDate) {
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
        
        $firstDateStr = Parse-ExcelDate $firstDate
        $lastDateStr = Parse-ExcelDate $lastDate
        
        $results += [PSCustomObject]@{
            Name = $sheetName
            Visible = $summarySheet.Visible
            DeclaredRows = $totalRows
            ActualTransactions = $actualTransactionCount
            SumEntradas = [Math]::Round($sumEntradas, 2)
            SumSaidas = [Math]::Round($sumSaidas, 2)
            FirstDate = $firstDateStr
            LastDate = $lastDateStr
        }
        
        Write-Output "Analyzed sheet $($sheetName): $($actualTransactionCount) transactions"
    }
    
    $results | ConvertTo-Json -Depth 4 | Out-File -FilePath "transaction_volume_summary.json" -Encoding utf8
    Write-Output "Transaction volume summary written to transaction_volume_summary.json"
    
} catch {
    Write-Error $_.Exception.Message
} finally {
    $workbook.Close($false)
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
