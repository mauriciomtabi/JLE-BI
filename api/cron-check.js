// api/cron-check.js
// Serverless function on Vercel to check and trigger scheduled email reports.
// Can be called periodically by any free cron service (like cron-job.org) to bypass GitHub Action delays.

const SUPABASE_URL = "https://fowlctvebdcodphntsjw.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvd2xjdHZlYmRjb2RwaG50c2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzg2NjUsImV4cCI6MjA5NTY1NDY2NX0.PxzD_PlU4sBFPBukthuXpkBlzYbQqMLXLE4DQwctPOM";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = "bi@jletelecom.com.br";
const BI_URL = "https://jle-bi.vercel.app";
const SHEETS_URL = "https://docs.google.com/spreadsheets/d/1eEJLaV7D0rthjC5H1MppXyk7dyroqn2h/edit";
const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/1eEJLaV7D0rthjC5H1MppXyk7dyroqn2h/export?format=csv&gid=260790893";

function getSupabaseAuthHeaders() {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    const key = serviceKey || ANON_KEY;
    return {
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    };
}

async function fetchSupabase(endpoint, method = 'GET', body = null) {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    const headers = getSupabaseAuthHeaders();
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

async function sendResendEmail(to, subject, html, attachments = null) {
    const url = "https://api.resend.com/emails";
    const headers = {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
    const body = {
        from: `"BI JLE Telecom" <${FROM_EMAIL}>`,
        to: to,
        subject: subject,
        html: html
    };
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        body.attachments = attachments;
    }
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

function parseCsv(csvText) {
    const lines = [];
    let row = [];
    let inQuotes = false;
    let currentCell = '';
    
    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentCell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push(currentCell);
            currentCell = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            row.push(currentCell);
            if (row.length > 0 && row.some(cell => cell !== '')) {
                lines.push(row);
            }
            row = [];
            currentCell = '';
            if (char === '\r' && nextChar === '\n') {
                i++;
            }
        } else {
            currentCell += char;
        }
    }
    if (currentCell || row.length > 0) {
        row.push(currentCell);
        lines.push(row);
    }
    return lines;
}

async async function getMduStatusCounts() {
    try {
        const excludeStatus = ["FINALIZADO", "FINALIZADA", "CANCELADO", "CANCELADA"];
        const counts = {};
        let totalActive = 0;
        let generatedAt = "N/D";
        let content = null;

        // 1. Tentar ler mdu_data.js local
        try {
            const jsPath = path.join(process.cwd(), 'mdu_data.js');
            if (fs.existsSync(jsPath)) {
                content = fs.readFileSync(jsPath, 'utf8');
            }
        } catch (e) {}

        // 2. Se não existir localmente (ex: Vercel Serverless), baixar mdu_data.js da Vercel
        if (!content) {
            try {
                const res = await fetch('https://jle-bi.vercel.app/mdu_data.js');
                if (res.ok) {
                    content = await res.text();
                }
            } catch (e) {
                console.warn("Falha ao baixar mdu_data.js da Vercel:", e.message);
            }
        }

        // 3. Processar o conteúdo de mdu_data.js se disponível
        if (content) {
            try {
                const generatedAtMatch = content.match(/"generated_at"s*:s*"([^"]+)"/);
                if (generatedAtMatch) generatedAt = generatedAtMatch[1];

                const dataMatch = content.match(/window.MDU_DATAs*=s*([sS]+?);s*$/);
                if (dataMatch) {
                    const mduData = JSON.parse(dataMatch[1]);
                    mduData.forEach(r => {
                        let status = r.status ? r.status.trim() : '';
                        const statusUpper = status.toUpperCase();

                        if (excludeStatus.includes(statusUpper)) return;

                        if (/^1[ºoOaA]?s*Vistoria/i.test(status) || statusUpper === 'VISTORIA' ||
                            /^2[ºoOaA]?s*Vistoria/i.test(status) ||
                            statusUpper === 'BAIXA' ||
                            statusUpper === 'PROJETO' ||
                            statusUpper === 'NÃO DEFINIDO' || statusUpper === 'NÃO DEFINIDA' || status === '' || status === '-') {
                            status = 'Não Adequado';
                        } else if (statusUpper === 'FUSÃO' || statusUpper === 'FUSAO') {
                            status = 'Pendências Claro';
                        }

                        counts[status] = (counts[status] || 0) + 1;
                        totalActive++;
                    });

                    return { counts, total: totalActive, generated_at: generatedAt };
                }
            } catch (e) {
                console.warn("Erro ao processar mdu_data.js:", e.message);
            }
        }

        // 4. Fallback via Google Sheets CSV caso mdu_data.js falhe totalmente
        console.log("Baixando planilha do Google Sheets para o e-mail (fallback)...");
        const res = await fetch('https://docs.google.com/spreadsheets/d/1eEJLaV7D0rthjC5H1MppXyk7dyroqn2h/export?format=csv&gid=260790893', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!res.ok) throw new Error(`Erro ao baixar a planilha: HTTP ${res.status}`);
        const csvText = await res.text();
        
        const rows = parseCsv(csvText);
        if (rows.length === 0) throw new Error("Planilha vazia ou inválida.");

        const headers = rows[0];
        const statusIdx = headers.findIndex(h => h.trim().toUpperCase() === "STATUS");
        
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            let colIdx = statusIdx;
            if (colIdx === -1 || colIdx >= r.length) colIdx = 8;
            if (headers[0] === '' && r.length < headers.length && colIdx > 0) {
                colIdx = colIdx - 1;
            }
            
            let status = (r[colIdx] || '').trim();
            const statusUpper = status.toUpperCase();
            if (excludeStatus.includes(statusUpper)) continue;
            
            if (/^1[ºoOaA]?s*Vistoria/i.test(status) || statusUpper === 'VISTORIA' ||
                /^2[ºoOaA]?s*Vistoria/i.test(status) ||
                statusUpper === 'BAIXA' ||
                statusUpper === 'PROJETO' ||
                statusUpper === 'NÃO DEFINIDO' || statusUpper === 'NÃO DEFINIDA' || status === '' || status === '-') {
                status = 'Não Adequado';
            } else if (statusUpper === 'FUSÃO' || statusUpper === 'FUSAO') {
                status = 'Pendências Claro';
            }
            
            counts[status] = (counts[status] || 0) + 1;
            totalActive++;
        }
        
        const utcDate = new Date();
        const brOffset = -3 * 60 * 60 * 1000;
        const localDate = new Date(utcDate.getTime() + brOffset);
        const day = String(localDate.getUTCDate()).padStart(2, '0');
        const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
        const year = localDate.getUTCFullYear();
        const hours = String(localDate.getUTCHours()).padStart(2, '0');
        const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
        const seconds = String(localDate.getUTCSeconds()).padStart(2, '0');
        generatedAt = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        
        return { counts, total: totalActive, generated_at: generatedAt };
    } catch (err) {
        console.error("Erro ao obter dados do MDU:", err);
        return null;
    }
}

function matchStatus(key, dbKey) {
    const k = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const db = dbKey.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (k === db) return true;
    if (db.includes('1') && db.includes('vistoria') && k.includes('1') && k.includes('vistoria')) return true;
    if (db.includes('2') && db.includes('vistoria') && k.includes('2') && k.includes('vistoria')) return true;
    if ((db === '' || db.includes('definido') || db.includes('indefinido')) && 
        (k === '' || k.includes('definido') || k.includes('indefinido'))) return true;
    return false;
}

function formatEmailGeneratedAt(str) {
    if (!str || str === 'N/D') return str;
    const parts = str.split(' ');
    if (parts.length >= 1) {
        const dateParts = parts[0].split('-');
        if (dateParts.length === 3) {
            const yyyy = dateParts[0];
            const mm = dateParts[1];
            const dd = dateParts[2];
            let timeStr = "";
            if (parts.length >= 2) {
                const timeParts = parts[1].split(':');
                if (timeParts.length >= 2) {
                    timeStr = " " + timeParts[0] + ":" + timeParts[1];
                }
            }
            return `${dd}/${mm}/${yyyy}${timeStr}`;
        }
    }
    return str;
}

function buildEmailHtml(data, reportName) {
    const generatedAt = formatEmailGeneratedAt(data.generated_at);
    const total = data.total;
    
    const utcDate = new Date();
    const brOffset = -3 * 60 * 60 * 1000;
    const localDate = new Date(utcDate.getTime() + brOffset);
    const day = String(localDate.getUTCDate()).padStart(2, '0');
    const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
    const year = localDate.getUTCFullYear();
    const hours = String(localDate.getUTCHours()).padStart(2, '0');
    const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
    const nowStr = `${day}/${month}/${year} às ${hours}:${minutes}`;
    
    let medicaoCount = 0;
    let relatorioCount = 0;
    Object.keys(data.counts).forEach(k => {
        const normKey = k.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (normKey === 'medicao') {
            medicaoCount += data.counts[k];
        }
        if (normKey === 'relatorio') {
            relatorioCount += data.counts[k];
        }
    });

    const statusOrder = [
        { key: "Não Adequado", color: "#004f71" },
        { key: "Pendências Claro", color: "#004f71" },
        { key: "Medição",     color: "#004f71" },
        { key: "Relatório",   color: "#004f71" },
        { key: "Relatório HBOX", color: "#747d8c" },
        { key: "Pendência",   color: "#ff9f43" }
    ];
    
    const statusItems = [];
    statusOrder.forEach(s => {
        let cnt = 0;
        Object.keys(data.counts).forEach(k => {
            if (matchStatus(s.key, k)) {
                cnt = data.counts[k];
            }
        });
        if (cnt > 0) {
            statusItems.push({ key: s.key, count: cnt, color: s.color });
        }
    });

    Object.keys(data.counts).forEach(k => {
        const isMapped = statusOrder.some(s => matchStatus(s.key, k));
        if (!isMapped && data.counts[k] > 0) {
            statusItems.push({ key: k, count: data.counts[k], color: "#747d8c" });
        }
    });

    statusItems.sort((a, b) => b.count - a.count);

    let statusRows = "";
    statusItems.forEach(item => {
        statusRows += `
        <tr>
            <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #2c3e50; font-weight: 500;">
                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${item.color}; margin-right:8px; vertical-align:middle;"></span>
                ${item.key}
            </td>
            <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; text-align:center;">
                <span style="background:rgba(0,79,113,0.06); color:#004f71; padding:4px 14px; border-radius:20px; font-size:13px; font-weight:700;">${item.count}</span>
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
                                <div style="font-size:12px; text-transform:uppercase; letter-spacing:1.5px; color:#57606f; font-weight:700; margin-bottom:12px;">Detalhamento por Status</div>
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

    // Permitir GET para chamadas de Cron e POST para compatibilidade
    if (req.method !== 'GET' && req.method !== 'POST') {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    // Validar chave secreta para evitar execuções maliciosas por terceiros
    const cronSecret = req.query.secret || req.headers['x-cron-secret'];
    if (cronSecret !== 'jle-bi-cron-key-2026') {
        res.status(403).json({ error: "Unauthorized: Invalid secret key" });
        return;
    }

    try {
        console.log("Iniciando cron check de envio de e-mails...");
        const configs = await fetchSupabase("bi_email_reports?select=*");
        
        const utcDate = new Date();
        const brOffset = -3 * 60 * 60 * 1000;
        const localDate = new Date(utcDate.getTime() + brOffset);
        
        const day = String(localDate.getUTCDate()).padStart(2, '0');
        const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
        const year = localDate.getUTCFullYear();
        const hours = String(localDate.getUTCHours()).padStart(2, '0');
        const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;

        const weekdayMap = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
        const currentDay = weekdayMap[localDate.getUTCDay()];

        const actions = [];
        let mduData = null;

        for (const config of configs) {
            console.log(`Verificando config: ${config.report_name}`);
            
            // 1. Relatório ativo
            if (!config.is_active) {
                actions.push({ name: config.report_name, status: "skipped_inactive" });
                continue;
            }

            // 2. Trava de envio diário (Impede múltiplos disparos no mesmo dia)
            if (config.last_sent_at) {
                const lastSentDate = new Date(config.last_sent_at);
                const lastSentBrt = new Date(lastSentDate.getTime() + brOffset);
                if (lastSentBrt.getUTCDate() === localDate.getUTCDate() &&
                    lastSentBrt.getUTCMonth() === localDate.getUTCMonth() &&
                    lastSentBrt.getUTCFullYear() === localDate.getUTCFullYear()) {
                    actions.push({ name: config.report_name, status: "skipped_already_sent_today" });
                    continue;
                }
            }

            // 3. Janela de horário
            const configTime = config.schedule_time.substring(0, 5);
            const configDays = config.schedule_days || [];
            
            const [cHour, cMin] = configTime.split(":").map(Number);
            const [lHour, lMin] = currentTime.split(":").map(Number);
            const timeDiff = (lHour * 60 + lMin) - (cHour * 60 + cMin);
            const isTimeInWindow = timeDiff >= 0 && timeDiff < 15;
            
            const isRightDay = configDays.includes(currentDay);
            const shouldSend = isTimeInWindow && isRightDay;

            if (!shouldSend) {
                actions.push({ name: config.report_name, status: "skipped_outside_window", details: `Config: ${configTime} em ${configDays.join(',')}, Hora atual: ${currentTime}` });
                continue;
            }

            // Se chegamos aqui, precisamos disparar o e-mail.
            let emailHtml;
            let attachments = null;

            if (config.report_type === 'claro') {
                const claroHelper = require('./claro-report-helper');
                const claroData = claroHelper.loadClaroData();
                const excelRes = claroHelper.generateExcelAttachments(claroData);
                attachments = excelRes.attachments;
                emailHtml = claroHelper.buildClaroEmailHtml(config.report_name, excelRes, claroData.generated_at);
            } else if (config.report_type === 'manutencao') {
                const manutHelper = require('./manutencao-report-helper');
                const manutData = manutHelper.loadManutencaoData();
                attachments = manutHelper.generateExcelAttachments(manutData);
                emailHtml = manutHelper.buildManutencaoEmailHtml(config.report_name, manutData);
            } else {
                if (!mduData) {
                    mduData = await getMduStatusCounts();
                }

                if (!mduData) {
                    actions.push({ name: config.report_name, status: "failed_to_get_sheets_data" });
                    continue;
                }
                emailHtml = buildEmailHtml(mduData, config.report_name);
            }

            // Disparar
            const subject = `${config.report_name} - ${day}/${month}/${year}`;
            const cleanRecipients = (config.recipients || []).filter(e => !e.startsWith("__sched:") && !e.startsWith("__lock:"));
            
            await sendResendEmail(cleanRecipients, subject, emailHtml, attachments);
            
            // Atualizar last_sent_at no Supabase
            await fetchSupabase(`bi_email_reports?id=eq.${config.id}`, 'PATCH', {
                last_sent_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            actions.push({ name: config.report_name, status: "sent" });
        }

        res.status(200).json({ success: true, currentTime, currentDay, actions });
    } catch (err) {
        console.error("Erro no cron-check:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};
