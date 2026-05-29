$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$filePath = "C:\Users\jlema\.gemini\antigravity\scratch\fluxo_caixa_mapping\local_file.xlsx"
$workbook = $excel.Workbooks.Open($filePath, 0, $true) # Read-only
try {
    $sheet = $workbook.Worksheets.Item("MAI_2026 MAXCREDITO ")
    $totalRows = $sheet.UsedRange.Rows.Count
    
    $sumEntradas = 0.0
    $sumSaidas = 0.0
    $saldoInicial = 0.0
    
    for ($r = 11; $r -le $totalRows; $r++) {
        $date = $sheet.Cells.Item($r, 4).Value2
        if ($null -eq $date -or $date.ToString().Trim() -eq "") {
            continue
        }
        
        $fluxo = $sheet.Cells.Item($r, 6).Value2
        $cat = $sheet.Cells.Item($r, 7).Value2
        $val = $sheet.Cells.Item($r, 9).Value2
        
        $valNum = [double]$val
        
        if ($cat -eq "Saldo Inicial") {
            $saldoInicial = $valNum
        } else {
            if ($fluxo -eq "Entrada") {
                $sumEntradas += $valNum
            } elseif ($fluxo -eq "Saída" -or $fluxo -eq "Saida") {
                $sumSaidas += $valNum
            }
        }
    }
    
    Write-Output "Excel Sheet Name: $($sheet.Name)"
    Write-Output "Saldo Inicial: $saldoInicial"
    Write-Output "Sum Entradas (excluding Saldo Inicial): $sumEntradas"
    Write-Output "Sum Saídas: $sumSaidas"
    Write-Output "Net Flow: $($sumEntradas - $sumSaidas)"
    Write-Output "Final Balance (Initial + Net): $($saldoInicial + $sumEntradas - $sumSaidas)"
} catch {
    Write-Error $_.Exception.Message
} finally {
    $workbook.Close($false)
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
