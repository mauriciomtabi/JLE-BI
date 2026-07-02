# Script para criar a tabela bi_email_reports no Supabase via API REST
# Usa a service_role key para ter permissão de DDL

$supabaseUrl = "https://fowlctvebdcodphntsjw.supabase.co"
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvd2xjdHZlYmRjb2RwaG50c2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzg2NjUsImV4cCI6MjA5NTY1NDY2NX0.PxzD_PlU4sBFPBukthuXpkBlzYbQqMLXLE4DQwctPOM"

# SQL para criar a tabela (via Supabase SQL endpoint nao disponivel com anon key)
# Este script vai inserir via REST API apos a tabela ser criada manualmente no painel Supabase
Write-Output "===================================================================="
Write-Output "INSTRUCOES PARA CRIAR A TABELA BI_EMAIL_REPORTS NO SUPABASE"
Write-Output "===================================================================="
Write-Output ""
Write-Output "Acesse: https://supabase.com/dashboard/project/fowlctvebdcodphntsjw/sql"
Write-Output ""
Write-Output "Cole e execute o seguinte SQL:"
Write-Output ""
Write-Output @"
CREATE TABLE IF NOT EXISTS bi_email_reports (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_name   TEXT NOT NULL,
    report_type   TEXT NOT NULL DEFAULT 'mdu',
    recipients    TEXT[] NOT NULL DEFAULT '{}',
    schedule_time TEXT NOT NULL DEFAULT '08:00',
    schedule_days TEXT[] NOT NULL DEFAULT ARRAY['MON','TUE','WED','THU','FRI'],
    is_active     BOOLEAN NOT NULL DEFAULT true,
    last_sent_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar Row Level Security
ALTER TABLE bi_email_reports ENABLE ROW LEVEL SECURITY;

-- Politica: qualquer pessoa autenticada pode ler (para o script PowerShell via anon key)
CREATE POLICY "Allow anon read" ON bi_email_reports FOR SELECT USING (true);

-- Politica: apenas admins podem inserir, atualizar, deletar
CREATE POLICY "Allow admin write" ON bi_email_reports FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM bi_permissions
        WHERE email = (auth.jwt() ->> 'email')
        AND is_admin = true
    )
);
"@

Write-Output ""
Write-Output "===================================================================="
Write-Output "Apos executar o SQL, rode novamente o check_supabase.ps1 para confirmar."
Write-Output "===================================================================="
