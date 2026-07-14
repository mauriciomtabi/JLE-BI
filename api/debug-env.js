export default function handler(req, res) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    
    res.status(200).json({
        has_service_key: !!serviceKey,
        service_key_prefix: serviceKey ? serviceKey.substring(0, 10) + "..." : "none",
        has_resend_key: !!resendKey,
        resend_key_prefix: resendKey ? resendKey.substring(0, 10) + "..." : "none",
        env_keys: Object.keys(process.env).filter(k => k.includes("SUPABASE") || k.includes("RESEND"))
    });
}
