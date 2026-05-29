$json = Get-Content -Raw -Path "sheets_detail.json" | ConvertFrom-Json

$sheetsToInspect = @("Cartao de Crédito", "JAN_2026 CONFIANÇA", "JAN_2026 BRADESCO ", "ABR_2026 CONFIANÇA ", "MAI_2026 MAXCREDITO ")

foreach ($sheetName in $sheetsToInspect) {
    $sheet = $json | Where-Object { $_.Name -eq $sheetName }
    if ($null -eq $sheet) {
        Write-Output "Sheet not found: $sheetName"
        continue
    }
    
    Write-Output "=================================================="
    Write-Output "SHEET: $($sheet.Name)"
    Write-Output "Dimensions: $($sheet.RowCount) rows x $($sheet.ColCount) columns"
    Write-Output "--------------------------------------------------"
    
    $sample = $sheet.SampleData
    $rowCount = $sample.Count
    $colCount = 0
    if ($rowCount -gt 0) {
        $colCount = $sample[0].Count
    }
    
    Write-Output "Rows 5 to 20 (truncated to first 12 columns):"
    for ($r = 5; $r -le [System.Math]::Min(20, $rowCount -1); $r++) {
        $rowStr = ""
        for ($c = 0; $c -le [System.Math]::Min(11, $colCount -1); $c++) {
            $val = $sample[$r][$c]
            if ($val -eq $null) { $val = "[null]" }
            $rowStr += " | " + $val
        }
        Write-Output "  Row $($r): $($rowStr)"
    }
    Write-Output "=================================================="
    Write-Output ""
}
