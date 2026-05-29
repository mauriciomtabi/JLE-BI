$detailJson = Get-Content -Raw -Path "sheets_detail.json" | ConvertFrom-Json
$summaryJson = Get-Content -Raw -Path "sheets_analysis_summary.json" | ConvertFrom-Json

foreach ($sheet in $detailJson) {
    $summarySheet = $summaryJson | Where-Object { $_.Name -eq $sheet.Name }
    if ($null -eq $summarySheet -or $summarySheet.HeaderRowIndex -eq -1) {
        continue
    }
    
    $headerRowIndex = $summarySheet.HeaderRowIndex
    $sample = $sheet.SampleData
    $headers = $sample[$headerRowIndex]
    
    Write-Output "=================================================="
    Write-Output "SHEET: $($sheet.Name)"
    Write-Output "Headers:"
    for ($c = 0; $c -lt $headers.Count; $c++) {
        if ($headers[$c] -ne $null -and $headers[$c].ToString().Trim() -ne "") {
            Write-Output "  Col $(${c}): '$($headers[$c].ToString().Trim())'"
        }
    }
    
    Write-Output "Row 10 (First transaction row):"
    if ($sample.Count -gt ($headerRowIndex + 1)) {
        $row = $sample[$headerRowIndex + 1]
        for ($c = 0; $c -lt $row.Count; $c++) {
            if ($row[$c] -ne $null -and $row[$c].ToString().Trim() -ne "") {
                Write-Output "  Col $(${c}): '$($row[$c].ToString().Trim())'"
            }
        }
    }
    Write-Output "=================================================="
    Write-Output ""
}
