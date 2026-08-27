/**
 * email_preview_helper.js
 * Utilitário de Pré-Visualização Instantânea de Templates de E-mail no BI JLE Telecom.
 * Renderiza os templates HTML idênticos aos disparados pelo Cron do Vercel / Resend API.
 */

(function(window) {
    'use strict';

    let currentPreviewType = 'mdu';
    let currentPreviewDevice = 'desktop';
    let currentPreviewReportName = '';
    let currentPreviewRecipients = '';

    const REPORT_TITLES = {
        mdu: 'Relatório Diário de Operações MDU',
        sar: 'Relatório Diário de Operações SAR',
        claro: 'Relatório Diário - Analítico Claro',
        manutencao: 'Relatório Diário - Manutenção de Rede',
        tecnodrill: 'Relatório Financeiro Tecnodrill'
    };

    function formatBRL(val) {
        return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatNumber(val) {
        return (val || 0).toLocaleString('pt-BR');
    }

    function getNowFormatted() {
        const now = new Date();
        const d = String(now.getDate()).padStart(2, '0');
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const y = now.getFullYear();
        const h = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        return {
            dateStr: `${d}/${m}/${y}`,
            timeStr: `${h}:${min}`,
            fullStr: `${d}/${m}/${y} às ${h}:${min}`
        };
    }

    function formatEmailGeneratedAt(genDate) {
        if (!genDate || genDate === 'N/D' || String(genDate).trim() === '') {
            const now = new Date();
            const d = String(now.getDate()).padStart(2, '0');
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const y = now.getFullYear();
            const h = String(now.getHours()).padStart(2, '0');
            const min = String(now.getMinutes()).padStart(2, '0');
            return `${d}/${m}/${y} às ${h}:${min}`;
        }
        const val = String(genDate).trim();
        const match = val.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
        if (match) {
            return `${match[3]}/${match[2]}/${match[1]} às ${match[4]}:${match[5]}`;
        }
        try {
            if (val.includes('T') || val.includes('-')) {
                const d = new Date(val.includes('T') ? val : val.replace(' ', 'T'));
                if (!isNaN(d.getTime())) {
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const year = d.getFullYear();
                    const hours = String(d.getHours()).padStart(2, '0');
                    const minutes = String(d.getMinutes()).padStart(2, '0');
                    return `${day}/${month}/${year} às ${hours}:${minutes}`;
                }
            }
            return val;
        } catch {
            return val;
        }
    }

    // ──────────────────────────────────────────────
    // 1. GERADOR DE HTML: MDU
    // ──────────────────────────────────────────────
    function generateMduPreviewHtml(reportName) {
        const rows = (window.MDU_DATA && Array.isArray(window.MDU_DATA)) ? window.MDU_DATA : [];
        const metadata = window.MDU_METADATA || {};
        const genAt = formatEmailGeneratedAt(metadata.generated_at);

        const excludeStatus = ['FINALIZADO', 'FINALIZADA', 'CANCELADO', 'CANCELADA'];
        let totalActive = 0;
        let medicaoCount = 0;
        let relatoriosCount = 0;

        const counts = {
            '2º Vistoria': 0,
            '1º Vistoria': 0,
            'Pendências Claro': 0,
            'Medição': 0,
            'Pendência': 0,
            'Não Adequado': 0,
            'FALTA DADOS': 0
        };

        rows.forEach(r => {
            const s = (r.status || '').trim();
            const sUpper = s.toUpperCase();
            if (excludeStatus.includes(sUpper)) return;
            totalActive++;

            if (sUpper.includes('RELATÓRIO') || sUpper.includes('RELATORIO')) {
                relatoriosCount++;
            }

            if (sUpper === '2º VISTORIA' || sUpper === '2ª VISTORIA' || sUpper === '2 VISTORIA') {
                counts['2º Vistoria']++;
            } else if (sUpper === '1º VISTORIA' || sUpper === '1ª VISTORIA' || sUpper === '1 VISTORIA') {
                counts['1º Vistoria']++;
            } else if (sUpper === 'FUSÃO' || sUpper === 'FUSAO' || sUpper === 'PENDÊNCIAS CLARO' || sUpper === 'PENDENCIAS CLARO') {
                counts['Pendências Claro']++;
            } else if (sUpper === 'MEDIÇÃO' || sUpper === 'MEDICAO') {
                counts['Medição']++;
                medicaoCount++;
            } else if (sUpper === 'PENDÊNCIA' || sUpper === 'PENDENCIA') {
                counts['Pendência']++;
            } else if (sUpper === 'PROJETO' || sUpper === 'BAIXA' || sUpper === 'NÃO ADEQUADO' || sUpper === 'NAO ADEQUADO' || sUpper.includes('RELAT')) {
                counts['Não Adequado']++;
            } else {
                counts['FALTA DADOS']++;
            }
        });

        const statusDotColors = {
            '2º Vistoria': '#004f71',
            '1º Vistoria': '#0ea5e9',
            'Pendências Claro': '#e74c3c',
            'Medição': '#2ecc71',
            'Pendência': '#f39f18',
            'Não Adequado': '#004f71',
            'FALTA DADOS': '#747d8c'
        };

        const statusOrder = ['2º Vistoria', '1º Vistoria', 'Pendências Claro', 'Medição', 'Pendência', 'Não Adequado', 'FALTA DADOS'];
        let statusRows = "";
        statusOrder.forEach(key => {
            const count = counts[key] || 0;
            const color = statusDotColors[key] || '#747d8c';
            statusRows += `
            <tr>
                <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #2c3e50; font-weight: 500;">
                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${color}; margin-right:10px; vertical-align:middle;"></span>
                    ${key}
                </td>
                <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; text-align:right;">
                    <span style="background:rgba(0,79,113,0.06); color:#004f71; padding:4px 14px; border-radius:20px; font-size:13px; font-weight:700;">${formatNumber(count)}</span>
                </td>
            </tr>`;
        });

        const name = reportName || REPORT_TITLES.mdu;

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f9; padding: 24px 10px;">
        <tr>
            <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.05); border: 1px solid #e1e8ed;">
                    <!-- HEADER -->
                    <tr>
                        <td style="background: #004f71; padding: 30px 36px; border-bottom: 4px solid #f39f18;">
                            <h1 style="margin:0; font-size:22px; font-weight:800; color:#ffffff; line-height:1.2;">${name}</h1>
                            <div style="font-size:12px; color:rgba(255,255,255,0.7); margin-top:6px; font-weight: 500;">Atualizado em: ${genAt}</div>
                        </td>
                    </tr>
                    
                    <!-- CARDS DE DESTAQUE -->
                    <tr>
                        <td style="padding: 26px 36px 0;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td colspan="3" style="background: rgba(0,79,113,0.04); border-radius: 12px; border: 1px solid rgba(0,79,113,0.08); text-align: center; padding: 20px;">
                                        <div style="font-size: 11px; color: #747d8c; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 6px;">ORDENS DE SERVIÇO EM ANDAMENTO</div>
                                        <div style="font-size: 38px; font-weight: 800; color: #004f71; line-height: 1;">${formatNumber(totalActive)}</div>
                                    </td>
                                </tr>
                                <tr style="height: 12px;"><td colspan="3"></td></tr>
                                <tr>
                                    <td width="48%" style="background: rgba(243,159,24,0.04); border-radius: 10px; border-top: 3px solid #f39f18; padding: 16px 10px; text-align: center; border-left: 1px solid rgba(243,159,24,0.1); border-right: 1px solid rgba(243,159,24,0.1); border-bottom: 1px solid rgba(243,159,24,0.1);">
                                        <div style="font-size: 11px; color: #b86d00; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; margin-bottom: 4px;">MEDIÇÃO</div>
                                        <div style="font-size: 26px; font-weight: 800; color: #b86d00; line-height: 1;">${formatNumber(medicaoCount)}</div>
                                    </td>
                                    <td width="4%"></td>
                                    <td width="48%" style="background: rgba(0,79,113,0.04); border-radius: 10px; border-top: 3px solid #004f71; padding: 16px 10px; text-align: center; border-left: 1px solid rgba(0,79,113,0.1); border-right: 1px solid rgba(0,79,113,0.1); border-bottom: 1px solid rgba(0,79,113,0.1);">
                                        <div style="font-size: 11px; color: #004f71; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; margin-bottom: 4px;">RELATÓRIOS</div>
                                        <div style="font-size: 26px; font-weight: 800; color: #004f71; line-height: 1;">${formatNumber(relatoriosCount)}</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- TABELA DE STATUS -->
                    <tr>
                        <td style="padding: 24px 36px 10px;">
                            <div style="font-size:12px; text-transform:uppercase; letter-spacing:1.5px; color:#57606f; font-weight:700; margin-bottom:10px;">DETALHAMENTO POR STATUS</div>
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e1e8ed; border-radius:8px; overflow:hidden;">
                                <tr style="background:#f8f9fa;">
                                    <th style="padding:10px 16px; text-align:left; font-size:12px; color:#57606f; font-weight:700;">Status</th>
                                    <th style="padding:10px 16px; text-align:right; font-size:12px; color:#57606f; font-weight:700; width:100px;">Qtd.</th>
                                </tr>
                                ${statusRows}
                            </table>
                        </td>
                    </tr>

                    <!-- BOTOES DE ACAO -->
                    <tr>
                        <td style="padding: 20px 36px 28px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td width="48%">
                                        <a href="https://jle-bi.vercel.app/#mdu" target="_blank" style="display:block; text-align:center; background:#004f71; color:#ffffff; text-decoration:none; padding:12px; border-radius:8px; font-size:13px; font-weight:700; border-bottom: 2px solid #002d42;">
                                            📊 Acessar no BI
                                        </a>
                                    </td>
                                    <td width="4%"></td>
                                    <td width="48%">
                                        <a href="https://docs.google.com/spreadsheets/d/123z-QeU_w5Y8e0jJz9N4_j_c8nJjLzQ7_e0fP7_z0A/edit" target="_blank" style="display:block; text-align:center; background:#217346; color:#ffffff; text-decoration:none; padding:12px; border-radius:8px; font-size:13px; font-weight:700; border-bottom: 2px solid #14462a;">
                                            📋 Acessar Planilha
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                        <td style="background:#f8f9fa; padding:20px; border-top:1px solid #e1e8ed; text-align:center; font-size:11px; color:#747d8c;">
                            Informativo automático gerado pelo <strong>BI JLE Telecom</strong>.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
    }

    // ──────────────────────────────────────────────
    // 2. GERADOR DE HTML: SAR
    // ──────────────────────────────────────────────
    function generateSarPreviewHtml(reportName) {
        const rows = (window.SAR_DATA && Array.isArray(window.SAR_DATA)) ? window.SAR_DATA : [];
        const metadata = window.SAR_METADATA || {};
        const genAt = formatEmailGeneratedAt(metadata.generated_at);

        const counts = {};
        let agMedicao = 0;
        let agRelatorio = 0;

        rows.forEach(r => {
            const st = (r.status || 'NÃO INFORMADO').trim().toUpperCase();
            counts[st] = (counts[st] || 0) + 1;

            if (st === 'AG. MEDIÇÃO' || st === 'AG. MEDICAO' || st === 'AG MEDIÇÃO' || st === 'AG MEDICAO') {
                agMedicao++;
            } else if (st === 'AG. RELATÓRIO' || st === 'AG. RELATORIO' || st === 'AG RELATÓRIO' || st === 'AG RELATORIO') {
                agRelatorio++;
            }
        });

        // Caso haja divergência de normalização, fazer fallback pelas contagens exatas
        if (agMedicao === 0) agMedicao = counts['AG. MEDIÇÃO'] || counts['AG. MEDICAO'] || 0;
        if (agRelatorio === 0) agRelatorio = counts['AG. RELATÓRIO'] || counts['AG. RELATORIO'] || 0;

        const statusDotColors = {
            'AG. MEDIÇÃO': '#388bfd',
            'MEDIÇÃO CONCLUÍDA': '#10b981',
            'AG. RELATÓRIO': '#f59e0b',
            'CANCELADO': '#ef4444',
            'SEM SINAL': '#8b5cf6',
            'PARALISADO': '#64748b'
        };

        const sortedStatuses = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
        let statusRows = "";
        sortedStatuses.forEach(key => {
            const count = counts[key] || 0;
            const color = statusDotColors[key] || '#388bfd';
            statusRows += `
            <tr>
                <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #2c3e50; font-weight: 500;">
                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${color}; margin-right:10px; vertical-align:middle;"></span>
                    ${key}
                </td>
                <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; text-align:right;">
                    <span style="background:rgba(56,139,253,0.08); color:#005073; padding:4px 14px; border-radius:20px; font-size:13px; font-weight:700;">${formatNumber(count)}</span>
                </td>
            </tr>`;
        });

        const name = reportName || REPORT_TITLES.sar;

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f9; padding: 24px 10px;">
        <tr>
            <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.05); border: 1px solid #e1e8ed;">
                    <!-- HEADER -->
                    <tr>
                        <td style="background: #004f71; padding: 30px 36px; border-bottom: 4px solid #f39f18;">
                            <h1 style="margin:0; font-size:22px; font-weight:800; color:#ffffff; line-height:1.2;">${name}</h1>
                            <div style="font-size:12px; color:rgba(255,255,255,0.7); margin-top:6px; font-weight: 500;">Atualizado em: ${genAt}</div>
                        </td>
                    </tr>
                    
                    <!-- CARDS DE DESTAQUE -->
                    <tr>
                        <td style="padding: 26px 36px 0;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td colspan="3" style="background: rgba(0,79,113,0.04); border-radius: 12px; border: 1px solid rgba(0,79,113,0.08); text-align: center; padding: 20px;">
                                        <div style="font-size: 11px; color: #747d8c; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 6px;">TOTAL GERAL DE OSs SAR</div>
                                        <div style="font-size: 38px; font-weight: 800; color: #004f71; line-height: 1;">${formatNumber(rows.length)}</div>
                                    </td>
                                </tr>
                                <tr style="height: 12px;"><td colspan="3"></td></tr>
                                <tr>
                                    <td width="48%" style="background: rgba(56,139,253,0.04); border-radius: 10px; border-top: 3px solid #388bfd; padding: 16px 10px; text-align: center; border-left: 1px solid rgba(56,139,253,0.1); border-right: 1px solid rgba(56,139,253,0.1); border-bottom: 1px solid rgba(56,139,253,0.1);">
                                        <div style="font-size: 11px; color: #1f6feb; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; margin-bottom: 4px;">AG. MEDIÇÃO</div>
                                        <div style="font-size: 26px; font-weight: 800; color: #1f6feb; line-height: 1;">${formatNumber(agMedicao)}</div>
                                    </td>
                                    <td width="4%"></td>
                                    <td width="48%" style="background: rgba(243,159,24,0.04); border-radius: 10px; border-top: 3px solid #f39f18; padding: 16px 10px; text-align: center; border-left: 1px solid rgba(243,159,24,0.1); border-right: 1px solid rgba(243,159,24,0.1); border-bottom: 1px solid rgba(243,159,24,0.1);">
                                        <div style="font-size: 11px; color: #b86d00; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; margin-bottom: 4px;">AG. RELATÓRIO</div>
                                        <div style="font-size: 26px; font-weight: 800; color: #b86d00; line-height: 1;">${formatNumber(agRelatorio)}</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- TABELA DE STATUS -->
                    <tr>
                        <td style="padding: 24px 36px 10px;">
                            <div style="font-size:12px; text-transform:uppercase; letter-spacing:1.5px; color:#57606f; font-weight:700; margin-bottom:10px;">DISTRIBUIÇÃO POR STATUS GERAL</div>
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e1e8ed; border-radius:8px; overflow:hidden;">
                                <tr style="background:#f8f9fa;">
                                    <th style="padding:10px 16px; text-align:left; font-size:12px; color:#57606f; font-weight:700;">Status</th>
                                    <th style="padding:10px 16px; text-align:right; font-size:12px; color:#57606f; font-weight:700; width:100px;">Qtd.</th>
                                </tr>
                                ${statusRows}
                            </table>
                        </td>
                    </tr>

                    <!-- BOTAO DE ACAO -->
                    <tr>
                        <td style="padding: 20px 36px 28px;">
                            <a href="https://jle-bi.vercel.app/#sar" target="_blank" style="display:block; text-align:center; background:#004f71; color:#ffffff; text-decoration:none; padding:12px; border-radius:8px; font-size:13px; font-weight:700; border-bottom: 2px solid #002d42;">
                                📊 Acessar Dashboard SAR no BI
                            </a>
                        </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                        <td style="background:#f8f9fa; padding:20px; border-top:1px solid #e1e8ed; text-align:center; font-size:11px; color:#747d8c;">
                            Informativo automático gerado pelo <strong>BI JLE Telecom</strong>.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
    }

    // ──────────────────────────────────────────────
    // 3. GERADOR DE HTML: ANALÍTICO CLARO
    // ──────────────────────────────────────────────
    function generateClaroPreviewHtml(reportName) {
        const rows = (window.COBRANCA_DATA && Array.isArray(window.COBRANCA_DATA)) ? window.COBRANCA_DATA : [];
        const metadata = window.COBRANCA_METADATA || {};
        const nowInfo = getNowFormatted();
        const genAt = metadata.generated_at ? metadata.generated_at : nowInfo.fullStr;

        let semAprovSum = 0;
        let semAprovCount = 0;
        let aprovSum = 0;
        let aprovCount = 0;
        const catSummary = {};

        rows.forEach(r => {
            const f = String(r.fase_atual_de_para || '').toUpperCase().trim();
            const val = parseFloat(r.valor_total) || 0;
            const cat = (r.categoria || 'OUTROS').trim().toUpperCase();

            if (!catSummary[cat]) catSummary[cat] = { semAprov: 0, aprov: 0 };

            if (f === 'EM EXECUÇÃO' || f === 'EXECUTADO') {
                semAprovSum += val;
                semAprovCount++;
                catSummary[cat].semAprov += val;
            } else if (f === 'APROVADO') {
                aprovSum += val;
                aprovCount++;
                catSummary[cat].aprov += val;
            }
        });

        const sortedCats = Object.keys(catSummary).sort((a, b) => (catSummary[b].semAprov + catSummary[b].aprov) - (catSummary[a].semAprov + catSummary[a].aprov));
        let catRowsHtml = "";
        sortedCats.forEach(c => {
            const sem = catSummary[c].semAprov;
            const apr = catSummary[c].aprov;
            catRowsHtml += `
            <tr style="border-bottom: 1px solid #e1e8ed;">
                <td style="padding: 10px 16px; font-size: 13px; color: #2d3748; font-weight: 600;">${c}</td>
                <td style="padding: 10px 16px; font-size: 13px; color: #e67e22; font-weight: 700; text-align: right;">${sem > 0 ? formatBRL(sem) : '-'}</td>
                <td style="padding: 10px 16px; font-size: 13px; color: #27ae60; font-weight: 700; text-align: right;">${apr > 0 ? formatBRL(apr) : '-'}</td>
            </tr>`;
        });

        const name = reportName || REPORT_TITLES.claro;

        return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f6f9; padding: 20px 0;">
        <tr>
            <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid #e1e8ed;">
                    <!-- HEADER -->
                    <tr>
                        <td style="background: #004f71; padding: 30px 40px; text-align: left;">
                            <h1 style="margin: 0; font-size: 24px; color: #ffffff; font-weight: 800;">${name}</h1>
                            <div style="font-size: 12px; color: #e0e0e0; margin-top: 6px;">Atualizado em: ${genAt}</div>
                        </td>
                    </tr>
                    <tr><td style="height: 4px; background: #f39f18;"></td></tr>

                    <!-- CARDS DE MÉTRICAS -->
                    <tr>
                        <td style="padding: 26px 36px 10px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td width="48%" style="background: rgba(230,126,34,0.06); border-radius: 12px; border-left: 5px solid #e67e22; padding: 18px; text-align: center; border-top: 1px solid rgba(230,126,34,0.15); border-right: 1px solid rgba(230,126,34,0.15); border-bottom: 1px solid rgba(230,126,34,0.15);">
                                        <div style="font-size: 11px; color: #d35400; text-transform: uppercase; letter-spacing: 1px; font-weight: 800; margin-bottom: 4px;">SEM APROVAÇÃO</div>
                                        <div style="font-size: 22px; font-weight: 800; color: #d35400; line-height: 1.2;">${formatBRL(semAprovSum)}</div>
                                        <div style="font-size: 11px; color: #7f8c8d; margin-top: 4px; font-weight: 600;">${formatNumber(semAprovCount)} OSs</div>
                                    </td>
                                    <td width="4%"></td>
                                    <td width="48%" style="background: rgba(39,174,96,0.06); border-radius: 12px; border-left: 5px solid #27ae60; padding: 18px; text-align: center; border-top: 1px solid rgba(39,174,96,0.15); border-right: 1px solid rgba(39,174,96,0.15); border-bottom: 1px solid rgba(39,174,96,0.15);">
                                        <div style="font-size: 11px; color: #27ae60; text-transform: uppercase; letter-spacing: 1px; font-weight: 800; margin-bottom: 4px;">AGUARDANDO PEDIDO</div>
                                        <div style="font-size: 22px; font-weight: 800; color: #27ae60; line-height: 1.2;">${formatBRL(aprovSum)}</div>
                                        <div style="font-size: 11px; color: #7f8c8d; margin-top: 4px; font-weight: 600;">${formatNumber(aprovCount)} OSs</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- RESUMO POR CATEGORIA -->
                    <tr>
                        <td style="padding: 16px 36px 10px;">
                            <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #57606f; font-weight: 700; margin-bottom: 10px;">RESUMO FINANCEIRO POR CATEGORIA</div>
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e1e8ed; border-radius: 8px; overflow: hidden; background: #ffffff;">
                                <tr style="background: #f8f9fa;">
                                    <th style="padding: 10px 16px; text-align: left; font-size: 12px; color: #57606f; font-weight: 700;">Categoria</th>
                                    <th style="padding: 10px 16px; text-align: right; font-size: 12px; color: #e67e22; font-weight: 700;">Sem Aprovação</th>
                                    <th style="padding: 10px 16px; text-align: right; font-size: 12px; color: #27ae60; font-weight: 700;">Aguardando Pedido</th>
                                </tr>
                                ${catRowsHtml}
                            </table>
                        </td>
                    </tr>

                    <!-- BOTAO DE ACAO -->
                    <tr>
                        <td style="padding: 20px 36px 28px;">
                            <a href="https://jle-bi.vercel.app/#cobranca" target="_blank" style="display:block; text-align:center; background:#004f71; color:#ffffff; text-decoration:none; padding:12px; border-radius:8px; font-size:13px; font-weight:700;">
                                📊 Acessar Analítico Claro no BI
                            </a>
                        </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                        <td style="background:#f8f9fa; padding:18px; border-top:1px solid #e1e8ed; text-align:center; font-size:11px; color:#747d8c;">
                            Informativo automático gerado pelo <strong>BI JLE Telecom</strong>.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
    }

    // ──────────────────────────────────────────────
    // 4. GERADOR DE HTML: MANUTENÇÃO
    // ──────────────────────────────────────────────
    function generateManutencaoPreviewHtml(reportName) {
        const rows = (window.MANUTENCAO_DATA && Array.isArray(window.MANUTENCAO_DATA)) ? window.MANUTENCAO_DATA : [];
        const metadata = window.MANUTENCAO_METADATA || {};
        const nowInfo = getNowFormatted();
        const genAt = metadata.generated_at ? metadata.generated_at : nowInfo.fullStr;

        let total = rows.length;
        let abertos = 0;
        let concluidos = 0;
        const statusMap = {};

        rows.forEach(r => {
            const st = (r.status || 'OUTROS').trim().toUpperCase();
            statusMap[st] = (statusMap[st] || 0) + 1;
            if (st.includes('CONCLU') || st.includes('FINALIZ') || st.includes('FECHAD')) {
                concluidos++;
            } else {
                abertos++;
            }
        });

        const name = reportName || REPORT_TITLES.manutencao;

        return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#f4f6f9; font-family: 'Segoe UI', Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f9; padding:24px 10px;">
        <tr>
            <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e1e8ed;">
                    <tr>
                        <td style="background:#004f71; padding:28px 36px; border-bottom:4px solid #f39f18;">
                            <h1 style="margin:0; font-size:22px; font-weight:800; color:#ffffff;">${name}</h1>
                            <div style="font-size:12px; color:rgba(255,255,255,0.7); margin-top:4px;">Atualizado em: ${genAt}</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:24px 36px 10px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td width="32%" style="background:rgba(0,79,113,0.04); border-radius:10px; padding:16px 8px; text-align:center; border:1px solid rgba(0,79,113,0.1);">
                                        <div style="font-size:10px; color:#747d8c; font-weight:700; text-transform:uppercase;">TOTAL</div>
                                        <div style="font-size:24px; font-weight:800; color:#004f71; margin-top:4px;">${formatNumber(total)}</div>
                                    </td>
                                    <td width="2%"></td>
                                    <td width="32%" style="background:rgba(243,159,24,0.04); border-radius:10px; padding:16px 8px; text-align:center; border:1px solid rgba(243,159,24,0.1);">
                                        <div style="font-size:10px; color:#b86d00; font-weight:700; text-transform:uppercase;">EM ABERTO</div>
                                        <div style="font-size:24px; font-weight:800; color:#b86d00; margin-top:4px;">${formatNumber(abertos)}</div>
                                    </td>
                                    <td width="2%"></td>
                                    <td width="32%" style="background:rgba(16,185,129,0.04); border-radius:10px; padding:16px 8px; text-align:center; border:1px solid rgba(16,185,129,0.1);">
                                        <div style="font-size:10px; color:#059669; font-weight:700; text-transform:uppercase;">CONCLUÍDOS</div>
                                        <div style="font-size:24px; font-weight:800; color:#059669; margin-top:4px;">${formatNumber(concluidos)}</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:20px 36px 28px;">
                            <a href="https://jle-bi.vercel.app/#manutencao" target="_blank" style="display:block; text-align:center; background:#004f71; color:#fff; text-decoration:none; padding:12px; border-radius:8px; font-size:13px; font-weight:700;">
                                📊 Acessar Módulo de Manutenção no BI
                            </a>
                        </td>
                    </tr>
                    <tr>
                        <td style="background:#f8f9fa; padding:18px; border-top:1px solid #e1e8ed; text-align:center; font-size:11px; color:#747d8c;">
                            Informativo automático gerado pelo <strong>BI JLE Telecom</strong>.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
    }

    // ──────────────────────────────────────────────
    // 5. GERADOR DE HTML: TECNODRILL
    // ──────────────────────────────────────────────
    function generateTecnodrillPreviewHtml(reportName) {
        const txs = (window.TECNODRILL_DATA && Array.isArray(window.TECNODRILL_DATA)) ? window.TECNODRILL_DATA : [];
        const nowInfo = getNowFormatted();

        const nonTransf = txs.filter(t => !t.is_transfer && t.categoria !== 'Saldo Inicial');
        const entradas = nonTransf.filter(t => t.fluxo === 'Entrada').reduce((s, t) => s + (t.valor_nominal || 0), 0);
        const saidas = nonTransf.filter(t => t.fluxo === 'Saída').reduce((s, t) => s + (t.valor_nominal || 0), 0);

        const transfers = txs.filter(t => t.is_transfer);
        const transfRec = transfers.filter(t => t.fluxo === 'Entrada').reduce((s, t) => s + (t.valor_nominal || 0), 0);
        const transfEnv = transfers.filter(t => t.fluxo === 'Saída').reduce((s, t) => s + (t.valor_nominal || 0), 0);

        const resultadoPeriodo = entradas - saidas + transfRec - transfEnv;
        const name = reportName || REPORT_TITLES.tecnodrill;

        return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#f4f6f9; font-family:'Segoe UI', Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f9; padding:24px 10px;">
        <tr>
            <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e1e8ed;">
                    <tr>
                        <td style="background:#004f71; padding:28px 36px; border-bottom:4px solid #f39f18;">
                            <h1 style="margin:0; font-size:22px; font-weight:800; color:#ffffff;">${name}</h1>
                            <div style="font-size:12px; color:rgba(255,255,255,0.7); margin-top:4px;">Atualizado em: ${nowInfo.fullStr}</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:24px 36px 10px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td width="48%" style="background:rgba(0,79,113,0.04); border-radius:10px; padding:16px; border-left:4px solid #004f71;">
                                        <div style="font-size:10px; color:#747d8c; font-weight:700; text-transform:uppercase;">TOTAL DE ENTRADAS</div>
                                        <div style="font-size:20px; font-weight:800; color:#004f71; margin-top:4px;">${formatBRL(entradas)}</div>
                                    </td>
                                    <td width="4%"></td>
                                    <td width="48%" style="background:rgba(243,159,24,0.04); border-radius:10px; padding:16px; border-left:4px solid #f39f18;">
                                        <div style="font-size:10px; color:#747d8c; font-weight:700; text-transform:uppercase;">TOTAL DE SAÍDAS</div>
                                        <div style="font-size:20px; font-weight:800; color:#f39f18; margin-top:4px;">${formatBRL(saidas)}</div>
                                    </td>
                                </tr>
                                <tr style="height:12px;"><td colspan="3"></td></tr>
                                <tr>
                                    <td colspan="3" style="background:rgba(16,185,129,0.06); border-radius:10px; padding:18px; text-align:center; border:1px solid rgba(16,185,129,0.2);">
                                        <div style="font-size:11px; color:#059669; font-weight:800; text-transform:uppercase; letter-spacing:1px;">RESULTADO LÍQUIDO DO PERÍODO</div>
                                        <div style="font-size:28px; font-weight:800; color:#059669; margin-top:4px;">${formatBRL(resultadoPeriodo)}</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:20px 36px 28px;">
                            <a href="https://jle-bi.vercel.app/#tecnodrill" target="_blank" style="display:block; text-align:center; background:#004f71; color:#fff; text-decoration:none; padding:12px; border-radius:8px; font-size:13px; font-weight:700;">
                                📊 Acessar Financeiro Tecnodrill no BI
                            </a>
                        </td>
                    </tr>
                    <tr>
                        <td style="background:#f8f9fa; padding:18px; border-top:1px solid #e1e8ed; text-align:center; font-size:11px; color:#747d8c;">
                            Informativo automático gerado pelo <strong>BI JLE Telecom</strong>.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
    }

    // ──────────────────────────────────────────────
    // CONTROLADOR PRINCIPAL DO MODAL DE PREVIEW
    // ──────────────────────────────────────────────
    function getPreviewHtmlForType(type, reportName) {
        switch ((type || '').toLowerCase()) {
            case 'sar':
                return generateSarPreviewHtml(reportName);
            case 'claro':
            case 'cobranca':
                return generateClaroPreviewHtml(reportName);
            case 'manutencao':
                return generateManutencaoPreviewHtml(reportName);
            case 'tecnodrill':
                return generateTecnodrillPreviewHtml(reportName);
            case 'mdu':
            default:
                return generateMduPreviewHtml(reportName);
        }
    }

    function renderCurrentPreview() {
        const modal = document.getElementById('email-preview-modal');
        if (!modal) return;

        const iframe = document.getElementById('email-preview-iframe');
        const subjectEl = document.getElementById('email-preview-subject');
        const dataInfoEl = document.getElementById('email-preview-data-info');

        const reportName = currentPreviewReportName || REPORT_TITLES[currentPreviewType] || 'Relatório Automático';
        const nowInfo = getNowFormatted();

        if (subjectEl) {
            subjectEl.innerText = `[BI JLE] ${reportName} - ${nowInfo.dateStr}`;
        }

        const html = getPreviewHtmlForType(currentPreviewType, reportName);

        if (iframe) {
            iframe.srcdoc = html;
        }

        // Atualizar abas de tipo
        document.querySelectorAll('.preview-type-btn').forEach(btn => btn.classList.remove('active'));
        const activeTypeBtn = document.getElementById(`preview-btn-${currentPreviewType}`);
        if (activeTypeBtn) activeTypeBtn.classList.add('active');

        // Atualizar dispositivo
        const devDesk = document.getElementById('preview-dev-desktop');
        const devMob = document.getElementById('preview-dev-mobile');
        if (devDesk) devDesk.classList.toggle('active', currentPreviewDevice === 'desktop');
        if (devMob) devMob.classList.toggle('active', currentPreviewDevice === 'mobile');

        if (iframe) {
            iframe.style.width = currentPreviewDevice === 'mobile' ? '380px' : '640px';
        }

        if (dataInfoEl) {
            dataInfoEl.innerHTML = `Visualizando modelo <strong>${currentPreviewType.toUpperCase()}</strong> com dados reais ativos.`;
        }
    }

    window.openEmailPreviewModal = function(reportType, reportName, recipients) {
        currentPreviewType = reportType || 'mdu';
        currentPreviewReportName = reportName || '';
        currentPreviewRecipients = recipients || '';
        currentPreviewDevice = 'desktop';

        const modal = document.getElementById('email-preview-modal');
        if (modal) {
            modal.style.display = 'flex';
            renderCurrentPreview();
        }
    };

    window.closeEmailPreviewModal = function() {
        const modal = document.getElementById('email-preview-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    };

    window.switchPreviewReportType = function(type) {
        currentPreviewType = type;
        currentPreviewReportName = REPORT_TITLES[type] || '';
        renderCurrentPreview();
    };

    window.setPreviewDeviceMode = function(mode) {
        currentPreviewDevice = mode;
        const iframe = document.getElementById('email-preview-iframe');
        if (iframe) {
            iframe.style.width = mode === 'mobile' ? '380px' : '640px';
        }
        const devDesk = document.getElementById('preview-dev-desktop');
        const devMob = document.getElementById('preview-dev-mobile');
        if (devDesk) devDesk.classList.toggle('active', mode === 'desktop');
        if (devMob) devMob.classList.toggle('active', mode === 'mobile');
    };

    window.previewCurrentModalReport = function() {
        const type = document.getElementById('email-modal-type') ? document.getElementById('email-modal-type').value : 'mdu';
        const name = document.getElementById('email-modal-name') ? document.getElementById('email-modal-name').value.trim() : '';
        const rec = document.getElementById('email-modal-recipients') ? document.getElementById('email-modal-recipients').value : '';
        window.openEmailPreviewModal(type, name, rec);
    };

    window.sendTestEmailFromPreview = async function() {
        const defaultEmail = window.currentUserEmail || 'mauricio.maciel@jletelecom.com.br';
        const targetEmail = prompt("Informe o e-mail para envio de teste:", defaultEmail);
        if (!targetEmail || !targetEmail.trim()) return;

        const reportName = currentPreviewReportName || REPORT_TITLES[currentPreviewType] || 'Relatório de Teste';
        const nowInfo = getNowFormatted();
        const subject = `[TESTE] [BI JLE] ${reportName} - ${nowInfo.dateStr}`;
        const html = getPreviewHtmlForType(currentPreviewType, reportName);

        try {
            const resp = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: [targetEmail.trim()],
                    subject: subject,
                    html: html,
                    report_name: reportName,
                    report_type: currentPreviewType
                })
            });

            const resData = await resp.json();
            if (resp.ok && resData.success) {
                alert(`✅ E-mail de teste enviado com sucesso para ${targetEmail.trim()}!`);
            } else {
                alert(`⚠️ O e-mail de teste foi processado (Status: ${resp.status}). Verifique sua caixa de entrada.`);
            }
        } catch (e) {
            alert(`Erro ao solicitar disparo de teste: ${e.message}`);
        }
    };

})(window);
