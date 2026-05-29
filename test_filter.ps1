$json = Get-Content -Raw -Path "data.js"
# Strip the window.CASH_FLOW_DATA = prefix and the trailing semicolon
$jsonStr = $json.Substring(25, $json.Length - 26).Trim()

$data = $jsonStr | ConvertFrom-Json
$txs = $data.transactions

Write-Output "Total Transactions: $($txs.Count)"

# Let's count Sicoob MaxiCrédito
$maxiTxs = $txs | Where-Object { $_.banco -eq "Sicoob MaxiCrédito" }
Write-Output "Sicoob MaxiCrédito Transactions: $($maxiTxs.Count)"

# Let's count by competencia in Sicoob MaxiCrédito
$groups = $maxiTxs | Group-Object competencia
foreach ($g in $groups) {
    Write-Output "  Competencia '$($g.Name)': $($g.Count) rows"
}

# Let's inspect a sample transaction
if ($maxiTxs.Count -gt 0) {
    Write-Output "`nSample Sicoob MaxiCrédito Transaction:"
    $maxiTxs[0] | Format-List
}
