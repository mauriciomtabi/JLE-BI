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

// Estado de visualização de Drill-down
let sarDrilldownActive = false;
let sarDrilldownPeriod = null; // Ex: { key: "2024-03", label: "MARÇO/2024" }

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
    evolution: null,
    prazo: null,
    status: null,
    cidade: null
};

// Meses em Português para ordenação cronológica
const MESES_MAP_PT = {
    "JANEIRO": 1, "FEVEREIRO": 2, "MARÇO": 3, "MARCO": 3, "ABRIL": 4,
    "MAIO": 5, "JUNHO": 6, "JULHO": 7, "AGOSTO": 8, "SETEMBRO": 9,
    "OUTUBRO": 10, "NOVEMBRO": 11, "DEZEMBRO": 12
};

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

    sarDrilldownActive = false;
    sarDrilldownPeriod = null;
    const backBtn = document.getElementById('sar-drilldown-back-btn');
    if (backBtn) backBtn.style.display = 'none';

    applySarFilters();
}

/**
 * Aplica os filtros e atualiza todas as visualizações
 */
function applySarFilters() {
    const data = window.SAR_DATA || [];

    // Obter valores selecionados dos selects caso não tenham sido setados
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
        // Filtro Drill-down Mensal (se ativo)
        if (sarDrilldownActive && sarDrilldownPeriod) {
            if (!r.data_entrada || !r.data_entrada.startsWith(sarDrilldownPeriod.key)) {
                return false;
            }
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
    renderSarEvolutionChart(data);
    renderSarPrazoChart(data);
    renderSarStatusChart(data);
    renderSarCidadeChart(data);
}

/**
 * Gráfico 1: Evolução Temporal (Data de Entrada - Col T) com Drill-down
 */
function renderSarEvolutionChart(data) {
    const ctx = document.getElementById('sar-chart-evolution');
    if (!ctx) return;

    if (sarCharts.evolution) {
        sarCharts.evolution.destroy();
        sarCharts.evolution = null;
    }

    const titleEl = document.getElementById('sar-evolution-title');

    if (!sarDrilldownActive) {
        // Visão Mensal (Agrupamento por Mês/Ano da data de entrada)
        if (titleEl) titleEl.innerText = 'Evolução Mensal de Entradas (Clique na barra para detalhar o mês)';

        const monthMap = {};
        data.forEach(r => {
            if (r.data_entrada) {
                const key = r.data_entrada.substring(0, 7); // YYYY-MM
                const [ano, mes] = key.split('-');
                const mesNome = MESES_PT_LABEL[parseInt(mes)] || mes;
                const label = `${mesNome}/${ano}`;
                if (!monthMap[key]) {
                    monthMap[key] = { key, label, total: 0, noPrazo: 0, atrasado: 0 };
                }
                monthMap[key].total++;
                if (r.prazo === 'NO PRAZO') monthMap[key].noPrazo++;
                else if (r.prazo === 'ATRASADO') monthMap[key].atrasado++;
            }
        });

        // Ordenação cronológica
        const sortedKeys = Object.keys(monthMap).sort();
        const labels = sortedKeys.map(k => monthMap[k].label);
        const totalData = sortedKeys.map(k => monthMap[k].total);
        const noPrazoData = sortedKeys.map(k => monthMap[k].noPrazo);
        const atrasadoData = sortedKeys.map(k => monthMap[k].atrasado);

        sarCharts.evolution = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'No Prazo',
                        data: noPrazoData,
                        backgroundColor: 'rgba(16, 185, 129, 0.85)',
                        borderColor: '#10b981',
                        borderWidth: 1,
                        borderRadius: 4,
                        stack: 'stack1'
                    },
                    {
                        label: 'Atrasado',
                        data: atrasadoData,
                        backgroundColor: 'rgba(248, 81, 73, 0.85)',
                        borderColor: '#f85149',
                        borderWidth: 1,
                        borderRadius: 4,
                        stack: 'stack1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#c9d1d9', font: { family: 'Outfit, Inter', size: 11 } }
                    },
                    tooltip: {
                        backgroundColor: '#161b22',
                        borderColor: 'rgba(255, 255, 255, 0.15)',
                        borderWidth: 1,
                        titleColor: '#ffffff',
                        bodyColor: '#c9d1d9',
                        padding: 10,
                        callbacks: {
                            afterBody: function(items) {
                                const idx = items[0].dataIndex;
                                return `Total do Mês: ${totalData[idx]}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#8b949e', font: { size: 11 } }
                    },
                    y: {
                        stacked: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#8b949e', font: { size: 11 } }
                    }
                },
                onClick: function(evt, elements) {
                    if (elements && elements.length > 0) {
                        const index = elements[0].index;
                        const selectedKey = sortedKeys[index];
                        const selectedLabel = labels[index];
                        enterSarDrilldown(selectedKey, selectedLabel);
                    }
                }
            }
        });

    } else {
        // Visão Drill-Down Diária
        if (titleEl) titleEl.innerText = `Evolução Diária de Entradas — ${sarDrilldownPeriod.label}`;

        const dayMap = {};
        data.forEach(r => {
            if (r.data_entrada && r.data_entrada.startsWith(sarDrilldownPeriod.key)) {
                const day = r.data_entrada.substring(8, 10);
                if (!dayMap[day]) dayMap[day] = { total: 0, noPrazo: 0, atrasado: 0 };
                dayMap[day].total++;
                if (r.prazo === 'NO PRAZO') dayMap[day].noPrazo++;
                else if (r.prazo === 'ATRASADO') dayMap[day].atrasado++;
            }
        });

        const sortedDays = Object.keys(dayMap).sort((a, b) => parseInt(a) - parseInt(b));
        const labels = sortedDays.map(d => `Dia ${d}`);
        const noPrazoData = sortedDays.map(d => dayMap[d].noPrazo);
        const atrasadoData = sortedDays.map(d => dayMap[d].atrasado);

        sarCharts.evolution = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'No Prazo',
                        data: noPrazoData,
                        backgroundColor: 'rgba(16, 185, 129, 0.85)',
                        borderColor: '#10b981',
                        borderWidth: 1,
                        borderRadius: 4,
                        stack: 'stack1'
                    },
                    {
                        label: 'Atrasado',
                        data: atrasadoData,
                        backgroundColor: 'rgba(248, 81, 73, 0.85)',
                        borderColor: '#f85149',
                        borderWidth: 1,
                        borderRadius: 4,
                        stack: 'stack1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#c9d1d9', font: { family: 'Outfit, Inter', size: 11 } }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#8b949e', font: { size: 11 } }
                    },
                    y: {
                        stacked: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#8b949e', font: { size: 11 } }
                    }
                }
            }
        });
    }
}

const MESES_PT_LABEL = [
    "", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

function enterSarDrilldown(key, label) {
    sarDrilldownActive = true;
    sarDrilldownPeriod = { key, label };
    const backBtn = document.getElementById('sar-drilldown-back-btn');
    if (backBtn) backBtn.style.display = 'inline-flex';
    applySarFilters();
}

function backFromSarDrilldown() {
    sarDrilldownActive = false;
    sarDrilldownPeriod = null;
    const backBtn = document.getElementById('sar-drilldown-back-btn');
    if (backBtn) backBtn.style.display = 'none';
    applySarFilters();
}

/**
 * Gráfico 2: SLA Prazo (No Prazo vs Atrasado - Doughnut)
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
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#c9d1d9', font: { family: 'Outfit, Inter', size: 11 }, padding: 14 }
                },
                tooltip: {
                    backgroundColor: '#161b22',
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                    borderWidth: 1
                }
            }
        }
    });
}

/**
 * Gráfico 3: Distribuição por Status Geral
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
        const st = r.status || 'NÃO INFORMADO';
        statusCount[st] = (statusCount[st] || 0) + 1;
    });

    const labels = Object.keys(statusCount);
    const counts = Object.values(statusCount);
    const colors = [
        '#2ed573', '#ff4757', '#ffa502', '#1e90ff', '#9575cd', '#26c6da', '#ff7043'
    ];

    sarCharts.status = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: counts,
                backgroundColor: colors.slice(0, labels.length),
                borderColor: '#161b22',
                borderWidth: 2,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#c9d1d9', font: { family: 'Outfit, Inter', size: 11 }, padding: 10 }
                }
            }
        }
    });
}

/**
 * Gráfico 4: Top 8 Cidades por Volume
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

    sarCharts.cidade = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'OSs SAR',
                data: counts,
                backgroundColor: 'rgba(56, 139, 253, 0.8)',
                borderColor: '#388bfd',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#8b949e', font: { size: 10 } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#c9d1d9', font: { size: 11 } }
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
                <td style="font-weight: 700; color: var(--color-primary);">${r.cod || '-'}</td>
                <td>${r.area_tecnica || '-'}</td>
                <td>${r.node || '-'}</td>
                <td>${r.site || '-'}</td>
                <td>${r.cidade || '-'}</td>
                <td style="max-width: 220px; white-space: normal;">${r.endereco || '-'}</td>
                <td>${r.caixa_mdu || '-'}</td>
                <td>${r.classe_l || '-'}</td>
                <td>${r.classe_f || '-'}</td>
                <td style="max-width: 240px; white-space: normal;">${r.servico || '-'}</td>
                <td>${r.data_entrada_fmt || '-'}</td>
                <td>${r.data_entrega_fmt || '-'}</td>
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
