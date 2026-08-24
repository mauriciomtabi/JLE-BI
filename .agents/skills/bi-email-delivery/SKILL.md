---
name: bi-email-delivery
description: >-
  Guia e padrões técnicos para templates de e-mail, integração com Resend API,
  gerenciamento de agendamentos no Supabase e rotinas cron (Vercel Serverless / Local).
  Ative esta skill ao criar, editar ou diagnosticar relatórios automáticos e notificações por e-mail.
---

# BI JLE Telecom - Email Delivery & Reporting Standards

Este documento estabelece as diretrizes obrigatórias para os serviços de disparo de relatórios automatizados por e-mail no BI JLE Telecom.

---

## 1. Arquitetura do Sistema de E-mails

```
[ Vercel Cron (*/10 min) ] ──> /api/cron.js ──> [ Supabase (Schedules & Logs) ]
                                      │
                                      ├──> Valida Janela de Horário (UTC-3)
                                      ├──> Extrai Dados do Módulo (Claro / MDU / Manutenção)
                                      ├──> Renderiza HTML com Design System Corporativo
                                      └──> Resend API (bi@jletelecom.com.br) ──> Destinatários
```

### 1.1. Componentes Chave
- **`api/cron.js`**: Serverless function executada a cada 10 minutos via Vercel Cron (`vercel.json`).
- **`api/*-report-helper.js`**: Formatadores de dados e geradores de templates HTML para cada módulo (`claro-report-helper.js`, `manutencao-report-helper.js`, `tecnodrill-report-helper.js`).
- **`check_and_send_emails.js`**: Script CLI para teste local e verificação de cron.
- **`send_email_reports.js` / `send_mdu_email.ps1`**: Scripts de contingência e testes diretos.

---

## 2. Regras de Construção de Templates HTML para E-mail

E-mails corporativos são lidos no Microsoft Outlook, Apple Mail, Gmail e dispositivos móveis. As seguintes regras são fundamentais:

### 2.1. Estrutura de Layout e Compatibilidade
- **Use Tabelas para Layout**: Nunca utilize layouts puramente baseados em Flexbox ou CSS Grid no corpo principal do e-mail; estruture em `<table>`, `<tr>` e `<td>`.
- **CSS Inline Obrigatório**: Aplique estilos diretamente nos elementos com atributo `style="..."`.
- **Paleta Corporativa JLE**:
  - Fundo do cabeçalho: `#0f172a` (Azul escuro profissional) ou `#1e293b`.
  - Cor de destaque / Accent: `#f59e0b` (Âmbar JLE) ou `#0ea5e9` (Azul Claro).
  - Texto principal: `#1e293b` (em fundo claro) ou `#f8fafc` (em fundo escuro).
  - Bordas e divisores: `#e2e8f0`.

### 2.2. Prevenção de Bloqueio e Spam
- **Forneça sempre versão texto alternativo (`text`)** no payload da API do Resend.
- **Headers anti-loop e de precedência**:
  ```javascript
  headers: {
      "X-Entity-Ref-ID": `bi-report-${Date.now()}`,
      "X-Auto-Response-Suppress": "OOF, AutoReply",
      "Precedence": "bulk"
  }
  ```
- **Assunto Padronizado**: Prefixar com `[BI JLE]` ou `[BI JLE TELECOM]`.

---

## 3. Gestão de Agendamentos e Fuso Horário

- **Fuso Horário Obrigatório**: Todos os cálculos de hora atual devem considerar explicitamente o fuso horário de Brasília (**UTC-3 / `America/Sao_Paulo`**).
- **Tolerância de Janela**: A verificação compara a hora agendada (`HH:mm`) com a hora atual com uma margem de segurança (janela de ±15 minutos).
- **Proteção contra Duplicidade**: Antes de disparar, o script verifica se já existe registro de envio para o relatório na data atual (`already_sent_today`).
