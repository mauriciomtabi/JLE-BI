// api/manutencao-report-helper.js
// Utility module to process Manutenção data, generate Excel (.xlsx) attachments, and build HTML email reports.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function getMacroCategory(tipoAtiv) {
    if (!tipoAtiv || tipoAtiv === '-') return 'ROMPIMENTO';
    const tUpper = tipoAtiv.toUpperCase();
    if (tUpper.includes('OBRAS') || tUpper.includes('MIGRAÇÃO') || tUpper.includes('MIGRACAO') || tUpper.includes('ANTI-FURTO') || tUpper.includes('MELHORIA')) {
        return 'MELHORIA';
    }
    return 'ROMPIMENTO';
}

function loadManutencaoData() {
    let filePath = path.join(__dirname, '../manutencao_data.js');
    if (!fs.existsSync(filePath)) {
        filePath = path.join(process.cwd(), 'manutencao_data.js');
    }
    
    if (!fs.existsSync(filePath)) {
        throw new Error("Arquivo manutencao_data.js não localizado no servidor.");
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/const db = ({[\s\S]*?});\r?\n\r?\s*const l =/);
    if (!match) {
        throw new Error("Não foi possível decodificar os dados de manutencao_data.js.");
    }
    
    const db = JSON.parse(match[1]);
    const l = db.lookups;
    
    const rows = db.rows.map(r => ({
        ral: r[0] || '-',
        tipo_of: l.tipos_of[r[1]] || '-',
        atividade: r[2] || '-',
        tipo_atividade: l.tipos_atividade[r[3]] || '-',
        localidade: l.localidades[r[4]] || '-',
        status: l.statuses[r[5]] || '-',
        data_acionamento: r[6] || '-',
        equipe: l.equipes[r[7]] || '-',
        tipo_defeito: l.tipos_defeito[r[8]] || '-',
        causa_defeito: l.causas_defeito[r[9]] || '-',
        valor_medicao: r[10] || 0.0,
        mes_pagamento: l.meses_pagamento[r[11]] || '-',
        demanda_integ: l.demanda_integ[r[12]] || '-',
        wf2: r[13] || '-',
        obs_medicao: r[14] || '-',
        legend_status: r[15] || '-'
    }));
    
    return {
        generated_at: db.generated_at,
        rows: rows
    };
}

function formatCurrency(val) {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getCurrentMonth() {
    // Retorna o mês de pagamento baseado na data REAL do calendário
    const monthNames = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
    const now = new Date();
    return `${monthNames[now.getMonth()]}/${now.getFullYear()}`;
}

function generateExcelAttachments(manutData) {
    const todayStr = new Date().toISOString().substring(0, 10);
    
    // Filtra apenas o mês atual de pagamento (baseado na data real)
    const currentMonth = getCurrentMonth();
    const rowsCurrentMonth = currentMonth
        ? manutData.rows.filter(r => r.mes_pagamento === currentMonth)
        : manutData.rows;
    
    // Filtra apenas as OFs Pendentes (sem WF2 / Coluna T vazia) do mês atual
    const pendentesRows = rowsCurrentMonth.filter(r => {
        const hasColT = Boolean(r.wf2 && r.wf2 !== '-' && String(r.wf2).toUpperCase() !== 'NONE');
        return !hasColT;
    });
    
    const mapToExcelJson = (arr) => arr.map(r => ({
        "RAL / OF": r.ral,
        "Atividade": r.atividade,
        "Tipo de Atividade": r.tipo_atividade,
        "Localidade": r.localidade,
        "Data Acionamento": r.data_acionamento,
        "Mês Pagamento": r.mes_pagamento,
        "Valor Medido (R$)": r.valor_medicao,
        "Status Financeiro": "AGUARD_APROVACAO"
    }));
    
    // Calcula largura de cada coluna pelo maior valor encontrado nos dados
    const calcColWidth = (data, key) => {
        const headerLen = key.length;
        const maxDataLen = data.reduce((max, row) => {
            const v = row[key] !== undefined && row[key] !== null ? String(row[key]).length : 0;
            return Math.max(max, v);
        }, 0);
        return { wch: Math.max(headerLen, maxDataLen) + 2 };
    };

    const wb = XLSX.utils.book_new();
    const excelData = mapToExcelJson(pendentesRows);
    const wsPendentes = XLSX.utils.json_to_sheet(excelData);
    
    // Aplica larguras responsivas nas colunas
    const cols = [
        "RAL / OF", "Atividade", "Tipo de Atividade", "Localidade",
        "Data Acionamento", "Mês Pagamento", "Valor Medido (R$)", "Status Financeiro"
    ];
    wsPendentes['!cols'] = cols.map(key => calcColWidth(excelData, key));
    
    XLSX.utils.book_append_sheet(wb, wsPendentes, "OFs Pendentes de Aprovação");
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    return [{
        filename: `Manutencao_OFs_Pendentes_${todayStr}.xlsx`,
        content: buffer.toString('base64')
    }];
}

function buildManutencaoEmailHtml(reportName, manutData) {
    const dataDate = manutData.generated_at;
    const dateFormatted = dataDate ? dataDate.split(' ')[0].split('-').reverse().join('/') : new Date().toLocaleDateString('pt-BR');
    const timeStr = dataDate && dataDate.includes(' ') ? dataDate.split(' ')[1].substring(0, 5) : '';
    
    // Filtra apenas o mês atual de pagamento (baseado na data real do calendário)
    const currentMonth = getCurrentMonth();
    const rows = currentMonth
        ? manutData.rows.filter(r => r.mes_pagamento === currentMonth)
        : manutData.rows;
    const currentMonthLabel = currentMonth || 'Mês Atual';
    
    let totalMedido = 0;
    let totalAprovado = 0;
    let totalPendente = 0;
    let countTotal = rows.length;
    let countAprovado = 0;
    let countPendente = 0;

    const macroStats = {
        'ROMPIMENTO': { totalVal: 0, aprovVal: 0, pendVal: 0, count: 0 },
        'MELHORIA':   { totalVal: 0, aprovVal: 0, pendVal: 0, count: 0 }
    };

    const monthIndexMap = { 2: 'FEV', 3: 'MAR', 4: 'ABR', 5: 'MAI', 6: 'JUN', 7: 'JUL', 8: 'AGO', 9: 'SET', 10: 'OUT' };
    const monthOrder = ['FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT'];

    rows.forEach(r => {
        const v = r.valor_medicao || 0;
        totalMedido += v;
        const hasColT = Boolean(r.wf2 && r.wf2 !== '-' && String(r.wf2).toUpperCase() !== 'NONE');
        
        const macro = getMacroCategory(r.tipo_atividade);
        if (macroStats[macro]) {
            macroStats[macro].count += 1;
            macroStats[macro].totalVal += v;
        }

        if (hasColT) {
            totalAprovado += v;
            countAprovado += 1;
            if (macroStats[macro]) macroStats[macro].aprovVal += v;
        } else {
            totalPendente += v;
            countPendente += 1;
            if (macroStats[macro]) macroStats[macro].pendVal += v;
        }
    });

    // Tabela de Pendências por Mês de Acionamento — usa TODA a base (todos os meses)
    const allRows = manutData.rows;
    const pendingByMonthAll = {};
    monthOrder.forEach(m => pendingByMonthAll[m] = { val: 0, count: 0 });
    let totalPendenteAll = 0;
    allRows.forEach(r => {
        const v = r.valor_medicao || 0;
        const hasColT = Boolean(r.wf2 && r.wf2 !== '-' && String(r.wf2).toUpperCase() !== 'NONE');
        if (!hasColT) {
            totalPendenteAll += v;
            if (r.data_acionamento && r.data_acionamento !== '-') {
                try {
                    const parts = r.data_acionamento.split(' ')[0].split('/');
                    if (parts.length === 3) {
                        const mNum = parseInt(parts[1]);
                        const mCode = monthIndexMap[mNum];
                        if (mCode && pendingByMonthAll[mCode]) {
                            pendingByMonthAll[mCode].val += v;
                            pendingByMonthAll[mCode].count += 1;
                        }
                    }
                } catch(e) {}
            }
        }
    });

    // Tabela de Pendências por Mês de Acionamento (todos os meses da base)
    const monthRowsHtml = monthOrder.map(m => {
        const st = pendingByMonthAll[m];
        if (st.val === 0 && st.count === 0) return '';
        const pct = totalPendenteAll > 0 ? ((st.val / totalPendenteAll) * 100).toFixed(1).replace('.', ',') : '0,0';
        return `
        <tr style="border-bottom: 1px solid #e1e8ed;">
            <td style="padding: 10px 16px; font-size: 13px; color: #2d3748; font-weight: 700;">
                Mês de Acionamento (${m})
            </td>
            <td style="padding: 10px 16px; font-size: 13px; color: #d97706; font-weight: 800; text-align: right;">
                ${formatCurrency(st.val)}
            </td>
            <td style="padding: 10px 16px; font-size: 12px; color: #64748b; font-weight: 600; text-align: center;">
                ${st.count.toLocaleString('pt-BR')} OFs
            </td>
            <td style="padding: 10px 16px; font-size: 12px; color: #0284c7; font-weight: 700; text-align: right;">
                ${pct}%
            </td>
        </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${reportName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f6f9; padding: 20px 0;">
        <tr>
            <td align="center">
                <table width="640" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid #e1e8ed;">
                    
                    <!-- HEADER -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #0057b8 0%, #1976d2 100%); padding: 32px 40px; text-align: left;">
                            <h1 style="margin: 0; font-size: 24px; color: #ffffff; font-weight: 800; letter-spacing: -0.5px;">${reportName}</h1>
                            <div style="font-size: 13px; color: #bbdefb; margin-top: 6px;">
                                Mês Base: <span style="color: #ffffff; font-weight: 800; background: rgba(255,255,255,0.15); padding: 2px 10px; border-radius: 12px;">${currentMonthLabel}</span>
                            </div>
                            <div style="font-size: 12px; color: #90caf9; margin-top: 6px;">
                                Atualizado em: <span style="color: #e3f2fd; font-weight: 600;">${dateFormatted}</span> ${timeStr}
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="height: 4px; background: linear-gradient(90deg, #42a5f5, #1565c0);"></td>
                    </tr>

                    <!-- CARDS DE MÉTRICAS KPIs PRINCIPAIS -->
                    <tr>
                        <td style="padding: 28px 40px 10px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <!-- TOTAL MEDIDO -->
                                    <td width="31%" style="background: #f8fafc; border-radius: 10px; border-top: 4px solid #0057b8; padding: 16px; text-align: center; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
                                        <div style="font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 800; margin-bottom: 4px;">TOTAL MEDIDO</div>
                                        <div style="font-size: 17px; font-weight: 900; color: #0f172a; line-height: 1.2;">${formatCurrency(totalMedido)}</div>
                                        <div style="font-size: 11px; color: #64748b; margin-top: 4px; font-weight: 600;">${countTotal.toLocaleString('pt-BR')} OFs</div>
                                    </td>

                                    <td width="3.5%"></td>

                                    <!-- TOTAL APROVADO -->
                                    <td width="31%" style="background: rgba(16,185,129,0.06); border-radius: 10px; border-top: 4px solid #10b981; padding: 16px; text-align: center; border-left: 1px solid rgba(16,185,129,0.2); border-right: 1px solid rgba(16,185,129,0.2); border-bottom: 1px solid rgba(16,185,129,0.2); vertical-align: top;">
                                        <div style="font-size: 10px; color: #047857; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 800; margin-bottom: 4px;">TOTAL APROVADO</div>
                                        <div style="font-size: 17px; font-weight: 900; color: #10b981; line-height: 1.2;">${formatCurrency(totalAprovado)}</div>
                                        <div style="font-size: 11px; color: #047857; margin-top: 4px; font-weight: 600;">${countAprovado.toLocaleString('pt-BR')} OFs</div>
                                    </td>

                                    <td width="3.5%"></td>

                                    <!-- TOTAL PENDENTE -->
                                    <td width="31%" style="background: rgba(245,158,11,0.06); border-radius: 10px; border-top: 4px solid #f59e0b; padding: 16px; text-align: center; border-left: 1px solid rgba(245,158,11,0.2); border-right: 1px solid rgba(245,158,11,0.2); border-bottom: 1px solid rgba(245,158,11,0.2); vertical-align: top;">
                                        <div style="font-size: 10px; color: #b45309; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 800; margin-bottom: 4px;">TOTAL PENDENTE</div>
                                        <div style="font-size: 17px; font-weight: 900; color: #d97706; line-height: 1.2;">${formatCurrency(totalPendente)}</div>
                                        <div style="font-size: 11px; color: #b45309; margin-top: 4px; font-weight: 600;">${countPendente.toLocaleString('pt-BR')} OFs</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- MACRO CATEGORIAS (ROMPIMENTO VS MELHORIA) -->
                    <tr>
                        <td style="padding: 20px 40px 10px;">
                            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #475569; font-weight: 800; margin-bottom: 12px;">DESDOBRAMENTO POR MACRO CATEGORIA</div>
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <!-- ROMPIMENTO -->
                                    <td width="48%" style="background: #fef2f2; border-left: 4px solid #ef4444; border-radius: 10px; padding: 16px; border-top: 1px solid #fee2e2; border-right: 1px solid #fee2e2; border-bottom: 1px solid #fee2e2; vertical-align: top;">
                                        <div style="font-size: 12px; font-weight: 900; color: #ef4444; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">ROMPIMENTO</div>
                                        <div style="font-size: 18px; font-weight: 900; color: #0f172a; margin-bottom: 10px;">${formatCurrency(macroStats['ROMPIMENTO'].totalVal)}</div>
                                        <div style="font-size: 11px; color: #10b981; font-weight: 700;">✔ Aprovado: ${formatCurrency(macroStats['ROMPIMENTO'].aprovVal)}</div>
                                        <div style="font-size: 11px; color: #d97706; font-weight: 700; margin-top: 3px;">⏳ Pendente: ${formatCurrency(macroStats['ROMPIMENTO'].pendVal)}</div>
                                    </td>

                                    <td width="4%"></td>

                                    <!-- MELHORIA -->
                                    <td width="48%" style="background: #f0f9ff; border-left: 4px solid #0284c7; border-radius: 10px; padding: 16px; border-top: 1px solid #e0f2fe; border-right: 1px solid #e0f2fe; border-bottom: 1px solid #e0f2fe; vertical-align: top;">
                                        <div style="font-size: 12px; font-weight: 900; color: #0284c7; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">MELHORIA</div>
                                        <div style="font-size: 18px; font-weight: 900; color: #0f172a; margin-bottom: 10px;">${formatCurrency(macroStats['MELHORIA'].totalVal)}</div>
                                        <div style="font-size: 11px; color: #10b981; font-weight: 700;">✔ Aprovado: ${formatCurrency(macroStats['MELHORIA'].aprovVal)}</div>
                                        <div style="font-size: 11px; color: #d97706; font-weight: 700; margin-top: 3px;">⏳ Pendente: ${formatCurrency(macroStats['MELHORIA'].pendVal)}</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- PENDÊNCIAS POR MÊS DE ACIONAMENTO -->
                    <tr>
                        <td style="padding: 20px 40px 10px;">
                            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #475569; font-weight: 800; margin-bottom: 10px;">VALOR PENDENTE POR MÊS DE ACIONAMENTO</div>
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; border-collapse: collapse;">
                                <thead>
                                    <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                                        <th style="padding: 10px 16px; font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; text-align: left;">Mês Acionamento</th>
                                        <th style="padding: 10px 16px; font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; text-align: right;">Valor Pendente</th>
                                        <th style="padding: 10px 16px; font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; text-align: center;">Qtd OSs</th>
                                        <th style="padding: 10px 16px; font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; text-align: right;">% Pendente</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${monthRowsHtml}
                                </tbody>
                            </table>
                        </td>
                    </tr>

                    <!-- AVISO DE ANEXO EXCEL -->
                    <tr>
                        <td style="padding: 15px 40px 10px;">
                            <div style="background: #f0fdf4; border: 1px dashed #10b981; border-radius: 10px; padding: 14px 20px; text-align: center; color: #047857; font-size: 13px; font-weight: 600;">
                                <strong>Planilha Excel (.xlsx) anexada a este e-mail:</strong><br>
                                <span style="font-size: 12px; font-weight: 400; color: #059669;">Contém a listagem detalhada de todas as OFs Pendentes de Aprovação do mês ${currentMonthLabel}.</span>
                            </div>
                        </td>
                    </tr>

                    <!-- BOTÃO PARA O BI -->
                    <tr>
                        <td style="padding: 20px 40px 30px; text-align: center;">
                            <a href="https://jle-bi.vercel.app/#manutencao" style="display: inline-block; background: #004f71; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 700; box-shadow: 0 4px 12px rgba(0,79,113,0.2);">
                                Abrir Painel de Manutenção no BI JLE
                            </a>
                        </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                        <td style="background: #f8fafc; padding: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
                            Este é um informativo automático do BI JLE Telecom.
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
    loadManutencaoData,
    generateExcelAttachments,
    buildManutencaoEmailHtml
};
