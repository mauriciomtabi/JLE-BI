$json = Get-Content -Raw -Path "data.js"
$jsonStr = $json.Substring(25, $json.Length - 26).Trim()
$data = $jsonStr | ConvertFrom-Json
$txs = $data.transactions

$mayMaxi = $txs | Where-Object { $_.aba -like "*MAI*MAX*" }

$sumEntradas = 0.0
$sumSaidas = 0.0

foreach ($t in $mayMaxi) {
    if ($t.categoria -eq "Saldo Inicial") {
        Write-Output "Saldo Inicial: $($t.valor_nominal)"
        continue
    }
    
    if ($t.fluxo -eq "Entrada") {
        $sumEntradas += $t.valor_nominal
    } elseif ($t.fluxo -eq "Saída" -or $t.fluxo -eq "Saida") {
        $sumSaidas += $t.valor_nominal
    }
}

Write-Output "Calculated Entradas: $sumEntradas"
Write-Output "Calculated Saídas: $sumSaidas"
Write-Output "Calculated Net Flow: $($sumEntradas - $sumSaidas)"
