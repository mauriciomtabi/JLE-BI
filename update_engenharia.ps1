# update_engenharia.ps1
# Script de orquestração de ETL para Engenharia Claro PR - JLE Telecom
# Executa o processador Python, atualiza o cache do Service Worker e envia ao GitHub para deploy na Vercel.

$ErrorActionPreference = "Stop"
$userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
$sysPath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
$env:Path = "$userPath;$sysPath;$env:Path"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pyScript = Join-Path $ScriptDir "update_engenharia.py"
$outDataJs = Join-Path $ScriptDir "engenharia_data.js"
$swPath = Join-Path $ScriptDir "sw.js"
$gitPath = if (Test-Path "C:\Program Files\Git\cmd\git.exe") { "C:\Program Files\Git\cmd\git.exe" } elseif (Test-Path "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe") { "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe" } else { (Get-Command git -ErrorAction SilentlyContinue).Source }

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "JLE TELECOM - ATUALIZANDO ENGENHARIA CLARO PR" -ForegroundColor Cyan
Write-Host "Horario: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Executar processador Python
if (Test-Path $pyScript) {
    python $pyScript
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Falha na execucao de update_engenharia.py (ExitCode: $LASTEXITCODE)"
        Exit 1
    }
} else {
    Write-Error "Arquivo $pyScript nao encontrado."
    Exit 1
}

Write-Host "Processamento em Python concluido com sucesso!" -ForegroundColor Green

# 2. Validacao de mudancas no Git / PWA Cache e Deploy na Vercel
if (Test-Path $gitPath) {
    $gitStatus = & $gitPath status --porcelain "$outDataJs"
    if ($null -ne $gitStatus -and $gitStatus.ToString().Trim() -ne "") {
        Write-Host "Novas atualizacoes detectadas na Engenharia PR! Atualizando cache do Service Worker..." -ForegroundColor Yellow
        if (Test-Path $swPath) {
            try {
                $swContent = [System.IO.File]::ReadAllText($swPath)
                $timestamp = Get-Date -Format "yyyyMMddHHmmss"
                $newCacheNameLine = "const CACHE_NAME = 'jle-bi-v3.17.$timestamp';"
                $swContent = $swContent -replace "const CACHE_NAME = '([^']+)';", $newCacheNameLine
                $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                [System.IO.File]::WriteAllText($swPath, $swContent, $utf8NoBom)
                Write-Host "Cache do Service Worker atualizado para: jle-bi-v3.17.$timestamp" -ForegroundColor Green
            } catch {
                Write-Warning "Nao foi possivel atualizar o sw.js: $($_.Exception.Message)"
            }
        }

        Write-Host "Enviando commits ao GitHub para deploy automatico na Vercel..." -ForegroundColor Cyan
        & $gitPath add "$outDataJs" "$swPath" "$ScriptDir\engenharia_app.js" "$ScriptDir\engenharia_styles.css"
        $commitDate = Get-Date -Format 'dd/MM/yyyy HH:mm'
        & $gitPath commit -m "data(engenharia): atualizacao automatica da base Engenharia PR via rede local ($commitDate)"
        & $gitPath pull --rebase --autostash origin main
        & $gitPath push origin main
        Write-Host "Dados de Engenharia PR publicados com sucesso no repositorio remoto!" -ForegroundColor Green
    } else {
        Write-Host "Sem novas alteracoes nos dados de Engenharia PR. Nenhuma publicacao necessaria." -ForegroundColor Yellow
    }
} else {
    Write-Warning "Git executavel nao encontrado em '$gitPath'. Nao foi possivel enviar para o repositorio remoto."
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "PROCESSO DE ATUALIZACAO DA ENGENHARIA CONCLUIDO!" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
