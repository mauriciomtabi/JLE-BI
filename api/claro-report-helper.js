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

// SVGs elegantes e profissionais para cada Categoria
const CATEGORY_ICONS = {
    'PLANTA EXTERNA': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
    'RECUPERAÇÃO REDE': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    'FIXO MENSAL': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/></svg>`,
    'CONSTRUÇÃO': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="8" rx="1"/><path d="M17 14v7"/><path d="M7 14v7"/><path d="M17 3v3"/><path d="M7 3v3"/></svg>`,
    'DESATIVAÇÃO': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
    'ATIVAÇÃO': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`
};

const DEFAULT_CAT_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

function buildClaroEmailHtml(reportName, metrics, dataDate) {
    const dateFormatted = dataDate ? dataDate.split(' ')[0].split('-').reverse().join('/') : new Date().toLocaleDateString('pt-BR');
    const timeStr = dataDate && dataDate.includes(' ') ? dataDate.split(' ')[1].substring(0, 5) : '';
    
    // Métricas de Aging por Período (>3M, >6M, >1Ano)
    const semAprovAging = calculateAgingMetrics(metrics.semAprovRows, dataDate);
    const aprovAging = calculateAgingMetrics(metrics.aprovadoRows, dataDate);

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

    const catRowsHtml = sortedCats.map((cat, idx) => {
        const iconSvg = CATEGORY_ICONS[cat] || DEFAULT_CAT_ICON;
        const bgRow = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        return `
        <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${bgRow}; transition: background 0.2s;">
            <td style="padding: 12px 18px;">
                <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td style="vertical-align: middle; padding-right: 12px;">
                            <div style="width: 32px; height: 32px; border-radius: 8px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 32px;">
                                ${iconSvg}
                            </div>
                        </td>
                        <td style="vertical-align: middle;">
                            <span style="font-size: 13px; color: #1e293b; font-weight: 700; letter-spacing: -0.2px;">${cat}</span>
                        </td>
                    </tr>
                </table>
            </td>
            <td style="padding: 12px 18px; font-size: 13px; color: #ea580c; font-weight: 800; text-align: right; font-family: 'Segoe UI', Tahoma, sans-serif;">
                ${catSummary[cat].semAprov > 0 ? formatCurrency(catSummary[cat].semAprov) : '<span style="color:#cbd5e1;">-</span>'}
            </td>
            <td style="padding: 12px 18px; font-size: 13px; color: #16a34a; font-weight: 800; text-align: right; font-family: 'Segoe UI', Tahoma, sans-serif;">
                ${catSummary[cat].aprov > 0 ? formatCurrency(catSummary[cat].aprov) : '<span style="color:#cbd5e1;">-</span>'}
            </td>
        </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${reportName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 30px 0;">
        <tr>
            <td align="center">
                <table width="640" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 12px 36px rgba(15,23,42,0.08); border: 1px solid #e2e8f0;">
                    
                    <!-- HEADER EXECUTIVO IDÊNTICO AO MDU -->
                    <tr>
                        <td style="background: #004f71; padding: 32px 40px; text-align: left;">
                            <h1 style="margin: 0; font-size: 26px; color: #ffffff; font-weight: 800; letter-spacing: -0.5px;">${reportName}</h1>
                            <div style="font-size: 13px; color: #94a3b8; margin-top: 8px; font-weight: 500;">
                                Atualizado em: <span style="text-decoration: underline; color: #38ef7d; font-weight: 700;">${dateFormatted}</span> ${timeStr}
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="height: 4px; background: #f39f18;"></td>
                    </tr>

                    <!-- CARDS DE MÉTRICAS KPIs PRINCIPAIS -->
                    <tr>
                        <td style="padding: 32px 40px 16px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <!-- CARD SEM APROVAÇÃO -->
                                    <td width="48%" style="background: #fff7ed; border-radius: 14px; border-left: 5px solid #ea580c; padding: 22px 20px; border-top: 1px solid #ffedd5; border-right: 1px solid #ffedd5; border-bottom: 1px solid #ffedd5;">
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                                <td style="font-size: 11px; color: #c2410c; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 800;">SEM APROVAÇÃO</td>
                                            </tr>
                                            <tr>
                                                <td style="padding-top: 8px; font-size: 25px; font-weight: 800; color: #9a3412; line-height: 1.1; font-family: 'Segoe UI', Roboto, sans-serif;">${formatCurrency(metrics.semAprovSum)}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding-top: 8px; font-size: 12px; color: #ea580c; font-weight: 700;">
                                                    <span style="background: rgba(234,88,12,0.12); padding: 3px 9px; border-radius: 12px;">${metrics.semAprovCount} OSs Pendentes</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                    <td width="4%"></td>
                                    <!-- CARD AGUARDANDO PEDIDO -->
                                    <td width="48%" style="background: #f0fdf4; border-radius: 14px; border-left: 5px solid #16a34a; padding: 22px 20px; border-top: 1px solid #dcfce7; border-right: 1px solid #dcfce7; border-bottom: 1px solid #dcfce7;">
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                                <td style="font-size: 11px; color: #15803d; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 800;">AGUARDANDO PEDIDO</td>
                                            </tr>
                                            <tr>
                                                <td style="padding-top: 8px; font-size: 25px; font-weight: 800; color: #166534; line-height: 1.1; font-family: 'Segoe UI', Roboto, sans-serif;">${formatCurrency(metrics.aprovSum)}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding-top: 8px; font-size: 12px; color: #16a34a; font-weight: 700;">
                                                    <span style="background: rgba(22,163,74,0.12); padding: 3px 9px; border-radius: 12px;">${metrics.aprovCount} OSs Aprovadas</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- BANNER REMODELADO: ARQUIVOS EXCEL ANEXADOS (EXECUTIVO) -->
                    <tr>
                        <td style="padding: 10px 40px 24px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #0284c7; border-radius: 12px; padding: 16px 20px;">
                                <tr>
                                    <td width="42" style="vertical-align: middle;">
                                        <div style="width: 36px; height: 36px; border-radius: 8px; background: #e0f2fe; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 36px;">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M10 9h2"/></svg>
                                        </div>
                                    </td>
                                    <td style="vertical-align: middle; padding-left: 12px;">
                                        <div style="font-size: 13px; font-weight: 800; color: #0f172a; letter-spacing: -0.2px;">2 Planilhas Excel (.xlsx) Anexadas a este E-mail</div>
                                        <div style="font-size: 12px; color: #475569; margin-top: 3px; font-weight: 500;">
                                            Listagens analíticas completas: 
                                            <strong style="color: #ea580c;">Sem_Aprovacao.xlsx</strong> e 
                                            <strong style="color: #16a34a;">Aguardando_Pedido.xlsx</strong>
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- SEÇÃO REMODELADA: AGING DE OSs EM ABERTO (EXECUTIVE GRID) -->
                    <tr>
                        <td style="padding: 8px 40px 24px;">
                            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; font-weight: 800; margin-bottom: 14px;">📊 AGING DE OSs EM ABERTO (TEMPO DE ESPERA)</div>
                            
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
                                <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                                    <th style="padding: 12px 18px; text-align: left; font-size: 11px; color: #475569; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;">Período em Aberto</th>
                                    <th style="padding: 12px 18px; text-align: right; font-size: 11px; color: #ea580c; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;">Sem Aprovação</th>
                                    <th style="padding: 12px 18px; text-align: right; font-size: 11px; color: #16a34a; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;">Aguardando Pedido</th>
                                </tr>
                                
                                <!-- > 3 MESES -->
                                <tr style="border-bottom: 1px solid #f1f5f9;">
                                    <td style="padding: 14px 18px; vertical-align: middle;">
                                        <span style="background: #fef3c7; color: #b45309; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 800; display: inline-block; margin-bottom: 3px;">3 a 6 MESES</span>
                                        <div style="font-size: 12px; color: #475569; font-weight: 600;">91 a 180 dias de espera</div>
                                    </td>
                                    <td style="padding: 14px 18px; text-align: right; vertical-align: middle;">
                                        <div style="font-size: 14px; font-weight: 800; color: #b45309;">${formatCurrency(semAprovAging.m3.sum)}</div>
                                        <div style="font-size: 11px; color: #78350f; font-weight: 700; margin-top: 2px;">${semAprovAging.m3.count} OSs</div>
                                    </td>
                                    <td style="padding: 14px 18px; text-align: right; vertical-align: middle;">
                                        ${aprovAging.m3.sum > 0 ? `
                                            <div style="font-size: 14px; font-weight: 800; color: #15803d;">${formatCurrency(aprovAging.m3.sum)}</div>
                                            <div style="font-size: 11px; color: #166534; font-weight: 700; margin-top: 2px;">${aprovAging.m3.count} OSs</div>
                                        ` : '<span style="color:#cbd5e1; font-weight:600;">-</span>'}
                                    </td>
                                </tr>

                                <!-- > 6 MESES -->
                                <tr style="border-bottom: 1px solid #f1f5f9; background: #fffcf5;">
                                    <td style="padding: 14px 18px; vertical-align: middle;">
                                        <span style="background: #ffedd5; color: #c2410c; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 800; display: inline-block; margin-bottom: 3px;">6 a 12 MESES</span>
                                        <div style="font-size: 12px; color: #475569; font-weight: 600;">181 a 365 dias de espera</div>
                                    </td>
                                    <td style="padding: 14px 18px; text-align: right; vertical-align: middle;">
                                        <div style="font-size: 14px; font-weight: 800; color: #c2410c;">${formatCurrency(semAprovAging.m6.sum)}</div>
                                        <div style="font-size: 11px; color: #9a3412; font-weight: 700; margin-top: 2px;">${semAprovAging.m6.count} OSs</div>
                                    </td>
                                    <td style="padding: 14px 18px; text-align: right; vertical-align: middle;">
                                        ${aprovAging.m6.sum > 0 ? `
                                            <div style="font-size: 14px; font-weight: 800; color: #15803d;">${formatCurrency(aprovAging.m6.sum)}</div>
                                            <div style="font-size: 11px; color: #166534; font-weight: 700; margin-top: 2px;">${aprovAging.m6.count} OSs</div>
                                        ` : '<span style="color:#cbd5e1; font-weight:600;">-</span>'}
                                    </td>
                                </tr>

                                <!-- > 1 ANO -->
                                <tr style="background: #fef2f2;">
                                    <td style="padding: 14px 18px; vertical-align: middle;">
                                        <span style="background: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 800; display: inline-block; margin-bottom: 3px;">MAIS DE 1 ANO</span>
                                        <div style="font-size: 12px; color: #991b1b; font-weight: 700;">Acima de 365 dias em aberto</div>
                                    </td>
                                    <td style="padding: 14px 18px; text-align: right; vertical-align: middle;">
                                        <div style="font-size: 15px; font-weight: 800; color: #991b1b;">${formatCurrency(semAprovAging.y1.sum)}</div>
                                        <div style="font-size: 11px; color: #991b1b; font-weight: 800; margin-top: 2px;">${semAprovAging.y1.count} OSs Criticas</div>
                                    </td>
                                    <td style="padding: 14px 18px; text-align: right; vertical-align: middle;">
                                        ${aprovAging.y1.sum > 0 ? `
                                            <div style="font-size: 14px; font-weight: 800; color: #15803d;">${formatCurrency(aprovAging.y1.sum)}</div>
                                            <div style="font-size: 11px; color: #166534; font-weight: 700; margin-top: 2px;">${aprovAging.y1.count} OSs</div>
                                        ` : '<span style="color:#cbd5e1; font-weight:600;">-</span>'}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- SEÇÃO REMODELADA: RESUMO FINANCEIRO POR CATEGORIA (COM ÍCONES SVG EXECUTIVOS) -->
                    <tr>
                        <td style="padding: 8px 40px 32px;">
                            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; font-weight: 800; margin-bottom: 14px;">🏷️ RESUMO FINANCEIRO POR CATEGORIA</div>
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e2e8ed; border-radius: 12px; overflow: hidden; background: #ffffff;">
                                <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                                    <th style="padding: 12px 18px; text-align: left; font-size: 11px; color: #475569; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;">Categoria de Serviço</th>
                                    <th style="padding: 12px 18px; text-align: right; font-size: 11px; color: #ea580c; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;">Sem Aprovação</th>
                                    <th style="padding: 12px 18px; text-align: right; font-size: 11px; color: #16a34a; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;">Aguardando Pedido</th>
                                </tr>
                                ${catRowsHtml}
                            </table>
                        </td>
                    </tr>

                    <!-- BOTÃO CALL TO ACTION (ESTILO PREMIUM BI JLE) -->
                    <tr>
                        <td style="padding: 0 40px 40px; text-align: center;">
                            <a href="https://jle-bi.vercel.app/#cobranca" style="display: inline-block; background: linear-gradient(135deg, #004f71, #002d42); color: #ffffff; text-decoration: none; padding: 16px 36px; border-radius: 10px; font-size: 14px; font-weight: 800; letter-spacing: 0.3px; box-shadow: 0 6px 20px rgba(0,79,113,0.3); transition: all 0.2s;">
                                📊 Abrir Dashboard Analítico Claro
                            </a>
                        </td>
                    </tr>

                    <!-- FOOTER EXECUTIVO -->
                    <tr>
                        <td style="background: #f8fafc; padding: 24px 40px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; font-weight: 500;">
                            Informativo corporativo automático do <strong>BI JLE Telecom</strong> • Atualizado em tempo real
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
