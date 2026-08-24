# Diretrizes do Projeto BI JLE Telecom

Este arquivo define as instruções permanentes e os princípios de desenvolvimento do repositório **BI JLE Telecom**.

---

## 1. Visão Geral da Arquitetura

O BI JLE Telecom é uma plataforma de Business Intelligence corporativa desenvolvida para operação ágil, combinando:
- **Frontend SPA / PWA**: HTML5, Vanilla JavaScript modular (`app.js`, `tecnodrill_app.js`, `cobranca_app.js`, `gestao_os_app.js`, `manutencao_app.js`, `mdu_app.js`, `veiculos_app.js`), Chart.js e Vanilla CSS com Glassmorphism.
- **Pipelines ETL Automatizados**: Scripts PowerShell / Python que leem planilhas em rede local (`\\10.121.21.252\...`) e Google Sheets, compilando para arquivos de dados locais em JavaScript (`data.js`, `tecnodrill_data.js`, `cobranca_data.js`, `veiculos_data.js`, `manutencao_data.js`, `mdu_data.js`).
- **Disparo de Relatórios por E-mail**: Serverless Cron via Vercel (`/api/cron.js`), Supabase para agendamentos e Resend API para envio.
- **Deploy Contínuo**: Sincronização automática via GitHub `main` integrada à Vercel com versionamento de cache no Service Worker (`sw.js`).

---

## 2. Skills do Workspace Disponíveis

Sempre utilize as skills do workspace localizadas em `.agents/skills/`:
1. **`bi-etl-automation`**: Procedimentos e boas práticas para scripts de ETL, caminhos UNC de rede, Excel COM, conversão de moeda pt-BR e Agendador de Tarefas.
2. **`bi-email-delivery`**: Padrões para envio de relatórios corporativos por e-mail, templates HTML em tabelas inline, Vercel Crons e Supabase.
3. **`bi-ui-preservation`**: Regras de preservação de layout, Dark Glassmorphism, Chart.js responsivo, proteção de IDs DOM e alternância de temas.
4. **`bi-pwa-deploy`**: Ciclo de vida do Service Worker (`sw.js`), bump de cache PWA e deploy na Vercel.

---

## 3. Regras Inegociáveis de Desenvolvimento

1. **Nunca quebre IDs ou Layouts Existentes**: Qualquer alteração em elementos visuais deve manter a harmonia visual, tema escuro e integridade dos scripts associados.
2. **Resiliência em Caminhos de Rede**: Scripts ETL nunca devem depender de uma única pasta de rede fixa; sempre utilize busca com fallback para múltiplas pastas candidatas.
3. **Cache de Contingência**: Ao baixar dados com sucesso da rede, sempre atualize os arquivos `*_local.xlsx` para permitir que o sistema funcione em contingência se a rede estiver temporariamente inacessível.
4. **Sempre Atualize o Cache PWA**: A cada alteração de dados ou frontend, atualize o `CACHE_NAME` no `sw.js` para garantir que os usuários recebam dados frescos.
5. **Preserve a Ordenação de Competências**: Ao carregar filtros de mês, sempre ordene cronologicamente (Janeiro a Dezembro / Ano) e auto-selecione a competência mais recente disponível.
