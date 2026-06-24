/* ============================================================
   gestao_os_app.js — Lógica Dashboard COBRANÇA (Reescrita Completa)
   Acompanhamento financeiro de serviços executados - Claro
   v4.0
   ============================================================ */

// ── Estado Global da Cobrança ───────────────────────────────────────────────
let gestao_osActiveTab = 'indicators';
let gestao_osFilteredData = [];
let gestao_osCurrentPage = 1;
const GESTAO_OS_PAGE_SIZE = 50;
let gestao_osSortCol = 'data_cadastro';
let gestao_osSortDir = 'desc';
let gestao_osSearchQuery = '';
let gestao_osDataLoaded = false;
let gestao_osOsListMode = 'sem-aprovacao'; // 'sem-aprovacao' | 'aprovadas'

// Instâncias de Gráficos Chart.js
let gestao_osCharts = {
    capexOpex: null,
    pedidoStatus: null,
    monthlySplit: null,
    activity: null,
    item: null,
    faseAtual: null
};

// Filtros por Clique em Gráficos
let gestao_osClickFilters = {
    tipo_atividade: null,
    fase_atual: null,
    item_descritivo: null,
    tipo_despesa: null
};

// Data base para o cálculo de envelhecimento (Aging)
// Utiliza a data de geração da base de dados se disponível, ou a data de hoje
let baseAgingDate = new Date();

// ── Inicialização ────────────────────────────────────────────────────────────
function initGestaoOs() {
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

        gestao_osFilteredData = [...COBRANCA_DATA];
        populateGestaoOsFilters();
        initGestaoOsEventListeners();
        applyGestaoOsFilters();
        gestao_osDataLoaded = true;
    } catch (err) {
        console.error("Erro fatal ao inicializar Cobrança:", err);
    }
}

// Registrar Listeners
function initGestaoOsEventListeners() {
    // Busca
    const searchEl = document.getElementById('gestao_os-search');
    if (searchEl) {
        searchEl.addEventListener('input', () => {
            gestao_osSearchQuery = searchEl.value;
            gestao_osCurrentPage = 1;
            renderGestaoOsTable();
        });
    }

    // Tema
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            setTimeout(() => {
                if (gestao_osActiveTab === 'indicators') {
                    renderGestaoOsCharts();
                }
            }, 200);
        });
    }
}

// Alternar Abas (Indicadores / Relatório)
function switchGestaoOsTab(tab) {
    gestao_osActiveTab = tab;

    // Toggle active buttons
    document.getElementById('gestao_os-tab-btn-indicators').classList.toggle('active', tab === 'indicators');
    document.getElementById('gestao_os-tab-btn-report').classList.toggle('active', tab === 'report');

    // Toggle active views
    document.getElementById('subview-gestao_os-indicators').classList.toggle('active', tab === 'indicators');
    document.getElementById('subview-gestao_os-report').classList.toggle('active', tab === 'report');

    if (tab === 'indicators') {
        // Redimensionar e renderizar os gráficos
        renderGestaoOsCharts();
    } else {
        renderGestaoOsTable();
    }
}

// ── Filtros ─────────────────────────────────────────────────────────────────
function populateGestaoOsFilters() {
    try {
        const catSelect = document.getElementById('gestao_os-filter-categoria');
        const projSelect = document.getElementById('gestao_os-filter-projeto');

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
function applyGestaoOsFilters() {
    try {
        const catDropdown = document.getElementById('gestao_os-filter-categoria')?.value || '';
        const ufDropdown = document.getElementById('gestao_os-filter-uf')?.value || '';
        const projDropdown = document.getElementById('gestao_os-filter-projeto')?.value || '';
        const faseDropdown = document.getElementById('gestao_os-filter-fase')?.value || '';
        const dtInicio = document.getElementById('gestao_os-filter-data-inicio')?.value || '';
        const dtFim = document.getElementById('gestao_os-filter-data-fim')?.value || '';

        gestao_osFilteredData = COBRANCA_DATA.filter(r => {
            // Dropdowns
            if (catDropdown && r.categoria !== catDropdown) return false;
            if (ufDropdown && r.uf !== ufDropdown) return false;
            if (projDropdown && r.projeto !== projDropdown) return false;
            if (faseDropdown && r.fase_atual_de_para !== faseDropdown) return false;

            // Filtros de Data de Referência Dinâmica
            const refDate = getGestaoOsRefDate(r);
            if (dtInicio && (!refDate || refDate < dtInicio)) return false;
            if (dtFim && (!refDate || refDate > dtFim)) return false;

            // Filtros por Clique em Gráficos
            if (gestao_osClickFilters.tipo_atividade && r.tipo_atividade !== gestao_osClickFilters.tipo_atividade) return false;
            if (gestao_osClickFilters.fase_atual && r.fase_atual !== gestao_osClickFilters.fase_atual) return false;
            if (gestao_osClickFilters.item_descritivo && r.item_descritivo !== gestao_osClickFilters.item_descritivo) return false;
            if (gestao_osClickFilters.tipo_despesa && r.tipo_despesa !== gestao_osClickFilters.tipo_despesa) return false;

            return true;
        });

        // Resetar paginação
        gestao_osCurrentPage = 1;

        // Atualizar elementos da tela de Indicadores
        if (gestao_osActiveTab === 'indicators') {
            renderGestaoOsKPIs();
            renderGestaoOsCharts();
        } else {
            renderGestaoOsTable();
        }
    } catch (err) {
        console.error("Erro ao aplicar filtros:", err);
    }
}

// Limpar Filtros
// Toggle de filtro por clique em gráficos
function toggleGestaoOsChartFilter(field, value) {
    if (gestao_osClickFilters[field] === value) {
        gestao_osClickFilters[field] = null; // deselecionar (toggle off)
    } else {
        gestao_osClickFilters[field] = value;
    }
    applyGestaoOsFilters();
}

function clearGestaoOsFilters() {
    // Limpar inputs
    ['gestao_os-filter-categoria', 'gestao_os-filter-uf', 'gestao_os-filter-projeto', 'gestao_os-filter-fase', 'gestao_os-filter-data-inicio', 'gestao_os-filter-data-fim'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const searchEl = document.getElementById('gestao_os-search');
    if (searchEl) searchEl.value = '';
    gestao_osSearchQuery = '';

    // Limpar filtros por clique em gráficos
    gestao_osClickFilters = { tipo_atividade: null, fase_atual: null, item_descritivo: null, tipo_despesa: null };
    applyGestaoOsFilters();
}

// Limpar apenas o intervalo de datas
function resetGestaoOsDateFilter() {
    const d1 = document.getElementById('gestao_os-filter-data-inicio');
    const d2 = document.getElementById('gestao_os-filter-data-fim');
    if (d1) d1.value = '';
    if (d2) d2.value = '';
    applyGestaoOsFilters();
}

// Obter a data de referência para uma OS de acordo com o status de aprovação
function getGestaoOsRefDate(r) {
    if (!r) return '';
    const fase = String(r.fase_atual_de_para || '').toUpperCase().trim();
    if (fase === 'PEDIDO EMITIDO' || fase === 'APROVADO') {
        return r.data_aprovacao && r.data_aprovacao !== '-' ? r.data_aprovacao : '';
    }
    return r.data_inclusao_lpu && r.data_inclusao_lpu !== '-' ? r.data_inclusao_lpu : '';
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
function formatGestaoOsCurrency(val) {
    return (val || 0).toLocaleString('pt-BR') + ' OSs';
}

// Helper para abreviar valores monetários (K e M)
function formatGestaoOsShortVal(val) {
    const a = Math.abs(val);
    if (a >= 1000000) return (val / 1000000).toFixed(1).replace('.', ',') + 'M OSs';
    if (a >= 1000) return (val / 1000).toFixed(0) + 'k OSs';
    return val.toFixed(0) + ' OSs';
}

// Obter variáveis de cores do tema para eixos/gráficos
function getGestaoOsThemeVars() {
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
function renderGestaoOsKPIs() {
    renderCategoryCards();
    renderPipelineStepper();
    renderGestaoOsUFMap();
    renderOpenOSsList();
}

// 1. Cards de Categoria (Coluna B) no topo
function renderCategoryCards() {
    const container = document.getElementById('gestao_os-category-cards-container');
    if (!container) return;

    // Calcular valores por categoria (em quantidades de OSs distintas)
    const categoryOSs = {}; // Armazenar Set de OSs únicas por categoria
    
    // Inicializar a partir dos dados atuais sem filtros por clique de categoria
    const baseDataForCategoryKPI = COBRANCA_DATA.filter(r => {
        const ufDropdown = document.getElementById('gestao_os-filter-uf')?.value || '';
        const projDropdown = document.getElementById('gestao_os-filter-projeto')?.value || '';
        const faseDropdown = document.getElementById('gestao_os-filter-fase')?.value || '';
        const dtInicio = document.getElementById('gestao_os-filter-data-inicio')?.value || '';
        const dtFim = document.getElementById('gestao_os-filter-data-fim')?.value || '';

        if (ufDropdown && r.uf !== ufDropdown) return false;
        if (projDropdown && r.projeto !== projDropdown) return false;
        if (faseDropdown && r.fase_atual_de_para !== faseDropdown) return false;
        const refDate = getGestaoOsRefDate(r);
        if (dtInicio && (!refDate || refDate < dtInicio)) return false;
        if (dtFim && (!refDate || refDate > dtFim)) return false;

        return true;
    });

    baseDataForCategoryKPI.forEach(r => {
        const cat = r.categoria || 'OUTROS';
        if (!categoryOSs[cat]) {
            categoryOSs[cat] = new Set();
        }
        if (r.os) {
            categoryOSs[cat].add(r.os);
        }
    });

    // Calcular total de OSs distintas das categorias filtradas para o percentual
    const totalFaturamento = new Set(baseDataForCategoryKPI.map(r => r.os).filter(Boolean)).size;

    // Determinar os últimos 12 meses únicos no banco de dados completo (ordenados)
    const allMonths = [...new Set(COBRANCA_DATA.map(r => r.mes_medicao).filter(m => m && m !== 'N/D'))].sort();
    const last12Months = allMonths.slice(-12);
    const last12MonthsSet = new Set(last12Months);
    const monthsDivider = Math.max(1, last12Months.length);

    // Calcular a média mensal dos últimos 12 meses para cada categoria (OSs distintas)
    const categoryOSsLast12 = {};
    COBRANCA_DATA.forEach(r => {
        const ufDropdown = document.getElementById('gestao_os-filter-uf')?.value || '';
        const projDropdown = document.getElementById('gestao_os-filter-projeto')?.value || '';
        const faseDropdown = document.getElementById('gestao_os-filter-fase')?.value || '';

        if (ufDropdown && r.uf !== ufDropdown) return;
        if (projDropdown && r.projeto !== projDropdown) return;
        if (faseDropdown && r.fase_atual_de_para !== faseDropdown) return;

        if (r.mes_medicao && last12MonthsSet.has(r.mes_medicao)) {
            const cat = r.categoria || 'OUTROS';
            if (!categoryOSsLast12[cat]) {
                categoryOSsLast12[cat] = new Set();
            }
            if (r.os) {
                categoryOSsLast12[cat].add(r.os);
            }
        }
    });

    // Mapear os totais
    const categorySums = {};
    const categorySumsLast12 = {};
    Object.keys(categoryOSs).forEach(cat => {
        categorySums[cat] = categoryOSs[cat].size;
    });
    Object.keys(categoryOSsLast12).forEach(cat => {
        categorySumsLast12[cat] = categoryOSsLast12[cat].size;
    });

    // Ordenar categorias por quantidade total decrescente
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
        const avgMonthly = (categorySumsLast12[cat] || 0) / monthsDivider;
        
        const activeCat = document.getElementById('gestao_os-filter-categoria')?.value || '';
        const card = document.createElement('div');
        card.className = `gestao_os-category-card${activeCat === cat ? ' active' : ''}`;
        card.onclick = () => {
            const select = document.getElementById('gestao_os-filter-categoria');
            if (select) {
                select.value = (select.value === cat) ? '' : cat;
                applyGestaoOsFilters();
            }
        };

        const iconClass = categoryIcons[cat.toUpperCase().trim()] || 'fa-solid fa-chart-simple';

        card.innerHTML = `
            <div class="kpi-info" style="flex-grow: 1;">
                <span class="gestao_os-category-title" title="${cat}">${cat}</span>
                <span class="gestao_os-category-value">${formatGestaoOsCurrency(sum)}</span>
                <div style="display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--text-secondary); margin-top: 6px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span>${count.toLocaleString('pt-BR')} OSs</span>
                        <span style="font-weight: 700; color: var(--color-primary-light);">(${pct.toFixed(1).replace('.', ',')}%)</span>
                    </div>
                    <div style="font-size: 10px; opacity: 0.85; border-top: 1px dashed var(--border-color); padding-top: 4px; margin-top: 4px;">
                        Média Mensal: <strong style="color: var(--text-primary);">${avgMonthly.toFixed(1).replace('.', ',')} OSs/mês</strong>
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
    const container = document.getElementById('gestao_os-pipeline-container');
    if (!container) return;

    // Fases em sequência lógica
    const pipelineSequence = ['EM EXECUÇÃO', 'EXECUTADO', 'APROVADO', 'PEDIDO EMITIDO'];
    
    // Obter dados básicos sem o filtro de fase para cliques
    const baseDataForPipeline = COBRANCA_DATA.filter(r => {
        const catDropdown = document.getElementById('gestao_os-filter-categoria')?.value || '';
        const ufDropdown = document.getElementById('gestao_os-filter-uf')?.value || '';
        const projDropdown = document.getElementById('gestao_os-filter-projeto')?.value || '';
        const dtInicio = document.getElementById('gestao_os-filter-data-inicio')?.value || '';
        const dtFim = document.getElementById('gestao_os-filter-data-fim')?.value || '';

        if (catDropdown && r.categoria !== catDropdown) return false;
        if (ufDropdown && r.uf !== ufDropdown) return false;
        if (projDropdown && r.projeto !== projDropdown) return false;
        const refDate = getGestaoOsRefDate(r);
        if (dtInicio && (!refDate || refDate < dtInicio)) return false;
        if (dtFim && (!refDate || refDate > dtFim)) return false;

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
            if (r.os) {
                phaseMetrics[p].oss.add(r.os);
            }
        }
    });
    
    // Set sum equal to the distinct count of OSs
    Object.keys(phaseMetrics).forEach(p => {
        phaseMetrics[p].sum = phaseMetrics[p].oss.size;
    });

    container.innerHTML = '';

    // Adicionar os cards de faturamento por fase (estilo KPI)
    pipelineSequence.forEach(phase => {
        const m = phaseMetrics[phase];
        const activePhase = document.getElementById('gestao_os-filter-fase')?.value || '';
        const card = document.createElement('div');
        card.className = `kpi-card ${m.cssClass}${activePhase === phase ? ' active' : ''}`;
        card.onclick = () => {
            const select = document.getElementById('gestao_os-filter-fase');
            if (select) {
                select.value = (select.value === phase) ? '' : phase;
                applyGestaoOsFilters();
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

        const totalOSsInPipeline = Object.values(phaseMetrics).reduce((acc, ph) => acc + ph.oss.size, 0);
        const phasePct = totalOSsInPipeline > 0 ? (count / totalOSsInPipeline) * 100 : 0;
        card.innerHTML = `
            <div class="kpi-info" style="flex-grow: 1;">
                <span class="kpi-label">${label}</span>
                <h3 class="kpi-value" style="font-size: 24px; font-weight: 800; font-family: 'Outfit', sans-serif;">${formatGestaoOsCurrency(m.sum)}</h3>
                <div class="kpi-analytics">
                    <span class="kpi-subvalue" style="font-size: 11px; color: var(--text-secondary); font-weight: 600;">(${phasePct.toFixed(1).replace('.', ',')}%)</span>
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
function renderGestaoOsUFMap() {
    const container = document.getElementById('gestao_os-uf-map-container');
    if (!container) return;

    // Calcular valores por UF
    const ufSums = { 'RS': 0, 'SC': 0, 'PR': 0 };
    const ufOSs = { 'RS': new Set(), 'SC': new Set(), 'PR': new Set() };
    const ufDetails = {
        'PR': { comPed: 0, aprov: 0, semAprov: 0 },
        'SC': { comPed: 0, aprov: 0, semAprov: 0 },
        'RS': { comPed: 0, aprov: 0, semAprov: 0 }
    };

    // Obter dados sem o filtro de clique de UF
    const baseDataForUFMap = COBRANCA_DATA.filter(r => {
        const catDropdown = document.getElementById('gestao_os-filter-categoria')?.value || '';
        const projDropdown = document.getElementById('gestao_os-filter-projeto')?.value || '';
        const faseDropdown = document.getElementById('gestao_os-filter-fase')?.value || '';
        const dtInicio = document.getElementById('gestao_os-filter-data-inicio')?.value || '';
        const dtFim = document.getElementById('gestao_os-filter-data-fim')?.value || '';

        if (catDropdown && r.categoria !== catDropdown) return false;
        if (projDropdown && r.projeto !== projDropdown) return false;
        if (faseDropdown && r.fase_atual_de_para !== faseDropdown) return false;
        const refDate = getGestaoOsRefDate(r);
        if (dtInicio && (!refDate || refDate < dtInicio)) return false;
        if (dtFim && (!refDate || refDate > dtFim)) return false;

        return true;
    });

    baseDataForUFMap.forEach(r => {
        const uf = String(r.uf).toUpperCase().trim();
        if (ufSums.hasOwnProperty(uf)) {
            if (r.os && r.os !== '-') {
                ufOSs[uf].add(r.os);
                
                const faseDePara = String(r.fase_atual_de_para || '').toUpperCase().trim();
                if (faseDePara === 'PEDIDO EMITIDO') {
                    ufDetails[uf].comPed += 1;
                } else if (faseDePara === 'APROVADO') {
                    ufDetails[uf].aprov += 1;
                } else {
                    ufDetails[uf].semAprov += 1;
                }
            }
        }
    });
    
    // Set ufSums to be the distinct count of OSs
    Object.keys(ufSums).forEach(uf => {
        ufSums[uf] = ufOSs[uf].size;
    });

    const maxVal = Math.max(ufSums['RS'], ufSums['SC'], ufSums['PR'], 1);
    const totalFaturamento = ufSums['PR'] + ufSums['SC'] + ufSums['RS'];

    const getColorForUF = (uf) => {
        const vol = ufSums[uf];
        const opacity = 0.15 + 0.75 * (vol / maxVal);
        return `rgba(0, 79, 113, ${opacity})`;
    };

    const activeUF = document.getElementById('gestao_os-filter-uf')?.value || '';
    const isSelectPR = activeUF === 'PR' ? 'active' : (activeUF ? 'dimmed' : '');
    const isSelectSC = activeUF === 'SC' ? 'active' : (activeUF ? 'dimmed' : '');
    const isSelectRS = activeUF === 'RS' ? 'active' : (activeUF ? 'dimmed' : '');

    const prPct = totalFaturamento > 0 ? ((ufSums['PR'] / totalFaturamento) * 100).toFixed(1).replace('.', ',') : '0,0';
    const scPct = totalFaturamento > 0 ? ((ufSums['SC'] / totalFaturamento) * 100).toFixed(1).replace('.', ',') : '0,0';
    const rsPct = totalFaturamento > 0 ? ((ufSums['RS'] / totalFaturamento) * 100).toFixed(1).replace('.', ',') : '0,0';

    const totalPR = ufSums['PR'] || 1;
    const prPedPct = ((ufDetails['PR'].comPed / totalPR) * 100).toFixed(1);
    const prAprovPct = ((ufDetails['PR'].aprov / totalPR) * 100).toFixed(1);
    const prSemAprovPct = ((ufDetails['PR'].semAprov / totalPR) * 100).toFixed(1);

    const totalSC = ufSums['SC'] || 1;
    const scPedPct = ((ufDetails['SC'].comPed / totalSC) * 100).toFixed(1);
    const scAprovPct = ((ufDetails['SC'].aprov / totalSC) * 100).toFixed(1);
    const scSemAprovPct = ((ufDetails['SC'].semAprov / totalSC) * 100).toFixed(1);

    const totalRS = ufSums['RS'] || 1;
    const rsPedPct = ((ufDetails['RS'].comPed / totalRS) * 100).toFixed(1);
    const rsAprovPct = ((ufDetails['RS'].aprov / totalRS) * 100).toFixed(1);
    const rsSemAprovPct = ((ufDetails['RS'].semAprov / totalRS) * 100).toFixed(1);

    container.innerHTML = `
        <div class="uf-premium-container">
            <!-- LEFT COLUMN: GEOGRAPHIC REGION MAP -->
            <div class="uf-map-side">
                <svg class="map-svg-centered" viewBox="125 242 136 136" style="overflow: visible;">
                    <!-- PARANÁ POLYGON -->
                    <polygon class="map-state ${isSelectPR}" id="gestao_os-state-PR" points="
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
                        onmouseenter="handleGestaoOsMapHover(event, 'PR')" 
                        onmousemove="handleGestaoOsMapMove(event)" 
                        onmouseleave="handleGestaoOsMapLeave()"
                        onclick="toggleGestaoOsUFFromMap('PR')">
                    </polygon>
                    <text class="map-label ${isSelectPR}" x="205" y="272" style="font-size: 3.5px;" onclick="toggleGestaoOsUFFromMap('PR')">PR</text>

                    <!-- SANTA CATARINA POLYGON -->
                    <polygon class="map-state ${isSelectSC}" id="gestao_os-state-SC" points="
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
                        onmouseenter="handleGestaoOsMapHover(event, 'SC')" 
                        onmousemove="handleGestaoOsMapMove(event)" 
                        onmouseleave="handleGestaoOsMapLeave()"
                        onclick="toggleGestaoOsUFFromMap('SC')">
                    </polygon>
                    <text class="map-label ${isSelectSC}" x="215" y="298" style="font-size: 3.5px;" onclick="toggleGestaoOsUFFromMap('SC')">SC</text>

                    <!-- RIO GRANDE DO SUL POLYGON -->
                    <polygon class="map-state ${isSelectRS}" id="gestao_os-state-RS" points="
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
                        onmouseenter="handleGestaoOsMapHover(event, 'RS')" 
                        onmousemove="handleGestaoOsMapMove(event)" 
                        onmouseleave="handleGestaoOsMapLeave()"
                        onclick="toggleGestaoOsUFFromMap('RS')">
                    </polygon>
                    <text class="map-label ${isSelectRS}" x="186" y="335" style="font-size: 3.5px;" onclick="toggleGestaoOsUFFromMap('RS')">RS</text>
                </svg>
            </div>

            <!-- PARANÁ CAPSULE -->
            <div class="uf-compact-card pr-card ${isSelectPR}" id="gestao_os-card-UF-PR" onclick="toggleGestaoOsUFFromMap('PR')" onmouseenter="handleGestaoOsCardHover('PR')" onmouseleave="handleGestaoOsCardLeave('PR')">
                <div class="uf-compact-header">
                    <span class="uf-compact-name">
                        <span class="uf-status-indicator pr-dot"></span>
                        <strong>Paraná</strong>
                    </span>
                </div>
                <div class="uf-compact-default-val">
                    ${formatGestaoOsCurrency(ufSums['PR'])}
                </div>
                <div class="uf-compact-content">
                    <div class="uf-compact-main-stat">
                        <span class="uf-stat-label"><i class="fa-solid fa-file-invoice"></i> OSs</span>
                        <span class="uf-stat-value">${ufOSs['PR'].size.toLocaleString('pt-BR')}</span>
                    </div>
                    <div class="uf-compact-sub-stats" style="margin-top:4px;">
                        <div class="uf-sub-stat">
                            <span class="uf-sub-label" style="color:var(--text-secondary); font-size:10px;"><i class="fa-solid fa-percent"></i> Proporção:</span>
                            <span class="uf-sub-val" style="color:var(--text-secondary); font-size:10px; font-weight:700;">${prPct}%</span>
                        </div>
                    </div>
                </div>
                <!-- Barra de progresso empilhada colorira proporcional -->
                <div class="uf-stacked-bar" style="display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 8px; background: rgba(0,0,0,0.08);" title="Pedido: ${prPedPct}%, Aprovado: ${prAprovPct}%, Sem Aprovação: ${prSemAprovPct}%">
                    <div style="width: ${prPedPct}%; background: #004f71;"></div>
                    <div style="width: ${prAprovPct}%; background: #f39f18;"></div>
                    <div style="width: ${prSemAprovPct}%; background: #ff5722;"></div>
                </div>
                <!-- Detalhes expandidos sob hover do mouse -->
                <div class="uf-card-details-expanded">
                    <div class="uf-detail-row">
                        <span class="uf-detail-label"><span class="uf-detail-bullet" style="background:#004f71;"></span> Pedido:</span>
                        <span class="uf-detail-value">${formatGestaoOsCurrency(ufDetails['PR'].comPed)}</span>
                    </div>
                    <div class="uf-detail-row">
                        <span class="uf-detail-label"><span class="uf-detail-bullet" style="background:#f39f18;"></span> Aprovado:</span>
                        <span class="uf-detail-value">${formatGestaoOsCurrency(ufDetails['PR'].aprov)}</span>
                    </div>
                    <div class="uf-detail-row">
                        <span class="uf-detail-label"><span class="uf-detail-bullet" style="background:#ff5722;"></span> S/ Aprovação:</span>
                        <span class="uf-detail-value">${formatGestaoOsCurrency(ufDetails['PR'].semAprov)}</span>
                    </div>
                </div>
            </div>

            <!-- SANTA CATARINA CAPSULE -->
            <div class="uf-compact-card sc-card ${isSelectSC}" id="gestao_os-card-UF-SC" onclick="toggleGestaoOsUFFromMap('SC')" onmouseenter="handleGestaoOsCardHover('SC')" onmouseleave="handleGestaoOsCardLeave('SC')">
                <div class="uf-compact-header">
                    <span class="uf-compact-name">
                        <span class="uf-status-indicator sc-dot"></span>
                        <strong>Santa Catarina</strong>
                    </span>
                </div>
                <div class="uf-compact-default-val">
                    ${formatGestaoOsCurrency(ufSums['SC'])}
                </div>
                <div class="uf-compact-content">
                    <div class="uf-compact-main-stat">
                        <span class="uf-stat-label"><i class="fa-solid fa-file-invoice"></i> OSs</span>
                        <span class="uf-stat-value">${ufOSs['SC'].size.toLocaleString('pt-BR')}</span>
                    </div>
                    <div class="uf-compact-sub-stats" style="margin-top:4px;">
                        <div class="uf-sub-stat">
                            <span class="uf-sub-label" style="color:var(--text-secondary); font-size:10px;"><i class="fa-solid fa-percent"></i> Proporção:</span>
                            <span class="uf-sub-val" style="color:var(--text-secondary); font-size:10px; font-weight:700;">${scPct}%</span>
                        </div>
                    </div>
                </div>
                <!-- Barra de progresso empilhada colorira proporcional -->
                <div class="uf-stacked-bar" style="display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 8px; background: rgba(0,0,0,0.08);" title="Pedido: ${scPedPct}%, Aprovado: ${scAprovPct}%, Sem Aprovação: ${scSemAprovPct}%">
                    <div style="width: ${scPedPct}%; background: #004f71;"></div>
                    <div style="width: ${scAprovPct}%; background: #f39f18;"></div>
                    <div style="width: ${scSemAprovPct}%; background: #ff5722;"></div>
                </div>
                <!-- Detalhes expandidos sob hover do mouse -->
                <div class="uf-card-details-expanded">
                    <div class="uf-detail-row">
                        <span class="uf-detail-label"><span class="uf-detail-bullet" style="background:#004f71;"></span> Pedido:</span>
                        <span class="uf-detail-value">${formatGestaoOsCurrency(ufDetails['SC'].comPed)}</span>
                    </div>
                    <div class="uf-detail-row">
                        <span class="uf-detail-label"><span class="uf-detail-bullet" style="background:#f39f18;"></span> Aprovado:</span>
                        <span class="uf-detail-value">${formatGestaoOsCurrency(ufDetails['SC'].aprov)}</span>
                    </div>
                    <div class="uf-detail-row">
                        <span class="uf-detail-label"><span class="uf-detail-bullet" style="background:#ff5722;"></span> S/ Aprovação:</span>
                        <span class="uf-detail-value">${formatGestaoOsCurrency(ufDetails['SC'].semAprov)}</span>
                    </div>
                </div>
            </div>

            <!-- RIO GRANDE DO SUL CAPSULE -->
            <div class="uf-compact-card rs-card ${isSelectRS}" id="gestao_os-card-UF-RS" onclick="toggleGestaoOsUFFromMap('RS')" onmouseenter="handleGestaoOsCardHover('RS')" onmouseleave="handleGestaoOsCardLeave('RS')">
                <div class="uf-compact-header">
                    <span class="uf-compact-name">
                        <span class="uf-status-indicator rs-dot"></span>
                        <strong>Rio Grande do Sul</strong>
                    </span>
                </div>
                <div class="uf-compact-default-val">
                    ${formatGestaoOsCurrency(ufSums['RS'])}
                </div>
                <div class="uf-compact-content">
                    <div class="uf-compact-main-stat">
                        <span class="uf-stat-label"><i class="fa-solid fa-file-invoice"></i> OSs</span>
                        <span class="uf-stat-value">${ufOSs['RS'].size.toLocaleString('pt-BR')}</span>
                    </div>
                    <div class="uf-compact-sub-stats" style="margin-top:4px;">
                        <div class="uf-sub-stat">
                            <span class="uf-sub-label" style="color:var(--text-secondary); font-size:10px;"><i class="fa-solid fa-percent"></i> Proporção:</span>
                            <span class="uf-sub-val" style="color:var(--text-secondary); font-size:10px; font-weight:700;">${rsPct}%</span>
                        </div>
                    </div>
                </div>
                <!-- Barra de progresso empilhada colorira proporcional -->
                <div class="uf-stacked-bar" style="display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 8px; background: rgba(0,0,0,0.08);" title="Pedido: ${rsPedPct}%, Aprovado: ${rsAprovPct}%, Sem Aprovação: ${rsSemAprovPct}%">
                    <div style="width: ${rsPedPct}%; background: #004f71;"></div>
                    <div style="width: ${rsAprovPct}%; background: #f39f18;"></div>
                    <div style="width: ${rsSemAprovPct}%; background: #ff5722;"></div>
                </div>
                <!-- Detalhes expandidos sob hover do mouse -->
                <div class="uf-card-details-expanded">
                    <div class="uf-detail-row">
                        <span class="uf-detail-label"><span class="uf-detail-bullet" style="background:#004f71;"></span> Pedido:</span>
                        <span class="uf-detail-value">${formatGestaoOsCurrency(ufDetails['RS'].comPed)}</span>
                    </div>
                    <div class="uf-detail-row">
                        <span class="uf-detail-label"><span class="uf-detail-bullet" style="background:#f39f18;"></span> Aprovado:</span>
                        <span class="uf-detail-value">${formatGestaoOsCurrency(ufDetails['RS'].aprov)}</span>
                    </div>
                    <div class="uf-detail-row">
                        <span class="uf-detail-label"><span class="uf-detail-bullet" style="background:#ff5722;"></span> S/ Aprovação:</span>
                        <span class="uf-detail-value">${formatGestaoOsCurrency(ufDetails['RS'].semAprov)}</span>
                    </div>
                </div>
            </div>

            <!-- Legenda de volume -->
            <div class="uf-discreet-legend">
                <span style="opacity:0.8;">Menor Valor</span>
                <div class="legend-gradient-bar"></div>
                <span style="opacity:0.8;">Maior Valor</span>
            </div>

            <!-- TOOLTIP DO MAPA -->
            <div class="map-tooltip" id="gestao_os-map-tooltip" style="display: none;"></div>
        </div>
    `;

    // Métodos de interação para hover e clique no mapa
    window.handleGestaoOsCardHover = (ufCode) => {
        const polygon = document.getElementById('gestao_os-state-' + ufCode);
        if (polygon) polygon.classList.add('hovered');
    };

    window.handleGestaoOsCardLeave = (ufCode) => {
        const polygon = document.getElementById('gestao_os-state-' + ufCode);
        if (polygon) polygon.classList.remove('hovered');
    };

    window.handleGestaoOsMapHover = (e, ufCode) => {
        const card = document.getElementById('gestao_os-card-UF-' + ufCode);
        if (card) card.classList.add('hovered');

        const tooltip = document.getElementById('gestao_os-map-tooltip');
        if (tooltip) {
            const isLight = document.body.classList.contains('light-theme');
            const labelColor = isLight ? '#1f2c3d' : '#f5f6f8';
            tooltip.style.display = 'block';
            tooltip.innerHTML = `
                <div style="font-family:'Outfit',sans-serif; min-width:160px; color: ${labelColor};">
                    <strong style="font-size:12px;">${ufCode === 'RS' ? 'Rio Grande do Sul' : ufCode === 'SC' ? 'Santa Catarina' : 'Paraná'}</strong><br/>
                    <span style="font-size:10px; opacity:0.85;">Total: ${formatGestaoOsCurrency(ufSums[ufCode])} (${ufOSs[ufCode].size.toLocaleString('pt-BR')} OSs)</span>
                    <hr style="border:0; border-top:1px dashed rgba(255,255,255,0.15); margin:6px 0;"/>
                    <div style="display:flex; flex-direction:column; gap:3px; font-size:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#004f71;"></span> Pedido:</span>
                            <strong>${formatGestaoOsCurrency(ufDetails[ufCode].comPed)}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#f39f18;"></span> Aprovado:</span>
                            <strong>${formatGestaoOsCurrency(ufDetails[ufCode].aprov)}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#ff5722;"></span> S/ Aprovação:</span>
                            <strong>${formatGestaoOsCurrency(ufDetails[ufCode].semAprov)}</strong>
                        </div>
                    </div>
                </div>
            `;
        }
    };

    window.handleGestaoOsMapMove = (e) => {
        const tooltip = document.getElementById('gestao_os-map-tooltip');
        if (tooltip) {
            // Posicionar o tooltip próximo ao cursor
            tooltip.style.left = (e.pageX + 15) + 'px';
            tooltip.style.top = (e.pageY + 15) + 'px';
        }
    };

    window.handleGestaoOsMapLeave = () => {
        ['RS', 'SC', 'PR'].forEach(ufCode => {
            const card = document.getElementById('gestao_os-card-UF-' + ufCode);
            if (card) card.classList.remove('hovered');
        });

        const tooltip = document.getElementById('gestao_os-map-tooltip');
        if (tooltip) tooltip.style.display = 'none';
    };

    window.toggleGestaoOsUFFromMap = (ufCode) => {
        const select = document.getElementById('gestao_os-filter-uf');
        if (select) {
            select.value = (select.value === ufCode) ? '' : ufCode;
            applyGestaoOsFilters();
        }
    };
}

// 4. Lista de OSs sem aprovação
// Alterna o modo de visualização da lista de OS
function switchGestaoOsOSListMode(mode) {
    gestao_osOsListMode = mode;
    // Atualizar botões de toggle
    document.querySelectorAll('.os-list-toggle-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(mode === 'sem-aprovacao' ? 'btn-os-sem-aprovacao' : 'btn-os-aprovadas');
    if (activeBtn) activeBtn.classList.add('active');
    renderOpenOSsList();
}

function renderOpenOSsList() {
    const tbody = document.getElementById('gestao_os-open-oss-list-tbody');
    const thead = document.getElementById('gestao_os-os-list-thead');
    const titleEl = document.getElementById('gestao_os-os-list-title');
    if (!tbody) return;

    const fmtDate = dStr => {
        if (!dStr || dStr === '-') return '-';
        const p = dStr.split('-');
        if (p.length === 3) {
            const yearShort = p[0].substring(2); // '2024' -> '24'
            return `${p[2]}/${p[1]}/${yearShort}`;
        }
        return dStr;
    };

    const TH = `position: sticky; top: 0; background: var(--bg-card); border-bottom: 2px solid var(--border-color); z-index: 10;`;

    if (gestao_osOsListMode === 'aprovadas') {
        // ── Modo: Aprovadas Aguardando Pedido ───────────────────────────────
        if (titleEl) titleEl.textContent = 'OSs Aprovadas — Aguardando Pedido';
        if (thead) thead.innerHTML = `
            <tr style="${TH}">
                <th style="padding: 5px 3px; text-align: left; font-size: 8px; white-space: nowrap; max-width: 45px;">OS</th>
                <th style="padding: 5px 3px; text-align: left; font-size: 8px; white-space: nowrap; max-width: 70px;">Categoria</th>
                <th style="padding: 5px 3px; text-align: left; font-size: 8px; white-space: nowrap; max-width: 70px;">Proj. Ger.</th>
                <th style="padding: 5px 3px; text-align: left; font-size: 8px; white-space: nowrap; max-width: 70px;">Cidade</th>
                <th style="padding: 5px 3px; text-align: center; font-size: 8px; white-space: nowrap; max-width: 20px;">UF</th>
                <th style="padding: 5px 3px; text-align: left; font-size: 8px; white-space: nowrap; max-width: 50px;">Aprovação</th>
                <th style="padding: 5px 3px; text-align: center; font-size: 8px; white-space: nowrap; max-width: 45px;">Dias Aguard.</th>
                <th style="padding: 5px 3px; text-align: left; font-size: 8px; white-space: nowrap; max-width: 75px;">Fase Original</th>
                <th style="padding: 5px 3px; text-align: left; font-size: 8px; white-space: nowrap; max-width: 75px;">Fase (De/Para)</th>
            </tr>`;

        // Filtrar aprovadas sem pedido emitido
        const approvedOSs = gestao_osFilteredData.filter(r => {
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
                    projeto_gerencial: r.projeto_gerencial || '-',
                    cidade: r.cidade || '-',
                    uf: r.uf || '-',
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
            tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 20px; color: var(--text-secondary);">Nenhuma OS aprovada aguardando pedido</td></tr>`;
            return;
        }

        sorted.forEach(o => {
            const tr = document.createElement('tr');
            let agingClass = 'alert-none';
            if (o.diasAguard > 30) agingClass = 'alert-high';
            else if (o.diasAguard > 15) agingClass = 'alert-medium';
            else if (o.diasAguard > 7) agingClass = 'alert-low';
            const badgeClass = getGestaoOsBadgeClass(o.fase_atual_de_para);
            tr.innerHTML = `
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); white-space: nowrap; font-size: 8.5px; max-width: 45px; overflow: hidden; text-overflow: ellipsis;"><strong>${o.os}</strong></td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); white-space: nowrap; max-width: 70px; overflow: hidden; text-overflow: ellipsis; font-size: 8.5px;" title="${o.categoria}">${o.categoria}</td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); font-size: 8px; white-space: nowrap; max-width: 70px; overflow: hidden; text-overflow: ellipsis;" title="${o.projeto_gerencial}">${o.projeto_gerencial}</td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); white-space: nowrap; max-width: 70px; overflow: hidden; text-overflow: ellipsis; font-size: 8.5px;" title="${o.cidade}">${o.cidade}</td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); text-align: center; font-weight:600; white-space: nowrap; font-size: 8.5px; max-width: 20px;">${o.uf}</td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); white-space: nowrap; font-size: 8.5px; max-width: 50px;">${fmtDate(o.data_aprovacao)}</td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); text-align: center; white-space: nowrap; font-size: 8.5px; max-width: 45px;">
                    <span class="badge-aging ${agingClass}" style="padding: 1.5px 3px; font-size: 8px; min-width: 20px; display: inline-block;">${o.diasAguard >= 0 ? o.diasAguard + 'd' : '-'}</span>
                </td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); white-space: nowrap; max-width: 75px; overflow: hidden; text-overflow: ellipsis; font-size: 8.5px;" title="${o.fase_atual}">${o.fase_atual}</td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); white-space: nowrap; font-size: 8.5px; max-width: 75px;">
                    <span class="gestao_os-badge ${badgeClass}" style="padding: 1.5px 3px; font-size: 8px; max-width: 70px; display: inline-block; overflow: hidden; text-overflow: ellipsis; vertical-align: middle;">${o.fase_atual_de_para}</span>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } else {
        // ── Modo: Sem Aprovação (padrão) ────────────────────────────────────
        if (titleEl) titleEl.textContent = 'OSs Sem Aprovação (Aging)';
        if (thead) thead.innerHTML = `
            <tr style="${TH}">
                <th style="padding: 5px 3px; text-align: left; font-size: 8px; white-space: nowrap; max-width: 45px;">OS</th>
                <th style="padding: 5px 3px; text-align: left; font-size: 8px; white-space: nowrap; max-width: 70px;">Categoria</th>
                <th style="padding: 5px 3px; text-align: left; font-size: 8px; white-space: nowrap; max-width: 70px;">Proj. Ger.</th>
                <th style="padding: 5px 3px; text-align: left; font-size: 8px; white-space: nowrap; max-width: 70px;">Cidade</th>
                <th style="padding: 5px 3px; text-align: center; font-size: 8px; white-space: nowrap; max-width: 20px;">UF</th>
                <th style="padding: 5px 3px; text-align: left; font-size: 8px; white-space: nowrap; max-width: 50px;">Cadastro</th>
                <th style="padding: 5px 3px; text-align: left; font-size: 8px; white-space: nowrap; max-width: 50px;">Dt. Medição</th>
                <th style="padding: 5px 3px; text-align: center; font-size: 8px; white-space: nowrap; max-width: 35px;">Aging</th>
                <th style="padding: 5px 3px; text-align: left; font-size: 8px; white-space: nowrap; max-width: 75px;">Fase Original</th>
                <th style="padding: 5px 3px; text-align: left; font-size: 8px; white-space: nowrap; max-width: 75px;">Fase (De/Para)</th>
            </tr>`;

        const openOSs = gestao_osFilteredData.filter(r => {
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
                    projeto_gerencial: r.projeto_gerencial || '-',
                    cidade: r.cidade || '-',
                    uf: r.uf || '-',
                    projeto: r.projeto || '-',
                    fase_atual: r.fase_atual || '-',
                    fase_atual_de_para: r.fase_atual_de_para || '-',
                    data_cadastro: r.data_cadastro,
                    data_inclusao_lpu: r.data_inclusao_lpu || '-',
                    valor: 0,
                    aging: calculateOSAge(r.data_cadastro)
                };
            }
            osMap[osNum].valor += (r.valor_total || 0);
            if (r.data_cadastro && (!osMap[osNum].data_cadastro || r.data_cadastro < osMap[osNum].data_cadastro)) {
                osMap[osNum].data_cadastro = r.data_cadastro;
                osMap[osNum].aging = calculateOSAge(r.data_cadastro);
            }
            if (r.data_inclusao_lpu && r.data_inclusao_lpu !== '-' && (!osMap[osNum].data_inclusao_lpu || osMap[osNum].data_inclusao_lpu === '-' || r.data_inclusao_lpu < osMap[osNum].data_inclusao_lpu)) {
                osMap[osNum].data_inclusao_lpu = r.data_inclusao_lpu;
            }
        });

        const sortedOpenOSs = Object.values(osMap).sort((a, b) => {
            if (!a.data_cadastro) return 1;
            if (!b.data_cadastro) return -1;
            return a.data_cadastro.localeCompare(b.data_cadastro);
        });

        tbody.innerHTML = '';
        if (sortedOpenOSs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 20px; color: var(--text-secondary);">Nenhuma OS sem aprovação encontrada</td></tr>`;
            return;
        }

        sortedOpenOSs.forEach(o => {
            const tr = document.createElement('tr');
            let agingClass = 'alert-none';
            if (o.aging > 90) agingClass = 'alert-high';
            else if (o.aging > 60) agingClass = 'alert-medium';
            else if (o.aging > 30) agingClass = 'alert-low';
            const badgeClass = getGestaoOsBadgeClass(o.fase_atual_de_para);
            tr.innerHTML = `
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); white-space: nowrap; font-size: 8.5px; max-width: 45px; overflow: hidden; text-overflow: ellipsis;"><strong>${o.os}</strong></td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); white-space: nowrap; max-width: 70px; overflow: hidden; text-overflow: ellipsis; font-size: 8.5px;" title="${o.categoria}">${o.categoria}</td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); font-size: 8px; white-space: nowrap; max-width: 70px; overflow: hidden; text-overflow: ellipsis;" title="${o.projeto_gerencial}">${o.projeto_gerencial}</td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); white-space: nowrap; max-width: 70px; overflow: hidden; text-overflow: ellipsis; font-size: 8.5px;" title="${o.cidade}">${o.cidade}</td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); text-align: center; font-weight:600; white-space: nowrap; font-size: 8.5px; max-width: 20px;">${o.uf}</td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); white-space: nowrap; font-size: 8.5px; max-width: 50px;">${fmtDate(o.data_cadastro)}</td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); white-space: nowrap; font-size: 8.5px; max-width: 50px;">${fmtDate(o.data_inclusao_lpu)}</td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); text-align: center; white-space: nowrap; font-size: 8.5px; max-width: 35px;">
                    <span class="badge-aging ${agingClass}" style="padding: 1.5px 3px; font-size: 8px; min-width: 20px; display: inline-block;">${o.aging}d</span>
                </td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); white-space: nowrap; max-width: 75px; overflow: hidden; text-overflow: ellipsis; font-size: 8.5px;" title="${o.fase_atual}">${o.fase_atual}</td>
                <td style="padding: 5px 3px; border-bottom: 1px solid var(--border-color); white-space: nowrap; font-size: 8.5px; max-width: 75px;">
                    <span class="gestao_os-badge ${badgeClass}" style="padding: 1.5px 3px; font-size: 8px; max-width: 70px; display: inline-block; overflow: hidden; text-overflow: ellipsis; vertical-align: middle;">${o.fase_atual_de_para}</span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// ── Exportador Genérico para Excel Formatado ───────────────────────────────
function exportToStyledExcel(headers, rows, filename) {
    if (typeof XLSX === 'undefined') {
        alert("Erro: Biblioteca Excel (xlsx-js-style) não foi carregada com sucesso.");
        return;
    }

    // Criar planilha a partir de matriz de dados
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Aplicar estilos ao cabeçalho (linha 1)
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
        if (ws[cellAddress]) {
            ws[cellAddress].s = {
                fill: {
                    fgColor: { rgb: "1F4E78" } // Cabeçalho Azul Escuro
                },
                font: {
                    color: { rgb: "FFFFFF" }, // Texto Branco
                    bold: true,
                    name: 'Segoe UI',
                    sz: 11
                },
                alignment: {
                    horizontal: "center",
                    vertical: "center",
                    wrapText: true
                }
            };
        }
    }

    // Calcular largura automática das colunas
    const colsWidth = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
        let maxLength = headers[c] ? headers[c].length : 10;
        for (let r = range.s.r + 1; r <= range.e.r; r++) {
            const cellAddress = XLSX.utils.encode_cell({ r: r, c: c });
            if (ws[cellAddress] && ws[cellAddress].v !== undefined) {
                let valStr = String(ws[cellAddress].v);
                if (typeof ws[cellAddress].v === 'number') {
                    valStr = ws[cellAddress].v % 1 === 0 ? ws[cellAddress].v.toString() : ws[cellAddress].v.toFixed(2);
                }
                if (valStr.length > maxLength) {
                    maxLength = valStr.length;
                }
            }
        }
        colsWidth.push({ wch: maxLength + 4 }); // Padding extra para que todo texto fique visível
    }
    ws['!cols'] = colsWidth;

    // Congelar a primeira linha (cabeçalho)
    ws['!views'] = [
        { state: 'frozen', ySplit: 1 }
    ];

    // Criar o workbook e salvar o arquivo
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });

    function s2ab(s) {
        const buf = new ArrayBuffer(s.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
        return buf;
    }

    const blob = new Blob([s2ab(wbout)], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Tornar o exportador genérico disponível na janela global para reuso
window.exportToStyledExcel = exportToStyledExcel;

// ── Exportar Excel da Lista de OSs ───────────────────────────────────────────
function exportGestaoOsOSListXLSX() {
    const fmtD = dStr => {
        if (!dStr || dStr === '-') return '-';
        const p = dStr.split('-');
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : dStr;
    };

    let rows, headers, filename;

    if (gestao_osOsListMode === 'aprovadas') {
        filename = 'OSs_Aprovadas_Aguardando_Pedido.xlsx';
        headers = ['OS', 'Categoria', 'Proj. Gerencial', 'Cidade', 'UF', 'Data Aprovação', 'Dias Aguardando', 'Fase Atual (Original)', 'Fase (De/Para)'];
        const src = gestao_osFilteredData.filter(r => String(r.fase_atual_de_para || '').toUpperCase().trim() === 'APROVADO' && r.os && r.os !== '-');
        const m = {};
        src.forEach(r => {
            if (!m[r.os]) m[r.os] = { os: r.os, categoria: r.categoria || '-', pg: r.projeto_gerencial || '-', cidade: r.cidade || '-', uf: r.uf || '-', fa: r.fase_atual || '-', fp: r.fase_atual_de_para || '-', da: r.data_aprovacao || '-', v: 0, d: calculateOSAge(r.data_aprovacao) };
            m[r.os].v += (r.valor_total || 0);
            if (r.data_aprovacao && r.data_aprovacao !== '-' && (!m[r.os].da || r.data_aprovacao < m[r.os].da)) { m[r.os].da = r.data_aprovacao; m[r.os].d = calculateOSAge(r.data_aprovacao); }
        });
        rows = Object.values(m).sort((a, b) => (a.da || '').localeCompare(b.da || '')).map(o => [o.os, o.categoria, o.pg, o.cidade, o.uf, fmtD(o.da), o.d >= 0 ? o.d : '-', o.fa, o.fp]);
    } else {
        filename = 'OSs_Sem_Aprovação.xlsx';
        headers = ['OS', 'Categoria', 'Proj. Gerencial', 'Cidade', 'UF', 'Data Cadastro', 'Data Medição', 'Aging (dias)', 'Fase Atual (Original)', 'Fase (De/Para)'];
        const src = gestao_osFilteredData.filter(r => (!r.data_aprovacao || r.data_aprovacao === '-') && r.os && r.os !== '-');
        const m = {};
        src.forEach(r => {
            if (!m[r.os]) m[r.os] = { os: r.os, categoria: r.categoria || '-', pg: r.projeto_gerencial || '-', cidade: r.cidade || '-', uf: r.uf || '-', fa: r.fase_atual || '-', fp: r.fase_atual_de_para || '-', dc: r.data_cadastro, dm: r.data_inclusao_lpu || '-', v: 0, ag: calculateOSAge(r.data_cadastro) };
            m[r.os].v += (r.valor_total || 0);
            if (r.data_cadastro && (!m[r.os].dc || r.data_cadastro < m[r.os].dc)) { m[r.os].dc = r.data_cadastro; m[r.os].ag = calculateOSAge(r.data_cadastro); }
            if (r.data_inclusao_lpu && r.data_inclusao_lpu !== '-' && (!m[r.os].dm || m[r.os].dm === '-' || r.data_inclusao_lpu < m[r.os].dm)) { m[r.os].dm = r.data_inclusao_lpu; }
        });
        rows = Object.values(m).sort((a, b) => (a.dc || '').localeCompare(b.dc || '')).map(o => [o.os, o.categoria, o.pg, o.cidade, o.uf, fmtD(o.dc), fmtD(o.dm), o.ag, o.fa, o.fp]);
    }

    exportToStyledExcel(headers, rows, filename);
}

// ── Renderização dos Gráficos Chart.js ──────────────────────────────────────
function renderGestaoOsCharts() {
    if (gestao_osActiveTab !== 'indicators') return;

    // Destruir gráficos antigos para evitar overlap
    Object.keys(gestao_osCharts).forEach(k => {
        if (gestao_osCharts[k]) {
            gestao_osCharts[k].destroy();
            gestao_osCharts[k] = null;
        }
    });

    const th = getGestaoOsThemeVars();
    Chart.defaults.color = th.textColor;
    Chart.defaults.font.family = "'Outfit', 'Inter', sans-serif";

    // 1. Gráfico CAPEX / OPEX (Donut)
    renderCapexOpexChart(th);

    // 2. Gráfico Valor Mensal com/sem pedido (Barras Empilhadas)
    renderMonthlySplitChart(th);

    // 3. Gráfico Atividade (Barras Horizontais)
    renderHorizontalChart('gestao_os-activity-chart', 'tipo_atividade', 'activity', th, null);

    // 4. Gráfico Itens (Barras Horizontais - Todos os itens com scroll)
    renderHorizontalChart('gestao_os-item-chart', 'item_descritivo', 'item', th, null);

    // 5. Gráfico Fase Atual Original (Barras Horizontais)
    renderHorizontalChart('gestao_os-fase-atual-chart', 'fase_atual', 'faseAtual', th, null);
}

// Gráfico CAPEX/OPEX
function renderCapexOpexChart(th) {
    const canvas = document.getElementById('gestao_os-capex-opex-chart');
    if (!canvas) return;

    const capexOpexSum = {};
    gestao_osFilteredData.forEach(r => {
        const type = r.tipo_despesa || 'OUTROS';
        capexOpexSum[type] = (capexOpexSum[type] || 0) + 1;
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

    // Destaque se filtro ativo
    const activeTipoDespesa = gestao_osClickFilters.tipo_despesa;
    const bgColors = colorPalette.slice(0, labels.length).map((c, i) => {
        if (!activeTipoDespesa) return c;
        return labels[i] === activeTipoDespesa ? c : c + '55';
    });

    gestao_osCharts.capexOpex = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: bgColors,
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
            onClick: (evt, elements) => {
                if (!elements.length) return;
                const idx = elements[0].index;
                const label = labels[idx];
                toggleGestaoOsChartFilter('tipo_despesa', label);
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12, padding: 16 },
                    onClick: (evt, legendItem, legend) => {
                        const label = legendItem.text;
                        toggleGestaoOsChartFilter('tipo_despesa', label);
                    }
                },
                tooltip: {
                    backgroundColor: th.tooltipBg,
                    titleColor: th.tooltipText,
                    bodyColor: th.tooltipText,
                    borderColor: th.tooltipBorder,
                    borderWidth: 1,
                    callbacks: {
                        label: (ctx) => {
                            const active = gestao_osClickFilters.tipo_despesa === ctx.label ? ' ● Filtro ativo' : ' (clique para filtrar)';
                            return ` ${ctx.label}: ${formatGestaoOsCurrency(ctx.raw)}${active}`;
                        }
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


// Gráfico Valor Mensal (Pedido Emitido vs Sem Aprovação vs Aprovado Aguardando Pedido) - Barras Empilhadas
function renderMonthlySplitChart(th) {
    const canvas = document.getElementById('gestao_os-monthly-split-chart');
    if (!canvas) return;

    // Calcular o valor total sem aprovação
    let totalSemAprov = 0;
    gestao_osFilteredData.forEach(r => {
        const faseDePara = String(r.fase_atual_de_para || '').toUpperCase().trim();
        if (faseDePara !== 'PEDIDO EMITIDO' && faseDePara !== 'APROVADO') {
            totalSemAprov += 1;
        }
    });
    const totalSemAprovEl = document.getElementById('gestao_os-monthly-total-sem-aprovacao');
    if (totalSemAprovEl) {
        totalSemAprovEl.innerHTML = `Sem Aprovação: <strong>${formatGestaoOsCurrency(totalSemAprov)}</strong>`;
    }

    const dtInicio = document.getElementById('gestao_os-filter-data-inicio')?.value || '';
    const dtFim = document.getElementById('gestao_os-filter-data-fim')?.value || '';
    
    let isSingleMonthFiltered = false;
    let filterYear = '';
    let filterMonth = '';
    
    if (dtInicio && dtFim) {
        const startParts = dtInicio.split('-');
        const endParts = dtFim.split('-');
        if (startParts[0] === endParts[0] && startParts[1] === endParts[1]) {
            isSingleMonthFiltered = true;
            filterYear = startParts[0];
            filterMonth = startParts[1];
        }
    }

    const backBtn = document.getElementById('gestao_os-drilldown-back-btn');
    if (backBtn) {
        backBtn.style.display = isSingleMonthFiltered ? 'inline-flex' : 'none';
    }

    let labels = [];
    let sortedKeys = [];
    let comPedData = [];
    let aprovData = [];
    let semAprovData = [];
    
    if (isSingleMonthFiltered) {
        const lastDay = new Date(parseInt(filterYear), parseInt(filterMonth), 0).getDate();
        const dailyMetrics = {};
        for (let day = 1; day <= lastDay; day++) {
            const dayStr = String(day).padStart(2, '0');
            const dateKey = `${filterYear}-${filterMonth}-${dayStr}`;
            dailyMetrics[dateKey] = { comPed: 0, aprov: 0, semAprov: 0 };
        }
        
        gestao_osFilteredData.forEach(r => {
            const d = getGestaoOsRefDate(r);
            if (d && dailyMetrics[d]) {
                const faseDePara = String(r.fase_atual_de_para || '').toUpperCase().trim();
                if (faseDePara === 'PEDIDO EMITIDO') {
                    dailyMetrics[d].comPed += 1;
                } else if (faseDePara === 'APROVADO') {
                    dailyMetrics[d].aprov += 1;
                } else {
                    dailyMetrics[d].semAprov += 1;
                }
            }
        });
        
        sortedKeys = Object.keys(dailyMetrics).sort();
        labels = sortedKeys.map(d => {
            const parts = d.split('-');
            return `${parts[2]}/${parts[1]}`; // DD/MM format
        });
        
        comPedData = sortedKeys.map(d => dailyMetrics[d].comPed);
        aprovData = sortedKeys.map(d => dailyMetrics[d].aprov);
        semAprovData = sortedKeys.map(d => dailyMetrics[d].semAprov);
    } else {
        const monthlyMetrics = {}; // 'YYYY/MM' => { comPed: X, aprov: Y, semAprov: Z }
        gestao_osFilteredData.forEach(r => {
            const m = r.mes_medicao || 'N/D';
            if (!monthlyMetrics[m]) {
                monthlyMetrics[m] = { comPed: 0, aprov: 0, semAprov: 0 };
            }
            
            const faseDePara = String(r.fase_atual_de_para || '').toUpperCase().trim();
            if (faseDePara === 'PEDIDO EMITIDO') {
                monthlyMetrics[m].comPed += 1;
            } else if (faseDePara === 'APROVADO') {
                monthlyMetrics[m].aprov += 1;
            } else {
                monthlyMetrics[m].semAprov += 1;
            }
        });
        
        sortedKeys = Object.keys(monthlyMetrics).sort();
        labels = sortedKeys.map(m => {
            const parts = m.split('/');
            return parts.length === 2 ? `${parts[1]}/${parts[0]}` : m;
        });
        
        comPedData = sortedKeys.map(m => monthlyMetrics[m].comPed);
        aprovData = sortedKeys.map(m => monthlyMetrics[m].aprov);
        semAprovData = sortedKeys.map(m => monthlyMetrics[m].semAprov);
    }

    gestao_osCharts.monthlySplit = new Chart(canvas, {
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
                    label: 'Aprovado Aguardando Pedido',
                    data: aprovData,
                    backgroundColor: '#f39f18',
                    borderColor: '#f39f18',
                    borderRadius: 2,
                    hoverBackgroundColor: '#ffb83d',
                    hoverBorderColor: '#ffffff',
                    hoverBorderWidth: 2,
                    datalabels: {
                        display: false
                    }
                },
                {
                    label: 'Sem Aprovação',
                    data: semAprovData,
                    backgroundColor: '#ff5722',
                    borderColor: '#ff5722',
                    borderRadius: 2,
                    hoverBackgroundColor: '#ff784e',
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
                            const aprovVal = context.chart.data.datasets[1].data[index] || 0;
                            const semAprovVal = context.chart.data.datasets[2].data[index] || 0;
                            const total = comPedVal + aprovVal + semAprovVal;
                            return total > 0 ? formatGestaoOsShortVal(total) : '';
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
                    if (isSingleMonthFiltered) {
                        const dayKey = sortedKeys[index];
                        if (dayKey) {
                            const startInput = document.getElementById('gestao_os-filter-data-inicio');
                            const endInput = document.getElementById('gestao_os-filter-data-fim');
                            if (startInput && endInput) {
                                startInput.value = dayKey;
                                endInput.value = dayKey;
                                applyGestaoOsFilters();
                            }
                        }
                    } else {
                        const monthYear = sortedKeys[index];
                        if (monthYear && monthYear !== 'N/D') {
                            const [year, month] = monthYear.split('/');
                            const start = `${year}-${month}-01`;
                            const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                            const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
                            
                            const startInput = document.getElementById('gestao_os-filter-data-inicio');
                            const endInput = document.getElementById('gestao_os-filter-data-fim');
                            if (startInput && endInput) {
                                startInput.value = start;
                                endInput.value = end;
                                applyGestaoOsFilters();
                            }
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
                    top: 15,
                    bottom: 0
                }
            },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: {
                    stacked: true,
                    grid: { color: th.gridColor },
                    ticks: {
                        callback: (val) => formatGestaoOsShortVal(val)
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 12
                    }
                },
                tooltip: {
                    backgroundColor: th.tooltipBg,
                    titleColor: th.tooltipText,
                    bodyColor: th.tooltipText,
                    borderColor: th.tooltipBorder,
                    borderWidth: 1,
                    callbacks: {
                        label: (ctx) => ` ${ctx.dataset.label}: ${formatGestaoOsCurrency(ctx.raw)}`
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

    // Agrupar valores por categoria e por fase (Pedido / Aprovado / Sem Aprovação)
    const groupData = {};
    gestao_osFilteredData.forEach(r => {
        const cat = r[fieldName] || 'N/D';
        if (!groupData[cat]) groupData[cat] = { comPed: 0, aprov: 0, semAprov: 0 };
        const fase = String(r.fase_atual_de_para || '').toUpperCase().trim();
        if (fase === 'PEDIDO EMITIDO') {
            groupData[cat].comPed += 1;
        } else if (fase === 'APROVADO') {
            groupData[cat].aprov += 1;
        } else {
            groupData[cat].semAprov += 1;
        }
    });

    // Ordenar pelo total e pegar top N
    let sorted = Object.keys(groupData)
        .map(key => ({ key, total: groupData[key].comPed + groupData[key].aprov + groupData[key].semAprov }))
        .sort((a, b) => b.total - a.total);

    if (limit !== null && limit !== undefined) {
        sorted = sorted.slice(0, limit);
    }

    const labels = sorted.map(i => i.key);
    const comPedData  = sorted.map(i => groupData[i.key].comPed);
    const aprovData   = sorted.map(i => groupData[i.key].aprov);
    const semAprovData = sorted.map(i => groupData[i.key].semAprov);

    if (labels.length === 0) return;

    // Altura dinâmica para rolagem vertical se for um dos gráficos de barras horizontais roláveis
    if (canvas && canvas.parentElement) {
        if (canvasId === 'gestao_os-item-chart' || canvasId === 'gestao_os-activity-chart' || canvasId === 'gestao_os-fase-atual-chart') {
            const itemHeight = 45;
            const minHeight = 320;
            const calculatedHeight = sorted.length * itemHeight;
            canvas.parentElement.style.height = Math.max(minHeight, calculatedHeight) + 'px';
        } else {
            canvas.parentElement.style.height = '320px';
        }
    }

    // Campo de filtro de clique
    const filterField = fieldName === 'tipo_atividade' ? 'tipo_atividade'
                      : fieldName === 'fase_atual'     ? 'fase_atual'
                      : fieldName === 'item_descritivo'? 'item_descritivo'
                      : null;
    const activeFilter = filterField ? gestao_osClickFilters[filterField] : null;

    gestao_osCharts[chartKey] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Pedido Emitido',
                    data: comPedData,
                    backgroundColor: labels.map(l => activeFilter && l !== activeFilter ? 'rgba(0,79,113,0.25)' : '#004f71'),
                    borderColor: '#004f71',
                    borderWidth: 1,
                    borderRadius: 2,
                    hoverBackgroundColor: '#0077aa',
                    datalabels: { display: false }
                },
                {
                    label: 'Aprovado Aguardando Pedido',
                    data: aprovData,
                    backgroundColor: labels.map(l => activeFilter && l !== activeFilter ? 'rgba(243,159,24,0.2)' : '#f39f18'),
                    borderColor: '#f39f18',
                    borderWidth: 1,
                    borderRadius: 2,
                    hoverBackgroundColor: '#ffb83d',
                    datalabels: { display: false }
                },
                {
                    label: 'Sem Aprovação',
                    data: semAprovData,
                    backgroundColor: labels.map(l => activeFilter && l !== activeFilter ? 'rgba(255,87,34,0.2)' : '#ff5722'),
                    borderColor: '#ff5722',
                    borderWidth: 1,
                    borderRadius: 2,
                    hoverBackgroundColor: '#ff784e',
                    datalabels: {
                        display: true,
                        align: 'end',
                        anchor: 'end',
                        color: th.textColor,
                        font: { size: 9, weight: 'bold' },
                        formatter: (val, ctx) => {
                            const idx = ctx.dataIndex;
                            const total = comPedData[idx] + aprovData[idx] + semAprovData[idx];
                            return total > 0 ? formatGestaoOsShortVal(total) : '';
                        }
                    }
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            onClick: (evt, elements) => {
                if (!elements.length) return;
                const idx = elements[0].index;
                const label = labels[idx];
                if (filterField) toggleGestaoOsChartFilter(filterField, label);
            },
            layout: {
                padding: { right: 45 }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { color: th.gridColor },
                    ticks: { callback: (val) => formatGestaoOsShortVal(val) }
                },
                y: {
                    stacked: true,
                    grid: { display: false },
                    ticks: {
                        font: { size: 10 },
                        callback: function(valIndex) {
                            const label = this.getLabelForValue(valIndex);
                            return label.length > 25 ? label.substring(0, 22) + '...' : label;
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        padding: 12,
                        font: { size: 10 },
                        color: th.textColor
                    }
                },
                tooltip: {
                    backgroundColor: th.tooltipBg,
                    titleColor: th.tooltipText,
                    bodyColor: th.tooltipText,
                    borderColor: th.tooltipBorder,
                    borderWidth: 1,
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.raw === 0) return null;
                            const active = filterField && gestao_osClickFilters[filterField] === ctx.label ? ' ● Filtro ativo' : ' (clique para filtrar)';
                            return ` ${ctx.dataset.label}: ${formatGestaoOsCurrency(ctx.raw)}${active}`;
                        }
                    }
                }
            }
        }
    });
}


// ── Tabela do Relatório Analítico ───────────────────────────────────────────
function getGestaoOsTableData() {
    let data = [...gestao_osFilteredData];

    // Busca textual global
    if (gestao_osSearchQuery) {
        const q = gestao_osSearchQuery.trim().toUpperCase();
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
    if (gestao_osSortCol) {
        data.sort((a, b) => {
            let va = a[gestao_osSortCol];
            let vb = b[gestao_osSortCol];

            if (va === null || va === undefined) return gestao_osSortDir === 'asc' ? 1 : -1;
            if (vb === null || vb === undefined) return gestao_osSortDir === 'asc' ? -1 : 1;

            if (typeof va === 'number' && typeof vb === 'number') {
                return gestao_osSortDir === 'asc' ? va - vb : vb - va;
            }

            va = va.toString().toUpperCase();
            vb = vb.toString().toUpperCase();
            return gestao_osSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        });
    }

    return data;
}

function renderGestaoOsTable() {
    if (gestao_osActiveTab !== 'report') return;

    const data = getGestaoOsTableData();
    const tbody = document.getElementById('gestao_os-table-body');
    if (!tbody) return;

    const totalCount = data.length;
    document.getElementById('gestao_os-results-count').textContent = `${totalCount.toLocaleString('pt-BR')} registros encontrados`;

    const totalPages = Math.ceil(totalCount / GESTAO_OS_PAGE_SIZE);
    if (gestao_osCurrentPage > totalPages && totalPages > 0) gestao_osCurrentPage = totalPages;

    const start = (gestao_osCurrentPage - 1) * GESTAO_OS_PAGE_SIZE;
    const end = Math.min(start + GESTAO_OS_PAGE_SIZE, totalCount);

    tbody.innerHTML = '';

    if (totalCount === 0) {
        tbody.innerHTML = `<tr><td colspan="22" style="text-align:center;color:var(--text-secondary);padding:40px 0;">Nenhum registro encontrado.</td></tr>`;
        document.getElementById('gestao_os-page-info').textContent = 'Pág. 0 de 0';
        document.getElementById('gestao_os-pagination-btns').innerHTML = '';
        return;
    }

    document.getElementById('gestao_os-page-info').textContent = `Exibindo ${start + 1}-${end} de ${totalCount} (Pág. ${gestao_osCurrentPage}/${totalPages})`;

    renderGestaoOsPagination(totalPages);

    const items = data.slice(start, end);
    items.forEach(r => {
        const tr = document.createElement('tr');
        
        // Tratar datas de cadastro e aprovação
        const fmtDate = dStr => {
            if (!dStr || dStr === '-') return '-';
            const p = dStr.split('-');
            return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : dStr;
        };

        const badgeClass = getGestaoOsBadgeClass(r.fase_atual_de_para);

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
            <td data-label="Dt. Cadastro">${fmtDate(r.data_cadastro)}</td>
            <td data-label="Dt. Aprovação">${fmtDate(r.data_aprovacao)}</td>
            <td data-label="Tempo Aprov.">${r.tempo_aprovacao !== null && r.tempo_aprovacao !== undefined ? r.tempo_aprovacao + ' dias' : 'Em aberto'}</td>
            <td data-label="User Incl. Medição">${r.user_inclusao_medicao || '-'}</td>
            <td data-label="PEP">${r.pep || '-'}</td>
            <td data-label="Nº Medição">${r.numero_medicao || '-'}</td>
            <td data-label="Nº Pedido">${r.numero_pedido || '-'}</td>
            <td data-label="User Pedido">${r.user_pedido || '-'}</td>
            <td data-label="Fase (De/Para)"><span class="gestao_os-badge ${badgeClass}">${r.fase_atual_de_para || '-'}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// Ordenar Tabela
function sortGestaoOsTable(column) {
    if (gestao_osSortCol === column) {
        gestao_osSortDir = gestao_osSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        gestao_osSortCol = column;
        gestao_osSortDir = 'asc';
    }

    document.querySelectorAll('#gestao_os-table th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        const onclickAttr = th.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${column}'`)) {
            th.classList.add(gestao_osSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    gestao_osCurrentPage = 1;
    renderGestaoOsTable();
}

// Paginação
function renderGestaoOsPagination(totalPages) {
    const container = document.getElementById('gestao_os-pagination-btns');
    if (!container) return;
    container.innerHTML = '';

    const btnPrev = document.createElement('button');
    btnPrev.className = 'gestao_os-page-btn';
    btnPrev.innerHTML = '<i class="fa-solid fa-angle-left"></i>';
    btnPrev.disabled = gestao_osCurrentPage === 1;
    btnPrev.onclick = () => { if (gestao_osCurrentPage > 1) { gestao_osCurrentPage--; renderGestaoOsTable(); } };
    container.appendChild(btnPrev);

    const pagesToShow = [];
    if (totalPages <= 5) {
        for (let i = 1; i <= totalPages; i++) pagesToShow.push(i);
    } else {
        pagesToShow.push(1);
        if (gestao_osCurrentPage > 3) pagesToShow.push('...');
        
        const startPage = Math.max(2, gestao_osCurrentPage - 1);
        const endPage = Math.min(totalPages - 1, gestao_osCurrentPage + 1);
        for (let i = startPage; i <= endPage; i++) {
            if (!pagesToShow.includes(i)) pagesToShow.push(i);
        }
        
        if (gestao_osCurrentPage < totalPages - 2) pagesToShow.push('...');
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
            btn.className = `gestao_os-page-btn${gestao_osCurrentPage === p ? ' active' : ''}`;
            btn.textContent = p;
            btn.onclick = () => { gestao_osCurrentPage = p; renderGestaoOsTable(); };
            container.appendChild(btn);
        }
    });

    const btnNext = document.createElement('button');
    btnNext.className = 'gestao_os-page-btn';
    btnNext.innerHTML = '<i class="fa-solid fa-angle-right"></i>';
    btnNext.disabled = gestao_osCurrentPage === totalPages;
    btnNext.onclick = () => { if (gestao_osCurrentPage < totalPages) { gestao_osCurrentPage++; renderGestaoOsTable(); } };
    container.appendChild(btnNext);
}

// Exportar Excel da Tabela Analítica de Cobrança
function exportGestaoOsXLSX() {
    try {
        const data = getGestaoOsTableData();
        if (data.length === 0) {
            alert('Nenhum dado para exportar.');
            return;
        }

        const headers = [
            'Categoria', 'OS', 'Cidade', 'UF', 'Projeto', 'Projeto Gerencial', 
            'Tipo de Atividade', 'Fase Atual', 'Contrato Número', 'Item Descritivo', 
            'Tipo de Despesa', 'Objeto do Contrato', 'Data Cadastro', 
            'Data Aprovação', 'Tempo Aprovação', 'Usuário Inclusão Medição', 'PEP', 
            'Número Medição', 'Número Pedido', 'Usuário Inclusão Pedido', 'Fase Atual (De Para)'
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

        const filename = `RELATORIO_GESTAO_OS_${new Date().toISOString().substring(0, 10)}.xlsx`;
        exportToStyledExcel(headers, rows, filename);
    } catch (err) {
        console.error("Erro ao exportar Excel:", err);
    }
}

// Obter classe badge adequada conforme a fase de-para mapeada
function getGestaoOsBadgeClass(fase) {
    if (!fase) return 'badge-default';
    const f = fase.toUpperCase().trim();
    if (f.includes('PEDIDO EMITIDO')) return 'ped-emitido';
    if (f.includes('FINALIZADO') || f.includes('EXECUTADO')) return 'finalizado';
    if (f.includes('APROVADO')) return 'aprovado';
    if (f.includes('CANCELADO')) return 'cancelado';
    return 'badge-default';
}

// Registrar funções no escopo global (window)
window.initGestaoOs = initGestaoOs;
window.applyGestaoOsFilters = applyGestaoOsFilters;
window.clearGestaoOsFilters = clearGestaoOsFilters;
window.resetGestaoOsDateFilter = resetGestaoOsDateFilter;
window.switchGestaoOsTab = switchGestaoOsTab;
window.sortGestaoOsTable = sortGestaoOsTable;
window.exportGestaoOsOSListXLSX = exportGestaoOsOSListXLSX;
window.exportGestaoOsXLSX = exportGestaoOsXLSX;
window.exportOSListCSV = exportGestaoOsOSListXLSX; // Fallback
window.exportGestaoOsCSV = exportGestaoOsXLSX; // Fallback
window.applyGestaoOsSearch = () => {
    const searchEl = document.getElementById('gestao_os-search');
    if (searchEl) {
        gestao_osSearchQuery = searchEl.value;
        gestao_osCurrentPage = 1;
        renderGestaoOsTable();
    }
};
