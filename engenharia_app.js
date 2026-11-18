/**
 * BI JLE TELECOM - MÓDULO ENGENHARIA CLARO PARANÁ
 * Controlador Frontend Modular (Vanilla JS)
 * 1. Aba 1: Indicadores & Funil (KPIs duplos Obras/OSs + 4 Gráficos Chart.js responsivos)
 * 2. Aba 2: Relatório de Obras & OSs (Tabela Mestre-Detalhe expansível + Modo Obras/OSs + Paginação + Exportação Excel)
 * 3. Modal Detalhado de Linha do Tempo da Obra
 */

(function () {
    // Estado interno do módulo
    const state = {
        activeTab: 'indicadores', // 'indicadores' | 'relatorio'
        viewMode: 'obras',       // 'obras' (125) | 'oss' (194)
        searchQuery: '',
        statusFilter: 'ALL',
        cidadeFilter: 'ALL',
        page: 1,
        rowsPerPage: 50,
        sortCol: 'v_orc',
        sortAsc: false,
        expandedObras: new Set(),
        charts: {
            funil: null,
            evolucao: null,
            cidades: null,
            workflow: null
        }
    };

    // Formatação pt-BR
    function formatMoeda(val) {
        if (val === null || val === undefined || isNaN(val)) return 'R$ 0,00';
        return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatPct(val) {
        if (val === null || val === undefined || isNaN(val)) return '0,0%';
        return Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    }

    function formatDate(val) {
        if (!val) return '-';
        const str = String(val).trim();
        if (str.length >= 10 && str[4] === '-' && str[7] === '-') {
            const parts = str.substring(0, 10).split('-');
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return str;
    }

    // Inicialização do Módulo
    window.initEngenhariaModule = function () {
        if (!window.ENGENHARIA_DATA) {
            console.warn('[Engenharia PR] window.ENGENHARIA_DATA não encontrado.');
            return;
        }

        populateFilterOptions();
        updateMetadataBadge();
        renderKPIs();
        renderActiveTab();
        renderTable(); // Pre-renderiza a tabela em background

        // Garante renderização dos gráficos com dimensões calculadas do DOM
        setTimeout(() => {
            if (state.activeTab === 'indicadores') {
                renderCharts();
            }
        }, 60);
    };

    function updateMetadataBadge() {
        const meta = window.ENGENHARIA_METADATA;
        const badge = document.querySelector('.last-update-badge');
        if (badge && meta && meta.generated_at) {
            badge.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Atualizado: ${meta.generated_at}`;
        }
    }

    function populateFilterOptions() {
        const data = window.ENGENHARIA_DATA;
        const cidadeSelect = document.getElementById('eng-filter-cidade');
        const statusSelect = document.getElementById('eng-filter-status');

        if (cidadeSelect && data.cidades) {
            const currentVal = cidadeSelect.value || 'ALL';
            cidadeSelect.innerHTML = '<option value="ALL">Todas as Cidades</option>';
            data.cidades.forEach(cid => {
                const opt = document.createElement('option');
                opt.value = cid;
                opt.textContent = cid;
                cidadeSelect.appendChild(opt);
            });
            cidadeSelect.value = currentVal;
        }

        if (statusSelect) {
            const currentVal = statusSelect.value || 'ALL';
            statusSelect.innerHTML = '<option value="ALL">Todos os Status</option>';
            
            const list = (state.viewMode === 'obras') ? (data.status_obras_list || []) : (data.status_oss_list || []);
            list.forEach(st => {
                const opt = document.createElement('option');
                opt.value = st;
                opt.textContent = st;
                statusSelect.appendChild(opt);
            });
            statusSelect.value = currentVal;
        }
    }

    // Alternador de Sub-Abas
    window.switchEngTab = function (tabId) {
        state.activeTab = tabId;

        document.querySelectorAll('.eng-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });

        const tabIndicadores = document.getElementById('eng-tab-indicadores');
        const tabRelatorio = document.getElementById('eng-tab-relatorio');

        if (tabIndicadores) tabIndicadores.style.display = (tabId === 'indicadores') ? 'block' : 'none';
        if (tabRelatorio) tabRelatorio.style.display = (tabId === 'relatorio') ? 'block' : 'none';

        renderActiveTab();
    };

    // Alternador de Modo de Visão (Obras vs OSs)
    window.switchEngViewMode = function (mode) {
        state.viewMode = mode;
        state.page = 1;

        document.querySelectorAll('.eng-toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
        });

        populateFilterOptions();
        renderKPIs();
        renderActiveTab();
    };

    // Renderização da Aba Ativa
    function renderActiveTab() {
        if (state.activeTab === 'indicadores') {
            renderCharts();
        } else if (state.activeTab === 'relatorio') {
            renderTable();
        }
    }

    // Filtragem dos Dados
    function getFilteredData() {
        const data = window.ENGENHARIA_DATA;
        if (!data) return { obras: [], oss: [] };

        const q = state.searchQuery.toLowerCase().trim();
        const cidFilter = state.cidadeFilter;
        const stFilter = state.statusFilter;

        // Filtra Obras
        const filteredObras = data.obras.filter(obra => {
            if (cidFilter !== 'ALL' && !obra.cidades.includes(cidFilter)) return false;
            if (stFilter !== 'ALL' && obra.status !== stFilter) return false;
            if (q) {
                const matchNome = obra.nome.toLowerCase().includes(q);
                const matchSites = obra.sites.some(s => s.toLowerCase().includes(q));
                const matchCidade = obra.cidade.toLowerCase().includes(q);
                const matchOM = obra.oss.some(os => (os.om_orc && String(os.om_orc).toLowerCase().includes(q)) || (os.om_p1 && String(os.om_p1).toLowerCase().includes(q)) || (os.om_fn && String(os.om_fn).toLowerCase().includes(q)));
                if (!matchNome && !matchSites && !matchCidade && !matchOM) return false;
            }
            return true;
        });

        // Filtra OSs
        const filteredOSs = data.oss.filter(os => {
            if (cidFilter !== 'ALL' && os.cidade !== cidFilter) return false;
            if (stFilter !== 'ALL' && os.status !== stFilter) return false;
            if (q) {
                const matchObra = os.obra.toLowerCase().includes(q);
                const matchSite = os.site.toLowerCase().includes(q);
                const matchCidade = os.cidade.toLowerCase().includes(q);
                const matchOM = (os.om_orc && String(os.om_orc).toLowerCase().includes(q)) || (os.om_p1 && String(os.om_p1).toLowerCase().includes(q)) || (os.om_fn && String(os.om_fn).toLowerCase().includes(q));
                if (!matchObra && !matchSite && !matchCidade && !matchOM) return false;
            }
            return true;
        });

        return { obras: filteredObras, oss: filteredOSs };
    }

    // Renderização dos KPIs
    function renderKPIs() {
        const { obras, oss } = getFilteredData();

        const totalObras = obras.length;
        const totalOSs = oss.length;

        // Valores financeiros baseados nas OSs ativas filtradas
        const totalOrcado = oss.reduce((acc, it) => acc + (it.v_orc || 0), 0);
        const totalMedido = oss.reduce((acc, it) => acc + (it.v_medido || 0), 0);
        const saldoMedir = Math.max(0, totalOrcado - totalMedido);
        const pctMedido = totalOrcado > 0 ? (totalMedido / totalOrcado * 100) : 0;

        const obrasFinalizadas = obras.filter(o => o.status === '100% Finalizada').length;
        const ossFinalizadas = oss.filter(os => os.status === 'Finalizado').length;

        // Atualiza elementos DOM dos KPIs
        const elQtd = document.getElementById('eng-kpi-carteira');
        const elQtdSub = document.getElementById('eng-kpi-carteira-sub');
        const elOrc = document.getElementById('eng-kpi-orcado');
        const elMed = document.getElementById('eng-kpi-medido');
        const elMedSub = document.getElementById('eng-kpi-medido-sub');
        const elSaldo = document.getElementById('eng-kpi-saldo');
        const elSaldoSub = document.getElementById('eng-kpi-saldo-sub');
        const elFinSub = document.getElementById('eng-kpi-finalizadas-sub');

        if (elQtd) elQtd.textContent = `${totalObras} Obras`;
        if (elQtdSub) elQtdSub.textContent = `${totalOSs} OSs vinculadas`;

        if (elOrc) elOrc.textContent = formatMoeda(totalOrcado);

        if (elMed) elMed.textContent = formatMoeda(totalMedido);
        if (elMedSub) elMedSub.innerHTML = `<span style="color:#10b981; font-weight:600;">${formatPct(pctMedido)}</span> faturado`;

        if (elSaldo) elSaldo.textContent = formatMoeda(saldoMedir);
        if (elSaldoSub) elSaldoSub.innerHTML = `<span style="color:#f59e0b; font-weight:600;">${formatPct(100 - pctMedido)}</span> em carteira`;

        if (elFinSub) elFinSub.textContent = `${obrasFinalizadas} Obras / ${ossFinalizadas} OSs concluídas`;
    }

    // Helper para classes semânticas de status
    function getStatusClass(status) {
        if (!status) return '';
        const s = status.toLowerCase();
        if (s.includes('finalizad')) return 'status-finalizado';
        if (s.includes('parcial') || s.includes('andamento')) return 'status-parcial';
        if (s.includes('aprovado')) return 'status-aprovado';
        return 'status-orcamento';
    }

    // Renderização da Tabela
    function renderTable() {
        const { obras, oss } = getFilteredData();
        const container = document.getElementById('eng-table-content');
        if (!container) return;

        if (state.viewMode === 'obras') {
            renderObrasTable(obras, container);
        } else {
            renderOSsTable(oss, container);
        }
    }

    // Tabela de Obras (Mestre-Detalhe)
    function renderObrasTable(obras, container) {
        // Ordenação
        const sorted = [...obras].sort((a, b) => {
            let valA = a[state.sortCol] ?? '';
            let valB = b[state.sortCol] ?? '';
            if (typeof valA === 'string') {
                return state.sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            return state.sortAsc ? (valA - valB) : (valB - valA);
        });

        // Paginação
        const totalItems = sorted.length;
        const totalPages = Math.ceil(totalItems / state.rowsPerPage) || 1;
        state.page = Math.min(state.page, totalPages);
        const start = (state.page - 1) * state.rowsPerPage;
        const pageItems = sorted.slice(start, start + state.rowsPerPage);

        let html = `
            <div class="eng-table-wrapper">
                <table class="eng-table">
                    <thead>
                        <tr>
                            <th style="width: 38px; text-align: center;"></th>
                            <th onclick="window.sortEngTable('nome')">Obra / Solicitação <i class="fa-solid fa-sort"></i></th>
                            <th>Sites Envolvidos</th>
                            <th onclick="window.sortEngTable('cidade')">Cidade <i class="fa-solid fa-sort"></i></th>
                            <th style="text-align: center;" onclick="window.sortEngTable('qtd_os')">Qtd OS <i class="fa-solid fa-sort"></i></th>
                            <th onclick="window.sortEngTable('status')">Status Consolidado <i class="fa-solid fa-sort"></i></th>
                            <th style="text-align: right;" onclick="window.sortEngTable('v_orc')">Orçado (R$) <i class="fa-solid fa-sort"></i></th>
                            <th style="text-align: right;" onclick="window.sortEngTable('v_medido')">Medido (R$) <i class="fa-solid fa-sort"></i></th>
                            <th style="text-align: right;" onclick="window.sortEngTable('saldo')">Saldo (R$) <i class="fa-solid fa-sort"></i></th>
                            <th>Progresso</th>
                            <th style="text-align: center;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if (pageItems.length === 0) {
            html += `<tr><td colspan="11" style="text-align:center; padding: 30px; color: var(--text-secondary);">Nenhuma obra encontrada para os filtros selecionados.</td></tr>`;
        } else {
            pageItems.forEach(obra => {
                const isExpanded = state.expandedObras.has(obra.id);
                const statusCls = getStatusClass(obra.status);
                const sitesBadges = obra.sites.map(s => `<span class="eng-site-badge">${s}</span>`).join('');

                html += `
                    <tr class="master-row ${isExpanded ? 'expanded' : ''}" onclick="window.toggleExpandObra('${obra.id}', event)">
                        <td style="text-align: center;">
                            <i class="fa-solid fa-chevron-right eng-expand-icon"></i>
                        </td>
                        <td>
                            <strong style="color: var(--text-primary);">${obra.nome}</strong>
                        </td>
                        <td>${sitesBadges}</td>
                        <td>${obra.cidade}</td>
                        <td style="text-align: center;">
                            <span class="eng-badge eng-badge-os-count">${obra.qtd_os} OS</span>
                        </td>
                        <td>
                            <span class="eng-badge ${statusCls}">${obra.status}</span>
                        </td>
                        <td style="text-align: right; font-weight:600;">${formatMoeda(obra.v_orc)}</td>
                        <td style="text-align: right; color: #10b981; font-weight:600;">${formatMoeda(obra.v_medido)}</td>
                        <td style="text-align: right; color: #f59e0b;">${formatMoeda(obra.saldo)}</td>
                        <td>
                            <div class="eng-progress-bar-bg" title="${obra.pct_executado}% medido">
                                <div class="eng-progress-bar-fill" style="width: ${Math.min(100, obra.pct_executado)}%;"></div>
                            </div>
                            <span style="font-size:0.75rem; color:var(--text-secondary);">${obra.pct_executado}%</span>
                        </td>
                        <td style="text-align: center;" onclick="event.stopPropagation();">
                            <button class="eng-btn-action" style="padding: 4px 8px; min-height: auto; font-size: 0.75rem;" onclick="window.openObraModal('${obra.id}')" title="Ver Linha do Tempo e Detalhes">
                                <i class="fa-solid fa-timeline"></i>
                            </button>
                        </td>
                    </tr>
                `;

                // Linha de Detalhes Expandida com as OSs filhas
                if (isExpanded) {
                    html += `
                        <tr class="eng-detail-row">
                            <td colspan="11" style="padding: 0;">
                                <div class="eng-detail-container">
                                    <div style="margin-bottom: 8px; font-weight:600; font-size:0.8rem; color:#58a6ff; display:flex; align-items:center; gap:6px;">
                                        <i class="fa-solid fa-list-check"></i> Detalhamento das ${obra.oss.length} Ordens de Serviço (OSs da Claro vinculadas):
                                    </div>
                                    <table class="eng-subtable">
                                        <thead>
                                            <tr>
                                                <th>Site</th>
                                                <th>OM Orçamento</th>
                                                <th style="text-align: right;">Vlr Orçado</th>
                                                <th>Parcial 1 (OM / Valor / Status)</th>
                                                <th>Parcial 2 (OM / Valor / Status)</th>
                                                <th>Medição Final / Entroncamento</th>
                                                <th>Status Workflow Claro</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                    `;

                    obra.oss.forEach(os => {
                        const p1Str = os.om_p1 ? `${os.om_p1} - ${formatMoeda(os.v_p1)} ${os.st_p1 ? '(' + os.st_p1 + ')' : ''}` : '-';
                        const p2Str = os.om_p2 ? `${os.om_p2} - ${formatMoeda(os.v_p2)} ${os.st_p2 ? '(' + os.st_p2 + ')' : ''}` : '-';
                        const fnStr = os.om_fn ? `${os.om_fn} - ${formatMoeda(os.v_fn)}` : '-';
                        const osStCls = getStatusClass(os.status);

                        html += `
                            <tr>
                                <td><strong style="color:#ffffff;">${os.site}</strong></td>
                                <td>${os.om_orc || '-'}</td>
                                <td style="text-align: right;">${formatMoeda(os.v_orc)}</td>
                                <td>${p1Str}</td>
                                <td>${p2Str}</td>
                                <td>${fnStr}</td>
                                <td><span class="eng-badge ${osStCls}">${os.status}</span></td>
                            </tr>
                        `;
                    });

                    html += `
                                        </tbody>
                                    </table>
                                </div>
                            </td>
                        </tr>
                    `;
                }
            });
        }

        html += `
                    </tbody>
                </table>
            </div>
            ${renderPaginationControls(totalItems, totalPages)}
        `;

        container.innerHTML = html;
    }

    // Tabela de OSs Individuais (Visão Operacional/Medições)
    function renderOSsTable(oss, container) {
        // Ordenação
        const sorted = [...oss].sort((a, b) => {
            let valA = a[state.sortCol] ?? '';
            let valB = b[state.sortCol] ?? '';
            if (typeof valA === 'string') {
                return state.sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            return state.sortAsc ? (valA - valB) : (valB - valA);
        });

        // Paginação
        const totalItems = sorted.length;
        const totalPages = Math.ceil(totalItems / state.rowsPerPage) || 1;
        state.page = Math.min(state.page, totalPages);
        const start = (state.page - 1) * state.rowsPerPage;
        const pageItems = sorted.slice(start, start + state.rowsPerPage);

        let html = `
            <div class="eng-table-wrapper">
                <table class="eng-table">
                    <thead>
                        <tr>
                            <th onclick="window.sortEngTable('site')">Site <i class="fa-solid fa-sort"></i></th>
                            <th onclick="window.sortEngTable('obra')">Obra de Origem <i class="fa-solid fa-sort"></i></th>
                            <th onclick="window.sortEngTable('cidade')">Cidade <i class="fa-solid fa-sort"></i></th>
                            <th onclick="window.sortEngTable('om_orc')">OM Orçamento <i class="fa-solid fa-sort"></i></th>
                            <th style="text-align: right;" onclick="window.sortEngTable('v_orc')">Vlr Orçado <i class="fa-solid fa-sort"></i></th>
                            <th>Parcial 1</th>
                            <th>Parcial 2</th>
                            <th>Medição Final</th>
                            <th style="text-align: right;" onclick="window.sortEngTable('v_medido')">Total Medido <i class="fa-solid fa-sort"></i></th>
                            <th onclick="window.sortEngTable('status')">Status no Workflow <i class="fa-solid fa-sort"></i></th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if (pageItems.length === 0) {
            html += `<tr><td colspan="10" style="text-align:center; padding: 30px; color: var(--text-secondary);">Nenhuma OS encontrada para os filtros selecionados.</td></tr>`;
        } else {
            pageItems.forEach(os => {
                const statusCls = getStatusClass(os.status);
                const p1Str = os.om_p1 ? `${os.om_p1} (${formatMoeda(os.v_p1)})` : '-';
                const p2Str = os.om_p2 ? `${os.om_p2} (${formatMoeda(os.v_p2)})` : '-';
                const fnStr = os.om_fn ? `${os.om_fn} (${formatMoeda(os.v_fn)})` : '-';

                html += `
                    <tr>
                        <td><strong style="color: #ffffff;"><span class="eng-site-badge">${os.site}</span></strong></td>
                        <td>${os.obra}</td>
                        <td>${os.cidade}</td>
                        <td>${os.om_orc || '-'}</td>
                        <td style="text-align: right; font-weight:600;">${formatMoeda(os.v_orc)}</td>
                        <td>${p1Str}</td>
                        <td>${p2Str}</td>
                        <td>${fnStr}</td>
                        <td style="text-align: right; color: #10b981; font-weight:600;">${formatMoeda(os.v_medido)}</td>
                        <td><span class="eng-badge ${statusCls}">${os.status}</span></td>
                    </tr>
                `;
            });
        }

        html += `
                    </tbody>
                </table>
            </div>
            ${renderPaginationControls(totalItems, totalPages)}
        `;

        container.innerHTML = html;
    }

    // Controles de Paginação
    function renderPaginationControls(totalItems, totalPages) {
        const start = totalItems === 0 ? 0 : (state.page - 1) * state.rowsPerPage + 1;
        const end = Math.min(state.page * state.rowsPerPage, totalItems);

        return `
            <div class="eng-pagination">
                <div>Exibindo <strong>${start}</strong> a <strong>${end}</strong> de <strong>${totalItems}</strong> registros</div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button class="eng-page-btn" onclick="window.changeEngPage(${state.page - 1})" ${state.page <= 1 ? 'disabled' : ''}>
                        <i class="fa-solid fa-chevron-left"></i> Anterior
                    </button>
                    <span>Página <strong>${state.page}</strong> de <strong>${totalPages}</strong></span>
                    <button class="eng-page-btn" onclick="window.changeEngPage(${state.page + 1})" ${state.page >= totalPages ? 'disabled' : ''}>
                        Próxima <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        `;
    }

    // Navegação de Página
    window.changeEngPage = function (newPage) {
        state.page = newPage;
        renderTable();
    };

    // Ordenação de Coluna
    window.sortEngTable = function (col) {
        if (state.sortCol === col) {
            state.sortAsc = !state.sortAsc;
        } else {
            state.sortCol = col;
            state.sortAsc = true;
        }
        renderTable();
    };

    // Toggle de Expansão de Obra
    window.toggleExpandObra = function (obraId, event) {
        if (state.expandedObras.has(obraId)) {
            state.expandedObras.delete(obraId);
        } else {
            state.expandedObras.add(obraId);
        }
        renderTable();
    };

    // Gráficos Chart.js
    function renderCharts() {
        renderFunilChart();
        renderEvolucaoChart();
        renderCidadesChart();
        renderWorkflowChart();
    }

    // Gráfico 1: Funil de Status Operacional
    function renderFunilChart() {
        const canvas = document.getElementById('chart-eng-funil');
        if (!canvas) return;

        if (state.charts.funil) {
            state.charts.funil.destroy();
            state.charts.funil = null;
        }

        const data = window.ENGENHARIA_DATA;
        if (!data) return;

        const { obras } = getFilteredData();
        const counts = {};
        const valores = {};

        obras.forEach(o => {
            counts[o.status] = (counts[o.status] || 0) + 1;
            valores[o.status] = (valores[o.status] || 0) + o.v_orc;
        });

        const labels = Object.keys(counts);
        const dataCounts = labels.map(l => counts[l]);
        const pluginList = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

        state.charts.funil = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Quantidade de Obras',
                    data: dataCounts,
                    backgroundColor: [
                        '#10b981', '#388bfd', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'
                    ],
                    borderRadius: 6
                }]
            },
            plugins: pluginList,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                layout: {
                    padding: { right: 55 }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#161b22',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        callbacks: {
                            afterLabel: (ctx) => {
                                const st = labels[ctx.dataIndex];
                                return `Volume Orçado: ${formatMoeda(valores[st] || 0)}`;
                            }
                        }
                    },
                    datalabels: {
                        display: true,
                        anchor: 'end',
                        align: 'right',
                        offset: 6,
                        color: '#ffffff',
                        font: { family: 'Outfit, Inter, sans-serif', weight: 'bold', size: 11 },
                        formatter: (val) => val > 0 ? `${val} ${val === 1 ? 'Obra' : 'Obras'}` : ''
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#8b949e', stepSize: 1 },
                        grace: '15%'
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: '#c9d1d9', font: { size: 11 } }
                    }
                }
            }
        });
    }

    // Gráfico 2: Evolução de Medições Mensais
    function renderEvolucaoChart() {
        const canvas = document.getElementById('chart-eng-evolucao');
        if (!canvas) return;

        if (state.charts.evolucao) {
            state.charts.evolucao.destroy();
            state.charts.evolucao = null;
        }

        const { oss } = getFilteredData();
        const monthlyMedicoes = {};

        oss.forEach(os => {
            // P1
            if (os.dt_env_p1 && os.v_p1 > 0) {
                const ym = os.dt_env_p1.substring(0, 7);
                monthlyMedicoes[ym] = (monthlyMedicoes[ym] || 0) + os.v_p1;
            }
            // P2
            if (os.dt_env_p2 && os.v_p2 > 0) {
                const ym = os.dt_env_p2.substring(0, 7);
                monthlyMedicoes[ym] = (monthlyMedicoes[ym] || 0) + os.v_p2;
            }
            // Final
            if (os.dt_env_fn && os.v_fn > 0) {
                const ym = os.dt_env_fn.substring(0, 7);
                monthlyMedicoes[ym] = (monthlyMedicoes[ym] || 0) + os.v_fn;
            }
        });

        const sortedMonths = Object.keys(monthlyMedicoes).sort();
        const monthNames = {
            '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun',
            '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez'
        };

        const labels = sortedMonths.map(ym => {
            const [y, m] = ym.split('-');
            return `${monthNames[m] || m}/${y.slice(2)}`;
        });
        const values = sortedMonths.map(ym => monthlyMedicoes[ym]);
        const pluginList = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

        state.charts.evolucao = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Volume Medido (R$)',
                    data: values,
                    borderColor: '#388bfd',
                    backgroundColor: 'rgba(56, 139, 253, 0.15)',
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#388bfd',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            plugins: pluginList,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: { top: 25, right: 20 }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#161b22',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        callbacks: {
                            label: (ctx) => `Medido: ${formatMoeda(ctx.raw)}`
                        }
                    },
                    datalabels: {
                        display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0,
                        anchor: 'end',
                        align: 'top',
                        offset: 4,
                        color: '#58a6ff',
                        backgroundColor: 'rgba(13, 17, 23, 0.85)',
                        borderColor: 'rgba(56, 139, 253, 0.4)',
                        borderWidth: 1,
                        borderRadius: 4,
                        padding: { top: 2, bottom: 2, left: 5, right: 5 },
                        font: { family: 'Outfit, Inter, sans-serif', weight: 'bold', size: 10 },
                        formatter: (val) => {
                            if (!val || val <= 0) return '';
                            if (val >= 1000000) return 'R$ ' + (val / 1000000).toFixed(2).replace('.', ',') + 'M';
                            if (val >= 1000) return 'R$ ' + (val / 1000).toFixed(0) + 'k';
                            return 'R$ ' + Math.round(val);
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#8b949e',
                            callback: (v) => 'R$ ' + (v / 1000).toFixed(0) + 'k'
                        },
                        grace: '15%'
                    },
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#8b949e' }
                    }
                }
            }
        });
    }

    // Gráfico 3: Ranking Top 10 Cidades por Volume
    function renderCidadesChart() {
        const canvas = document.getElementById('chart-eng-cidades');
        if (!canvas) return;

        if (state.charts.cidades) {
            state.charts.cidades.destroy();
            state.charts.cidades = null;
        }

        const { oss } = getFilteredData();
        const cityData = {};

        oss.forEach(os => {
            const c = os.cidade || 'OUTROS';
            if (!cityData[c]) cityData[c] = { orcado: 0, medido: 0, qtd: 0 };
            cityData[c].orcado += (os.v_orc || 0);
            cityData[c].medido += (os.v_medido || 0);
            cityData[c].qtd += 1;
        });

        // Top 10 por volume orçado
        const sortedCities = Object.keys(cityData)
            .sort((a, b) => cityData[b].orcado - cityData[a].orcado)
            .slice(0, 10);

        const labels = sortedCities;
        const orcados = sortedCities.map(c => cityData[c].orcado);
        const medidos = sortedCities.map(c => cityData[c].medido);
        const pluginList = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

        state.charts.cidades = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Orçado (R$)',
                        data: orcados,
                        backgroundColor: 'rgba(56, 139, 253, 0.85)',
                        borderRadius: 4
                    },
                    {
                        label: 'Medido (R$)',
                        data: medidos,
                        backgroundColor: 'rgba(16, 185, 129, 0.85)',
                        borderRadius: 4
                    }
                ]
            },
            plugins: pluginList,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: { top: 25 }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#c9d1d9', boxWidth: 12 }
                    },
                    tooltip: {
                        backgroundColor: '#161b22',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${formatMoeda(ctx.raw)}`
                        }
                    },
                    datalabels: {
                        display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0,
                        anchor: 'end',
                        align: 'top',
                        offset: 2,
                        color: '#ffffff',
                        font: { family: 'Outfit, Inter, sans-serif', weight: 'bold', size: 9 },
                        formatter: (val) => {
                            if (!val || val <= 0) return '';
                            if (val >= 1000000) return (val / 1000000).toFixed(1).replace('.', ',') + 'M';
                            if (val >= 1000) return (val / 1000).toFixed(0) + 'k';
                            return String(Math.round(val));
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#8b949e',
                            callback: (v) => 'R$ ' + (v / 1000).toFixed(0) + 'k'
                        },
                        grace: '15%'
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#8b949e', font: { size: 10 } }
                    }
                }
            }
        });
    }

    // Gráfico 4: Status Workflow Claro
    function renderWorkflowChart() {
        const canvas = document.getElementById('chart-eng-workflow');
        if (!canvas) return;

        if (state.charts.workflow) {
            state.charts.workflow.destroy();
            state.charts.workflow = null;
        }

        const { oss } = getFilteredData();
        let finalizadas = 0;
        let emValidacao = 0;
        let emOrcamento = 0;

        oss.forEach(os => {
            if (os.status === 'Finalizado') {
                finalizadas++;
            } else if (os.status.includes('Parcial') || os.status.includes('Medição Final')) {
                emValidacao++;
            } else {
                emOrcamento++;
            }
        });

        const pluginList = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

        state.charts.workflow = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: ['Finalizadas no WF', 'Em Medição / Validação', 'Em Orçamento / Aguardando'],
                datasets: [{
                    data: [finalizadas, emValidacao, emOrcamento],
                    backgroundColor: ['#10b981', '#f59e0b', '#388bfd'],
                    borderColor: '#161b22',
                    borderWidth: 2
                }]
            },
            plugins: pluginList,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#c9d1d9', boxWidth: 12, padding: 14 }
                    },
                    tooltip: {
                        backgroundColor: '#161b22',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        callbacks: {
                            label: (ctx) => ` ${ctx.label}: ${ctx.raw} OSs (${formatPct(ctx.raw / (oss.length || 1) * 100)})`
                        }
                    },
                    datalabels: {
                        display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0,
                        color: '#ffffff',
                        font: { family: 'Outfit, Inter, sans-serif', weight: 'bold', size: 12 },
                        formatter: (val, ctx) => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            if (!val || total <= 0) return '';
                            const pct = ((val / total) * 100).toFixed(0);
                            return `${val}\n(${pct}%)`;
                        },
                        textAlign: 'center'
                    }
                },
                cutout: '60%'
            }
        });
    }

    // Modal de Detalhes da Obra
    window.openObraModal = function (obraId) {
        const data = window.ENGENHARIA_DATA;
        if (!data) return;

        const obra = data.obras.find(o => o.id === obraId);
        if (!obra) return;

        const modalContainer = document.getElementById('eng-modal-container');
        if (!modalContainer) return;

        let ossHtml = '';
        obra.oss.forEach((os, idx) => {
            ossHtml += `
                <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                        <span style="font-weight:700; color:#58a6ff;"><i class="fa-solid fa-tower-cell"></i> Site: ${os.site}</span>
                        <span class="eng-badge ${getStatusClass(os.status)}">${os.status}</span>
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; font-size: 0.8rem;">
                        <div><span style="color:var(--text-secondary);">OM Orçamento:</span> <strong>${os.om_orc || '-'}</strong></div>
                        <div><span style="color:var(--text-secondary);">Vlr Orçado:</span> <strong>${formatMoeda(os.v_orc)}</strong></div>
                        <div><span style="color:var(--text-secondary);">Parcial 1:</span> <strong>${os.om_p1 ? os.om_p1 + ' (' + formatMoeda(os.v_p1) + ')' : '-'}</strong></div>
                        <div><span style="color:var(--text-secondary);">Parcial 2:</span> <strong>${os.om_p2 ? os.om_p2 + ' (' + formatMoeda(os.v_p2) + ')' : '-'}</strong></div>
                        <div><span style="color:var(--text-secondary);">Medição Final:</span> <strong>${os.om_fn ? os.om_fn + ' (' + formatMoeda(os.v_fn) + ')' : '-'}</strong></div>
                        <div><span style="color:var(--text-secondary);">Total Medido:</span> <strong style="color:#10b981;">${formatMoeda(os.v_medido)}</strong></div>
                    </div>
                </div>
            `;
        });

        modalContainer.innerHTML = `
            <div class="eng-modal-backdrop" onclick="window.closeObraModal(event)">
                <div class="eng-modal-card" onclick="event.stopPropagation();">
                    <div class="eng-modal-header">
                        <div>
                            <h2 style="font-size: 1.25rem; font-weight: 700; color: #ffffff; margin-bottom: 4px;">${obra.nome}</h2>
                            <p style="font-size: 0.85rem; color: var(--text-secondary);">
                                Cidade: <strong>${obra.cidades.join(', ')}</strong> | Sites: <strong>${obra.sites.join(', ')}</strong> | Status: <span class="eng-badge ${getStatusClass(obra.status)}">${obra.status}</span>
                            </p>
                        </div>
                        <button class="eng-modal-close-btn" onclick="window.closeObraModal()"><i class="fa-solid fa-xmark"></i></button>
                    </div>

                    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;">
                        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; border-left: 3px solid #388bfd;">
                            <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase;">Valor Orçado</div>
                            <div style="font-size:1.2rem; font-weight:700; color:#ffffff;">${formatMoeda(obra.v_orc)}</div>
                        </div>
                        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; border-left: 3px solid #10b981;">
                            <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase;">Total Medido</div>
                            <div style="font-size:1.2rem; font-weight:700; color:#10b981;">${formatMoeda(obra.v_medido)} (${obra.pct_executado}%)</div>
                        </div>
                        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; border-left: 3px solid #f59e0b;">
                            <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase;">Saldo a Medir</div>
                            <div style="font-size:1.2rem; font-weight:700; color:#f59e0b;">${formatMoeda(obra.saldo)}</div>
                        </div>
                    </div>

                    <h3 style="font-size: 0.95rem; font-weight: 600; color: #ffffff; margin-bottom: 12px;">
                        <i class="fa-solid fa-network-wired"></i> Ordens de Serviço Vinculadas (${obra.oss.length} OSs):
                    </h3>
                    <div style="max-height: 380px; overflow-y: auto; padding-right: 4px;">
                        ${ossHtml}
                    </div>
                </div>
            </div>
        `;
    };

    window.closeObraModal = function () {
        const modalContainer = document.getElementById('eng-modal-container');
        if (modalContainer) modalContainer.innerHTML = '';
    };

    // Exportação para Excel
    window.exportEngenhariaExcel = function () {
        if (typeof XLSX === 'undefined') {
            alert('Biblioteca XLSX não carregada no navegador.');
            return;
        }

        const { obras, oss } = getFilteredData();
        let exportData = [];
        let filename = '';

        if (state.viewMode === 'obras') {
            filename = `Engenharia_PR_Obras_${new Date().toISOString().slice(0, 10)}.xlsx`;
            exportData = obras.map(o => ({
                'ID': o.id,
                'Obra / Projeto': o.nome,
                'Sites': o.sites.join(', '),
                'Cidade': o.cidade,
                'Qtd OSs': o.qtd_os,
                'Status': o.status,
                'Valor Orçado (R$)': o.v_orc,
                'Total Medido (R$)': o.v_medido,
                'Saldo a Medir (R$)': o.saldo,
                '% Medido': o.pct_executado
            }));
        } else {
            filename = `Engenharia_PR_OSs_${new Date().toISOString().slice(0, 10)}.xlsx`;
            exportData = oss.map(os => ({
                'Linha': os.row_num,
                'Site': os.site,
                'Obra de Origem': os.obra,
                'Cidade': os.cidade,
                'OM Orçamento': os.om_orc,
                'Vlr Orçado (R$)': os.v_orc,
                'OM Parcial 1': os.om_p1,
                'Vlr Parcial 1 (R$)': os.v_p1,
                'OM Parcial 2': os.om_p2,
                'Vlr Parcial 2 (R$)': os.v_p2,
                'OM Medição Final': os.om_fn,
                'Vlr Final (R$)': os.v_fn,
                'Total Medido (R$)': os.v_medido,
                'Status Workflow': os.status
            }));
        }

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Engenharia PR");
        XLSX.writeFile(wb, filename);
    };

    // Aplicação e Limpeza de Filtros
    window.applyEngenhariaFilters = function () {
        const searchInput = document.getElementById('eng-filter-search');
        const cidadeSelect = document.getElementById('eng-filter-cidade');
        const statusSelect = document.getElementById('eng-filter-status');

        if (searchInput) state.searchQuery = searchInput.value;
        if (cidadeSelect) state.cidadeFilter = cidadeSelect.value;
        if (statusSelect) state.statusFilter = statusSelect.value;

        state.page = 1;
        renderKPIs();
        renderActiveTab();
    };

    window.clearEngenhariaFilters = function () {
        state.searchQuery = '';
        state.statusFilter = 'ALL';
        state.cidadeFilter = 'ALL';
        state.page = 1;

        const searchInput = document.getElementById('eng-filter-search');
        const cidadeSelect = document.getElementById('eng-filter-cidade');
        const statusSelect = document.getElementById('eng-filter-status');

        if (searchInput) searchInput.value = '';
        if (cidadeSelect) cidadeSelect.value = 'ALL';
        if (statusSelect) statusSelect.value = 'ALL';

        renderKPIs();
        renderActiveTab();
    };

})();
