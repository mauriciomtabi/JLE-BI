# update_sar.ps1
# Script ETL para processar os dados do Dashboard SAR da Claro / JLE Telecom
# Le os dados da planilha na rede com fallback e contingencia local, gerando sar_data.js

$workingDir = $PSScriptRoot
$localTempPath = "$workingDir\sar_temp.xlsx"
$localCachePath = "$workingDir\sar_local.xlsx"
$outDataJs = "$workingDir\sar_data.js"
$swPath = "$workingDir\sw.js"
$gitPath = "C:\Program Files\Git\cmd\git.exe"

Write-Output "=========================================================="
Write-Output "INICIANDO ATUALIZACAO DA BASE DO DASHBOARD SAR"
Write-Output "Data/Hora: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
Write-Output "=========================================================="

# 1. Candidatos de pastas e arquivos no servidor de rede
$candidateDirs = @(
    "\\10.121.21.252\matriz_rs\Claro\PROJETO F",
    "\\10.121.21.252\matriz_rs\Claro\PROJETO F\Nodes 2026",
    "\\10.121.21.252\matriz_rs\Claro\PROJETO F\Adequaao SAR",
    "\\10.121.21.252\matriz_rs\Claro"
)

$networkPath = $null
$useFile = $null

foreach ($dir in $candidateDirs) {
    if (Test-Path $dir) {
        Write-Output "Buscando planilhas SAR no diretorio: $dir"
        try {
            # Arquivo exato prioritario
            $primaryTarget = "$dir\Cpia de Status Projeto F - Nodes, SAR - CERTO.xlsx"
            if (Test-Path $primaryTarget) {
                $networkPath = $primaryTarget
                break
            }
            
            # Busca por padroes SAR
            $candidateFiles = Get-ChildItem -Path $dir -File | Where-Object { 
                ($_.Name -like "*Status Projeto F*SAR*.xlsx" -or $_Name -like "*SAR*.xlsx") -and $_.Name -notlike "~$*"
            } | Sort-Object LastWriteTime -Descending

            if ($candidateFiles -and $candidateFiles.Count -gt 0) {
                $networkPath = $candidateFiles[0].FullName
                break
            }
        } catch {
            Write-Warning "Aviso ao listar diretorio $dir : $($_.Exception.Message)"
        }
    }
}

if ($null -ne $networkPath -and (Test-Path $networkPath)) {
    Write-Output "Planilha SAR localizada na rede: $networkPath"
    try {
        Write-Output "Copiando planilha para ambiente temporario e atualizando cache local..."
        Copy-Item -Path $networkPath -Destination $localTempPath -Force
        Copy-Item -Path $networkPath -Destination $localCachePath -Force
        $useFile = $localTempPath
        Write-Output "Copia e cache de contingencia atualizados com sucesso."
    } catch {
        Write-Warning "Falha ao copiar da rede ($($_.Exception.Message)). Tentando cache local..."
    }
} else {
    Write-Warning "Nenhum arquivo SAR encontrado na rede. Verifique a conexao com \\10.121.21.252."
}

if ($null -eq $useFile) {
    if (Test-Path $localCachePath) {
        Write-Output "Utilizando planilha em cache local de contingencia: $localCachePath"
        $useFile = $localCachePath
    } else {
        Write-Error "ERRO CRITICO: Nenhum arquivo SAR acessivel na rede nem em cache local!"
        Exit 1
    }
}

# 2. Executar processador em Python
Write-Output "Executando script de processamento e compilacao em Python..."
$pythonFound = $false

# Tenta python direto do PATH primeiro
try {
    $ver = python -c "import openpyxl; print('OK')" 2>$null
    if ($ver -like "*OK*") {
        python "$workingDir\update_sar.py" "$useFile"
        $pythonFound = $true
    }
} catch {}

if (-not $pythonFound) {
    $pythonCandidates = @(
        "C:\Users\jlema\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe",
        "C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\platform\bundledpython\python.exe"
    )
    foreach ($cand in $pythonCandidates) {
        if (Test-Path $cand) {
            & $cand "$workingDir\update_sar.py" "$useFile"
            if ($LASTEXITCODE -eq 0) {
                $pythonFound = $true
                break
            }
        }
    }
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "Falha no processamento Python de update_sar.py."
    Exit 1
}

# Limpeza de arquivo temporario
if (Test-Path $localTempPath) {
    Remove-Item $localTempPath -Force -ErrorAction SilentlyContinue
}

Write-Output "Compilacao do SAR concluida com sucesso!"

# 3. Validacao de mudancas no Git / PWA Cache
if (Test-Path $gitPath) {
    $gitStatus = & $gitPath status --porcelain "$outDataJs"
    if ($null -ne $gitStatus -and $gitStatus.ToString().Trim() -ne "") {
        Write-Output "Novas atualizacoes detectadas no SAR! Atualizando cache do Service Worker (sw.js)..."
        if (Test-Path $swPath) {
            try {
                $swContent = [System.IO.File]::ReadAllText($swPath)
                $timestamp = Get-Date -Format "yyyyMMddHHmmss"
                $newCacheNameLine = "const CACHE_NAME = 'jle-bi-v3.17.$timestamp';"
                $swContent = $swContent -replace "const CACHE_NAME = '([^']+)';", $newCacheNameLine
                $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                [System.IO.File]::WriteAllText($swPath, $swContent, $utf8NoBom)
                Write-Output "Cache do Service Worker atualizado para: jle-bi-v3.17.$timestamp"
            } catch {
                Write-Warning "Nao foi possivel atualizar o sw.js: $($_.Exception.Message)"
            }
        }
    }
}

Write-Output "=========================================================="
Write-Output "PROCESSO DE ATUALIZACAO DO SAR CONCLUIDO COM SUCESSO!"
Write-Output "=========================================================="
