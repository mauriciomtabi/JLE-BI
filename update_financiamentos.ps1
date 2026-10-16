$ErrorActionPreference = 'Stop'
Start-Transcript -Path "$PSScriptRoot\financiamentos_update.log" -Append | Out-Null
$userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
$sysPath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
$env:Path = "$userPath;$sysPath;$env:Path"
# update_financiamentos.ps1
# Script ETL PowerShell para sincronização e atualização de Financiamentos & PMTs JLE Telecom
$workingDir = $PSScriptRoot
Write-Output "=========================================================="
Write-Output "ATUALIZACAO: FINANCIAMENTOS & PMTs (CONTROLADORIA JLE)"
Write-Output "Data/Hora: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
Write-Output "=========================================================="

$pythonScript = "$workingDir\update_financiamentos.py"

if (-not (Test-Path $pythonScript)) {
    Write-Error "Script Python nao encontrado: $pythonScript"
    exit 1
}

# 1. Executar o extrator Python
try {
    & python $pythonScript
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Falha na execucao do extrator Python de Financiamentos."
        exit $LASTEXITCODE
    }
} catch {
    Write-Error "Erro ao invocar Python: $($_.Exception.Message)"
    exit 1
}

Write-Output "[ETL PowerShell] Extracao de dados concluida com sucesso."

# 2. Sincronização com GitHub / PWA Cache se executado individualmente
$gitPath = if (Test-Path "C:\Program Files\Git\cmd\git.exe") { "C:\Program Files\Git\cmd\git.exe" } elseif (Test-Path "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe") { "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe" } else { (Get-Command git -ErrorAction SilentlyContinue).Source }
if (Test-Path $gitPath) {
    Set-Location $workingDir
    $status = & $gitPath status --porcelain financiamentos_data.js
    if ($null -ne $status -and $status.ToString().Trim() -ne "") {
        Write-Output "Alteracao detectada em financiamentos_data.js! Atualizando Service Worker cache (sw.js)..."
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

        Write-Output "Enviando atualizacao de Financiamentos para o repositorio remoto..."
        & $gitPath add financiamentos_data.js sw.js index.html financiamentos_app.js financiamentos_styles.css update_financiamentos.py update_financiamentos.ps1
        if ($LASTEXITCODE -ne 0) { throw "Falha ao preparar arquivos no Git." }
        & $gitPath commit -m "feat(financiamentos): atualizacao das PMTs e cronogramas de financiamento"
        if ($LASTEXITCODE -ne 0) { throw "Falha ao registrar atualizacao no Git." }
        & $gitPath pull --rebase --autostash origin main
        if ($LASTEXITCODE -ne 0) { throw "Falha ao sincronizar o repositorio remoto." }
        & $gitPath push origin main
        if ($LASTEXITCODE -ne 0) { throw "Falha ao publicar atualizacao de Financiamentos." }
        Write-Output "Deploy automatico de Financiamentos disparado com sucesso via GitHub/Vercel!"
    } else {
        Write-Output "Base de Financiamentos ja esta em dia com o repositorio remoto."
    }
}

Write-Output "=========================================================="
Write-Output "PROCESSO DE ATUALIZACAO DE FINANCIAMENTOS CONCLUIDO!"
Write-Output "=========================================================="
Stop-Transcript | Out-Null
