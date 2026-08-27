// api/mdu-report-helper.js
// Utility module to process MDU data and generate standardized HTML email reports.

const fs = require('fs');
const path = require('path');

function parseMduContent(content) {
    const dataMatch = content.match(/window\.MDU_DATA\s*=\s*(\[[\s\S]*?\]);/);
    const metaMatch = content.match(/window\.MDU_METADATA\s*=\s*({[\s\S]*?});/);

    if (!dataMatch) {
        throw new Error("Não foi possível decodificar window.MDU_DATA de mdu_data.js.");
    }

    const rows = JSON.parse(dataMatch[1]);
    const metadata = metaMatch ? JSON.parse(metaMatch[1]) : {};

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
        } else if (sUpper === 'PROJETO' || sUpper === 'BAIXA' || sUpper === 'NÃO ADEQUADO' || sUpper === 'NAO ADEQUADO') {
            counts['Não Adequado']++;
        } else if (sUpper === 'RELATÓRIO' || sUpper === 'RELATORIO' || sUpper === 'RELATÓRIO HBOX') {
            counts['Não Adequado']++;
        } else {
            counts['FALTA DADOS']++;
        }
    });

    return {
        rows,
        total: totalActive,
        medicaoCount,
        relatoriosCount,
        counts,
        generated_at: metadata.generated_at || new Date().toISOString()
    };
}

async function loadMduDataAsync() {
    // 1. Tentar ler mdu_data.js do disco local
    const localPaths = [
        path.join(__dirname, '../mdu_data.js'),
        path.join(process.cwd(), 'mdu_data.js'),
        path.join(__dirname, 'mdu_data.js')
    ];

    for (const p of localPaths) {
        if (fs.existsSync(p)) {
            try {
                const content = fs.readFileSync(p, 'utf8');
                return parseMduContent(content);
            } catch (e) {
                console.warn(`Erro ao ler ${p}:`, e.message);
            }
        }
    }

    // 2. Fallback remoto
    const remoteUrls = [
        'https://raw.githubusercontent.com/mauriciomtabi/JLE-BI/main/mdu_data.js',
        'https://jle-bi.vercel.app/mdu_data.js'
    ];

    for (const url of remoteUrls) {
        try {
            const resp = await fetch(url);
            if (resp.ok) {
                const content = await resp.text();
                if (content && content.includes('window.MDU_DATA')) {
                    return parseMduContent(content);
                }
            }
        } catch (e) {
            console.warn(`Falha ao buscar mdu_data.js de ${url}:`, e.message);
        }
    }

    throw new Error("Não foi possível carregar os dados de MDU.");
}

function formatEmailGeneratedAt(genDate) {
    if (!genDate || genDate === 'N/D' || String(genDate).trim() === '') {
        const utcDate = new Date();
        const brOffset = -3 * 60 * 60 * 1000;
        const localDate = new Date(utcDate.getTime() + brOffset);
        const day = String(localDate.getUTCDate()).padStart(2, '0');
        const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
        const year = localDate.getUTCFullYear();
        const hours = String(localDate.getUTCHours()).padStart(2, '0');
        const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} às ${hours}:${minutes}`;
    }
    const str = String(genDate).trim();
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (match) {
        return `${match[3]}/${match[2]}/${match[1]} às ${match[4]}:${match[5]}`;
    }
    try {
        if (str.includes('T') || str.includes('-')) {
            const d = new Date(str.includes('T') ? str : str.replace(' ', 'T'));
            if (!isNaN(d.getTime())) {
                const brDate = new Date(d.getTime() - 3 * 60 * 60 * 1000);
                const day = String(brDate.getUTCDate()).padStart(2, '0');
                const month = String(brDate.getUTCMonth() + 1).padStart(2, '0');
                const year = brDate.getUTCFullYear();
                const hours = String(brDate.getUTCHours()).padStart(2, '0');
                const minutes = String(brDate.getUTCMinutes()).padStart(2, '0');
                return `${day}/${month}/${year} às ${hours}:${minutes}`;
            }
        }
        return str;
    } catch {
        return str;
    }
}

function buildMduEmailHtml(reportName, mduData) {
    const generatedAt = formatEmailGeneratedAt(mduData.generated_at);
    const total = mduData.total;
    const medicaoCount = mduData.medicaoCount;
    const relatoriosCount = mduData.relatoriosCount;

    const BI_URL = process.env.BI_PUBLIC_URL || "https://jle-bi.vercel.app";
    const SHEETS_URL = "https://docs.google.com/spreadsheets/d/1eEJLaV7D0rthjC5H1MppXyk7dyroqn2h/edit";

    const statusDotColors = {
        '2º Vistoria': '#747d8c',
        '1º Vistoria': '#747d8c',
        'Pendências Claro': '#004f71',
        'Medição': '#004f71',
        'Pendência': '#f39f18',
        'Não Adequado': '#004f71',
        'FALTA DADOS': '#747d8c'
    };

    const statusOrder = [
        '2º Vistoria',
        '1º Vistoria',
        'Pendências Claro',
        'Medição',
        'Pendência',
        'Não Adequado',
        'FALTA DADOS'
    ];

    let statusRows = "";
    statusOrder.forEach(key => {
        const count = mduData.counts[key] || 0;
        const color = statusDotColors[key] || '#747d8c';
        statusRows += `
        <tr>
            <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #2c3e50; font-weight: 500;">
                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${color}; margin-right:10px; vertical-align:middle;"></span>
                ${key}
            </td>
            <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; text-align:right;">
                <span style="background:rgba(0,79,113,0.06); color:#004f71; padding:4px 14px; border-radius:20px; font-size:13px; font-weight:700;">${count.toLocaleString('pt-BR')}</span>
            </td>
        </tr>`;
    });

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
                    <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.05); border: 1px solid #e1e8ed;">
                        <!-- HEADER -->
                        <tr>
                            <td style="background: #004f71; padding: 32px 40px; border-bottom: 4px solid #f39f18;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td align="left" valign="middle">
                                            <h1 style="margin:0; font-size:24px; font-weight:800; color:#ffffff; line-height:1.2;">${reportName}</h1>
                                            <div style="font-size:12px; color:rgba(255,255,255,0.7); margin-top:6px; font-weight: 500;">Atualizado em: ${generatedAt}</div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        
                        <!-- CARDS DE DESTAQUE (PADRÃO CONSOLIDADO) -->
                        <tr>
                            <td style="padding: 30px 40px 0;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <!-- CARD PRINCIPAL: ORDENS DE SERVIÇO EM ANDAMENTO -->
                                    <tr>
                                        <td colspan="3" style="background: rgba(0,79,113,0.04); border-radius: 12px; border: 1px solid rgba(0,79,113,0.08); text-align: center; padding: 22px;">
                                            <div style="font-size: 11px; color: #747d8c; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 6px;">ORDENS DE SERVIÇO EM ANDAMENTO</div>
                                            <div style="font-size: 40px; font-weight: 800; color: #004f71; line-height: 1;">${total.toLocaleString('pt-BR')}</div>
                                        </td>
                                    </tr>
                                    <tr style="height: 14px;"><td colspan="3"></td></tr>
                                    <!-- 2 SUBCARDS: MEDIÇÃO E RELATÓRIOS -->
                                    <tr>
                                        <td width="48%" style="background: rgba(243,159,24,0.04); border-radius: 10px; border-top: 3px solid #f39f18; padding: 18px 10px; text-align: center; border-left: 1px solid rgba(243,159,24,0.1); border-right: 1px solid rgba(243,159,24,0.1); border-bottom: 1px solid rgba(243,159,24,0.1);">
                                            <div style="font-size: 11px; color: #b86d00; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; margin-bottom: 6px;">MEDIÇÃO</div>
                                            <div style="font-size: 28px; font-weight: 800; color: #b86d00; line-height: 1;">${medicaoCount.toLocaleString('pt-BR')}</div>
                                        </td>
                                        <td width="4%"></td>
                                        <td width="48%" style="background: rgba(0,79,113,0.04); border-radius: 10px; border-top: 3px solid #004f71; padding: 18px 10px; text-align: center; border-left: 1px solid rgba(0,79,113,0.1); border-right: 1px solid rgba(0,79,113,0.1); border-bottom: 1px solid rgba(0,79,113,0.1);">
                                            <div style="font-size: 11px; color: #004f71; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; margin-bottom: 6px;">RELATÓRIOS</div>
                                            <div style="font-size: 28px; font-weight: 800; color: #004f71; line-height: 1;">${relatoriosCount.toLocaleString('pt-BR')}</div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- TABELA DE STATUS -->
                        <tr>
                            <td style="padding: 28px 40px 10px;">
                                <div style="font-size:12px; text-transform:uppercase; letter-spacing:1.5px; color:#57606f; font-weight:700; margin-bottom:12px;">DETALHAMENTO POR STATUS</div>
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e1e8ed; border-radius:8px; overflow:hidden;">
                                    <tr style="background:#f8f9fa;">
                                        <th style="padding:12px 20px; text-align:left; font-size:12px; color:#57606f; font-weight:700;">Status</th>
                                        <th style="padding:12px 20px; text-align:right; font-size:12px; color:#57606f; font-weight:700; width:100px;">Qtd.</th>
                                    </tr>
                                    ${statusRows}
                                </table>
                            </td>
                        </tr>

                        <!-- BOTOES DE ACAO -->
                        <tr>
                            <td style="padding: 24px 40px 36px;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td width="48%">
                                            <a href="${BI_URL}/#mdu" style="display:block; text-align:center; background:#004f71; color:#ffffff; text-decoration:none; padding:14px; border-radius:8px; font-size:14px; font-weight:700; box-shadow:0 4px 12px rgba(0,79,113,0.15); border-bottom: 2px solid #002d42;">
                                                📊 Ir para o BI
                                            </a>
                                        </td>
                                        <td width="4%"></td>
                                        <td width="48%">
                                            <a href="${SHEETS_URL}" style="display:block; text-align:center; background:#217346; color:#ffffff; text-decoration:none; padding:14px; border-radius:8px; font-size:14px; font-weight:700; box-shadow:0 4px 12px rgba(33,115,70,0.15); border-bottom: 2px solid #14462a;">
                                                📋 Ir para a Planilha
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- FOOTER -->
                        <tr>
                            <td style="background:#f8f9fa; padding:24px; border-top:1px solid #e1e8ed; text-align:center; font-size:12px; color:#747d8c;">
                                Este é um informativo automático do <strong>BI JLE Telecom</strong>.
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
    loadMduDataAsync,
    buildMduEmailHtml
};
