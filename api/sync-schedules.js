// api/sync-schedules.js
// Serverless function on Vercel to synchronize BI report schedules with Resend's native scheduling system.
// This maintains a rolling window of future emails scheduled in Resend, removing the need for external crons.

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = "https://fowlctvebdcodphntsjw.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvd2xjdHZlYmRjb2RwaG50c2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzg2NjUsImV4cCI6MjA5NTY1NDY2NX0.PxzD_PlU4sBFPBukthuXpkBlzYbQqMLXLE4DQwctPOM";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "re_UrQ23kW7_HfeEnReBmEmKyFqo54AfMbgb";
const FROM_EMAIL = "bi@jletelecom.com.br";
const BI_URL = "https://jle-bi.vercel.app";
const SHEETS_URL = "https://docs.google.com/spreadsheets/d/1eEJLaV7D0rthjC5H1MppXyk7dyroqn2h/edit";

async function fetchSupabase(endpoint, method = 'GET', body = null, token = null) {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    const headers = {
        "apikey": ANON_KEY,
        "Authorization": token || `Bearer ${ANON_KEY}`,
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

async function scheduleResendEmail(to, subject, html, scheduledAtISO) {
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
        html: html,
        scheduled_at: scheduledAtISO
    };
    const res = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
    });
    const resData = await res.json();
    if (!res.ok) {
        throw new Error(`Resend Schedule Error: ${JSON.stringify(resData)}`);
    }
    return resData.id;
}

async function cancelResendEmail(emailId) {
    const url = `https://api.resend.com/emails/${emailId}/cancel`;
    const headers = {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
    const res = await fetch(url, {
        method: 'POST',
        headers: headers
    });
    if (!res.ok) {
        const errText = await res.text();
        console.error(`Failed to cancel Resend email ${emailId}: status ${res.status}, response: ${errText}`);
    } else {
        console.log(`Successfully cancelled scheduled email ${emailId}`);
    }
}

function getMduStatusCounts() {
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
    if (k.includes("1a vistoria") && (db.includes("1a vistoria") || db.includes("1ª vistoria") || db.includes("1 vistoria"))) return true;
    if (k.includes("2a vistoria") && (db.includes("2a vistoria") || db.includes("2ª vistoria") || db.includes("2 vistoria"))) return true;
    if (k.includes("nao definido") && (db.includes("nao definido") || db.includes("não definido"))) return true;
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

function buildEmailHtml(data, reportName, executionDateStr) {
    const total = data.total;
    const generatedAt = formatEmailGeneratedAt(data.generated_at);
    
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
                                Relatório emitido em: ${executionDateStr}.
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>`;
}

function getNextExecutionDates(scheduleTime, scheduleDays, count) {
    const [hourStr, minStr] = scheduleTime.split(':');
    const targetHour = parseInt(hourStr, 10);
    const targetMin = parseInt(minStr, 10);

    const weekdayMap = {
        'SUN': 0, 'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5, 'SAT': 6
    };
    const targetDays = scheduleDays.map(d => weekdayMap[d]);

    const dates = [];
    let current = new Date();
    const brOffset = -3 * 60 * 60 * 1000;
    
    for (let i = 0; i < 30 && dates.length < count; i++) {
        const testDate = new Date(current.getTime() + brOffset + i * 24 * 60 * 60 * 1000);
        testDate.setUTCHours(targetHour, targetMin, 0, 0);

        const absoluteUtcDate = new Date(testDate.getTime() - brOffset);

        if (absoluteUtcDate.getTime() <= Date.now()) {
            continue;
        }

        const dayOfWeek = testDate.getUTCDay();
        if (targetDays.includes(dayOfWeek)) {
            dates.push(absoluteUtcDate);
        }
    }
    return dates;
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

    try {
        const authHeader = req.headers['authorization'];
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
        const token = authHeader || (serviceRoleKey ? `Bearer ${serviceRoleKey}` : null);

        console.log("Iniciando sincronização de agendamentos com Resend...");
        const reports = await fetchSupabase("bi_email_reports", 'GET', null, token);
        const actions = [];

        const mduData = getMduStatusCounts();

        for (const report of reports) {
            const currentRecipients = report.recipients || [];
            
            const cleanEmails = currentRecipients.filter(email => !email.startsWith('__sched:'));
            const existingScheds = currentRecipients
                .filter(email => email.startsWith('__sched:'))
                .map(item => {
                    const schedParts = item.split('::');
                    const mainParts = schedParts[0].split(':');
                    return {
                        raw: item,
                        id: mainParts[1],
                        dateStr: mainParts.slice(2).join(':'),
                        generatedAt: schedParts[1] || ''
                    };
                });

            let updatedRecipients = [...cleanEmails];
            let shouldUpdateDb = false;
            let latestSentDate = null;

            if (report.is_active && cleanEmails.length > 0 && report.schedule_days && report.schedule_days.length > 0) {
                const nextDates = getNextExecutionDates(report.schedule_time, report.schedule_days, 4);
                const activeScheds = [];

                for (const sched of existingScheds) {
                    const schedTime = new Date(sched.dateStr).getTime();
                    const isFuture = schedTime > Date.now();
                    
                    const schedDateObj = new Date(schedTime);
                    const brOffset = -3 * 60 * 60 * 1000;
                    const localSchedDate = new Date(schedDateObj.getTime() + brOffset);
                    const localHour = String(localSchedDate.getUTCHours()).padStart(2, '0');
                    const localMin = String(localSchedDate.getUTCMinutes()).padStart(2, '0');
                    const localTimeStr = `${localHour}:${localMin}`;
                    
                    const daysMap = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
                    const localDayStr = daysMap[localSchedDate.getUTCDay()];

                    const isStillValid = isFuture && 
                                         localTimeStr === report.schedule_time && 
                                         report.schedule_days.includes(localDayStr) &&
                                         sched.generatedAt === mduData.generated_at;

                    if (isStillValid) {
                        activeScheds.push(sched);
                        updatedRecipients.push(sched.raw);
                    } else {
                        if (isFuture) {
                            await cancelResendEmail(sched.id);
                            actions.push({ report: report.report_name, action: "cancel", id: sched.id, date: sched.dateStr });
                        } else {
                            // Este agendamento foi no passado (já enviado pelo Resend), atualiza a data de último envio
                            const currentLastSent = report.last_sent_at ? new Date(report.last_sent_at).getTime() : 0;
                            if (schedTime > currentLastSent) {
                                if (!latestSentDate || schedTime > new Date(latestSentDate).getTime()) {
                                    latestSentDate = sched.dateStr;
                                }
                            }
                        }
                        shouldUpdateDb = true;
                    }
                }

                for (const targetDate of nextDates) {
                    const targetIso = targetDate.toISOString();
                    const alreadyScheduled = activeScheds.some(s => s.dateStr === targetIso);

                    if (!alreadyScheduled) {
                        const brOffset = -3 * 60 * 60 * 1000;
                        const localTargetDate = new Date(targetDate.getTime() + brOffset);
                        const day = String(localTargetDate.getUTCDate()).padStart(2, '0');
                        const month = String(localTargetDate.getUTCMonth() + 1).padStart(2, '0');
                        const year = localTargetDate.getUTCFullYear();
                        const hours = String(localTargetDate.getUTCHours()).padStart(2, '0');
                        const minutes = String(localTargetDate.getUTCMinutes()).padStart(2, '0');
                        const dateFormatted = `${day}/${month}/${year} às ${hours}:${minutes}`;

                        const emailHtml = buildEmailHtml(mduData, report.report_name, dateFormatted);
                        const subject = `${report.report_name} - ${day}/${month}/${year}`;

                        const resendId = await scheduleResendEmail(cleanEmails, subject, emailHtml, targetIso);
                        const newSchedRaw = `__sched:${resendId}:${targetIso}::${mduData.generated_at}`;
                        
                        updatedRecipients.push(newSchedRaw);
                        shouldUpdateDb = true;
                        actions.push({ report: report.report_name, action: "schedule", id: resendId, date: targetIso });
                    }
                }
            } else {
                for (const sched of existingScheds) {
                    const schedTime = new Date(sched.dateStr).getTime();
                    if (schedTime > Date.now()) {
                        await cancelResendEmail(sched.id);
                        actions.push({ report: report.report_name, action: "cancel_inactive", id: sched.id, date: sched.dateStr });
                    }
                    shouldUpdateDb = true;
                }
            }

            if (shouldUpdateDb) {
                const patchData = {
                    recipients: updatedRecipients,
                    updated_at: new Date().toISOString()
                };
                if (latestSentDate) {
                    patchData.last_sent_at = latestSentDate;
                }
                await fetchSupabase(`bi_email_reports?id=eq.${report.id}`, 'PATCH', patchData, token);
            }
        }

        return res.status(200).json({
            success: true,
            actions: actions
        });

    } catch (error) {
        console.error("Erro na sincronização de agendamentos:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
