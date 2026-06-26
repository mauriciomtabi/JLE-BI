/**
 * ============================================================
 * mdu_app.js — Lógica da tela de MDUs (Acompanhamento)
 * v1.0
 * ============================================================
 */

// Estado Global da Página MDU
let mduDataLoaded = false;
let mduFilteredData = [];
let mduPage = 1;
const mduPageSize = 10;

const mduFilters = {
    status: '',
    cidade: '',
    cluster: '',
    equipe: ''
};

const mduCharts = {
    status: null,
    cidade: null,
    equipe: null,
    progresso: null
};

function initMdu() {
    if (mduDataLoaded) return;
    mduDataLoaded = true;

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

    const statusSelect = document.getElementById('mdu-filter-status');
    const cidadeSelect = document.getElementById('mdu-filter-cidade');
    const clusterSelect = document.getElementById('mdu-filter-cluster');
    const equipeSelect = document.getElementById('mdu-filter-equipe');

    if (statusSelect) {
        statusSelect.innerHTML = '<option value="">Todos os Status</option>';
        uniqueStatus.forEach(v => {
            statusSelect.innerHTML += `<option value="${v}">${v}</option>`;
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
    const statusSelect = document.getElementById('mdu-filter-status');
    const cidadeSelect = document.getElementById('mdu-filter-cidade');
    const clusterSelect = document.getElementById('mdu-filter-cluster');
    const equipeSelect = document.getElementById('mdu-filter-equipe');

    mduFilters.status = statusSelect ? statusSelect.value : '';
    mduFilters.cidade = cidadeSelect ? cidadeSelect.value : '';
    mduFilters.cluster = clusterSelect ? clusterSelect.value : '';
    mduFilters.equipe = equipeSelect ? equipeSelect.value : '';

    mduFilteredData = window.MDU_DATA.filter(r => {
        if (mduFilters.status && r.status !== mduFilters.status) return false;
        if (mduFilters.cidade && r.cidade !== mduFilters.cidade) return false;
        if (mduFilters.cluster && r.cluster !== mduFilters.cluster) return false;
        if (mduFilters.equipe && r.equipe !== mduFilters.equipe) return false;
        return true;
    });

    // Atualizar KPIs
    renderMduKPIs();

    // Renderizar Gráficos
    renderMduCharts();

    // Renderizar Tabela
    mduPage = 1;
    renderMduTable();
}

function clearMduFilters() {
    const statusSelect = document.getElementById('mdu-filter-status');
    const cidadeSelect = document.getElementById('mdu-filter-cidade');
    const clusterSelect = document.getElementById('mdu-filter-cluster');
    const equipeSelect = document.getElementById('mdu-filter-equipe');

    if (statusSelect) statusSelect.value = '';
    if (cidadeSelect) cidadeSelect.value = '';
    if (clusterSelect) clusterSelect.value = '';
    if (equipeSelect) equipeSelect.value = '';

    applyMduFilters();
}

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
    // Status Chart (Doughnut)
    renderStatusChart();

    // Cidades Chart (Horizontal Bar)
    renderCidadesChart();

    // Equipe Chart (Bar)
    renderEquipeChart();

    // Progresso Chart (Bar of average progress by status)
    renderProgressoChart();
}

function getThemeColors() {
    const isDark = document.body.classList.contains('dark-mode');
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

    mduCharts.status = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: getThemeColors().text,
                        font: { family: 'Segoe UI', size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw || 0;
                            const total = context.dataset.data.reduce((a,b) => a+b, 0);
                            const pct = ((val / total) * 100).toFixed(1);
                            return ` ${context.label}: ${val.toLocaleString('pt-BR')} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderCidadesChart() {
    const canvas = document.getElementById('mdu-chart-cidade');
    if (!canvas) return;

    if (mduCharts.cidade) {
        mduCharts.cidade.destroy();
    }

    const cidadeCounts = {};
    mduFilteredData.forEach(r => {
        const cidade = r.cidade || 'NÃO DEFINIDA';
        cidadeCounts[cidade] = (cidadeCounts[cidade] || 0) + 1;
    });

    // Ordenar e pegar top 10
    const sortedCidades = Object.keys(cidadeCounts).sort((a,b) => cidadeCounts[b] - cidadeCounts[a]).slice(0, 10);
    const data = sortedCidades.map(c => cidadeCounts[c]);

    mduCharts.cidade = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: sortedCidades,
            datasets: [{
                label: 'Quantidade de MDUs',
                data: data,
                backgroundColor: 'rgba(30, 144, 255, 0.75)',
                hoverBackgroundColor: 'rgba(30, 144, 255, 0.95)',
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
                        grid: { color: getThemeColors().grid },
                        ticks: { color: getThemeColors().text, font: { family: 'Segoe UI' } }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: getThemeColors().text, font: { family: 'Segoe UI' } }
                    }
                }
            }
        });
    }

function renderEquipeChart() {
    const canvas = document.getElementById('mdu-chart-equipe');
    if (!canvas) return;

    if (mduCharts.equipe) {
        mduCharts.equipe.destroy();
    }

    const equipeCounts = {};
    mduFilteredData.forEach(r => {
        const equipe = r.equipe || 'Sem Equipe';
        equipeCounts[equipe] = (equipeCounts[equipe] || 0) + 1;
    });

    const sortedEquipes = Object.keys(equipeCounts).sort((a,b) => equipeCounts[b] - equipeCounts[a]).slice(0, 10);
    const data = sortedEquipes.map(e => equipeCounts[e]);

    mduCharts.equipe = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: sortedEquipes,
            datasets: [{
                label: 'Quantidade de MDUs',
                data: data,
                backgroundColor: 'rgba(23, 162, 184, 0.75)',
                hoverBackgroundColor: 'rgba(23, 162, 184, 0.95)',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { 
                        color: getThemeColors().text, 
                        font: { family: 'Segoe UI', size: 10 },
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    grid: { color: getThemeColors().grid },
                    ticks: { color: getThemeColors().text, font: { family: 'Segoe UI' } }
                }
            }
        }
    });
}

function renderProgressoChart() {
    const canvas = document.getElementById('mdu-chart-progresso');
    if (!canvas) return;

    if (mduCharts.progresso) {
        mduCharts.progresso.destroy();
    }

    // Calcular média de progresso por status
    const statusGroups = {};
    mduFilteredData.forEach(r => {
        const status = r.status || 'Não Definido';
        const prog = r.prog || 0;
        if (!statusGroups[status]) {
            statusGroups[status] = { sum: 0, count: 0 };
        }
        statusGroups[status].sum += prog;
        statusGroups[status].count += 1;
    });

    const labels = Object.keys(statusGroups).sort((a,b) => (statusGroups[b].sum / statusGroups[b].count) - (statusGroups[a].sum / statusGroups[a].count));
    const data = labels.map(l => (statusGroups[l].sum / statusGroups[l].count).toFixed(1));

    mduCharts.progresso = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Progresso Médio (%)',
                data: data,
                backgroundColor: 'rgba(255, 165, orange, 0.75)',
                backgroundColor: 'rgba(255, 165, 0, 0.75)',
                hoverBackgroundColor: 'rgba(255, 165, 0, 0.95)',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { 
                        color: getThemeColors().text, 
                        font: { family: 'Segoe UI', size: 10 },
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    grid: { color: getThemeColors().grid },
                    ticks: { 
                        color: getThemeColors().text, 
                        font: { family: 'Segoe UI' },
                        callback: function(val) { return val + '%'; }
                    },
                    min: 0,
                    max: 100
                }
            }
        }
    });
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
                <td title="${escapeHtml(r.endereco || '')}">${escapeHtml(r.endereco || '-')}</td>
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

// Escutar troca de tema (modo escuro) para redesenhar gráficos
const mduThemeObserver = new MutationObserver(() => {
    const mduContainer = document.getElementById('view-mdu-container');
    if (mduContainer && mduContainer.style.display !== 'none') {
        renderMduCharts();
    }
});
mduThemeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
