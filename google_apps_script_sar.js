/**
 * ========================================================================
 * Google Apps Script — Sincronização Cirúrgica SAR x Analítico Claro
 * Planilha: Planilha_Operacional_SAR_JLE
 * Aba: SAR Operacional
 * ========================================================================
 * 
 * DIRETRIZ DE SEGURANÇA MÁXIMA:
 * - NUNCA altera nenhuma fórmula ou célula das colunas A até U (1 a 21).
 * - NUNCA toca nas colunas W até AK (23 a 37 - Terceiros, Fórmulas AH, etc).
 * - NUNCA altera a coluna AL (38 - Nº WF, somente leitura).
 * - NUNCA altera a coluna AO (41 - Observações) ou colunas posteriores.
 * - SOMENTE atualiza cirurgicamente:
 *     * Coluna V (22): STATUS GERAL SAR
 *     * Coluna AM (39): DATA PEDIDO (quando houver pedido emitido)
 *     * Coluna AN (40): Nº DO PEDIDO (quando houver pedido emitido)
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
 *    - Descrição: "Sincronizador Seguro SAR Claro"
 *    - Executar como: "Eu (seu_email@...)"
 *    - Quem tem acesso: "Qualquer pessoa"
 * 8. Clique em "Implantar" e autorize as permissões.
 * 9. Copie o "URL do app da Web" gerado e salve no arquivo local:
 *    "sar_gsheet_webhook_url.txt"
 */

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
    
    // PASSO 1: Ler EXCLUSIVAMENTE a Coluna AL (38 - Nº WF) para mapear as linhas.
    // Nenhuma outra coluna é lida ou carregada neste momento.
    var startRow = 4;
    var numRows = lastRow - startRow + 1;
    var colAlValues = sheet.getRange(startRow, 38, numRows, 1).getValues();
    
    var wfRowMap = {};
    for (var r = 0; r < colAlValues.length; r++) {
      var rawWf = String(colAlValues[r][0] || '').trim();
      var digits = rawWf.replace(/\D/g, '');
      if (digits) {
        if (!wfRowMap[digits]) wfRowMap[digits] = [];
        wfRowMap[digits].push(startRow + r); // Linha real na planilha
      }
    }
    
    // PASSO 2: Aplicar alterações CIRURGICAMENTE nas células permitidas
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
          
          // 1. Atualizar EXCLUSIVAMENTE a Coluna V (22): STATUS GERAL SAR
          if (u.status !== undefined && u.status !== null && u.status !== '') {
            sheet.getRange(realRow, 22).setValue(u.status);
          }
          
          // 2. Se for PEDIDO EMITIDO com data: atualizar EXCLUSIVAMENTE Coluna AM (39)
          if (u.data_pedido !== undefined && u.data_pedido !== null && u.data_pedido !== '') {
            sheet.getRange(realRow, 39).setValue(u.data_pedido);
          }
          
          // 3. Se for PEDIDO EMITIDO com número: atualizar EXCLUSIVAMENTE Coluna AN (40)
          if (u.num_pedido !== undefined && u.num_pedido !== null && u.num_pedido !== '') {
            sheet.getRange(realRow, 40).setValue(u.num_pedido);
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
    service: "Sincronizador Cirúrgico SAR x Claro",
    protected_columns: "A-U intactas, W-AK intactas, AL somente-leitura, AO+ intactas",
    allowed_columns: "V (Status), AM (Data Pedido), AN (Nº Pedido)",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}
