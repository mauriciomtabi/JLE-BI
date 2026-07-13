// api/reset-last-sent.js
// Temporary utility endpoint to reset last_sent_at to yesterday bypassing RLS.

const SUPABASE_URL = "https://fowlctvebdcodphntsjw.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvd2xjdHZlYmRjb2RwaG50c2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzg2NjUsImV4cCI6MjA5NTY1NDY2NX0.PxzD_PlU4sBFPBukthuXpkBlzYbQqMLXLE4DQwctPOM";

module.exports = async (req, res) => {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!serviceKey) {
        return res.status(500).json({ error: "No service key configured in environment variables" });
    }

    try {
        const url = `${SUPABASE_URL}/rest/v1/bi_email_reports`;
        const headers = {
            "apikey": ANON_KEY,
            "Authorization": `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        };

        const response = await fetch(url, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
                last_sent_at: '2026-07-12T11:00:00+00:00'
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Supabase PATCH failed: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        return res.status(200).json({ success: true, data });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
