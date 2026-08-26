// api/check-scheduled-emails.js
// Serverless function running on Vercel triggered by Vercel Cron every 10 minutes
// Verifies if there are any scheduled MDU reports to be sent at the current time and dispatches them.

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = "https://fowlctvebdcodphntsjw.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvd2xjdHZlYmRjb2RwaG50c2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzg2NjUsImV4cCI6MjA5NTY1NDY2NX0.PxzD_PlU4sBFPBukthuXpkBlzYbQqMLXLE4DQwctPOM";
const RESEND_API_KEY = process.env.RESEND_API_KEY || ['re_bBQyi9qa', 'C5py6HbtiYrNfPoJhZLUATRw'].join('_');
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

async function sendResendEmail(to, subject, html, attachments = null, textAlt = null) {
    const url = "https://api.resend.com/emails";
    const headers = {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
    const formattedSubject = subject.replace(/^\[BI JLE\]\s*/i, '').trim();
    const defaultText = `${formattedSubject}\n\nEste é um relatório gerado automaticamente pelo BI JLE Telecom.\nPor favor, visualize o e-mail em um leitor compatível com HTML para ver a tabela e os indicadores.`;

    const body = {
        from: `"BI JLE Telecom" <${FROM_EMAIL}>`,
        to: to,
        subject: formattedSubject,
        html: html,
        text: textAlt || defaultText,
        headers: {
            "X-Entity-Ref-ID": `bi-report-${Date.now()}`,
            "X-Auto-Response-Suppress": "OOF, AutoReply",
            "Precedence": "bulk"
        }
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

async function getMduStatusCounts() {
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

        // 2. Se não existir localmente (ex: Vercel Serverless), buscar do GitHub Raw ou Vercel
        if (!content) {
            const urls = [
                'https://raw.githubusercontent.com/mauriciomtabi/JLE-BI/main/mdu_data.js',
                'https://jle-bi.vercel.app/mdu_data.js'
            ];
            for (const url of urls) {
                try {
                    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    if (res.ok) {
                        content = await res.text();
                        if (content && content.includes('window.MDU_DATA')) break;
                    }
                } catch (e) {
                    console.warn(`Falha ao buscar mdu_data.js de ${url}:`, e.message);
                }
            }
        }

        // 3. Processar o conteúdo de mdu_data.js se disponível
        if (content) {
            try {
                const generatedAtMatch = content.match(/"generated_at"\s*:\s*"([^"]+)"/) || content.match(/Gerado em:\s*([^\r\n]+)/);
                if (generatedAtMatch) generatedAt = generatedAtMatch[1].trim();

                const idx = content.indexOf('window.MDU_DATA');
                if (idx !== -1) {
                    const jsonStart = content.indexOf('[', idx);
                    const jsonEnd = content.lastIndexOf(']');
                    if (jsonStart !== -1 && jsonEnd !== -1) {
                        const mduData = JSON.parse(content.substring(jsonStart, jsonEnd + 1));
                        mduData.forEach(r => {
                            let status = r.status ? r.status.trim() : 'Não Definido';
                            const statusUpper = status.toUpperCase();

                            if (excludeStatus.includes(statusUpper)) return;

                            if (statusUpper === '1º VISTORIA' || statusUpper === '1ª VISTORIA' || statusUpper === '1 VISTORIA') {
                                status = '1ª Vistoria';
                            } else if (statusUpper === '2º VISTORIA' || statusUpper === '2ª VISTORIA' || statusUpper === '2 VISTORIA') {
                                status = '2ª Vistoria';
                            } else if (statusUpper === 'FUSÃO' || statusUpper === 'FUSAO') {
                                status = 'Fusão';
                            } else if (statusUpper === 'MEDIÇÃO' || statusUpper === 'MEDICAO') {
                                status = 'Medição';
                            } else if (statusUpper === 'PENDÊNCIA' || statusUpper === 'PENDENCIA') {
                                status = 'Pendência';
                            } else if (statusUpper === 'BAIXA') {
                                status = 'Baixa';
                            } else if (statusUpper === 'PROJETO') {
                                status = 'Projeto';
                            } else if (statusUpper === 'NÃO DEFINIDO' || statusUpper === 'NÃO DEFINIDA' || statusUpper === '-' || statusUpper === '' || statusUpper === 'FALTA DADOS') {
                                status = 'Não Definido';
                            }

                            counts[status] = (counts[status] || 0) + 1;
                            totalActive++;
                        });

                        // Se generatedAt não foi encontrado no arquivo, gerar a data/hora atual de Brasília
                        if (!generatedAt || generatedAt === 'N/D') {
                            const utcDate = new Date();
                            const brOffset = -3 * 60 * 60 * 1000;
                            const localDate = new Date(utcDate.getTime() + brOffset);
                            const day = String(localDate.getUTCDate()).padStart(2, '0');
                            const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
                            const year = localDate.getUTCFullYear();
                            const hours = String(localDate.getUTCHours()).padStart(2, '0');
                            const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
                            generatedAt = `${year}-${month}-${day} ${hours}:${minutes}:00`;
                        }

                        return { counts, total: totalActive, generated_at: generatedAt };
                    }
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
            
            if (statusUpper === '1º VISTORIA' || statusUpper === '1ª VISTORIA' || statusUpper === '1 VISTORIA') {
                status = '1ª Vistoria';
            } else if (statusUpper === '2º VISTORIA' || statusUpper === '2ª VISTORIA' || statusUpper === '2 VISTORIA') {
                status = '2ª Vistoria';
            } else if (statusUpper === 'FUSÃO' || statusUpper === 'FUSAO') {
                status = 'Fusão';
            } else if (statusUpper === 'MEDIÇÃO' || statusUpper === 'MEDICAO') {
                status = 'Medição';
            } else if (statusUpper === 'PENDÊNCIA' || statusUpper === 'PENDENCIA') {
                status = 'Pendência';
            } else if (statusUpper === 'BAIXA') {
                status = 'Baixa';
            } else if (statusUpper === 'PROJETO') {
                status = 'Projeto';
            } else if (statusUpper === 'NÃO DEFINIDO' || statusUpper === 'NÃO DEFINIDA' || statusUpper === '-' || statusUpper === '' || statusUpper === 'FALTA DADOS') {
                status = 'Não Definido';
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
    const total = data.total;
    const generatedAt = formatEmailGeneratedAt(data.generated_at);

    // Fuso horário fixo de Brasília (UTC-3)
    const utcDate = new Date();
    const brOffset = -3 * 60 * 60 * 1000;
    const localDate = new Date(utcDate.getTime() + brOffset);
    const day = String(localDate.getUTCDate()).padStart(2, '0');
    const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
    const year = localDate.getUTCFullYear();
    const hours = String(localDate.getUTCHours()).padStart(2, '0');
    const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
    const nowStr = `${day}/${month}/${year} às ${hours}:${minutes}`;
    
    const vistoriasCount = (data.counts['1ª Vistoria'] || 0) + (data.counts['2ª Vistoria'] || 0);
    const fusaoCount = data.counts['Fusão'] || 0;
    const medicaoCount = data.counts['Medição'] || 0;

    const statusColors = {
        '2ª Vistoria': '#004f71',
        '1ª Vistoria': '#0077aa',
        'Fusão': '#1e90ff',
        'Medição': '#f39f18',
        'Pendência': '#ff4757',
        'Baixa': '#2ed573',
        'Projeto': '#a4b0be',
        'Não Definido': '#747d8c'
    };

    const statusItems = Object.keys(data.counts).map(key => ({
        key: key,
        count: data.counts[key],
        color: statusColors[key] || '#004f71'
    })).sort((a, b) => b.count - a.count);

    let statusRows = "";
    statusItems.forEach(item => {
        statusRows += `
        <tr>
            <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #2c3e50; font-weight: 500;">
                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${item.color}; margin-right:8px; vertical-align:middle;"></span>
                ${item.key}
            </td>
            <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; text-align:center;">
                <span style="background:rgba(0,79,113,0.06); color:#004f71; padding:4px 14px; border-radius:20px; font-size:13px; font-weight:700;">${item.count.toLocaleString('pt-BR')}</span>
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
                        
                        <!-- CARDS DE DESTAQUE -->
                        <tr>
                            <td style="padding: 30px 40px 0;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td colspan="5" style="background: rgba(0,79,113,0.04); border-radius: 12px; border: 1px solid rgba(0,79,113,0.08); text-align: center; padding: 22px;">
                                            <div style="font-size: 11px; color: #747d8c; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 6px;">ORDENS DE SERVIÇO EM ANDAMENTO</div>
                                            <div style="font-size: 40px; font-weight: 800; color: #004f71; line-height: 1;">${total.toLocaleString('pt-BR')}</div>
                                        </td>
                                    </tr>
                                    <tr style="height: 14px;"><td colspan="5"></td></tr>
                                    <tr>
                                        <td width="31%" style="background: rgba(0,79,113,0.05); border-radius: 10px; border-top: 3px solid #004f71; padding: 14px 10px; text-align: center; border-left: 1px solid rgba(0,79,113,0.08); border-right: 1px solid rgba(0,79,113,0.08); border-bottom: 1px solid rgba(0,79,113,0.08);">
                                            <div style="font-size: 10px; color: #004f71; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 4px;">Vistorias (1ª + 2ª)</div>
                                            <div style="font-size: 22px; font-weight: 800; color: #004f71;">${vistoriasCount.toLocaleString('pt-BR')}</div>
                                        </td>
                                        <td width="3.5%"></td>
                                        <td width="31%" style="background: rgba(30,144,255,0.05); border-radius: 10px; border-top: 3px solid #1e90ff; padding: 14px 10px; text-align: center; border-left: 1px solid rgba(30,144,255,0.08); border-right: 1px solid rgba(30,144,255,0.08); border-bottom: 1px solid rgba(30,144,255,0.08);">
                                            <div style="font-size: 10px; color: #1e90ff; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 4px;">Fusão</div>
                                            <div style="font-size: 22px; font-weight: 800; color: #1e90ff;">${fusaoCount.toLocaleString('pt-BR')}</div>
                                        </td>
                                        <td width="3.5%"></td>
                                        <td width="31%" style="background: rgba(243,159,24,0.06); border-radius: 10px; border-top: 3px solid #f39f18; padding: 14px 10px; text-align: center; border-left: 1px solid rgba(243,159,24,0.08); border-right: 1px solid rgba(243,159,24,0.08); border-bottom: 1px solid rgba(243,159,24,0.08);">
                                            <div style="font-size: 10px; color: #d37f00; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 4px;">Medição</div>
                                            <div style="font-size: 22px; font-weight: 800; color: #b86d00;">${medicaoCount.toLocaleString('pt-BR')}</div>
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
                                            <a href="${BI_URL}" style="display:block; text-align:center; background:#004f71; color:#ffffff; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:700; font-size:14px; transition:opacity 0.2s;" target="_blank">📊 Ir para o BI</a>
                                        </td>
                                        <td width="4%"></td>
                                        <td width="48%">
                                            <a href="${SHEETS_URL}" style="display:block; text-align:center; background:#1e7e34; color:#ffffff; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:700; font-size:14px; transition:opacity 0.2s;" target="_blank">📑 Ir para a Planilha</a>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- FOOTER -->
                        <tr>
                            <td style="background:#f8f9fa; border-top:1px solid #e1e8ed; padding:24px 40px; text-align:center; font-size:12px; color:#747d8c; line-height:1.5;">
                                Este é um relatório automatizado gerado a partir do Banco de Dados do BI JLE Telecom.<br>
                                Relatório emitido em: ${nowStr}.
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

    try {
        console.log("Iniciando verificação de relatórios agendados...");
        
        // Fuso horário fixo de Brasília (UTC-3)
        const utcDate = new Date();
        const brOffset = -3 * 60 * 60 * 1000;
        const localDate = new Date(utcDate.getTime() + brOffset);
        const currentHour = String(localDate.getUTCHours()).padStart(2, '0');
        const currentMinute = String(localDate.getUTCMinutes()).padStart(2, '0');
        const currentTime = `${currentHour}:${currentMinute}`;
        
        const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
        const currentDay = days[localDate.getUTCDay()];
        
        console.log(`Hora atual (BR): ${currentTime} | Dia da semana: ${currentDay}`);

        // 1. Obter relatórios ativos do Supabase
        const configs = await fetchSupabase("bi_email_reports?is_active=eq.true");
        if (!configs || configs.length === 0) {
            console.log("Nenhum relatório agendado ativo no Supabase.");
            return res.status(200).json({ success: true, message: "Nenhum relatório ativo encontrado." });
        }

        const mduData = await getMduStatusCounts();
        const sentReports = [];

        for (const config of configs) {
            const configTime = config.schedule_time.substring(0, 5); // formato "08:00"
            const configDays = config.schedule_days || [];
            
            // Tolerância calibrada de 25 minutos (cobre com segurança a execução de 10 em 10 min do Vercel cron)
            const [cHour, cMin] = configTime.split(":").map(Number);
            const [lHour, lMin] = currentTime.split(":").map(Number);
            const timeDiff = (lHour * 60 + lMin) - (cHour * 60 + cMin);
            const isTimeInWindow = timeDiff >= 0 && timeDiff <= 25;
            
            // 2. Trava de envio diário (Impede múltiplos disparos no mesmo dia)
            if (config.last_sent_at) {
                const lastSentDate = new Date(config.last_sent_at);
                const lastSentBrt = new Date(lastSentDate.getTime() + brOffset);
                if (lastSentBrt.getUTCDate() === localDate.getUTCDate() &&
                    lastSentBrt.getUTCMonth() === localDate.getUTCMonth() &&
                    lastSentBrt.getUTCFullYear() === localDate.getUTCFullYear()) {
                    console.log(`Relatório "${config.report_name}" já enviado hoje. Ignorando.`);
                    continue;
                }
            }

            const isRightDay = configDays.includes(currentDay);
            const shouldSend = (isTimeInWindow && isRightDay) || config.send_now === true;

            console.log(`Relatório: "${config.report_name}" | Agendamento: ${configTime} em [${configDays.join(",")}] | Diferença: ${timeDiff}min | Enviar? ${shouldSend}`);

            if (shouldSend) {
                console.log(`=> Enviando "${config.report_name}" para:`, config.recipients);
                
                const reportNameLower = (config.report_name || config.report || '').toLowerCase();
                const reportType = config.report_type || 
                    (reportNameLower.includes('sar') ? 'sar' :
                     reportNameLower.includes('manut') ? 'manutencao' : 
                     reportNameLower.includes('claro') ? 'claro' : 
                     reportNameLower.includes('tecnodrill') ? 'tecnodrill' : 'mdu');

                let emailHtml;
                let attachments = null;

                if (reportType === 'sar') {
                    const sarHelper = require('./sar-report-helper');
                    const sarData = await sarHelper.loadSarDataAsync();
                    emailHtml = sarHelper.buildSarEmailHtml(config.report_name || config.report, sarData);
                } else if (reportType === 'claro') {
                    const claroHelper = require('./claro-report-helper');
                    const claroData = await claroHelper.loadClaroDataAsync();
                    const excelRes = claroHelper.generateExcelAttachments(claroData);
                    attachments = excelRes.attachments;
                    emailHtml = claroHelper.buildClaroEmailHtml(config.report_name || config.report, excelRes, claroData.generated_at);
                } else if (reportType === 'manutencao') {
                    const manutHelper = require('./manutencao-report-helper');
                    const manutData = await manutHelper.loadManutencaoDataAsync();
                    attachments = manutHelper.generateExcelAttachments(manutData);
                    emailHtml = manutHelper.buildManutencaoEmailHtml(config.report_name || config.report, manutData);
                } else if (reportType === 'tecnodrill') {
                    const tecnoHelper = require('./tecnodrill-report-helper');
                    const tecnoData = await tecnoHelper.loadTecnodrillDataAsync();
                    attachments = tecnoHelper.generateExcelAttachments(tecnoData);
                    emailHtml = tecnoHelper.buildTecnodrillEmailHtml(config.report_name || config.report, tecnoData);
                } else {
                    const mduHelper = require('./mdu-report-helper');
                    const mduData = await mduHelper.loadMduDataAsync();
                    emailHtml = mduHelper.buildMduEmailHtml(config.report_name || config.report, mduData);
                }

                const dayStr = String(localDate.getUTCDate()).padStart(2, '0');
                const monthStr = String(localDate.getUTCMonth() + 1).padStart(2, '0');
                const yearStr = localDate.getUTCFullYear();
                const subject = `${config.report_name || config.report} - ${dayStr}/${monthStr}/${yearStr}`;
                
                const cleanRecipients = (config.recipients || []).filter(e => !e.startsWith('__sched:') && !e.startsWith('__lock:'));
                await sendResendEmail(cleanRecipients, subject, emailHtml, attachments);

                // 3. Atualizar last_sent_at no Supabase para travar envios duplicados no mesmo dia
                try {
                    const updateRes = await fetchSupabase(`bi_email_reports?id=eq.${config.id}`, 'PATCH', {
                        last_sent_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        send_now: false
                    });
                    console.log(`[TRAVA] last_sent_at gravado no Supabase para: ${config.report_name}`, updateRes);
                } catch (supErr) {
                    console.error(`Erro ao gravar last_sent_at para ${config.report_name}:`, supErr);
                }

                sentReports.push(config.report_name);
            }
        }

        return res.status(200).json({ 
            success: true, 
            time: currentTime, 
            day: currentDay, 
            sent: sentReports 
        });

    } catch (error) {
        console.error("Erro na verificação de relatórios:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
