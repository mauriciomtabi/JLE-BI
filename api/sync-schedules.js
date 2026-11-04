// api/sync-schedules.js
// Endpoint de sincronização de agendamentos.
// O agendamento estático prévio no Resend foi permanentemente desativado para evitar
// duplicações e envios com dados obsoletos/incorretos.
// Os disparos agora ocorrem exclusivamente em tempo real no horário programado.

let SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL || SUPABASE_URL.includes("fowlctve") || SUPABASE_URL.includes("dkscchjz")) {
    SUPABASE_URL = "https://dmwefcngefeonxuukwdl.supabase.co";
}
let ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!ANON_KEY || ANON_KEY.includes("fowlctve") || ANON_KEY.includes("dkscchjz")) {
    ANON_KEY = "sb_publishable_j3AShmEr6aEWjqBv2rruhw_5EE4NnOt";
}

async function fetchSupabase(endpoint, method = 'GET', body = null, token = null) {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    let apiKeyToUse = ANON_KEY;
    if (token) {
        apiKeyToUse = token.replace(/^Bearer\s+/i, '').trim();
    }

    const headers = {
        "apikey": apiKeyToUse,
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

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader || null;

        // Limpar qualquer token legado __sched: ou __lock: do banco
        const reports = await fetchSupabase("bi_email_reports?select=*", 'GET', null, token);
        if (reports && Array.isArray(reports)) {
            for (const r of reports) {
                if (r.recipients && r.recipients.some(e => e.startsWith('__sched:') || e.startsWith('__lock:'))) {
                    const cleanRecipients = r.recipients.filter(e => !e.startsWith('__sched:') && !e.startsWith('__lock:'));
                    await fetchSupabase(`bi_email_reports?id=eq.${r.id}`, 'PATCH', {
                        recipients: cleanRecipients,
                        updated_at: new Date().toISOString()
                    }, token);
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: "Agendamento estático legado desativado. Disparos ocorrem dinamicamente no horário de envio."
        });
    } catch (error) {
        console.error("Erro na limpeza de agendamentos:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
