// api/send-email.js
// Serverless function on Vercel to trigger MDU email report instantly from the browser

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = "https://fowlctvebdcodphntsjw.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvd2xjdHZlYmRjb2RwaG50c2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzg2NjUsImV4cCI6MjA5NTY1NDY2NX0.PxzD_PlU4sBFPBukthuXpkBlzYbQqMLXLE4DQwctPOM";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "re_bBQyi9qa_C5py6HbtiYrNfPoJhZLUATRw";
const FROM_EMAIL = "bi@jletelecom.com.br";
const BI_URL = "https://jle-bi.vercel.app";
const SHEETS_URL = "https://docs.google.com/spreadsheets/d/1eEJLaV7D0rthjC5H1MppXyk7dyroqn2h/edit";

async function fetchSupabase(endpoint, method = 'GET', body = null) {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    const headers = {
        "apikey": ANON_KEY,
        "Authorization": `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    };
    const options = { method, headers };
    if (body) {
        options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Supabase Error ${res.status}: ${errText}`);
    }
    return res.json();
}

async function sendResendEmail(to, subject, html) {
    const url = "https://api.resend.com/emails";
    const headers = {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
    };
    const body = {
        from: `BI JLE Telecom <${FROM_EMAIL}>`,
        to: to,
        subject: subject,
        html: html
    };
    const res = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
    });
    const resData = await res.json();
    if (!res.ok) {
        throw new Error(`Resend Error: ${JSON.stringify(resData)}`);
    }
    return resData;
}

function getMduStatusCounts() {
    // No ambiente Vercel, process.cwd() aponta para a raiz do deploy
    const jsPath = path.join(process.cwd(), 'mdu_data.js');
    if (!fs.existsSync(jsPath)) {
        throw new Error(`Arquivo mdu_data.js nao encontrado no local: ${jsPath}`);
    }
    
    const content = fs.readFileSync(jsPath, 'utf8');
    const generatedAtMatch = content.match(/"generated_at"\s*:\s*"([^"]+)"/);
    const generatedAt = generatedAtMatch ? generatedAtMatch[1] : "N/D";
    
    const dataMatch = content.match(/window\.MDU_DATA\s*=\s*([\s\S]+?);\s*$/);
    if (!dataMatch) {
        throw new Error("Formato do arquivo mdu_data.js invalido.");
    }
    
    const mduData = JSON.parse(dataMatch[1]);
    const excludeStatus = ["FINALIZADO", "FINALIZADA", "CANCELADO", "CANCELADA"];
    const counts = {};
    let totalActive = 0;
    
    mduData.forEach(r => {
        let status = (r.status || '').trim();
        if (status === "") {
            status = "Não Definido";
        }
        const statusUpper = status.toUpperCase();
        if (excludeStatus.includes(statusUpper)) return;
        
        counts[status] = (counts[status] || 0) + 1;
        totalActive++;
    });
    
    return { counts, total: totalActive, generated_at: generatedAt };
}

function matchStatus(key, dbKey) {
    const k = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const db = dbKey.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    
    if (k === db) return true;
    
    // Substring checks for 1ª / 2ª Vistoria
    if (db.includes('1') && db.includes('vistoria') && k.includes('1') && k.includes('vistoria')) return true;
    if (db.includes('2') && db.includes('vistoria') && k.includes('2') && k.includes('vistoria')) return true;
    
    // Checks for Não Definido
    if ((db === '' || db.includes('definido') || db.includes('indefinido')) && 
        (k === '' || k.includes('definido') || k.includes('indefinido'))) return true;
    
    return false;
}

function buildEmailHtml(data, reportName) {
    const generatedAt = data.generated_at;
    const total = data.total;
    
    // Fuso horário fixo de Brasília (UTC-3)
    const utcDate = new Date();
    const brOffset = -3 * 60 * 60 * 1000; // -3 horas em milissegundos
    const localDate = new Date(utcDate.getTime() + brOffset);
    const day = String(localDate.getUTCDate()).padStart(2, '0');
    const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
    const year = localDate.getUTCFullYear();
    const hours = String(localDate.getUTCHours()).padStart(2, '0');
    const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
    const nowStr = `${day}/${month}/${year} às ${hours}:${minutes}`;
    
    // Obter quantidades específicas para destaque
    let medicaoCount = 0;
    let relatorioCount = 0;
    Object.keys(data.counts).forEach(k => {
        if (k.toLowerCase().includes('medicao') || k.toLowerCase().includes('medição')) {
            medicaoCount += data.counts[k];
        }
        if (k.toLowerCase().includes('relatorio') || k.toLowerCase().includes('relatório')) {
            relatorioCount += data.counts[k];
        }
    });

    const statusOrder = [
        { key: "1ª Vistoria", color: "#004f71" },
        { key: "2ª Vistoria", color: "#004f71" },
        { key: "Projeto",     color: "#004f71" },
        { key: "Fusão",       color: "#004f71" },
        { key: "Medição",     color: "#004f71" },
        { key: "Relatório",   color: "#004f71" },
        { key: "Baixa",       color: "#004f71" },
        { key: "Não Definido", color: "#004f71" }
    ];
    
    let statusRows = "";
    statusOrder.forEach(s => {
        let cnt = 0;
        Object.keys(data.counts).forEach(k => {
            if (matchStatus(s.key, k)) {
                cnt = data.counts[k];
            }
        });
        
        if (cnt > 0) {
            statusRows += `
            <tr>
                <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #2c3e50; font-weight: 500;">
                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${s.color}; margin-right:8px; vertical-align:middle;"></span>
                    ${s.key}
                </td>
                <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; text-align:center;">
                    <span style="background:rgba(0,79,113,0.06); color:#004f71; padding:4px 14px; border-radius:20px; font-size:13px; font-weight:700;">${cnt}</span>
                </td>
            </tr>`;
        }
    });

    // Adicionar outros status eventuais não mapeados
    Object.keys(data.counts).forEach(k => {
        const isMapped = statusOrder.some(s => matchStatus(s.key, k));
        if (!isMapped && data.counts[k] > 0) {
            statusRows += `
            <tr>
                <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #2c3e50; font-weight: 500;">
                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#747d8c; margin-right:8px; vertical-align:middle;"></span>
                    ${k}
                </td>
                <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; text-align:center;">
                    <span style="background:rgba(116,125,140,0.1); color:#747d8c; padding:4px 14px; border-radius:20px; font-size:13px; font-weight:700;">${data.counts[k]}</span>
                </td>
            </tr>`;
        }
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
                            <td style="background: #ffffff; padding: 32px 40px; border-bottom: 4px solid #f39f18;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td align="left" valign="middle">
                                            <h1 style="margin:0; font-size:24px; font-weight:800; color:#004f71; line-height:1.2;">${reportName}</h1>
                                            <div style="font-size:12px; color:#747d8c; margin-top:6px; font-weight: 500;">Atualizado em: ${generatedAt}</div>
                                        </td>
                                        <td align="right" valign="middle" style="width: 120px;">
                                            <img src="https://jle-bi.vercel.app/assets/logo_jle.png" alt="JLE Telecom" style="height: 44px; display: block;">
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        
                        <!-- CARD DE DESTAQUE -->
                        <tr>
                            <td style="padding: 30px 40px 0;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td colspan="3" style="background: rgba(0,79,113,0.04); border-radius: 12px; border: 1px solid rgba(0,79,113,0.08); text-align: center; padding: 24px;">
                                            <div style="font-size: 11px; color: #747d8c; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 6px;">ORDENS DE SERVIÇO EM ANDAMENTO</div>
                                            <div style="font-size: 42px; font-weight: 800; color: #004f71; line-height: 1;">${total}</div>
                                        </td>
                                    </tr>
                                    <tr style="height: 16px;"><td colspan="3"></td></tr>
                                    <tr>
                                        <td width="48%" style="background: rgba(243,159,24,0.06); border-radius: 10px; border-left: 4px solid #f39f18; padding: 16px 20px; text-align: center; border-top: 1px solid rgba(243,159,24,0.1); border-right: 1px solid rgba(243,159,24,0.1); border-bottom: 1px solid rgba(243,159,24,0.1);">
                                            <div style="font-size: 11px; color: #d37f00; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 4px;">Medição</div>
                                            <div style="font-size: 28px; font-weight: 800; color: #b86d00;">${medicaoCount}</div>
                                        </td>
                                        <td width="4%"></td>
                                        <td width="48%" style="background: rgba(0,119,170,0.06); border-radius: 10px; border-left: 4px solid #0077aa; padding: 16px 20px; text-align: center; border-top: 1px solid rgba(0,119,170,0.1); border-right: 1px solid rgba(0,119,170,0.1); border-bottom: 1px solid rgba(0,119,170,0.1);">
                                            <div style="font-size: 11px; color: #0077aa; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 4px;">Relatórios</div>
                                            <div style="font-size: 28px; font-weight: 800; color: #005f87;">${relatorioCount}</div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- TABELA DE STATUS -->
                        <tr>
                            <td style="padding: 28px 40px 10px;">
                                <div style="font-size:12px; text-transform:uppercase; letter-spacing:1.5px; color:#57606f; font-weight:700; margin-bottom:12px;">Detalhamento das OSs</div>
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e1e8ed; border-radius:8px; overflow:hidden;">
                                    <tr style="background:#f8f9fa;">
                                        <th style="padding:12px 20px; text-align:left; font-size:12px; color:#57606f; font-weight:700;">Status</th>
                                        <th style="padding:12px 20px; text-align:center; font-size:12px; color:#57606f; font-weight:700; width:80px;">Qtd.</th>
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

module.exports = async (req, res) => {
    // Configurar Headers de CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    try {
        const { id } = req.body;
        if (!id) {
            res.status(400).json({ error: "Missing config ID" });
            return;
        }

        console.log(`Disparo instantâneo solicitado para relatório ID: ${id}`);
        
        // 1. Buscar a configuração no Supabase
        const configs = await fetchSupabase(`bi_email_reports?id=eq.${id}&select=*`);
        if (!configs || configs.length === 0) {
            res.status(404).json({ error: "Relatorio nao localizado no banco." });
            return;
        }
        
        const config = configs[0];
        
        // 2. Extrair contagens do MDU
        const mduData = getMduStatusCounts();
        
        // 3. Montar e enviar e-mail
        const emailHtml = buildEmailHtml(mduData, config.report_name);
        const utcDate = new Date();
        const brOffset = -3 * 60 * 60 * 1000;
        const localDate = new Date(utcDate.getTime() + brOffset);
        const dayStr = String(localDate.getUTCDate()).padStart(2, '0');
        const monthStr = String(localDate.getUTCMonth() + 1).padStart(2, '0');
        const yearStr = localDate.getUTCFullYear();
        const subject = `[BI JLE] ${config.report_name} - ${dayStr}/${monthStr}/${yearStr}`;
        
        await sendResendEmail(config.recipients, subject, emailHtml);
        
        // 4. Salvar last_sent_at
        await fetchSupabase(`bi_email_reports?id=eq.${id}`, 'PATCH', {
            last_sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
        
        res.status(200).json({ success: true });
    } catch (err) {
        console.error("Erro no envio do e-mail:", err);
        res.status(500).json({ error: err.message });
    }
};
