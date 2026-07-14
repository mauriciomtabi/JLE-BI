// api/force-resync-email.js
// Endpoint serverless chamado pelo script ETL local (update_mdu.ps1) logo após o deploy de novos dados.
// Força a re-sincronização dos e-mails agendados no Resend com os dados mais recentes do MDU.
// Aceita chamadas GET ou POST e não exige autenticação de usuário (usa service role key do Supabase).

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = "https://fowlctvebdcodphntsjw.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvd2xjdHZlYmRjb2RwaG50c2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzg2NjUsImV4cCI6MjA5NTY1NDY2NX0.PxzD_PlU4sBFPBukthuXpkBlzYbQqMLXLE4DQwctPOM";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = "bi@jletelecom.com.br";
const BI_URL = "https://jle-bi.vercel.app";
const SHEETS_URL = "https://docs.google.com/spreadsheets/d/1eEJLaV7D0rthjC5H1MppXyk7dyroqn2h/edit";

function getSupabaseAuthHeaders() {
    // Use service role key for full RLS bypass - necessary for server-to-server calls
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
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(url, options);
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Supabase Error ${res.status}: ${errText}`);
    }
    return res.json();
}

async function cancelResendEmail(emailId) {
    const url = `https://api.resend.com/emails/${emailId}/cancel`;
    const headers = { "Authorization": `Bearer ${RESEND_API_KEY}` };
    const res = await fetch(url, { method: 'POST', headers });
    if (!res.ok) {
        const errText = await res.text();
        console.error(`Failed to cancel Resend email ${emailId}: ${errText}`);
    } else {
        console.log(`Cancelled scheduled email ${emailId}`);
    }
}

async function scheduleResendEmail(to, subject, html, scheduledAtISO) {
    const url = "https://api.resend.com/emails";
    const headers = {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
    };
    const body = {
        from: `"BI JLE Telecom" <${FROM_EMAIL}>`,
        to: to,
        subject: subject,
        html: html,
        scheduled_at: scheduledAtISO
    };
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const resData = await res.json();
    if (!res.ok) throw new Error(`Resend Schedule Error: ${JSON.stringify(resData)}`);
    return resData.id;
}

function getMduStatusCounts() {
    const jsPath = path.join(process.cwd(), 'mdu_data.js');
    if (!fs.existsSync(jsPath)) throw new Error(`mdu_data.js not found at: ${jsPath}`);
    const content = fs.readFileSync(jsPath, 'utf8');
    const generatedAtMatch = content.match(/"generated_at"\s*:\s*"([^"]+)"/);
    const generatedAt = generatedAtMatch ? generatedAtMatch[1] : "N/D";
    const dataMatch = content.match(/window\.MDU_DATA\s*=\s*([\s\S]+?);\s*$/);
    if (!dataMatch) throw new Error("Invalid mdu_data.js format.");
    const mduData = JSON.parse(dataMatch[1]);
    const excludeStatus = ["FINALIZADO", "FINALIZADA", "CANCELADO", "CANCELADA"];
    const counts = {};
    let totalActive = 0;
    mduData.forEach(r => {
        let status = (r.status || '').trim();
        if (status === "") status = "Não Definido";
        if (excludeStatus.includes(status.toUpperCase())) return;
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
            const [yyyy, mm, dd] = dateParts;
            let timeStr = "";
            if (parts.length >= 2) {
                const timeParts = parts[1].split(':');
                if (timeParts.length >= 2) timeStr = " " + timeParts[0] + ":" + timeParts[1];
            }
            return `${dd}/${mm}/${yyyy}${timeStr}`;
        }
    }
    return str;
}

function buildEmailHtml(data, reportName, executionDateStr) {
    const total = data.total;
    const generatedAt = formatEmailGeneratedAt(data.generated_at);

    let medicaoCount = 0, relatorioCount = 0;
    Object.keys(data.counts).forEach(k => {
        if (k.toLowerCase().includes('medicao') || k.toLowerCase().includes('medição')) medicaoCount += data.counts[k];
        if (k.toLowerCase().includes('relatorio') || k.toLowerCase().includes('relatório')) relatorioCount += data.counts[k];
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
        Object.keys(data.counts).forEach(k => { if (matchStatus(s.key, k)) cnt = data.counts[k]; });
        if (cnt > 0) statusItems.push({ key: s.key, count: cnt, color: s.color });
    });

    Object.keys(data.counts).forEach(k => {
        const isMapped = statusOrder.some(s => matchStatus(s.key, k));
        if (!isMapped && data.counts[k] > 0) statusItems.push({ key: k, count: data.counts[k], color: "#747d8c" });
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
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0; padding:0; background:#f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f9; padding: 30px 10px;">
            <tr><td align="center">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.05); border: 1px solid #e1e8ed;">
                    <tr>
                        <td style="background: #004f71; padding: 32px 40px; border-bottom: 4px solid #f39f18;">
                            <h1 style="margin:0; font-size:24px; font-weight:800; color:#ffffff; line-height:1.2;">${reportName}</h1>
                            <div style="font-size:12px; color:rgba(255,255,255,0.7); margin-top:6px; font-weight: 500;">Atualizado em: ${generatedAt}</div>
                        </td>
                    </tr>
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
                    <tr>
                        <td style="padding: 24px 40px 36px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td width="48%">
                                        <a href="${BI_URL}" style="display:block; text-align:center; background:#004f71; color:#ffffff; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:700; font-size:14px;" target="_blank">📊 Ir para o BI</a>
                                    </td>
                                    <td width="4%"></td>
                                    <td width="48%">
                                        <a href="${SHEETS_URL}" style="display:block; text-align:center; background:#1e7e34; color:#ffffff; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:700; font-size:14px;" target="_blank">📑 Ir para a Planilha</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="background:#f8f9fa; border-top:1px solid #e1e8ed; padding:24px 40px; text-align:center; font-size:12px; color:#747d8c; line-height:1.5;">
                            Este é um relatório automatizado gerado a partir do Banco de Dados do BI JLE Telecom.<br>
                            Relatório emitido em: ${executionDateStr}.
                        </td>
                    </tr>
                </table>
            </td></tr>
        </table>
    </body>
    </html>`;
}

function getNextSendDate(scheduleTime, scheduleDays) {
    const [hourStr, minStr] = scheduleTime.split(':');
    const targetHour = parseInt(hourStr, 10);
    const targetMin = parseInt(minStr, 10);
    const weekdayMap = { 'SUN': 0, 'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5, 'SAT': 6 };
    const targetDays = scheduleDays.map(d => weekdayMap[d]);
    const brOffset = -3 * 60 * 60 * 1000;

    for (let i = 1; i <= 14; i++) {
        const testDate = new Date(Date.now() + brOffset + i * 24 * 60 * 60 * 1000);
        testDate.setUTCHours(targetHour, targetMin, 0, 0);
        const absoluteUtcDate = new Date(testDate.getTime() - brOffset);
        if (absoluteUtcDate.getTime() <= Date.now()) continue;
        if (targetDays.includes(testDate.getUTCDay())) return absoluteUtcDate;
    }
    return null;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    const results = [];
    const DEPLOY_WAIT_MS = 0; // The caller already waited for deployment

    try {
        console.log("[FORCE-RESYNC] Iniciando re-sincronização forçada pós-deploy de dados MDU...");

        // 1. Ler dados MDU atuais do deploy recém-realizado
        const mduData = getMduStatusCounts();
        console.log(`[FORCE-RESYNC] generated_at atual dos dados MDU: ${mduData.generated_at}`);

        // 2. Buscar todos os relatórios ativos no Supabase
        const reports = await fetchSupabase("bi_email_reports?is_active=eq.true");
        console.log(`[FORCE-RESYNC] ${reports.length} relatório(s) ativo(s) encontrado(s).`);

        for (const report of reports) {
            const recipients = report.recipients || [];
            const cleanEmails = recipients.filter(e => !e.startsWith('__sched:') && !e.startsWith('__lock:'));
            const existingScheds = recipients.filter(e => e.startsWith('__sched:')).map(item => {
                const schedParts = item.split('::');
                const mainParts = schedParts[0].split(':');
                return {
                    raw: item,
                    id: mainParts[1],
                    dateStr: mainParts.slice(2).join(':'),
                    generatedAt: schedParts[1] || ''
                };
            });

            // 3. Verificar se os agendamentos existentes têm dados desatualizados
            const staleScheds = existingScheds.filter(s => {
                const isFuture = new Date(s.dateStr).getTime() > Date.now();
                return isFuture && s.generatedAt !== mduData.generated_at;
            });

            const upToDateScheds = existingScheds.filter(s => {
                const isFuture = new Date(s.dateStr).getTime() > Date.now();
                return isFuture && s.generatedAt === mduData.generated_at;
            });

            console.log(`[FORCE-RESYNC] Relatório "${report.report_name}": ${staleScheds.length} desatualizados, ${upToDateScheds.length} atualizados.`);

            if (staleScheds.length === 0 && upToDateScheds.length > 0) {
                console.log(`[FORCE-RESYNC] Agendamento de "${report.report_name}" já está atualizado. Sem ação necessária.`);
                results.push({ report: report.report_name, action: "already_fresh", generatedAt: mduData.generated_at });
                continue;
            }

            // 4. Calcular o próximo horário de envio
            const nextDate = getNextSendDate(report.schedule_time, report.schedule_days || []);
            if (!nextDate) {
                console.warn(`[FORCE-RESYNC] Não foi possível calcular a próxima data de envio para "${report.report_name}".`);
                results.push({ report: report.report_name, action: "no_next_date" });
                continue;
            }

            // 5. Cancelar todos os agendamentos desatualizados no Resend
            for (const sched of staleScheds) {
                await cancelResendEmail(sched.id);
                results.push({ report: report.report_name, action: "cancel_stale", id: sched.id, reason: `generatedAt mismatch: stored="${sched.generatedAt}" vs current="${mduData.generated_at}"` });
            }

            // 6. Verificar se já existe um agendamento para o próximo horário com dados atuais
            const nextIso = nextDate.toISOString();
            const alreadyScheduledFresh = upToDateScheds.some(s => s.dateStr === nextIso);

            let newSchedRaw = null;

            if (!alreadyScheduledFresh && cleanEmails.length > 0) {
                // 7. Criar novo agendamento com dados frescos
                const brOffset = -3 * 60 * 60 * 1000;
                const localDate = new Date(nextDate.getTime() + brOffset);
                const day = String(localDate.getUTCDate()).padStart(2, '0');
                const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
                const year = localDate.getUTCFullYear();
                const hours = String(localDate.getUTCHours()).padStart(2, '0');
                const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
                const dateFormatted = `${day}/${month}/${year} às ${hours}:${minutes}`;

                const emailHtml = buildEmailHtml(mduData, report.report_name, dateFormatted);
                const subject = `${report.report_name} - ${day}/${month}/${year}`;

                try {
                    const resendId = await scheduleResendEmail(cleanEmails, subject, emailHtml, nextIso);
                    newSchedRaw = `__sched:${resendId}:${nextIso}::${mduData.generated_at}`;
                    console.log(`[FORCE-RESYNC] Novo agendamento criado para "${report.report_name}" em ${nextIso}: ${resendId}`);
                    results.push({ report: report.report_name, action: "rescheduled", newId: resendId, date: nextIso, generatedAt: mduData.generated_at });
                } catch (schedErr) {
                    console.error(`[FORCE-RESYNC] Falha ao agendar email: ${schedErr.message}`);
                    if (schedErr.message.includes("quota") || schedErr.message.includes("429") || schedErr.message.includes("Limit")) {
                        console.warn(`[QUOTA] Limite diário do Resend excedido. O agendamento será tentado na próxima sincronização.`);
                        results.push({ report: report.report_name, action: "schedule_failed_quota", date: nextIso });
                    } else {
                        throw schedErr;
                    }
                }
            } else if (alreadyScheduledFresh) {
                console.log(`[FORCE-RESYNC] Já existe agendamento fresco para ${nextIso}.`);
                results.push({ report: report.report_name, action: "next_date_already_fresh", date: nextIso });
            }

            // 8. Persistir o estado atualizado no Supabase
            const freshUpToDateScheds = upToDateScheds.filter(s => s.dateStr === nextIso);
            const newRecipients = [...cleanEmails, ...freshUpToDateScheds.map(s => s.raw)];
            if (newSchedRaw) newRecipients.push(newSchedRaw);

            await fetchSupabase(`bi_email_reports?id=eq.${report.id}`, 'PATCH', {
                recipients: newRecipients,
                updated_at: new Date().toISOString()
            });
            console.log(`[FORCE-RESYNC] Supabase atualizado para "${report.report_name}". Destinatários: ${newRecipients.length}`);
        }

        return res.status(200).json({ success: true, generatedAt: mduData.generated_at, results });

    } catch (error) {
        console.error("[FORCE-RESYNC] Erro crítico:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
