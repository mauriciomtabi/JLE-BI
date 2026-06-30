/**
 * ============================================================
 * mdu_app.js — Lógica da tela de MDUs (Acompanhamento)
 * v1.0
 * ============================================================
 */

// Estado Global da Página MDU
const GOOGLE_SHEETS_MDU_URL = "https://docs.google.com/spreadsheets/d/your-spreadsheet-id/edit";

let mduDataLoaded = false;
let mduFilteredData = [];
let mduPage = 1;
const mduPageSize = 10;
let mdu_map = null;
let mdu_markersGroup = null;
let mdu_tileLayer = null;
let mdu_legend = null;

const mduFilters = {
    status: [],
    cidade: '',
    cluster: '',
    equipe: ''
};

let mduSearchQuery = ''; // Busca rápida global
let lastMduFiltersState = '';
let mduMapInitializedBounds = false;

// Estado de visualização do gráfico de Finalizados por Período
let mduDrilldownActive = false;
let mduDrilldownPeriod = null; // { month: 5, year: 2025, label: "Mai/25" }

const mduCharts = {
    status: null,
    finalizadosPeriodo: null
};

function initMdu() {
    if (mduDataLoaded) return;
    mduDataLoaded = true;

    // Vincular URL da Planilha Google
    const sheetsBtn = document.getElementById('mdu-google-sheets-btn');
    if (sheetsBtn) {
        sheetsBtn.href = GOOGLE_SHEETS_MDU_URL;
    }

    if (!window.MDU_DATA || window.MDU_DATA.length === 0) {
        console.error("Dados de MDU não foram carregados.");
        document.getElementById('mdu-table-body').innerHTML = 
            '<tr><td colspan="9" style="text-align:center; color: var(--text-secondary);">Nenhum dado de MDU encontrado. Verifique se mdu_data.js foi gerado.</td></tr>';
        return;
    }

    populateMduFilterSelects();
    applyMduFilters();
}

function populateMduFilterSelects() {
    const data = window.MDU_DATA;

    const uniqueStatus = [...new Set(data.map(r => r.status).filter(Boolean))].sort();
    const uniqueCidades = [...new Set(data.map(r => r.cidade).filter(Boolean))].sort();
    const uniqueClusters = [...new Set(data.map(r => r.cluster).filter(Boolean))].sort();
    const uniqueEquipes = [...new Set(data.map(r => r.equipe).filter(Boolean))].sort();

    const statusDropdown = document.getElementById('mdu-multiselect-status-dropdown');
    const cidadeSelect = document.getElementById('mdu-filter-cidade');
    const clusterSelect = document.getElementById('mdu-filter-cluster');
    const equipeSelect = document.getElementById('mdu-filter-equipe');

    if (statusDropdown) {
        statusDropdown.innerHTML = '';
        uniqueStatus.forEach(status => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'mdu-multiselect-item';
            itemDiv.innerHTML = `
                <input type="checkbox" value="${status}" id="status-chk-${status}" onchange="handleMduStatusChange()">
                <label for="status-chk-${status}" onclick="event.stopPropagation()">${status}</label>
            `;
            itemDiv.onclick = (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const chk = itemDiv.querySelector('input');
                    chk.checked = !chk.checked;
                    handleMduStatusChange();
                }
            };
            statusDropdown.appendChild(itemDiv);
        });
    }

    if (cidadeSelect) {
        cidadeSelect.innerHTML = '<option value="">Todas as Cidades</option>';
        uniqueCidades.forEach(v => {
            cidadeSelect.innerHTML += `<option value="${v}">${v}</option>`;
        });
    }

    if (clusterSelect) {
        clusterSelect.innerHTML = '<option value="">Todos os Clusters</option>';
        uniqueClusters.forEach(v => {
            clusterSelect.innerHTML += `<option value="${v}">${v}</option>`;
        });
    }

    if (equipeSelect) {
        equipeSelect.innerHTML = '<option value="">Todas as Equipes</option>';
        uniqueEquipes.forEach(v => {
            equipeSelect.innerHTML += `<option value="${v}">${v}</option>`;
        });
    }
}

function applyMduFilters() {
    const cidadeSelect = document.getElementById('mdu-filter-cidade');
    const clusterSelect = document.getElementById('mdu-filter-cluster');
    const equipeSelect = document.getElementById('mdu-filter-equipe');

    mduFilters.cidade = cidadeSelect ? cidadeSelect.value : '';
    mduFilters.cluster = clusterSelect ? clusterSelect.value : '';
    mduFilters.equipe = equipeSelect ? equipeSelect.value : '';

    mduFilteredData = window.MDU_DATA.filter(r => {
        if (mduFilters.status && mduFilters.status.length > 0 && !mduFilters.status.includes(r.status)) return false;
        if (mduFilters.cidade && r.cidade !== mduFilters.cidade) return false;
        if (mduFilters.cluster && r.cluster !== mduFilters.cluster) return false;
        if (mduFilters.equipe && r.equipe !== mduFilters.equipe) return false;

        // Busca rápida multi-campo
        if (mduSearchQuery) {
            const q = mduSearchQuery.toLowerCase();
            const haystack = [
                r.os, r.endereco, r.cidade, r.equipe,
                r.cluster, r.caixa_m, r.node, r.status
            ].map(v => String(v || '').toLowerCase()).join(' ');
            if (!haystack.includes(q)) return false;
        }

        return true;
    });

    // Atualizar KPIs
    renderMduKPIs();

    // Renderizar Gráficos
    renderMduCharts();

    // Renderizar Tabela
    mduPage = 1;
    renderMduTable();

    // Atualizar Mapa
    updateMduMap();
}

function clearMduFilters() {
    const checkboxes = document.querySelectorAll('#mdu-multiselect-status-dropdown input[type="checkbox"]');
    checkboxes.forEach(chk => chk.checked = false);

    const valueSpan = document.getElementById('mdu-multiselect-status-value');
    if (valueSpan) valueSpan.innerText = 'Todos os Status';

    mduFilters.status = [];

    const cidadeSelect = document.getElementById('mdu-filter-cidade');
    const clusterSelect = document.getElementById('mdu-filter-cluster');
    const equipeSelect = document.getElementById('mdu-filter-equipe');

    if (cidadeSelect) cidadeSelect.value = '';
    if (clusterSelect) clusterSelect.value = '';
    if (equipeSelect) equipeSelect.value = '';

    // Limpar busca rápida
    mduSearchQuery = '';
    const searchBar = document.getElementById('mdu-search-bar');
    if (searchBar) searchBar.value = '';
    const mapSearchInput = document.getElementById('mdu-map-search-input');
    if (mapSearchInput) mapSearchInput.value = '';

    applyMduFilters();
}

// Handler do campo de busca rápida (centralizado)
function onMduSearchInput(value) {
    mduSearchQuery = value;
    const trimmedVal = value.trim();
    
    // Sincroniza com o campo de busca no mapa (se existir)
    const mapInput = document.getElementById('mdu-map-search-input');
    if (mapInput && mapInput.value !== value) mapInput.value = value;
    
    // Sincroniza com a barra de filtros (se existir)
    const filterInput = document.getElementById('mdu-search-bar');
    if (filterInput && filterInput.value !== value) filterInput.value = value;
    
    applyMduFilters();
}
window.onMduSearchInput = onMduSearchInput;

function renderMduKPIs() {
    const total = mduFilteredData.length;
    
    const finalizadas = mduFilteredData.filter(r => 
        String(r.status || '').toUpperCase() === 'FINALIZADO' || 
        String(r.status || '').toUpperCase() === 'FINALIZADA'
    ).length;

    const canceladas = mduFilteredData.filter(r => 
        String(r.status || '').toUpperCase() === 'CANCELADO' || 
        String(r.status || '').toUpperCase() === 'CANCELADA'
    ).length;

    const andamento = total - finalizadas - canceladas;

    // Atualizar valores do DOM
    document.getElementById('mdu-kpi-total').innerText = total.toLocaleString('pt-BR');
    document.getElementById('mdu-kpi-finalizado').innerText = finalizadas.toLocaleString('pt-BR');
    document.getElementById('mdu-kpi-andamento').innerText = andamento.toLocaleString('pt-BR');
    document.getElementById('mdu-kpi-cancelado').innerText = canceladas.toLocaleString('pt-BR');

    // Percentuais
    const pFinalizado = total > 0 ? ((finalizadas / total) * 100).toFixed(1) : '0.0';
    const pAndamento = total > 0 ? ((andamento / total) * 100).toFixed(1) : '0.0';
    const pCancelado = total > 0 ? ((canceladas / total) * 100).toFixed(1) : '0.0';

    document.getElementById('mdu-kpi-finalizado-percent').innerText = `${pFinalizado}%`;
    document.getElementById('mdu-kpi-andamento-percent').innerText = `${pAndamento}%`;
    document.getElementById('mdu-kpi-cancelado-percent').innerText = `${pCancelado}%`;
}

function renderMduCharts() {
    const indicatorsTab = document.getElementById('subview-mdu-indicators');
    if (!indicatorsTab || indicatorsTab.style.display === 'none') {
        return; // Apenas renderiza se a aba de indicadores do MDU estiver ativa/visível
    }

    renderStatusChart();
    renderMduPerformanceTable();
    renderFinalizadosPeriodoChart();
}

function getThemeColors() {
    const isDark = !document.body.classList.contains('light-theme');
    return {
        text: isDark ? '#b2bec3' : '#636e72',
        grid: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
    };
}

function renderStatusChart() {
    const canvas = document.getElementById('mdu-chart-status');
    if (!canvas) return;

    if (mduCharts.status) {
        mduCharts.status.destroy();
    }

    // Agregar contagem de status
    const statusCounts = {};
    mduFilteredData.forEach(r => {
        const status = r.status || 'Não Definido';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const labels = Object.keys(statusCounts).sort((a,b) => statusCounts[b] - statusCounts[a]);
    const data = labels.map(l => statusCounts[l]);

    // Paleta de cores premium
    const colors = {
        'Finalizado': '#2ed573',
        'Finalizada': '#2ed573',
        'Cancelado': '#ff4757',
        'Cancelada': '#ff4757',
        'Fusão': '#1e90ff',
        '2ª Vistoria': '#3742fa',
        '1ª Vistoria': '#70a1ff',
        'Medição': '#ffa502',
        'Relatório': '#a4b0be',
        'Baixa': '#2f3542',
        'Projeto': '#ff6b81'
    };

    const backgroundColors = labels.map(l => colors[l] || '#ced6e0');
    const isDark = !document.body.classList.contains('light-theme');
    const textThemeColor = isDark ? '#b2bec3' : '#636e72';

    mduCharts.status = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderRadius: 4,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    display: true,
                    anchor: 'end',
                    align: 'top',
                    color: textThemeColor,
                    font: { family: 'Outfit', weight: 'bold', size: 10 },
                    formatter: (value) => value.toLocaleString('pt-BR')
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw || 0;
                            const total = context.dataset.data.reduce((a,b) => a+b, 0);
                            const pct = ((val / total) * 100).toFixed(1);
                            return ` Quantidade: ${val.toLocaleString('pt-BR')} (${pct}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: textThemeColor,
                        font: { family: 'Outfit', size: 10 }
                    }
                },
                y: {
                    grid: { color: getThemeColors().grid },
                    ticks: {
                        color: textThemeColor,
                        font: { family: 'Outfit', size: 10 }
                    },
                    grace: '15%'
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}

// Auxiliares de data para o MDU
function parseMduDateBaixa(r) {
    if (!r.data_baixa || r.data_baixa === '-') return null;
    
    // Tenta obter o ano de primeira_visita (formato DD/MM/YYYY)
    let year = 2025; // default fallback
    if (r.primeira_visita && r.primeira_visita.includes('/')) {
        const parts = r.primeira_visita.split('/');
        if (parts.length === 3) {
            const y = parseInt(parts[2]);
            if (!isNaN(y)) year = y;
        }
    }
    
    const parts = r.data_baixa.split('/');
    if (parts.length === 2) {
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]); // 1-indexed
        if (!isNaN(day) && !isNaN(month)) {
            return {
                day: day,
                month: month,
                year: year,
                dateObj: new Date(year, month - 1, day),
                formattedPeriod: `${getMonthNameShort(month)}/${String(year).slice(-2)}` // ex: "Mai/25"
            };
        }
    }
    return null;
}

function getMonthNameShort(monthIndex) {
    const months = [
        'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
        'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
    ];
    return months[monthIndex - 1] || '';
}

function sortPeriods(a, b) {
    const monthOrder = {
        'Jan': 1, 'Fev': 2, 'Mar': 3, 'Abr': 4, 'Mai': 5, 'Jun': 6,
        'Jul': 7, 'Ago': 8, 'Set': 9, 'Out': 10, 'Nov': 11, 'Dez': 12
    };
    const partsA = a.split('/');
    const partsB = b.split('/');
    const yA = parseInt(partsA[1]) || 0;
    const yB = parseInt(partsB[1]) || 0;
    if (yA !== yB) return yA - yB;
    return (monthOrder[partsA[0]] || 0) - (monthOrder[partsB[0]] || 0);
}

function renderFinalizadosPeriodoChart() {
    const canvas = document.getElementById('mdu-chart-finalizados-periodo');
    if (!canvas) return;

    if (mduCharts.finalizadosPeriodo) {
        mduCharts.finalizadosPeriodo.destroy();
    }

    const backBtn = document.getElementById('mdu-drilldown-back-btn');
    const titleElement = canvas.closest('.mdu-card').querySelector('.mdu-card-title span');

    // Filtrar registros com status Finalizado e data de baixa válida
    const finalizedRecords = mduFilteredData.filter(r => {
        const statusUpper = String(r.status || '').toUpperCase().trim();
        return (statusUpper === 'FINALIZADO' || statusUpper === 'FINALIZADA') && r.data_baixa && r.data_baixa !== '-';
    });

    // Parse de todas as datas
    const parsedData = finalizedRecords.map(r => ({
        record: r,
        dateInfo: parseMduDateBaixa(r)
    })).filter(item => item.dateInfo !== null);

    const isDark = !document.body.classList.contains('light-theme');
    const textThemeColor = isDark ? '#b2bec3' : '#636e72';

    if (!mduDrilldownActive) {
        // --- VISÃO MENSAL ---
        if (backBtn) backBtn.style.display = 'none';
        if (titleElement) titleElement.innerText = 'Finalizados por Período Mês/Ano';

        const periodCounts = {};
        parsedData.forEach(item => {
            const period = item.dateInfo.formattedPeriod;
            periodCounts[period] = (periodCounts[period] || 0) + 1;
        });

        const labels = Object.keys(periodCounts).sort(sortPeriods);
        const data = labels.map(p => periodCounts[p]);

        mduCharts.finalizadosPeriodo = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Finalizados',
                    data: data,
                    backgroundColor: 'rgba(46, 213, 115, 0.75)',
                    hoverBackgroundColor: 'rgba(46, 213, 115, 0.95)',
                    borderRadius: 4,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        display: true,
                        anchor: 'end',
                        align: 'top',
                        color: textThemeColor,
                        font: { family: 'Outfit', weight: 'bold', size: 10 },
                        formatter: (val) => val.toLocaleString('pt-BR')
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` Finalizados: ${context.raw.toLocaleString('pt-BR')}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: textThemeColor,
                            font: { family: 'Outfit', size: 10 }
                        }
                    },
                    y: {
                        grid: { color: getThemeColors().grid },
                        ticks: {
                            color: textThemeColor,
                            font: { family: 'Outfit', size: 10 }
                        },
                        grace: '15%'
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const clickedPeriod = labels[index];
                        
                        const match = parsedData.find(item => item.dateInfo.formattedPeriod === clickedPeriod);
                        if (match) {
                            mduDrilldownActive = true;
                            mduDrilldownPeriod = {
                                month: match.dateInfo.month,
                                year: match.dateInfo.year,
                                label: clickedPeriod
                            };
                            renderFinalizadosPeriodoChart();
                        }
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
    } else {
        // --- VISÃO DIÁRIA (DRILL DOWN) ---
        if (backBtn) backBtn.style.display = 'flex';
        
        const fullMonthNames = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        const monthLabel = fullMonthNames[mduDrilldownPeriod.month - 1];
        if (titleElement) {
            titleElement.innerText = `Finalizados em ${monthLabel}/${mduDrilldownPeriod.year} (Visão Diária)`;
        }

        const daysInMonth = new Date(mduDrilldownPeriod.year, mduDrilldownPeriod.month, 0).getDate();
        const dailyCounts = {};
        for (let d = 1; d <= daysInMonth; d++) {
            dailyCounts[d] = 0;
        }

        parsedData.forEach(item => {
            if (item.dateInfo.month === mduDrilldownPeriod.month && item.dateInfo.year === mduDrilldownPeriod.year) {
                const day = item.dateInfo.day;
                if (dailyCounts[day] !== undefined) {
                    dailyCounts[day]++;
                }
            }
        });

        const labels = Object.keys(dailyCounts).map(d => String(d));
        const data = labels.map(d => dailyCounts[d]);

        mduCharts.finalizadosPeriodo = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Finalizados',
                    data: data,
                    backgroundColor: 'rgba(30, 144, 255, 0.75)',
                    hoverBackgroundColor: 'rgba(30, 144, 255, 0.95)',
                    borderRadius: 4,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        display: (context) => context.dataset.data[context.dataIndex] > 0,
                        anchor: 'end',
                        align: 'top',
                        color: textThemeColor,
                        font: { family: 'Outfit', weight: 'bold', size: 9 }
                    },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                return `${context[0].label} de ${monthLabel} de ${mduDrilldownPeriod.year}`;
                            },
                            label: function(context) {
                                return ` Finalizados: ${context.raw}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: textThemeColor,
                            font: { family: 'Outfit', size: 9 }
                        }
                    },
                    y: {
                        grid: { color: getThemeColors().grid },
                        ticks: {
                            color: textThemeColor,
                            font: { family: 'Outfit', size: 10 }
                        },
                        grace: '15%'
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
    }
}

function backFromMduDrilldown() {
    mduDrilldownActive = false;
    mduDrilldownPeriod = null;
    renderFinalizadosPeriodoChart();
}
window.backFromMduDrilldown = backFromMduDrilldown;

function renderMduPerformanceTable() {
    const tbody = document.getElementById('mdu-performance-table-body');
    if (!tbody) return;

    const performanceData = {};
    const statusColumns = [
        '1ª VISTORIA',
        '2ª VISTORIA',
        'PROJETO',
        'FUSÃO',
        'MEDIÇÃO',
        'RELATÓRIO',
        'BAIXA'
    ];

    mduFilteredData.forEach(r => {
        const equipe = r.equipe ? r.equipe.trim() : 'Sem Equipe';
        let status = r.status ? r.status.trim().toUpperCase() : '';
        
        if (status === '1ª VISTORIA') status = '1ª VISTORIA';
        else if (status === '2ª VISTORIA') status = '2ª VISTORIA';
        
        if (!performanceData[equipe]) {
            performanceData[equipe] = {
                equipe: equipe,
                counts: {}
            };
            statusColumns.forEach(col => {
                performanceData[equipe].counts[col] = 0;
            });
        }

        if (statusColumns.includes(status)) {
            performanceData[equipe].counts[status]++;
        }
    });

    const sortedEquipes = Object.keys(performanceData).sort().map(k => performanceData[k]);

    if (sortedEquipes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--text-secondary); padding: 20px;">Nenhum dado de desempenho encontrado.</td></tr>';
        return;
    }

    let html = '';
    sortedEquipes.forEach(eq => {
        let rowHtml = `<tr><td>${escapeHtml(eq.equipe)}</td>`;
        statusColumns.forEach(col => {
            const count = eq.counts[col] || 0;
            if (count > 0) {
                let badgeStyle = '';
                if (col === '1ª VISTORIA' || col === '2ª VISTORIA') badgeStyle = 'background-color: rgba(112, 161, 255, 0.15); color: #70a1ff;';
                else if (col === 'PROJETO') badgeStyle = 'background-color: rgba(255, 107, 129, 0.15); color: #ff6b81;';
                else if (col === 'FUSÃO') badgeStyle = 'background-color: rgba(30, 144, 255, 0.15); color: #1e90ff;';
                else if (col === 'MEDIÇÃO') badgeStyle = 'background-color: rgba(255, 165, 2, 0.15); color: #ffa502;';
                else if (col === 'RELATÓRIO') badgeStyle = 'background-color: rgba(164, 176, 190, 0.15); color: #a4b0be;';
                else if (col === 'BAIXA') badgeStyle = 'background-color: rgba(47, 53, 66, 0.15); color: #2f3542;';
                
                rowHtml += `<td style="text-align: center;"><span class="badge-count" style="${badgeStyle}">${count}</span></td>`;
            } else {
                rowHtml += `<td style="text-align: center;"><span class="badge-count count-zero">-</span></td>`;
            }
        });
        rowHtml += `</tr>`;
        html += rowHtml;
    });

    tbody.innerHTML = html;
}

function renderMduTable() {
    const tbody = document.getElementById('mdu-table-body');
    if (!tbody) return;

    if (mduFilteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: var(--text-secondary);">Nenhuma OS MDU encontrada com os filtros selecionados.</td></tr>';
        document.getElementById('mdu-pagination-info').innerText = '0 registros';
        document.getElementById('mdu-pagination-btns').innerHTML = '';
        return;
    }

    const totalItems = mduFilteredData.length;
    const totalPages = Math.ceil(totalItems / mduPageSize);

    if (mduPage > totalPages) mduPage = totalPages;
    if (mduPage < 1) mduPage = 1;

    const startIndex = (mduPage - 1) * mduPageSize;
    const endIndex = Math.min(startIndex + mduPageSize, totalItems);
    const pageData = mduFilteredData.slice(startIndex, endIndex);

    let html = '';
    pageData.forEach(r => {
        const statusUpper = String(r.status || '').toUpperCase().trim();
        let badgeClass = 'mdu-badge-default';

        if (statusUpper === 'FINALIZADO' || statusUpper === 'FINALIZADA') {
            badgeClass = 'mdu-badge-finalizado';
        } else if (statusUpper === '2ª VISTORIA' || statusUpper === '1ª VISTORIA' || statusUpper === 'VISTORIA') {
            badgeClass = 'mdu-badge-vistoria';
        } else if (statusUpper === 'FUSÃO') {
            badgeClass = 'mdu-badge-fusao';
        } else if (statusUpper === 'MEDIÇÃO') {
            badgeClass = 'mdu-badge-medicao';
        } else if (statusUpper === 'CANCELADO' || statusUpper === 'CANCELADA') {
            badgeClass = 'mdu-badge-cancelado';
        }

        const hpsStr = r.hps !== null && r.hps !== undefined ? r.hps.toLocaleString('pt-BR') : '-';
        const progVal = r.prog || 0;

        html += `
            <tr>
                <td style="font-weight: 600; color: var(--color-primary);">${escapeHtml(r.os)}</td>
                <td title="${escapeHtml(r.endereco || '')}">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">${escapeHtml(r.endereco || '-')}</span>
                        ${r.lat && r.lng && r.geocodificado ? `
                            <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${r.lat},${r.lng}" target="_blank" title="Ver no Google Street View" style="color: #ff9800; cursor: pointer; display: inline-flex; align-items: center; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">
                                <i class="fa-solid fa-street-view" style="font-size: 14px;"></i>
                            </a>
                        ` : ''}
                    </div>
                </td>
                <td>${escapeHtml(r.cidade || '-')}</td>
                <td><span class="mdu-badge ${badgeClass}">${escapeHtml(r.status || 'Não definido')}</span></td>
                <td style="font-weight:600;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="background-color: var(--bg-body); border-radius:3px; height:8px; width:60px; overflow:hidden;">
                            <div style="background-color: ${progVal === 100 ? '#2ed573' : 'var(--color-primary)'}; width:${progVal}%; height:100%;"></div>
                        </div>
                        <span>${progVal}%</span>
                    </div>
                </td>
                <td>${escapeHtml(r.equipe || '-')}</td>
                <td>${hpsStr}</td>
                <td>${escapeHtml(r.aging || '-')}</td>
                <td>${escapeHtml(r.data_baixa || '-')}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    // Info da paginação
    document.getElementById('mdu-pagination-info').innerText = `Exibindo ${startIndex + 1} - ${endIndex} de ${totalItems} registros`;

    // Botões de paginação
    let pageBtnsHtml = '';
    pageBtnsHtml += `
        <button class="cobranca-page-btn" ${mduPage === 1 ? 'disabled' : ''} onclick="window.setMduPage(1)" title="Primeira Página">
            <i class="fa-solid fa-angles-left"></i>
        </button>
        <button class="cobranca-page-btn" ${mduPage === 1 ? 'disabled' : ''} onclick="window.setMduPage(${mduPage - 1})" title="Anterior">
            <i class="fa-solid fa-angle-left"></i>
        </button>
    `;

    // Gerar páginas ao redor
    const startPage = Math.max(1, mduPage - 2);
    const endPage = Math.min(totalPages, mduPage + 2);

    for (let i = startPage; i <= endPage; i++) {
        pageBtnsHtml += `
            <button class="cobranca-page-btn ${mduPage === i ? 'active' : ''}" onclick="window.setMduPage(${i})">
                ${i}
            </button>
        `;
    }

    pageBtnsHtml += `
        <button class="cobranca-page-btn" ${mduPage === totalPages ? 'disabled' : ''} onclick="window.setMduPage(${mduPage + 1})" title="Próxima">
            <i class="fa-solid fa-angle-right"></i>
        </button>
        <button class="cobranca-page-btn" ${mduPage === totalPages ? 'disabled' : ''} onclick="window.setMduPage(${totalPages})" title="Última Página">
            <i class="fa-solid fa-angles-right"></i>
        </button>
    `;

    document.getElementById('mdu-pagination-btns').innerHTML = pageBtnsHtml;
}

function setMduPage(page) {
    mduPage = page;
    renderMduTable();
}

function exportMduToExcel() {
    if (!mduFilteredData || mduFilteredData.length === 0) {
        alert('Nenhum dado para exportar.');
        return;
    }

    const headers = [
        "OS JLE", "Endereço", "Cidade", "Cluster", "Aging", 
        "Quem fez Relatório", "Status", "Prog. %", "Cód. Imóvel", 
        "Área", "Node", "Caixa M", "HPs", "Equipe", 
        "Primeira Visita", "Segunda Visita", "Data Interna", 
        "Data Fusão", "Data Baixa", "Data Relatório", 
        "Valor Medição", "Valor Repasse"
    ];

    const rows = mduFilteredData.map(r => [
        r.os || '',
        r.endereco || '',
        r.cidade || '',
        r.cluster || '',
        r.aging || '',
        r.relatorio_por || '',
        r.status || '',
        (r.prog || 0) + '%',
        r.cod_imovel || '',
        r.area || '',
        r.node || '',
        r.caixa_m || '',
        r.hps !== null ? r.hps : '',
        r.equipe || '',
        r.primeira_visita || '',
        r.segunda_visita || '',
        r.data_interna || '',
        r.data_fusao || '',
        r.data_baixa || '',
        r.data_relatorio || '',
        r.valor_medicao || 0,
        r.valor_repasse || 0
    ]);

    const filename = `mdu_export_${new Date().toISOString().slice(0,10)}.xlsx`;

    if (typeof window.gestaoOs_exportToStyledExcel === 'function') {
        window.gestaoOs_exportToStyledExcel(headers, rows, filename);
    } else {
        // Fallback para download de CSV se styledExcel falhar
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
            + headers.join(";") + "\n" 
            + rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename.replace(".xlsx", ".csv"));
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Expor funções essenciais ao escopo global
window.setMduPage = setMduPage;
window.exportMduToExcel = exportMduToExcel;
window.switchMduTab = switchMduTab;
window.mdu_renderMap = mdu_renderMap;
window.updateMduMap = updateMduMap;
window.clearMduFilters = clearMduFilters;
window.applyMduFilters = applyMduFilters;

// Escutar troca de tema (modo escuro) para redesenhar gráficos e mapa
const mduThemeObserver = new MutationObserver(() => {
    const mduContainer = document.getElementById('view-mdu-container');
    if (mduContainer && mduContainer.style.display !== 'none') {
        renderMduCharts();
        if (mdu_map && document.getElementById('subview-mdu-map').style.display !== 'none') {
            mdu_renderMap();
        }
    }
});
mduThemeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

// Alternar Abas MDU
function switchMduTab(tabId) {
    document.querySelectorAll('#mdu-sub-tabs .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.querySelectorAll('#view-mdu-container .subtab-pane').forEach(pane => {
        pane.classList.remove('active');
        pane.style.display = 'none';
    });

    if (tabId === 'indicators') {
        const btn = document.getElementById('mdu-tab-btn-indicators');
        if (btn) btn.classList.add('active');
        const pane = document.getElementById('subview-mdu-indicators');
        if (pane) {
            pane.classList.add('active');
            pane.style.display = 'block';
        }
        renderMduCharts();
    } else if (tabId === 'map') {
        const btn = document.getElementById('mdu-tab-btn-map');
        if (btn) btn.classList.add('active');
        const pane = document.getElementById('subview-mdu-map');
        if (pane) {
            pane.classList.add('active');
            pane.style.display = 'block';
        }
        
        mdu_renderMap();
    }
}

// Inicializar e Renderizar Mapa MDU
function mdu_renderMap() {
    if (!mdu_map) {
        mdu_map = L.map('mdu-leaflet-map').setView([-27.2423, -50.2189], 8);
        
        mdu_tileLayer = L.tileLayer(mdu_getTileLayerUrl(), {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
        }).addTo(mdu_map);

        mdu_markersGroup = L.featureGroup().addTo(mdu_map);

        // Adicionar legenda ao mapa
        mdu_legend = L.control({position: 'bottomright'});
        mdu_legend.onAdd = function (map) {
            let div = L.DomUtil.create('div', 'info legend mdu-map-legend');
            div.id = 'mdu-map-legend-container';
            return div;
        };
        mdu_legend.addTo(mdu_map);
    } else {
        mdu_tileLayer.setUrl(mdu_getTileLayerUrl());
        setTimeout(() => {
            mdu_map.invalidateSize();
        }, 100);
    }

    updateMduMap();
}

function mdu_getTileLayerUrl() {
    const isDark = !document.body.classList.contains('light-theme');
    return isDark 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
}

function getMduStatusCounts() {
    const counts = {};
    const statuses = ['Finalizado', 'Fusão', '2ª Vistoria', '1ª Vistoria', 'Medição', 'Relatório', 'Baixa', 'Projeto', 'Cancelado'];
    statuses.forEach(s => counts[s] = 0);
    
    mduFilteredData.forEach(r => {
        const val = String(r.status || '').toUpperCase().trim();
        if (val === 'FINALIZADO' || val === 'FINALIZADA') {
            counts['Finalizado']++;
        } else if (val === 'CANCELADO' || val === 'CANCELADA') {
            counts['Cancelado']++;
        } else if (val === 'FUSÃO') {
            counts['Fusão']++;
        } else if (val === '2ª VISTORIA') {
            counts['2ª Vistoria']++;
        } else if (val === '1ª VISTORIA') {
            counts['1ª Vistoria']++;
        } else if (val === 'MEDIÇÃO') {
            counts['Medição']++;
        } else if (val === 'RELATÓRIO') {
            counts['Relatório']++;
        } else if (val === 'BAIXA') {
            counts['Baixa']++;
        } else if (val === 'PROJETO') {
            counts['Projeto']++;
        }
    });
    return counts;
}

function updateMduLegend() {
    const legendContainer = document.getElementById('mdu-map-legend-container');
    if (!legendContainer) return;

    const counts = getMduStatusCounts();
    const colors = {
        'Finalizado': '#2ed573',
        'Fusão': '#1e90ff',
        '2ª Vistoria': '#3742fa',
        '1ª Vistoria': '#70a1ff',
        'Medição': '#ffa502',
        'Relatório': '#a4b0be',
        'Baixa': '#2f3542',
        'Projeto': '#ff6b81',
        'Cancelado': '#ff4757'
    };

    let labels = [];
    labels.push('<h4>Status MDU</h4>');
    labels.push(`
        <div style="font-size: 0.8rem; font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <span>Total de Endereços:</span>
            <strong>${mduFilteredData.length}</strong>
        </div>
    `);
    
    for (let status in colors) {
        const count = counts[status] || 0;
        labels.push(
            `<div class="legend-item" style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i style="background:${colors[status]}"></i> ${status}
                </div>
                <span class="legend-count" style="font-weight: 600; color: var(--text-secondary);">${count}</span>
            </div>`
        );
    }
    legendContainer.innerHTML = labels.join('');
}

function updateMduMap() {
    if (!mdu_map || !mdu_markersGroup) return;

    // Verificar se os filtros ou busca mudaram para decidir se recentraliza/redesenha
    const currentFiltersState = JSON.stringify({
        filters: mduFilters,
        search: mduSearchQuery
    });

    const filtersChanged = currentFiltersState !== lastMduFiltersState;
    lastMduFiltersState = currentFiltersState;

    // Atualizar legenda com quantidades
    updateMduLegend();

    // 2. Atualizar banner de avisos para endereços não geolocalizados
    const missingGeoCount = mduFilteredData.filter(r => 
        !r.geocodificado && 
        r.endereco && 
        r.endereco.trim() !== '' && 
        r.endereco.trim() !== '-'
    ).length;
    const warningBanner = document.getElementById('mdu-map-warning-banner');
    const warningText = document.getElementById('mdu-map-warning-text');
    if (warningBanner && warningText) {
        if (missingGeoCount > 0) {
            warningText.innerHTML = `⚠️ <strong>${missingGeoCount}</strong> endereços não estão exibidos no mapa por falta de coordenadas geográficas precisas.`;
            warningBanner.style.display = 'flex';
        } else {
            warningBanner.style.display = 'none';
        }
    }

    // Se os filtros não mudaram e o mapa já foi inicializado com bounds, mantém posição atual e sai
    if (!filtersChanged && mduMapInitializedBounds) {
        return;
    }

    mdu_markersGroup.clearLayers();

    const colors = {
        'FINALIZADO': '#2ed573',
        'FINALIZADA': '#2ed573',
        'CANCELADO': '#ff4757',
        'CANCELADA': '#ff4757',
        'FUSÃO': '#1e90ff',
        '2ª VISTORIA': '#3742fa',
        '1ª VISTORIA': '#70a1ff',
        'MEDIÇÃO': '#ffa502',
        'RELATÓRIO': '#a4b0be',
        'BAIXA': '#2f3542',
        'PROJETO': '#ff6b81'
    };

    // 1. Filtrar apenas registros que possuem geolocalização válida (geocodificado: true)
    const recordsWithGeo = mduFilteredData.filter(r => r.lat && r.lng && r.geocodificado);

    recordsWithGeo.forEach(r => {
        const statusUpper = String(r.status || '').toUpperCase().trim();
        const markerColor = colors[statusUpper] || '#ced6e0';

        const marker = L.circleMarker([r.lat, r.lng], {
            radius: 8,
            fillColor: markerColor,
            color: '#ffffff',
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.8
        });

        const popupContent = `
            <div class="mdu-map-popup">
                <div class="mdu-popup-header">
                    <strong>OS: ${escapeHtml(r.os || '-')}</strong>
                    <span class="mdu-popup-status" style="background-color: ${markerColor}1f; color: ${markerColor}; border: 1px solid ${markerColor}4d;">
                        ${escapeHtml(r.status || 'Não Definido')}
                    </span>
                </div>
                <div class="mdu-popup-body">
                    <p><i class="fa-solid fa-location-dot"></i> ${escapeHtml(r.endereco || '-')}</p>
                    <p><i class="fa-solid fa-city"></i> ${escapeHtml(r.cidade || '-')} - Cluster: ${escapeHtml(r.cluster || '-')}</p>
                    <p><i class="fa-solid fa-users"></i> Equipe: ${escapeHtml(r.equipe || '-')}</p>
                    <p><i class="fa-solid fa-house"></i> HPs: <strong>${r.hps !== null ? r.hps : '-'}</strong></p>
                    <p><i class="fa-solid fa-calendar-day"></i> Baixa: ${escapeHtml(r.data_baixa || '-')}</p>
                    <div class="mdu-popup-progress" style="margin-bottom: 12px;">
                        <span>Progresso MDU</span>
                        <div class="progress-bar-container">
                            <div class="progress-bar" style="width: ${r.prog || 0}%; background-color: ${markerColor};"></div>
                        </div>
                        <span class="progress-val">${r.prog || 0}%</span>
                    </div>
                    <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${r.lat},${r.lng}" target="_blank" class="mdu-popup-streetview-btn" style="display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 12px; background-color: #ff9800; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 11px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#e68a00'" onmouseout="this.style.backgroundColor='#ff9800'">
                        <i class="fa-solid fa-street-view"></i> Google Street View
                    </a>
                </div>
            </div>
        `;

        const tooltipHtml = `
            <div class="mdu-tooltip-content" style="font-family: 'Segoe UI', system-ui, sans-serif; font-size: 11px; padding: 4px; color: var(--text-primary);">
                <div style="font-weight: 700; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; margin-bottom: 4px; color: var(--color-primary); display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                    <span>OS: ${escapeHtml(r.os || '-')}</span>
                    <span class="mdu-badge ${getMduStatusBadgeClass(r.status)}" style="font-size: 9px; padding: 2px 6px;">${escapeHtml(r.status || 'Não Definido')}</span>
                </div>
                <div style="margin-bottom: 2px;"><strong>Endereço:</strong> ${escapeHtml(r.endereco || '-')}</div>
                <div style="margin-bottom: 2px;"><strong>Cidade:</strong> ${escapeHtml(r.cidade || '-')}</div>
                <div style="margin-bottom: 2px;"><strong>Cluster:</strong> ${escapeHtml(r.cluster || '-')}</div>
                <div style="margin-bottom: 2px;"><strong>Node:</strong> ${escapeHtml(r.node || '-')}</div>
                <div style="margin-bottom: 2px;"><strong>Caixa M:</strong> ${escapeHtml(r.caixa_m || '-')}</div>
                <div style="margin-bottom: 2px;"><strong>Equipe:</strong> ${escapeHtml(r.equipe || '-')}</div>
                <div><strong>Obs. Baixa:</strong> <span style="color: var(--text-secondary); font-style: italic;">${escapeHtml(r.obs_baixa || '-')}</span></div>
            </div>
        `;

        marker.bindTooltip(tooltipHtml, {
            direction: 'top',
            offset: [0, -5],
            opacity: 0.95,
            className: 'mdu-map-tooltip'
        });

        marker.bindPopup(popupContent, {
            maxWidth: 320,
            className: 'mdu-leaflet-popup-custom'
        });

        mdu_markersGroup.addLayer(marker);
    });

    if (mdu_markersGroup.getLayers().length > 0) {
        mdu_map.fitBounds(mdu_markersGroup.getBounds(), { padding: [40, 40] });
        mduMapInitializedBounds = true;
    }
}

function toggleMduMapExpand() {
    const card = document.querySelector('#subview-mdu-map .mdu-card');
    if (!card) return;

    if (!document.fullscreenElement) {
        if (card.requestFullscreen) {
            card.requestFullscreen();
        } else if (card.webkitRequestFullscreen) { /* Safari */
            card.webkitRequestFullscreen();
        } else if (card.msRequestFullscreen) { /* IE11 */
            card.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { /* Safari */
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { /* IE11 */
            document.msExitFullscreen();
        }
    }
}
window.toggleMduMapExpand = toggleMduMapExpand;

// Listener para gerenciar estado visual de tela cheia
document.addEventListener('fullscreenchange', handleMduFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleMduFullscreenChange);
document.addEventListener('msfullscreenchange', handleMduFullscreenChange);

function handleMduFullscreenChange() {
    const card = document.querySelector('#subview-mdu-map .mdu-card');
    const btn = document.getElementById('btn-toggle-mdu-map-expand');
    const filters = document.getElementById('mdu-filters-container');
    const mduContainer = document.getElementById('view-mdu-container');
    if (!card || !btn) return;

    const isFullscreen = !!document.fullscreenElement;
    if (isFullscreen) {
        btn.innerHTML = '<i class="fa-solid fa-compress"></i>';
        btn.title = 'Restaurar Mapa';
        // Mover barra de filtros para dentro do card maximizado
        if (filters) {
            card.insertBefore(filters, card.firstChild);
        }
    } else {
        btn.innerHTML = '<i class="fa-solid fa-expand"></i>';
        btn.title = 'Maximizar Mapa';
        // Retornar barra de filtros para o topo do container principal de MDU
        if (filters && mduContainer) {
            mduContainer.insertBefore(filters, mduContainer.firstChild);
        }
    }

    if (mdu_map) {
        setTimeout(() => {
            mdu_map.invalidateSize();
        }, 150);
    }
}

// Funções do Multi-select de Status MDU
function toggleMduStatusDropdown(event) {
    event.stopPropagation();
    const container = document.getElementById('mdu-multiselect-status-container');
    const dropdown = document.getElementById('mdu-multiselect-status-dropdown');
    if (!container || !dropdown) return;

    const isActive = container.classList.toggle('active');
    dropdown.style.display = isActive ? 'block' : 'none';
}

function handleMduStatusChange() {
    const checkboxes = document.querySelectorAll('#mdu-multiselect-status-dropdown input[type="checkbox"]');
    const selected = [];
    checkboxes.forEach(chk => {
        if (chk.checked) {
            selected.push(chk.value);
        }
    });

    mduFilters.status = selected;

    const valueSpan = document.getElementById('mdu-multiselect-status-value');
    if (valueSpan) {
        if (selected.length === 0) {
            valueSpan.innerText = 'Todos os Status';
        } else if (selected.length === 1) {
            valueSpan.innerText = selected[0];
        } else {
            valueSpan.innerText = `${selected.length} selecionados`;
        }
    }

    applyMduFilters();
}

// Fechar dropdown ao clicar fora do componente
document.addEventListener('click', (e) => {
    const container = document.getElementById('mdu-multiselect-status-container');
    const dropdown = document.getElementById('mdu-multiselect-status-dropdown');
    if (container && dropdown && !container.contains(e.target)) {
        container.classList.remove('active');
        dropdown.style.display = 'none';
    }
});

window.toggleMduStatusDropdown = toggleMduStatusDropdown;
window.handleMduStatusChange = handleMduStatusChange;

function getMduStatusBadgeClass(status) {
    const statusUpper = String(status || '').toUpperCase().trim();
    if (statusUpper === 'FINALIZADO' || statusUpper === 'FINALIZADA') {
        return 'mdu-badge-finalizado';
    } else if (statusUpper === '2ª VISTORIA' || statusUpper === '1ª VISTORIA' || statusUpper === 'VISTORIA') {
        return 'mdu-badge-vistoria';
    } else if (statusUpper === 'FUSÃO') {
        return 'mdu-badge-fusao';
    } else if (statusUpper === 'MEDIÇÃO') {
        return 'mdu-badge-medicao';
    } else if (statusUpper === 'CANCELADO' || statusUpper === 'CANCELADA') {
        return 'mdu-badge-cancelado';
    }
    return 'mdu-badge-default';
}

function showMissingGeoModal() {
    const missing = mduFilteredData.filter(r => 
        !r.geocodificado && 
        r.endereco && 
        r.endereco.trim() !== '' && 
        r.endereco.trim() !== '-'
    );
    const tbody = document.getElementById('mdu-missing-geo-table-body');
    if (!tbody) return;

    if (missing.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 20px;">Nenhum endereço sem geolocalização nos filtros atuais.</td></tr>';
    } else {
        tbody.innerHTML = missing.map(r => `
            <tr>
                <td><strong style="color: var(--color-primary);">${escapeHtml(r.os || '-')}</strong></td>
                <td>${escapeHtml(r.endereco || '-')}</td>
                <td>${escapeHtml(r.cidade || '-')}</td>
                <td>${escapeHtml(r.cluster || '-')}</td>
                <td>
                    <span class="mdu-badge ${getMduStatusBadgeClass(r.status)}">
                        ${escapeHtml(r.status || 'Não Definido')}
                    </span>
                </td>
            </tr>
        `).join('');
    }

    document.getElementById('mdu-missing-geo-modal').classList.add('active');
}

function closeMduMissingGeoModal(e) {
    if (!e || e.target.id === 'mdu-missing-geo-modal') {
        document.getElementById('mdu-missing-geo-modal').classList.remove('active');
    }
}

window.getMduStatusBadgeClass = getMduStatusBadgeClass;
window.showMissingGeoModal = showMissingGeoModal;
window.closeMduMissingGeoModal = closeMduMissingGeoModal;
