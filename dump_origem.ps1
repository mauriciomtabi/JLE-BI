$json = Get-Content -Raw -Path "sheets_detail.json" | ConvertFrom-Json
$orig = $json | Where-Object { $_.Name -like "*Origem*" }

if ($null -eq $orig) {
    Write-Output "Origem de Dados sheet not found in JSON."
} else {
    Write-Output "Sheet found: '$($orig.Name)' with $($orig.RowCount) rows"
    $sample = $orig.SampleData
    for ($r = 0; $r -lt $sample.Count; $r++) {
        $row = $sample[$r]
        $rowStr = ""
        for ($c = 0; $c -lt $row.Count; $c++) {
            $val = $row[$c]
            if ($val -eq $null) { $val = "" }
            $rowStr += "[$c]: " + $val + "  |  "
        }
        Write-Output "Row $(${r}): $($rowStr)"
    }
}
