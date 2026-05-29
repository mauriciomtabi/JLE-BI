$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$filePath = "C:\Users\jlema\.gemini\antigravity\scratch\fluxo_caixa_mapping\local_file.xlsx"
$workbook = $excel.Workbooks.Open($filePath, 0, $true) # Read-only
try {
    $allSheetsData = @()
    foreach ($sheet in $workbook.Worksheets) {
        $usedRange = $sheet.UsedRange
        $rowCount = $usedRange.Rows.Count
        $colCount = $usedRange.Columns.Count
        
        # Read the top 50 rows of data (or all if less) to analyze headers and structure
        $maxRowsToRead = [System.Math]::Min(50, $rowCount)
        $maxColsToRead = [System.Math]::Min(30, $colCount)
        
        $grid = @()
        for ($r = 1; $r -le $maxRowsToRead; $r++) {
            $rowValues = @()
            for ($c = 1; $c -le $maxColsToRead; $c++) {
                $cell = $usedRange.Cells.Item($r, $c)
                $val = $cell.Value2
                # format value if date or null
                if ($val -eq $null) {
                    $rowValues += ""
                } else {
                    $rowValues += $val.ToString()
                }
            }
            $grid += ,$rowValues
        }
        
        $sheetData = [PSCustomObject]@{
            Name = $sheet.Name
            RowCount = $rowCount
            ColCount = $colCount
            Visible = $sheet.Visible
            SampleData = $grid
        }
        $allSheetsData += $sheetData
        Write-Output "Processed sheet: $($sheet.Name) ($rowCount rows x $colCount cols)"
    }
    
    $allSheetsData | ConvertTo-Json -Depth 5 | Out-File -FilePath "sheets_detail.json" -Encoding utf8
    Write-Output "Metadata and sample data successfully exported to sheets_detail.json"
} catch {
    Write-Error $_.Exception.Message
} finally {
    $workbook.Close($false)
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
