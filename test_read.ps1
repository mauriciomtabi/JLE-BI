$c = Get-Content -Path "data.js" -Raw
Write-Output "Character Length: $($c.Length)"
Write-Output "First 200 characters:"
Write-Output $c.Substring(0, 200)
