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

// Estado de visualização de Granularidade Temporal
let sarTimeGranularity = 'month'; // 'month' padrão

// Filtros do SAR
const sarFilters = {
    status: [],
    cidade: '',
    area_tecnica: '',
    ano: '',
    mes: ''
};

let sarSearchQuery = '';
let sarSearchDebounceTimer = null;

// Instâncias dos Gráficos Chart.js
const sarCharts = {
    status: null,
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
function initSar(forceReload = false) {
    if (sarDataLoaded && !forceReload) return;
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

    // 2. Select Cidade
    const cidadeSelect = document.getElementById('sar-filter-cidade');
    if (cidadeSelect) {
        const uniqueCidades = meta.cidades || [...new Set(data.map(r => r.cidade).filter(Boolean))].sort();
        cidadeSelect.innerHTML = '<option value="">Todas as Cidades</option>' + 
            uniqueCidades.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // 3. Select Área Técnica
    const areaSelect = document.getElementById('sar-filter-area');
    if (areaSelect) {
        const uniqueAreas = meta.areas_tecnicas || [...new Set(data.map(r => r.area_tecnica).filter(Boolean))].sort();
        areaSelect.innerHTML = '<option value="">Todas as Áreas Técnicas</option>' + 
            uniqueAreas.map(a => `<option value="${a}">${a}</option>`).join('');
    }

    // 4. Select Ano (Ordenação Cronológica Decrescente)
    const anoSelect = document.getElementById('sar-filter-ano');
    if (anoSelect) {
        const uniqueAnos = meta.anos || [...new Set(data.map(r => r.ano).filter(a => a && a !== 'NÃO INFORMADO'))];
        uniqueAnos.sort((a, b) => parseInt(b) - parseInt(a));
        anoSelect.innerHTML = '<option value="">Todos os Anos</option>' + 
            uniqueAnos.map(a => `<option value="${a}">${a}</option>`).join('');
    }

    // 5. Select Mês (Meses em português)
    const mesSelect = document.getElementById('sar-filter-mes');
    if (mesSelect) {
        const meses = meta.meses || [
            "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
        ];
        mesSelect.innerHTML = '<option value="">Todos os Meses</option>' + 
            meses.map(m => `<option value="${m.toUpperCase()}">${m}</option>`).join('');
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
    sarFilters.cidade = '';
    sarFilters.area_tecnica = '';
    sarFilters.ano = '';
    sarFilters.mes = '';
    sarSearchQuery = '';

    const chks = document.querySelectorAll('#sar-multiselect-status-dropdown input[type="checkbox"]');
    chks.forEach(c => c.checked = false);

    const lbl = document.getElementById('sar-multiselect-status-value');
    if (lbl) lbl.innerText = 'Todos os Status';

    const cSel = document.getElementById('sar-filter-cidade');
    if (cSel) cSel.value = '';
    const aSel = document.getElementById('sar-filter-area');
    if (aSel) aSel.value = '';
    const anoSel = document.getElementById('sar-filter-ano');
    if (anoSel) anoSel.value = '';
    const mesSel = document.getElementById('sar-filter-mes');
    if (mesSel) mesSel.value = '';

    const searchInput = document.getElementById('sar-search-bar');
    if (searchInput) searchInput.value = '';

    applySarFilters();
}

/**
 * Aplica os filtros e atualiza todas as visualizações
 */
function applySarFilters() {
    const data = window.SAR_DATA || [];

    const cSel = document.getElementById('sar-filter-cidade');
    if (cSel) sarFilters.cidade = cSel.value;
    const aSel = document.getElementById('sar-filter-area');
    if (aSel) sarFilters.area_tecnica = aSel.value;
    const anoSel = document.getElementById('sar-filter-ano');
    if (anoSel) sarFilters.ano = anoSel.value;
    const mesSel = document.getElementById('sar-filter-mes');
    if (mesSel) sarFilters.mes = mesSel.value;

    sarFilteredData = data.filter(r => {
        // Filtro Status
        if (sarFilters.status.length > 0 && !sarFilters.status.includes(r.status)) {
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
        // Filtro Ano
        if (sarFilters.ano && r.ano !== sarFilters.ano) {
            return false;
        }
        // Filtro Mês
        if (sarFilters.mes) {
            const rMesUpper = (r.mes || '').toUpperCase();
            if (rMesUpper !== sarFilters.mes) {
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
 * Retorna os registros dos últimos 60 dias com base na data máxima da base
 */
function getSarRecent60DaysData(dataset) {
    const allData = window.SAR_DATA || [];
    if (allData.length === 0) return dataset;

    let maxTs = 0;
    allData.forEach(r => {
        if (r.data_entrada) {
            const dtStr = r.data_entrada.length === 10 ? r.data_entrada + 'T00:00:00' : r.data_entrada;
            const ts = new Date(dtStr).getTime();
            if (ts && !isNaN(ts) && ts > maxTs) maxTs = ts;
        }
    });

    if (maxTs === 0) return dataset;

    const cutoffTs = maxTs - (60 * 24 * 60 * 60 * 1000);
    return dataset.filter(r => {
        if (!r.data_entrada) return false;
        const dtStr = r.data_entrada.length === 10 ? r.data_entrada + 'T00:00:00' : r.data_entrada;
        const ts = new Date(dtStr).getTime();
        return ts && !isNaN(ts) && ts >= cutoffTs;
    });
}

/**
 * Atualiza os Cards de KPIs
 */
function updateSarKpis(data) {
    const total = data.length;
    let emMedicaoCount = 0;
    let relatorioCount = 0;

    data.forEach(r => {
        const st = (r.status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        if (st.includes('EM MEDIC') || st.includes('AG. MEDIC') || st.includes('AG MEDIC')) {
            emMedicaoCount++;
        } else if (st.includes('RELAT')) {
            relatorioCount++;
        }
    });

    // Tempo médio de atendimento e atraso: padrão de 60 dias (a menos que filtrado por Ano/Mês)
    const isDateFiltered = Boolean(sarFilters.ano || sarFilters.mes);
    const tempoDataset = isDateFiltered ? data : getSarRecent60DaysData(data);

    let somaTempo = 0;
    let countTempo = 0;
    let somaAtraso = 0;
    let countAtraso = 0;

    tempoDataset.forEach(r => {
        if (r.prazo === 'ATRASADO' && r.atraso_dias > 0) {
            somaAtraso += r.atraso_dias;
            countAtraso++;
        }
        if (r.tempo_dias > 0) {
            somaTempo += r.tempo_dias;
            countTempo++;
        }
    });

    const emMedicaoPct = total > 0 ? ((emMedicaoCount / total) * 100).toFixed(1) : '0';
    const relatorioPct = total > 0 ? ((relatorioCount / total) * 100).toFixed(1) : '0';
    const mediaTempo = countTempo > 0 ? (somaTempo / countTempo).toFixed(1) : '0';
    const mediaAtraso = countAtraso > 0 ? (somaAtraso / countAtraso).toFixed(1) : '0';

    // Elementos DOM
    const elTotal = document.getElementById('sar-kpi-total');
    if (elTotal) elTotal.innerText = total.toLocaleString('pt-BR');

    const elMedicao = document.getElementById('sar-kpi-concluidas');
    const elMedicaoPct = document.getElementById('sar-kpi-concluidas-pct');
    if (elMedicao) elMedicao.innerText = emMedicaoCount.toLocaleString('pt-BR');
    if (elMedicaoPct) elMedicaoPct.innerText = `${emMedicaoPct}%`;

    const elRelatorio = document.getElementById('sar-kpi-andamento');
    const elRelatorioPct = document.getElementById('sar-kpi-andamento-pct');
    if (elRelatorio) elRelatorio.innerText = relatorioCount.toLocaleString('pt-BR');
    if (elRelatorioPct) elRelatorioPct.innerText = `${relatorioPct}%`;

    const elTempoTitle = document.getElementById('sar-kpi-tempo-title');
    const elTempoMedio = document.getElementById('sar-kpi-tempo-medio');
    const elTempoAtraso = document.getElementById('sar-kpi-tempo-atraso-detalhe');
    
    if (elTempoTitle) {
        elTempoTitle.innerText = isDateFiltered ? 'TEMPO MÉDIO DE ATENDIMENTO' : 'TEMPO MÉDIO (ÚLTIMOS 60 DIAS)';
    }
    if (elTempoMedio) elTempoMedio.innerText = `${mediaTempo} dias`;
    if (elTempoAtraso) {
        elTempoAtraso.innerText = isDateFiltered ? `Atraso médio: ${mediaAtraso} dias` : `Atraso médio: ${mediaAtraso} dias (60d)`;
    }
}

/**
 * Renderiza os Gráficos Chart.js do SAR
 */
function renderSarCharts(filteredData) {
    renderSarStatusChart(filteredData);
    renderSarPrazoChart(filteredData);

    // O gráfico de evolução mensal NÃO é afetado pelos filtros de Ano/Mês (preserva toda a série temporal histórica)
    const evolutionData = (window.SAR_DATA || []).filter(r => {
        if (sarFilters.status.length > 0 && !sarFilters.status.includes(r.status)) return false;
        if (sarFilters.cidade && r.cidade !== sarFilters.cidade) return false;
        if (sarFilters.area_tecnica && r.area_tecnica !== sarFilters.area_tecnica) return false;
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

    renderSarEvolutionChart(evolutionData);
}

/**
 * Retorna a paleta de cores para cada status do SAR
 */
function getSarStatusColor(st) {
    const key = (st || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
    if (key.includes('PEDIDO IMPLANTADO') || (key.includes('PEDIDO') && key.includes('IMPLANT'))) {
        return { bg: '#10b981', border: '#059669' }; // Verde Esmeralda
    }
    if (key.includes('WF APROVADO') || key.includes('APROVADO')) {
        return { bg: '#14b8a6', border: '#0d9488' }; // Teal / Verde Azulado
    }
    if (key.includes('WF IMPLANT') || (key.includes('CONCLU') && !key.includes('MEDIC'))) {
        return { bg: '#22c55e', border: '#16a34a' }; // Verde
    }
    if (key.includes('EM MEDIC') || key.includes('AG. MEDIC') || key.includes('AG MEDIC')) {
        return { bg: '#388bfd', border: '#1f6feb' }; // Azul Royal Vibrante
    }
    if (key.includes('ENVIAD')) {
        return { bg: '#eab308', border: '#ca8a04' }; // Âmbar Dourado
    }
    if (key.includes('RELAT')) {
        return { bg: '#f97316', border: '#ea580c' }; // Laranja Vibrante / Tangerina
    }
    if (key.includes('ANDAMENTO')) {
        return { bg: '#6366f1', border: '#4f46e5' }; // Índigo
    }
    if (key.includes('SEM SINAL')) {
        return { bg: '#a855f7', border: '#9333ea' }; // Roxo Neon
    }
    if (key.includes('CANCEL')) {
        return { bg: '#ef4444', border: '#dc2626' }; // Vermelho Coral
    }
    if (key.includes('PARALIS')) {
        return { bg: '#64748b', border: '#475569' }; // Cinza Ardósia
    }
    return { bg: '#38bdf8', border: '#0284c7' }; // Azul Claro
}

/**
 * Gráfico 1 (Superior Esquerdo): Distribuição por Status Geral
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

    const bgColors = labels.map(l => getSarStatusColor(l).bg);
    const borderColors = labels.map(l => getSarStatusColor(l).border);

    const pluginList = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

    sarCharts.status = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'OSs SAR',
                data: counts,
                backgroundColor: bgColors,
                borderColor: borderColors,
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
 * Gráfico 2 (Superior Direito): Distribuição de SLA (No Prazo vs Atrasado - Doughnut com Datalabels)
 */
function renderSarPrazoChart(data) {
    const ctx = document.getElementById('sar-chart-prazo');
    if (!ctx) return;

    if (sarCharts.prazo) {
        sarCharts.prazo.destroy();
        sarCharts.prazo = null;
    }

    const isDateFiltered = Boolean(sarFilters.ano || sarFilters.mes);
    const slaDataset = isDateFiltered ? data : getSarRecent60DaysData(data);

    const titleEl = document.getElementById('sar-chart-prazo-title');
    if (titleEl) {
        titleEl.innerText = isDateFiltered ? 'Distribuição de SLA (No Prazo vs Atrasado)' : 'Distribuição de SLA (Últimos 60 dias)';
    }

    let noPrazo = 0;
    let atrasado = 0;
    slaDataset.forEach(r => {
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
                    formatter: (val) => {
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
 * Gráfico 3 (Inferior - Largura Total): Evolução Mensal de Entradas
 */
function renderSarEvolutionChart(data) {
    const ctx = document.getElementById('sar-chart-evolution');
    if (!ctx) return;

    if (sarCharts.evolution) {
        sarCharts.evolution.destroy();
        sarCharts.evolution = null;
    }

    const titleEl = document.getElementById('sar-evolution-title');
    if (titleEl) {
        titleEl.innerText = 'Evolução Mensal de Entradas por Status';
    }

    const pluginList = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

    const statusOrder = [
        'PEDIDO IMPLANTADO',
        'WF APROVADO',
        'WF IMPLANTADO',
        'EM MEDIÇÃO',
        'MEDIÇÃO ENVIADA',
        'RELATÓRIO',
        'EM ANDAMENTO',
        'SEM SINAL',
        'CANCELADO',
        'PARALISADO'
    ];

    const monthMap = {};
    const presentStatuses = new Set();

    data.forEach(r => {
        if (r.data_entrada) {
            const ym = r.data_entrada.substring(0, 7); // YYYY-MM
            const [ano, mes] = ym.split('-');
            const mesNum = parseInt(mes);
            const label = `${MESES_PT_LABEL[mesNum] || mes}/${ano.substring(2)}`;
            const st = (r.status || 'NÃO INFORMADO').trim();

            if (!monthMap[ym]) {
                monthMap[ym] = { ym, label, totals: {}, totalMonth: 0 };
            }
            monthMap[ym].totals[st] = (monthMap[ym].totals[st] || 0) + 1;
            monthMap[ym].totalMonth++;
            presentStatuses.add(st);
        }
    });

    const sortedYms = Object.keys(monthMap).sort();
    const labels = sortedYms.map(k => monthMap[k].label);

    // Filtrar e ordenar apenas os status que possuem dados
    const activeStatuses = statusOrder.filter(s => presentStatuses.has(s));
    presentStatuses.forEach(s => {
        if (!activeStatuses.includes(s)) activeStatuses.push(s);
    });

    // Construir datasets empilhados por status
    const datasets = activeStatuses.map(st => {
        const color = getSarStatusColor(st);
        return {
            label: st,
            data: sortedYms.map(ym => monthMap[ym].totals[st] || 0),
            backgroundColor: color.bg,
            borderColor: color.border,
            borderWidth: 1,
            borderRadius: 2,
            stack: 'sarStatusStack',
            barPercentage: 0.75,
            categoryPercentage: 0.85
        };
    });

    sarCharts.evolution = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        plugins: pluginList,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: '#c9d1d9',
                        font: { family: 'Outfit, Inter', size: 11 },
                        boxWidth: 12,
                        boxHeight: 12,
                        padding: 10,
                        usePointStyle: true,
                        pointStyle: 'rectRounded'
                    }
                },
                tooltip: {
                    backgroundColor: '#161b22',
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                    borderWidth: 1,
                    titleColor: '#ffffff',
                    bodyColor: '#c9d1d9',
                    padding: 10,
                    callbacks: {
                        footer: function(tooltipItems) {
                            let sum = 0;
                            tooltipItems.forEach(function(tooltipItem) {
                                sum += tooltipItem.parsed.y;
                            });
                            return 'Total de Entradas: ' + sum.toLocaleString('pt-BR');
                        }
                    }
                },
                datalabels: {
                    display: function(context) {
                        const val = context.dataset.data[context.dataIndex];
                        return val >= 4; // Exibe o valor do segmento se for relevante (>= 4)
                    },
                    color: '#ffffff',
                    font: { weight: 'bold', size: 9, family: 'Outfit, Inter' },
                    formatter: (val) => val > 0 ? val : ''
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#c9d1d9', font: { size: 10, family: 'Outfit, Inter' } }
                },
                y: {
                    stacked: true,
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
    execList.forEach(item => {
        item.noPrazoPct = item.total > 0 ? (item.noPrazo / item.total) * 100 : 0;
    });

    // Ordenação
    execList.sort((a, b) => {
        let valA = a[sarPerformanceSortColumn] !== undefined ? a[sarPerformanceSortColumn] : 0;
        let valB = b[sarPerformanceSortColumn] !== undefined ? b[sarPerformanceSortColumn] : 0;
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
        const stUpper = (r.status || '').toUpperCase();
        const statusBadgeClass = 
            (stUpper === 'CONCLUÍDO' || stUpper === 'CONCLUÍDA' || stUpper === 'WF APROVADO') ? 'sar-badge-concluido' :
            (stUpper === 'ANDAMENTO' || stUpper.includes('AG.') || stUpper.includes('PEND')) ? 'sar-badge-andamento' :
            (stUpper === 'CANCELADO' || stUpper === 'CANCELADA') ? 'sar-badge-cancelado' :
            (stUpper === 'SEM SINAL') ? 'sar-badge-sem-sinal' :
            (stUpper === 'PARALISADO') ? 'sar-badge-paralisado' : 'sar-badge-default';

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
        "Data Medição": r.data_medicao_fmt || '',
        "Nº WF": r.num_wf || '',
        "Status WF": r.status_wf || '',
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
