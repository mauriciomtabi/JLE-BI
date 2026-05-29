$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$filePath = "\\10.121.21.252\financeiro\Angelita\2026\FLUXO DIARIO\Fluxo de Caixa Analítico_Atualizado 11.05.2026.xlsx"
$workbook = $excel.Workbooks.Open($filePath, 0, $true) # Read-only
try {
    $sheetsInfo = @()
    foreach ($sheet in $workbook.Worksheets) {
        $usedRange = $sheet.UsedRange
        $rows = $usedRange.Rows.Count
        $cols = $usedRange.Columns.Count
        $info = [PSCustomObject]@{
            Name = $sheet.Name
            Rows = $rows
            Columns = $cols
            Visible = $sheet.Visible
        }
        $sheetsInfo += $info
        Write-Output "Sheet: $($sheet.Name) - Rows: $rows, Columns: $cols, Visible: $($sheet.Visible)"
    }
    $sheetsInfo | ConvertTo-Json | Out-File -FilePath "sheets_summary.json" -Encoding utf8
} catch {
    Write-Error $_.Exception.Message
} finally {
    $workbook.Close($false)
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
