/**
 * ============================================================
 * sar_app.js — Lógica e Controlador do Dashboard SAR
 * BI JLE Telecom
 * ============================================================
 */

// Estado Global do Módulo SAR
let sarDataLoaded = false;
let sarFilteredData = [];
let sarPage = 1;
let sarPageSize = 50;
let sarSortColumn = 'data_entrada';
let sarSortOrder = 'desc';
let sarPerformanceSortColumn = 'total';
let sarPerformanceSortOrder = 'desc';

// Estado de visualização de Drill-down e Granularidade Temporal
let sarTimeGranularity = 'year'; // 'year', 'month', 'day'
let sarDrilldownYear = null;
let sarDrilldownMonth = null; // '01'..'12'
let sarDrilldownMonthLabel = null;

// Filtros do SAR
const sarFilters = {
    status: [],
    prazo: '',
    cidade: '',
    area_tecnica: '',
    competencia: ''
};

let sarSearchQuery = '';
let sarSearchDebounceTimer = null;

// Instâncias dos Gráficos Chart.js
const sarCharts = {
    status: null,
    cidade: null,
    evolution: null,
    prazo: null
};

// Meses em Português para ordenação cronológica
const MESES_MAP_PT = {
    "JANEIRO": 1, "FEVEREIRO": 2, "MARÇO": 3, "MARCO": 3, "ABRIL": 4,
    "MAIO": 5, "JUNHO": 6, "JULHO": 7, "AGOSTO": 8, "SETEMBRO": 9,
    "OUTUBRO": 10, "NOVEMBRO": 11, "DEZEMBRO": 12
};

const MESES_PT_LABEL = [
    "", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

const MESES_PT_FULL = [
    "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

/**
 * Inicializa o Módulo SAR
 */
function initSar() {
    if (sarDataLoaded) return;
    sarDataLoaded = true;

    if (!window.SAR_DATA || window.SAR_DATA.length === 0) {
        console.warn("Base SAR_DATA não encontrada ou vazia.");
        const tbody = document.getElementById('sar-table-body');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="16" style="text-align:center; color: var(--text-secondary); padding: 30px;">Nenhum dado SAR disponível. Verifique a execução do script update_sar.ps1.</td></tr>';
        }
        return;
    }

    populateSarFilterSelects();
    applySarFilters();
}

/**
 * Popula os menus dropdown dos filtros
 */
function populateSarFilterSelects() {
    const data = window.SAR_DATA || [];
    const meta = window.SAR_METADATA || {};

    // 1. Multi-select Status
    const statusDropdown = document.getElementById('sar-multiselect-status-dropdown');
    if (statusDropdown) {
        const uniqueStatus = meta.status_list || [...new Set(data.map(r => r.status).filter(Boolean))].sort();
        statusDropdown.innerHTML = uniqueStatus.map(st => `
            <div class="sar-multiselect-item" onclick="toggleSarStatusCheckbox('${st}', event)">
                <input type="checkbox" id="sar-chk-status-${st.replace(/\s+/g, '-')}" value="${st}" onchange="updateSarStatusSelected()">
                <label for="sar-chk-status-${st.replace(/\s+/g, '-')}">${st}</label>
            </div>
        `).join('');
    }

    // 2. Select Prazo
    const prazoSelect = document.getElementById('sar-filter-prazo');
    if (prazoSelect) {
        prazoSelect.innerHTML = `
            <option value="">Todos os Prazos</option>
            <option value="NO PRAZO">No Prazo</option>
            <option value="ATRASADO">Atrasado</option>
        `;
    }

    // 3. Select Cidade
    const cidadeSelect = document.getElementById('sar-filter-cidade');
    if (cidadeSelect) {
        const uniqueCidades = meta.cidades || [...new Set(data.map(r => r.cidade).filter(Boolean))].sort();
        cidadeSelect.innerHTML = '<option value="">Todas as Cidades</option>' + 
            uniqueCidades.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // 4. Select Área Técnica
    const areaSelect = document.getElementById('sar-filter-area');
    if (areaSelect) {
        const uniqueAreas = meta.areas_tecnicas || [...new Set(data.map(r => r.area_tecnica).filter(Boolean))].sort();
        areaSelect.innerHTML = '<option value="">Todas as Áreas Técnicas</option>' + 
            uniqueAreas.map(a => `<option value="${a}">${a}</option>`).join('');
    }

    // 5. Select Competência (Ordenação Cronológica)
    const compSelect = document.getElementById('sar-filter-competencia');
    if (compSelect) {
        const uniqueComps = [...new Set(data.map(r => r.competencia).filter(c => c && c !== 'NÃO INFORMADO'))];
        
        // Ordenar cronologicamente por Ano e Mês
        uniqueComps.sort((a, b) => {
            const [mesA, anoA] = a.split('/');
            const [mesB, anoB] = b.split('/');
            const valA = (parseInt(anoA) || 0) * 100 + (MESES_MAP_PT[mesA.toUpperCase()] || 0);
            const valB = (parseInt(anoB) || 0) * 100 + (MESES_MAP_PT[mesB.toUpperCase()] || 0);
            return valB - valA; // Mais recente primeiro
        });

        compSelect.innerHTML = '<option value="">Todas as Competências</option>' + 
            uniqueComps.map(c => `<option value="${c}">${c}</option>`).join('');
    }
}

/**
 * Toggle do Dropdown de Status (Multi-select)
 */
function toggleSarStatusDropdown(e) {
    if (e) e.stopPropagation();
    const container = document.getElementById('sar-multiselect-status-container');
    const dropdown = document.getElementById('sar-multiselect-status-dropdown');
    if (!container || !dropdown) return;

    const isActive = container.classList.contains('active');
    if (isActive) {
        container.classList.remove('active');
        dropdown.style.display = 'none';
    } else {
        container.classList.add('active');
        dropdown.style.display = 'block';
    }
}

function toggleSarStatusCheckbox(st, e) {
    if (e.target.tagName.toLowerCase() !== 'input') {
        const chk = document.getElementById(`sar-chk-status-${st.replace(/\s+/g, '-')}`);
        if (chk) {
            chk.checked = !chk.checked;
            updateSarStatusSelected();
        }
    }
}

function updateSarStatusSelected() {
    const checkboxes = document.querySelectorAll('#sar-multiselect-status-dropdown input[type="checkbox"]:checked');
    sarFilters.status = Array.from(checkboxes).map(c => c.value);

    const label = document.getElementById('sar-multiselect-status-value');
    if (label) {
        if (sarFilters.status.length === 0) {
            label.innerText = 'Todos os Status';
        } else if (sarFilters.status.length === 1) {
            label.innerText = sarFilters.status[0];
        } else {
            label.innerText = `${sarFilters.status.length} status selecionados`;
        }
    }

    applySarFilters();
}

// Fechar o multi-select ao clicar fora
document.addEventListener('click', function(e) {
    const container = document.getElementById('sar-multiselect-status-container');
    if (container && !container.contains(e.target)) {
        container.classList.remove('active');
        const dropdown = document.getElementById('sar-multiselect-status-dropdown');
        if (dropdown) dropdown.style.display = 'none';
    }
});

/**
 * Busca rápida com Debounce
 */
function onSarSearchInput(val) {
    clearTimeout(sarSearchDebounceTimer);
    sarSearchDebounceTimer = setTimeout(() => {
        sarSearchQuery = (val || '').trim().toLowerCase();
        applySarFilters();
    }, 200);
}

/**
 * Limpar todos os filtros do SAR
 */
function clearSarFilters() {
    sarFilters.status = [];
    sarFilters.prazo = '';
    sarFilters.cidade = '';
    sarFilters.area_tecnica = '';
    sarFilters.competencia = '';
    sarSearchQuery = '';

    const chks = document.querySelectorAll('#sar-multiselect-status-dropdown input[type="checkbox"]');
    chks.forEach(c => c.checked = false);

    const lbl = document.getElementById('sar-multiselect-status-value');
    if (lbl) lbl.innerText = 'Todos os Status';

    const pSel = document.getElementById('sar-filter-prazo');
    if (pSel) pSel.value = '';
    const cSel = document.getElementById('sar-filter-cidade');
    if (cSel) cSel.value = '';
    const aSel = document.getElementById('sar-filter-area');
    if (aSel) aSel.value = '';
    const compSel = document.getElementById('sar-filter-competencia');
    if (compSel) compSel.value = '';

    const searchInput = document.getElementById('sar-search-bar');
    if (searchInput) searchInput.value = '';

    sarTimeGranularity = 'year';
    sarDrilldownYear = null;
    sarDrilldownMonth = null;
    sarDrilldownMonthLabel = null;
    updateSarGranularityButtons();
    updateSarDrilldownBackButton();

    applySarFilters();
}

/**
 * Alterna granularidade temporal via botões
 */
function setSarTimeGranularity(gran) {
    sarTimeGranularity = gran;
    sarDrilldownYear = null;
    sarDrilldownMonth = null;
    sarDrilldownMonthLabel = null;
    updateSarGranularityButtons();
    updateSarDrilldownBackButton();
    renderSarEvolutionChart(sarFilteredData);
}

function updateSarGranularityButtons() {
    ['year', 'month', 'day'].forEach(g => {
        const btn = document.getElementById(`sar-btn-gran-${g}`);
        if (btn) {
            if (g === sarTimeGranularity && !sarDrilldownYear) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
}

function updateSarDrilldownBackButton() {
    const backBtn = document.getElementById('sar-drilldown-back-btn');
    if (!backBtn) return;
    if (sarDrilldownMonth) {
        backBtn.style.display = 'inline-flex';
        backBtn.innerHTML = `<i class="fa-solid fa-arrow-left"></i> Voltar p/ ${sarDrilldownYear}`;
    } else if (sarDrilldownYear) {
        backBtn.style.display = 'inline-flex';
        backBtn.innerHTML = `<i class="fa-solid fa-arrow-left"></i> Voltar p/ Anos`;
    } else {
        backBtn.style.display = 'none';
    }
}

function backFromSarDrilldown() {
    if (sarDrilldownMonth) {
        sarDrilldownMonth = null;
        sarDrilldownMonthLabel = null;
        sarTimeGranularity = 'month';
    } else if (sarDrilldownYear) {
        sarDrilldownYear = null;
        sarTimeGranularity = 'year';
    }
    updateSarGranularityButtons();
    updateSarDrilldownBackButton();
    renderSarEvolutionChart(sarFilteredData);
}

/**
 * Aplica os filtros e atualiza todas as visualizações
 */
function applySarFilters() {
    const data = window.SAR_DATA || [];

    const pSel = document.getElementById('sar-filter-prazo');
    if (pSel) sarFilters.prazo = pSel.value;
    const cSel = document.getElementById('sar-filter-cidade');
    if (cSel) sarFilters.cidade = cSel.value;
    const aSel = document.getElementById('sar-filter-area');
    if (aSel) sarFilters.area_tecnica = aSel.value;
    const compSel = document.getElementById('sar-filter-competencia');
    if (compSel) sarFilters.competencia = compSel.value;

    sarFilteredData = data.filter(r => {
        // Filtro Status
        if (sarFilters.status.length > 0 && !sarFilters.status.includes(r.status)) {
            return false;
        }
        // Filtro Prazo
        if (sarFilters.prazo && r.prazo !== sarFilters.prazo) {
            return false;
        }
        // Filtro Cidade
        if (sarFilters.cidade && r.cidade !== sarFilters.cidade) {
            return false;
        }
        // Filtro Área Técnica
        if (sarFilters.area_tecnica && r.area_tecnica !== sarFilters.area_tecnica) {
            return false;
        }
        // Filtro Competência
        if (sarFilters.competencia && r.competencia !== sarFilters.competencia) {
            return false;
        }
        // Filtro de Busca Rápida
        if (sarSearchQuery) {
            const match = 
                (r.cod && r.cod.toLowerCase().includes(sarSearchQuery)) ||
                (r.endereco && r.endereco.toLowerCase().includes(sarSearchQuery)) ||
                (r.cidade && r.cidade.toLowerCase().includes(sarSearchQuery)) ||
                (r.node && r.node.toLowerCase().includes(sarSearchQuery)) ||
                (r.site && r.site.toLowerCase().includes(sarSearchQuery)) ||
                (r.area_tecnica && r.area_tecnica.toLowerCase().includes(sarSearchQuery)) ||
                (r.classe_l && r.classe_l.toLowerCase().includes(sarSearchQuery)) ||
                (r.classe_f && r.classe_f.toLowerCase().includes(sarSearchQuery)) ||
                (r.servico && r.servico.toLowerCase().includes(sarSearchQuery)) ||
                (r.caixa_mdu && r.caixa_mdu.toLowerCase().includes(sarSearchQuery));
            if (!match) return false;
        }
        return true;
    });

    sarPage = 1;
    updateSarKpis(sarFilteredData);
    renderSarCharts(sarFilteredData);
    renderSarPerformanceTable(sarFilteredData);
    renderSarTable(sarFilteredData);
}

/**
 * Atualiza os Cards de KPIs
 */
function updateSarKpis(data) {
    const total = data.length;
    let noPrazoCount = 0;
    let atrasadoCount = 0;
    let somaTempo = 0;
    let countTempo = 0;
    let somaAtraso = 0;
    let countAtraso = 0;

    data.forEach(r => {
        if (r.prazo === 'NO PRAZO') noPrazoCount++;
        if (r.prazo === 'ATRASADO') {
            atrasadoCount++;
            if (r.atraso_dias > 0) {
                somaAtraso += r.atraso_dias;
                countAtraso++;
            }
        }
        if (r.tempo_dias > 0) {
            somaTempo += r.tempo_dias;
            countTempo++;
        }
    });

    const noPrazoPct = total > 0 ? ((noPrazoCount / total) * 100).toFixed(1) : '0.0';
    const atrasadoPct = total > 0 ? ((atrasadoCount / total) * 100).toFixed(1) : '0.0';
    const mediaTempo = countTempo > 0 ? (somaTempo / countTempo).toFixed(1) : '0.0';
    const mediaAtraso = countAtraso > 0 ? (somaAtraso / countAtraso).toFixed(1) : '0.0';

    // Elementos DOM
    const elTotal = document.getElementById('sar-kpi-total');
    if (elTotal) elTotal.innerText = total.toLocaleString('pt-BR');

    const elNoPrazo = document.getElementById('sar-kpi-no-prazo');
    const elNoPrazoPct = document.getElementById('sar-kpi-no-prazo-pct');
    if (elNoPrazo) elNoPrazo.innerText = noPrazoCount.toLocaleString('pt-BR');
    if (elNoPrazoPct) elNoPrazoPct.innerText = `${noPrazoPct}%`;

    const elAtrasado = document.getElementById('sar-kpi-atrasado');
    const elAtrasadoPct = document.getElementById('sar-kpi-atrasado-pct');
    if (elAtrasado) elAtrasado.innerText = atrasadoCount.toLocaleString('pt-BR');
    if (elAtrasadoPct) elAtrasadoPct.innerText = `${atrasadoPct}%`;

    const elTempoMedio = document.getElementById('sar-kpi-tempo-medio');
    const elTempoAtraso = document.getElementById('sar-kpi-tempo-atraso-detalhe');
    if (elTempoMedio) elTempoMedio.innerText = `${mediaTempo} dias`;
    if (elTempoAtraso) elTempoAtraso.innerText = `Atraso médio: ${mediaAtraso} dias`;
}

/**
 * Renderiza os Gráficos Chart.js
 */
function renderSarCharts(data) {
    renderSarStatusChart(data);
    renderSarCidadeChart(data);
    renderSarEvolutionChart(data);
    renderSarPrazoChart(data);
}

/**
 * Gráfico 1 (Superior Esquerdo): Distribuição por Status Geral (Colunas Verticais em Cor Única)
 */
function renderSarStatusChart(data) {
    const ctx = document.getElementById('sar-chart-status');
    if (!ctx) return;

    if (sarCharts.status) {
        sarCharts.status.destroy();
        sarCharts.status = null;
    }

    const statusCount = {};
    data.forEach(r => {
        const st = (r.status || 'NÃO INFORMADO').trim();
        statusCount[st] = (statusCount[st] || 0) + 1;
    });

    // Ordenar status por volume decrescente
    const sortedEntries = Object.entries(statusCount).sort((a, b) => b[1] - a[1]);
    const labels = sortedEntries.map(e => e[0]);
    const counts = sortedEntries.map(e => e[1]);
    const totalStatus = counts.reduce((a, b) => a + b, 0);

    const pluginList = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

    sarCharts.status = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'OSs SAR',
                data: counts,
                backgroundColor: 'rgba(56, 139, 253, 0.85)',
                borderColor: '#388bfd',
                borderWidth: 1,
                borderRadius: 4,
                barPercentage: 0.75,
                categoryPercentage: 0.85
            }]
        },
        plugins: pluginList,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#161b22',
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                    borderWidth: 1,
                    titleColor: '#ffffff',
                    bodyColor: '#c9d1d9',
                    callbacks: {
                        afterLabel: function(item) {
                            const pct = totalStatus > 0 ? ((item.parsed.y / totalStatus) * 100).toFixed(1) : '0';
                            return `Representatividade: ${pct}%`;
                        }
                    }
                },
                datalabels: {
                    display: true,
                    color: '#ffffff',
                    anchor: 'end',
                    align: 'top',
                    offset: 2,
                    font: { weight: 'bold', size: 10, family: 'Outfit, Inter' },
                    formatter: (val) => val > 0 ? val.toLocaleString('pt-BR') : ''
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#c9d1d9', font: { size: 10, family: 'Outfit, Inter' } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#8b949e', font: { size: 10 } },
                    beginAtZero: true,
                    grace: '10%'
                }
            }
        }
    });
}

/**
 * Gráfico 2 (Superior Direito): Top 8 Cidades por Volume
 */
function renderSarCidadeChart(data) {
    const ctx = document.getElementById('sar-chart-cidade');
    if (!ctx) return;

    if (sarCharts.cidade) {
        sarCharts.cidade.destroy();
        sarCharts.cidade = null;
    }

    const cityMap = {};
    data.forEach(r => {
        const c = r.cidade || 'OUTRAS';
        cityMap[c] = (cityMap[c] || 0) + 1;
    });

    const sortedCities = Object.entries(cityMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    const labels = sortedCities.map(x => x[0]);
    const counts = sortedCities.map(x => x[1]);

    const pluginList = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

    sarCharts.cidade = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'OSs SAR',
                data: counts,
                backgroundColor: 'rgba(56, 139, 253, 0.85)',
                borderColor: '#388bfd',
                borderWidth: 1,
                borderRadius: 4,
                barPercentage: 0.75,
                categoryPercentage: 0.85
            }]
        },
        plugins: pluginList,
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#161b22',
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                    borderWidth: 1
                },
                datalabels: {
                    display: true,
                    color: '#ffffff',
                    anchor: 'end',
                    align: 'right',
                    offset: 4,
                    font: { weight: 'bold', size: 10, family: 'Outfit, Inter' },
                    formatter: (val) => val > 0 ? val.toLocaleString('pt-BR') : ''
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#8b949e', font: { size: 10 } },
                    beginAtZero: true,
                    grace: '12%'
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#c9d1d9', font: { size: 10, family: 'Outfit, Inter' } }
                }
            }
        }
    });
}

/**
 * Gráfico 3 (Inferior Esquerdo): Evolução Temporal de Entradas com Drill-Down em 3 Níveis (Ano -> Mês -> Dia)
 */
function renderSarEvolutionChart(data) {
    const ctx = document.getElementById('sar-chart-evolution');
    if (!ctx) return;

    if (sarCharts.evolution) {
        sarCharts.evolution.destroy();
        sarCharts.evolution = null;
    }

    const titleEl = document.getElementById('sar-evolution-title');
    const pluginList = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

    let labels = [];
    let counts = [];
    let keys = [];
    let clickHandler = null;

    // Nível 1: Visão Anual
    if (sarTimeGranularity === 'year' && !sarDrilldownYear) {
        if (titleEl) titleEl.innerText = 'Evolução Anual de Entradas (Clique no ano para detalhar os meses)';

        const yearMap = {};
        data.forEach(r => {
            if (r.data_entrada) {
                const ano = r.data_entrada.substring(0, 4);
                if (ano && ano.length === 4) {
                    yearMap[ano] = (yearMap[ano] || 0) + 1;
                }
            }
        });

        keys = Object.keys(yearMap).sort();
        labels = keys.map(y => `Ano ${y}`);
        counts = keys.map(y => yearMap[y]);

        clickHandler = function(evt, elements) {
            if (elements && elements.length > 0) {
                const idx = elements[0].index;
                const clickedYear = keys[idx];
                sarDrilldownYear = clickedYear;
                sarTimeGranularity = 'month';
                updateSarGranularityButtons();
                updateSarDrilldownBackButton();
                renderSarEvolutionChart(data);
            }
        };

    // Nível 2: Visão Mensal
    } else if (sarTimeGranularity === 'month' || (sarDrilldownYear && !sarDrilldownMonth)) {
        const yearTarget = sarDrilldownYear;
        if (titleEl) {
            titleEl.innerText = yearTarget 
                ? `Evolução Mensal de Entradas — Ano ${yearTarget} (Clique no mês para ver os dias)`
                : `Evolução Mensal de Entradas (Clique no mês para ver os dias)`;
        }

        const monthMap = {};
        data.forEach(r => {
            if (r.data_entrada) {
                const rAno = r.data_entrada.substring(0, 4);
                if (!yearTarget || rAno === yearTarget) {
                    const ym = r.data_entrada.substring(0, 7); // YYYY-MM
                    const [ano, mes] = ym.split('-');
                    const mesNum = parseInt(mes);
                    const label = yearTarget ? (MESES_PT_LABEL[mesNum] || mes) : `${MESES_PT_LABEL[mesNum] || mes}/${ano.substring(2)}`;
                    
                    if (!monthMap[ym]) {
                        monthMap[ym] = { ym, label, count: 0, ano, mes };
                    }
                    monthMap[ym].count++;
                }
            }
        });

        keys = Object.keys(monthMap).sort();
        labels = keys.map(k => monthMap[k].label);
        counts = keys.map(k => monthMap[k].count);

        clickHandler = function(evt, elements) {
            if (elements && elements.length > 0) {
                const idx = elements[0].index;
                const item = monthMap[keys[idx]];
                sarDrilldownYear = item.ano;
                sarDrilldownMonth = item.mes;
                sarDrilldownMonthLabel = `${MESES_PT_FULL[parseInt(item.mes)]}/${item.ano}`;
                sarTimeGranularity = 'day';
                updateSarGranularityButtons();
                updateSarDrilldownBackButton();
                renderSarEvolutionChart(data);
            }
        };

    // Nível 3: Visão Diária
    } else {
        const ymTarget = (sarDrilldownYear && sarDrilldownMonth) ? `${sarDrilldownYear}-${sarDrilldownMonth}` : null;
        if (titleEl) {
            titleEl.innerText = sarDrilldownMonthLabel 
                ? `Evolução Diária de Entradas — ${sarDrilldownMonthLabel}`
                : `Evolução Diária de Entradas`;
        }

        const dayMap = {};
        data.forEach(r => {
            if (r.data_entrada) {
                if (!ymTarget || r.data_entrada.startsWith(ymTarget)) {
                    const day = r.data_entrada.substring(8, 10);
                    dayMap[day] = (dayMap[day] || 0) + 1;
                }
            }
        });

        keys = Object.keys(dayMap).sort((a, b) => parseInt(a) - parseInt(b));
        labels = keys.map(d => `Dia ${d}`);
        counts = keys.map(d => dayMap[d]);
    }

    sarCharts.evolution = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Entradas de OS',
                data: counts,
                backgroundColor: 'rgba(56, 139, 253, 0.85)',
                borderColor: '#388bfd',
                borderWidth: 1,
                borderRadius: 4,
                barPercentage: 0.75,
                categoryPercentage: 0.85
            }]
        },
        plugins: pluginList,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#161b22',
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                    borderWidth: 1,
                    titleColor: '#ffffff',
                    bodyColor: '#c9d1d9'
                },
                datalabels: {
                    display: true,
                    color: '#ffffff',
                    anchor: 'end',
                    align: 'top',
                    offset: 2,
                    font: { weight: 'bold', size: 10, family: 'Outfit, Inter' },
                    formatter: (val) => val > 0 ? val.toLocaleString('pt-BR') : ''
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#c9d1d9', font: { size: 10, family: 'Outfit, Inter' } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#8b949e', font: { size: 10 } },
                    beginAtZero: true,
                    grace: '10%'
                }
            },
            onClick: clickHandler
        }
    });
}

/**
 * Gráfico 4 (Inferior Direito): Distribuição de SLA (No Prazo vs Atrasado - Doughnut com Datalabels)
 */
function renderSarPrazoChart(data) {
    const ctx = document.getElementById('sar-chart-prazo');
    if (!ctx) return;

    if (sarCharts.prazo) {
        sarCharts.prazo.destroy();
        sarCharts.prazo = null;
    }

    let noPrazo = 0;
    let atrasado = 0;
    data.forEach(r => {
        if (r.prazo === 'NO PRAZO') noPrazo++;
        else if (r.prazo === 'ATRASADO') atrasado++;
    });

    const totalPrazo = noPrazo + atrasado;
    const pluginList = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

    sarCharts.prazo = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['No Prazo', 'Atrasado'],
            datasets: [{
                data: [noPrazo, atrasado],
                backgroundColor: ['#10b981', '#f85149'],
                borderColor: '#161b22',
                borderWidth: 2,
                hoverOffset: 6
            }]
        },
        plugins: pluginList,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#c9d1d9', font: { family: 'Outfit, Inter', size: 11 }, padding: 12 }
                },
                tooltip: {
                    backgroundColor: '#161b22',
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                    borderWidth: 1
                },
                datalabels: {
                    display: true,
                    color: '#ffffff',
                    font: { weight: 'bold', size: 11, family: 'Outfit, Inter' },
                    formatter: (val, ctx) => {
                        if (!val || totalPrazo === 0) return '';
                        const pct = ((val * 100) / totalPrazo).toFixed(1) + '%';
                        return `${val}\n(${pct})`;
                    }
                }
            }
        }
    });
}

/**
 * Tabela de Desempenho por Executor (Classe L / Classe F)
 */
function renderSarPerformanceTable(data) {
    const tbody = document.getElementById('sar-performance-table-body');
    const tfoot = document.getElementById('sar-performance-table-footer');
    if (!tbody) return;

    const execMap = {};
    data.forEach(r => {
        // Considerar executores de Linha e Fusão
        const execs = [r.classe_l, r.classe_f].filter(Boolean);
        if (execs.length === 0) execs.push('NÃO INFORMADO');

        execs.forEach(exec => {
            const exClean = exec.trim().toUpperCase();
            if (!execMap[exClean]) {
                execMap[exClean] = {
                    nome: exec.trim(),
                    total: 0,
                    noPrazo: 0,
                    atrasado: 0,
                    somaTempo: 0,
                    countTempo: 0
                };
            }
            execMap[exClean].total++;
            if (r.prazo === 'NO PRAZO') execMap[exClean].noPrazo++;
            else if (r.prazo === 'ATRASADO') execMap[exClean].atrasado++;
            if (r.tempo_dias > 0) {
                execMap[exClean].somaTempo += r.tempo_dias;
                execMap[exClean].countTempo++;
            }
        });
    });

    let execList = Object.values(execMap);

    // Ordenação
    execList.sort((a, b) => {
        let valA = a[sarPerformanceSortColumn] || 0;
        let valB = b[sarPerformanceSortColumn] || 0;
        if (sarPerformanceSortColumn === 'nome') {
            return sarPerformanceSortOrder === 'asc' ? a.nome.localeCompare(b.nome) : b.nome.localeCompare(a.nome);
        }
        return sarPerformanceSortOrder === 'asc' ? valA - valB : valB - valA;
    });

    if (execList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary); padding: 20px;">Nenhum executor encontrado no filtro.</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    let totalGeral = 0;
    let totalNoPrazo = 0;
    let totalAtrasado = 0;

    tbody.innerHTML = execList.map(item => {
        totalGeral += item.total;
        totalNoPrazo += item.noPrazo;
        totalAtrasado += item.atrasado;
        const pctNoPrazo = item.total > 0 ? ((item.noPrazo / item.total) * 100).toFixed(0) : '0';
        const tempoMedio = item.countTempo > 0 ? (item.somaTempo / item.countTempo).toFixed(1) : '-';

        return `
            <tr>
                <td style="text-align: left; font-weight: 600;">${item.nome}</td>
                <td style="text-align: center; color: #10b981; font-weight: 600;">${item.noPrazo}</td>
                <td style="text-align: center; color: #f85149; font-weight: 600;">${item.atrasado}</td>
                <td style="text-align: center;">${pctNoPrazo}%</td>
                <td style="text-align: center; font-weight: 700;">${item.total}</td>
            </tr>
        `;
    }).join('');

    if (tfoot) {
        const pctGeralNoPrazo = totalGeral > 0 ? ((totalNoPrazo / totalGeral) * 100).toFixed(0) : '0';
        tfoot.innerHTML = `
            <tr>
                <td style="text-align: left;">TOTAL</td>
                <td style="text-align: center; color: #10b981;">${totalNoPrazo}</td>
                <td style="text-align: center; color: #f85149;">${totalAtrasado}</td>
                <td style="text-align: center;">${pctGeralNoPrazo}%</td>
                <td style="text-align: center;">${totalGeral}</td>
            </tr>
        `;
    }
}

function sortSarPerformance(col) {
    if (sarPerformanceSortColumn === col) {
        sarPerformanceSortOrder = sarPerformanceSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        sarPerformanceSortColumn = col;
        sarPerformanceSortOrder = 'desc';
    }
    renderSarPerformanceTable(sarFilteredData);
}

/**
 * Tabela Detalhada Analítica de SARs
 */
function renderSarTable(data) {
    const tbody = document.getElementById('sar-table-body');
    const paginationInfo = document.getElementById('sar-pagination-info');
    const paginationBtns = document.getElementById('sar-pagination-btns');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="16" style="text-align:center; color: var(--text-secondary); padding: 30px;">Nenhum registro SAR localizado para os filtros selecionados.</td></tr>';
        if (paginationInfo) paginationInfo.innerText = 'Exibindo 0 de 0 registros';
        if (paginationBtns) paginationBtns.innerHTML = '';
        return;
    }

    // Ordenação
    const sorted = [...data].sort((a, b) => {
        let valA = a[sarSortColumn];
        let valB = b[sarSortColumn];

        if (valA === undefined || valA === null) valA = '';
        if (valB === undefined || valB === null) valB = '';

        if (typeof valA === 'number' && typeof valB === 'number') {
            return sarSortOrder === 'asc' ? valA - valB : valB - valA;
        }
        valA = valA.toString().toLowerCase();
        valB = valB.toString().toLowerCase();
        return sarSortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    // Paginação
    const totalRecords = sorted.length;
    const totalPages = Math.ceil(totalRecords / sarPageSize);
    if (sarPage > totalPages) sarPage = totalPages || 1;

    const startIdx = (sarPage - 1) * sarPageSize;
    const pageRecords = sorted.slice(startIdx, startIdx + sarPageSize);

    tbody.innerHTML = pageRecords.map(r => {
        const prazoBadgeClass = r.prazo === 'NO PRAZO' ? 'sar-badge-no-prazo' : (r.prazo === 'ATRASADO' ? 'sar-badge-atrasado' : 'sar-badge-default');
        const statusBadgeClass = 
            r.status === 'CONCLUÍDO' ? 'sar-badge-concluido' :
            r.status === 'ANDAMENTO' ? 'sar-badge-andamento' :
            r.status === 'CANCELADO' ? 'sar-badge-cancelado' :
            r.status === 'SEM SINAL' ? 'sar-badge-sem-sinal' : 'sar-badge-default';

        return `
            <tr>
                <td style="font-weight: 700; color: var(--color-primary); white-space: nowrap;">${r.cod || '-'}</td>
                <td style="white-space: nowrap;">${r.area_tecnica || '-'}</td>
                <td style="white-space: nowrap;">${r.node || '-'}</td>
                <td style="white-space: nowrap;">${r.site || '-'}</td>
                <td style="white-space: nowrap;" title="${r.cidade || ''}">${r.cidade || '-'}</td>
                <td title="${r.endereco || ''}" style="line-height: 1.15; max-width: 180px;">${r.endereco || '-'}</td>
                <td style="white-space: nowrap;">${r.caixa_mdu || '-'}</td>
                <td style="white-space: nowrap;">${r.classe_l || '-'}</td>
                <td style="white-space: nowrap;">${r.classe_f || '-'}</td>
                <td title="${r.servico || ''}" style="line-height: 1.15; max-width: 160px;">${r.servico || '-'}</td>
                <td style="white-space: nowrap;">${r.data_entrada_fmt || '-'}</td>
                <td style="white-space: nowrap;">${r.data_entrega_fmt || '-'}</td>
                <td><span class="sar-badge ${statusBadgeClass}">${r.status || '-'}</span></td>
                <td><span class="sar-badge ${prazoBadgeClass}">${r.prazo || '-'}</span></td>
                <td style="text-align: center; font-weight: 600;">${r.tempo_dias > 0 ? r.tempo_dias : '-'}</td>
                <td style="text-align: center; color: ${r.atraso_dias > 0 ? '#f85149' : 'inherit'}; font-weight: ${r.atraso_dias > 0 ? '700' : '400'};">${r.atraso_dias > 0 ? r.atraso_dias : '-'}</td>
            </tr>
        `;
    }).join('');

    // Atualizar Controles de Paginação
    if (paginationInfo) {
        const endIdx = Math.min(startIdx + sarPageSize, totalRecords);
        paginationInfo.innerText = `Exibindo ${startIdx + 1} a ${endIdx} de ${totalRecords.toLocaleString('pt-BR')} registros`;
    }

    if (paginationBtns) {
        let btnsHtml = `
            <button class="btn-page" onclick="goSarPage(1)" ${sarPage === 1 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} title="Primeira Página">
                <i class="fa-solid fa-angles-left"></i>
            </button>
            <button class="btn-page" onclick="goSarPage(${sarPage - 1})" ${sarPage === 1 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} title="Página Anterior">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
        `;

        // Range de botões numéricos
        const maxPagesToShow = 5;
        let startP = Math.max(1, sarPage - Math.floor(maxPagesToShow / 2));
        let endP = Math.min(totalPages, startP + maxPagesToShow - 1);
        if (endP - startP + 1 < maxPagesToShow) {
            startP = Math.max(1, endP - maxPagesToShow + 1);
        }

        for (let p = startP; p <= endP; p++) {
            btnsHtml += `
                <button class="btn-page ${p === sarPage ? 'active' : ''}" onclick="goSarPage(${p})">${p}</button>
            `;
        }

        btnsHtml += `
            <button class="btn-page" onclick="goSarPage(${sarPage + 1})" ${sarPage === totalPages ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} title="Próxima Página">
                <i class="fa-solid fa-chevron-right"></i>
            </button>
            <button class="btn-page" onclick="goSarPage(${totalPages})" ${sarPage === totalPages ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} title="Última Página">
                <i class="fa-solid fa-angles-right"></i>
            </button>
        `;

        paginationBtns.innerHTML = btnsHtml;
    }
}

function goSarPage(p) {
    sarPage = p;
    renderSarTable(sarFilteredData);
}

function sortSarTable(col) {
    if (sarSortColumn === col) {
        sarSortOrder = sarSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        sarSortColumn = col;
        sarSortOrder = 'asc';
    }
    renderSarTable(sarFilteredData);
}

/**
 * Alterna entre Sub-Abas do SAR (Indicadores / Relatório)
 */
function switchSarTab(tabName) {
    const subIndicators = document.getElementById('subview-sar-indicators');
    const subTable = document.getElementById('subview-sar-table');
    const btnInd = document.getElementById('sar-tab-btn-indicators');
    const btnTab = document.getElementById('sar-tab-btn-table');

    if (tabName === 'indicators') {
        if (subIndicators) subIndicators.style.display = 'block';
        if (subTable) subTable.style.display = 'none';
        if (btnInd) btnInd.classList.add('active');
        if (btnTab) btnTab.classList.remove('active');
    } else {
        if (subIndicators) subIndicators.style.display = 'none';
        if (subTable) subTable.style.display = 'block';
        if (btnInd) btnInd.classList.remove('active');
        if (btnTab) btnTab.classList.add('active');
    }
}

/**
 * Exportação dos Dados do SAR para Excel via SheetJS (xlsx-js-style)
 */
function exportSarToExcel() {
    if (!sarFilteredData || sarFilteredData.length === 0) {
        alert("Nenhum dado disponível para exportação com os filtros atuais.");
        return;
    }

    if (typeof XLSX === 'undefined') {
        alert("Biblioteca XLSX não carregada no navegador.");
        return;
    }

    const rows = sarFilteredData.map(r => ({
        "Código": r.cod || '',
        "Área Técnica": r.area_tecnica || '',
        "Node": r.node || '',
        "Site": r.site || '',
        "Cidade": r.cidade || '',
        "Endereço": r.endereco || '',
        "Caixa MDU": r.caixa_mdu || '',
        "Classe L (Linha)": r.classe_l || '',
        "Classe F (Fusão)": r.classe_f || '',
        "Serviço": r.servico || '',
        "Data de Entrada": r.data_entrada_fmt || '',
        "Data de Entrega": r.data_entrega_fmt || '',
        "Status Geral": r.status || '',
        "Prazo (SLA 3 dias)": r.prazo || '',
        "Tempo (Dias)": r.tempo_dias || 0,
        "Atraso (Dias)": r.atraso_dias || 0
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio_SAR");

    const filename = `Relatorio_SAR_JLE_${new Date().toISOString().substring(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
}
