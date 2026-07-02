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
    const nowStr = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    
    const statusOrder = [
        { key: "1ª Vistoria", color: "#70a1ff", bg: "rgba(112,161,255,0.1)" },
        { key: "2ª Vistoria", color: "#2ecc71", bg: "rgba(46,204,113,0.1)" },
        { key: "Projeto",     color: "#ff6b81", bg: "rgba(255,107,129,0.1)" },
        { key: "Fusão",       color: "#1e90ff", bg: "rgba(30,144,255,0.1)"  },
        { key: "Medição",     color: "#ffa502", bg: "rgba(255,165,2,0.1)"   },
        { key: "Relatório",   color: "#a4b0be", bg: "rgba(164,176,190,0.1)" },
        { key: "Baixa",       color: "#2f3542", bg: "rgba(47,53,66,0.1)"    },
        { key: "Não Definido", color: "#f39f18", bg: "rgba(243,159,24,0.1)"  }
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
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${s.color}; margin-right:8px;"></span>
                    ${s.key}
                </td>
                <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; text-align:center;">
                    <span style="background:${s.bg}; color:${s.color}; padding:4px 14px; border-radius:20px; font-size:13px; font-weight:700;">${cnt}</span>
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
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#747d8c; margin-right:8px;"></span>
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
                            <td style="background: #004f71; padding: 36px 40px; color:#ffffff; border-bottom: 4px solid #f39f18;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td>
                                            <img src="https://jle-bi.vercel.app/assets/logo_jle.png" alt="JLE Telecom" style="height: 52px; display: block; margin-bottom: 16px;">
                                            <h1 style="margin:0; font-size:24px; font-weight:800; color:#ffffff; line-height:1.2;">${reportName}</h1>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        
                        <!-- CARD DE DESTAQUE -->
                        <tr>
                            <td style="padding: 30px 40px 0;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(0,79,113,0.04); border-radius:12px; border: 1px solid rgba(0,79,113,0.08); text-align:center; padding:24px;">
                                    <tr>
                                        <td>
                                            <div style="font-size:13px; color:#57606f; text-transform:uppercase; letter-spacing:1px; font-weight:600; margin-bottom:6px;">ORDENS DE SERVIÇO EM ANDAMENTO</div>
                                            <div style="font-size:44px; font-weight:800; color:#004f71; line-height:1;">${total}</div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- TABELA DE STATUS -->
                        <tr>
                            <td style="padding: 24px 40px 10px;">
                                <div style="font-size:12px; text-transform:uppercase; letter-spacing:1.5px; color:#57606f; font-weight:700; margin-bottom:12px;">Desempenho por Status</div>
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
        const subject = `[BI JLE] ${config.report_name} - ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
        
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
