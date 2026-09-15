/**
 * ========================================================================
 * Google Apps Script — Sincronização Cirúrgica SAR x Analítico Claro
 * Planilha: Planilha_Operacional_SAR_JLE
 * Aba: SAR Operacional
 * ========================================================================
 * 
 * DIRETRIZ DE SEGURANÇA MÁXIMA:
 * - NUNCA altera fórmulas ou células operacionais de campo.
 * - Detecção DINÂMICA de colunas a partir do cabeçalho da linha 3.
 * - SOMENTE atualiza cirurgicamente:
 *     * STATUS GERAL SAR (dinâmico, padrão Col V / 22)
 *     * DATA PEDIDO (dinâmico, padrão Col AN / 40)
 *     * Nº DO PEDIDO (dinâmico, padrão Col AO / 41)
 * - Lê EXCLUSIVAMENTE a coluna do Nº WF (dinâmico, padrão Col AM / 39)
 *   (Protegendo a coluna AL / 38: DATA MED CAD WF2)
 * ========================================================================
 * 
 * INSTRUÇÕES DE INSTALAÇÃO NA PLANILHA GOOGLE:
 * 1. Abra a planilha do SAR no Google Sheets.
 * 2. No menu superior, clique em "Extensões" > "Apps Script".
 * 3. Cole este código no editor (substituindo o conteúdo existente).
 * 4. Clique em "Salvar" (ícone de disquete).
 * 5. Clique em "Implantar" (canto superior direito) > "Nova implantação".
 * 6. Em "Selecionar tipo", escolha "App da Web" (ícone de engrenagem).
 * 7. Configure:
 *    - Descrição: "Sincronizador Dinâmico e Seguro SAR Claro"
 *    - Executar como: "Eu (seu_email@...)"
 *    - Quem tem acesso: "Qualquer pessoa"
 * 8. Clique em "Implantar" e autorize as permissões.
 * 9. Copie o "URL do app da Web" gerado e salve no arquivo local:
 *    "sar_gsheet_webhook_url.txt"
 */

function normH(val) {
  if (!val) return '';
  return String(val).toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ºª°.]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Aguarda até 45s se houver outra operação em andamento
  lock.tryLock(45000);
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("SAR Operacional");
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "Aba 'SAR Operacional' não foi encontrada na planilha."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "Nenhum dado recebido."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var payload = JSON.parse(e.postData.contents);
    var updates = payload.updates || [];
    
    if (updates.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        updated: 0,
        message: "Nenhuma atualização pendente."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 4) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "A planilha não possui dados a partir da linha 4."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // PASSO 0: Identificar dinamicamente as colunas no cabeçalho (Linha 3)
    var maxCols = Math.min(sheet.getLastColumn(), 55);
    var headerRowValues = sheet.getRange(3, 1, 1, maxCols).getValues()[0];
    
    // Fallbacks 1-based seguros após inserção de DATA MED CAD WF2 (Col AL=38)
    var colStatus = 22;   // Col V
    var colWf = 39;       // Col AM (Nº WF)
    var colDataPed = 40;  // Col AN (DATA PEDIDO)
    var colNumPed = 41;   // Col AO (Nº DO PEDIDO)

    for (var c = 0; c < headerRowValues.length; c++) {
      var nh = normH(headerRowValues[c]);
      if (nh === 'STATUS GERAL SAR' || nh === 'STATUS GERAL') {
        colStatus = c + 1;
      } else if (nh === 'N WF' || nh === 'NO WF' || nh === 'NUM WF' || nh === 'WORKFLOW') {
        colWf = c + 1;
      } else if (nh === 'DATA PEDIDO') {
        colDataPed = c + 1;
      } else if (nh === 'N DO PEDIDO' || nh === 'NO DO PEDIDO' || nh === 'PEDIDO') {
        colNumPed = c + 1;
      }
    }

    // PASSO 1: Ler EXCLUSIVAMENTE a Coluna do Nº WF para mapear as linhas.
    var startRow = 4;
    var numRows = lastRow - startRow + 1;
    var colWfValues = sheet.getRange(startRow, colWf, numRows, 1).getValues();
    
    var wfRowMap = {};
    for (var r = 0; r < colWfValues.length; r++) {
      var rawWf = String(colWfValues[r][0] || '').trim();
      var digits = rawWf.replace(/\D/g, '');
      if (digits) {
        if (!wfRowMap[digits]) wfRowMap[digits] = [];
        wfRowMap[digits].push(startRow + r); // Linha real na planilha
      }
    }
    
    // PASSO 2: Aplicar alterações CIRURGICAMENTE nas células mapeadas
    var updatedCount = 0;
    var rowsModified = [];
    
    for (var i = 0; i < updates.length; i++) {
      var u = updates[i];
      var targetWf = String(u.wf || '').replace(/\D/g, '');
      if (!targetWf) continue;
      
      var targetRows = wfRowMap[targetWf];
      if (targetRows && targetRows.length > 0) {
        for (var j = 0; j < targetRows.length; j++) {
          var realRow = targetRows[j];
          
          // 1. Atualizar EXCLUSIVAMENTE a Coluna de Status
          if (u.status !== undefined && u.status !== null && u.status !== '') {
            sheet.getRange(realRow, colStatus).setValue(u.status);
          }
          
          // 2. Atualizar EXCLUSIVAMENTE a Coluna de Data Pedido
          if (u.data_pedido !== undefined && u.data_pedido !== null && u.data_pedido !== '') {
            sheet.getRange(realRow, colDataPed).setValue(u.data_pedido);
          }
          
          // 3. Atualizar EXCLUSIVAMENTE a Coluna de Nº do Pedido
          if (u.num_pedido !== undefined && u.num_pedido !== null && u.num_pedido !== '') {
            sheet.getRange(realRow, colNumPed).setValue(u.num_pedido);
          }
          
          updatedCount++;
          rowsModified.push({ row: realRow, wf: targetWf, status: u.status });
        }
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      updated_records: updatedCount,
      unique_rows_updated: rowsModified.length,
      columns_used: { status: colStatus, wf: colWf, data_pedido: colDataPed, num_pedido: colNumPed },
      sample_modified: rowsModified.slice(0, 5),
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    service: "Sincronizador Dinâmico e Seguro SAR x Claro",
    columns_mode: "Detecção dinâmica na Linha 3",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}
