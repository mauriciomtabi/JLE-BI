# update_veiculos.ps1
# Script ETL para processar o novo Relatorio de Abastecimento de Veiculos da JLE Telecom
# Le os dados da planilha de rede localmente e atualiza veiculos_data.js com protecao de historico.

$c_cedilla = [char]231
$e_acute = [char]233
$a_tilde = [char]227
$i_acute = [char]237
$e_circumflex = [char]234
$c_cedilla_caps = [char]199

$networkDirParent = "\\10.121.21.252\administrativo"
$localTempPath = "$PSScriptRoot\veiculos_temp.xlsx"
$localCachePath = "$PSScriptRoot\veiculos_local.xlsx"
$outDataJs = "$PSScriptRoot\veiculos_data.js"

Write-Output "=========================================================="
Write-Output "INICIANDO ATUALIZACAO DA BASE DE VEICULOS (ABASTECIMENTOS)"
Write-Output "=========================================================="

# 1. Localizar pasta de rede e copiar planilha localmente
$networkPath = $null
$useFile = $null

if (Test-Path $networkDirParent) {
    try {
        # Busca pasta com wildcard "09. TICKET*" para evitar problemas com acentuacao
        $targetDir = Get-ChildItem -Path $networkDirParent -Directory | Where-Object { $_.Name -like "09. TICKET*" } | Select-Object -First 1
        if ($null -ne $targetDir) {
            $candidateFile = Get-ChildItem -Path $targetDir.FullName -Filter "*ABASTECIMENTO*.xlsx" | Select-Object -First 1
            if ($null -ne $candidateFile) {
                $networkPath = $candidateFile.FullName
                Write-Output "Planilha de rede localizada: $networkPath"
                
                Write-Output "Copiando planilha da rede localmente..."
                Copy-Item -Path $networkPath -Destination $localTempPath -Force
                # Atualizar copia local de cache para fallback
                Copy-Item -Path $networkPath -Destination $localCachePath -Force
                $useFile = $localTempPath
                Write-Output "Copia realizada e cache local sincronizado com sucesso."
            } else {
                Write-Warning "Planilha de abastecimento nao encontrada na pasta $($targetDir.FullName)."
            }
        } else {
            Write-Warning "Pasta 09. TICKET RELATORIOS nao localizada no servidor de rede."
        }
    } catch {
        Write-Warning "Falha ao buscar ou copiar da rede: $($_.Exception.Message)"
    }
} else {
    Write-Warning "Diretorio de rede inacessivel: $networkDirParent"
}

if ($null -eq $useFile) {
    if (Test-Path $localCachePath) {
        Write-Output "Usando planilha em cache local como fallback: $localCachePath"
        $useFile = $localCachePath
    } else {
        Write-Error "Arquivo de dados nao encontrado! Certifique-se de estar conectado a rede."
        Exit 1
    }
}

# 2. Inicializar Excel COM
Write-Output "Abrindo Excel..."
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$workbook = $null

function Clean-Number($val) {
    if ($null -eq $val) { return $null }
    if ($val -is [double] -or $val -is [int] -or $val -is [decimal]) {
        return [double]$val
    }
    $str = $val.ToString().Replace("R$", "").Replace(" ", "").Replace("`t", "")
    if ($str -match "\.") {
        if ($str -match ",") {
            $str = $str.Replace(".", "").Replace(",", ".")
        } else {
            $dotPos = $str.LastIndexOf('.')
            if ($dotPos -eq $str.Length - 3) {
                # Ponto decimal
            } else {
                $str = $str.Replace(".", "")
            }
        }
    } else {
        $str = $str.Replace(",", ".")
    }
    $num = 0.0
    if ([double]::TryParse($str, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$num)) {
        return $num
    }
    return 0.0
}

function Get-ExcelDate($val) {
    if ($null -eq $val) { return $null }
    if ($val -is [double] -or $val -is [int] -or $val -is [decimal]) {
        return [datetime]::FromOADate($val)
    }
    $date = [datetime]::MinValue
    if ([datetime]::TryParse($val, [ref]$date)) {
        return $date
    }
    return $null
}

function Get-MonthName($date) {
    if ($null -eq $date -or ($date -isnot [datetime])) { return "N/D" }
    switch ($date.Month) {
        1 { return "JANEIRO" }
        2 { return "FEVEREIRO" }
        3 { return "MAR" + $c_cedilla_caps + "O" } # MARCO
        4 { return "ABRIL" }
        5 { return "MAIO" }
        6 { return "JUNHO" }
        7 { return "JULHO" }
        8 { return "AGOSTO" }
        9 { return "SETEMBRO" }
        10 { return "OUTUBRO" }
        11 { return "NOVEMBRO" }
        12 { return "DEZEMBRO" }
    }
}

$newRecords = @()

try {
    $workbook = $excel.Workbooks.Open($useFile, 0, $true)
    
    # Localizar aba "Transacoes"
    $sheet = $null
    foreach ($sh in $workbook.Worksheets) {
        $shName = $sh.Name.Trim().ToUpper().Normalize([System.Text.NormalizationForm]::FormD)
        $shName = $shName -replace "\p{M}", "" # Remove acentos
        if ($shName -eq "TRANSACOES") {
            $sheet = $sh
            break
        }
    }
    
    if ($null -eq $sheet) {
        Write-Error "Aba 'Transacoes' nao foi localizada no arquivo Excel."
        Exit 1
    }
    
    Write-Output "Processando aba $($sheet.Name)..."
    
    $usedRange = $sheet.UsedRange
    $data = $usedRange.Value2
    $rows = $data.GetLength(0)
    $cols = $data.GetLength(1)
    
    # Mapear cabecalhos
    $headerMap = @{}
    for ($c = 1; $c -le $cols; $c++) {
        $headerVal = $data[1, $c]
        if ($null -ne $headerVal) {
            $headerText = $headerVal.ToString().Trim().ToUpper().Normalize([System.Text.NormalizationForm]::FormD)
            $headerText = $headerText -replace "\p{M}", "" # Remove acentos
            $headerMap[$headerText] = $c
        }
    }
    
    $findCol = {
        param($patterns)
        foreach ($p in $patterns) {
            $pNorm = $p.ToUpper().Normalize([System.Text.NormalizationForm]::FormD) -replace "\p{M}", ""
            foreach ($key in $headerMap.Keys) {
                if ($key -like "*$pNorm*") {
                    return $headerMap[$key]
                }
            }
        }
        return $null
    }
    
    $colDate = &$findCol @("DATA TRANSACAO", "DATA")
    $colPlate = &$findCol @("PLACA")
    $colDriver = &$findCol @("NOME MOTORISTA", "MOTORISTA", "CONDUTOR")
    $colValue = &$findCol @("VALOR EMISSAO", "VALOR", "VALOR TOTAL")
    $colState = &$findCol @("UF")
    $colLiters = &$findCol @("LITROS")
    $colVlLiter = &$findCol @("VL/LITRO", "VL. LITRO", "VALOR LITRO")
    $colModel = &$findCol @("MODELO VEICULO", "MODELO")
    $colFuel = &$findCol @("TIPO COMBUSTIVEL", "COMBUSTIVEL")
    $colFleet = &$findCol @("TIPO FROTA")
    $colKM = &$findCol @("HODOMETRO OU HORIMETRO", "HODOMETRO", "KM RODADOS OU HORAS TRABALHADAS", "KM RODADOS")
    $colKML = &$findCol @("KM/LITRO OU LITROS/HORA", "KM/LITRO", "KM/L")
    
    Write-Output "Mapeamento concluido. Extraindo dados..."
    
    for ($r = 2; $r -le $rows; $r++) {
        $plateVal = $data[$r, $colPlate]
        $plate = if ($null -ne $plateVal) { $plateVal.ToString().Trim().ToUpper() } else { "" }
        if ([string]::IsNullOrWhiteSpace($plate) -or $plate -eq "TOTAL") { continue }

        $dateVal = $data[$r, $colDate]
        if ($null -eq $dateVal) { continue }
        
        $date = Get-ExcelDate $dateVal
        if ($null -eq $date) { continue }
        
        $driverVal = $data[$r, $colDriver]
        $driver = if ($null -ne $driverVal) { $driverVal.ToString().Trim().ToUpper() } else { "" }
        if ($driver -eq "TOTAL") { continue }
        
        $valVal = $data[$r, $colValue]
        $val = Clean-Number $valVal
        if ($null -eq $val) { $val = 0.0 }
        
        $stateVal = $data[$r, $colState]
        $state = if ($null -ne $stateVal) { $stateVal.ToString().Trim().ToUpper() } else { "" }
        
        $liters = if ($colLiters -and $null -ne $data[$r, $colLiters]) { Clean-Number $data[$r, $colLiters] } else { $null }
        $vlLiter = if ($colVlLiter -and $null -ne $data[$r, $colVlLiter]) { Clean-Number $data[$r, $colVlLiter] } else { $null }
        $model = if ($colModel -and $null -ne $data[$r, $colModel]) { $data[$r, $colModel].ToString().Trim() } else { "" }
        $fuel = if ($colFuel -and $null -ne $data[$r, $colFuel]) { $data[$r, $colFuel].ToString().Trim().ToUpper() } else { "" }
        $fleet = if ($colFleet -and $null -ne $data[$r, $colFleet]) { $data[$r, $colFleet].ToString().Trim().ToUpper() } else { "" }
        $km = if ($colKM -and $null -ne $data[$r, $colKM]) { Clean-Number $data[$r, $colKM] } else { $null }
        $kml = if ($colKML -and $null -ne $data[$r, $colKML]) { Clean-Number $data[$r, $colKML] } else { $null }
        
        $monthName = Get-MonthName $date
        
        $rec = [PSCustomObject]@{
            date = $date.ToString("yyyy-MM-dd HH:mm:ss")
            plate = $plate
            driver = $driver
            value = [Math]::Round($val, 2)
            uf = $state
            month = $monthName
            liters = if ($null -ne $liters) { [Math]::Round($liters, 2) } else { $null }
            vlLiter = if ($null -ne $vlLiter) { [Math]::Round($vlLiter, 2) } else { $null }
            model = $model
            fuel = $fuel
            fleet = $fleet
            km = if ($null -ne $km) { [int]$km } else { $null }
            kml = if ($null -ne $kml) { [Math]::Round($kml, 2) } else { $null }
        }
        
        $newRecords += $rec
    }
    
    Write-Output "Total de registros extraidos da planilha: $($newRecords.Count)"
    
} catch {
    Write-Error "Erro ao ler Excel: $($_.Exception.Message)"
} finally {
    if ($null -ne $workbook) { $workbook.Close($false) }
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    if (Test-Path $localTempPath) { Remove-Item -Path $localTempPath -Force }
}

# 3. Mesclagem e Preservacao de Historico
$historicalRecords = @()

# Exportar novos registros temporariamente para mesclagem segura
$tempNewJson = "$PSScriptRoot\temp_new_veiculos.json"
$newRecords | ConvertTo-Json -Depth 5 | Out-File -FilePath $tempNewJson -Encoding UTF8

$pythonPath = "python"
if (Get-Command "python" -ErrorAction SilentlyContinue) {
    Write-Output "Executando mesclagem e protecao de historico via Python..."
    & python -c @"
import json, os

out_js = r'$outDataJs'
temp_json = r'$tempNewJson'

existing_data = []
if os.path.exists(out_js):
    try:
        with open(out_js, 'r', encoding='utf-8', errors='replace') as f:
            c = f.read()
        if 'VEICULOS_DATA = ' in c:
            existing_data = json.loads(c.split('VEICULOS_DATA = ')[1].rstrip(';\n '))
        print(f'Historico lido: {len(existing_data)} registros.')
    except Exception as e:
        print(f'Aviso ao ler historico: {e}')

new_data = []
if os.path.exists(temp_json):
    try:
        with open(temp_json, 'r', encoding='utf-8') as f:
            new_data = json.load(f)
        if isinstance(new_data, dict):
            new_data = [new_data]
        print(f'Novos registros extraidos: {len(new_data)}')
    except Exception as e:
        print(f'Erro ao ler novos registros: {e}')

new_months = set(r.get('month', '').upper() for r in new_data if r.get('month') and r.get('month') != 'N/D')
print('Meses novos detectados:', sorted(list(new_months)))

# Preservar meses que nao estao no lote novo
merged = [r for r in existing_data if r.get('month', '').upper() not in new_months]
print(f'Historico preservado de outros meses: {len(merged)}')
merged.extend(new_data)
print(f'Total final consolidado: {len(merged)}')

# Escrever veiculos_data.js
with open(out_js, 'w', encoding='utf-8') as f:
    f.write(f'const VEICULOS_DATA = {json.dumps(merged, ensure_ascii=False, indent=2)};\n')

print('veiculos_data.js atualizado com sucesso!')
"@
    if (Test-Path $tempNewJson) { Remove-Item $tempNewJson -Force }
} else {
    Write-Warning "Python nao encontrado. Usando fallback do PowerShell."
    # Fallback caso python nao esteja disponivel
    if (Test-Path $outDataJs) {
        $jsContent = [System.IO.File]::ReadAllText($outDataJs, [System.Text.Encoding]::UTF8)
        if ($jsContent -match "const\s+VEICULOS_DATA\s*=\s*([\s\S]+?);?\s*$") {
            try {
                $historicalRecords = ConvertFrom-Json -InputObject $Matches[1]
            } catch {}
        }
    }
    $newMonths = @{}
    foreach ($rec in $newRecords) { if ($rec.month -ne "N/D") { $newMonths[$rec.month.ToUpper()] = $true } }
    $mergedRecords = @()
    foreach ($hRec in $historicalRecords) {
        if (-not $newMonths.ContainsKey($hRec.month.ToString().ToUpper())) { $mergedRecords += $hRec }
    }
    $mergedRecords += $newRecords
    $jsonOut = ConvertTo-Json -InputObject $mergedRecords -Depth 5
    [System.IO.File]::WriteAllText($outDataJs, "const VEICULOS_DATA = " + $jsonOut + ";", [System.Text.Encoding]::UTF8)
}

# 5. Commit e Push no GitHub (atualizacao na Vercel)
$gitPath = "C:\Program Files\Git\cmd\git.exe"
if (Test-Path $gitPath) {
    $gitStatus = & $gitPath status --porcelain veiculos_data.js
    if ($null -ne $gitStatus -and $gitStatus.ToString().Trim() -ne "") {
        Write-Output "Mudancas detectadas! Atualizando a versao do Cache no Service Worker (sw.js)..."
        $swPath = "$PSScriptRoot\sw.js"
        if (Test-Path $swPath) {
            try {
                $swContent = [System.IO.File]::ReadAllText($swPath)
                $timestamp = Get-Date -Format "yyyyMMddHHmmss"
                $newCacheNameLine = "const CACHE_NAME = 'jle-bi-v3.16.$timestamp';"
                $swContent = [regex]::Replace($swContent, "const CACHE_NAME = '([^']+)';", $newCacheNameLine)
                $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                [System.IO.File]::WriteAllText($swPath, $swContent, $utf8NoBom)
                Write-Output "Cache do Service Worker atualizado para: jle-bi-v3.16.$timestamp"
            } catch {
                Write-Warning "Nao foi possivel atualizar o sw.js: $($_.Exception.Message)"
            }
        }

        Write-Output "Enviando commits ao GitHub..."
        & $gitPath add veiculos_data.js sw.js
        & $gitPath commit -m "data(veiculos): atualizacao automatica da base de veiculos a partir da rede"
        & $gitPath push origin main
        Write-Output "Dados publicados com sucesso no repositorio remoto!"
    } else {
        Write-Output "Sem alteracoes na base de veiculos. Nenhuma publicacao necessaria."
    }
} else {
    Write-Warning "Git executavel nao encontrado. Nao foi possivel enviar para o repositorio remoto."
}

Write-Output "=========================================================="
Write-Output "PROCESSO DE ATUALIZACAO CONCLUIDO!"
Write-Output "=========================================================="
