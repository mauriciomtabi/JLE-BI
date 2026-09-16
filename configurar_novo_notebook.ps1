# ==============================================================================
# SCRIPT MESTRE DE CONFIGURACAO - NOVO NOTEBOOK BI JLE TELECOM
# Executa instalacao de pacotes, agendamentos do Windows e validacao completa
# ==============================================================================

$ErrorActionPreference = "Continue"
$workingDir = $PSScriptRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " CONFIGURACAO DO NOVO NOTEBOOK - BI JLE TELECOM" -ForegroundColor Yellow
Write-Host " Diretorio do Projeto: $workingDir"
Write-Host " Usuario Windows     : $env:USERNAME"
Write-Host " Data e Hora         : $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar privilegios de Administrador
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Este script nao esta rodando como Administrador."
    Write-Warning "Para registrar tarefas no Agendador do Windows sem restricoes, execute o PowerShell como Administrador."
}

# 2. Verificar Python e instalar dependencias
Write-Host "--- [1/4] Verificando Ambiente Python & Dependencias ---" -ForegroundColor Cyan
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCmd) {
    Write-Host "[OK] Python localizado: $($pythonCmd.Source)" -ForegroundColor Green
    $reqPath = Join-Path $workingDir "requirements.txt"
    if (Test-Path $reqPath) {
        Write-Host "Instalando dependencias de $reqPath..."
        python -m pip install --upgrade pip --quiet
        python -m pip install -r $reqPath --quiet
        Write-Host "[OK] Dependencias do requirements.txt instaladas com sucesso!" -ForegroundColor Green
    }
} else {
    Write-Warning "Python nao encontrado no PATH! Baixe em https://www.python.org marcando 'Add Python to PATH'."
}
Write-Host ""

# 3. Verificar Git
Write-Host "--- [2/4] Verificando Git ---" -ForegroundColor Cyan
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
    Write-Host "[OK] Git localizado: $($gitCmd.Source)" -ForegroundColor Green
    $gitRemote = git remote -v 2>$null
    if ($gitRemote) {
        Write-Host "[OK] Repositorio Git conectado ao GitHub!" -ForegroundColor Green
    }
} else {
    Write-Warning "Git nao encontrado no PATH. Verifique se o Git para Windows esta instalado."
}
Write-Host ""

# 4. Registrar Tarefas no Agendador do Windows
Write-Host "--- [3/4] Registrando as 7 Tarefas Agendadas no Windows ---" -ForegroundColor Cyan
$taskScript = Join-Path $workingDir "recriar_todas_tarefas_agendadas.ps1"
if (Test-Path $taskScript) {
    & powershell.exe -ExecutionPolicy Bypass -File $taskScript
} else {
    Write-Warning "Script recriar_todas_tarefas_agendadas.ps1 nao encontrado!"
}
Write-Host ""

# 5. Status Final das Tarefas no Agendador
Write-Host "--- [4/4] Verificando Status das Tarefas Agendadas ---" -ForegroundColor Cyan
$tasks = Get-ScheduledTask | Where-Object { $_.TaskName -like "*JLE_Telecom*" } | Select-Object TaskName, State
if ($tasks) {
    $tasks | Format-Table -AutoSize
    Write-Host "[SUCESSO] Todas as tarefas estao registradas e ativas no Windows!" -ForegroundColor Green
} else {
    Write-Warning "Nenhuma tarefa com prefixo JLE_Telecom foi listada. Tente executar o PowerShell como Administrador."
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " CONFIGURACAO DO NOVO NOTEBOOK CONCLUIDA COM SUCESSO!" -ForegroundColor Green
Write-Host " Para rodar uma sincronizacao manual de teste, execute: .\update_all.ps1"
Write-Host "==========================================================" -ForegroundColor Cyan
