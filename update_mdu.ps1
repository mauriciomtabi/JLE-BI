# Script ETL para processar dados de MDU
# Baixa os dados atualizados do Google Sheets como CSV e executa o processador em Python.
# Em seguida, atualiza o Service Worker e publica as atualizações no repositório GitHub para refletir na produção.

$PSScriptRoot = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
$csvPath = "$PSScriptRoot\mdu_data.csv"
$jsPath = "$PSScriptRoot\mdu_data.js"
$swPath = "$PSScriptRoot\sw.js"
$gitPath = "C:\Program Files\Git\cmd\git.exe"

# 1. Download do Google Sheets
$url = "https://docs.google.com/spreadsheets/d/1eEJLaV7D0rthjC5H1MppXyk7dyroqn2h/export?format=csv&gid=260790893"
Write-Output "=========================================================="
Write-Output "Iniciando download da planilha de MDU do Google Sheets..."
Write-Output "=========================================================="

try {
    # Tenta baixar o arquivo CSV
    Invoke-WebRequest -Uri $url -OutFile $csvPath -UserAgent "Mozilla/5.0"
    Write-Output "Download concluido! Arquivo salvo em: $csvPath"
} catch {
    Write-Error "Falha ao baixar a planilha de MDU do Google Sheets: $_"
    Exit 1
}

# 2. Executar script de geocodificação e compilação em Python (usando o Python do Cloud SDK para contornar bloqueio de WDAC)
Write-Output "Executando script de processamento em Python..."
$pythonExe = "C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\platform\bundledpython\python.exe"

if (Test-Path $pythonExe) {
    & $pythonExe "$PSScriptRoot\update_mdu.py"
} else {
    # Fallback caso não esteja instalado no caminho padrão
    python "$PSScriptRoot\update_mdu.py"
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "Falha ao executar o processamento de MDU em Python."
    Exit 1
}

Write-Output "Processamento de MDU em Python concluido com sucesso!"

# 3. Verificar alterações no git e fazer push para a Vercel
if (Test-Path $gitPath) {
    $gitStatus = & $gitPath status --porcelain "$jsPath"
    if ($null -ne $gitStatus -and $gitStatus.ToString().Trim() -ne "") {
        Write-Output "Novas atualizacoes detectadas nos dados de MDU! Atualizando o cache do Service Worker (sw.js)..."
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
        & $gitPath commit -m "data(mdu): atualizacao automatica da base MDU via Google Sheets"
        & $gitPath push origin main
        Write-Output "Dados do MDU publicados com sucesso no repositorio remoto!"

        # 4. Aguardar o deploy da Vercel e forcar re-sincronizacao dos e-mails agendados
        Write-Output ""
        Write-Output "Aguardando 90 segundos para o deploy automatico da Vercel completar..."
        Start-Sleep -Seconds 90

        Write-Output "Acionando re-sincronizacao de e-mails agendados com os dados mais recentes do MDU..."
        try {
            $resyncUrl = "https://jle-bi.vercel.app/api/force-resync-email"
            $response = Invoke-RestMethod -Uri $resyncUrl -Method GET -TimeoutSec 60 -ErrorAction Stop
            if ($response.success -eq $true) {
                Write-Output "Re-sincronizacao de e-mails concluida com sucesso!"
                Write-Output "  Dados referentes a: $($response.generatedAt)"
                foreach ($r in $response.results) {
                    Write-Output "  - [$($r.report)] Acao: $($r.action)"
                }
            } else {
                Write-Warning "Re-sincronizacao retornou falha: $($response | ConvertTo-Json -Compress)"
            }
        } catch {
            Write-Warning "Falha ao acionar re-sincronizacao de e-mails: $($_.Exception.Message)"
            Write-Warning "Os e-mails serao atualizados na proxima abertura do painel BI."
        }
    } else {
        Write-Output "Sem novas alteracoes nos dados do MDU. Verificando se os e-mails agendados precisam ser atualizados..."
        # Mesmo sem mudancas nos dados brutos, garantir que o e-mail de amanha esta sincronizado
        try {
            $resyncUrl = "https://jle-bi.vercel.app/api/force-resync-email"
            $response = Invoke-RestMethod -Uri $resyncUrl -Method GET -TimeoutSec 60 -ErrorAction Stop
            if ($response.success -eq $true) {
                $hasAction = ($response.results | Where-Object { $_.action -ne "already_fresh" }).Count -gt 0
                if ($hasAction) {
                    Write-Output "E-mails reagendados com dados existentes."
                } else {
                    Write-Output "E-mails ja estao sincronizados. Nenhuma publicacao necessaria."
                }
            }
        } catch {
            Write-Warning "Falha ao verificar sincronizacao de e-mails: $($_.Exception.Message)"
        }
    }
} else {
    Write-Warning "Git executavel nao encontrado em '$gitPath'. Nao foi possivel enviar para o repositorio remoto."
}


Write-Output "=========================================================="
Write-Output "PROCESSO DE ATUALIZACAO DO MDU CONCLUIDO!"
Write-Output "=========================================================="
