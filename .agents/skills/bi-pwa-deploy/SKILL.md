---
name: bi-pwa-deploy
description: >-
  Diretrizes de ciclo de vida de cache PWA (Service Worker), publicação no GitHub
  e integração contínua com deploy na Vercel para o BI JLE Telecom.
  Ative esta skill sempre que for atualizar scripts de publicação, cache do PWA,
  Service Worker ou validar deploys em produção.
---

# BI JLE Telecom - PWA Cache & Deployment Standards

Este documento estabelece as regras de versionamento de cache, Service Worker (`sw.js`) e fluxo de deploy contínuo no BI JLE Telecom.

---

## 1. Ciclo de Vida do Cache PWA (`sw.js`)

O BI JLE Telecom opera como um Progressive Web App (PWA). Para que os usuários sempre visualizem os dados mais recentes sem precisar limpar o cache do navegador manualmente:

### 1.1. Bump Automático do `CACHE_NAME`
Sempre que um script ETL ou edição de código modificar dados (`*_data.js`) ou templates frontend, a versão do cache no `sw.js` deve ser incrementada com o timestamp atual:

```powershell
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$newCacheNameLine = "const CACHE_NAME = 'jle-bi-v3.16.$timestamp';"
$swContent = $swContent -replace "const CACHE_NAME = '([^']+)';", $newCacheNameLine
```

### 1.2. Estratégia de Cache por Tipo de Recurso
- **Dados JS (`*_data.js`)**: Estratégia *Network-First* com fallback para Cache, garantindo que requisições online sempre busquem a base fresca.
- **Assets Estáticos (CSS, Fontes, Ícones)**: Estratégia *Stale-While-Revalidate* para carregamento instantâneo.
- **Service Worker (`sw.js`)**: Nunca deve ser cacheado pelo servidor (`Cache-Control: no-cache, no-store, must-revalidate`).

---

## 2. Fluxo de Publicação e Deploy Contínuo (Vercel)

```
[ ETL Local (Task Scheduler) ] ──> Gera *_data.js ──> Atualiza sw.js
                                        │
                                        └──> Git Commit ("data(auto): ...")
                                                  │
                                                  └──> Git Push (origin main)
                                                            │
                                                            └──> Vercel Auto-Deploy (Produção)
```

### 2.1. Padrão de Mensagens de Commit
- **Atualização de Dados**: `data(auto): atualizacao automatica de dados [Modulo] e cache do PWA`
- **Correção de Bugs**: `fix(modulo): descricao clara da correcao`
- **Novas Funcionalidades**: `feat(modulo): descricao do novo recurso`
- **Ajustes de Estilo**: `style(ui): ajuste de layout e responsividade`

### 2.2. Verificação Pós-Deploy
Após cada push, certifique-se de que a URL de produção (`https://jle-bi.vercel.app`) está respondendo com HTTP 200 e que a tag de última atualização no cabeçalho dos dashboards reflete a data/hora do processamento mais recente.
