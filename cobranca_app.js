/* ============================================================
   cobranca_app.js — Lógica Dashboard COBRANÇA (Reescrita Completa)
   Acompanhamento financeiro de serviços executados - Claro
   v4.0
   ============================================================ */

// ── Estado Global da Cobrança ───────────────────────────────────────────────
let cobrancaActiveTab = 'indicators';
let cobrancaFilteredData = [];
let cobrancaCurrentPage = 1;
const COBRANCA_PAGE_SIZE = 50;
let cobrancaSortCol = 'data_cadastro';
let cobrancaSortDir = 'desc';
let cobrancaSearchQuery = '';
let cobrancaDataLoaded = false;
let osListMode = 'sem-aprovacao'; // 'sem-aprovacao' | 'aprovadas'

// Instâncias de Gráficos Chart.js
let cobrancaCharts = {
    capexOpex: null,
    pedidoStatus: null,
    monthlySplit: null,
    activity: null,
    item: null,
    faseAtual: null
};

// Filtros por Clique (Cards e Mapa)

// Data base para o cálculo de envelhecimento (Aging)
// Utiliza a data de geração da base de dados se disponível, ou a data de hoje
let baseAgingDate = new Date();

// ── Inicialização ────────────────────────────────────────────────────────────
function initCobranca() {
    try {
        if (typeof COBRANCA_DATA === 'undefined') {
            console.error('COBRANCA_DATA não carregada.');
            return;
        }

        // Definir a data base do aging com base na data de geração do arquivo
        if (typeof window.COBRANCA_METADATA !== 'undefined' && window.COBRANCA_METADATA.generated_at) {
            const genDateParts = window.COBRANCA_METADATA.generated_at.split(' ')[0].split('-');
            baseAgingDate = new Date(genDateParts[0], genDateParts[1] - 1, genDateParts[2]);
        }

        cobrancaFilteredData = [...COBRANCA_DATA];
        populateCobrancaFilters();
        initCobrancaEventListeners();
        applyCobrancaFilters();
        cobrancaDataLoaded = true;
    } catch (err) {
        console.error("Erro fatal ao inicializar Cobrança:", err);
    }
}

// Registrar Listeners
function initCobrancaEventListeners() {
    // Busca
    const searchEl = document.getElementById('cobranca-search');
    if (searchEl) {
        searchEl.addEventListener('input', () => {
            cobrancaSearchQuery = searchEl.value;
            cobrancaCurrentPage = 1;
            renderCobrancaTable();
        });
    }

    // Tema
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            setTimeout(() => {
                if (cobrancaActiveTab === 'indicators') {
                    renderCobrancaCharts();
                }
            }, 200);
        });
    }
}

// Alternar Abas (Indicadores / Relatório)
function switchCobrancaTab(tab) {
    cobrancaActiveTab = tab;

    // Toggle active buttons
    document.getElementById('cobranca-tab-btn-indicators').classList.toggle('active', tab === 'indicators');
    document.getElementById('cobranca-tab-btn-report').classList.toggle('active', tab === 'report');

    // Toggle active views
    document.getElementById('subview-cobranca-indicators').classList.toggle('active', tab === 'indicators');
    document.getElementById('subview-cobranca-report').classList.toggle('active', tab === 'report');

    if (tab === 'indicators') {
        // Redimensionar e renderizar os gráficos
        renderCobrancaCharts();
    } else {
        renderCobrancaTable();
    }
}

// ── Filtros ─────────────────────────────────────────────────────────────────
function populateCobrancaFilters() {
    try {
        const catSelect = document.getElementById('cobranca-filter-categoria');
        const projSelect = document.getElementById('cobranca-filter-projeto');

        // Extrair valores únicos
        const uniqueCats = [...new Set(COBRANCA_DATA.map(r => r.categoria).filter(Boolean))].sort();
        const uniqueProjs = [...new Set(COBRANCA_DATA.map(r => r.projeto).filter(Boolean))].sort();

        if (catSelect) {
            catSelect.innerHTML = '<option value="">Todas as Categorias</option>';
            uniqueCats.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                catSelect.appendChild(opt);
            });
        }

        if (projSelect) {
            projSelect.innerHTML = '<option value="">Todos os Projetos</option>';
            uniqueProjs.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                projSelect.appendChild(opt);
            });
        }
    } catch (err) {
        console.error("Erro ao popular filtros:", err);
    }
}

// Aplicar Filtros Gerais
function applyCobrancaFilters() {
    try {
        const catDropdown = document.getElementById('cobranca-filter-categoria')?.value || '';
        const ufDropdown = document.getElementById('cobranca-filter-uf')?.value || '';
        const projDropdown = document.getElementById('cobranca-filter-projeto')?.value || '';
        const faseDropdown = document.getElementById('cobranca-filter-fase')?.value || '';
        const dtInicio = document.getElementById('cobranca-filter-data-inicio')?.value || '';
        const dtFim = document.getElementById('cobranca-filter-data-fim')?.value || '';

        cobrancaFilteredData = COBRANCA_DATA.filter(r => {
            // Dropdowns
            if (catDropdown && r.categoria !== catDropdown) return false;
            if (ufDropdown && r.uf !== ufDropdown) return false;
            if (projDropdown && r.projeto !== projDropdown) return false;
            if (faseDropdown && r.fase_atual_de_para !== faseDropdown) return false;

            // Filtros de Data Cadastro Medição
            if (dtInicio && r.data_cadastro < dtInicio) return false;
            if (dtFim && r.data_cadastro > dtFim) return false;

            // Filtros por Clique
            return true;
        });

        // Resetar paginação
        cobrancaCurrentPage = 1;

        // Atualizar elementos da tela de Indicadores
        if (cobrancaActiveTab === 'indicators') {
            renderCobrancaKPIs();
            renderCobrancaCharts();
        } else {
            renderCobrancaTable();
        }
    } catch (err) {
        console.error("Erro ao aplicar filtros:", err);
    }
}

// Limpar Filtros
function clearCobrancaFilters() {
    // Limpar inputs
    ['cobranca-filter-categoria', 'cobranca-filter-uf', 'cobranca-filter-projeto', 'cobranca-filter-fase', 'cobranca-filter-data-inicio', 'cobranca-filter-data-fim'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const searchEl = document.getElementById('cobranca-search');
    if (searchEl) searchEl.value = '';
    cobrancaSearchQuery = '';

    // Limpar filtros por clique
    applyCobrancaFilters();
}

// Limpar apenas o intervalo de datas
function resetCobrancaDateFilter() {
    const d1 = document.getElementById('cobranca-filter-data-inicio');
    const d2 = document.getElementById('cobranca-filter-data-fim');
    if (d1) d1.value = '';
    if (d2) d2.value = '';
    applyCobrancaFilters();
}

// Auxiliar para calcular a idade de uma OS sem aprovação
function calculateOSAge(dateStr) {
    if (!dateStr || dateStr === '-') return -1;
    try {
        const parts = dateStr.split('-');
        if (parts.length !== 3) return -1;
        const cadDate = new Date(parts[0], parts[1] - 1, parts[2]);
        const diff = baseAgingDate - cadDate;
        return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    } catch {
        return -1;
    }
}

// Helper para formatação de moeda
function formatCobrancaCurrency(val) {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Helper para abreviar valores monetários (K e M)
function formatCobrancaShortVal(val) {
    const a = Math.abs(val);
    if (a >= 1000000) return (val / 1000000).toFixed(1).replace('.', ',') + 'M';
    if (a >= 1000) return (val / 1000).toFixed(0) + 'k';
    return val.toFixed(0);
}

// Obter variáveis de cores do tema para eixos/gráficos
function getCobrancaThemeVars() {
    const isLight = document.body.classList.contains('light-theme');
    return {
        textColor:     isLight ? '#637381' : '#8a99a8',
        gridColor:     isLight ? '#e2e8f0' : '#20313f',
        tooltipBg:     isLight ? '#ffffff' : '#111c24',
        tooltipText:   isLight ? '#1f2c3d' : '#f5f6f8',
        tooltipBorder: isLight ? '#e0e6ed' : '#20313f'
    };
}

// ── Renderização dos KPIs e Layout de Indicadores ───────────────────────────
function renderCobrancaKPIs() {
    renderCategoryCards();
    renderPipelineStepper();
    renderCobrancaUFMap();
    renderOpenOSsList();
}

// 1. Cards de Categoria (Coluna B) no topo
function renderCategoryCards() {
    const container = document.getElementById('cobranca-category-cards-container');
    if (!container) return;

    // Calcular valores por categoria
    const categorySums = {};
    const categoryOSs = {}; // Armazenar Set de OSs únicas por categoria
    
    // Inicializar a partir dos dados atuais sem filtros por clique de categoria
    const baseDataForCategoryKPI = COBRANCA_DATA.filter(r => {
        const ufDropdown = document.getElementById('cobranca-filter-uf')?.value || '';
        const projDropdown = document.getElementById('cobranca-filter-projeto')?.value || '';
        const faseDropdown = document.getElementById('cobranca-filter-fase')?.value || '';
        const dtInicio = document.getElementById('cobranca-filter-data-inicio')?.value || '';
        const dtFim = document.getElementById('cobranca-filter-data-fim')?.value || '';

        if (ufDropdown && r.uf !== ufDropdown) return false;
        if (projDropdown && r.projeto !== projDropdown) return false;
        if (faseDropdown && r.fase_atual_de_para !== faseDropdown) return false;
        if (dtInicio && r.data_cadastro < dtInicio) return false;
        if (dtFim && r.data_cadastro > dtFim) return false;

        return true;
    });

    baseDataForCategoryKPI.forEach(r => {
        const cat = r.categoria || 'OUTROS';
        categorySums[cat] = (categorySums[cat] || 0) + (r.valor_total || 0);
        if (!categoryOSs[cat]) {
            categoryOSs[cat] = new Set();
        }
        if (r.os) {
            categoryOSs[cat].add(r.os);
        }
    });

    // Calcular faturamento total das categorias filtradas para o percentual
    const totalFaturamento = Object.values(categorySums).reduce((acc, val) => acc + val, 0);

    // Calcular meses únicos no período selecionado para a média mensal
    const uniqueMonths = new Set();
    baseDataForCategoryKPI.forEach(r => {
        if (r.mes_medicao && r.mes_medicao !== 'N/D') {
            uniqueMonths.add(r.mes_medicao);
        }
    });
    const monthsCount = Math.max(1, uniqueMonths.size);

    // Ordenar categorias por valor total decrescente
    const sortedCats = Object.keys(categorySums).sort((a, b) => categorySums[b] - categorySums[a]);

    const categoryIcons = {
        'RECUPERAÇÃO REDE': 'fa-solid fa-wrench',
        'PLANTA EXTERNA': 'fa-solid fa-network-wired',
        'FIXO MENSAL': 'fa-solid fa-calendar-check',
        'DESATIVAÇÃO': 'fa-solid fa-ban',
        'CONSTRUÇÃO': 'fa-solid fa-helmet-safety',
        'ATIVAÇÃO': 'fa-solid fa-toggle-on',
        'OUTROS': 'fa-solid fa-folder-open'
    };

    container.innerHTML = '';
    sortedCats.forEach(cat => {
        const sum = categorySums[cat];
        const count = categoryOSs[cat] ? categoryOSs[cat].size : 0; // Contagem distinta de OS
        const pct = totalFaturamento > 0 ? (sum / totalFaturamento) * 100 : 0;
        const avgMonthly = sum / monthsCount;
        
        const activeCat = document.getElementById('cobranca-filter-categoria')?.value || '';
        const card = document.createElement('div');
        card.className = `cobranca-category-card${activeCat === cat ? ' active' : ''}`;
        card.onclick = () => {
            const select = document.getElementById('cobranca-filter-categoria');
            if (select) {
                select.value = (select.value === cat) ? '' : cat;
                applyCobrancaFilters();
            }
        };

        const iconClass = categoryIcons[cat.toUpperCase().trim()] || 'fa-solid fa-chart-simple';

        card.innerHTML = `
            <div class="kpi-info" style="flex-grow: 1;">
                <span class="cobranca-category-title" title="${cat}">${cat}</span>
                <span class="cobranca-category-value">${formatCobrancaCurrency(sum)}</span>
                <div style="display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--text-secondary); margin-top: 6px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span>${count.toLocaleString('pt-BR')} OSs</span>
                        <span style="font-weight: 700; color: var(--color-primary-light);">(${pct.toFixed(1).replace('.', ',')}%)</span>
                    </div>
                    <div style="font-size: 10px; opacity: 0.85; border-top: 1px dashed var(--border-color); padding-top: 4px; margin-top: 4px;">
                        Média Mensal: <strong style="color: var(--text-primary);">${formatCobrancaCurrency(avgMonthly)}</strong>
                    </div>
                </div>
            </div>
            <div class="kpi-icon-container" style="opacity: 0.15; transition: all 0.2s ease;">
                <i class="${iconClass}"></i>
            </div>
        `;
        container.appendChild(card);
    });
}

// 2. Fluxo de Fases Stepper (Coluna CB)
function renderPipelineStepper() {
    const container = document.getElementById('cobranca-pipeline-container');
    if (!container) return;

    // Fases em sequência lógica
    const pipelineSequence = ['EM EXECUÇÃO', 'EXECUTADO', 'APROVADO', 'PEDIDO EMITIDO'];
    
    // Obter dados básicos sem o filtro de fase para cliques
    const baseDataForPipeline = COBRANCA_DATA.filter(r => {
        const catDropdown = document.getElementById('cobranca-filter-categoria')?.value || '';
        const ufDropdown = document.getElementById('cobranca-filter-uf')?.value || '';
        const projDropdown = document.getElementById('cobranca-filter-projeto')?.value || '';
        const dtInicio = document.getElementById('cobranca-filter-data-inicio')?.value || '';
        const dtFim = document.getElementById('cobranca-filter-data-fim')?.value || '';

        if (catDropdown && r.categoria !== catDropdown) return false;
        if (ufDropdown && r.uf !== ufDropdown) return false;
        if (projDropdown && r.projeto !== projDropdown) return false;
        if (dtInicio && r.data_cadastro < dtInicio) return false;
        if (dtFim && r.data_cadastro > dtFim) return false;

        return true;
    });

    const phaseMetrics = {
        'EM EXECUÇÃO': { sum: 0, oss: new Set(), cssClass: 'em-execucao' },
        'EXECUTADO': { sum: 0, oss: new Set(), cssClass: 'executado' },
        'APROVADO': { sum: 0, oss: new Set(), cssClass: 'aprovado' },
        'PEDIDO EMITIDO': { sum: 0, oss: new Set(), cssClass: 'ped-emitido' }
    };

    baseDataForPipeline.forEach(r => {
        const p = String(r.fase_atual_de_para).toUpperCase().trim();
        if (phaseMetrics.hasOwnProperty(p)) {
            phaseMetrics[p].sum += (r.valor_total || 0);
            if (r.os) {
                phaseMetrics[p].oss.add(r.os);
            }
        }
    });

    container.innerHTML = '';

    // Adicionar os cards de faturamento por fase (estilo KPI)
    pipelineSequence.forEach(phase => {
        const m = phaseMetrics[phase];
        const activePhase = document.getElementById('cobranca-filter-fase')?.value || '';
        const card = document.createElement('div');
        card.className = `kpi-card ${m.cssClass}${activePhase === phase ? ' active' : ''}`;
        card.onclick = () => {
            const select = document.getElementById('cobranca-filter-fase');
            if (select) {
                select.value = (select.value === phase) ? '' : phase;
                applyCobrancaFilters();
            }
        };

        // Formatar rótulo para exibição elegante
        const label = phase.charAt(0) + phase.slice(1).toLowerCase();
        const count = m.oss.size; // Contagem distinta de OS

        let iconHtml = '';
        if (phase === 'EM EXECUÇÃO') {
            iconHtml = '<i class="fa-solid fa-gears"></i>';
        } else if (phase === 'EXECUTADO') {
            iconHtml = '<i class="fa-solid fa-square-check"></i>';
        } else if (phase === 'APROVADO') {
            iconHtml = '<i class="fa-solid fa-circle-check"></i>';
        } else if (phase === 'PEDIDO EMITIDO') {
            iconHtml = '<i class="fa-solid fa-file-invoice-dollar"></i>';
        }

        card.innerHTML = `
            <div class="kpi-info" style="flex-grow: 1;">
                <span class="kpi-label">${label}</span>
                <h3 class="kpi-value" style="font-size: 24px; font-weight: 800; font-family: 'Outfit', sans-serif;">${formatCobrancaCurrency(m.sum)}</h3>
                <div class="kpi-analytics">
                    <span class="kpi-subvalue" style="font-size: 11px; color: var(--text-secondary);">${count.toLocaleString('pt-BR')} OSs</span>
                </div>
            </div>
            <div class="kpi-icon-container" style="opacity: 0.15; transition: all 0.2s ease;">
                ${iconHtml}
            </div>
        `;
        container.appendChild(card);
    });
}

// 3. Mapa de UFs (Cor choropleth por valor de cobrança total)
function renderCobrancaUFMap() {
    const container = document.getElementById('cobranca-uf-map-container');
    if (!container) return;

    // Calcular valores por UF
    const ufSums = { 'RS': 0, 'SC': 0, 'PR': 0 };
    const ufOSs = { 'RS': new Set(), 'SC': new Set(), 'PR': new Set() };

    // Obter dados sem o filtro de clique de UF
    const baseDataForUFMap = COBRANCA_DATA.filter(r => {
        const catDropdown = document.getElementById('cobranca-filter-categoria')?.value || '';
        const projDropdown = document.getElementById('cobranca-filter-projeto')?.value || '';
        const faseDropdown = document.getElementById('cobranca-filter-fase')?.value || '';
        const dtInicio = document.getElementById('cobranca-filter-data-inicio')?.value || '';
        const dtFim = document.getElementById('cobranca-filter-data-fim')?.value || '';

        if (catDropdown && r.categoria !== catDropdown) return false;
        if (projDropdown && r.projeto !== projDropdown) return false;
        if (faseDropdown && r.fase_atual_de_para !== faseDropdown) return false;
        if (dtInicio && r.data_cadastro < dtInicio) return false;
        if (dtFim && r.data_cadastro > dtFim) return false;

        return true;
    });

    baseDataForUFMap.forEach(r => {
        const uf = String(r.uf).toUpperCase().trim();
        if (ufSums.hasOwnProperty(uf)) {
            ufSums[uf] += (r.valor_total || 0);
            if (r.os && r.os !== '-') {
                ufOSs[uf].add(r.os);
            }
        }
    });

    const maxVal = Math.max(ufSums['RS'], ufSums['SC'], ufSums['PR'], 1);
    const totalFaturamento = ufSums['PR'] + ufSums['SC'] + ufSums['RS'];

    const getColorForUF = (uf) => {
        const vol = ufSums[uf];
        const opacity = 0.15 + 0.75 * (vol / maxVal);
        return `rgba(0, 79, 113, ${opacity})`;
    };

    const activeUF = document.getElementById('cobranca-filter-uf')?.value || '';
    const isSelectPR = activeUF === 'PR' ? 'active' : (activeUF ? 'dimmed' : '');
    const isSelectSC = activeUF === 'SC' ? 'active' : (activeUF ? 'dimmed' : '');
    const isSelectRS = activeUF === 'RS' ? 'active' : (activeUF ? 'dimmed' : '');

    const prPct = totalFaturamento > 0 ? ((ufSums['PR'] / totalFaturamento) * 100).toFixed(1).replace('.', ',') : '0,0';
    const scPct = totalFaturamento > 0 ? ((ufSums['SC'] / totalFaturamento) * 100).toFixed(1).replace('.', ',') : '0,0';
    const rsPct = totalFaturamento > 0 ? ((ufSums['RS'] / totalFaturamento) * 100).toFixed(1).replace('.', ',') : '0,0';

    container.innerHTML = `
        <div class="uf-premium-container">
            <!-- LEFT COLUMN: GEOGRAPHIC REGION MAP -->
            <div class="uf-map-side">
                <svg class="map-svg-centered" viewBox="125 242 136 136" style="overflow: visible;">
                    <!-- PARANÁ POLYGON -->
                    <polygon class="map-state ${isSelectPR}" id="cobranca-state-PR" points="
                        234.456,277.734 235.218,274.689 232.173,276.213 229.318,273.357 228.368,269.744 224.942,269.172 221.898,269.363
                        220.375,266.127 220.757,263.463 220.945,258.326 218.663,256.424 212.384,257.186 207.056,254.33 203.061,254.33 202.109,254.33
                        201.158,252.809 199.635,253.189 196.591,253.949 193.356,254.141 190.407,253.475 186.887,256.709 185.364,259.564
                        184.604,263.369 183.556,265.082 180.196,265.885 177.763,274.082 177.664,278.756 176.28,281.801 182.956,283.033
                        184.454,288.203 183.603,290.621 186.648,288.984 189.502,290.197 192.356,289.484 193.927,291.41 196.425,291.34
                        199.706,292.695 204.844,293.695 206.058,292.98 205.985,291.197 207.199,289.414 212.052,286.273 214.478,286.844
                        217.401,286.346 220.686,288.344 224.823,285.988 228.248,287.129 230.233,287.793 230.184,284.873 229.085,284.475
                        230.033,284.375 231.132,282.336 232.28,281.49 231.682,281.291 231.082,281.49 231.032,280.943 229.585,281.043 229.085,281.143
                        229.385,280.695 228.485,279.9 229.934,280.396 230.482,280.098 230.932,279.6 231.381,278.807 231.932,279.004
                        232.33,278.705 232.28,279.502 232.879,279.9 233.478,279.451 233.777,279.65 233.029,280.297 233.129,281.143 233.528,281.094
                        234.377,279.65 236.125,278.635" 
                        style="fill: ${getColorForUF('PR')};" 
                        onmouseenter="handleCobrancaMapHover(event, 'PR')" 
                        onmousemove="handleCobrancaMapMove(event)" 
                        onmouseleave="handleCobrancaMapLeave()"
                        onclick="toggleCobrancaUFFromMap('PR')">
                    </polygon>
                    <text class="map-label ${isSelectPR}" x="205" y="272" style="font-size: 3.5px;" onclick="toggleCobrancaUFFromMap('PR')">PR</text>

                    <!-- SANTA CATARINA POLYGON -->
                    <polygon class="map-state ${isSelectSC}" id="cobranca-state-SC" points="
                        224.823,285.988 220.686,288.344 217.401,286.346 214.478,286.844 212.052,286.273 207.199,289.414 205.985,291.197
                        206.058,292.98 204.844,293.695 199.706,292.695 196.425,291.34 193.927,291.41 192.356,289.484 189.502,290.197 186.648,288.984
                        183.603,290.621 185.153,294.27 183.62,298.275 185.364,298.57 188.98,298.191 192.976,298.191 196.211,298.762 198.873,300.379
                        201.348,301.615 205.153,302.566 207.342,303.613 209.054,306.941 211.053,310.463 213.052,312.271 214.478,312.271
                        216.569,311.32 218.378,310.844 219.71,311.795 219.899,313.508 217.235,316.076 214.667,320.357 215.714,320.738 217.33,319.502
                        218.663,320.547 226.838,312.867 227.688,313.016 228.336,312.471 227.937,311.176 228.186,310.182 229.285,309.934
                        229.435,308.641 229.885,308.59 229.535,310.133 229.834,309.982 230.282,307.746 230.333,305.807 230.184,305.605
                        230.433,304.465 229.834,302.873 230.033,301.68 230.433,301.23 229.834,300.834 229.885,300.039 230.732,299.691
                        230.832,299.393 230.533,298.893 231.432,298.348 231.932,298.646 232.33,298.1 231.381,297.203 231.032,297.75 230.533,297.551
                        230.732,296.756 230.184,296.707 230.033,295.762 230.533,294.867 229.783,294.619 229.634,292.777 230.083,290.689
                        229.285,289.496 228.535,289.695 227.786,289.545 228.685,288.998 227.837,287.955 229.034,288.75 230.233,287.793
                        228.248,287.129" 
                        style="fill: ${getColorForUF('SC')};" 
                        onmouseenter="handleCobrancaMapHover(event, 'SC')" 
                        onmousemove="handleCobrancaMapMove(event)" 
                        onmouseleave="handleCobrancaMapLeave()"
                        onclick="toggleCobrancaUFFromMap('SC')">
                    </polygon>
                    <text class="map-label ${isSelectSC}" x="215" y="298" style="font-size: 3.5px;" onclick="toggleCobrancaUFFromMap('SC')">SC</text>

                    <!-- RIO GRANDE DO SUL POLYGON -->
                    <polygon class="map-state ${isSelectRS}" id="cobranca-state-RS" points="
                        215.714,320.738 214.667,320.357 217.235,316.076 219.899,313.508 219.71,311.795 218.378,310.844 216.569,311.32
                        214.478,312.271 213.052,312.271 211.053,310.463 209.054,306.941 207.342,303.613 205.153,302.566 201.348,301.615
                        198.873,300.379 196.211,298.762 192.976,298.191 188.98,298.191 185.364,298.57 183.62,298.275 171.023,304.363 165.032,310.133
                        159.191,319.432 151.903,325.398 150.604,328.383 155.53,328.646 158.924,331.697 161.122,332.293 161.988,334.215
                        163.452,335.875 163.384,336.668 164.583,337.729 165.981,336.934 166.381,335.875 168.843,335.807 171.04,338.459
                        180.825,347.012 183.354,347.674 189.013,354.637 186.883,359.477 187.082,362.857 185.951,366.57 186.449,367.764
                        187.647,364.881 192.641,360.205 195.536,356.029 197.033,350.758 200.129,348.77 199.829,348.371 198.532,348.869
                        198.432,347.773 199.629,347.477 197.934,346.879 198.232,346.082 199.23,345.984 199.829,344.988 200.129,342.803
                        201.527,341.707 202.725,341.906 203.125,340.613 203.724,340.912 203.923,338.027 205.021,336.535 205.121,337.631
                        205.722,335.74 206.818,334.547 206.818,333.752 205.121,333.156 205.021,332.559 205.621,331.762 206.021,332.758
                        207.019,333.254 208.616,333.156 209.614,331.861 211.612,331.166 212.012,333.254 211.312,333.553 211.212,332.857
                        210.612,332.758 210.812,336.535 209.314,337.232 209.216,338.027 208.117,338.525 207.917,341.111 206.52,342.305
                        205.321,342.404 203.623,345.189 202.825,345.189 202.226,346.184 200.629,345.785 200.329,346.283 201.028,347.277
                        200.43,348.172 200.828,348.57 201.327,347.477 204.822,345.389 211.312,338.824 211.312,338.824 216.604,326.889 218.351,320.922
                        218.663,320.547 217.33,319.502" 
                        style="fill: ${getColorForUF('RS')};" 
                        onmouseenter="handleCobrancaMapHover(event, 'RS')" 
                        onmousemove="handleCobrancaMapMove(event)" 
                        onmouseleave="handleCobrancaMapLeave()"
                        onclick="toggleCobrancaUFFromMap('RS')">
                    </polygon>
                    <text class="map-label ${isSelectRS}" x="186" y="335" style="font-size: 3.5px;" onclick="toggleCobrancaUFFromMap('RS')">RS</text>
                </svg>
            </div>

            <!-- PARANÁ CAPSULE -->
            <div class="uf-compact-card pr-card ${isSelectPR}" id="cobranca-card-UF-PR" onclick="toggleCobrancaUFFromMap('PR')" onmouseenter="handleCobrancaCardHover('PR')" onmouseleave="handleCobrancaCardLeave('PR')">
                <div class="uf-compact-header">
                    <span class="uf-compact-name">
                        <span class="uf-status-indicator pr-dot"></span>
                        <strong>Paraná</strong>
                    </span>
                </div>
                <div class="uf-compact-content">
                    <div class="uf-compact-main-stat">
                        <span class="uf-stat-label"><i class="fa-solid fa-file-invoice"></i> OSs</span>
                        <span class="uf-stat-value">${ufOSs['PR'].size.toLocaleString('pt-BR')}</span>
                    </div>
                    <div class="uf-compact-sub-stats" style="margin-top:4px;">
                        <div class="uf-sub-stat success">
                            <span class="uf-sub-val success" style="color: var(--color-primary-light); font-weight:700;">${formatCobrancaCurrency(ufSums['PR'])}</span>
                        </div>
                        <div class="uf-sub-stat">
                            <span class="uf-sub-label" style="color:var(--text-secondary); font-size:10px;"><i class="fa-solid fa-percent"></i></span>
                            <span class="uf-sub-val" style="color:var(--text-secondary); font-size:10px;">${prPct}%</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- SANTA CATARINA CAPSULE -->
            <div class="uf-compact-card sc-card ${isSelectSC}" id="cobranca-card-UF-SC" onclick="toggleCobrancaUFFromMap('SC')" onmouseenter="handleCobrancaCardHover('SC')" onmouseleave="handleCobrancaCardLeave('SC')">
                <div class="uf-compact-header">
                    <span class="uf-compact-name">
                        <span class="uf-status-indicator sc-dot"></span>
                        <strong>Santa Catarina</strong>
                    </span>
                </div>
                <div class="uf-compact-content">
                    <div class="uf-compact-main-stat">
                        <span class="uf-stat-label"><i class="fa-solid fa-file-invoice"></i> OSs</span>
                        <span class="uf-stat-value">${ufOSs['SC'].size.toLocaleString('pt-BR')}</span>
                    </div>
                    <div class="uf-compact-sub-stats" style="margin-top:4px;">
                        <div class="uf-sub-stat success">
                            <span class="uf-sub-val success" style="color: var(--color-primary-light); font-weight:700;">${formatCobrancaCurrency(ufSums['SC'])}</span>
                        </div>
                        <div class="uf-sub-stat">
                            <span class="uf-sub-label" style="color:var(--text-secondary); font-size:10px;"><i class="fa-solid fa-percent"></i></span>
                            <span class="uf-sub-val" style="color:var(--text-secondary); font-size:10px;">${scPct}%</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- RIO GRANDE DO SUL CAPSULE -->
            <div class="uf-compact-card rs-card ${isSelectRS}" id="cobranca-card-UF-RS" onclick="toggleCobrancaUFFromMap('RS')" onmouseenter="handleCobrancaCardHover('RS')" onmouseleave="handleCobrancaCardLeave('RS')">
                <div class="uf-compact-header">
                    <span class="uf-compact-name">
                        <span class="uf-status-indicator rs-dot"></span>
                        <strong>Rio Grande do Sul</strong>
                    </span>
                </div>
                <div class="uf-compact-content">
                    <div class="uf-compact-main-stat">
                        <span class="uf-stat-label"><i class="fa-solid fa-file-invoice"></i> OSs</span>
                        <span class="uf-stat-value">${ufOSs['RS'].size.toLocaleString('pt-BR')}</span>
                    </div>
                    <div class="uf-compact-sub-stats" style="margin-top:4px;">
                        <div class="uf-sub-stat success">
                            <span class="uf-sub-val success" style="color: var(--color-primary-light); font-weight:700;">${formatCobrancaCurrency(ufSums['RS'])}</span>
                        </div>
                        <div class="uf-sub-stat">
                            <span class="uf-sub-label" style="color:var(--text-secondary); font-size:10px;"><i class="fa-solid fa-percent"></i></span>
                            <span class="uf-sub-val" style="color:var(--text-secondary); font-size:10px;">${rsPct}%</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Legenda de volume -->
            <div class="uf-discreet-legend">
                <span style="font-size:9px;opacity:0.8;margin-right:4px;">Menor Cobrança</span>
                <div class="legend-gradient-bar"></div>
                <span style="font-size:9px;opacity:0.8;margin-left:4px;">Maior Cobrança</span>
            </div>

            <!-- TOOLTIP DO MAPA -->
            <div class="map-tooltip" id="cobranca-map-tooltip" style="display: none;"></div>
        </div>
    `;

    // Métodos de interação para hover e clique no mapa
    window.handleCobrancaCardHover = (ufCode) => {
        const polygon = document.getElementById('cobranca-state-' + ufCode);
        if (polygon) polygon.classList.add('hovered');
    };

    window.handleCobrancaCardLeave = (ufCode) => {
        const polygon = document.getElementById('cobranca-state-' + ufCode);
        if (polygon) polygon.classList.remove('hovered');
    };

    window.handleCobrancaMapHover = (e, ufCode) => {
        const card = document.getElementById('cobranca-card-UF-' + ufCode);
        if (card) card.classList.add('hovered');

        const tooltip = document.getElementById('cobranca-map-tooltip');
        if (tooltip) {
            tooltip.style.display = 'block';
            tooltip.innerHTML = `
                <strong>${ufCode === 'RS' ? 'Rio Grande do Sul' : ufCode === 'SC' ? 'Santa Catarina' : 'Paraná'}</strong><br/>
                Cobrança: ${formatCobrancaCurrency(ufSums[ufCode])}<br/>
                OSs: ${ufOSs[ufCode].size.toLocaleString('pt-BR')}
            `;
        }
    };

    window.handleCobrancaMapMove = (e) => {
        const tooltip = document.getElementById('cobranca-map-tooltip');
        if (tooltip) {
            // Posicionar o tooltip próximo ao cursor
            tooltip.style.left = (e.pageX + 15) + 'px';
            tooltip.style.top = (e.pageY + 15) + 'px';
        }
    };

    window.handleCobrancaMapLeave = () => {
        ['RS', 'SC', 'PR'].forEach(ufCode => {
            const card = document.getElementById('cobranca-card-UF-' + ufCode);
            if (card) card.classList.remove('hovered');
        });

        const tooltip = document.getElementById('cobranca-map-tooltip');
        if (tooltip) tooltip.style.display = 'none';
    };

    window.toggleCobrancaUFFromMap = (ufCode) => {
        const select = document.getElementById('cobranca-filter-uf');
        if (select) {
            select.value = (select.value === ufCode) ? '' : ufCode;
            applyCobrancaFilters();
        }
    };
}

// 4. Lista de OSs sem aprovação
// Alterna o modo de visualização da lista de OS
function switchOSListMode(mode) {
    osListMode = mode;
    // Atualizar botões de toggle
    document.querySelectorAll('.os-list-toggle-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(mode === 'sem-aprovacao' ? 'btn-os-sem-aprovacao' : 'btn-os-aprovadas');
    if (activeBtn) activeBtn.classList.add('active');
    renderOpenOSsList();
}

function renderOpenOSsList() {
    const tbody = document.getElementById('cobranca-open-oss-list-tbody');
    const thead = document.getElementById('cobranca-os-list-thead');
    const titleEl = document.getElementById('cobranca-os-list-title');
    if (!tbody) return;

    const fmtDate = dStr => {
        if (!dStr || dStr === '-') return '-';
        const p = dStr.split('-');
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : dStr;
    };

    if (osListMode === 'aprovadas') {
        // ── Modo: Aprovadas Aguardando Pedido ───────────────────────────────
        if (titleEl) titleEl.textContent = 'OSs Aprovadas — Aguardando Pedido';
        if (thead) thead.innerHTML = `
            <tr style="position: sticky; top: 0; background: var(--bg-card); border-bottom: 2px solid var(--border-color); z-index: 10;">
                <th style="padding: 10px 8px; text-align: left;">OS</th>
                <th style="padding: 10px 8px; text-align: left;">Categoria</th>
                <th style="padding: 10px 8px; text-align: left;">Aprovação</th>
                <th style="padding: 10px 8px; text-align: center;">Dias Aguard.</th>
                <th style="padding: 10px 8px; text-align: left;">Fase Atual (Original)</th>
                <th style="padding: 10px 8px; text-align: left;">Fase (De/Para)</th>
                <th style="padding: 10px 8px; text-align: right;">Valor</th>
            </tr>`;

        // Filtrar aprovadas sem pedido emitido
        const approvedOSs = cobrancaFilteredData.filter(r => {
            const fase = String(r.fase_atual_de_para || '').toUpperCase().trim();
            return fase === 'APROVADO' && r.os && r.os !== '-';
        });

        const osMap = {};
        approvedOSs.forEach(r => {
            const osNum = r.os;
            if (!osMap[osNum]) {
                osMap[osNum] = {
                    os: osNum,
                    categoria: r.categoria || '-',
                    fase_atual: r.fase_atual || '-',
                    fase_atual_de_para: r.fase_atual_de_para || '-',
                    data_aprovacao: r.data_aprovacao || '-',
                    valor: 0,
                    diasAguard: calculateOSAge(r.data_aprovacao)
                };
            }
            osMap[osNum].valor += (r.valor_total || 0);
            // Manter a data de aprovação mais antiga
            if (r.data_aprovacao && r.data_aprovacao !== '-' &&
                (!osMap[osNum].data_aprovacao || osMap[osNum].data_aprovacao === '-' ||
                 r.data_aprovacao < osMap[osNum].data_aprovacao)) {
                osMap[osNum].data_aprovacao = r.data_aprovacao;
                osMap[osNum].diasAguard = calculateOSAge(r.data_aprovacao);
            }
        });

        // Ordenar da aprovação mais antiga para a mais recente
        const sorted = Object.values(osMap).sort((a, b) => {
            if (!a.data_aprovacao || a.data_aprovacao === '-') return 1;
            if (!b.data_aprovacao || b.data_aprovacao === '-') return -1;
            return a.data_aprovacao.localeCompare(b.data_aprovacao);
        });

        tbody.innerHTML = '';
        if (sorted.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--text-secondary);">Nenhuma OS aprovada aguardando pedido</td></tr>`;
            return;
        }

        sorted.forEach(o => {
            const tr = document.createElement('tr');
            let agingClass = 'alert-none';
            if (o.diasAguard > 30) agingClass = 'alert-high';
            else if (o.diasAguard > 15) agingClass = 'alert-medium';
            else if (o.diasAguard > 7) agingClass = 'alert-low';
            const badgeClass = getCobrancaBadgeClass(o.fase_atual_de_para);
            tr.innerHTML = `
                <td style="padding: 8px; border-bottom: 1px solid var(--border-color);"><strong>${o.os}</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary);">${o.categoria}</td>
                <td style="padding: 8px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary);">${fmtDate(o.data_aprovacao)}</td>
                <td style="padding: 8px; border-bottom: 1px solid var(--border-color); text-align: center;">
                    <span class="badge-aging ${agingClass}">${o.diasAguard >= 0 ? o.diasAguard + 'd' : '-'}</span>
                </td>
                <td style="padding: 8px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary);">${o.fase_atual}</td>
                <td style="padding: 8px; border-bottom: 1px solid var(--border-color);">
                    <span class="cobranca-badge ${badgeClass}" style="padding: 2px 6px; font-size: 9px;">${o.fase_atual_de_para}</span>
                </td>
                <td style="padding: 8px; border-bottom: 1px solid var(--border-color); text-align: right; font-weight: 700; color: #27ae60;">
                    ${formatCobrancaCurrency(o.valor)}
                </td>
            `;
            tbody.appendChild(tr);
        });

    } else {
        // ── Modo: Sem Aprovação (padrão) ────────────────────────────────────
        if (titleEl) titleEl.textContent = 'OSs Sem Aprovação (Aging)';
        if (thead) thead.innerHTML = `
            <tr style="position: sticky; top: 0; background: var(--bg-card); border-bottom: 2px solid var(--border-color); z-index: 10;">
                <th style="padding: 10px 8px; text-align: left;">OS</th>
                <th style="padding: 10px 8px; text-align: left;">Categoria</th>
                <th style="padding: 10px 8px; text-align: left;">Cadastro</th>
                <th style="padding: 10px 8px; text-align: center;">Aging</th>
                <th style="padding: 10px 8px; text-align: left;">Fase Atual (Original)</th>
                <th style="padding: 10px 8px; text-align: left;">Fase (De/Para)</th>
                <th style="padding: 10px 8px; text-align: right;">Valor</th>
            </tr>`;

        const openOSs = cobrancaFilteredData.filter(r => {
            const isOpen = (r.tempo_aprovacao === null || r.tempo_aprovacao === undefined || !r.data_aprovacao || r.data_aprovacao === '-');
            return isOpen && r.os && r.os !== '-';
        });

        const osMap = {};
        openOSs.forEach(r => {
            const osNum = r.os;
            if (!osMap[osNum]) {
                osMap[osNum] = {
                    os: osNum,
                    categoria: r.categoria || '-',
                    projeto: r.projeto || '-',
                    fase_atual: r.fase_atual || '-',
                    fase_atual_de_para: r.fase_atual_de_para || '-',
                    data_cadastro: r.data_cadastro,
                    valor: 0,
                    aging: calculateOSAge(r.data_cadastro)
                };
            }
            osMap[osNum].valor += (r.valor_total || 0);
            if (r.data_cadastro && (!osMap[osNum].data_cadastro || r.data_cadastro < osMap[osNum].data_cadastro)) {
                osMap[osNum].data_cadastro = r.data_cadastro;
                osMap[osNum].aging = calculateOSAge(r.data_cadastro);
            }
        });

        const sortedOpenOSs = Object.values(osMap).sort((a, b) => {
            if (!a.data_cadastro) return 1;
            if (!b.data_cadastro) return -1;
            return a.data_cadastro.localeCompare(b.data_cadastro);
        });

        tbody.innerHTML = '';
        if (sortedOpenOSs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--text-secondary);">Nenhuma OS sem aprovação encontrada</td></tr>`;
            return;
        }

        sortedOpenOSs.forEach(o => {
            const tr = document.createElement('tr');
            let agingClass = 'alert-none';
            if (o.aging > 90) agingClass = 'alert-high';
            else if (o.aging > 60) agingClass = 'alert-medium';
            else if (o.aging > 30) agingClass = 'alert-low';
            const badgeClass = getCobrancaBadgeClass(o.fase_atual_de_para);
            tr.innerHTML = `
                <td style="padding: 8px; border-bottom: 1px solid var(--border-color);"><strong>${o.os}</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary);">${o.categoria}</td>
                <td style="padding: 8px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary);">${fmtDate(o.data_cadastro)}</td>
                <td style="padding: 8px; border-bottom: 1px solid var(--border-color); text-align: center;">
                    <span class="badge-aging ${agingClass}">${o.aging}d</span>
                </td>
                <td style="padding: 8px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary);">${o.fase_atual}</td>
                <td style="padding: 8px; border-bottom: 1px solid var(--border-color);">
                    <span class="cobranca-badge ${badgeClass}" style="padding: 2px 6px; font-size: 9px;">${o.fase_atual_de_para}</span>
                </td>
                <td style="padding: 8px; border-bottom: 1px solid var(--border-color); text-align: right; font-weight: 700; color: var(--color-primary-light);">
                    ${formatCobrancaCurrency(o.valor)}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// ── Renderização dos Gráficos Chart.js ──────────────────────────────────────
function renderCobrancaCharts() {
    if (cobrancaActiveTab !== 'indicators') return;

    // Destruir gráficos antigos para evitar overlap
    Object.keys(cobrancaCharts).forEach(k => {
        if (cobrancaCharts[k]) {
            cobrancaCharts[k].destroy();
            cobrancaCharts[k] = null;
        }
    });

    const th = getCobrancaThemeVars();
    Chart.defaults.color = th.textColor;
    Chart.defaults.font.family = "'Outfit', 'Inter', sans-serif";

    // 1. Gráfico CAPEX / OPEX (Donut)
    renderCapexOpexChart(th);

    // 2. Gráfico Faturamento Mensal com/sem pedido (Barras Empilhadas)
    renderMonthlySplitChart(th);

    // 3. Gráfico Atividade (Barras Horizontais)
    renderHorizontalChart('cobranca-activity-chart', 'tipo_atividade', 'activity', th, null);

    // 4. Gráfico Itens (Barras Horizontais - Todos os itens com scroll)
    renderHorizontalChart('cobranca-item-chart', 'item_descritivo', 'item', th, null);

    // 5. Gráfico Fase Atual Original (Barras Horizontais)
    renderHorizontalChart('cobranca-fase-atual-chart', 'fase_atual', 'faseAtual', th, null);
}

// Gráfico CAPEX/OPEX
function renderCapexOpexChart(th) {
    const canvas = document.getElementById('cobranca-capex-opex-chart');
    if (!canvas) return;

    const capexOpexSum = {};
    cobrancaFilteredData.forEach(r => {
        const type = r.tipo_despesa || 'OUTROS';
        capexOpexSum[type] = (capexOpexSum[type] || 0) + (r.valor_total || 0);
    });

    const labels = Object.keys(capexOpexSum);
    const data = Object.values(capexOpexSum);

    if (labels.length === 0) return;

    const isDark = !document.body.classList.contains('light-theme');
    const colorPalette = [
        '#004f71', '#ffb83d', '#7209b7', '#00b4d8', 
        '#ff4d6d', '#2ecc71', '#f72585', '#4cc9f0',
        '#f39f18', '#9b59b6', '#1abc9c', '#e74c3c'
    ];

    cobrancaCharts.capexOpex = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colorPalette.slice(0, labels.length),
                borderColor: isDark ? '#0d1b26' : '#f5f6f8',
                borderWidth: 1.5,
                spacing: 2.5,
                borderRadius: 4,
                hoverOffset: 8,
                hoverBorderColor: '#ffffff',
                hoverBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16 } },
                tooltip: {
                    backgroundColor: th.tooltipBg,
                    titleColor: th.tooltipText,
                    bodyColor: th.tooltipText,
                    borderColor: th.tooltipBorder,
                    borderWidth: 1,
                    callbacks: {
                        label: (ctx) => ` ${ctx.label}: ${formatCobrancaCurrency(ctx.raw)}`
                    }
                },
                datalabels: {
                    display: 'auto',
                    formatter: (val, ctx) => {
                        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                        const pct = total > 0 ? ((val / total) * 100).toFixed(1).replace('.', ',') + '%' : '0%';
                        return val > 0 ? pct : '';
                    },
                    color: '#ffffff',
                    font: { weight: 'bold', size: 11 }
                }
            },
            cutout: '65%'
        }
    });
}


// Gráfico Faturamento Mensal (Com Pedido vs Sem Pedido) - Barras Empilhadas
function renderMonthlySplitChart(th) {
    const canvas = document.getElementById('cobranca-monthly-split-chart');
    if (!canvas) return;

    const monthlyMetrics = {}; // 'YYYY/MM' => { comPed: X, semPed: Y }
    cobrancaFilteredData.forEach(r => {
        const m = r.mes_medicao || 'N/D';
        if (!monthlyMetrics[m]) {
            monthlyMetrics[m] = { comPed: 0, semPed: 0 };
        }
        if (r.fase_atual_de_para === 'PEDIDO EMITIDO') {
            monthlyMetrics[m].comPed += (r.valor_total || 0);
        } else {
            monthlyMetrics[m].semPed += (r.valor_total || 0);
        }
    });

    const sortedMonths = Object.keys(monthlyMetrics).sort();
    const labels = sortedMonths.map(m => {
        const parts = m.split('/');
        return parts.length === 2 ? `${parts[1]}/${parts[0]}` : m;
    });

    const comPedData = sortedMonths.map(m => monthlyMetrics[m].comPed);
    const semPedData = sortedMonths.map(m => monthlyMetrics[m].semPed);

    cobrancaCharts.monthlySplit = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Pedido Emitido',
                    data: comPedData,
                    backgroundColor: '#004f71',
                    borderColor: '#004f71',
                    borderRadius: 2,
                    hoverBackgroundColor: '#0077aa',
                    hoverBorderColor: '#ffffff',
                    hoverBorderWidth: 2,
                    datalabels: {
                        display: false
                    }
                },
                {
                    label: 'Sem Pedido',
                    data: semPedData,
                    backgroundColor: '#f39f18',
                    borderColor: '#f39f18',
                    borderRadius: 2,
                    hoverBackgroundColor: '#ffb83d',
                    hoverBorderColor: '#ffffff',
                    hoverBorderWidth: 2,
                    datalabels: {
                        display: true,
                        align: 'end',
                        anchor: 'end',
                        color: th.textColor,
                        font: { size: 9, weight: 'bold' },
                        formatter: (value, context) => {
                            const index = context.dataIndex;
                            const comPedVal = context.chart.data.datasets[0].data[index] || 0;
                            const semPedVal = context.chart.data.datasets[1].data[index] || 0;
                            const total = comPedVal + semPedVal;
                            return total > 0 ? formatCobrancaShortVal(total) : '';
                        }
                    }
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (event, elements) => {
                if (elements && elements.length > 0) {
                    const index = elements[0].index;
                    const monthYear = sortedMonths[index];
                    if (monthYear && monthYear !== 'N/D') {
                        const [year, month] = monthYear.split('/');
                        const start = `${year}-${month}-01`;
                        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                        const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
                        
                        const startInput = document.getElementById('cobranca-filter-data-inicio');
                        const endInput = document.getElementById('cobranca-filter-data-fim');
                        if (startInput && endInput) {
                            startInput.value = start;
                            endInput.value = end;
                            applyCobrancaFilters();
                        }
                    }
                }
            },
            onHover: (event, chartElement) => {
                event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            layout: {
                padding: {
                    top: 15
                }
            },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: {
                    stacked: true,
                    grid: { color: th.gridColor },
                    ticks: {
                        callback: (val) => formatCobrancaShortVal(val)
                    }
                }
            },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    backgroundColor: th.tooltipBg,
                    titleColor: th.tooltipText,
                    bodyColor: th.tooltipText,
                    borderColor: th.tooltipBorder,
                    borderWidth: 1,
                    callbacks: {
                        label: (ctx) => ` ${ctx.dataset.label}: ${formatCobrancaCurrency(ctx.raw)}`
                    }
                }
            }
        }
    });
}

// Helper genérico para Gráficos Horizontais de Top valores
function renderHorizontalChart(canvasId, fieldName, chartKey, th, limit = 5) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const groupSum = {};
    cobrancaFilteredData.forEach(r => {
        const val = r[fieldName] || 'N/D';
        groupSum[val] = (groupSum[val] || 0) + (r.valor_total || 0);
    });

    // Ordenar e pegar top
    let sorted = Object.keys(groupSum)
        .map(key => ({ key, val: groupSum[key] }))
        .sort((a, b) => b.val - a.val);

    if (limit !== null && limit !== undefined) {
        sorted = sorted.slice(0, limit);
    }

    const labels = sorted.map(i => i.key);
    const data = sorted.map(i => i.val);

    if (labels.length === 0) return;

    // Altura dinâmica para rolagem vertical se for um dos gráficos de barras horizontais roláveis
    if (canvas && canvas.parentElement) {
        if (canvasId === 'cobranca-item-chart' || canvasId === 'cobranca-activity-chart' || canvasId === 'cobranca-fase-atual-chart') {
            const itemHeight = 45; // altura de 45px por barra para manter exatamente 7 itens visíveis em 320px de container
            const minHeight = 320;
            const calculatedHeight = sorted.length * itemHeight;
            canvas.parentElement.style.height = Math.max(minHeight, calculatedHeight) + 'px';
        } else {
            canvas.parentElement.style.height = '320px';
        }
    }

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 300, 0);
    gradient.addColorStop(0, 'rgba(0, 79, 113, 0.15)');
    gradient.addColorStop(1, 'rgba(0, 79, 113, 0.85)');

    cobrancaCharts[chartKey] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: gradient,
                borderColor: '#004f71',
                borderWidth: 1.5,
                borderRadius: 4,
                hoverBackgroundColor: '#0077aa',
                hoverBorderColor: '#ffffff',
                hoverBorderWidth: 2
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    right: 40 // Add padding to avoid datalabels clipping
                }
            },
            scales: {
                x: {
                    grid: { color: th.gridColor },
                    ticks: {
                        callback: (val) => formatCobrancaShortVal(val)
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 10 },
                        // Encurtar textos de categorias longas
                        callback: function(valIndex) {
                            const label = this.getLabelForValue(valIndex);
                            return label.length > 25 ? label.substring(0, 22) + '...' : label;
                        }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: th.tooltipBg,
                    titleColor: th.tooltipText,
                    bodyColor: th.tooltipText,
                    borderColor: th.tooltipBorder,
                    borderWidth: 1,
                    callbacks: {
                        label: (ctx) => ` Valor: ${formatCobrancaCurrency(ctx.raw)}`
                    }
                },
                datalabels: {
                    display: true,
                    align: 'end',
                    anchor: 'end',
                    color: th.textColor,
                    font: { size: 9, weight: 'bold' },
                    formatter: (val) => formatCobrancaShortVal(val)
                }
            }
        }
    });
}

// ── Tabela do Relatório Analítico ───────────────────────────────────────────
function getCobrancaTableData() {
    let data = [...cobrancaFilteredData];

    // Busca textual global
    if (cobrancaSearchQuery) {
        const q = cobrancaSearchQuery.trim().toUpperCase();
        data = data.filter(r =>
            (r.os || '').toString().includes(q) ||
            (r.pep || '').toUpperCase().includes(q) ||
            (r.cidade || '').toUpperCase().includes(q) ||
            (r.projeto || '').toUpperCase().includes(q) ||
            (r.projeto_gerencial || '').toUpperCase().includes(q) ||
            (r.item_descritivo || '').toUpperCase().includes(q) ||
            (r.numero_pedido || '').toString().includes(q) ||
            (r.numero_medicao || '').toString().includes(q) ||
            (r.categoria || '').toUpperCase().includes(q) ||
            (r.fase_atual_de_para || '').toUpperCase().includes(q)
        );
    }

    // Ordenação
    if (cobrancaSortCol) {
        data.sort((a, b) => {
            let va = a[cobrancaSortCol];
            let vb = b[cobrancaSortCol];

            if (va === null || va === undefined) return cobrancaSortDir === 'asc' ? 1 : -1;
            if (vb === null || vb === undefined) return cobrancaSortDir === 'asc' ? -1 : 1;

            if (typeof va === 'number' && typeof vb === 'number') {
                return cobrancaSortDir === 'asc' ? va - vb : vb - va;
            }

            va = va.toString().toUpperCase();
            vb = vb.toString().toUpperCase();
            return cobrancaSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        });
    }

    return data;
}

function renderCobrancaTable() {
    if (cobrancaActiveTab !== 'report') return;

    const data = getCobrancaTableData();
    const tbody = document.getElementById('cobranca-table-body');
    if (!tbody) return;

    const totalCount = data.length;
    document.getElementById('cobranca-results-count').textContent = `${totalCount.toLocaleString('pt-BR')} registros encontrados`;

    const totalPages = Math.ceil(totalCount / COBRANCA_PAGE_SIZE);
    if (cobrancaCurrentPage > totalPages && totalPages > 0) cobrancaCurrentPage = totalPages;

    const start = (cobrancaCurrentPage - 1) * COBRANCA_PAGE_SIZE;
    const end = Math.min(start + COBRANCA_PAGE_SIZE, totalCount);

    tbody.innerHTML = '';

    if (totalCount === 0) {
        tbody.innerHTML = `<tr><td colspan="22" style="text-align:center;color:var(--text-secondary);padding:40px 0;">Nenhum registro encontrado.</td></tr>`;
        document.getElementById('cobranca-page-info').textContent = 'Pág. 0 de 0';
        document.getElementById('cobranca-pagination-btns').innerHTML = '';
        return;
    }

    document.getElementById('cobranca-page-info').textContent = `Exibindo ${start + 1}-${end} de ${totalCount} (Pág. ${cobrancaCurrentPage}/${totalPages})`;

    renderCobrancaPagination(totalPages);

    const items = data.slice(start, end);
    items.forEach(r => {
        const tr = document.createElement('tr');
        
        // Tratar datas de cadastro e aprovação
        const fmtDate = dStr => {
            if (!dStr || dStr === '-') return '-';
            const p = dStr.split('-');
            return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : dStr;
        };

        const badgeClass = getCobrancaBadgeClass(r.fase_atual_de_para);

        tr.innerHTML = `
            <td data-label="Categoria">${r.categoria || '-'}</td>
            <td data-label="OS"><strong>${r.os || '-'}</strong></td>
            <td data-label="Cidade">${r.cidade || '-'}</td>
            <td data-label="UF"><span class="badge ${String(r.uf || '').toLowerCase()}">${r.uf || '-'}</span></td>
            <td data-label="Projeto">${r.projeto || '-'}</td>
            <td data-label="Proj. Gerencial">${r.projeto_gerencial || '-'}</td>
            <td data-label="Tipo Atividade" title="${r.tipo_atividade || ''}">${r.tipo_atividade || '-'}</td>
            <td data-label="Fase Atual">${r.fase_atual || '-'}</td>
            <td data-label="Contrato">${r.contrato_numero || '-'}</td>
            <td data-label="Item Descritivo" style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${r.item_descritivo || ''}">${r.item_descritivo || '-'}</td>
            <td data-label="Tipo Despesa">${r.tipo_despesa || '-'}</td>
            <td data-label="Objeto Contrato" style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${r.objeto_do_contrato || ''}">${r.objeto_do_contrato || '-'}</td>
            <td data-label="Valor Total" class="cobranca-td-valor">${formatCobrancaCurrency(r.valor_total || 0)}</td>
            <td data-label="Dt. Cadastro">${fmtDate(r.data_cadastro)}</td>
            <td data-label="Dt. Aprovação">${fmtDate(r.data_aprovacao)}</td>
            <td data-label="Tempo Aprov.">${r.tempo_aprovacao !== null && r.tempo_aprovacao !== undefined ? r.tempo_aprovacao + ' dias' : 'Em aberto'}</td>
            <td data-label="User Incl. Medição">${r.user_inclusao_medicao || '-'}</td>
            <td data-label="PEP">${r.pep || '-'}</td>
            <td data-label="Nº Medição">${r.numero_medicao || '-'}</td>
            <td data-label="Nº Pedido">${r.numero_pedido || '-'}</td>
            <td data-label="User Pedido">${r.user_pedido || '-'}</td>
            <td data-label="Fase (De/Para)"><span class="cobranca-badge ${badgeClass}">${r.fase_atual_de_para || '-'}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// Ordenar Tabela
function sortCobrancaTable(column) {
    if (cobrancaSortCol === column) {
        cobrancaSortDir = cobrancaSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        cobrancaSortCol = column;
        cobrancaSortDir = 'asc';
    }

    document.querySelectorAll('#cobranca-table th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        const onclickAttr = th.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${column}'`)) {
            th.classList.add(cobrancaSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    cobrancaCurrentPage = 1;
    renderCobrancaTable();
}

// Paginação
function renderCobrancaPagination(totalPages) {
    const container = document.getElementById('cobranca-pagination-btns');
    if (!container) return;
    container.innerHTML = '';

    const btnPrev = document.createElement('button');
    btnPrev.className = 'cobranca-page-btn';
    btnPrev.innerHTML = '<i class="fa-solid fa-angle-left"></i>';
    btnPrev.disabled = cobrancaCurrentPage === 1;
    btnPrev.onclick = () => { if (cobrancaCurrentPage > 1) { cobrancaCurrentPage--; renderCobrancaTable(); } };
    container.appendChild(btnPrev);

    const pagesToShow = [];
    if (totalPages <= 5) {
        for (let i = 1; i <= totalPages; i++) pagesToShow.push(i);
    } else {
        pagesToShow.push(1);
        if (cobrancaCurrentPage > 3) pagesToShow.push('...');
        
        const startPage = Math.max(2, cobrancaCurrentPage - 1);
        const endPage = Math.min(totalPages - 1, cobrancaCurrentPage + 1);
        for (let i = startPage; i <= endPage; i++) {
            if (!pagesToShow.includes(i)) pagesToShow.push(i);
        }
        
        if (cobrancaCurrentPage < totalPages - 2) pagesToShow.push('...');
        if (!pagesToShow.includes(totalPages)) pagesToShow.push(totalPages);
    }

    pagesToShow.forEach(p => {
        if (p === '...') {
            const span = document.createElement('span');
            span.textContent = '...';
            span.style.margin = '0 4px';
            span.style.color = 'var(--text-secondary)';
            container.appendChild(span);
        } else {
            const btn = document.createElement('button');
            btn.className = `cobranca-page-btn${cobrancaCurrentPage === p ? ' active' : ''}`;
            btn.textContent = p;
            btn.onclick = () => { cobrancaCurrentPage = p; renderCobrancaTable(); };
            container.appendChild(btn);
        }
    });

    const btnNext = document.createElement('button');
    btnNext.className = 'cobranca-page-btn';
    btnNext.innerHTML = '<i class="fa-solid fa-angle-right"></i>';
    btnNext.disabled = cobrancaCurrentPage === totalPages;
    btnNext.onclick = () => { if (cobrancaCurrentPage < totalPages) { cobrancaCurrentPage++; renderCobrancaTable(); } };
    container.appendChild(btnNext);
}

// Exportar CSV
function exportCobrancaCSV() {
    try {
        const data = getCobrancaTableData();
        if (data.length === 0) {
            alert('Nenhum dado para exportar.');
            return;
        }

        const headers = [
            'Categoria', 'OS', 'Cidade', 'UF', 'Projeto', 'Projeto Gerencial', 
            'Tipo de Atividade', 'Fase Atual', 'Contrato Numero', 'Item Descritivo', 
            'Tipo de Despesa', 'Objeto do Contrato', 'Valor Total', 'Data Cadastro', 
            'Data Aprovacao', 'Tempo Aprovacao', 'Usuario Inclusao Medicao', 'PEP', 
            'Numero Medicao', 'Numero Pedido', 'Usuario Inclusao Pedido', 'Fase Atual (De Para)'
        ];

        const rows = data.map(r => [
            r.categoria || '',
            r.os || '',
            r.cidade || '',
            r.uf || '',
            r.projeto || '',
            r.projeto_gerencial || '',
            r.tipo_atividade || '',
            r.fase_atual || '',
            r.contrato_numero || '',
            r.item_descritivo || '',
            r.tipo_despesa || '',
            r.objeto_do_contrato || '',
            r.valor_total || 0,
            r.data_cadastro || '',
            r.data_aprovacao || '',
            r.tempo_aprovacao !== null && r.tempo_aprovacao !== undefined ? r.tempo_aprovacao : 'Em aberto',
            r.user_inclusao_medicao || '',
            r.pep || '',
            r.numero_medicao || '',
            r.numero_pedido || '',
            r.user_pedido || '',
            r.fase_atual_de_para || ''
        ]);

        const csvContent = "\uFEFF" + [
            headers.join(';'),
            ...rows.map(e => e.map(val => {
                if (typeof val === 'string') {
                    let cleanVal = val.replace(/"/g, '""');
                    if (cleanVal.includes(';') || cleanVal.includes('\n') || cleanVal.includes('\r')) {
                        cleanVal = `"${cleanVal}"`;
                    }
                    return cleanVal;
                }
                return val;
            }).join(';'))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `RELATORIO_COBRANCA_ANALITICO_${new Date().toISOString().substring(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error("Erro ao exportar CSV:", err);
    }
}

// Obter classe badge adequada conforme a fase de-para mapeada
function getCobrancaBadgeClass(fase) {
    if (!fase) return 'badge-default';
    const f = fase.toUpperCase().trim();
    if (f.includes('PEDIDO EMITIDO')) return 'ped-emitido';
    if (f.includes('FINALIZADO') || f.includes('EXECUTADO')) return 'finalizado';
    if (f.includes('APROVADO')) return 'aprovado';
    if (f.includes('CANCELADO')) return 'cancelado';
    return 'badge-default';
}

// Registrar funções no escopo global (window)
window.initCobranca = initCobranca;
window.applyCobrancaFilters = applyCobrancaFilters;
window.clearCobrancaFilters = clearCobrancaFilters;
window.resetCobrancaDateFilter = resetCobrancaDateFilter;
window.switchCobrancaTab = switchCobrancaTab;
window.sortCobrancaTable = sortCobrancaTable;
window.exportCobrancaCSV = exportCobrancaCSV;
window.applyCobrancaSearch = () => {
    const searchEl = document.getElementById('cobranca-search');
    if (searchEl) {
        cobrancaSearchQuery = searchEl.value;
        cobrancaCurrentPage = 1;
        renderCobrancaTable();
    }
};
