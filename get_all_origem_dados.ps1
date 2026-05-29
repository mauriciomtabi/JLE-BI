$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$filePath = "C:\Users\jlema\.gemini\antigravity\scratch\fluxo_caixa_mapping\local_file.xlsx"
$workbook = $excel.Workbooks.Open($filePath, 0, $true) # Read-only
try {
    $sheet = $workbook.Worksheets.Item("Origem de Dados ")
    $usedRange = $sheet.UsedRange
    $rowCount = $usedRange.Rows.Count
    $colCount = $usedRange.Columns.Count
    
    $grid = @()
    for ($r = 1; $r -le $rowCount; $r++) {
        $rowValues = @()
        for ($c = 1; $c -le $colCount; $c++) {
            $cell = $usedRange.Cells.Item($r, $c)
            $val = $cell.Value2
            if ($val -eq $null) {
                $rowValues += ""
            } else {
                $rowValues += $val.ToString()
            }
        }
        $grid += ,$rowValues
    }
    
    $data = [PSCustomObject]@{
        Name = $sheet.Name
        RowCount = $rowCount
        ColCount = $colCount
        Data = $grid
    }
    
    $data | ConvertTo-Json -Depth 4 | Out-File -FilePath "origem_dados_full.json" -Encoding utf8
    Write-Output "Full Origem de Dados sheet read and written to origem_dados_full.json"
} catch {
    Write-Error $_.Exception.Message
} finally {
    $workbook.Close($false)
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
