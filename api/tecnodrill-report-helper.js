// api/tecnodrill-report-helper.js
// Utility module to process Tecnodrill cash flow data, generate Excel (.xlsx) attachments, and build HTML email reports.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function loadTecnodrillData() {
    let filePath = path.join(__dirname, '../tecnodrill_data.js');
    if (!fs.existsSync(filePath)) {
        filePath = path.join(process.cwd(), 'tecnodrill_data.js');
    }

    if (!fs.existsSync(filePath)) {
        throw new Error("Arquivo tecnodrill_data.js não localizado no servidor.");
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/window\.TECNODRILL_DATA\s*=\s*({[\s\S]*?});/);
    if (!match) {
        throw new Error("Não foi possível decodificar os dados de tecnodrill_data.js.");
    }

    return JSON.parse(match[1]);
}

function formatCurrency(val) {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getCurrentMonth() {
    const monthNames = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
    const now = new Date();
    return `${monthNames[now.getMonth()]}/${now.getFullYear()}`;
}

function generateExcelAttachments(tecnodrillData) {
    const todayStr = new Date().toISOString().substring(0, 10);
    const currentMonth = getCurrentMonth();
    
    // Filtra mês atual
    const rowsCurrentMonth = tecnodrillData.transactions.filter(t => t.competencia === currentMonth);
    const targetRows = rowsCurrentMonth.length > 0 ? rowsCurrentMonth : tecnodrillData.transactions;

    const dataExcel = targetRows.map(t => ({
        "Data": t.data || '',
        "Banco": t.banco || '',
        "Competência": t.competencia || '',
        "Fluxo": t.fluxo || '',
        "Categoria": t.categoria || '',
        "Descrição": t.descricao || '',
        "Valor (R$)": t.valor_nominal || 0,
        "Meio de Pagamento": t.meio_pagamento || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataExcel);

    // Auto-fit colunas
    const cols = Object.keys(dataExcel[0] || {}).map(k => {
        let maxLen = k.length;
        dataExcel.forEach(r => {
            const v = String(r[k] || '');
            if (v.length > maxLen) maxLen = v.length;
        });
        return { wch: maxLen + 3 };
    });
    ws['!cols'] = cols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tecnodrill');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return [{
        filename: `Lancamentos_Tecnodrill_${todayStr}.xlsx`,
        content: buffer.toString('base64')
    }];
}

function buildTecnodrillEmailHtml(reportName, tecnodrillData) {
    const currentMonth = getCurrentMonth();
    const txsMonth = tecnodrillData.transactions.filter(t => !t.is_transfer && t.competencia === currentMonth);
    const txsAll = txsMonth.length > 0 ? txsMonth : tecnodrillData.transactions.filter(t => !t.is_transfer);

    const entradas = txsAll.filter(t => t.fluxo === 'Entrada').reduce((s, t) => s + t.valor_nominal, 0);
    const saidas = txsAll.filter(t => t.fluxo === 'Saída').reduce((s, t) => s + t.valor_nominal, 0);
    const saldo = entradas - saidas;

    // Categorias de saída
    const byCat = {};
    txsAll.filter(t => t.fluxo === 'Saída' && t.categoria).forEach(t => {
        byCat[t.categoria] = (byCat[t.categoria] || 0) + t.valor_nominal;
    });

    const topCategories = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8);

    let catRowsHtml = '';
    topCategories.forEach(([cat, val]) => {
        catRowsHtml += `
        <tr>
            <td style="padding: 10px 16px; border-bottom: 1px solid #edf2f7; font-size: 13px; color: #2d3748; font-weight: 500;">
                ${cat}
            </td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #edf2f7; font-size: 13px; color: #e53e3e; font-weight: 700; text-align: right;">
                ${formatCurrency(val)}
            </td>
        </tr>`;
    });

    const generatedAt = tecnodrillData.generated_at || new Date().toISOString();

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background:#f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f9; padding: 30px 10px;">
            <tr>
                <td align="center">
                    <table width="640" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); border: 1px solid #e1e8ed;">
                        <!-- HEADER -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #0057b8, #1976d2); padding: 32px 40px; border-bottom: 4px solid #002d42;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td>
                                            <div style="display: inline-block; background: rgba(255,255,255,0.15); color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 8px;">TECNODRILL — FLUXO DE CAIXA</div>
                                            <h1 style="margin:0; font-size:24px; font-weight:800; color:#ffffff; line-height:1.2;">${reportName}</h1>
                                            <div style="font-size:12px; color:rgba(255,255,255,0.8); margin-top:6px;">Mês Base: <strong>${currentMonth}</strong> | Atualizado em: ${generatedAt}</div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- CARDS DE INDICADORES -->
                        <tr>
                            <td style="padding: 30px 40px 10px;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td width="31%" style="background: #f0fff4; border-radius: 12px; border: 1px solid #c6f6d5; padding: 18px 14px; text-align: center;">
                                            <div style="font-size: 10px; color: #276749; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 4px;">Entradas</div>
                                            <div style="font-size: 18px; font-weight: 800; color: #22543d;">${formatCurrency(entradas)}</div>
                                        </td>
                                        <td width="3.5%"></td>
                                        <td width="31%" style="background: #fff5f5; border-radius: 12px; border: 1px solid #fed7d7; padding: 18px 14px; text-align: center;">
                                            <div style="font-size: 10px; color: #9b2c2c; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 4px;">Saídas</div>
                                            <div style="font-size: 18px; font-weight: 800; color: #742a2a;">${formatCurrency(saidas)}</div>
                                        </td>
                                        <td width="3.5%"></td>
                                        <td width="31%" style="background: #ebf8ff; border-radius: 12px; border: 1px solid #bee3f8; padding: 18px 14px; text-align: center;">
                                            <div style="font-size: 10px; color: #2c5282; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 4px;">Saldo Final</div>
                                            <div style="font-size: 18px; font-weight: 800; color: #2a4365;">${formatCurrency(saldo)}</div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- TABELA DE CATEGORIAS -->
                        <tr>
                            <td style="padding: 20px 40px 30px;">
                                <div style="font-size:12px; text-transform:uppercase; letter-spacing:1px; color:#4a5568; font-weight:700; margin-bottom:12px;">Maiores Categorias de Despesa — ${currentMonth}</div>
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
                                    <tr style="background:#f7fafc;">
                                        <th style="padding:10px 16px; text-align:left; font-size:12px; color:#4a5568; font-weight:700;">Categoria</th>
                                        <th style="padding:10px 16px; text-align:right; font-size:12px; color:#4a5568; font-weight:700;">Valor Total</th>
                                    </tr>
                                    ${catRowsHtml || '<tr><td colspan="2" style="padding:16px; text-align:center; color:#a0aec0;">Sem lançamentos de saída no mês.</td></tr>'}
                                </table>
                            </td>
                        </tr>

                        <!-- FOOTER -->
                        <tr>
                            <td style="background:#f8f9fa; padding:20px; border-top:1px solid #e1e8ed; text-align:center; font-size:12px; color:#747d8c;">
                                Informativo automático do <strong>BI JLE Telecom — Tecnodrill</strong>. Em anexo planilha completa dos lançamentos.
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>`;
}

module.exports = {
    loadTecnodrillData,
    generateExcelAttachments,
    buildTecnodrillEmailHtml
};
