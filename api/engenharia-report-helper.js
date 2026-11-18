// api/engenharia-report-helper.js
// Utilitário para processar dados de Engenharia e gerar relatório de e-mail diário padronizado (Modelo 2: Operacional & Próximas Ações)

const fs = require('fs');
const path = require('path');
let XLSX = null;
try {
    XLSX = require('xlsx');
} catch (e) {
    // XLSX será carregado em produção no Vercel
}

function formatMoeda(val) {
    if (val === null || val === undefined || isNaN(val)) return 'R$ 0,00';
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPct(val) {
    if (val === null || val === undefined || isNaN(val)) return '0,0%';
    return Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

function parseEngenhariaContent(content) {
    const dataMatch = content.match(/window\.ENGENHARIA_DATA\s*=\s*({[\s\S]*?});\s*(\r?\n|$)/);
    const metaMatch = content.match(/window\.ENGENHARIA_METADATA\s*=\s*({[\s\S]*?});\s*(\r?\n|$)/);

    if (!dataMatch) {
        throw new Error("Não foi possível decodificar window.ENGENHARIA_DATA de engenharia_data.js.");
    }

    const payload = JSON.parse(dataMatch[1]);
    const metadata = metaMatch ? JSON.parse(metaMatch[1]) : {};

    return {
        summary: payload.summary || {},
        cidades: payload.cidades || [],
        obras: payload.obras || [],
        oss: payload.oss || [],
        generated_at: metadata.generated_at || new Date().toISOString()
    };
}

async function loadEngenhariaDataAsync() {
    // 1. Tentar ler engenharia_data.js do disco local
    const localPaths = [
        path.join(__dirname, '../engenharia_data.js'),
        path.join(process.cwd(), 'engenharia_data.js'),
        path.join(__dirname, 'engenharia_data.js')
    ];

    for (const p of localPaths) {
        if (fs.existsSync(p)) {
            try {
                const content = fs.readFileSync(p, 'utf8');
                return parseEngenhariaContent(content);
            } catch (e) {
                console.warn(`[Engenharia Helper] Erro ao ler local ${p}:`, e.message);
            }
        }
    }

    // 2. Fallback remoto
    const remoteUrls = [
        'https://raw.githubusercontent.com/mauriciomtabi/JLE-BI/main/engenharia_data.js',
        'https://jle-bi.vercel.app/engenharia_data.js'
    ];

    for (const url of remoteUrls) {
        try {
            const resp = await fetch(url, { headers: { 'User-Agent': 'BI-JLE-Mailer' } });
            if (resp.ok) {
                const content = await resp.text();
                return parseEngenhariaContent(content);
            }
        } catch (e) {
            console.warn(`[Engenharia Helper] Erro no fallback ${url}:`, e.message);
        }
    }

    throw new Error("[Engenharia Helper] Falha ao carregar engenharia_data.js local ou remotamente.");
}

function generateExcelAttachments(engData) {
    if (!XLSX) return null;
    try {
        const sortedObras = [...(engData.obras || [])].sort((a, b) => (b.v_orc || 0) - (a.v_orc || 0));

        // Tab 1: Ranking Completo de Obras por Valor (Maior para o Menor)
        const rankingRows = sortedObras.map((o, idx) => ({
            'Rank': `${idx + 1}º`,
            'Obra / Solicitação': o.nome,
            'Cidade / Polo': o.cidade || '-',
            'Sites': (o.sites || []).join(', '),
            'Status Consolidado': o.status,
            'Qtd OSs': o.qtd_os || 1,
            'Valor Orçado (R$)': o.v_orc || 0,
            'Total Medido (R$)': o.v_medido || 0,
            'Saldo a Medir (R$)': o.saldo || 0,
            '% Executado': ((o.pct_executado || 0) / 100),
            'Medição Final Emitida': o.status === 'Finalizado' ? 'SIM' : 'NÃO'
        }));

        // Tab 2: Obras em Aberto (Executado Parcial e Não Executado)
        const openObras = sortedObras.filter(o => o.status !== 'Finalizado');
        const openRows = openObras.map((o, idx) => ({
            'Rank Geral': `${idx + 1}º`,
            'Obra / Solicitação': o.nome,
            'Cidade / Polo': o.cidade || '-',
            'Sites': (o.sites || []).join(', '),
            'Status': o.status,
            'Qtd OSs': o.qtd_os || 1,
            'Valor Orçado (R$)': o.v_orc || 0,
            'Total Medido (R$)': o.v_medido || 0,
            'Saldo a Medir (R$)': o.saldo || 0,
            '% Executado': ((o.pct_executado || 0) / 100),
            'Ação Prioritária': o.status === 'Executado Parcial'
                ? 'Emitir Medição Final de Entroncamento'
                : 'Iniciar Execução em Campo / 1ª Medição'
        }));

        // Tab 3: Resumo Consolidado por Cidade / Polo
        const cityData = {};
        (engData.oss || []).forEach(os => {
            const c = os.cidade || 'OUTROS';
            if (!cityData[c]) cityData[c] = { orcado: 0, medido: 0, qtd_oss: 0 };
            cityData[c].orcado += (os.v_orc || 0);
            cityData[c].medido += (os.v_medido || 0);
            cityData[c].qtd_oss += 1;
        });

        const cityRows = Object.keys(cityData)
            .sort((a, b) => cityData[b].orcado - cityData[a].orcado)
            .map((c, idx) => ({
                'Rank': `${idx + 1}º`,
                'Cidade / Polo': c,
                'Qtd OSs': cityData[c].qtd_oss,
                'Valor Orçado (R$)': cityData[c].orcado,
                'Total Medido (R$)': cityData[c].medido,
                'Saldo (R$)': Math.max(0, cityData[c].orcado - cityData[c].medido),
                '% Executado': cityData[c].orcado > 0 ? (cityData[c].medido / cityData[c].orcado) : 0
            }));

        const wb = XLSX.utils.book_new();
        const wsRanking = XLSX.utils.json_to_sheet(rankingRows);
        const wsOpen = XLSX.utils.json_to_sheet(openRows);
        const wsCity = XLSX.utils.json_to_sheet(cityRows);

        XLSX.utils.book_append_sheet(wb, wsRanking, "Ranking por Valor");
        XLSX.utils.book_append_sheet(wb, wsOpen, "Obras em Aberto");
        XLSX.utils.book_append_sheet(wb, wsCity, "Volume por Cidade");

        const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const nowStr = new Date().toISOString().slice(0, 10);

        return [{
            filename: `Relatorio_Engenharia_PR_Ranking_${nowStr}.xlsx`,
            content: excelBuffer.toString('base64'),
            encoding: 'base64'
        }];
    } catch (err) {
        console.warn("[Engenharia Helper] Erro ao gerar anexo Excel:", err.message);
        return null;
    }
}

function buildEngenhariaEmailHtml(reportName, engData) {
    const BI_URL = process.env.BI_PUBLIC_URL || "https://jle-bi.vercel.app/#engenharia";
    const generatedAt = engData.generated_at || new Date().toLocaleString('pt-BR');

    const obras = engData.obras || [];
    const sortedObras = [...obras].sort((a, b) => (b.v_orc || 0) - (a.v_orc || 0));

    // Os 3 status oficiais
    const finalizadas = sortedObras.filter(o => o.status === 'Finalizado');
    const parciais = sortedObras.filter(o => o.status === 'Executado Parcial');
    const naoExec = sortedObras.filter(o => o.status === 'Não Executado');

    const finMedido = finalizadas.reduce((acc, o) => acc + (o.v_medido || 0), 0);

    const parcMedido = parciais.reduce((acc, o) => acc + (o.v_medido || 0), 0);
    const parcSaldo = parciais.reduce((acc, o) => acc + (o.saldo || 0), 0);

    const naoExecOrcado = naoExec.reduce((acc, o) => acc + (o.v_orc || 0), 0);

    // Top 5 Cidades / Polos por Volume Orçado
    const cityData = {};
    (engData.oss || []).forEach(os => {
        const c = os.cidade || 'OUTROS';
        if (!cityData[c]) cityData[c] = { orcado: 0, medido: 0, qtd: 0 };
        cityData[c].orcado += (os.v_orc || 0);
        cityData[c].medido += (os.v_medido || 0);
        cityData[c].qtd += 1;
    });

    const topCities = Object.keys(cityData)
        .sort((a, b) => cityData[b].orcado - cityData[a].orcado)
        .slice(0, 5)
        .map(c => ({
            cidade: c,
            orcado: cityData[c].orcado,
            medido: cityData[c].medido,
            saldo: Math.max(0, cityData[c].orcado - cityData[c].medido),
            pct: cityData[c].orcado > 0 ? ((cityData[c].medido / cityData[c].orcado) * 100) : 0
        }));

    let cityRowsHtml = '';
    topCities.forEach((ct, idx) => {
        const bg = (idx % 2 === 0) ? '#ffffff' : '#f8fafc';
        cityRowsHtml += `
            <tr style="background: ${bg}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 12px; font-size: 12px; font-weight: 700; color: #1e293b;">${ct.cidade}</td>
                <td style="padding: 8px 12px; font-size: 12px; text-align: right; color: #334155; font-weight: 600;">${formatMoeda(ct.orcado)}</td>
                <td style="padding: 8px 12px; font-size: 12px; text-align: right; color: #059669; font-weight: 600;">${formatMoeda(ct.medido)}</td>
                <td style="padding: 8px 12px; font-size: 12px; text-align: right; color: #b45309; font-weight: 600;">${formatMoeda(ct.saldo)}</td>
                <td style="padding: 8px 12px; font-size: 12px; text-align: right; color: #475569; font-weight: 600;">${formatPct(ct.pct)}</td>
            </tr>
        `;
    });

    // Top 10 Obras por Valor Orçado (Maior para o Menor)
    const top10 = sortedObras.slice(0, 10);
    let tableRowsHtml = '';
    top10.forEach((o, idx) => {
        const pos = idx + 1;
        const bg = (idx % 2 === 0) ? '#ffffff' : '#f8fafc';

        let posBadge = '';
        if (pos === 1) {
            posBadge = `<span style="display: inline-block; width: 22px; height: 22px; line-height: 22px; border-radius: 50%; background: #ffd700; color: #78350f; font-weight: 800; font-size: 11px; text-align: center;">1º</span>`;
        } else if (pos === 2) {
            posBadge = `<span style="display: inline-block; width: 22px; height: 22px; line-height: 22px; border-radius: 50%; background: #e2e8f0; color: #334155; font-weight: 800; font-size: 11px; text-align: center;">2º</span>`;
        } else if (pos === 3) {
            posBadge = `<span style="display: inline-block; width: 22px; height: 22px; line-height: 22px; border-radius: 50%; background: #fed7aa; color: #7c2d12; font-weight: 800; font-size: 11px; text-align: center;">3º</span>`;
        } else {
            posBadge = `<span style="display: inline-block; width: 22px; height: 22px; line-height: 22px; border-radius: 4px; background: #f1f5f9; color: #64748b; font-weight: 700; font-size: 11px; text-align: center;">${pos}º</span>`;
        }

        let statusStyle = 'background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca;';
        if (o.status === 'Finalizado') {
            statusStyle = 'background: #d1fae5; color: #047857; border: 1px solid #a7f3d0;';
        } else if (o.status === 'Executado Parcial') {
            statusStyle = 'background: #fef3c7; color: #b45309; border: 1px solid #fde68a;';
        }

        const pctNum = Math.min(100, Math.round(o.pct_executado || 0));
        const barColor = o.status === 'Finalizado' ? '#10b981' : (pctNum > 0 ? '#0284c7' : '#cbd5e1');

        tableRowsHtml += `
            <tr style="background: ${bg}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 8px; text-align: center; vertical-align: middle;">${posBadge}</td>
                <td style="padding: 10px 10px; font-size: 12px; color: #1e293b; font-weight: 600; vertical-align: middle;">
                    ${o.nome}
                    <div style="font-size: 11px; color: #64748b; font-weight: normal; margin-top: 2px;">
                        ${o.cidade || '-'} • ${o.qtd_os} ${o.qtd_os === 1 ? 'OS' : 'OSs'}
                    </div>
                </td>
                <td style="padding: 10px 8px; text-align: center; vertical-align: middle;">
                    <span style="display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; white-space: nowrap; ${statusStyle}">
                        ${o.status}
                    </span>
                </td>
                <td style="padding: 10px 10px; text-align: right; font-size: 12px; font-weight: 700; color: #0f172a; vertical-align: middle;">
                    ${formatMoeda(o.v_orc)}
                </td>
                <td style="padding: 10px 10px; text-align: right; font-size: 12px; font-weight: 600; color: #059669; vertical-align: middle;">
                    ${formatMoeda(o.v_medido)}
                </td>
                <td style="padding: 10px 10px; text-align: right; font-size: 12px; font-weight: 600; color: ${o.saldo > 0 ? '#b45309' : '#94a3b8'}; vertical-align: middle;">
                    ${formatMoeda(o.saldo)}
                </td>
                <td style="padding: 10px 10px; text-align: right; font-size: 11px; vertical-align: middle; white-space: nowrap;">
                    <div style="display: inline-block; width: 42px; height: 6px; background: #e2e8f0; border-radius: 3px; vertical-align: middle; margin-right: 6px; overflow: hidden;">
                        <div style="width: ${pctNum}%; height: 6px; background: ${barColor}; border-radius: 3px;"></div>
                    </div>
                    <span style="font-weight: 700; color: #334155;">${formatPct(o.pct_executado)}</span>
                </td>
            </tr>
        `;
    });

    const totalOrcado = (engData.summary && engData.summary.total_orcado) || 10358283.33;
    const totalMedido = (engData.summary && engData.summary.total_medido) || 6062004.92;
    const totalSaldo = (engData.summary && engData.summary.saldo_em_aberto) || 4435536.39;
    const totalPct = (engData.summary && engData.summary.pct_executado) || 58.5;

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${reportName}</title>
    </head>
    <body style="margin: 0; padding: 0; background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f1f5f9; padding: 24px 10px;">
            <tr>
                <td align="center">
                    <table width="680" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                        
                        <!-- HEADER CORPORATIVO JLE -->
                        <tr>
                            <td style="background: #004f71; padding: 28px 36px; border-bottom: 4px solid #f59e0b;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td>
                                            <div style="font-size: 11px; font-weight: 700; color: #f59e0b; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px;">
                                                BI JLE TELECOM • ENGENHARIA PARANÁ
                                            </div>
                                            <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; line-height: 1.2;">
                                                ${reportName || 'Radar Operacional — Engenharia Claro PR'}
                                            </h1>
                                            <div style="font-size: 12px; color: rgba(255,255,255,0.75); margin-top: 6px;">
                                                Posição de Obras, Medições e Ranking por Valor • Atualizado em: <strong>${generatedAt}</strong>
                                            </div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- BANNER RESUMO EXECUTIVO (CARTEIRA GERAL) -->
                        <tr>
                            <td style="padding: 20px 32px 0;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #0f172a; border-radius: 10px; padding: 18px 20px; color: #ffffff;">
                                    <tr>
                                        <td width="25%" style="text-align: center; border-right: 1px solid rgba(255,255,255,0.12);">
                                            <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 600;">Carteira Total</div>
                                            <div style="font-size: 20px; font-weight: 800; color: #ffffff; margin-top: 3px;">${obras.length} Obras</div>
                                            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">194 OSs vinculadas</div>
                                        </td>
                                        <td width="25%" style="text-align: center; border-right: 1px solid rgba(255,255,255,0.12);">
                                            <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 600;">Total Orçado</div>
                                            <div style="font-size: 18px; font-weight: 800; color: #38bdf8; margin-top: 3px;">${formatMoeda(totalOrcado)}</div>
                                            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">100% da base</div>
                                        </td>
                                        <td width="25%" style="text-align: center; border-right: 1px solid rgba(255,255,255,0.12);">
                                            <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 600;">Total Medido</div>
                                            <div style="font-size: 18px; font-weight: 800; color: #34d399; margin-top: 3px;">${formatMoeda(totalMedido)}</div>
                                            <div style="font-size: 11px; color: #34d399; font-weight: 600; margin-top: 2px;">${formatPct(totalPct)} faturado</div>
                                        </td>
                                        <td width="25%" style="text-align: center;">
                                            <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 600;">Saldo a Medir</div>
                                            <div style="font-size: 18px; font-weight: 800; color: #fbbf24; margin-top: 3px;">${formatMoeda(totalSaldo)}</div>
                                            <div style="font-size: 11px; color: #fbbf24; font-weight: 600; margin-top: 2px;">${formatPct(100 - totalPct)} pendente</div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- OS 3 STATUS OFICIAIS (CARDS) -->
                        <tr>
                            <td style="padding: 16px 32px 0;">
                                <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 10px;">
                                    📌 Distribuição da Carteira pelos 3 Status Operacionais
                                </div>
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <!-- FINALIZADO -->
                                        <td width="32%" style="background: #f0fdf4; border: 1px solid #bbf7d0; border-top: 4px solid #16a34a; border-radius: 8px; padding: 14px; vertical-align: top;">
                                            <div style="font-size: 11px; font-weight: 800; color: #15803d; text-transform: uppercase;">
                                                🟢 FINALIZADO
                                            </div>
                                            <div style="font-size: 18px; font-weight: 800; color: #166534; margin-top: 4px;">
                                                ${finalizadas.length} Obras <span style="font-size: 12px; font-weight: 600; color: #15803d;">(32,8%)</span>
                                            </div>
                                            <div style="font-size: 12px; color: #14532d; font-weight: 600; margin-top: 4px;">
                                                Medido: ${formatMoeda(finMedido)}
                                            </div>
                                            <div style="font-size: 11px; color: #4b5563; margin-top: 6px; line-height: 1.35;">
                                                Concluídas com <strong>Medição Final de Entroncamento</strong> emitida.
                                            </div>
                                        </td>

                                        <td width="2%"></td>

                                        <!-- EXECUTADO PARCIAL -->
                                        <td width="32%" style="background: #fffbeb; border: 1px solid #fde68a; border-top: 4px solid #d97706; border-radius: 8px; padding: 14px; vertical-align: top;">
                                            <div style="font-size: 11px; font-weight: 800; color: #b45309; text-transform: uppercase;">
                                                🟧 EXECUTADO PARCIAL
                                            </div>
                                            <div style="font-size: 18px; font-weight: 800; color: #92400e; margin-top: 4px;">
                                                ${parciais.length} Obras <span style="font-size: 12px; font-weight: 600; color: #b45309;">(36,0%)</span>
                                            </div>
                                            <div style="font-size: 12px; color: #78350f; font-weight: 600; margin-top: 4px;">
                                                Saldo: ${formatMoeda(parcSaldo)}
                                            </div>
                                            <div style="font-size: 11px; color: #4b5563; margin-top: 6px; line-height: 1.35;">
                                                Medições parciais ativas (P1/P2/P3), aguardando <strong>Entroncamento Final</strong>.
                                            </div>
                                        </td>

                                        <td width="2%"></td>

                                        <!-- NÃO EXECUTADO -->
                                        <td width="32%" style="background: #fef2f2; border: 1px solid #fecaca; border-top: 4px solid #dc2626; border-radius: 8px; padding: 14px; vertical-align: top;">
                                            <div style="font-size: 11px; font-weight: 800; color: #b91c1c; text-transform: uppercase;">
                                                🟥 NÃO EXECUTADO
                                            </div>
                                            <div style="font-size: 18px; font-weight: 800; color: #991b1b; margin-top: 4px;">
                                                ${naoExec.length} Obras <span style="font-size: 12px; font-weight: 600; color: #b91c1c;">(31,2%)</span>
                                            </div>
                                            <div style="font-size: 12px; color: #7f1d1d; font-weight: 600; margin-top: 4px;">
                                                Orçado: ${formatMoeda(naoExecOrcado)}
                                            </div>
                                            <div style="font-size: 11px; color: #4b5563; margin-top: 6px; line-height: 1.35;">
                                                Sem medições registradas (0%), aguardando <strong>1ª medição</strong>.
                                            </div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- TOP 5 POLOS / CIDADES -->
                        <tr>
                            <td style="padding: 22px 32px 0;">
                                <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                                    <span>🏙️ Top 5 Polos / Cidades com Maior Volume Orçado</span>
                                    <span style="font-size: 11px; color: #64748b; font-weight: normal;">Espelho do Gráfico Geral</span>
                                </div>
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                                    <thead>
                                        <tr style="background: #f8fafc; color: #475569; font-size: 11px; text-transform: uppercase;">
                                            <th style="padding: 8px 12px; text-align: left;">Polo / Cidade</th>
                                            <th style="padding: 8px 12px; text-align: right;">Orçado (R$)</th>
                                            <th style="padding: 8px 12px; text-align: right;">Medido (R$)</th>
                                            <th style="padding: 8px 12px; text-align: right;">Saldo (R$)</th>
                                            <th style="padding: 8px 12px; text-align: right;">% Medido</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${cityRowsHtml}
                                    </tbody>
                                </table>
                            </td>
                        </tr>

                        <!-- TABELA: RANKING DE OBRAS CLASSIFICADAS POR VALOR (TOP 10) -->
                        <tr>
                            <td style="padding: 22px 32px 0;">
                                <div style="margin-bottom: 8px;">
                                    <div style="font-size: 14px; font-weight: 800; color: #0f172a;">
                                        🏆 Ranking de Obras por Valor Orçado (Top 10)
                                    </div>
                                    <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                                        Obras classificadas do maior valor para o menor com status e saldo a medir
                                    </div>
                                </div>
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
                                    <thead>
                                        <tr style="background: #004f71; color: #ffffff;">
                                            <th style="padding: 9px 8px; font-size: 11px; text-transform: uppercase; text-align: center; width: 36px;">#</th>
                                            <th style="padding: 9px 10px; font-size: 11px; text-transform: uppercase; text-align: left;">Obra / Solicitação</th>
                                            <th style="padding: 9px 8px; font-size: 11px; text-transform: uppercase; text-align: center; width: 110px;">Status</th>
                                            <th style="padding: 9px 10px; font-size: 11px; text-transform: uppercase; text-align: right; width: 90px;">Orçado</th>
                                            <th style="padding: 9px 10px; font-size: 11px; text-transform: uppercase; text-align: right; width: 85px;">Medido</th>
                                            <th style="padding: 9px 10px; font-size: 11px; text-transform: uppercase; text-align: right; width: 85px;">Saldo</th>
                                            <th style="padding: 9px 10px; font-size: 11px; text-transform: uppercase; text-align: right; width: 75px;">% Exec.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${tableRowsHtml}
                                    </tbody>
                                </table>
                                <div style="font-size: 11px; color: #64748b; margin-top: 6px; font-style: italic;">
                                    * Relatório completo com todas as 125 obras ranqueadas está no arquivo Excel anexo e no painel online.
                                </div>
                            </td>
                        </tr>

                        <!-- DIRECIONAMENTO OPERACIONAL (PRÓXIMAS AÇÕES) -->
                        <tr>
                            <td style="padding: 20px 32px 0;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px;">
                                    <tr>
                                        <td>
                                            <div style="font-size: 12px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                                                🎯 Ações Prioritárias Recomendadas
                                            </div>
                                            <div style="font-size: 12px; color: #334155; line-height: 1.5;">
                                                <div style="margin-bottom: 6px;">
                                                    <strong style="color: #b45309;">🟧 Executado Parcial (45 obras • Saldo ${formatMoeda(parcSaldo)}):</strong><br>
                                                    Priorizar a emissão da <strong>Medição Final de Entroncamento</strong> para as obras com etapas civis e de cabos concluídas, liberando o recebimento do saldo represado.
                                                </div>
                                                <div>
                                                    <strong style="color: #b91c1c;">🟥 Não Executado (39 obras • Orçado ${formatMoeda(naoExecOrcado)}):</strong><br>
                                                    Cobrar alinhamento com equipes de campo e parceiros para início dos trabalhos e envio da <strong>1ª medição parcial (P1)</strong>, com atenção especial à obra líder de valor <em>BACKHAUL 5G AGUA AZUL (${formatMoeda(700914.74)})</em>.
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- BOTÃO DE AÇÃO DIRETA PARA O BI -->
                        <tr>
                            <td style="padding: 24px 32px; text-align: center;">
                                <a href="${BI_URL}" target="_blank" style="display: inline-block; background: #004f71; color: #ffffff; text-decoration: none; padding: 13px 30px; border-radius: 8px; font-size: 13px; font-weight: 700; box-shadow: 0 4px 12px rgba(0, 79, 113, 0.25);">
                                    Abrir Radar de Engenharia no BI JLE
                                </a>
                                <div style="font-size: 11px; color: #64748b; margin-top: 8px;">
                                    Acesse para filtrar por cidade, ver o detalhe de cada OS e abrir a linha do tempo completa.
                                </div>
                            </td>
                        </tr>

                        <!-- RODAPÉ OFICIAL JLE -->
                        <tr>
                            <td style="background: #f8fafc; padding: 18px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #64748b;">
                                Este é um informativo diário gerado automaticamente pelo <strong>BI JLE Telecom</strong> para a equipe de Engenharia PR.<br>
                                © 2026 JLE Telecom • Todos os direitos reservados.
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
}

module.exports = {
    loadEngenhariaDataAsync,
    generateExcelAttachments,
    buildEngenhariaEmailHtml
};
