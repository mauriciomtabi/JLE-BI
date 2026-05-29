$json = Get-Content -Raw -Path "origem_dados_full.json" | ConvertFrom-Json
$rows = $json.Data

$entradas = @()
$saidas = @()
$tipos = @()

# Start from row 1 (index 1) to skip the headers on row 0
for ($i = 1; $i -lt $rows.Count; $i++) {
    $row = $rows[$i]
    
    if ($row[0] -ne $null -and $row[0].ToString().Trim() -ne "") {
        $entradas += $row[0].ToString().Trim()
    }
    if ($row[2] -ne $null -and $row[2].ToString().Trim() -ne "") {
        $saidas += $row[2].ToString().Trim()
    }
    if ($row[4] -ne $null -and $row[4].ToString().Trim() -ne "") {
        $tipos += $row[4].ToString().Trim()
    }
}

Write-Output "=================================================="
Write-Output "ENTRADAS:"
Write-Output "=================================================="
foreach ($e in $entradas) { Write-Output "  - $e" }

Write-Output ""
Write-Output "=================================================="
Write-Output "SAÍDAS:"
Write-Output "=================================================="
foreach ($s in $saidas) { Write-Output "  - $s" }

Write-Output ""
Write-Output "=================================================="
Write-Output "TIPO TRANSAÇÃO:"
Write-Output "=================================================="
foreach ($t in $tipos) { Write-Output "  - $t" }
