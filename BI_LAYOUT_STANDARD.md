# BI JLE Telecom — Padrão de Layout, Design System e UI/UX

Este guia documenta o padrão oficial de interface visual, arquitetura de componentes e regras de experiência do usuário (UX) do ecossistema **BI JLE Telecom**. Todos os novos módulos e telas devem seguir rigorosamente estas diretrizes para manter a consistência estética, estabilidade e usabilidade da plataforma.

---

## 1. Princípios Gerais de Design (Dark Glassmorphism)

O BI adota o tema escuro corporativo (*Dark Theme*) combinado com superfícies translúcidas e contraste calibrado:

### 1.1. Variáveis CSS Globais e Superfícies
- **Fundo Principal (`--bg-body`)**: `#0b0f19` ou `#0d1117`
- **Superfície de Cards (`--bg-card`)**: `#161b22` com borda `1px solid var(--border-color)` (`rgba(255, 255, 255, 0.08)`)
- **Campos de Formulário/Filtros (`--bg-input`)**: `#0d1117` ou `#161b22`
- **Sombra Padrão (`--shadow-main`)**: `0 4px 20px rgba(0, 0, 0, 0.25)`
- **Sombra Hover (`--shadow-hover`)**: `0 8px 30px rgba(0, 0, 0, 0.35)`
- **Tipografia**: `'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

### 1.2. Paleta Semântica de Cores
- **Primária / Marca JLE**: `#005073` (Brand Deep Blue) / `#f39c12` (JLE Accent Orange)
- **Sucesso / No Prazo / Positivo**: `#10b981` / `#2ed573` (Esmeralda / Verde)
- **Atenção / Andamento / Advertência**: `#f59e0b` / `#ffa502` (Âmbar)
- **Crítico / Atrasado / Cancelado / Negativo**: `#f85149` / `#ff4757` (Vermelho)
- **Informativo / Saldos / Concluído**: `#388bfd` / `#1e90ff` (Azul Claro)

---

## 2. Estrutura Padrão de um Módulo do BI

Todo módulo do BI deve ser estruturado em 4 blocos visuais ordenados:

```
+-------------------------------------------------------------------------+
| 1. Cabeçalho da Visão (Título, Subtítulo, Badge de Atualização)        |
+-------------------------------------------------------------------------+
| 2. Barra de Filtros Unificada (Status, Cidades, Períodos, Busca Rápida) |
+-------------------------------------------------------------------------+
| 3. Sub-Abas do Módulo (Indicadores / Relatório Detalhado / Mapa)        |
+-------------------------------------------------------------------------+
| 4. Conteúdo da Sub-Aba Ativa:                                           |
|    - Aba Indicadores: Grid de 4 KPIs + Gráficos 2-Cols + Desempenho     |
|    - Aba Relatório: Tabela com Ordenação + Paginação + Exportação Excel  |
+-------------------------------------------------------------------------+
```

---

## 3. Especificação dos Componentes

### 3.1. Cabeçalho do Módulo
- **Título da Tela (`#view-title`)**: Fonte tamanho `1.35rem`, peso `700`, cor `--text-primary`.
- **Subtítulo da Tela (`#view-subtitle`)**: Fonte tamanho `0.85rem`, cor `--text-secondary`, com badge contextual inline se aplicável.
- **Badge de Atualização (`.last-update-badge`)**: Indica a data e hora em que a base foi compilada (`window.*_METADATA.generated_at`).

### 3.2. Barra de Filtros (`.filter-bar`)
- **Layout**: Container com `border-radius: 12px`, `padding: 14px 16px`, `gap: 12px`, `display: flex; flex-wrap: wrap; align-items: flex-end;`.
- **Controles de Seleção**:
  - Altura padrão de 38px para inputs e selects.
  - Multi-select dropdown para múltiplos status com contagem de selecionados.
  - Campo de busca rápida com largura flexível (`flex-grow: 1`) e pesquisa em tempo real (`oninput` com debounce).
  - Botão de limpar filtros com ícone de borracha (`fa-eraser`), restaurando o estado padrão.

### 3.3. Sub-Abas de Navegação Interna (`.dashboard-tabs`)
- Botões com cantos arredondados, ícones do FontAwesome e indicador de aba ativa via classe `.tab-btn.active`.
- Alternância rápida entre visão gráfica (**Indicadores**) e visão analítica (**Relatório de Registros**).

### 3.4. Cards de Indicadores (KPIs)
- **Grid de KPIs**: 4 colunas em desktops (`grid-template-columns: repeat(4, 1fr)`), 2 em tablets e 1 em mobile.
- **Estilo Visual**:
  - Borda lateral esquerda de 4px com a cor semântica do KPI.
  - Glow radial de fundo calibrado (`radial-gradient(circle at top right, rgba(var(--glow-color), 0.06), var(--bg-card) 70%)`).
  - Título do KPI em caixa alta sutil (`0.85rem`, peso `600`, `--text-secondary`).
  - Valor numérico grande em destaque (`1.8rem`, peso `700`, `--text-primary`).
  - Rodapé com percentual explicativo ou metadados de apoio.
  - Ícone em marca d'água semi-transparente no canto inferior direito (`opacity: 0.12`, rotacionado 12deg), com animação sutil ao passar o cursor (`:hover`).

### 3.5. Gráficos Chart.js e Containers Responsivos
- **Regra de Ouro**: O canvas **NUNCA** deve ser inserido sem um container wrapper com dimensões explícitas.
  ```html
  <div class="chart-container" style="position: relative; height: 260px; width: 100%;">
      <canvas id="meu-grafico"></canvas>
  </div>
  ```
- **Configuração do Chart.js**:
  ```javascript
  options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
          legend: { labels: { color: '#c9d1d9', font: { family: 'Outfit, Inter' } } },
          tooltip: { backgroundColor: '#161b22', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 }
      }
  }
  ```
- **Mecânica de Drill-Down**: Ao clicar em uma barra de competência mensal, o gráfico transiciona para a visualização diária do mês selecionado, exibindo um botão de retorno (`Voltar ao Mensal`).

### 3.6. Tabela de Relatório Analítico
- **Paginação Client-Side**: Limite fixo de 50 linhas por página para performance instantânea no DOM.
- **Ordenação nas Colunas**: Cabeçalhos clicáveis com alternância visual de ícones `fa-sort`, `fa-sort-up`, `fa-sort-down`.
- **Badges Semânticos**: Tags com cantos arredondados (`border-radius: 12px`, `padding: 4px 8px`) para Status e Prazos (ex: No Prazo em verde, Atrasado em vermelho).
- **Exportação Excel**: Botão nativo estilizado que gera planilhas `.xlsx` formatadas via biblioteca `xlsx-js-style` / `SheetJS`.

---

## 4. Diretrizes de Engenharia e Isolamento de Código

1. **Namespace Único**: Todas as variáveis, classes CSS e funções JS de um módulo devem ser prefixadas com o nome do módulo (ex: `sar_`, `mdu_`, `cobranca_`).
2. **Desacoplamento Completo**: Nenhum módulo deve depender de variáveis globais de outros módulos.
3. **Persistência de Filtros**: Ao alternar entre abas internas de um módulo, o estado dos filtros (busca, status, cidade) deve ser preservado.
4. **Resiliência a Dados Vazios ou Nulos**: Todos os formatadores de data, texto e número devem tratar graciosamente valores `null`, `undefined` e `NaN`.
