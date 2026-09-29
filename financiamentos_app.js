/**
 * BI JLE TELECOM - MÓDULO FINANCIAMENTOS & PMTs
 * Controlador Modular Frontend (Vanilla JS)
 * Padrão Dark Glassmorphism / UI Preservation / Responsive / Scoped Namespace
 */

(function () {
    // Estado interno do módulo
    const state = {
        activeTab: 'visao_geral', // 'visao_geral', 'cronograma', 'desembolso'
        filterCategoria: 'TODAS',
        filterInstituicao: 'TODAS',
        filterStatus: 'TODOS',
        searchQuery: '',
        selectedContractId: null,
        scheduleFilterStatus: 'TODOS',
        scheduleSearchQuery: '',
        schedulePage: 1,
        scheduleRowsPerPage: 25,
        scheduleSortCol: 'numero',
        scheduleSortAsc: true,
        charts: {}
    };

    // Formatação pt-BR
    function formatMoeda(val) {
        if (val === null || val === undefined || isNaN(val)) return 'R$ 0,00';
        return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatPct(val) {
        if (val === null || val === undefined || isNaN(val)) return '0,0%';
        return val.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    }

    function parseIsoDate(isoStr) {
        if (!isoStr) return null;
        const p = isoStr.split('-');
        if (p.length === 3) return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
        return null;
    }

    // Inicializador do Módulo
    window.initFinanciamentos = function () {
        if (!window.FINANCIAMENTOS_DATA) {
            console.warn('[Financiamentos] window.FINANCIAMENTOS_DATA não encontrado.');
            return;
        }

        const data = window.FINANCIAMENTOS_DATA;
        if (!state.selectedContractId && data.contratos && data.contratos.length > 0) {
            state.selectedContractId = data.contratos[0].id;
        }

        populateContractDropdown();
        renderOverviewKPIs();
        renderActiveTab();
    };

    window.switchFinTab = function (tabId) {
        state.activeTab = tabId;

        document.querySelectorAll('.fin-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });

        document.querySelectorAll('.fin-tab-content').forEach(content => {
            content.style.display = (content.id === `fin-tab-content-${tabId}`) ? 'block' : 'none';
        });

        renderActiveTab();
    };

    function renderActiveTab() {
        if (state.activeTab === 'visao_geral') {
            renderOverviewCharts();
            renderContractsTable();
        } else if (state.activeTab === 'cronograma') {
            renderScheduleTab();
        } else if (state.activeTab === 'desembolso') {
            renderDesembolsoTab();
        }
    }

    // ==========================================
    // 1. TOP KPIS
    // ==========================================
    function renderOverviewKPIs() {
        const data = window.FINANCIAMENTOS_DATA;
        if (!data || !data.totais_gerais) return;

        const tot = data.totais_gerais;

        // KPI 1: Total Financiado Original
        const elFin = document.getElementById('fin-kpi-total-financiado');
        if (elFin) elFin.innerText = formatMoeda(tot.total_financiado);
        const elFinSub = document.getElementById('fin-kpi-total-financiado-sub');
        if (elFinSub) elFinSub.innerText = `${data.contratos.length} contratos ativos`;

        // KPI 2: Total Já Amortizado / Pago
        const elPago = document.getElementById('fin-kpi-total-amortizado');
        if (elPago) elPago.innerText = formatMoeda(tot.total_pago);
        const elPagoSub = document.getElementById('fin-kpi-total-amortizado-sub');
        if (elPagoSub) elPagoSub.innerText = `${formatPct(tot.pct_quitado)} quitado (${tot.total_pagas} parcelas)`;

        // KPI 3: Saldo Devedor Projetado
        const elSaldo = document.getElementById('fin-kpi-saldo-devedor');
        if (elSaldo) elSaldo.innerText = formatMoeda(tot.saldo_devedor);
        const elSaldoSub = document.getElementById('fin-kpi-saldo-devedor-sub');
        if (elSaldoSub) elSaldoSub.innerText = `${tot.total_pendentes} parcelas pendentes`;

        // KPI 4: Compromisso Mensal Atual
        const elMensal = document.getElementById('fin-kpi-compromisso-mensal');
        if (elMensal) elMensal.innerText = formatMoeda(tot.compromisso_mensal);

        // KPI 5: Próximo Vencimento
        const elProx = document.getElementById('fin-kpi-proximo-vencimento');
        const elProxSub = document.getElementById('fin-kpi-proximo-vencimento-sub');
        if (tot.proxima_parcela) {
            if (elProx) elProx.innerText = tot.proxima_parcela.vencimento;
            if (elProxSub) elProxSub.innerText = `${tot.proxima_parcela.contrato_nome} • ${formatMoeda(tot.proxima_parcela.prestacao)}`;
        } else {
            if (elProx) elProx.innerText = 'Em dia';
            if (elProxSub) elProxSub.innerText = 'Sem parcelas pendentes';
        }

        // Timestamp
        const elTs = document.getElementById('fin-data-timestamp');
        if (elTs && data.metadata) {
            elTs.innerText = data.metadata.generated_at || 'Atualizado';
        }
    }

    // ==========================================
    // 2. ABA 1: VISÃO GERAL & CONSOLIDADO
    // ==========================================
    function getFilteredContracts() {
        const data = window.FINANCIAMENTOS_DATA;
        if (!data || !data.contratos) return [];

        return data.contratos.filter(c => {
            if (state.filterCategoria !== 'TODAS' && c.categoria !== state.filterCategoria) return false;
            if (state.filterInstituicao !== 'TODAS' && c.instituicao !== state.filterInstituicao) return false;
            if (state.filterStatus === 'PAGO' && c.qtd_pendentes > 0) return false;
            if (state.filterStatus === 'EM_ABERTO' && c.qtd_pendentes === 0) return false;

            if (state.searchQuery) {
                const q = state.searchQuery.toLowerCase();
                const matchName = (c.nome || '').toLowerCase().includes(q);
                const matchNum = (c.contrato || '').toLowerCase().includes(q);
                const matchProd = (c.produto || '').toLowerCase().includes(q);
                const matchInst = (c.instituicao || '').toLowerCase().includes(q);
                if (!matchName && !matchNum && !matchProd && !matchInst) return false;
            }
            return true;
        });
    }

    function renderOverviewCharts() {
        const data = window.FINANCIAMENTOS_DATA;
        if (!data) return;

        // Gráfico 1: Evolução do Fluxo de PMTs por Competência
        renderChartFluxoPMTs();

        // Gráfico 2: Distribuição por Categoria de Bem
        renderChartDistribuicao();
    }

    function renderChartFluxoPMTs() {
        const ctx = document.getElementById('fin-chart-fluxo-pmts');
        if (!ctx) return;

        if (state.charts.fluxoPmts) {
            state.charts.fluxoPmts.destroy();
        }

        const data = window.FINANCIAMENTOS_DATA;
        const fluxo = data.totais_gerais.fluxo_mensal || [];

        // Exibir os próximos 24 meses a partir do início de 2026 até 2027/2028
        const filteredFluxo = fluxo.filter(m => m.ano >= 2026 && m.ano <= 2028);
        const labels = filteredFluxo.map(m => m.competencia);
        const maq = filteredFluxo.map(m => m.maquinas);
        const vei = filteredFluxo.map(m => m.veiculos);
        const imo = filteredFluxo.map(m => m.imoveis);
        const tot = filteredFluxo.map(m => m.total_previsto);

        const datalabelsPlugin = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

        state.charts.fluxoPmts = new Chart(ctx, {
            plugins: datalabelsPlugin,
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Máquinas & Perfuratrizes',
                        data: maq,
                        backgroundColor: 'rgba(139, 92, 246, 0.75)',
                        borderColor: '#8b5cf6',
                        borderWidth: 1,
                        stack: 'stack1',
                        borderRadius: 3,
                        datalabels: { display: false }
                    },
                    {
                        label: 'Veículos & Caminhões',
                        data: vei,
                        backgroundColor: 'rgba(56, 139, 253, 0.75)',
                        borderColor: '#388bfd',
                        borderWidth: 1,
                        stack: 'stack1',
                        borderRadius: 3,
                        datalabels: { display: false }
                    },
                    {
                        label: 'Imóveis & Patrimônio',
                        data: imo,
                        backgroundColor: 'rgba(0, 210, 211, 0.75)',
                        borderColor: '#00d2d3',
                        borderWidth: 1,
                        stack: 'stack1',
                        borderRadius: 3,
                        datalabels: { display: false }
                    },
                    {
                        type: 'line',
                        label: 'Compromisso Total Mensal',
                        data: tot,
                        borderColor: '#f59e0b',
                        backgroundColor: '#f59e0b',
                        borderWidth: 2.5,
                        pointRadius: 3.5,
                        pointHoverRadius: 6,
                        tension: 0.2,
                        datalabels: {
                            display: (ctx) => ctx.dataIndex % 2 === 0, // alterna rótulos para legibilidade
                            color: '#fbbf24',
                            backgroundColor: 'rgba(13, 17, 23, 0.88)',
                            borderColor: 'rgba(245, 158, 11, 0.4)',
                            borderWidth: 1,
                            borderRadius: 4,
                            padding: { top: 2, bottom: 2, left: 4, right: 4 },
                            anchor: 'end',
                            align: 'top',
                            offset: 4,
                            font: { family: 'Outfit, Inter', weight: 'bold', size: 9 },
                            formatter: (val) => val >= 1000 ? 'R$ ' + (val / 1000).toFixed(0) + 'k' : ''
                        }
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { color: '#8b949e', font: { family: 'Outfit, Inter', size: 10 } }
                    },
                    y: {
                        stacked: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#8b949e',
                            font: { family: 'Outfit, Inter', size: 10 },
                            callback: (v) => 'R$ ' + (v / 1000).toFixed(0) + 'k'
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#c9d1d9', font: { family: 'Outfit, Inter', size: 11 }, boxWidth: 12 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return ` ${context.dataset.label}: ${formatMoeda(context.parsed.y)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    function renderChartDistribuicao() {
        const ctx = document.getElementById('fin-chart-distribuicao');
        if (!ctx) return;

        if (state.charts.distribuicao) {
            state.charts.distribuicao.destroy();
        }

        const data = window.FINANCIAMENTOS_DATA;
        const cat = data.totais_gerais.por_categoria || {};

        const labels = ['Máquinas', 'Veículos', 'Imóveis'];
        const values = [
            cat['Máquinas'] ? cat['Máquinas'].saldo_devedor : 0,
            cat['Veículos'] ? cat['Veículos'].saldo_devedor : 0,
            cat['Imóveis'] ? cat['Imóveis'].saldo_devedor : 0
        ];

        const datalabelsPlugin = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

        state.charts.distribuicao = new Chart(ctx, {
            plugins: datalabelsPlugin,
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: [
                        'rgba(139, 92, 246, 0.85)',
                        'rgba(56, 139, 253, 0.85)',
                        'rgba(0, 210, 211, 0.85)'
                    ],
                    borderColor: '#161b22',
                    borderWidth: 2,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#c9d1d9', font: { family: 'Outfit, Inter', size: 11 }, boxWidth: 12, padding: 12 }
                    },
                    datalabels: {
                        display: true,
                        color: '#ffffff',
                        font: { family: 'Outfit, Inter', weight: 'bold', size: 10 },
                        formatter: (val, ctx) => {
                            const sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                            const pct = sum > 0 ? (val / sum * 100).toFixed(1) + '%' : '';
                            return pct;
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const val = context.parsed;
                                return ` ${context.label}: ${formatMoeda(val)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    function renderContractsTable() {
        const tbody = document.getElementById('fin-contracts-table-body');
        if (!tbody) return;

        const contracts = getFilteredContracts();
        if (contracts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 24px; color: var(--text-secondary);">Nenhum financiamento encontrado com os filtros selecionados.</td></tr>`;
            return;
        }

        let html = '';
        contracts.forEach(c => {
            const catBadgeClass = c.categoria === 'Máquinas' ? 'fin-badge-cat-maquinas' : (c.categoria === 'Veículos' ? 'fin-badge-cat-veiculos' : 'fin-badge-cat-imoveis');
            const pct = c.pct_quitado || 0;

            html += `
            <tr>
                <td><span class="fin-badge ${catBadgeClass}"><i class="fa-solid fa-tag"></i> ${c.categoria}</span></td>
                <td>
                    <div style="font-weight: 600; color: var(--text-primary);">${c.nome}</div>
                    <div style="font-size: 0.74rem; color: var(--text-secondary);">${c.produto} • Contrato: ${c.contrato}</div>
                </td>
                <td><span style="font-weight: 500;">${c.instituicao}</span></td>
                <td><span style="font-size: 0.78rem; color: var(--text-secondary);">${c.sistema}</span></td>
                <td class="num">${formatMoeda(c.valor_financiado)}</td>
                <td class="num" style="color: #10b981; font-weight: 600;">${formatMoeda(c.total_pago)}</td>
                <td class="num" style="color: #388bfd; font-weight: 600;">${formatMoeda(c.saldo_devedor)}</td>
                <td>
                    <div class="fin-progress-wrapper">
                        <div class="fin-progress-bar-bg">
                            <div class="fin-progress-bar-fill" style="width: ${pct}%;"></div>
                        </div>
                        <span class="fin-progress-text">${pct}%</span>
                    </div>
                    <div style="font-size: 0.7rem; color: var(--text-secondary); text-align: right;">${c.qtd_pagas}/${c.total_parcelas} pagas</div>
                </td>
                <td style="text-align: center;">
                    <button class="fin-btn fin-btn-primary" style="padding: 4px 10px; font-size: 0.76rem;" onclick="window.viewContractSchedule('${c.id}')" title="Ver Cronograma">
                        <i class="fa-solid fa-calendar-days"></i> <span>Cronograma</span>
                    </button>
                </td>
            </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    // ==========================================
    // 3. ABA 2: CRONOGRAMA DETALHADO & PMTs
    // ==========================================
    function populateContractDropdown() {
        const select = document.getElementById('fin-contract-select');
        if (!select) return;

        const data = window.FINANCIAMENTOS_DATA;
        if (!data || !data.contratos) return;

        select.innerHTML = data.contratos.map(c => `
            <option value="${c.id}" ${c.id === state.selectedContractId ? 'selected' : ''}>
                [${c.categoria.toUpperCase()}] ${c.nome} (${c.instituicao})
            </option>
        `).join('');

        select.onchange = function () {
            state.selectedContractId = select.value;
            state.schedulePage = 1;
            renderScheduleTab();
        };
    }

    window.viewContractSchedule = function (contractId) {
        state.selectedContractId = contractId;
        const select = document.getElementById('fin-contract-select');
        if (select) select.value = contractId;
        window.switchFinTab('cronograma');
    };

    function renderScheduleTab() {
        const data = window.FINANCIAMENTOS_DATA;
        if (!data || !data.contratos) return;

        const c = data.contratos.find(item => item.id === state.selectedContractId) || data.contratos[0];
        if (!c) return;

        // Renderizar banner com parâmetros do contrato
        renderContractBanner(c);

        // Renderizar tabela de parcelas com paginação
        renderScheduleTable(c);
    }

    function renderContractBanner(c) {
        const banner = document.getElementById('fin-contract-banner');
        if (!banner) return;

        banner.innerHTML = `
            <div class="fin-contract-param">
                <span class="fin-contract-param-label">Contrato / Bem</span>
                <span class="fin-contract-param-value">${c.nome}</span>
                <span style="font-size: 0.74rem; color: var(--text-secondary);">${c.contrato}</span>
            </div>
            <div class="fin-contract-param">
                <span class="fin-contract-param-label">Instituição & Sistema</span>
                <span class="fin-contract-param-value">${c.instituicao}</span>
                <span style="font-size: 0.74rem; color: var(--text-secondary);">${c.sistema} ${c.taxa_mensal > 0 ? '• ' + c.taxa_mensal.toFixed(2) + '% a.m.' : ''}</span>
            </div>
            <div class="fin-contract-param">
                <span class="fin-contract-param-label">Valor Financiado</span>
                <span class="fin-contract-param-value" style="color: #388bfd;">${formatMoeda(c.valor_financiado)}</span>
                <span style="font-size: 0.74rem; color: var(--text-secondary);">Líquido: ${formatMoeda(c.valor_liquido)}</span>
            </div>
            <div class="fin-contract-param">
                <span class="fin-contract-param-label">Total Pago</span>
                <span class="fin-contract-param-value" style="color: #10b981;">${formatMoeda(c.total_pago)}</span>
                <span style="font-size: 0.74rem; color: var(--text-secondary);">${c.qtd_pagas} parcelas quitadas</span>
            </div>
            <div class="fin-contract-param">
                <span class="fin-contract-param-label">Saldo em Aberto</span>
                <span class="fin-contract-param-value" style="color: #f59e0b;">${formatMoeda(c.saldo_devedor)}</span>
                <span style="font-size: 0.74rem; color: var(--text-secondary);">${c.qtd_pendentes} parcelas restantes</span>
            </div>
            <div class="fin-contract-param">
                <span class="fin-contract-param-label">Prazo / Vencimento Final</span>
                <span class="fin-contract-param-value">${c.vencimento_final || 'N/D'}</span>
                <span style="font-size: 0.74rem; color: var(--text-secondary);">Início: ${c.data_operacao || 'N/D'}</span>
            </div>
        `;
    }

    function renderScheduleTable(c) {
        const tbody = document.getElementById('fin-schedule-table-body');
        if (!tbody) return;

        let parcelas = c.parcelas || [];

        // Filtro por Status
        if (state.scheduleFilterStatus === 'PAGO') {
            parcelas = parcelas.filter(p => p.status === 'Pago');
        } else if (state.scheduleFilterStatus === 'PENDENTE') {
            parcelas = parcelas.filter(p => p.status === 'Pendente');
        }

        // Busca
        if (state.scheduleSearchQuery) {
            const q = state.scheduleSearchQuery.toLowerCase();
            parcelas = parcelas.filter(p => {
                const matchNum = String(p.numero).includes(q);
                const matchVenc = (p.vencimento || '').toLowerCase().includes(q);
                const matchVal = String(p.prestacao).includes(q);
                return matchNum || matchVenc || matchVal;
            });
        }

        // Ordenação
        parcelas.sort((a, b) => {
            let valA = a[state.scheduleSortCol];
            let valB = b[state.scheduleSortCol];
            if (valA === undefined) valA = '';
            if (valB === undefined) valB = '';
            if (typeof valA === 'string') {
                return state.scheduleSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            return state.scheduleSortAsc ? (valA - valB) : (valB - valA);
        });

        const totalRecords = parcelas.length;
        const totalPages = Math.ceil(totalRecords / state.scheduleRowsPerPage) || 1;
        if (state.schedulePage > totalPages) state.schedulePage = totalPages;
        if (state.schedulePage < 1) state.schedulePage = 1;

        const startIdx = (state.schedulePage - 1) * state.scheduleRowsPerPage;
        const pageItems = parcelas.slice(startIdx, startIdx + state.scheduleRowsPerPage);

        if (pageItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 20px; color: var(--text-secondary);">Nenhuma parcela encontrada.</td></tr>`;
            renderSchedulePagination(0, 0, 0);
            return;
        }

        let html = '';
        pageItems.forEach(p => {
            const isPago = p.status === 'Pago';
            const statusBadge = isPago ? `<span class="fin-badge fin-badge-pago"><i class="fa-solid fa-check"></i> Pago</span>` : `<span class="fin-badge fin-badge-pendente"><i class="fa-solid fa-clock"></i> Pendente</span>`;
            const difClass = p.diferenca < 0 ? 'color: #f85149;' : (p.diferenca > 0 ? 'color: #10b981;' : 'color: var(--text-secondary);');

            html += `
            <tr>
                <td style="font-weight: 600;">Parcela ${p.numero}/${c.total_parcelas}</td>
                <td><span style="font-size: 0.78rem; color: var(--text-secondary);">${p.tipo || 'Mensal'}</span></td>
                <td style="font-weight: 500;">${p.vencimento}</td>
                <td class="num" style="font-weight: 600; color: var(--text-primary);">${formatMoeda(p.prestacao)}</td>
                <td class="num" style="color: var(--text-secondary);">${p.juros > 0 ? formatMoeda(p.juros) : '–'}</td>
                <td class="num" style="color: var(--text-secondary);">${p.amortizacao > 0 ? formatMoeda(p.amortizacao) : '–'}</td>
                <td style="text-align: center;">${statusBadge}</td>
                <td style="text-align: center; color: var(--text-secondary);">${p.data_pagamento || '–'}</td>
                <td class="num" style="color: #10b981; font-weight: 600;">${p.valor_pago > 0 ? formatMoeda(p.valor_pago) : '–'}</td>
            </tr>
            `;
        });

        tbody.innerHTML = html;
        renderSchedulePagination(startIdx + 1, Math.min(startIdx + state.scheduleRowsPerPage, totalRecords), totalRecords);
    }

    function renderSchedulePagination(start, end, total) {
        const infoEl = document.getElementById('fin-schedule-pagination-info');
        const controlsEl = document.getElementById('fin-schedule-pagination-controls');
        if (!infoEl || !controlsEl) return;

        infoEl.innerText = total > 0 ? `Exibindo ${start} a ${end} de ${total} parcelas` : 'Nenhum registro';

        const totalPages = Math.ceil(total / state.scheduleRowsPerPage) || 1;
        let btns = `
            <button class="fin-page-btn" ${state.schedulePage <= 1 ? 'disabled' : ''} onclick="window.changeFinSchedulePage(${state.schedulePage - 1})">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
        `;

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= state.schedulePage - 1 && i <= state.schedulePage + 1)) {
                btns += `<button class="fin-page-btn ${i === state.schedulePage ? 'active' : ''}" onclick="window.changeFinSchedulePage(${i})">${i}</button>`;
            } else if (i === state.schedulePage - 2 || i === state.schedulePage + 2) {
                btns += `<span style="padding: 0 4px; color: var(--text-secondary);">...</span>`;
            }
        }

        btns += `
            <button class="fin-page-btn" ${state.schedulePage >= totalPages ? 'disabled' : ''} onclick="window.changeFinSchedulePage(${state.schedulePage + 1})">
                <i class="fa-solid fa-chevron-right"></i>
            </button>
        `;

        controlsEl.innerHTML = btns;
    }

    window.changeFinSchedulePage = function (newPage) {
        state.schedulePage = newPage;
        const data = window.FINANCIAMENTOS_DATA;
        const c = data.contratos.find(item => item.id === state.selectedContractId) || data.contratos[0];
        if (c) renderScheduleTable(c);
    };

    // ==========================================
    // 4. ABA 3: PROJEÇÃO DE DESEMBOLSO ANUAL
    // ==========================================
    function renderDesembolsoTab() {
        const data = window.FINANCIAMENTOS_DATA;
        if (!data || !data.totais_gerais) return;

        const anos = data.totais_gerais.desembolso_anual || [];
        const container = document.getElementById('fin-anual-cards-grid');
        if (container) {
            container.innerHTML = anos.map(a => `
                <div class="fin-anual-card">
                    <div class="fin-anual-ano">${a.ano}</div>
                    <div class="fin-anual-val">${formatMoeda(a.total_previsto)}</div>
                    <div class="fin-anual-sub">
                        <span style="color: #10b981;">Pago: ${formatMoeda(a.total_pago)}</span><br>
                        <span style="color: #f59e0b;">Aberto: ${formatMoeda(a.total_pendente)}</span>
                    </div>
                </div>
            `).join('');
        }

        renderChartDesembolsoAnual(anos);
        renderDesembolsoMatrixTable();
    }

    function renderChartDesembolsoAnual(anos) {
        const ctx = document.getElementById('fin-chart-desembolso-anual');
        if (!ctx) return;

        if (state.charts.desembolsoAnual) {
            state.charts.desembolsoAnual.destroy();
        }

        const labels = anos.map(a => String(a.ano));
        const pagos = anos.map(a => a.total_pago);
        const pendentes = anos.map(a => a.total_pendente);

        const datalabelsPlugin = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

        state.charts.desembolsoAnual = new Chart(ctx, {
            plugins: datalabelsPlugin,
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Já Liquidado / Pago',
                        data: pagos,
                        backgroundColor: 'rgba(16, 185, 129, 0.75)',
                        borderColor: '#10b981',
                        borderWidth: 1,
                        stack: 'stack1',
                        borderRadius: 4,
                        datalabels: { display: false }
                    },
                    {
                        label: 'Saldo Pendente de Amortização',
                        data: pendentes,
                        backgroundColor: 'rgba(56, 139, 253, 0.75)',
                        borderColor: '#388bfd',
                        borderWidth: 1,
                        stack: 'stack1',
                        borderRadius: 4,
                        datalabels: {
                            display: true,
                            color: '#ffffff',
                            anchor: 'end',
                            align: 'top',
                            offset: 4,
                            font: { family: 'Outfit, Inter', weight: 'bold', size: 10 },
                            formatter: (val, ctx) => {
                                const tot = pagos[ctx.dataIndex] + pendentes[ctx.dataIndex];
                                return tot >= 1000000 ? 'R$ ' + (tot / 1000000).toFixed(2) + 'M' : 'R$ ' + (tot / 1000).toFixed(0) + 'k';
                            }
                        }
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { color: '#8b949e', font: { family: 'Outfit, Inter', size: 11 } }
                    },
                    y: {
                        stacked: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#8b949e',
                            font: { family: 'Outfit, Inter', size: 10 },
                            callback: (v) => 'R$ ' + (v / 1000000).toFixed(1) + 'M'
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#c9d1d9', font: { family: 'Outfit, Inter', size: 11 }, boxWidth: 12 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return ` ${context.dataset.label}: ${formatMoeda(context.parsed.y)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    function renderDesembolsoMatrixTable() {
        const tbody = document.getElementById('fin-matrix-table-body');
        if (!tbody) return;

        const data = window.FINANCIAMENTOS_DATA;
        const fluxo = data.totais_gerais.fluxo_mensal || [];

        let html = '';
        fluxo.forEach(m => {
            html += `
            <tr>
                <td style="font-weight: 600; color: var(--text-primary);">${m.competencia}</td>
                <td class="num" style="color: #a78bfa;">${m.maquinas > 0 ? formatMoeda(m.maquinas) : '–'}</td>
                <td class="num" style="color: #58a6ff;">${m.veiculos > 0 ? formatMoeda(m.veiculos) : '–'}</td>
                <td class="num" style="color: #00d2d3;">${m.imoveis > 0 ? formatMoeda(m.imoveis) : '–'}</td>
                <td class="num" style="font-weight: 700; color: var(--text-primary);">${formatMoeda(m.total_previsto)}</td>
                <td class="num" style="color: #10b981; font-weight: 600;">${m.total_pago > 0 ? formatMoeda(m.total_pago) : '–'}</td>
                <td class="num" style="color: #f59e0b; font-weight: 600;">${m.total_pendente > 0 ? formatMoeda(m.total_pendente) : '–'}</td>
            </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    // ==========================================
    // 5. EXPORTAÇÃO EXCEL (.XLSX) VIA SHEETJS
    // ==========================================
    window.exportFinScheduleExcel = function () {
        const data = window.FINANCIAMENTOS_DATA;
        if (!data || !window.XLSX) {
            alert('Biblioteca SheetJS indisponível para exportação.');
            return;
        }

        const c = data.contratos.find(item => item.id === state.selectedContractId) || data.contratos[0];
        if (!c) return;

        const wb = XLSX.utils.book_new();

        const scheduleRows = (c.parcelas || []).map(p => ({
            'Nº Parcela': `Parcela ${p.numero}/${c.total_parcelas}`,
            'Tipo': p.tipo || 'Mensal',
            'Vencimento': p.vencimento || '',
            'Prestação PMT (R$)': p.prestacao,
            'Juros (R$)': p.juros || 0,
            'Amortização (R$)': p.amortizacao || 0,
            'Status': p.status,
            'Data Pagamento': p.data_pagamento || '',
            'Valor Pago (R$)': p.valor_pago || 0,
            'Diferença (R$)': p.diferenca || 0
        }));

        const ws = XLSX.utils.json_to_sheet(scheduleRows);
        XLSX.utils.book_append_sheet(wb, ws, "Cronograma PMT");

        const safeName = c.nome.replace(/[^a-zA-Z0-9]/g, '_');
        XLSX.writeFile(wb, `PMT_Financiamento_${safeName}.xlsx`);
    };

    window.exportFinOverviewExcel = function () {
        const data = window.FINANCIAMENTOS_DATA;
        if (!data || !window.XLSX) {
            alert('Biblioteca SheetJS indisponível para exportação.');
            return;
        }

        const wb = XLSX.utils.book_new();

        // Aba 1: Resumo dos Contratos
        const contractsRows = (data.contratos || []).map(c => ({
            'Categoria': c.categoria,
            'Financiamento / Bem': c.nome,
            'Contrato': c.contrato,
            'Instituição': c.instituicao,
            'Sistema': c.sistema,
            'Taxa Mensal (%)': c.taxa_mensal,
            'Valor Financiado (R$)': c.valor_financiado,
            'Valor Líquido (R$)': c.valor_liquido,
            'Total Já Pago (R$)': c.total_pago,
            'Saldo Devedor (R$)': c.saldo_devedor,
            'Total Parcelas': c.total_parcelas,
            'Parcelas Pagas': c.qtd_pagas,
            'Parcelas Pendentes': c.qtd_pendentes,
            '% Quitado': c.pct_quitado
        }));
        const wsContracts = XLSX.utils.json_to_sheet(contractsRows);
        XLSX.utils.book_append_sheet(wb, wsContracts, "Resumo Financiamentos");

        // Aba 2: Fluxo Mensal Consolidado
        const fluxoRows = (data.totais_gerais.fluxo_mensal || []).map(m => ({
            'Competência': m.competencia,
            'Máquinas (R$)': m.maquinas,
            'Veículos (R$)': m.veiculos,
            'Imóveis (R$)': m.imoveis,
            'Total Previsto (R$)': m.total_previsto,
            'Total Pago (R$)': m.total_pago,
            'Total Pendente (R$)': m.total_pendente
        }));
        const wsFluxo = XLSX.utils.json_to_sheet(fluxoRows);
        XLSX.utils.book_append_sheet(wb, wsFluxo, "Fluxo Mensal PMTs");

        XLSX.writeFile(wb, "BI_JLE_Financiamentos_Consolidado.xlsx");
    };

    // ==========================================
    // 6. EVENT LISTENERS DE FILTROS
    // ==========================================
    window.setFinFilterCategoria = function (cat) {
        state.filterCategoria = cat;
        renderContractsTable();
    };

    window.setFinFilterInstituicao = function (inst) {
        state.filterInstituicao = inst;
        renderContractsTable();
    };

    window.setFinFilterStatus = function (st) {
        state.filterStatus = st;
        renderContractsTable();
    };

    window.setFinSearchQuery = function (val) {
        state.searchQuery = val;
        renderContractsTable();
    };

    window.clearFinFilters = function () {
        state.filterCategoria = 'TODAS';
        state.filterInstituicao = 'TODAS';
        state.filterStatus = 'TODOS';
        state.searchQuery = '';

        const selCat = document.getElementById('fin-filter-categoria');
        if (selCat) selCat.value = 'TODAS';
        const selInst = document.getElementById('fin-filter-instituicao');
        if (selInst) selInst.value = 'TODAS';
        const selSt = document.getElementById('fin-filter-status');
        if (selSt) selSt.value = 'TODOS';
        const inpSearch = document.getElementById('fin-filter-search');
        if (inpSearch) inpSearch.value = '';

        renderContractsTable();
    };

    window.setFinScheduleFilterStatus = function (st) {
        state.scheduleFilterStatus = st;
        state.schedulePage = 1;
        const data = window.FINANCIAMENTOS_DATA;
        const c = data.contratos.find(item => item.id === state.selectedContractId) || data.contratos[0];
        if (c) renderScheduleTable(c);
    };

    window.setFinScheduleSearch = function (val) {
        state.scheduleSearchQuery = val;
        state.schedulePage = 1;
        const data = window.FINANCIAMENTOS_DATA;
        const c = data.contratos.find(item => item.id === state.selectedContractId) || data.contratos[0];
        if (c) renderScheduleTable(c);
    };

})();
