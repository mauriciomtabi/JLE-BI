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
let sarPerformanceSortColumn = 'noPrazoPct';
let sarPerformanceSortOrder = 'desc';

// Estado do Fechamento de Terceiros
let sarFechamentoClasse = 'TODOS'; // 'TODOS', 'CLASSE_L', 'CLASSE_F'
let sarFechamentoCompetencia = ''; // Competência filtrada (MÊS/ANO da data de entrega)
let sarFechamentoSearch = '';
let sarFechamentoSortColumn = 'totalPagar';
let sarFechamentoSortOrder = 'desc';
let sarActiveTerceiroData = null; // Dados para modal de auditoria

// Estado do Painel de Medições
let sarMedicaoStatusFiltro = 'TODOS'; // 'TODOS', 'MEDIÇÃO ENVIADA', 'FINALIZADO', 'PEDIDO EMITIDO'
let sarMedicaoCompetenciaFiltro = ''; // Competência filtrada (MÊS/ANO da data de medição)
let sarMedicaoSearch = '';
let sarMedicaoSortColumn = 'data_medicao';
let sarMedicaoSortOrder = 'desc';

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
    prazo: null,
    fechEvolution: null,
    fechDistribuicao: null,
    medicaoDistribuicao: null,
    medicaoEvolution: null
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

    // 6. Select Competência de Fechamento de Terceiros (Data de Entrega)
    const fechCompSelect = document.getElementById('sar-fech-filter-competencia');
    if (fechCompSelect) {
        const rawComps = meta.competencias_entrega || [...new Set(data.map(r => r.competencia_entrega).filter(c => c && c !== 'NÃO INFORMADO' && c !== 'SEM DATA'))];
        const compsSorted = [...rawComps].sort((a, b) => {
            const pA = a.split('/');
            const pB = b.split('/');
            const yA = parseInt(pA[1]) || 0;
            const yB = parseInt(pB[1]) || 0;
            if (yA !== yB) return yB - yA;
            const mA = MESES_MAP_PT[(pA[0] || '').toUpperCase()] || 0;
            const mB = MESES_MAP_PT[(pB[0] || '').toUpperCase()] || 0;
            return mB - mA;
        });

        fechCompSelect.innerHTML = '<option value="">Todas as Competências</option>' + 
            compsSorted.map(c => `<option value="${c}" ${c === sarFechamentoCompetencia ? 'selected' : ''}>${c}</option>`).join('');
    }

    // 7. Select Competência de Medições (Data de Medição)
    const medCompSelect = document.getElementById('sar-medicao-filter-competencia');
    if (medCompSelect) {
        const rawComps = meta.competencias_medicao || [...new Set(data.filter(r => r.valor_medicao > 0).map(r => getSarRecordCompetenciaMedicao(r)).filter(Boolean))];
        medCompSelect.innerHTML = '<option value="">Todas as Competências</option>' + 
            rawComps.map(c => `<option value="${c}" ${c === sarMedicaoCompetenciaFiltro ? 'selected' : ''}>${c}</option>`).join('');
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
    updateSarMedicaoSummaryKPI(sarFilteredData);
    renderSarCharts(sarFilteredData);
    renderSarPerformanceTable(sarFilteredData);
    renderSarTable(sarFilteredData);
    renderSarFechamentoKPIs(sarFilteredData);
    renderSarFechamentoCharts(sarFilteredData);
    renderSarFechamentoTable(sarFilteredData);
    renderSarMedicaoKPIs(sarFilteredData);
    renderSarMedicaoCharts(sarFilteredData);
    renderSarMedicaoTable(sarFilteredData);
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
    if (key.includes('PEDIDO EMIT') || key.includes('PEDIDO IMPLANT') || (key.includes('PEDIDO') && (key.includes('EMIT') || key.includes('IMPLANT')))) {
        return { bg: '#10b981', border: '#059669' }; // Verde Esmeralda (Pedido Emitido)
    }
    if (key.includes('FINALIZ')) {
        return { bg: '#388bfd', border: '#1d70d8' }; // Azul Royal (Finalizado)
    }
    if (key.includes('ENVIAD') || (key.includes('MEDIC') && key.includes('ENVIAD'))) {
        return { bg: '#f97316', border: '#ea580c' }; // Laranja Vibrante (Medição Enviada)
    }
    if (key.includes('WF APROVADO') || key.includes('APROVADO')) {
        return { bg: '#14b8a6', border: '#0d9488' }; // Teal / Verde Azulado
    }
    if (key.includes('WF IMPLANT') || (key.includes('CONCLU') && !key.includes('MEDIC'))) {
        return { bg: '#22c55e', border: '#16a34a' }; // Verde
    }
    if (key.includes('EM MEDIC') || key.includes('AG. MEDIC') || key.includes('AG MEDIC')) {
        return { bg: '#0284c7', border: '#0369a1' }; // Azul Oceano (Em Medição)
    }
    if (key.includes('RELAT')) {
        return { bg: '#eab308', border: '#ca8a04' }; // Âmbar Dourado (Relatório)
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
        'FINALIZADO',
        'PEDIDO EMITIDO',
        'EM MEDIÇÃO',
        'MEDIÇÃO ENVIADA',
        'RELATÓRIO',
        'EM ANDAMENTO',
        'SEM SINAL',
        'CANCELADO',
        'PARALISADO',
        'NÃO COBRAR'
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

    // SLA dos últimos 60 dias (ou período filtrado se houver filtro de Ano/Mês)
    const isDateFiltered = Boolean(sarFilters.ano || sarFilters.mes);
    const targetDataset = isDateFiltered ? data : getSarRecent60DaysData(data);

    const titleEl = document.getElementById('sar-performance-title');
    if (titleEl) {
        titleEl.innerText = isDateFiltered 
            ? 'Desempenho por Executor (Classe L & Classe F)' 
            : 'Desempenho por Executor (Classe L & Classe F) — Últimos 60 dias';
    }

    const execMap = {};
    targetDataset.forEach(r => {
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

    // Ordenação: Por padrão (% SLA desc), com desempate por noPrazo desc e total desc
    execList.sort((a, b) => {
        if (sarPerformanceSortColumn === 'noPrazoPct') {
            if (b.noPrazoPct !== a.noPrazoPct) {
                return sarPerformanceSortOrder === 'desc' 
                    ? b.noPrazoPct - a.noPrazoPct 
                    : a.noPrazoPct - b.noPrazoPct;
            }
            // Desempate: quem fez mais OSs no prazo
            return sarPerformanceSortOrder === 'desc' 
                ? (b.noPrazo !== a.noPrazo ? b.noPrazo - a.noPrazo : b.total - a.total)
                : (a.noPrazo !== b.noPrazo ? a.noPrazo - b.noPrazo : a.total - b.total);
        }
        if (sarPerformanceSortColumn === 'nome') {
            return sarPerformanceSortOrder === 'asc' ? a.nome.localeCompare(b.nome) : b.nome.localeCompare(a.nome);
        }
        let valA = a[sarPerformanceSortColumn] !== undefined ? a[sarPerformanceSortColumn] : 0;
        let valB = b[sarPerformanceSortColumn] !== undefined ? b[sarPerformanceSortColumn] : 0;
        if (valA !== valB) {
            return sarPerformanceSortOrder === 'asc' ? valA - valB : valB - valA;
        }
        return b.noPrazoPct - a.noPrazoPct;
    });

    if (execList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary); padding: 20px;">Nenhum executor encontrado para o período.</td></tr>';
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
                <td style="text-align: center; font-weight: 700; color: ${item.noPrazoPct >= 80 ? '#10b981' : item.noPrazoPct >= 50 ? '#f59e0b' : '#f85149'};">${pctNoPrazo}%</td>
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
                <td style="text-align: center; font-weight: 800;">${pctGeralNoPrazo}%</td>
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
 * Formata valor numérico como moeda brasileira (R$)
 */
function formatCurrencyBR(val) {
    const num = (typeof val === 'number' && !isNaN(val)) ? val : 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
        tbody.innerHTML = '<tr><td colspan="18" style="text-align:center; color: var(--text-secondary); padding: 30px;">Nenhum registro SAR localizado para os filtros selecionados.</td></tr>';
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
            (stUpper === 'CONCLUÍDO' || stUpper === 'CONCLUÍDA' || stUpper === 'WF APROVADO' || stUpper === 'PEDIDO IMPLANTADO') ? 'sar-badge-concluido' :
            (stUpper === 'ANDAMENTO' || stUpper.includes('AG.') || stUpper.includes('PEND')) ? 'sar-badge-andamento' :
            (stUpper === 'CANCELADO' || stUpper === 'CANCELADA') ? 'sar-badge-cancelado' :
            (stUpper === 'SEM SINAL') ? 'sar-badge-sem-sinal' :
            (stUpper === 'PARALISADO') ? 'sar-badge-paralisado' : 'sar-badge-default';

        const tercFmt = r.total_terceiros > 0 ? formatCurrencyBR(r.total_terceiros) : '-';
        const prevFmt = r.previa_medicao > 0 ? formatCurrencyBR(r.previa_medicao) : '-';
        const dtMedFmt = r.data_medicao_fmt || '-';
        const valMedFmt = r.valor_medicao > 0 ? formatCurrencyBR(r.valor_medicao) : '-';

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
                <td style="text-align: right; font-weight: 600; color: #f97316; white-space: nowrap;">${tercFmt}</td>
                <td style="text-align: right; font-weight: 600; color: #10b981; white-space: nowrap;">${prevFmt}</td>
                <td style="text-align: center; color: #388bfd; white-space: nowrap;">${dtMedFmt}</td>
                <td style="text-align: right; font-weight: 600; color: #f59e0b; white-space: nowrap;">${valMedFmt}</td>
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
 * Alterna entre Sub-Abas do SAR (Indicadores / Medições / Fechamento de Terceiros / Relatório)
 */
function switchSarTab(tabName) {
    const subIndicators = document.getElementById('subview-sar-indicators');
    const subMedicao = document.getElementById('subview-sar-medicao');
    const subFechamento = document.getElementById('subview-sar-fechamento');
    const subTable = document.getElementById('subview-sar-table');

    const btnInd = document.getElementById('sar-tab-btn-indicators');
    const btnMed = document.getElementById('sar-tab-btn-medicao');
    const btnFech = document.getElementById('sar-tab-btn-fechamento');
    const btnTab = document.getElementById('sar-tab-btn-table');

    if (btnInd) btnInd.classList.toggle('active', tabName === 'indicators');
    if (btnMed) btnMed.classList.toggle('active', tabName === 'medicao');
    if (btnFech) btnFech.classList.toggle('active', tabName === 'fechamento');
    if (btnTab) btnTab.classList.toggle('active', tabName === 'table');

    if (subIndicators) {
        subIndicators.classList.toggle('active', tabName === 'indicators');
        subIndicators.style.display = (tabName === 'indicators') ? 'flex' : 'none';
    }
    if (subMedicao) {
        subMedicao.classList.toggle('active', tabName === 'medicao');
        subMedicao.style.display = (tabName === 'medicao') ? 'flex' : 'none';
    }
    if (subFechamento) {
        subFechamento.classList.toggle('active', tabName === 'fechamento');
        subFechamento.style.display = (tabName === 'fechamento') ? 'flex' : 'none';
    }
    if (subTable) {
        subTable.classList.toggle('active', tabName === 'table');
        subTable.style.display = (tabName === 'table') ? 'flex' : 'none';
    }

    if (tabName === 'indicators') {
        setTimeout(() => {
            if (typeof renderSarCharts === 'function') renderSarCharts(sarFilteredData);
        }, 50);
    } else if (tabName === 'medicao') {
        renderSarMedicaoKPIs(sarFilteredData);
        renderSarMedicaoCharts(sarFilteredData);
        renderSarMedicaoTable(sarFilteredData);
    } else if (tabName === 'fechamento') {
        renderSarFechamentoKPIs(sarFilteredData);
        renderSarFechamentoCharts(sarFilteredData);
        renderSarFechamentoTable(sarFilteredData);
    } else if (tabName === 'table') {
        renderSarTable(sarFilteredData);
    }
}

// ============================================================
// CONTROLADORES DO FECHAMENTO DE TERCEIROS
// ============================================================

/**
 * Alterna classe filtrada no fechamento (TODOS / CLASSE_L / CLASSE_F)
 */
function setSarFechamentoClasse(classe) {
    sarFechamentoClasse = classe;

    const btnTodos = document.getElementById('sar-fech-btn-classe-todos');
    const btnL = document.getElementById('sar-fech-btn-classe-l');
    const btnF = document.getElementById('sar-fech-btn-classe-f');

    if (btnTodos) btnTodos.classList.toggle('active', classe === 'TODOS');
    if (btnL) btnL.classList.toggle('active', classe === 'CLASSE_L');
    if (btnF) btnF.classList.toggle('active', classe === 'CLASSE_F');

    renderSarFechamentoKPIs(sarFilteredData);
    renderSarFechamentoCharts(sarFilteredData);
    renderSarFechamentoTable(sarFilteredData);
}

/**
 * Mudança no filtro de Competência do Fechamento (Data de Entrega)
 */
function onSarFechamentoCompetenciaChange(comp) {
    sarFechamentoCompetencia = comp || '';
    renderSarFechamentoKPIs(sarFilteredData);
    renderSarFechamentoCharts(sarFilteredData);
    renderSarFechamentoTable(sarFilteredData);
}

/**
 * Busca rápida por Terceiro / Executor
 */
function onSarFechamentoSearch(query) {
    sarFechamentoSearch = (query || '').trim().toLowerCase();
    renderSarFechamentoTable(sarFilteredData);
}

/**
 * Ordenação da Tabela de Fechamento
 */
function sortSarFechamento(col) {
    if (sarFechamentoSortColumn === col) {
        sarFechamentoSortOrder = sarFechamentoSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        sarFechamentoSortColumn = col;
        sarFechamentoSortOrder = 'desc';
    }
    renderSarFechamentoTable(sarFilteredData);
}

/**
 * Renderiza os KPIs do Fechamento de Terceiros
 */
function renderSarFechamentoKPIs(data) {
    const targetData = (sarFechamentoCompetencia)
        ? data.filter(r => r.competencia_entrega === sarFechamentoCompetencia)
        : data;

    let totTerceiros = 0;
    let totL = 0;
    let totF = 0;
    let totPrevia = 0;
    let countOss = 0;
    const activeTerceiros = new Set();

    targetData.forEach(r => {
        if (r.data_entrega) countOss++;
        if (r.total_terceiros > 0) totTerceiros += r.total_terceiros;
        if (r.valor_classe_l > 0) totL += r.valor_classe_l;
        if (r.valor_classe_f > 0) totF += r.valor_classe_f;
        if (r.previa_medicao > 0) totPrevia += r.previa_medicao;

        if (r.classe_l && r.classe_l.trim()) activeTerceiros.add(r.classe_l.trim().toUpperCase());
        if (r.classe_f && r.classe_f.trim()) activeTerceiros.add(r.classe_f.trim().toUpperCase());
    });

    const margem = totPrevia - totTerceiros;
    const margemPct = totPrevia > 0 ? ((margem / totPrevia) * 100).toFixed(1) : '0';

    const elTotTerc = document.getElementById('sar-kpi-fech-total-terceiros');
    const elClasseL = document.getElementById('sar-kpi-fech-classe-l');
    const elClasseF = document.getElementById('sar-kpi-fech-classe-f');
    const elPrevia = document.getElementById('sar-kpi-fech-previa-medicao');
    const elMargemVal = document.getElementById('sar-kpi-fech-margem-valor');
    const elMargemPct = document.getElementById('sar-kpi-fech-margem-pct');
    const elAtivos = document.getElementById('sar-kpi-fech-terceiros-ativos');
    const elOss = document.getElementById('sar-kpi-fech-oss-entregues');

    if (elTotTerc) elTotTerc.innerText = formatCurrencyBR(totTerceiros);
    if (elClasseL) elClasseL.innerText = `L (Cabos): ${formatCurrencyBR(totL)}`;
    if (elClasseF) elClasseF.innerText = `F (Fusão): ${formatCurrencyBR(totF)}`;
    if (elPrevia) elPrevia.innerText = formatCurrencyBR(totPrevia);
    if (elMargemVal) elMargemVal.innerText = formatCurrencyBR(margem);
    if (elMargemPct) {
        elMargemPct.innerText = `${margemPct}% de margem operacional`;
        elMargemPct.style.color = (margem >= 0) ? '#10b981' : '#f85149';
    }
    if (elAtivos) elAtivos.innerText = activeTerceiros.size.toLocaleString('pt-BR');
    if (elOss) elOss.innerText = `${countOss.toLocaleString('pt-BR')} OSs entregues no período`;
}

/**
 * Renderiza os Gráficos do Fechamento de Terceiros
 */
function renderSarFechamentoCharts(data) {
    const pluginList = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

    // 1. Gráfico de Evolução Mensal (Data de Entrega)
    const ctxEvolution = document.getElementById('sar-chart-fech-evolution');
    if (ctxEvolution) {
        if (sarCharts.fechEvolution) {
            sarCharts.fechEvolution.destroy();
            sarCharts.fechEvolution = null;
        }

        const monthMap = {};
        data.forEach(r => {
            if (r.data_entrega) {
                const ym = r.data_entrega.substring(0, 7); // YYYY-MM
                const [ano, mes] = ym.split('-');
                const mesNum = parseInt(mes);
                const label = `${MESES_PT_LABEL[mesNum] || mes}/${ano.substring(2)}`;

                if (!monthMap[ym]) {
                    monthMap[ym] = { ym, label, terceiros: 0, previa: 0 };
                }
                monthMap[ym].terceiros += (r.total_terceiros || 0);
                monthMap[ym].previa += (r.previa_medicao || 0);
            }
        });

        const sortedYms = Object.keys(monthMap).sort();
        const labels = sortedYms.map(k => monthMap[k].label);
        const dataPrevia = sortedYms.map(k => Math.round(monthMap[k].previa));
        const dataTerceiros = sortedYms.map(k => Math.round(monthMap[k].terceiros));

        sarCharts.fechEvolution = new Chart(ctxEvolution, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Prévia Medição (Claro)',
                        data: dataPrevia,
                        backgroundColor: '#10b981',
                        borderColor: '#059669',
                        borderWidth: 1,
                        borderRadius: 3,
                        barPercentage: 0.8,
                        categoryPercentage: 0.85
                    },
                    {
                        label: 'Total Terceiros',
                        data: dataTerceiros,
                        backgroundColor: '#f97316',
                        borderColor: '#ea580c',
                        borderWidth: 1,
                        borderRadius: 3,
                        barPercentage: 0.8,
                        categoryPercentage: 0.85
                    }
                ]
            },
            plugins: pluginList,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'top',
                        align: 'end',
                        labels: { color: '#c9d1d9', font: { family: 'Outfit, Inter', size: 11 }, usePointStyle: true }
                    },
                    tooltip: {
                        backgroundColor: '#161b22',
                        borderColor: 'rgba(255, 255, 255, 0.15)',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                const val = context.parsed.y || 0;
                                return `${context.dataset.label}: ${formatCurrencyBR(val)}`;
                            },
                            footer: function(tooltipItems) {
                                let prev = 0, terc = 0;
                                tooltipItems.forEach(t => {
                                    if (t.datasetIndex === 0) prev = t.parsed.y;
                                    if (t.datasetIndex === 1) terc = t.parsed.y;
                                });
                                const saldo = prev - terc;
                                const pct = prev > 0 ? ((saldo / prev) * 100).toFixed(1) : '0';
                                return `Margem: ${formatCurrencyBR(saldo)} (${pct}%)`;
                            }
                        }
                    },
                    datalabels: {
                        display: false // Não poluir o gráfico com valores muito longos
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#c9d1d9', font: { size: 10 } }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#8b949e',
                            font: { size: 10 },
                            callback: (v) => `${(v / 1000).toFixed(0)}k`
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // 2. Gráfico de Distribuição por Classe (Classe L vs Classe F)
    const ctxDist = document.getElementById('sar-chart-fech-distribuicao');
    if (ctxDist) {
        if (sarCharts.fechDistribuicao) {
            sarCharts.fechDistribuicao.destroy();
            sarCharts.fechDistribuicao = null;
        }

        const targetData = (sarFechamentoCompetencia)
            ? data.filter(r => r.competencia_entrega === sarFechamentoCompetencia)
            : data;

        let totL = 0;
        let totF = 0;
        targetData.forEach(r => {
            totL += (r.valor_classe_l || 0);
            totF += (r.valor_classe_f || 0);
        });

        const totalGeral = totL + totF;

        sarCharts.fechDistribuicao = new Chart(ctxDist, {
            type: 'doughnut',
            data: {
                labels: ['Classe L (Cabos)', 'Classe F (Fusão)'],
                datasets: [{
                    data: [Math.round(totL), Math.round(totF)],
                    backgroundColor: ['#388bfd', '#a855f7'],
                    borderColor: '#161b22',
                    borderWidth: 2,
                    hoverOffset: 6
                }]
            },
            plugins: pluginList,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#c9d1d9', font: { family: 'Outfit, Inter', size: 11 }, padding: 10 }
                    },
                    tooltip: {
                        backgroundColor: '#161b22',
                        borderColor: 'rgba(255, 255, 255, 0.15)',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                const val = context.parsed || 0;
                                const pct = totalGeral > 0 ? ((val * 100) / totalGeral).toFixed(1) : 0;
                                return `${context.label}: ${formatCurrencyBR(val)} (${pct}%)`;
                            }
                        }
                    },
                    datalabels: {
                        display: true,
                        color: '#ffffff',
                        font: { weight: 'bold', size: 11, family: 'Outfit, Inter' },
                        formatter: (val) => {
                            if (!val || totalGeral === 0) return '';
                            const pct = ((val * 100) / totalGeral).toFixed(0) + '%';
                            return pct;
                        }
                    }
                },
                cutout: '58%'
            }
        });
    }
}

/**
 * Renderiza a Tabela Consolidada de Fechamento por Terceiro
 */
function renderSarFechamentoTable(data) {
    const tbody = document.getElementById('sar-fechamento-table-body');
    const tfoot = document.getElementById('sar-fechamento-table-footer');
    const badgeCount = document.getElementById('sar-fech-count-badge');
    if (!tbody) return;

    const targetDataset = (sarFechamentoCompetencia)
        ? data.filter(r => r.competencia_entrega === sarFechamentoCompetencia)
        : data;

    const terceirosMap = {};

    targetDataset.forEach(r => {
        const cL = (r.classe_l || '').trim();
        const cF = (r.classe_f || '').trim();

        // 1. Processar Classe L se permitida
        if (cL && sarFechamentoClasse !== 'CLASSE_F') {
            const keyL = `${cL.toUpperCase()}__CLASSE_L`;
            if (!terceirosMap[keyL]) {
                terceirosMap[keyL] = {
                    nome: cL,
                    classe: 'Classe L (Cabos)',
                    classeTag: 'CLASSE_L',
                    qtdOss: 0,
                    totalPagar: 0,
                    previaMedicao: 0,
                    itensResumo: new Set(),
                    ossList: []
                };
            }
            terceirosMap[keyL].qtdOss++;
            terceirosMap[keyL].totalPagar += (r.valor_classe_l || 0);
            terceirosMap[keyL].previaMedicao += (r.previa_medicao || 0);
            if (r.itens_l_resumo && r.itens_l_resumo !== '-') terceirosMap[keyL].itensResumo.add(r.itens_l_resumo);
            terceirosMap[keyL].ossList.push({ ...r, valor_terceiro_individual: r.valor_classe_l, tipo_atuacao: 'Classe L' });
        }

        // 2. Processar Classe F se permitida
        if (cF && sarFechamentoClasse !== 'CLASSE_L') {
            const keyF = `${cF.toUpperCase()}__CLASSE_F`;
            if (!terceirosMap[keyF]) {
                terceirosMap[keyF] = {
                    nome: cF,
                    classe: 'Classe F (Fusão)',
                    classeTag: 'CLASSE_F',
                    qtdOss: 0,
                    totalPagar: 0,
                    previaMedicao: 0,
                    itensResumo: new Set(),
                    ossList: []
                };
            }
            terceirosMap[keyF].qtdOss++;
            terceirosMap[keyF].totalPagar += (r.valor_classe_f || 0);
            terceirosMap[keyF].previaMedicao += (r.previa_medicao || 0);
            if (r.itens_f_resumo && r.itens_f_resumo !== '-') terceirosMap[keyF].itensResumo.add(r.itens_f_resumo);
            terceirosMap[keyF].ossList.push({ ...r, valor_terceiro_individual: r.valor_classe_f, tipo_atuacao: 'Classe F' });
        }
    });

    let terceirosList = Object.values(terceirosMap);

    // Filtro de Busca por Nome
    if (sarFechamentoSearch) {
        terceirosList = terceirosList.filter(item => item.nome.toLowerCase().includes(sarFechamentoSearch));
    }

    // Cálculos de Margem e Ticket Médio
    terceirosList.forEach(item => {
        item.margemValor = item.previaMedicao - item.totalPagar;
        item.margemPct = item.previaMedicao > 0 ? ((item.margemValor / item.previaMedicao) * 100) : 0;
        item.ticketMedio = item.qtdOss > 0 ? (item.totalPagar / item.qtdOss) : 0;
    });

    // Ordenação
    terceirosList.sort((a, b) => {
        if (sarFechamentoSortColumn === 'nome' || sarFechamentoSortColumn === 'classe') {
            return sarFechamentoSortOrder === 'asc'
                ? a[sarFechamentoSortColumn].localeCompare(b[sarFechamentoSortColumn])
                : b[sarFechamentoSortColumn].localeCompare(a[sarFechamentoSortColumn]);
        }
        const valA = a[sarFechamentoSortColumn] || 0;
        const valB = b[sarFechamentoSortColumn] || 0;
        return sarFechamentoSortOrder === 'asc' ? valA - valB : valB - valA;
    });

    if (badgeCount) {
        badgeCount.innerText = `${terceirosList.length} terceiros listados`;
    }

    if (terceirosList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color: var(--text-secondary); padding: 30px;">Nenhum terceiro localizado com os filtros selecionados.</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    let sumTotalPagar = 0;
    let sumPrevia = 0;
    let sumOss = 0;

    tbody.innerHTML = terceirosList.map(item => {
        sumTotalPagar += item.totalPagar;
        sumPrevia += item.previaMedicao;
        sumOss += item.qtdOss;

        const isClasseL = item.classeTag === 'CLASSE_L';
        const badgeClass = isClasseL ? 'sar-badge-classe-l' : 'sar-badge-classe-f';
        const badgeIcon = isClasseL ? 'fa-route' : 'fa-bolt';

        const itensArr = Array.from(item.itensResumo);
        const itensText = itensArr.length > 0 ? itensArr.slice(0, 2).join('; ') + (itensArr.length > 2 ? '...' : '') : '-';

        return `
            <tr>
                <td style="text-align: left; font-weight: 700; color: var(--text-primary);">
                    ${item.nome}
                </td>
                <td style="text-align: center; white-space: nowrap;">
                    <span class="sar-badge ${badgeClass}">
                        <i class="fa-solid ${badgeIcon}"></i> ${item.classe}
                    </span>
                </td>
                <td style="text-align: center; font-weight: 600;">${item.qtdOss}</td>
                <td style="text-align: left; font-size: 11px; color: var(--text-secondary); max-width: 180px; line-height: 1.2;" title="${itensArr.join('; ')}">
                    ${itensText}
                </td>
                <td style="text-align: right; font-weight: 700; color: #f97316; white-space: nowrap;">
                    ${formatCurrencyBR(item.totalPagar)}
                </td>
                <td style="text-align: right; font-weight: 600; color: #10b981; white-space: nowrap;">
                    ${formatCurrencyBR(item.previaMedicao)}
                </td>
                <td style="text-align: right; font-weight: 600; color: ${item.margemValor >= 0 ? '#388bfd' : '#f85149'}; white-space: nowrap;">
                    ${formatCurrencyBR(item.margemValor)}
                </td>
                <td style="text-align: center; font-weight: 700; color: ${item.margemPct >= 50 ? '#10b981' : item.margemPct >= 30 ? '#f59e0b' : '#f85149'}; white-space: nowrap;">
                    ${item.margemPct.toFixed(1)}%
                </td>
                <td style="text-align: right; font-size: 12px; color: var(--text-secondary); white-space: nowrap;">
                    ${formatCurrencyBR(item.ticketMedio)}
                </td>
                <td style="text-align: center; white-space: nowrap;">
                    <button class="btn-sm-action" onclick="openSarTerceiroDetalhe('${encodeURIComponent(item.nome)}', '${item.classeTag}')" title="Auditar OSs do terceiro">
                        <i class="fa-solid fa-list-check"></i> Ver OSs
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (tfoot) {
        const sumMargem = sumPrevia - sumTotalPagar;
        const sumMargemPct = sumPrevia > 0 ? ((sumMargem / sumPrevia) * 100).toFixed(1) : '0';
        const sumTicket = sumOss > 0 ? (sumTotalPagar / sumOss) : 0;

        tfoot.innerHTML = `
            <tr style="background: rgba(255,255,255,0.04); font-weight: 800;">
                <td style="text-align: left;">TOTAL CONSOLIDADO</td>
                <td style="text-align: center;">-</td>
                <td style="text-align: center;">${sumOss.toLocaleString('pt-BR')}</td>
                <td style="text-align: left;">-</td>
                <td style="text-align: right; color: #f97316;">${formatCurrencyBR(sumTotalPagar)}</td>
                <td style="text-align: right; color: #10b981;">${formatCurrencyBR(sumPrevia)}</td>
                <td style="text-align: right; color: #388bfd;">${formatCurrencyBR(sumMargem)}</td>
                <td style="text-align: center;">${sumMargemPct}%</td>
                <td style="text-align: right;">${formatCurrencyBR(sumTicket)}</td>
                <td style="text-align: center;">-</td>
            </tr>
        `;
    }
}

/**
 * Abre o Modal de Auditoria e Drill-Down do Terceiro
 */
function openSarTerceiroDetalhe(terceiroNomeEnc, classeTag) {
    const terceiroNome = decodeURIComponent(terceiroNomeEnc);
    const modal = document.getElementById('modal-sar-terceiro-detalhe');
    const tbody = document.getElementById('modal-sar-terceiro-table-body');
    if (!modal || !tbody) return;

    const targetDataset = (sarFechamentoCompetencia)
        ? sarFilteredData.filter(r => r.competencia_entrega === sarFechamentoCompetencia)
        : sarFilteredData;

    const oss = [];
    let totPagar = 0;
    let totPrevia = 0;

    targetDataset.forEach(r => {
        let isMatch = false;
        let valPago = 0;
        let itens = '';

        if (classeTag === 'CLASSE_L' && (r.classe_l || '').trim().toUpperCase() === terceiroNome.toUpperCase()) {
            isMatch = true;
            valPago = r.valor_classe_l || 0;
            itens = r.itens_l_resumo || '-';
        } else if (classeTag === 'CLASSE_F' && (r.classe_f || '').trim().toUpperCase() === terceiroNome.toUpperCase()) {
            isMatch = true;
            valPago = r.valor_classe_f || 0;
            itens = r.itens_f_resumo || '-';
        } else if (!classeTag || classeTag === 'TODOS') {
            if ((r.classe_l || '').trim().toUpperCase() === terceiroNome.toUpperCase()) {
                isMatch = true;
                valPago += (r.valor_classe_l || 0);
                itens += (r.itens_l_resumo || '');
            }
            if ((r.classe_f || '').trim().toUpperCase() === terceiroNome.toUpperCase()) {
                isMatch = true;
                valPago += (r.valor_classe_f || 0);
                itens += (itens ? '; ' : '') + (r.itens_f_resumo || '');
            }
        }

        if (isMatch) {
            totPagar += valPago;
            totPrevia += (r.previa_medicao || 0);
            oss.push({
                ...r,
                valor_pago_terceiro: valPago,
                itens_executados: itens || '-'
            });
        }
    });

    sarActiveTerceiroData = {
        nome: terceiroNome,
        classeTag: classeTag,
        competencia: sarFechamentoCompetencia || 'Todas as Competências',
        oss: oss,
        totPagar: totPagar,
        totPrevia: totPrevia
    };

    // Header & KPIs do Modal
    const elTitle = document.getElementById('modal-sar-terceiro-nome');
    const elSub = document.getElementById('modal-sar-terceiro-sub');
    const elKpiPagar = document.getElementById('modal-sar-kpi-total-pagar');
    const elKpiPrevia = document.getElementById('modal-sar-kpi-previa-medicao');
    const elKpiMargem = document.getElementById('modal-sar-kpi-margem');
    const elKpiOss = document.getElementById('modal-sar-kpi-total-oss');

    const classeLabel = classeTag === 'CLASSE_L' ? 'Classe L (Cabos/Linha)' : (classeTag === 'CLASSE_F' ? 'Classe F (Fusão/Caixas)' : 'Geral');
    if (elTitle) elTitle.innerHTML = `<i class="fa-solid fa-user-gear" style="color: #f97316;"></i> ${terceiroNome} — <span style="font-weight: 400; font-size: 0.95rem; color: var(--text-secondary);">${classeLabel}</span>`;
    if (elSub) elSub.innerText = `Competência de Entrega: ${sarActiveTerceiroData.competencia} | Total de OSs: ${oss.length}`;

    if (elKpiPagar) elKpiPagar.innerText = formatCurrencyBR(totPagar);
    if (elKpiPrevia) elKpiPrevia.innerText = formatCurrencyBR(totPrevia);
    const margemVal = totPrevia - totPagar;
    const margemPct = totPrevia > 0 ? ((margemVal / totPrevia) * 100).toFixed(1) : '0';
    if (elKpiMargem) elKpiMargem.innerText = `${formatCurrencyBR(margemVal)} (${margemPct}%)`;
    if (elKpiOss) elKpiOss.innerText = oss.length.toLocaleString('pt-BR');

    // Linhas da Tabela
    tbody.innerHTML = oss.map(r => `
        <tr>
            <td style="font-weight: 700; color: var(--color-primary); white-space: nowrap;">${r.cod}</td>
            <td style="white-space: nowrap;">${r.cidade || '-'}</td>
            <td style="font-size: 12px; line-height: 1.2;">
                <strong>${r.condominio || ''}</strong><br>
                <span style="color: var(--text-secondary);">${r.endereco || '-'}</span>
            </td>
            <td style="white-space: nowrap; text-align: center;">${r.data_entrega_fmt || '-'}</td>
            <td style="font-size: 11px; color: var(--text-secondary);">${r.itens_executados}</td>
            <td style="text-align: right; font-weight: 700; color: #f97316; white-space: nowrap;">${formatCurrencyBR(r.valor_pago_terceiro)}</td>
            <td style="text-align: right; font-weight: 600; color: #10b981; white-space: nowrap;">${formatCurrencyBR(r.previa_medicao)}</td>
        </tr>
    `).join('');

    modal.classList.add('active');
}

function closeSarTerceiroModal(e) {
    if (e.target.id === 'modal-sar-terceiro-detalhe') {
        closeSarTerceiroModalDirect();
    }
}

function closeSarTerceiroModalDirect() {
    const modal = document.getElementById('modal-sar-terceiro-detalhe');
    if (modal) modal.classList.remove('active');
}

/**
 * Exportação Consolidada do Fechamento de Terceiros para Excel
 */
function exportSarFechamentoToExcel() {
    if (typeof XLSX === 'undefined') {
        alert("Biblioteca XLSX não carregada no navegador.");
        return;
    }

    const targetDataset = (sarFechamentoCompetencia)
        ? sarFilteredData.filter(r => r.competencia_entrega === sarFechamentoCompetencia)
        : sarFilteredData;

    const terceirosMap = {};

    targetDataset.forEach(r => {
        const cL = (r.classe_l || '').trim();
        const cF = (r.classe_f || '').trim();

        if (cL && sarFechamentoClasse !== 'CLASSE_F') {
            const keyL = `${cL.toUpperCase()}__CLASSE_L`;
            if (!terceirosMap[keyL]) {
                terceirosMap[keyL] = { nome: cL, classe: 'Classe L (Cabos)', qtdOss: 0, totalPagar: 0, previaMedicao: 0, itens: new Set() };
            }
            terceirosMap[keyL].qtdOss++;
            terceirosMap[keyL].totalPagar += (r.valor_classe_l || 0);
            terceirosMap[keyL].previaMedicao += (r.previa_medicao || 0);
            if (r.itens_l_resumo && r.itens_l_resumo !== '-') terceirosMap[keyL].itens.add(r.itens_l_resumo);
        }

        if (cF && sarFechamentoClasse !== 'CLASSE_L') {
            const keyF = `${cF.toUpperCase()}__CLASSE_F`;
            if (!terceirosMap[keyF]) {
                terceirosMap[keyF] = { nome: cF, classe: 'Classe F (Fusão)', qtdOss: 0, totalPagar: 0, previaMedicao: 0, itens: new Set() };
            }
            terceirosMap[keyF].qtdOss++;
            terceirosMap[keyF].totalPagar += (r.valor_classe_f || 0);
            terceirosMap[keyF].previaMedicao += (r.previa_medicao || 0);
            if (r.itens_f_resumo && r.itens_f_resumo !== '-') terceirosMap[keyF].itens.add(r.itens_f_resumo);
        }
    });

    const rows = Object.values(terceirosMap).map(item => {
        const margem = item.previaMedicao - item.totalPagar;
        const margemPct = item.previaMedicao > 0 ? (margem / item.previaMedicao) * 100 : 0;
        const ticket = item.qtdOss > 0 ? item.totalPagar / item.qtdOss : 0;

        return {
            "Terceiro / Executor": item.nome,
            "Especialidade": item.classe,
            "Competência": sarFechamentoCompetencia || 'Geral / Todas',
            "Qtd OSs Entregues": item.qtdOss,
            "Total a Pagar (R$)": item.totalPagar,
            "Prévia Medição Claro (R$)": item.previaMedicao,
            "Margem Operacional (R$)": margem,
            "% Margem": `${margemPct.toFixed(1)}%`,
            "Ticket Médio / OS (R$)": Math.round(ticket * 100) / 100,
            "Itens LPU Principais": Array.from(item.itens).join('; ')
        };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fechamento_Terceiros");

    const compLabel = sarFechamentoCompetencia ? sarFechamentoCompetencia.replace('/', '_') : 'Geral';
    const filename = `Fechamento_Terceiros_SAR_${compLabel}_${new Date().toISOString().substring(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
}

/**
 * Exporta Extrato Individual de OSs do Terceiro Selecionado
 */
function exportSarTerceiroIndividualToExcel() {
    if (!sarActiveTerceiroData || !sarActiveTerceiroData.oss || sarActiveTerceiroData.oss.length === 0) {
        alert("Nenhum dado selecionado para exportação.");
        return;
    }

    if (typeof XLSX === 'undefined') {
        alert("Biblioteca XLSX não carregada no navegador.");
        return;
    }

    const rows = sarActiveTerceiroData.oss.map(r => ({
        "Código OS": r.cod,
        "Terceiro": sarActiveTerceiroData.nome,
        "Especialidade": r.tipo_atuacao || sarActiveTerceiroData.classeTag,
        "Cidade": r.cidade,
        "Área Técnica": r.area_tecnica,
        "Condomínio": r.condominio,
        "Endereço": r.endereco,
        "Serviço": r.servico,
        "Data Entrada": r.data_entrada_fmt,
        "Data Entrega": r.data_entrega_fmt,
        "Itens LPU Executados": r.itens_executados,
        "Valor Pago ao Terceiro (R$)": r.valor_pago_terceiro,
        "Prévia Medição Claro (R$)": r.previa_medicao,
        "Status Geral": r.status,
        "Prazo (SLA)": r.prazo
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Extrato_OSs");

    const safeName = sarActiveTerceiroData.nome.replace(/[^a-zA-Z0-9]/g, '_');
    const compLabel = sarActiveTerceiroData.competencia.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Extrato_SAR_${safeName}_${compLabel}.xlsx`;
    XLSX.writeFile(wb, filename);
}

// ============================================================
// CONTROLADORES DO PAINEL DE MEDIÇÕES
// Considera estritamente registros com medição preenchida
// ============================================================

/**
 * Card de Resumo de Medição na Sub-Aba Indicadores (Removido a pedido do usuário)
 */
function updateSarMedicaoSummaryKPI(dataset) {
    // Card removido da aba Indicadores
}

/**
 * Retorna o grupo canônico de status para fins de medição
 */
function getSarRecordStatusGrupo(r) {
    if (r && r.status_medicao_grupo) return r.status_medicao_grupo;
    const st = (r && r.status ? r.status : '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    if (st.includes('MEDI') && st.includes('ENVIAD')) return 'MEDIÇÃO ENVIADA';
    if (st.includes('FINALIZ')) return 'FINALIZADO';
    if (st.includes('PEDIDO') && st.includes('EMIT')) return 'PEDIDO EMITIDO';
    return 'OUTROS';
}

/**
 * Retorna a competência formatada para fins de medição
 */
function getSarRecordCompetenciaMedicao(r) {
    if (r && r.competencia_medicao && r.competencia_medicao !== 'SEM DATA' && r.competencia_medicao !== 'SEM DATA (AJ)') {
        return r.competencia_medicao;
    }
    if (r && r.data_medicao && r.data_medicao.length >= 7) {
        const y = r.data_medicao.substring(0, 4);
        const m = parseInt(r.data_medicao.substring(5, 7), 10);
        const meses = ["", "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
        if (m >= 1 && m <= 12) return `${meses[m]}/${y}`;
    }
    return 'Sem Data';
}

/**
 * Filtra os dados exclusivamente para o Painel de Medições
 */
function getSarMedicaoFilteredDataset(dataset) {
    const base = dataset || window.SAR_DATA || [];
    return base.filter(r => {
        // Exige valor de medição preenchido
        if (!r.valor_medicao || r.valor_medicao <= 0) return false;

        // Apenas os 3 status solicitados
        const stGrupo = getSarRecordStatusGrupo(r);
        if (!['MEDIÇÃO ENVIADA', 'FINALIZADO', 'PEDIDO EMITIDO'].includes(stGrupo)) {
            return false;
        }

        // Filtro por Status da Medição
        if (sarMedicaoStatusFiltro !== 'TODOS' && stGrupo !== sarMedicaoStatusFiltro) {
            return false;
        }

        // Filtro por Competência da Data de Medição
        const compMed = getSarRecordCompetenciaMedicao(r);
        if (sarMedicaoCompetenciaFiltro && compMed !== sarMedicaoCompetenciaFiltro) {
            return false;
        }

        // Busca Rápida na Medição
        if (sarMedicaoSearch) {
            const match =
                (r.cod && r.cod.toLowerCase().includes(sarMedicaoSearch)) ||
                (r.cidade && r.cidade.toLowerCase().includes(sarMedicaoSearch)) ||
                (r.area_tecnica && r.area_tecnica.toLowerCase().includes(sarMedicaoSearch)) ||
                (r.servico && r.servico.toLowerCase().includes(sarMedicaoSearch)) ||
                (r.num_wf && r.num_wf.toLowerCase().includes(sarMedicaoSearch)) ||
                (r.num_pedido && r.num_pedido.toLowerCase().includes(sarMedicaoSearch)) ||
                (r.status && r.status.toLowerCase().includes(sarMedicaoSearch));
            if (!match) return false;
        }

        return true;
    });
}

/**
 * Renderiza os KPIs da Sub-Aba de Medições
 */
function renderSarMedicaoKPIs(dataset) {
    const base = dataset || window.SAR_DATA || [];
    
    // Dataset para os KPIs de Medição (respeita competência se selecionada)
    const medDataset = base.filter(r => {
        if (!r.valor_medicao || r.valor_medicao <= 0) return false;
        const stGrupo = getSarRecordStatusGrupo(r);
        if (!['MEDIÇÃO ENVIADA', 'FINALIZADO', 'PEDIDO EMITIDO'].includes(stGrupo)) return false;
        const compMed = getSarRecordCompetenciaMedicao(r);
        if (sarMedicaoCompetenciaFiltro && compMed !== sarMedicaoCompetenciaFiltro) return false;
        return true;
    });

    let totGeral = 0, qtdGeral = 0;
    let totEnv = 0, qtdEnv = 0;
    let totFin = 0, qtdFin = 0;
    let totPed = 0, qtdPed = 0;

    medDataset.forEach(r => {
        const val = r.valor_medicao;
        const stGrupo = getSarRecordStatusGrupo(r);
        totGeral += val;
        qtdGeral++;
        if (stGrupo === 'MEDIÇÃO ENVIADA') {
            totEnv += val;
            qtdEnv++;
        } else if (stGrupo === 'FINALIZADO') {
            totFin += val;
            qtdFin++;
        } else if (stGrupo === 'PEDIDO EMITIDO') {
            totPed += val;
            qtdPed++;
        }
    });

    const pctEnv = totGeral > 0 ? ((totEnv / totGeral) * 100).toFixed(1) : '0.0';
    const pctFin = totGeral > 0 ? ((totFin / totGeral) * 100).toFixed(1) : '0.0';
    const pctPed = totGeral > 0 ? ((totPed / totGeral) * 100).toFixed(1) : '0.0';

    const elTotVal = document.getElementById('sar-kpi-medicao-total');
    const elTotSub = document.getElementById('sar-kpi-medicao-total-sub');
    const elEnvVal = document.getElementById('sar-kpi-medicao-enviada');
    const elEnvSub = document.getElementById('sar-kpi-medicao-enviada-sub');
    const elFinVal = document.getElementById('sar-kpi-medicao-finalizado');
    const elFinSub = document.getElementById('sar-kpi-medicao-finalizado-sub');
    const elPedVal = document.getElementById('sar-kpi-medicao-pedido');
    const elPedSub = document.getElementById('sar-kpi-medicao-pedido-sub');

    if (elTotVal) elTotVal.innerText = formatCurrencyBR(totGeral);
    if (elTotSub) elTotSub.innerText = `${qtdGeral.toLocaleString('pt-BR')} OSs com medição preenchida`;

    if (elEnvVal) elEnvVal.innerText = formatCurrencyBR(totEnv);
    if (elEnvSub) elEnvSub.innerText = `${qtdEnv.toLocaleString('pt-BR')} OSs | ${pctEnv}% do total`;

    if (elFinVal) elFinVal.innerText = formatCurrencyBR(totFin);
    if (elFinSub) elFinSub.innerText = `${qtdFin.toLocaleString('pt-BR')} OSs | ${pctFin}% do total`;

    if (elPedVal) elPedVal.innerText = formatCurrencyBR(totPed);
    if (elPedSub) elPedSub.innerText = `${qtdPed.toLocaleString('pt-BR')} OSs | ${pctPed}% do total`;
}

/**
 * Renderiza o Gráfico de Evolução de Medições
 */
function renderSarMedicaoCharts(dataset) {
    // Destruir gráfico de rosca se existir
    if (sarCharts.medicaoDistribuicao) {
        sarCharts.medicaoDistribuicao.destroy();
        sarCharts.medicaoDistribuicao = null;
    }

    const ctxEvol = document.getElementById('sar-chart-medicao-evolution');
    if (!ctxEvol) return;

    if (sarCharts.medicaoEvolution) {
        sarCharts.medicaoEvolution.destroy();
        sarCharts.medicaoEvolution = null;
    }

    const titleEl = document.getElementById('sar-chart-medicao-evolution-title');
    if (titleEl) {
        titleEl.innerText = 'Evolução de Medições';
    }

    // Para a evolução histórica, usamos todos os registros com medição
    const allMedRecords = (window.SAR_DATA || []).filter(r => {
        if (!r.valor_medicao || r.valor_medicao <= 0) return false;
        const stGrupo = getSarRecordStatusGrupo(r);
        if (!['MEDIÇÃO ENVIADA', 'FINALIZADO', 'PEDIDO EMITIDO'].includes(stGrupo)) return false;
        if (sarFilters.cidade && r.cidade !== sarFilters.cidade) return false;
        if (sarFilters.area_tecnica && r.area_tecnica !== sarFilters.area_tecnica) return false;
        return true;
    });

    // Agrupar por Competência da data de medição
    const compMap = {};
    allMedRecords.forEach(r => {
        let comp = getSarRecordCompetenciaMedicao(r);
        if (!comp || comp === 'SEM DATA (AJ)' || comp === 'SEM DATA') comp = 'Sem Data';
        if (!compMap[comp]) {
            compMap[comp] = { env: 0, fin: 0, ped: 0, total: 0 };
        }
        const stGrupo = getSarRecordStatusGrupo(r);
        if (stGrupo === 'MEDIÇÃO ENVIADA') compMap[comp].env += r.valor_medicao;
        else if (stGrupo === 'FINALIZADO') compMap[comp].fin += r.valor_medicao;
        else if (stGrupo === 'PEDIDO EMITIDO') compMap[comp].ped += r.valor_medicao;
        compMap[comp].total += r.valor_medicao;
    });

    // Ordenar cronologicamente (da mais antiga para a mais recente)
    const sortedComps = Object.keys(compMap).sort((a, b) => {
        if (a === 'Sem Data') return -1;
        if (b === 'Sem Data') return 1;
        const pA = a.split('/');
        const pB = b.split('/');
        const yA = parseInt(pA[1]) || 0;
        const yB = parseInt(pB[1]) || 0;
        if (yA !== yB) return yA - yB;
        const mA = MESES_MAP_PT[(pA[0] || '').toUpperCase()] || 0;
        const mB = MESES_MAP_PT[(pB[0] || '').toUpperCase()] || 0;
        return mA - mB;
    });

    // Formatar rótulos curtos idênticos aos da aba Indicadores (ex: Set/26)
    const labels = sortedComps.map(c => {
        if (c === 'Sem Data') return 'Sem Data';
        const parts = c.split('/');
        if (parts.length === 2) {
            const mesName = (parts[0] || '').toUpperCase().trim();
            const mIdx = MESES_MAP_PT[mesName];
            const anoStr = parts[1].trim();
            const shortAno = anoStr.length === 4 ? anoStr.substring(2) : anoStr;
            if (mIdx && MESES_PT_LABEL[mIdx]) {
                return `${MESES_PT_LABEL[mIdx]}/${shortAno}`;
            }
        }
        return c;
    });

    const dataEnv = sortedComps.map(c => Math.round(compMap[c].env));
    const dataFin = sortedComps.map(c => Math.round(compMap[c].fin));
    const dataPed = sortedComps.map(c => Math.round(compMap[c].ped));

    const pluginList = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

    sarCharts.medicaoEvolution = new Chart(ctxEvol, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Medição Enviada',
                    data: dataEnv,
                    backgroundColor: '#f97316',
                    borderColor: '#ea580c',
                    borderWidth: 1,
                    borderRadius: 2,
                    stack: 'sarMedicaoStack',
                    barPercentage: 0.75,
                    categoryPercentage: 0.85
                },
                {
                    label: 'Finalizado',
                    data: dataFin,
                    backgroundColor: '#388bfd',
                    borderColor: '#1d70d8',
                    borderWidth: 1,
                    borderRadius: 2,
                    stack: 'sarMedicaoStack',
                    barPercentage: 0.75,
                    categoryPercentage: 0.85
                },
                {
                    label: 'Pedido Emitido',
                    data: dataPed,
                    backgroundColor: '#10b981',
                    borderColor: '#059669',
                    borderWidth: 1,
                    borderRadius: 2,
                    stack: 'sarMedicaoStack',
                    barPercentage: 0.75,
                    categoryPercentage: 0.85
                }
            ]
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
                        label: function(context) {
                            return ` ${context.dataset.label}: ${formatCurrencyBR(context.raw || 0)}`;
                        },
                        footer: function(tooltipItems) {
                            let sum = 0;
                            tooltipItems.forEach(function(tooltipItem) {
                                sum += tooltipItem.parsed.y;
                            });
                            return 'Total de Medições: ' + formatCurrencyBR(sum);
                        }
                    }
                },
                datalabels: {
                    display: function(context) {
                        const val = context.dataset.data[context.dataIndex];
                        return val >= 10000;
                    },
                    color: '#ffffff',
                    font: { weight: 'bold', size: 9, family: 'Outfit, Inter' },
                    formatter: function(val) {
                        if (!val || val <= 0) return '';
                        if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
                        if (val >= 1000) return Math.round(val / 1000) + 'k';
                        return Math.round(val);
                    }
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
                    ticks: {
                        color: '#8b949e',
                        font: { size: 10, family: 'Outfit, Inter' },
                        callback: function(value) {
                            if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                            if (value >= 1000) return (value / 1000).toFixed(0) + 'k';
                            return value;
                        }
                    },
                    beginAtZero: true,
                    grace: '10%'
                }
            }
        }
    });
}

/**
 * Renderiza a Tabela Detalhada de Medições
 */
function renderSarMedicaoTable(dataset) {
    const tbody = document.getElementById('sar-medicao-table-body');
    const tfoot = document.getElementById('sar-medicao-table-footer');
    const countBadge = document.getElementById('sar-medicao-count-badge');
    if (!tbody) return;

    const medData = getSarMedicaoFilteredDataset(dataset);

    if (medData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color: var(--text-secondary); padding: 30px;">Nenhuma medição encontrada para os filtros selecionados.</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        if (countBadge) countBadge.innerText = '0 medições listadas';
        return;
    }

    // Ordenação
    const sorted = [...medData].sort((a, b) => {
        let valA = a[sarMedicaoSortColumn];
        let valB = b[sarMedicaoSortColumn];

        if (valA === undefined || valA === null) valA = '';
        if (valB === undefined || valB === null) valB = '';

        if (typeof valA === 'number' && typeof valB === 'number') {
            return sarMedicaoSortOrder === 'asc' ? valA - valB : valB - valA;
        }
        valA = valA.toString().toLowerCase();
        valB = valB.toString().toLowerCase();
        return sarMedicaoSortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    let totalSoma = 0;

    tbody.innerHTML = sorted.map(r => {
        totalSoma += (r.valor_medicao || 0);

        const stGrupo = getSarRecordStatusGrupo(r);
        let badgeClass = 'sar-badge-status-med-outro';
        if (stGrupo === 'MEDIÇÃO ENVIADA') badgeClass = 'sar-badge-status-med-enviada';
        else if (stGrupo === 'FINALIZADO') badgeClass = 'sar-badge-status-med-finalizado';
        else if (stGrupo === 'PEDIDO EMITIDO') badgeClass = 'sar-badge-status-med-pedido';

        const dtMedFmt = r.data_medicao_fmt || (r.data_medicao ? format_date_br(r.data_medicao) : '-');
        const dtPedFmt = r.data_pedido_fmt || (r.data_pedido ? format_date_br(r.data_pedido) : '-');

        return `
            <tr>
                <td style="font-weight: 700; color: var(--color-primary); white-space: nowrap;">${r.cod || '-'}</td>
                <td style="white-space: nowrap;" title="${r.cidade || ''}">${r.cidade || '-'}</td>
                <td style="text-align: center; white-space: nowrap;">${r.area_tecnica || '-'}</td>
                <td style="max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${r.servico || ''}">${r.servico || '-'}</td>
                <td style="text-align: center; white-space: nowrap; font-weight: 600; color: #388bfd;">${dtMedFmt}</td>
                <td style="text-align: right; white-space: nowrap; font-weight: 700; color: #f59e0b;">${formatCurrencyBR(r.valor_medicao)}</td>
                <td style="text-align: center; white-space: nowrap;"><span class="${badgeClass}">${r.status || '-'}</span></td>
                <td style="text-align: center; white-space: nowrap; font-size: 11px;">${r.num_wf || '-'}</td>
                <td style="text-align: center; white-space: nowrap; font-size: 11px;">${dtPedFmt}</td>
                <td style="text-align: center; white-space: nowrap; font-size: 11px;">${r.num_pedido || '-'}</td>
            </tr>
        `;
    }).join('');

    if (tfoot) {
        tfoot.innerHTML = `
            <tr style="border-top: 2px solid var(--border-color); font-weight: 700; background: rgba(0,0,0,0.2);">
                <td colspan="4" style="text-align: right; padding: 12px 14px; text-transform: uppercase; font-size: 12px; color: var(--text-secondary);">Totais Consolidados:</td>
                <td style="text-align: center; padding: 12px 6px; color: #388bfd;">${sorted.length} OSs</td>
                <td style="text-align: right; padding: 12px 14px; color: #f59e0b; font-size: 14px;">${formatCurrencyBR(totalSoma)}</td>
                <td colspan="4"></td>
            </tr>
        `;
    }

    if (countBadge) {
        countBadge.innerText = `${sorted.length.toLocaleString('pt-BR')} medições listadas | Total: ${formatCurrencyBR(totalSoma)}`;
    }
}

/**
 * Filtro por Status da Medição
 */
function setSarMedicaoStatus(st) {
    sarMedicaoStatusFiltro = st;

    const btnTodos = document.getElementById('sar-med-btn-status-todos');
    const btnEnv = document.getElementById('sar-med-btn-status-enviada');
    const btnFin = document.getElementById('sar-med-btn-status-finalizado');
    const btnPed = document.getElementById('sar-med-btn-status-pedido');

    if (btnTodos) btnTodos.classList.toggle('active', st === 'TODOS');
    if (btnEnv) btnEnv.classList.toggle('active', st === 'MEDIÇÃO ENVIADA');
    if (btnFin) btnFin.classList.toggle('active', st === 'FINALIZADO');
    if (btnPed) btnPed.classList.toggle('active', st === 'PEDIDO EMITIDO');

    renderSarMedicaoTable(sarFilteredData);
}

/**
 * Filtro por Competência de Medição
 */
function onSarMedicaoCompetenciaChange(comp) {
    sarMedicaoCompetenciaFiltro = comp;
    renderSarMedicaoKPIs(sarFilteredData);
    renderSarMedicaoCharts(sarFilteredData);
    renderSarMedicaoTable(sarFilteredData);
}

/**
 * Busca rápida no Painel de Medições
 */
function onSarMedicaoSearch(val) {
    sarMedicaoSearch = (val || '').trim().toLowerCase();
    renderSarMedicaoTable(sarFilteredData);
}

/**
 * Ordenação da Tabela de Medições
 */
function sortSarMedicao(col) {
    if (sarMedicaoSortColumn === col) {
        sarMedicaoSortOrder = sarMedicaoSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        sarMedicaoSortColumn = col;
        sarMedicaoSortOrder = (col === 'valor_medicao' || col === 'data_medicao') ? 'desc' : 'asc';
    }
    renderSarMedicaoTable(sarFilteredData);
}

/**
 * Exportação das Medições Filtradas para Excel
 */
function exportSarMedicaoToExcel() {
    const medData = getSarMedicaoFilteredDataset(sarFilteredData);
    if (!medData || medData.length === 0) {
        alert("Nenhuma medição disponível para exportação com os filtros atuais.");
        return;
    }

    if (typeof XLSX === 'undefined') {
        alert("Biblioteca XLSX não carregada no navegador.");
        return;
    }

    const rows = medData.map(r => ({
        "Código SAR": r.cod || '',
        "Cidade": r.cidade || '',
        "Área Técnica": r.area_tecnica || '',
        "Node": r.node || '',
        "Site": r.site || '',
        "Endereço": r.endereco || '',
        "Serviço": r.servico || '',
        "Data Medição": r.data_medicao_fmt || (r.data_medicao ? format_date_br(r.data_medicao) : '-'),
        "Competência Medição": getSarRecordCompetenciaMedicao(r),
        "Valor Medição (R$)": r.valor_medicao || 0,
        "Status Geral SAR": r.status || '',
        "Status Medição": getSarRecordStatusGrupo(r),
        "Nº WF": r.num_wf || '',
        "Data Pedido": r.data_pedido_fmt || (r.data_pedido ? format_date_br(r.data_pedido) : '-'),
        "Nº Pedido": r.num_pedido || '',
        "Prévia Medição (R$)": r.previa_medicao || 0,
        "Total Terceiros (R$)": r.total_terceiros || 0
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Medicoes");

    const stLabel = sarMedicaoStatusFiltro.replace(/[^a-zA-Z0-9]/g, '_');
    const compLabel = (sarMedicaoCompetenciaFiltro || 'Todas').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Medicoes_SAR_${stLabel}_${compLabel}_${new Date().toISOString().substring(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
}

/**
 * Exportação Geral dos Dados do SAR para Excel via SheetJS
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
        "Valor Medição (R$)": r.valor_medicao || 0,
        "Total Terceiros (R$)": r.total_terceiros || 0,
        "Valor Classe L (R$)": r.valor_classe_l || 0,
        "Valor Classe F (R$)": r.valor_classe_f || 0,
        "Prévia Medição (R$)": r.previa_medicao || 0,
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
