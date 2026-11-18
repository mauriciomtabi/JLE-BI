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
        const openObras = engData.obras.filter(o => o.is_em_aberto);
        const rows = openObras.map(o => ({
            'ID Obra': o.id,
            'Obra / Solicitação': o.nome,
            'Sites': (o.sites || []).join(', '),
            'Cidade / Polo': o.cidade,
            'Status Consolidado': o.status,
            'Tempo em Aberto (Dias)': o.dias_aberto || 0,
            'Faixa de Aging': o.faixa_aging || '-',
            'Pendência / Próxima Ação': o.pendencia || '-',
            'Qtd OSs': o.qtd_os || 1,
            'Valor Orçado (R$)': o.v_orc || 0,
            'Total Medido (R$)': o.v_medido || 0,
            'Saldo a Medir (R$)': o.saldo || 0,
            '% Executado': o.pct_executado || 0
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, "Radar Obras Abertas");

        const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const nowStr = new Date().toISOString().slice(0, 10);

        return [{
            filename: `Radar_Engenharia_PR_${nowStr}.xlsx`,
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
    const openObras = obras.filter(o => o.is_em_aberto);

    // Bloco 1: Executado Parcial (Obras com medições parciais faturadas aguardando medição final)
    const parcObras = openObras.filter(o => o.status === 'Executado Parcial');
    const parcSaldo = parcObras.reduce((acc, o) => acc + (o.saldo || 0), 0);
    const parcMedido = parcObras.reduce((acc, o) => acc + (o.v_medido || 0), 0);
    const parcMaisAntiga = [...parcObras].sort((a, b) => (b.dias_aberto || 0) - (a.dias_aberto || 0))[0];

    // Bloco 2: Não Executado (Obras sem medições registradas)
    const naoExecObras = openObras.filter(o => o.status === 'Não Executado');
    const naoExecSaldo = naoExecObras.reduce((acc, o) => acc + (o.saldo || 0), 0);
    const naoExecMaisAntiga = [...naoExecObras].sort((a, b) => (b.dias_aberto || 0) - (a.dias_aberto || 0))[0];

    // Obras Críticas (> 180 dias)
    const criticasCount = openObras.filter(o => (o.dias_aberto || 0) > 180).length;

    // Top 8 Obras Prioritárias para Ação Imediata (ordenadas por dias em aberto e saldo)
    const topPrioritarias = [...openObras]
        .sort((a, b) => ((b.dias_aberto || 0) * (b.saldo || 0)) - ((a.dias_aberto || 0) * (a.saldo || 0)))
        .slice(0, 8);

    let tableRowsHtml = "";
    topPrioritarias.forEach((o, idx) => {
        const bg = (idx % 2 === 0) ? '#ffffff' : '#f8fafc';
        const dias = o.dias_aberto || 0;
        
        // Estilo de Aging
        let agingColor = '#10b981';
        let agingBg = 'rgba(16, 185, 129, 0.1)';
        let agingText = `${dias}d`;
        if (dias > 180) {
            agingColor = '#dc2626';
            agingBg = 'rgba(239, 68, 68, 0.15)';
            agingText = `${dias}d (Crítico)`;
        } else if (dias > 90) {
            agingColor = '#ea580c';
            agingBg = 'rgba(234, 88, 12, 0.12)';
            agingText = `${dias}d`;
        } else if (dias > 30) {
            agingColor = '#d97706';
            agingBg = 'rgba(217, 119, 6, 0.12)';
            agingText = `${dias}d`;
        }

        // Estilo de Pendência
        let pendColor = '#2563eb';
        let pendBg = 'rgba(37, 99, 235, 0.08)';
        if (o.pendencia && o.pendencia.startsWith('JLE')) {
            pendColor = '#b45309';
            pendBg = 'rgba(180, 83, 9, 0.08)';
        } else if (o.pendencia && o.pendencia.startsWith('Misto')) {
            pendColor = '#7c3aed';
            pendBg = 'rgba(124, 58, 237, 0.08)';
        }

        tableRowsHtml += `
            <tr style="background: ${bg}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 12px; font-size: 13px; color: #1e293b; font-weight: 600;">
                    ${o.nome}
                    <div style="font-size: 11px; color: #64748b; font-weight: normal; margin-top: 2px;">
                        ${o.cidade} • ${o.qtd_os} ${o.qtd_os === 1 ? 'OS' : 'OSs'}
                    </div>
                </td>
                <td style="padding: 10px 12px; font-size: 12px;">
                    <span style="display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; color: ${pendColor}; background: ${pendBg};">
                        ${o.pendencia || o.status}
                    </span>
                </td>
                <td style="padding: 10px 12px; text-align: center; font-size: 12px;">
                    <span style="display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; color: ${agingColor}; background: ${agingBg};">
                        ${agingText}
                    </span>
                </td>
                <td style="padding: 10px 12px; text-align: right; font-size: 13px; font-weight: 700; color: #b45309;">
                    ${formatMoeda(o.saldo)}
                </td>
            </tr>
        `;
    });

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
                    <table width="640" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                        
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
                                                Posição de Obras, Medições e Pendências • Atualizado em: <strong>${generatedAt}</strong>
                                            </div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- BANNER DE ALERTA GERAL -->
                        <tr>
                            <td style="padding: 20px 36px 0;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 18px;">
                                    <tr>
                                        <td>
                                            <span style="font-size: 13px; color: #334155; font-weight: 600;">
                                                📊 <strong>Resumo da Carteira:</strong> 125 Obras (194 OSs) • <strong>${openObras.length} Obras em Aberto</strong> represando <strong>${formatMoeda(engData.summary.saldo_em_aberto || 4437266.77)}</strong> em saldo a faturar.
                                            </span>
                                            <div style="font-size: 12px; color: #dc2626; font-weight: 700; margin-top: 4px;">
                                                ⚠️ <strong>${criticasCount} obras</strong> estão paradas há mais de 180 dias (&gt; 6 meses) sem conclusão.
                                            </div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- BLOCOS DE RESPONSABILIDADE (CLARO VS JLE) -->
                        <tr>
                            <td style="padding: 20px 36px 0;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    
                                    <!-- BLOCO 1: EXECUTADO PARCIAL -->
                                    <tr>
                                        <td style="background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #d97706; border-radius: 8px; padding: 16px;">
                                            <div style="font-size: 11px; font-weight: 800; color: #b45309; text-transform: uppercase; letter-spacing: 0.8px;">
                                                🟧 EXECUTADO PARCIAL — PENDENTE DE ENTRONCAMENTO FINAL
                                            </div>
                                            <div style="margin-top: 6px; font-size: 14px; color: #0f172a;">
                                                <strong>${parcObras.length} Obras</strong> com medições parciais • Já medido: <strong style="color:#059669;">${formatMoeda(parcMedido)}</strong> • Saldo a faturar: <strong style="color:#b45309;">${formatMoeda(parcSaldo)}</strong>
                                            </div>
                                            <div style="font-size: 12px; color: #475569; margin-top: 4px; line-height: 1.4;">
                                                • Obras em campo com medições parciais (P1/P2/P3) faturadas aguardando a emissão da Medição Final de Entroncamento.<br>
                                                ${parcMaisAntiga ? `<span style="color:#b91c1c; font-weight:600;">• Caso Crítico: ${parcMaisAntiga.nome} (${parcMaisAntiga.dias_aberto}d em aberto - Saldo ${formatMoeda(parcMaisAntiga.saldo)})</span>` : ''}
                                            </div>
                                        </td>
                                    </tr>

                                    <tr style="height: 12px;"><td></td></tr>

                                    <!-- BLOCO 2: NÃO EXECUTADO -->
                                    <tr>
                                        <td style="background: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; border-radius: 8px; padding: 16px;">
                                            <div style="font-size: 11px; font-weight: 800; color: #991b1b; text-transform: uppercase; letter-spacing: 0.8px;">
                                                🟥 NÃO EXECUTADO — SEM MEDIÇÕES REGISTRADAS
                                            </div>
                                            <div style="margin-top: 6px; font-size: 14px; color: #0f172a;">
                                                <strong>${naoExecObras.length} Obras</strong> sem medições • Saldo a executar: <strong style="color:#dc2626;">${formatMoeda(naoExecSaldo)}</strong>
                                            </div>
                                            <div style="font-size: 12px; color: #475569; margin-top: 4px; line-height: 1.4;">
                                                • Obras orçadas aguardando início dos trabalhos em campo ou envio da 1ª medição parcial.<br>
                                                ${naoExecMaisAntiga ? `<span style="color:#b91c1c; font-weight:600;">• Caso Crítico: ${naoExecMaisAntiga.nome} (${naoExecMaisAntiga.dias_aberto}d em aberto - Orçado ${formatMoeda(naoExecMaisAntiga.saldo)})</span>` : ''}
                                            </div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- TABELA DE OBRAS PRIORITÁRIAS -->
                        <tr>
                            <td style="padding: 24px 36px 0;">
                                <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                                    <span>Top Obras Prioritárias no Radar (Maior Saldo Represado)</span>
                                    <span style="font-size: 11px; color: #64748b; font-weight: normal;">Ordenado por Impacto</span>
                                </div>
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
                                    <thead>
                                        <tr style="background: #004f71; color: #ffffff; text-align: left;">
                                            <th style="padding: 9px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Obra / Cidade</th>
                                            <th style="padding: 9px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Pendência</th>
                                            <th style="padding: 9px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; text-align: center;">Aging</th>
                                            <th style="padding: 9px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; text-align: right;">Saldo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${tableRowsHtml}
                                    </tbody>
                                </table>
                            </td>
                        </tr>

                        <!-- BOTÃO DE AÇÃO DIRETA PARA O BI -->
                        <tr>
                            <td style="padding: 28px 36px; text-align: center;">
                                <a href="${BI_URL}" target="_blank" style="display: inline-block; background: #004f71; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 700; box-shadow: 0 4px 12px rgba(0, 79, 113, 0.25);">
                                    Abrir Radar de Engenharia no BI JLE
                                </a>
                                <div style="font-size: 11px; color: #64748b; margin-top: 8px;">
                                    Acesse para filtrar por cidade, ver o detalhe de cada OS e a linha do tempo completa.
                                </div>
                            </td>
                        </tr>

                        <!-- RODAPÉ OFICIAL JLE -->
                        <tr>
                            <td style="background: #f8fafc; padding: 18px 36px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
                                Este é um informativo automático gerado pelo <strong>BI JLE Telecom</strong> para a equipe de Engenharia PR.<br>
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
