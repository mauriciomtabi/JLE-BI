$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$filePath = "C:\Users\jlema\.gemini\antigravity\scratch\fluxo_caixa_mapping\local_file.xlsx"
$workbook = $excel.Workbooks.Open($filePath, 0, $true) # Read-only
try {
    $sheetsToInspect = @("JAN_2026 BRADESCO ", "MAI_2026 MAXCREDITO ")
    
    foreach ($sheetName in $sheetsToInspect) {
        $sheet = $workbook.Worksheets.Item($sheetName)
        $headerRow = 10 # 1-based, which corresponds to Row 9 in 0-based index
        
        Write-Output "=================================================="
        Write-Output "SHEET: $sheetName"
        Write-Output "=================================================="
        
        $colCount = $sheet.UsedRange.Columns.Count
        $headers = @()
        for ($c = 1; $c -le $colCount; $c++) {
            $headers += $sheet.Cells.Item($headerRow, $c).Value2
        }
        
        for ($r = 11; $r -le 13; $r++) {
            Write-Output "Row $(${r}):"
            for ($c = 1; $c -le $colCount; $c++) {
                $hName = $headers[$c - 1]
                if ($null -eq $hName -or $hName.ToString().Trim() -eq "") {
                    continue
                }
                
                $cell = $sheet.Cells.Item($r, $c)
                $val = $cell.Value2
                $formula = $cell.Formula
                
                if ($formula.StartsWith("=")) {
                    Write-Output "  Col $(${c}) ($hName): Val='$val', Formula='$formula'"
                } else {
                    Write-Output "  Col $(${c}) ($hName): Val='$val' (Static)"
                }
            }
        }
    }
} catch {
    Write-Error $_.Exception.Message
} finally {
    $workbook.Close($false)
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
