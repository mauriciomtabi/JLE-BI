$json = [System.IO.File]::ReadAllText("C:\Users\jlema\.gemini\antigravity\scratch\fluxo_caixa_mapping\data.js")

# Find unique values of "fluxo"
$matches = [regex]::Matches($json, '"fluxo":\s*"([^"]+)"')
$uniqueFluxos = @()
foreach ($m in $matches) {
    $val = $m.Groups[1].Value
    if ($uniqueFluxos -notcontains $val) { $uniqueFluxos += $val }
}

Write-Output "Unique Fluxos in data.js:"
foreach ($f in $uniqueFluxos) {
    $chars = @()
    foreach ($c in $f.ToCharArray()) { $chars += [int]$c }
    Write-Output "  $f -> Code points: $($chars -join ' ')"
}

# Find unique values of "banco"
$matchesB = [regex]::Matches($json, '"banco":\s*"([^"]+)"')
$uniqueBancos = @()
foreach ($m in $matchesB) {
    $val = $m.Groups[1].Value
    if ($uniqueBancos -notcontains $val) { $uniqueBancos += $val }
}

Write-Output "`nUnique Bancos in data.js:"
foreach ($b in $uniqueBancos) {
    $chars = @()
    foreach ($c in $b.ToCharArray()) { $chars += [int]$c }
    Write-Output "  $b -> Code points: $($chars -join ' ')"
}
