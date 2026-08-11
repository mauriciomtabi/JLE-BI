# Script ETL para processar dados de Manutenção
# Baixa os dados atualizados do Google Sheets como CSV e executa o processador em Python.
# Em seguida, atualiza o Service Worker e publica as atualizações no repositório GitHub para refletir na produção.

$PSScriptRoot = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
$csvPath = "$PSScriptRoot\manutencao_data.csv"
$jsPath = "$PSScriptRoot\manutencao_data.js"
$swPath = "$PSScriptRoot\sw.js"
$gitPath = "C:\Program Files\Git\cmd\git.exe"

# 1. Download do Google Sheets (Tab OFS, gid=0)
$url = "https://docs.google.com/spreadsheets/d/1fcei-KujFc4oA1DO9xIrATZiY-DeXfdaLFt7s_YIYQA/export?format=csv&gid=0"
Write-Output "=========================================================="
Write-Output "Iniciando download da planilha de Manutenção do Google Sheets..."
Write-Output "=========================================================="

try {
    Invoke-WebRequest -Uri $url -OutFile $csvPath -UserAgent "Mozilla/5.0"
    Write-Output "Download concluido! Arquivo salvo em: $csvPath"
} catch {
    Write-Error "Falha ao baixar a planilha de Manutenção do Google Sheets: $_"
    Exit 1
}

# 2. Executar script de compilação em Python
Write-Output "Executando script de processamento de Manutenção em Python..."
$pythonExe = "C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\platform\bundledpython\python.exe"

if (Test-Path $pythonExe) {
    & $pythonExe "$PSScriptRoot\update_manutencao.py"
} else {
    python "$PSScriptRoot\update_manutencao.py"
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "Falha ao executar o processamento de Manutenção em Python."
    Exit 1
}

Write-Output "Processamento de Manutenção em Python concluido com sucesso!"

# 3. Verificar alterações no git e fazer push para a Vercel
if (Test-Path $gitPath) {
    $gitStatus = & $gitPath status --porcelain "$jsPath"
    if ($null -ne $gitStatus -and $gitStatus.ToString().Trim() -ne "") {
        Write-Output "Novas atualizacoes detectadas nos dados de Manutenção! Atualizando o cache do Service Worker (sw.js)..."
        if (Test-Path $swPath) {
            try {
                $swContent = [System.IO.File]::ReadAllText($swPath)
                $timestamp = Get-Date -Format "yyyyMMddHHmmss"
                $newCacheNameLine = "const CACHE_NAME = 'jle-bi-v3.16.$timestamp';"
                $swContent = $swContent -replace "const CACHE_NAME = '([^']+)';", $newCacheNameLine
                $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                [System.IO.File]::WriteAllText($swPath, $swContent, $utf8NoBom)
                Write-Output "Cache do Service Worker atualizado para: jle-bi-v3.16.$timestamp"
            } catch {
                Write-Warning "Nao foi possivel atualizar o sw.js: $($_.Exception.Message)"
            }
        }

        Write-Output "Enviando commits ao GitHub..."
        & $gitPath add "$jsPath" "$swPath"
        & $gitPath commit -m "data(manutencao): atualizacao automatica da base de Manutencao via Google Sheets"
        & $gitPath push origin main
        Write-Output "Dados de Manutenção publicados com sucesso no repositorio remoto!"
    } else {
        Write-Output "Sem novas alteracoes nos dados de Manutenção. Nenhuma acao necessaria."
    }
} else {
    Write-Warning "Git executavel nao encontrado em '$gitPath'. Nao foi possivel enviar para o repositorio remoto."
}

# 4. Disparar e-mail de manutenção logo após o sync matinal das 08:00
$currentHour = (Get-Date).Hour
if ($currentHour -eq 8 -or $currentHour -eq 9) {
    Write-Output "Executando disparo matinal de e-mail com a base recem-atualizada..."
    try {
        node "$PSScriptRoot\send_email_reports.js"
    } catch {
        Write-Warning "Falha ao executar send_email_reports.js: $_"
    }
}

Write-Output "=========================================================="
Write-Output "PROCESSO DE ATUALIZACAO DE MANUTENÇÃO CONCLUIDO!"
Write-Output "=========================================================="
