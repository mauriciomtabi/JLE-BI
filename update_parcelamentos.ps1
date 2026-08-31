# update_parcelamentos.ps1
# Script ETL PowerShell para sincronização e deploy automatizado de Gestão Tributária e Impostos JLE Telecom
$workingDir = $PSScriptRoot
Write-Output "=========================================================="
Write-Output "ATUALIZACAO: GESTAO TRIBUTARIA & CONTROLE DE PARCELAMENTOS"
Write-Output "Data/Hora: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
Write-Output "=========================================================="

$pythonScript = "$workingDir\update_parcelamentos.py"

if (-not (Test-Path $pythonScript)) {
    Write-Error "Script Python nao encontrado: $pythonScript"
    exit 1
}

# 1. Executar o extrator Python
try {
    & python $pythonScript
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Falha na execucao do extrator Python de Parcelamentos."
        exit $LASTEXITCODE
    }
} catch {
    Write-Error "Erro ao invocar Python: $($_.Exception.Message)"
    exit 1
}

Write-Output "[ETL PowerShell] Extracao de dados concluida com sucesso."

# 2. Sincronização com GitHub / PWA Cache se executado individualmente
$gitPath = "C:\Program Files\Git\cmd\git.exe"
if (Test-Path $gitPath) {
    Set-Location $workingDir
    $status = & $gitPath status --porcelain parcelamentos_data.js
    if ($null -ne $status -and $status.ToString().Trim() -ne "") {
        Write-Output "Alteracao detectada em parcelamentos_data.js! Atualizando Service Worker cache (sw.js)..."
        $swPath = "$workingDir\sw.js"
        if (Test-Path $swPath) {
            try {
                $swContent = [System.IO.File]::ReadAllText($swPath)
                $timestamp = Get-Date -Format "yyyyMMddHHmmss"
                $newCacheNameLine = "const CACHE_NAME = 'jle-bi-v3.17.$timestamp';"
                $swContent = $swContent -replace "const CACHE_NAME = '([^']+)';", $newCacheNameLine
                $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                [System.IO.File]::WriteAllText($swPath, $swContent, $utf8NoBom)
                Write-Output "Cache do PWA atualizado para: jle-bi-v3.17.$timestamp"
            } catch {
                Write-Warning "Nao foi possivel atualizar o sw.js: $($_.Exception.Message)"
            }
        }

        Write-Output "Enviando atualizacao de Impostos para o repositorio remoto..."
        & $gitPath add parcelamentos_data.js parcelamentos_local.xlsx sw.js
        & $gitPath commit -m "data(auto): atualizacao automatica de impostos e parcelamentos"
        & $gitPath pull --rebase origin main
        & $gitPath push origin main
        Write-Output "Deploy automatico de Impostos disparado com sucesso via GitHub/Vercel!"
    } else {
        Write-Output "Base de Impostos ja esta em dia com o repositorio remoto."
    }
}

Write-Output "=========================================================="
Write-Output "PROCESSO DE ATUALIZACAO DE IMPOSTOS CONCLUIDO!"
Write-Output "=========================================================="
