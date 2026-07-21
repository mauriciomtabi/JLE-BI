// api/claro-report-helper.js
// Utility module to process Analítico Claro data, generate Excel (.xlsx) attachments, and build HTML email reports.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function loadClaroData() {
    let filePath = path.join(__dirname, '../cobranca_data.js');
    if (!fs.existsSync(filePath)) {
        filePath = path.join(process.cwd(), 'cobranca_data.js');
    }
    
    if (!fs.existsSync(filePath)) {
        throw new Error("Arquivo cobranca_data.js não localizado no servidor.");
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/const db = ({[\s\S]*?});\r?\n/);
    if (!match) {
        throw new Error("Não foi possível decodificar os dados de cobranca_data.js.");
    }
    
    const db = JSON.parse(match[1]);
    const l = db.lookups;
    
    const rows = db.rows.map(r => ({
        pep: r[0] || '-',
        categoria: l.categorias[r[1]] || '-',
        os: r[2] || '-',
        cidade: l.cidades[r[3]] || '-',
        uf: l.ufs[r[4]] || '-',
        projeto: l.projetos[r[5]] || '-',
        projeto_gerencial: l.projetos_gerenciais[r[6]] || '-',
        tipo_atividade: l.tipos_atividade[r[7]] || '-',
        fase_atual: l.fase_atual[r[8]] || '-',
        contrato_numero: l.contratos[r[9]] || '-',
        item_descritivo: l.itens_descritivos[r[10]] || '-',
        tipo_despesa: l.tipos_despesa[r[11]] || '-',
        objeto_do_contrato: l.objetos_contrato[r[12]] || '-',
        valor_total: r[13] || 0,
        data_cadastro: r[14] || '-',
        data_aprovacao: r[15] || '-',
        tempo_aprovacao: r[16] !== null && r[16] !== undefined ? r[16] : '-',
        user_inclusao_medicao: l.users[r[17]] || '-',
        numero_medicao: r[18] || '-',
        numero_pedido: r[19] || '-',
        user_pedido: l.users[r[20]] || '-',
        fase_atual_de_para: l.fase_de_para[r[21]] || '-',
        mes_medicao: r[22] || '-',
        data_inclusao_lpu: r[23] || '-'
    }));
    
    return {
        generated_at: db.generated_at,
        rows: rows
    };
}

function formatCurrency(val) {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function calculateAgeInDays(dateStr, refDateStr) {
    if (!dateStr || dateStr === '-') return -1;
    try {
        const parts = dateStr.split('-');
        if (parts.length !== 3) return -1;
        const cadDate = new Date(parts[0], parts[1] - 1, parts[2]);
        const refDate = refDateStr ? new Date(refDateStr.split(' ')[0]) : new Date();
        const diff = refDate - cadDate;
        return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    } catch {
        return -1;
    }
}

function generateExcelAttachments(claroData) {
    const todayStr = new Date().toISOString().substring(0, 10);
    
    // 1. Sem Aprovação (Fases: EM EXECUÇÃO, EXECUTADO)
    const semAprovRows = claroData.rows.filter(r => {
        const f = String(r.fase_atual_de_para || '').toUpperCase().trim();
        return f === 'EM EXECUÇÃO' || f === 'EXECUTADO';
    });
    
    // 2. Aguardando Pedido (Fase: APROVADO)
    const aprovadoRows = claroData.rows.filter(r => {
        const f = String(r.fase_atual_de_para || '').toUpperCase().trim();
        return f === 'APROVADO';
    });
    
    const mapToExcelJson = (arr) => arr.map(r => ({
        "OS": r.os,
        "Categoria": r.categoria,
        "Projeto Gerencial": r.projeto_gerencial,
        "Cidade": r.cidade,
        "UF": r.uf,
        "Data Cadastro": r.data_cadastro,
        "Data Aprovação": r.data_aprovacao,
        "Fase Original": r.fase_atual,
        "Fase (De/Para)": r.fase_atual_de_para,
        "Contrato": r.contrato_numero,
        "Item Descritivo": r.item_descritivo,
        "Valor Total (R$)": r.valor_total
    }));

    // Gerar Workbook 1: Sem Aprovação
    const wb1 = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(mapToExcelJson(semAprovRows));
    XLSX.utils.book_append_sheet(wb1, ws1, "Sem Aprovação");
    const buf1 = XLSX.write(wb1, { type: 'buffer', bookType: 'xlsx' });
    
    // Gerar Workbook 2: Aguardando Pedido
    const wb2 = XLSX.utils.book_new();
    const ws2 = XLSX.utils.json_to_sheet(mapToExcelJson(aprovadoRows));
    XLSX.utils.book_append_sheet(wb2, ws2, "Aguardando Pedido");
    const buf2 = XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' });

    // Distinct OS counts (excluding '-' placeholder)
    const getDistinctOSCount = (arr) => new Set(arr.map(r => r.os).filter(os => os && os !== '-')).size;

    return {
        attachments: [
            {
                filename: `Sem_Aprovacao_${todayStr}.xlsx`,
                content: buf1.toString('base64')
            },
            {
                filename: `Aguardando_Pedido_${todayStr}.xlsx`,
                content: buf2.toString('base64')
            }
        ],
        semAprovCount: getDistinctOSCount(semAprovRows),
        semAprovSum: semAprovRows.reduce((acc, c) => acc + c.valor_total, 0),
        aprovCount: getDistinctOSCount(aprovadoRows),
        aprovSum: aprovadoRows.reduce((acc, c) => acc + c.valor_total, 0),
        semAprovRows,
        aprovadoRows
    };
}

function calculateAgingMetrics(rows, refDateStr) {
    const osAgeMap = {};
    rows.forEach(r => {
        const os = r.os;
        if (!os || os === '-') return;
        const age = calculateAgeInDays(r.data_cadastro, refDateStr);
        if (!osAgeMap[os]) {
            osAgeMap[os] = { os, age, val: 0 };
        }
        osAgeMap[os].val += r.valor_total;
    });

    const osList = Object.values(osAgeMap);

    const b3m = osList.filter(o => o.age > 90 && o.age <= 180);
    const b6m = osList.filter(o => o.age > 180 && o.age <= 365);
    const b1y = osList.filter(o => o.age > 365);

    const sum = items => items.reduce((acc, c) => acc + c.val, 0);

    return {
        m3: { count: b3m.length, sum: sum(b3m) },
        m6: { count: b6m.length, sum: sum(b6m) },
        y1: { count: b1y.length, sum: sum(b1y) }
    };
}

function buildClaroEmailHtml(reportName, metrics, dataDate) {
    const dateFormatted = dataDate ? dataDate.split(' ')[0].split('-').reverse().join('/') : new Date().toLocaleDateString('pt-BR');
    const timeStr = dataDate && dataDate.includes(' ') ? dataDate.split(' ')[1].substring(0, 5) : '';
    
    // Métricas de Aging por Período (>3M, >6M, >1Ano)
    const semAprovAging = calculateAgingMetrics(metrics.semAprovRows, dataDate);
    const aprovAging = calculateAgingMetrics(metrics.aprovadoRows, dataDate);

    // Totais por Faixa de Aging (Sem Aprovação + Aguardando Pedido)
    const totalAging = {
        m3: { count: semAprovAging.m3.count + aprovAging.m3.count, sum: semAprovAging.m3.sum + aprovAging.m3.sum },
        m6: { count: semAprovAging.m6.count + aprovAging.m6.count, sum: semAprovAging.m6.sum + aprovAging.m6.sum },
        y1: { count: semAprovAging.y1.count + aprovAging.y1.count, sum: semAprovAging.y1.sum + aprovAging.y1.sum }
    };

    // Resumo por Categoria de Serviço
    const catSummary = {};
    const processRows = (rows, key) => {
        rows.forEach(r => {
            const cat = r.categoria && r.categoria !== '-' ? r.categoria : 'OUTROS';
            if (!catSummary[cat]) catSummary[cat] = { semAprov: 0, aprov: 0 };
            catSummary[cat][key] += r.valor_total;
        });
    };
    processRows(metrics.semAprovRows, 'semAprov');
    processRows(metrics.aprovadoRows, 'aprov');

    const sortedCats = Object.keys(catSummary).sort((a, b) => {
        const totalA = catSummary[a].semAprov + catSummary[a].aprov;
        const totalB = catSummary[b].semAprov + catSummary[b].aprov;
        return totalB - totalA;
    });

    const catRowsHtml = sortedCats.map(cat => {
        return `
        <tr style="border-bottom: 1px solid #e1e8ed;">
            <td style="padding: 12px 16px; font-size: 13px; color: #2d3748; font-weight: 600;">
                ${cat}
            </td>
            <td style="padding: 12px 16px; font-size: 13px; color: #e67e22; font-weight: 700; text-align: right;">
                ${catSummary[cat].semAprov > 0 ? formatCurrency(catSummary[cat].semAprov) : '-'}
            </td>
            <td style="padding: 12px 16px; font-size: 13px; color: #27ae60; font-weight: 700; text-align: right;">
                ${catSummary[cat].aprov > 0 ? formatCurrency(catSummary[cat].aprov) : '-'}
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
                    
                    <!-- HEADER IDÊNTICO AO MDU -->
                    <tr>
                        <td style="background: #004f71; padding: 32px 40px; text-align: left;">
                            <h1 style="margin: 0; font-size: 26px; color: #ffffff; font-weight: 800;">${reportName}</h1>
                            <div style="font-size: 13px; color: #e0e0e0; margin-top: 8px;">
                                Atualizado em: <span style="text-decoration: underline; color: #38ef7d; font-weight: 700;">${dateFormatted}</span> ${timeStr}
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="height: 4px; background: #f39f18;"></td>
                    </tr>

                    <!-- CARDS DE MÉTRICAS KPIs PRINCIPAIS -->
                    <tr>
                        <td style="padding: 30px 40px 10px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <!-- CARD SEM APROVAÇÃO -->
                                    <td width="48%" style="background: rgba(230,126,34,0.06); border-radius: 12px; border-left: 5px solid #e67e22; padding: 20px; text-align: center; border-top: 1px solid rgba(230,126,34,0.15); border-right: 1px solid rgba(230,126,34,0.15); border-bottom: 1px solid rgba(230,126,34,0.15);">
                                        <div style="font-size: 11px; color: #d35400; text-transform: uppercase; letter-spacing: 1px; font-weight: 800; margin-bottom: 6px;">SEM APROVAÇÃO</div>
                                        <div style="font-size: 24px; font-weight: 800; color: #d35400; line-height: 1.2;">${formatCurrency(metrics.semAprovSum)}</div>
                                        <div style="font-size: 12px; color: #7f8c8d; margin-top: 6px; font-weight: 600;">${metrics.semAprovCount} Ordens de Serviço</div>
                                    </td>
                                    <td width="4%"></td>
                                    <!-- CARD AGUARDANDO PEDIDO -->
                                    <td width="48%" style="background: rgba(39,174,96,0.06); border-radius: 12px; border-left: 5px solid #27ae60; padding: 20px; text-align: center; border-top: 1px solid rgba(39,174,96,0.15); border-right: 1px solid rgba(39,174,96,0.15); border-bottom: 1px solid rgba(39,174,96,0.15);">
                                        <div style="font-size: 11px; color: #27ae60; text-transform: uppercase; letter-spacing: 1px; font-weight: 800; margin-bottom: 6px;">AGUARDANDO PEDIDO</div>
                                        <div style="font-size: 24px; font-weight: 800; color: #27ae60; line-height: 1.2;">${formatCurrency(metrics.aprovSum)}</div>
                                        <div style="font-size: 12px; color: #7f8c8d; margin-top: 6px; font-weight: 600;">${metrics.aprovCount} Ordens de Serviço</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- SEÇÃO: RESUMO FINANCEIRO POR CATEGORIA (LOGO ABAIXO DOS CARDS) -->
                    <tr>
                        <td style="padding: 20px 40px 10px;">
                            <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #57606f; font-weight: 700; margin-bottom: 12px;">RESUMO FINANCEIRO POR CATEGORIA</div>
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e1e8ed; border-radius: 8px; overflow: hidden; background: #ffffff;">
                                <tr style="background: #f8f9fa;">
                                    <th style="padding: 12px 16px; text-align: left; font-size: 12px; color: #57606f; font-weight: 700;">Categoria</th>
                                    <th style="padding: 12px 16px; text-align: right; font-size: 12px; color: #e67e22; font-weight: 700;">Sem Aprovação</th>
                                    <th style="padding: 12px 16px; text-align: right; font-size: 12px; color: #27ae60; font-weight: 700;">Aguardando Pedido</th>
                                </tr>
                                ${catRowsHtml}
                            </table>
                        </td>
                    </tr>

                    <!-- SEÇÃO: AGING DE ORDENS DE SERVIÇO EM ABERTO (3 CARDS PREMIUM LADO A LADO) -->
                    <tr>
                        <td style="padding: 20px 40px 10px;">
                            <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #57606f; font-weight: 700; margin-bottom: 12px;">AGING DE ORDENS DE SERVIÇO EM ABERTO</div>
                            
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <!-- CARD 1: 3 A 6 MESES -->
                                    <td width="31%" style="background: rgba(241,196,15,0.08); border-radius: 12px; border-left: 5px solid #f1c40f; padding: 18px 14px; text-align: center; border-top: 1px solid rgba(241,196,15,0.2); border-right: 1px solid rgba(241,196,15,0.2); border-bottom: 1px solid rgba(241,196,15,0.2); vertical-align: top;">
                                        <div style="font-size: 11px; color: #d35400; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 800; margin-bottom: 6px;">3 A 6 MESES</div>
                                        <div style="font-size: 17px; font-weight: 800; color: #d35400; line-height: 1.2;">${formatCurrency(totalAging.m3.sum)}</div>
                                        <div style="font-size: 11px; color: #7f8c8d; margin-top: 6px; font-weight: 600;">${totalAging.m3.count} Ordens de Serviço</div>
                                    </td>

                                    <td width="3.5%"></td>

                                    <!-- CARD 2: 6 A 12 MESES -->
                                    <td width="31%" style="background: rgba(230,126,34,0.08); border-radius: 12px; border-left: 5px solid #e67e22; padding: 18px 14px; text-align: center; border-top: 1px solid rgba(230,126,34,0.2); border-right: 1px solid rgba(230,126,34,0.2); border-bottom: 1px solid rgba(230,126,34,0.2); vertical-align: top;">
                                        <div style="font-size: 11px; color: #d35400; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 800; margin-bottom: 6px;">6 A 12 MESES</div>
                                        <div style="font-size: 17px; font-weight: 800; color: #d35400; line-height: 1.2;">${formatCurrency(totalAging.m6.sum)}</div>
                                        <div style="font-size: 11px; color: #7f8c8d; margin-top: 6px; font-weight: 600;">${totalAging.m6.count} Ordens de Serviço</div>
                                    </td>

                                    <td width="3.5%"></td>

                                    <!-- CARD 3: MAIS DE 1 ANO -->
                                    <td width="31%" style="background: rgba(231,76,60,0.08); border-radius: 12px; border-left: 5px solid #e74c3c; padding: 18px 14px; text-align: center; border-top: 1px solid rgba(231,76,60,0.2); border-right: 1px solid rgba(231,76,60,0.2); border-bottom: 1px solid rgba(231,76,60,0.2); vertical-align: top;">
                                        <div style="font-size: 11px; color: #c0392b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 800; margin-bottom: 6px;">MAIS DE 1 ANO</div>
                                        <div style="font-size: 17px; font-weight: 800; color: #c0392b; line-height: 1.2;">${formatCurrency(totalAging.y1.sum)}</div>
                                        <div style="font-size: 11px; color: #7f8c8d; margin-top: 6px; font-weight: 600;">${totalAging.y1.count} Ordens de Serviço</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- AVISO DE ANEXOS EXCEL -->
                    <tr>
                        <td style="padding: 15px 40px 10px;">
                            <div style="background: #eef9f1; border: 1px dashed #27ae60; border-radius: 10px; padding: 14px 20px; text-align: center; color: #1e824c; font-size: 13px; font-weight: 600;">
                                <strong>2 Planilhas Excel (.xlsx) anexadas a este e-mail:</strong><br>
                                <span style="font-size: 12px; font-weight: 400; color: #27ae60;">Listagens detalhadas de todas as OSs em Sem Aprovação e Aguardando Pedido.</span>
                            </div>
                        </td>
                    </tr>

                    <!-- BOTAO PARA O BI -->
                    <tr>
                        <td style="padding: 20px 40px 30px; text-align: center;">
                            <a href="https://jle-bi.vercel.app/#cobranca" style="display: inline-block; background: #004f71; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 700; box-shadow: 0 4px 12px rgba(0,79,113,0.2);">
                                Abrir Analítico Claro no BI JLE
                            </a>
                        </td>
                    </tr>

                    <!-- FOOTER EXATO SOLICITADO -->
                    <tr>
                        <td style="background: #f8f9fa; padding: 20px; border-top: 1px solid #e1e8ed; text-align: center; font-size: 12px; color: #747d8c;">
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
    loadClaroData,
    generateExcelAttachments,
    buildClaroEmailHtml
};
