$json = Get-Content -Raw -Path "sheets_detail.json" | ConvertFrom-Json

foreach ($sheet in $json) {
    Write-Output "=================================================="
    Write-Output "SHEET: $($sheet.Name)"
    Write-Output "Dimensions: $($sheet.RowCount) rows x $($sheet.ColCount) columns"
    Write-Output "Visible: $($sheet.Visible)"
    Write-Output "--------------------------------------------------"
    
    $sample = $sheet.SampleData
    $rowCount = $sample.Count
    $colCount = 0
    if ($rowCount -gt 0) {
        $colCount = $sample[0].Count
    }
    
    Write-Output "First 5 rows (truncated to first 12 columns):"
    for ($r = 0; $r -le [System.Math]::Min(4, $rowCount -1); $r++) {
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
