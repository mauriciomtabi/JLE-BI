// api/sar-report-helper.js
// Utility module to process SAR data and build HTML email reports in the same visual standard as MDU.

const fs = require('fs');
const path = require('path');

function parseSarContent(content) {
    const dataMatch = content.match(/window\.SAR_DATA\s*=\s*(\[[\s\S]*?\]);/);
    const metaMatch = content.match(/window\.SAR_METADATA\s*=\s*({[\s\S]*?});/);

    if (!dataMatch) {
        throw new Error("Não foi possível decodificar window.SAR_DATA de sar_data.js.");
    }

    const rows = JSON.parse(dataMatch[1]);
    const metadata = metaMatch ? JSON.parse(metaMatch[1]) : {};

    const counts = {};
    let concluidas = 0;
    let andamento = 0;
    let canceladas = 0;

    rows.forEach(r => {
        const st = (r.status || 'NÃO INFORMADO').toUpperCase();
        counts[st] = (counts[st] || 0) + 1;

        if (st === 'CONCLUÍDA' || st === 'CONCLUIDA') {
            concluidas++;
        } else if (st === 'CANCELADO' || st === 'CANCELADA') {
            canceladas++;
        } else {
            andamento++;
        }
    });

    return {
        rows,
        total: rows.length,
        concluidas,
        andamento,
        canceladas,
        counts,
        generated_at: metadata.generated_at || new Date().toISOString()
    };
}

async function loadSarDataAsync() {
    // 1. Tentar ler sar_data.js do disco local
    const localPaths = [
        path.join(__dirname, '../sar_data.js'),
        path.join(process.cwd(), 'sar_data.js'),
        path.join(__dirname, 'sar_data.js')
    ];

    for (const p of localPaths) {
        if (fs.existsSync(p)) {
            try {
                const content = fs.readFileSync(p, 'utf8');
                return parseSarContent(content);
            } catch (e) {
                console.warn(`Erro ao ler ${p}:`, e.message);
            }
        }
    }

    // 2. Fallback remoto
    const remoteUrls = [
        'https://raw.githubusercontent.com/mauriciomtabi/JLE-BI/main/sar_data.js',
        'https://jle-bi.vercel.app/sar_data.js'
    ];

    for (const url of remoteUrls) {
        try {
            const resp = await fetch(url);
            if (resp.ok) {
                const content = await resp.text();
                if (content && content.includes('window.SAR_DATA')) {
                    return parseSarContent(content);
                }
            }
        } catch (e) {
            console.warn(`Falha ao buscar sar_data.js de ${url}:`, e.message);
        }
    }

    throw new Error("Não foi possível carregar os dados de SAR.");
}

function formatEmailGeneratedAt(genDate) {
    if (!genDate) return "Atualizado recentemente";
    try {
        if (genDate.includes('T')) {
            const d = new Date(genDate);
            if (!isNaN(d.getTime())) {
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                const hours = String(d.getHours()).padStart(2, '0');
                const minutes = String(d.getMinutes()).padStart(2, '0');
                return `${day}/${month}/${year} às ${hours}:${minutes}`;
            }
        }
        return String(genDate);
    } catch {
        return String(genDate);
    }
}

function buildSarEmailHtml(reportName, sarData) {
    const generatedAt = formatEmailGeneratedAt(sarData.generated_at);
    const total = sarData.total;
    const concluidas = sarData.concluidas;
    const andamento = sarData.andamento;
    const agRelatorio = sarData.counts['AG. RELATÓRIO'] || sarData.counts['AG. RELATORIO'] || 0;

    const BI_URL = process.env.BI_PUBLIC_URL || "https://jle-bi.vercel.app";

    const statusColors = {
        'CONCLUÍDA': '#10b981',
        'CONCLUIDA': '#10b981',
        'AG. RELATÓRIO': '#1e90ff',
        'AG. RELATORIO': '#1e90ff',
        'CANCELADO': '#ff4757',
        'CANCELADA': '#ff4757',
        'SEM SINAL': '#f39f18',
        'AG. MEDIÇÃO': '#a855f7',
        'AG. MEDICAO': '#a855f7',
        'PARALISADO': '#747d8c'
    };

    const statusItems = Object.keys(sarData.counts).map(key => ({
        key: key,
        count: sarData.counts[key],
        color: statusColors[key] || '#004f71'
    })).sort((a, b) => b.count - a.count);

    let statusRows = "";
    statusItems.forEach(item => {
        const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0';
        statusRows += `
        <tr>
            <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #2c3e50; font-weight: 500;">
                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${item.color}; margin-right:8px; vertical-align:middle;"></span>
                ${item.key}
            </td>
            <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; text-align:center;">
                <span style="background:rgba(0,79,113,0.06); color:#004f71; padding:4px 14px; border-radius:20px; font-size:13px; font-weight:700;">${item.count.toLocaleString('pt-BR')}</span>
            </td>
            <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; text-align:right; font-size:13px; color:#747d8c; font-weight:600;">
                ${pct}%
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
                            <td style="background: #004f71; padding: 32px 40px; border-bottom: 4px solid #1e90ff;">
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
                        
                        <!-- CARDS DE DESTAQUE (PADRÃO MDU) -->
                        <tr>
                            <td style="padding: 30px 40px 0;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td colspan="5" style="background: rgba(0,79,113,0.04); border-radius: 12px; border: 1px solid rgba(0,79,113,0.08); text-align: center; padding: 22px;">
                                            <div style="font-size: 11px; color: #747d8c; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 6px;">TOTAL DE ORDENS DE SERVIÇO SAR</div>
                                            <div style="font-size: 40px; font-weight: 800; color: #004f71; line-height: 1;">${total.toLocaleString('pt-BR')}</div>
                                        </td>
                                    </tr>
                                    <tr style="height: 14px;"><td colspan="5"></td></tr>
                                    <tr>
                                        <td width="31%" style="background: rgba(16,185,129,0.06); border-radius: 10px; border-top: 3px solid #10b981; padding: 14px 10px; text-align: center; border-left: 1px solid rgba(16,185,129,0.1); border-right: 1px solid rgba(16,185,129,0.1); border-bottom: 1px solid rgba(16,185,129,0.1);">
                                            <div style="font-size: 10px; color: #10b981; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 4px;">Concluídas</div>
                                            <div style="font-size: 22px; font-weight: 800; color: #10b981;">${concluidas.toLocaleString('pt-BR')}</div>
                                        </td>
                                        <td width="3.5%"></td>
                                        <td width="31%" style="background: rgba(243,159,24,0.06); border-radius: 10px; border-top: 3px solid #f39f18; padding: 14px 10px; text-align: center; border-left: 1px solid rgba(243,159,24,0.1); border-right: 1px solid rgba(243,159,24,0.1); border-bottom: 1px solid rgba(243,159,24,0.1);">
                                            <div style="font-size: 10px; color: #d37f00; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 4px;">Em Andamento</div>
                                            <div style="font-size: 22px; font-weight: 800; color: #b86d00;">${andamento.toLocaleString('pt-BR')}</div>
                                        </td>
                                        <td width="3.5%"></td>
                                        <td width="31%" style="background: rgba(30,144,255,0.06); border-radius: 10px; border-top: 3px solid #1e90ff; padding: 14px 10px; text-align: center; border-left: 1px solid rgba(30,144,255,0.1); border-right: 1px solid rgba(30,144,255,0.1); border-bottom: 1px solid rgba(30,144,255,0.1);">
                                            <div style="font-size: 10px; color: #1e90ff; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 4px;">Ag. Relatório</div>
                                            <div style="font-size: 22px; font-weight: 800; color: #1e90ff;">${agRelatorio.toLocaleString('pt-BR')}</div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- TABELA DE STATUS (SOMENTE OS STATUS) -->
                        <tr>
                            <td style="padding: 28px 40px 10px;">
                                <div style="font-size:12px; text-transform:uppercase; letter-spacing:1.5px; color:#57606f; font-weight:700; margin-bottom:12px;">Detalhamento por Status Geral</div>
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e1e8ed; border-radius:8px; overflow:hidden;">
                                    <tr style="background:#f8f9fa;">
                                        <th style="padding:12px 20px; text-align:left; font-size:12px; color:#57606f; font-weight:700;">Status</th>
                                        <th style="padding:12px 20px; text-align:center; font-size:12px; color:#57606f; font-weight:700; width:90px;">Qtd.</th>
                                        <th style="padding:12px 20px; text-align:right; font-size:12px; color:#57606f; font-weight:700; width:70px;">%</th>
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
                                        <td width="100%">
                                            <a href="${BI_URL}/#sar" style="display:block; text-align:center; background:#004f71; color:#ffffff; text-decoration:none; padding:14px; border-radius:8px; font-size:14px; font-weight:700; box-shadow:0 4px 12px rgba(0,79,113,0.15); border-bottom: 2px solid #002d42;">
                                                📦 Acessar Painel SAR no BI
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
    loadSarDataAsync,
    buildSarEmailHtml
};
