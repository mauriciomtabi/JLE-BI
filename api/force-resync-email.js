// api/force-resync-email.js
// Endpoint de force-resync legado.
// Desativado para evitar pré-agendamentos obsoletos no Resend.

const SUPABASE_URL = "https://fowlctvebdcodphntsjw.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvd2xjdHZlYmRjb2RwaG50c2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzg2NjUsImV4cCI6MjA5NTY1NDY2NX0.PxzD_PlU4sBFPBukthuXpkBlzYbQqMLXLE4DQwctPOM";

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
    if (body) options.body = JSON.stringify(body);
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
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const reports = await fetchSupabase("bi_email_reports?select=*");
        if (reports && Array.isArray(reports)) {
            for (const r of reports) {
                if (r.recipients && r.recipients.some(e => e.startsWith('__sched:') || e.startsWith('__lock:'))) {
                    const cleanRecipients = r.recipients.filter(e => !e.startsWith('__sched:') && !e.startsWith('__lock:'));
                    await fetchSupabase(`bi_email_reports?id=eq.${r.id}`, 'PATCH', {
                        recipients: cleanRecipients,
                        updated_at: new Date().toISOString()
                    });
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: "Force-resync legado desativado. Disparos ocorrem dinamicamente."
        });
    } catch (err) {
        console.error("Erro no force-resync:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
};
