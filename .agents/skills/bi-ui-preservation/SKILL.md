---
name: bi-ui-preservation
description: >-
  Diretrizes de design visual, preservação de layouts, gráficos Chart.js,
  identificadores DOM e garantias de não-regressão para o BI JLE Telecom.
  Ative esta skill sempre que for criar, editar ou refatorar telas, componentes,
  filtros, modais, gráficos ou estilos CSS da aplicação web.
---

# BI JLE Telecom - UI/UX & Layout Preservation Standards

Este documento define os princípios visuais inegociáveis, a arquitetura de componentes frontend e as regras de não-regressão para a interface do BI JLE Telecom.

---

## 1. Design System & Paleta de Cores (Dark Glassmorphism)

A estética do BI JLE utiliza um tema escuro premium com visual translúcido, bordas sutis e contraste calibrado:

### 1.1. Cores de Fundo e Superfície
- **Background Geral**: `#0b0f19` ou `#0d1117` (Deep Slate / Dark Navy)
- **Cards e Painéis**: `#161b22` com borda `1px solid rgba(255, 255, 255, 0.08)`
- **Header e Barra Lateral**: `#0d1117` com fundo translúcido `backdrop-filter: blur(12px)`
- **Hover de Linhas/Cards**: `rgba(255, 255, 255, 0.03)`

### 1.2. Cores de Destaque Semântico
- **Entradas / Faturamento / Positivo**: `#00d2d3` / `#38ef7d` / `#10b981` (Ciano / Esmeralda)
- **Saídas / Despesas**: `#ff9f43` / `#f59e0b` / `#fbbf24` (Âmbar / Laranja)
- **Saldos / Lucro**: `#54a0ff` / `#388bfd` (Azul JLE)
- **Status Crítico / Alerta**: `#ee5253` / `#f85149` (Vermelho)
- **Acento Primário da Marca**: Laranja JLE (`#f39c12` / `#e67e22`)

---

## 2. Regras de Não-Regressão e Preservação de Layout

### 2.1. Proteção de Elementos DOM e Identificadores (IDs)
- **NUNCA altere ou remova IDs de elementos HTML** existentes sem atualizar todos os scripts associados (`app.js`, `tecnodrill_app.js`, `cobranca_app.js`, `gestao_os_app.js`, `manutencao_app.js`, `mdu_app.js`, `veiculos_app.js`).
- Principais IDs protegidos:
  - Filtros: `#filter-mes`, `#td-filter-mes`, `#filter-categoria`, `#td-filter-categoria`, `#filter-uf`, `#filter-data-inicio`, `#filter-data-fim`.
  - Abas: `#tab-indicadores`, `#tab-lancamentos`, botões de visualização diária/semanal/mensal.
  - KPIs: `#kpi-entradas`, `#kpi-saidas`, `#kpi-saldo`, `#td-kpi-entradas`, etc.
  - Canvas de Gráficos: `#chart-evolution`, `#chart-customers`, `#chart-categories`, `#td-chart-evolution`, etc.

### 2.2. Containers Responsivos para Gráficos Chart.js
Gráficos Chart.js podem causar transbordamento (overflow) da página se não estiverem em containers com dimensões controladas.
- **Sempre configure**:
  ```javascript
  options: {
      responsive: true,
      maintainAspectRatio: false,
      // ...
  }
  ```
- **Wrapper CSS Obrigatório**:
  ```html
  <div class="chart-container" style="position: relative; height: 320px; width: 100%;">
      <canvas id="meu-grafico"></canvas>
  </div>
  ```

### 2.3. Sincronização de Abas (Indicadores vs Lançamentos)
- Quando o usuário troca de aba entre **Indicadores** e **Lançamentos**, os filtros selecionados (mês, categoria, busca) devem ser mantidos idênticos.
- Ao renderizar tabelas de lançamentos, utilize paginação client-side com no máximo 50 registros por página para evitar travamento da renderização do navegador.

### 2.4. Respeito ao Tema Claro / Escuro
- O BI oferece alternância de tema. Todas as variáveis de cor devem respeitar as CSS Custom Properties (`--bg-primary`, `--text-primary`, `--card-bg`, `--border-color`) para que o layout não quebre no modo claro.
