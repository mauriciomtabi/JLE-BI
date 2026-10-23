param([switch]$Force)

$workingDir = $PSScriptRoot
$logFile = "$workingDir\parcelamentos_update.log"
try {
    Start-Transcript -Path $logFile -Append | Out-Null
} catch {}

try {
    $userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    $sysPath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $env:Path = "$userPath;$sysPath;$env:Path"

    Write-Output "=========================================================="
    Write-Output "ATUALIZACAO: GESTAO TRIBUTARIA & CONTROLE DE PARCELAMENTOS"
    Write-Output "Data/Hora: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
    if ($Force) { Write-Output "Modo: Execucao Forcada (--force)" }
    Write-Output "=========================================================="

    $pythonScript = "$workingDir\update_parcelamentos.py"

    if (-not (Test-Path $pythonScript)) {
        Write-Error "Script Python nao encontrado: $pythonScript"
        exit 1
    }

    # 1. Executar o extrator Python
    try {
        if ($Force) {
            & python $pythonScript --force
        } else {
            & python $pythonScript
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Falha na execucao do extrator Python de Parcelamentos."
            exit $LASTEXITCODE
        }
    } catch {
        Write-Error "Erro ao invocar Python: $($_.Exception.Message)"
        exit 1
    }

    Write-Output "[ETL PowerShell] Extracao de dados concluida com sucesso."

    # 2. Sincronização com GitHub / PWA Cache
    $gitPath = if (Test-Path "C:\Program Files\Git\cmd\git.exe") { "C:\Program Files\Git\cmd\git.exe" } elseif (Test-Path "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe") { "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe" } else { (Get-Command git -ErrorAction SilentlyContinue).Source }
    if (Test-Path $gitPath) {
        Set-Location $workingDir
        
        # Limpar possivel index.lock orfao de processos concorrentes
        $lockFile = "$workingDir\.git\index.lock"
        if (Test-Path $lockFile) {
            try {
                $lockAge = (Get-Date) - (Get-Item $lockFile).LastWriteTime
                if ($lockAge.TotalSeconds -gt 60) {
                    Write-Warning "Removendo arquivo de lock estagnado (.git/index.lock)..."
                    Remove-Item -Path $lockFile -Force -ErrorAction SilentlyContinue
                }
            } catch {}
        }

        $status = & $gitPath status --porcelain parcelamentos_data.js
        if ($Force -or ($null -ne $status -and $status.ToString().Trim() -ne "")) {
            Write-Output "Atualizacao detectada em parcelamentos_data.js! Atualizando Service Worker cache (sw.js)..."
            $swPath = "$workingDir\sw.js"
            if (Test-Path $swPath) {
                try {
                    $swContent = [System.IO.File]::ReadAllText($swPath)
                    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                    if ($swContent -match '// Versao:') {
                        $swContent = $swContent -replace '// Versao:.*', "// Versao: $timestamp"
                    }
                    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                    [System.IO.File]::WriteAllText($swPath, $swContent, $utf8NoBom)
                    Write-Output "Cache do PWA atualizado para: $timestamp"
                } catch {
                    Write-Warning "Nao foi possivel atualizar o sw.js: $($_.Exception.Message)"
                }
            }

            # Atualizar cache-busting em index.html
            $indexPath = "$workingDir\index.html"
            if (Test-Path $indexPath) {
                try {
                    $indexContent = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
                    $tsShort = Get-Date -Format "yyyyMMddHHmmss"
                    $indexContent = [regex]::Replace($indexContent, 'parcelamentos_data\.js\?v=[^"''\s>]+', "parcelamentos_data.js?v=$tsShort")
                    [System.IO.File]::WriteAllText($indexPath, $indexContent, [System.Text.Encoding]::UTF8)
                    Write-Output "index.html atualizado com tag de versao: parcelamentos_data.js?v=$tsShort"
                } catch {
                    Write-Warning "Nao foi possivel atualizar o index.html: $($_.Exception.Message)"
                }
            }

            Write-Output "Enviando atualizacao de Impostos para o repositorio remoto..."
            $maxRetries = 3
            $retryCount = 0
            $pushSuccess = $false
            while (-not $pushSuccess -and $retryCount -lt $maxRetries) {
                $retryCount++
                try {
                    & $gitPath add parcelamentos_data.js parcelamentos_local.xlsx sw.js index.html parcelamentos_app.js update_parcelamentos.py update_parcelamentos.ps1 atualizar_parcelamentos.bat register_parcelamentos_task.ps1
                    & $gitPath commit -m "data(impostos): atualizacao automatica da base tributaria e parcelamentos"
                    & $gitPath pull --rebase --autostash origin main
                    & $gitPath push origin main
                    if ($LASTEXITCODE -eq 0) {
                        $pushSuccess = $true
                        Write-Output "Deploy automatico de Impostos disparado com sucesso via GitHub/Vercel!"
                    } else {
                        Write-Warning "Tentativa $retryCount de envio ao Git falhou. Aguardando 3 segundos..."
                        Start-Sleep -Seconds 3
                    }
                } catch {
                    Write-Warning "Erro Git na tentativa ${retryCount}: $($_.Exception.Message)"
                    Start-Sleep -Seconds 3
                }
            }
        } else {
            Write-Output "Base de Impostos ja esta em dia com o repositorio remoto."
        }
    }

    Write-Output "=========================================================="
    Write-Output "PROCESSO DE ATUALIZACAO DE IMPOSTOS CONCLUIDO!"
    Write-Output "=========================================================="
} finally {
    try {
        Stop-Transcript | Out-Null
    } catch {}
}
