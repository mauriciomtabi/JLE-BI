// api/troca-poste-report-helper.js
// Utility module to process Troca de Postes TELEMONT data and build responsive HTML email reports.
// Follows the exact visual standard of other BI JLE email reports (MDU, SAR, Manutencao, Claro).

const APP_JLE_SUPABASE_URL = process.env.APP_JLE_SUPABASE_URL || "https://dkscchjzztwyjzjpllob.supabase.co";
const APP_JLE_SUPABASE_KEY = process.env.APP_JLE_SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrc2NjaGp6enR3eWp6anBsbG9iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTI0NDcwMCwiZXhwIjoyMDk2ODIwNzAwfQ.QDco_35MhHsnHWDMrtcAsQyRXKJOntO1otClAWTA5KU";

async function fetchAppJle(endpoint) {
    const url = `${APP_JLE_SUPABASE_URL}/rest/v1/${endpoint}`;
    const headers = {
        "apikey": APP_JLE_SUPABASE_KEY,
        "Authorization": `Bearer ${APP_JLE_SUPABASE_KEY}`,
        "Content-Type": "application/json"
    };
    const res = await fetch(url, { headers });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`App_JLE Supabase Error ${res.status}: ${txt}`);
    }
    return res.json();
}

function getBrazilDateInfo(dateInput = new Date()) {
    const utcDate = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
    const brOffset = -3 * 60 * 60 * 1000;
    const brDate = new Date(utcDate.getTime() + brOffset);
    
    const y = brDate.getUTCFullYear();
    const m = String(brDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(brDate.getUTCDate()).padStart(2, '0');
    const h = String(brDate.getUTCHours()).padStart(2, '0');
    const min = String(brDate.getUTCMinutes()).padStart(2, '0');
    
    const daysOfWeek = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const dayOfWeek = daysOfWeek[brDate.getUTCDay()];
    
    return {
        isoDate: `${y}-${m}-${d}`,
        formattedDate: `${d}/${m}/${y}`,
        formattedDateTime: `${d}/${m}/${y} às ${h}:${min}`,
        dayOfWeek,
        year: y,
        month: m,
        day: d,
        timestamp: brDate.getTime()
    };
}

async function loadTrocaPosteDataAsync() {
    try {
        const [users, allObras] = await Promise.all([
            fetchAppJle('usuarios?select=id,nome'),
            fetchAppJle('obras?select=*')
        ]);

        const userMap = {};
        (users || []).forEach(u => {
            userMap[u.id] = u.nome;
        });

        const obras = (allObras || []).filter(o => {
            const t = (o.tipo || '').toLowerCase();
            const sid = (o.site_id || '').toLowerCase();
            const n = (o.nome || '').toLowerCase();
            return t.includes('poste') || sid.includes('pos') || n.includes('poste');
        });

        const nowBr = getBrazilDateInfo();
        const d1Br = getBrazilDateInfo(new Date(Date.now() - 24 * 60 * 60 * 1000));

        if (obras.length === 0) {
            return {
                services: [],
                dailyProduction: [],
                technicians: [],
                kpis: {
                    totalConcluidos: 0,
                    totalMeta: 0,
                    totalD1: 0,
                    totalHoje: 0,
                    servicosAtivos: 0,
                    tecnicosAtivos: 0
                },
                d1Info: d1Br,
                nowInfo: nowBr,
                generated_at: nowBr.formattedDateTime
            };
        }

        const obraIds = obras.map(o => o.id);
        const filterIds = obraIds.join(',');
        const lances = await fetchAppJle(`lances?obra_id=in.(${filterIds})&deletado_em=is.null&select=id,obra_id,numero,ponto_numero,tipo,capturado_em,enviado_em,tecnico_id`);

        const lancesByObra = {};
        (lances || []).forEach(l => {
            if (!lancesByObra[l.obra_id]) lancesByObra[l.obra_id] = [];
            lancesByObra[l.obra_id].push(l);
        });

        const allCompletedPoles = [];
        const servicesList = [];

        obras.forEach(o => {
            let dtp = o.dados_integridade;
            if (typeof dtp === 'string') {
                try { dtp = JSON.parse(dtp); } catch (e) { dtp = {}; }
            } else if (!dtp || typeof dtp !== 'object') {
                dtp = {};
            }

            const meta = Number(dtp.quantidade_postes) || Number(o.total_lances) || 1;
            const siteId = o.site_id || o.id;
            const nome = o.nome || siteId;
            const localidade = dtp.localidade || o.cidade || '';
            const cliente = (dtp.cliente || 'TELEMONT').toUpperCase();
            const obraLances = lancesByObra[o.id] || [];

            const byPonto = {};
            obraLances.forEach(l => {
                const pRaw = Number(l.ponto_numero);
                const p = (!isNaN(pRaw) && pRaw > 0) ? pRaw : (Number(l.numero) || 1);
                const t = (l.tipo || '').toUpperCase();
                if (!byPonto[p]) byPonto[p] = { antes: [], depois: [] };
                if (t.includes('DEPOIS')) {
                    byPonto[p].depois.push(l);
                } else {
                    byPonto[p].antes.push(l);
                }
            });

            const completedInService = [];
            let d1Count = 0;
            const tecsInService = new Set();

            Object.entries(byPonto).forEach(([numStr, data]) => {
                const p = Number(numStr);
                // Concluído = tem ANTES E DEPOIS
                if (data.antes.length > 0 && data.depois.length > 0) {
                    const allDates = [...data.depois, ...data.antes].map(x => x.capturado_em || x.enviado_em).filter(Boolean);
                    const latestDateIso = allDates.length > 0 ? allDates.sort().reverse()[0] : null;
                    const dateInfo = latestDateIso ? getBrazilDateInfo(latestDateIso) : null;
                    const isD1 = dateInfo ? (dateInfo.isoDate === d1Br.isoDate) : false;
                    const isToday = dateInfo ? (dateInfo.isoDate === nowBr.isoDate) : false;

                    if (isD1) d1Count++;

                    const lastLance = data.depois[data.depois.length - 1] || data.antes[data.antes.length - 1];
                    const tecId = lastLance ? lastLance.tecnico_id : null;
                    const tecNome = (tecId && userMap[tecId]) ? userMap[tecId] : 'Não Identificado';
                    tecsInService.add(tecNome);

                    const poleRecord = {
                        obra_id: o.id,
                        site_id: siteId,
                        nome: nome,
                        ponto_numero: p,
                        dateInfo,
                        isoDate: dateInfo ? dateInfo.isoDate : 'N/D',
                        isD1,
                        isToday,
                        tecnico_id: tecId,
                        tecnico_nome: tecNome
                    };

                    completedInService.push(poleRecord);
                    allCompletedPoles.push(poleRecord);
                }
            });

            const percent = Math.min(100, Math.round((completedInService.length / Math.max(1, meta)) * 100));

            servicesList.push({
                id: o.id,
                site_id: siteId,
                nome: nome,
                localidade: localidade,
                cliente: cliente,
                meta: meta,
                concluidos: completedInService.length,
                d1_concluidos: d1Count,
                percent: percent,
                tecnicos: Array.from(tecsInService),
                status: o.status || 'ATIVA'
            });
        });

        // Daily Production
        const dailyMap = {};
        allCompletedPoles.forEach(p => {
            const iso = p.isoDate;
            if (iso === 'N/D') return;
            if (!dailyMap[iso]) {
                dailyMap[iso] = {
                    isoDate: iso,
                    formattedDate: p.dateInfo.formattedDate,
                    dayOfWeek: p.dateInfo.dayOfWeek,
                    count: 0,
                    isD1: p.isD1,
                    isToday: p.isToday
                };
            }
            dailyMap[iso].count++;
        });

        if (!dailyMap[d1Br.isoDate]) {
            dailyMap[d1Br.isoDate] = {
                isoDate: d1Br.isoDate,
                formattedDate: d1Br.formattedDate,
                dayOfWeek: d1Br.dayOfWeek,
                count: 0,
                isD1: true,
                isToday: false
            };
        }
        if (!dailyMap[nowBr.isoDate]) {
            dailyMap[nowBr.isoDate] = {
                isoDate: nowBr.isoDate,
                formattedDate: nowBr.formattedDate,
                dayOfWeek: nowBr.dayOfWeek,
                count: 0,
                isD1: false,
                isToday: true
            };
        }

        const dailyProduction = Object.values(dailyMap).sort((a, b) => b.isoDate.localeCompare(a.isoDate));

        // Technician productivity
        const tecMap = {};
        allCompletedPoles.forEach(p => {
            const name = p.tecnico_nome;
            if (!tecMap[name]) {
                tecMap[name] = {
                    nome: name,
                    total: 0,
                    d1: 0,
                    hoje: 0,
                    servicos: new Set()
                };
            }
            tecMap[name].total++;
            if (p.isD1) tecMap[name].d1++;
            if (p.isToday) tecMap[name].hoje++;
            tecMap[name].servicos.add(p.site_id);
        });

        const technicians = Object.values(tecMap).map(t => ({
            nome: t.nome,
            total: t.total,
            d1: t.d1,
            hoje: t.hoje,
            servicos: Array.from(t.servicos)
        })).sort((a, b) => {
            if (b.d1 !== a.d1) return b.d1 - a.d1;
            return b.total - a.total;
        });

        const totalConcluidos = allCompletedPoles.length;
        const totalMeta = servicesList.reduce((acc, s) => acc + s.meta, 0);
        const totalD1 = allCompletedPoles.filter(p => p.isD1).length;
        const totalHoje = allCompletedPoles.filter(p => p.isToday).length;

        servicesList.sort((a, b) => {
            if (b.d1_concluidos !== a.d1_concluidos) return b.d1_concluidos - a.d1_concluidos;
            return b.concluidos - a.concluidos;
        });

        return {
            services: servicesList,
            dailyProduction,
            technicians,
            kpis: {
                totalConcluidos,
                totalMeta,
                totalD1,
                totalHoje,
                servicosAtivos: servicesList.length,
                tecnicosAtivos: technicians.length
            },
            d1Info: d1Br,
            nowInfo: nowBr,
            generated_at: nowBr.formattedDateTime
        };
    } catch (err) {
        console.error("Erro ao carregar dados de Troca de Postes TELEMONT:", err);
        throw err;
    }
}

function buildTrocaPosteEmailHtml(reportName, data) {
    const kpis = data.kpis || { totalConcluidos: 0, totalMeta: 0, totalD1: 0, servicosAtivos: 0, tecnicosAtivos: 0 };
    const d1Info = data.d1Info || { formattedDate: 'Ontem', dayOfWeek: '' };
    const generatedAt = data.generated_at || 'Agora';
    const BI_URL = process.env.BI_PUBLIC_URL || "https://jle-bi.vercel.app";

    // 1. Linhas de Produção Diária
    let dailyRowsHtml = "";
    (data.dailyProduction || []).slice(0, 10).forEach(d => {
        const isD1 = d.isD1;
        const isToday = d.isToday;
        const bgRow = isD1 ? 'background: #fff9e6; border-left: 4px solid #f5a623;' : (isToday ? 'background: #f0f7fb;' : '');
        const badge = isD1 
            ? '<span style="background: #f5a623; color: #ffffff; padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">⭐ DIA ANTERIOR (D-1)</span>'
            : (isToday ? '<span style="background: rgba(14,165,233,0.15); color: #0284c7; padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: 700;">HOJE</span>' : '<span style="color: #94a3b8; font-size: 11px;">Finalizado</span>');

        dailyRowsHtml += `
        <tr style="${bgRow}">
            <td style="padding: 10px 14px; border-bottom: 1px solid #edf2f7; font-size: 13px; font-weight: ${isD1 ? '700' : '600'}; color: ${isD1 ? '#b45309' : '#1e293b'};">
                ${d.formattedDate}
            </td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #edf2f7; font-size: 12px; color: #64748b;">
                ${d.dayOfWeek}
            </td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #edf2f7; text-align: center;">
                <span style="background: ${isD1 ? '#fef3c7' : 'rgba(0,79,113,0.06)'}; color: ${isD1 ? '#b45309' : '#004f71'}; font-weight: 800; padding: 4px 12px; border-radius: 14px; font-size: 13px; display: inline-block;">
                    ${d.count} ${d.count === 1 ? 'poste' : 'postes'}
                </span>
            </td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #edf2f7; text-align: right;">
                ${badge}
            </td>
        </tr>`;
    });

    // 2. Linhas de Acompanhamento por Serviço (OS)
    let servicesRowsHtml = "";
    (data.services || []).forEach(s => {
        const barColor = s.percent >= 70 ? '#10b981' : (s.percent >= 30 ? '#f59e0b' : '#ef4444');
        const d1Badge = s.d1_concluidos > 0 
            ? `<span style="background: #fef3c7; color: #b45309; font-weight: 800; padding: 2px 8px; border-radius: 10px; font-size: 11px; border: 1px solid #fde68a;">+${s.d1_concluidos} em D-1</span>`
            : `<span style="color: #94a3b8; font-size: 11px;">0</span>`;

        servicesRowsHtml += `
        <tr>
            <td style="padding: 12px 14px; border-bottom: 1px solid #edf2f7;">
                <div style="font-size: 12.5px; font-weight: 800; color: #0f172a; font-family: monospace; letter-spacing: 0.5px;">${s.site_id}</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${s.nome}">${s.nome}</div>
            </td>
            <td style="padding: 12px 14px; border-bottom: 1px solid #edf2f7; text-align: center;">
                <span style="font-weight: 700; font-size: 13px; color: #334155;">${s.concluidos}</span>
                <span style="font-size: 11px; color: #94a3b8;"> / ${s.meta}</span>
                <div style="width: 100%; height: 5px; background: #e2e8f0; border-radius: 3px; margin-top: 5px; overflow: hidden;">
                    <div style="width: ${s.percent}%; height: 100%; background: ${barColor}; border-radius: 3px;"></div>
                </div>
            </td>
            <td style="padding: 12px 14px; border-bottom: 1px solid #edf2f7; text-align: center; font-size: 12px; font-weight: 800; color: ${barColor};">
                ${s.percent}%
            </td>
            <td style="padding: 12px 14px; border-bottom: 1px solid #edf2f7; text-align: center;">
                ${d1Badge}
            </td>
            <td style="padding: 12px 14px; border-bottom: 1px solid #edf2f7; font-size: 11.5px; color: #475569;">
                ${s.tecnicos.length > 0 ? s.tecnicos.join(', ') : '<span style="color:#94a3b8;">Sem técnico</span>'}
            </td>
        </tr>`;
    });

    // 3. Linhas de Produtividade por Técnico
    let techRowsHtml = "";
    (data.technicians || []).forEach((t, idx) => {
        const medal = idx === 0 ? '🥇 ' : (idx === 1 ? '🥈 ' : (idx === 2 ? '🥉 ' : ''));
        const d1Highlight = t.d1 > 0 
            ? `<span style="background: #fef3c7; color: #b45309; font-weight: 800; padding: 4px 10px; border-radius: 12px; font-size: 12px; border: 1px solid #fde68a;">+${t.d1} postes</span>`
            : `<span style="color: #94a3b8; font-size: 12px;">0</span>`;

        techRowsHtml += `
        <tr>
            <td style="padding: 11px 14px; border-bottom: 1px solid #edf2f7; font-size: 13px; font-weight: 600; color: #1e293b;">
                ${medal}${t.nome}
            </td>
            <td style="padding: 11px 14px; border-bottom: 1px solid #edf2f7; text-align: center;">
                ${d1Highlight}
            </td>
            <td style="padding: 11px 14px; border-bottom: 1px solid #edf2f7; text-align: center;">
                <span style="background: rgba(0,79,113,0.06); color: #004f71; font-weight: 800; padding: 4px 10px; border-radius: 12px; font-size: 12px;">
                    ${t.total} postes
                </span>
            </td>
            <td style="padding: 11px 14px; border-bottom: 1px solid #edf2f7; font-size: 11.5px; color: #64748b;">
                ${t.servicos.length > 0 ? t.servicos.join(', ') : '-'}
            </td>
        </tr>`;
    });

    const percentGeral = kpis.totalMeta > 0 ? Math.round((kpis.totalConcluidos / kpis.totalMeta) * 100) : 0;

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${reportName}</title>
    </head>
    <body style="margin:0; padding:0; background:#f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f9; padding: 25px 10px;">
            <tr>
                <td align="center">
                    <table width="640" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff; border-radius:14px; overflow:hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; max-width: 640px; width: 100%;">
                        
                        <!-- HEADER -->
                        <tr>
                            <td style="background: #004f71; padding: 28px 32px; border-bottom: 4px solid #f5a623;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td align="left" valign="middle">
                                            <div style="font-size: 11px; font-weight: 800; color: #f5a623; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 4px;">
                                                JLE TELECOM • RELATÓRIO OPERACIONAL
                                            </div>
                                            <h1 style="margin:0; font-size:23px; font-weight:800; color:#ffffff; line-height:1.2;">
                                                ⚡ ${reportName}
                                            </h1>
                                            <div style="font-size:12px; color:rgba(255,255,255,0.75); margin-top:6px; font-weight: 500;">
                                                Acompanhamento de Produtividade de Campo • Atualizado em: ${generatedAt}
                                            </div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- CARDS DE DESTAQUE (CARD PRINCIPAL D-1 + KPIS) -->
                        <tr>
                            <td style="padding: 24px 32px 10px;">
                                
                                <!-- CARD GRANDE: DESTAQUE D-1 (DIA ANTERIOR) -->
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border: 2px solid #f5a623; border-radius: 12px; margin-bottom: 16px; box-shadow: 0 4px 12px rgba(245,166,35,0.12);">
                                    <tr>
                                        <td style="padding: 18px 22px; text-align: center;">
                                            <div style="display: inline-block; background: #f5a623; color: #ffffff; font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 3px 10px; border-radius: 20px; margin-bottom: 6px;">
                                                ⭐ DESTAQUE DO DIA ANTERIOR (D-1: ${d1Info.formattedDate})
                                            </div>
                                            <div style="font-size: 42px; font-weight: 900; color: #92400e; line-height: 1.05; margin: 4px 0;">
                                                ${kpis.totalD1}
                                            </div>
                                            <div style="font-size: 13px; font-weight: 700; color: #78350f;">
                                                POSTES FINALIZADOS ONTEM (COM ANTES E DEPOIS)
                                            </div>
                                            <div style="font-size: 11px; color: #a16207; margin-top: 4px;">
                                                Acompanhamento diário de entrega e produtividade técnica de campo
                                            </div>
                                        </td>
                                    </tr>
                                </table>

                                <!-- GRID 3 CARDS SECUNDÁRIOS -->
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <!-- Total Geral -->
                                        <td width="32%" style="background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; border-top: 3px solid #004f71; padding: 14px 10px; text-align: center;">
                                            <div style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">TOTAL CONCLUÍDO</div>
                                            <div style="font-size: 24px; font-weight: 800; color: #004f71; margin-top: 2px;">${kpis.totalConcluidos}</div>
                                            <div style="font-size: 10.5px; color: #94a3b8; margin-top: 2px;">de ${kpis.totalMeta} meta (${percentGeral}%)</div>
                                        </td>
                                        <td width="2%"></td>
                                        <!-- Serviços Ativos -->
                                        <td width="32%" style="background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; border-top: 3px solid #0ea5e9; padding: 14px 10px; text-align: center;">
                                            <div style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">ORDENS DE SERVIÇO</div>
                                            <div style="font-size: 24px; font-weight: 800; color: #0284c7; margin-top: 2px;">${kpis.servicosAtivos}</div>
                                            <div style="font-size: 10.5px; color: #94a3b8; margin-top: 2px;">obras mapeadas</div>
                                        </td>
                                        <td width="2%"></td>
                                        <!-- Técnicos -->
                                        <td width="32%" style="background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; border-top: 3px solid #10b981; padding: 14px 10px; text-align: center;">
                                            <div style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">TÉCNICOS ATIVOS</div>
                                            <div style="font-size: 24px; font-weight: 800; color: #059669; margin-top: 2px;">${kpis.tecnicosAtivos}</div>
                                            <div style="font-size: 10.5px; color: #94a3b8; margin-top: 2px;">em campo</div>
                                        </td>
                                    </tr>
                                </table>

                            </td>
                        </tr>

                        <!-- SEÇÃO 1: HISTÓRICO DE PRODUÇÃO DIÁRIA -->
                        <tr>
                            <td style="padding: 20px 32px 0;">
                                <div style="font-size: 13px; font-weight: 800; color: #004f71; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                                    📅 Produção Diária de Postes Finalizados
                                </div>
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; border-collapse: separate; border-spacing: 0;">
                                    <thead>
                                        <tr style="background: #f1f5f9;">
                                            <th style="padding: 9px 14px; font-size: 11px; font-weight: 700; color: #475569; text-align: left; text-transform: uppercase;">Data</th>
                                            <th style="padding: 9px 14px; font-size: 11px; font-weight: 700; color: #475569; text-align: left; text-transform: uppercase;">Dia</th>
                                            <th style="padding: 9px 14px; font-size: 11px; font-weight: 700; color: #475569; text-align: center; text-transform: uppercase;">Finalizados</th>
                                            <th style="padding: 9px 14px; font-size: 11px; font-weight: 700; color: #475569; text-align: right; text-transform: uppercase;">Destaque</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${dailyRowsHtml}
                                    </tbody>
                                </table>
                            </td>
                        </tr>

                        <!-- SEÇÃO 2: ACOMPANHAMENTO POR SERVIÇO (OS) -->
                        <tr>
                            <td style="padding: 24px 32px 0;">
                                <div style="font-size: 13px; font-weight: 800; color: #004f71; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 10px;">
                                    📍 Acompanhamento por Serviço (OS TELEMONT)
                                </div>
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; border-collapse: separate; border-spacing: 0;">
                                    <thead>
                                        <tr style="background: #f1f5f9;">
                                            <th style="padding: 9px 14px; font-size: 11px; font-weight: 700; color: #475569; text-align: left; text-transform: uppercase;">OS / Serviço</th>
                                            <th style="padding: 9px 14px; font-size: 11px; font-weight: 700; color: #475569; text-align: center; text-transform: uppercase;">Concluídos / Meta</th>
                                            <th style="padding: 9px 14px; font-size: 11px; font-weight: 700; color: #475569; text-align: center; text-transform: uppercase;">%</th>
                                            <th style="padding: 9px 14px; font-size: 11px; font-weight: 700; color: #475569; text-align: center; text-transform: uppercase;">D-1 (Ontem)</th>
                                            <th style="padding: 9px 14px; font-size: 11px; font-weight: 700; color: #475569; text-align: left; text-transform: uppercase;">Técnicos</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${servicesRowsHtml}
                                    </tbody>
                                </table>
                            </td>
                        </tr>

                        <!-- SEÇÃO 3: PRODUTIVIDADE POR TÉCNICO -->
                        <tr>
                            <td style="padding: 24px 32px 0;">
                                <div style="font-size: 13px; font-weight: 800; color: #004f71; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 10px;">
                                    👷 Produtividade Técnica de Campo
                                </div>
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; border-collapse: separate; border-spacing: 0;">
                                    <thead>
                                        <tr style="background: #f1f5f9;">
                                            <th style="padding: 9px 14px; font-size: 11px; font-weight: 700; color: #475569; text-align: left; text-transform: uppercase;">Técnico</th>
                                            <th style="padding: 9px 14px; font-size: 11px; font-weight: 700; color: #475569; text-align: center; text-transform: uppercase;">D-1 (Ontem)</th>
                                            <th style="padding: 9px 14px; font-size: 11px; font-weight: 700; color: #475569; text-align: center; text-transform: uppercase;">Total Geral</th>
                                            <th style="padding: 9px 14px; font-size: 11px; font-weight: 700; color: #475569; text-align: left; text-transform: uppercase;">Serviços Atendidos</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${techRowsHtml}
                                    </tbody>
                                </table>
                            </td>
                        </tr>

                        <!-- BOTÃO DE ACESSO -->
                        <tr>
                            <td align="center" style="padding: 26px 32px 10px;">
                                <table cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td align="center" style="background: #004f71; border-radius: 8px;">
                                            <a href="${BI_URL}" target="_blank" style="display: inline-block; padding: 12px 28px; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; letter-spacing: 0.5px;">
                                                📊 Acessar Dashboard Completo no BI JLE
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- FOOTER -->
                        <tr>
                            <td style="padding: 20px 32px 28px; text-align: center; border-top: 1px solid #edf2f7; margin-top: 20px;">
                                <div style="font-size: 11px; color: #94a3b8; line-height: 1.5;">
                                    Este é um relatório gerado automaticamente pelo sistema de monitoramento técnico da <strong>JLE Telecom</strong>.<br>
                                    Critério de Conclusão: Postes com registros fotográficos de <strong>Antes</strong> e <strong>Depois</strong> validados.<br>
                                    © ${new Date().getFullYear()} JLE Telecomunicações. Todos os direitos reservados.
                                </div>
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
    loadTrocaPosteDataAsync,
    buildTrocaPosteEmailHtml
};
