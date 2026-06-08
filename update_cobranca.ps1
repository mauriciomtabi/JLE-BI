# Script ETL para consolidar a planilha de faturamento da Claro para Cobrança
# Lê os dados de Analitico WF1 WF2.xlsx e gera cobranca_data.js para o dashboard.

$c_cedilla = [char]231
$e_acute = [char]233
$a_tilde = [char]227
$i_acute = [char]237
$e_circumflex = [char]234
$c_cedilla_caps = [char]199

$filePath = "C:\Users\jlema\Downloads\ANALITICO\Analitico WF1 WF2.xlsx"
$outputPath = "C:\Users\jlema\.gemini\antigravity\scratch\fluxo_caixa_mapping\cobranca_data.js"

Write-Output "Iniciando processamento da planilha de Cobranca..."

if (-not (Test-Path $filePath)) {
    Write-Error "Planilha Claro nao encontrada em '$filePath'!"
    Exit 1
}

# 1. Inicializar Excel COM
Write-Output "Abrindo Excel..."
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$workbook = $null

try {
    $workbook = $excel.Workbooks.Open($filePath, 0, $true) # Somente-leitura
    $ws = $workbook.Worksheets.Item(1)
    
    Write-Output "Lendo intervalo de dados..."
    $range = $ws.UsedRange
    $data = $range.Value2
    $rowCount = $data.GetLength(0)
    $colCount = $data.GetLength(1)
    Write-Output "Carregados $rowCount linhas e $colCount colunas."
    
    # Mapear cabecalhos
    $headers = @{}
    for ($c = 1; $c -le $colCount; $c++) {
        $name = [string]$data[1, $c]
        if ($name) { $headers[$name] = $c }
    }
    
    $idxOS = $headers["OS"]
    $idxCidade = $headers["CIDADE"]
    $idxUF = $headers["UF"]
    $idxContrato = $headers["CONTRATO_NUMERO"]
    $idxFaseAtual = $headers["FASE_ATUAL"]
    $idxStatusOS = $headers["STATUS_OS"]
    $idxMalogro = $headers["MALOGRO"]
    $idxPedido = $headers["NUMERO_PEDIDO"]
    $idxMedicao = $headers["NUMERO_MEDICAO"]
    $idxMesMedicao = $headers["MES_MEDICAO"]
    $idxValFinal = $headers["VALOR_TOTAL_FINAL"]
    $idxSistema = $headers["SISTEMA"]
    $idxCategoria = $headers["CATEGORIA"]
    $idxPagamento = $headers["PAGAMENTO"]
    
    Write-Output "Filtrando e processando registros nao pagos..."
    $receivables = New-Object System.Collections.Generic.List[object]
    
    for ($r = 2; $r -le $rowCount; $r++) {
        $pag = $data[$r, $idxPagamento]
        # Filtrar apenas itens nao pagos (diferentes de 'Sim')
        if ($pag -eq "Sim") {
            continue
        }
        
        $osVal = $data[$r, $idxOS]
        $os = if ($osVal -eq $null) { "" } else { [string]$osVal }
        
        $cidadeVal = $data[$r, $idxCidade]
        $cidade = if ($cidadeVal -eq $null) { "" } else { [string]$cidadeVal }
        
        $ufVal = $data[$r, $idxUF]
        $uf = if ($ufVal -eq $null) { "" } else { [string]$ufVal }
        
        $contratoVal = $data[$r, $idxContrato]
        $contrato = if ($contratoVal -eq $null) { "" } else { [string]$contratoVal }
        
        $faseVal = $data[$r, $idxFaseAtual]
        $fase = if ($faseVal -eq $null) { "" } else { [string]$faseVal }
        
        $statusOSVal = $data[$r, $idxStatusOS]
        $statusOS = if ($statusOSVal -eq $null) { "" } else { [string]$statusOSVal }
        
        $malogroVal = $data[$r, $idxMalogro]
        $malogro = if ($malogroVal -eq $null) { "" } else { [string]$malogroVal }
        
        $pedidoVal = $data[$r, $idxPedido]
        $pedido = if ($pedidoVal -eq $null) { "" } else { [string]$pedidoVal }
        
        $medicaoVal = $data[$r, $idxMedicao]
        $medicao = if ($medicaoVal -eq $null) { "" } else { [string]$medicaoVal }
        
        $mesMedicaoVal = $data[$r, $idxMesMedicao]
        $mes = if ($mesMedicaoVal -eq $null) { "" } else { [string]$mesMedicaoVal }
        
        # Conversao do valor
        $valTF = $data[$r, $idxValFinal]
        $valNum = 0.0
        if ($valTF -is [double] -or $valTF -is [int]) {
            $valNum = [Math]::Round([double]$valTF, 2)
        }
        
        $sistemaVal = $data[$r, $idxSistema]
        $sistema = if ($sistemaVal -eq $null) { "" } else { [string]$sistemaVal }
        
        $categoriaVal = $data[$r, $idxCategoria]
        $categoria = if ($categoriaVal -eq $null) { "" } else { [string]$categoriaVal }
        
        # Estrutura ultra compacta de array para economizar memoria e espaco em disco
        # Indices:
        # 0: OS, 1: Cidade, 2: UF, 3: Contrato, 4: Fase Atual, 5: Status OS, 6: Malogro
        # 7: Pedido, 8: Medicao, 9: Mes Medicao, 10: Valor Final, 11: Sistema, 12: Categoria
        $rowArray = @($os, $cidade, $uf, $contrato, $fase, $statusOS, $malogro, $pedido, $medicao, $mes, $valNum, $sistema, $categoria)
        
        [void]$receivables.Add($rowArray)
    }
    
    Write-Output "Calculando estatisticas gerais para o cabecalho..."
    # Calcular KPIs basicos para poupar processamento no frontend
    $totalVal = 0.0
    $totalErro = 0.0
    $totalBacklog = 0.0
    $totalExecutado = 0.0
    
    foreach ($row in $receivables) {
        $val = $row[10]
        $statusOS = $row[5]
        $malogro = $row[6]
        
        $totalVal += $val
        if ($statusOS -eq "ERRO - AVALIAR OS") {
            if ($malogro -eq "ERROR") {
                $totalErro += $val
            } elseif ($malogro -eq "BACKLOG") {
                $totalBacklog += $val
            }
        } elseif ($statusOS -eq "EXECUTADO") {
            $totalExecutado += $val
        }
    }
    
    Write-Output "Salvando cobranca_data.js..."
    
    $summary = [PSCustomObject]@{
        total_receivables = [Math]::Round($totalVal, 2)
        total_erro = [Math]::Round($totalErro, 2)
        total_backlog = [Math]::Round($totalBacklog, 2)
        total_executado = [Math]::Round($totalExecutado, 2)
        count = $receivables.Count
    }
    
    $payload = [PSCustomObject]@{
        generated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        columns = @("os", "cidade", "uf", "contrato", "fase_atual", "status_os", "malogro", "pedido", "medicao", "mes_medicao", "valor_final", "sistema", "categoria")
        summary = $summary
        receivables = $receivables
    }
    
    $jsonStr = $payload | ConvertTo-Json -Depth 6
    $jsContent = "window.COBRANCA_DATA = " + $jsonStr + ";"
    $jsContent | Out-File -FilePath $outputPath -Encoding utf8
    
    Write-Output "Concluido! Salvo $outputPath com $($receivables.Count) itens."
    
} catch {
    Write-Error "Ocorreu um erro no script: $($_.Exception.Message)"
} finally {
    if ($null -ne $workbook) { $workbook.Close($false) }
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
