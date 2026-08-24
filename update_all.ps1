# Script unificado para atualizar todos os dados do BI (Financeiro JLE, Financeiro Tecnodrill, Claro, Veículos, Manutenção e MDU)
$workingDir = $PSScriptRoot
Write-Output "=========================================================="
Write-Output "INICIANDO ATUALIZACAO COMPLETA DOS DADOS DO BI JLE TELECOM"
Write-Output "Data/Hora: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
Write-Output "=========================================================="
Write-Output ""

# 1. Atualizar Fluxo de Caixa JLE (Financeiro)
Write-Output "--- [1/6] Atualizando Fluxo de Caixa JLE (Financeiro) ---"
if (Test-Path "$workingDir\update_dashboard.ps1") {
    try {
        & "$workingDir\update_dashboard.ps1"
    } catch {
        Write-Warning "Falha na atualizacao do Fluxo de Caixa JLE: $($_.Exception.Message)"
    }
}
Write-Output ""

# 2. Atualizar Fluxo de Caixa Tecnodrill (Financeiro)
Write-Output "--- [2/6] Atualizando Fluxo de Caixa Tecnodrill (Financeiro) ---"
if (Test-Path "$workingDir\update_tecnodrill.ps1") {
    try {
        & "$workingDir\update_tecnodrill.ps1"
    } catch {
        Write-Warning "Falha na atualizacao do Fluxo de Caixa Tecnodrill: $($_.Exception.Message)"
    }
}
Write-Output ""

# 3. Atualizar Analítico Claro (ETL)
Write-Output "--- [3/6] Atualizando Analítico Claro (ETL) ---"
if (Test-Path "$workingDir\update_cobranca.ps1") {
    try {
        & "$workingDir\update_cobranca.ps1"
    } catch {
        Write-Warning "Falha na atualizacao do Analítico Claro: $($_.Exception.Message)"
    }
}
Write-Output ""

# 4. Atualizar Veículos
Write-Output "--- [4/6] Atualizando Veículos ---"
if (Test-Path "$workingDir\update_veiculos.ps1") {
    try {
        & "$workingDir\update_veiculos.ps1"
    } catch {
        Write-Warning "Falha na atualizacao de Veículos: $($_.Exception.Message)"
    }
}
Write-Output ""

# 5. Atualizar Manutenção
Write-Output "--- [5/6] Atualizando Manutenção ---"
if (Test-Path "$workingDir\update_manutencao.ps1") {
    try {
        & "$workingDir\update_manutencao.ps1"
    } catch {
        Write-Warning "Falha na atualizacao de Manutenção: $($_.Exception.Message)"
    }
}
Write-Output ""

# 6. Atualizar MDU
Write-Output "--- [6/6] Atualizando MDU ---"
if (Test-Path "$workingDir\update_mdu.ps1") {
    try {
        & "$workingDir\update_mdu.ps1"
    } catch {
        Write-Warning "Falha na atualizacao de MDU: $($_.Exception.Message)"
    }
}
Write-Output ""

# Sincronização Consolidada no Git / PWA Cache
Write-Output "--- Sincronizacao Consolidada com GitHub / PWA ---"
$gitPath = "C:\Program Files\Git\cmd\git.exe"
if (Test-Path $gitPath) {
    $dataFiles = @("data.js", "tecnodrill_data.js", "cobranca_data.js", "veiculos_data.js", "manutencao_data.js", "mdu_data.js")
    $hasChanges = $false
    foreach ($df in $dataFiles) {
        $st = & $gitPath status --porcelain $df
        if ($null -ne $st -and $st.ToString().Trim() -ne "") {
            $hasChanges = $true
            break
        }
    }

    if ($hasChanges) {
        Write-Output "Alteracoes em bases de dados detectadas! Atualizando Service Worker cache (sw.js)..."
        $swPath = "$workingDir\sw.js"
        if (Test-Path $swPath) {
            try {
                $swContent = [System.IO.File]::ReadAllText($swPath)
                $timestamp = Get-Date -Format "yyyyMMddHHmmss"
                $newCacheNameLine = "const CACHE_NAME = 'jle-bi-v3.16.$timestamp';"
                $swContent = $swContent -replace "const CACHE_NAME = '([^']+)';", $newCacheNameLine
                $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                [System.IO.File]::WriteAllText($swPath, $swContent, $utf8NoBom)
                Write-Output "Cache do PWA atualizado para: jle-bi-v3.16.$timestamp"
            } catch {
                Write-Warning "Nao foi possivel atualizar o sw.js: $($_.Exception.Message)"
            }
        }

        Write-Output "Enviando alteracoes consolidadas para o repositorio remoto..."
        & $gitPath add *.js sw.js
        & $gitPath commit -m "data(auto): atualizacao completa consolidada dos dados do BI JLE"
        & $gitPath push origin main
        Write-Output "Deploy automatico disparado via push no GitHub!"
    } else {
        Write-Output "Todas as bases estao em dia com o repositorio remoto."
    }
}

Write-Output "=========================================================="
Write-Output "ATUALIZACAO COMPLETA CONCLUIDA COM SUCESSO!"
Write-Output "=========================================================="
