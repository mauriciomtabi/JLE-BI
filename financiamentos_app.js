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
            renderOverviewKPIs();
            renderCompositionCards();
            renderChartFluxoPMTs();
            renderContractsTable();
        } else if (state.activeTab === 'cronograma') {
            renderScheduleTab();
        } else if (state.activeTab === 'desembolso') {
            renderDesembolsoTab();
        }
    }

    // ==========================================
    // FILTRAGEM DE CONTRATOS
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

    // ==========================================
    // 1. TOP KPIS DINÂMICOS
    // ==========================================
    function renderOverviewKPIs() {
        const data = window.FINANCIAMENTOS_DATA;
        if (!data || !data.totais_gerais) return;

        const filtered = getFilteredContracts();
        const hasFilters = (state.filterCategoria !== 'TODAS' || state.filterInstituicao !== 'TODAS' || state.filterStatus !== 'TODOS' || state.searchQuery);

        let totalFin = 0;
        let totalPago = 0;
        let saldoDev = 0;
        let totalParc = 0;
        let totalPagas = 0;
        let totalPend = 0;
        let compromisso = 0;
        let proximaParc = null;

        if (!hasFilters) {
            const tot = data.totais_gerais;
            totalFin = tot.total_financiado;
            totalPago = tot.total_pago;
            saldoDev = tot.saldo_devedor;
            totalParc = tot.total_parcelas;
            totalPagas = tot.total_pagas;
            totalPend = tot.total_pendentes;
            compromisso = tot.compromisso_mensal;
            proximaParc = tot.proxima_parcela;
        } else {
            totalFin = filtered.reduce((acc, c) => acc + c.valor_financiado, 0);
            totalPago = filtered.reduce((acc, c) => acc + c.total_pago, 0);
            saldoDev = filtered.reduce((acc, c) => acc + c.saldo_devedor, 0);
            totalParc = filtered.reduce((acc, c) => acc + c.total_parcelas, 0);
            totalPagas = filtered.reduce((acc, c) => acc + c.qtd_pagas, 0);
            totalPend = filtered.reduce((acc, c) => acc + c.qtd_pendentes, 0);
            compromisso = filtered.reduce((acc, c) => acc + (c.prestacao_mensal || 0), 0);

            // Próxima parcela do conjunto filtrado
            let allPending = [];
            filtered.forEach(c => {
                (c.parcelas || []).forEach(p => {
                    if (p.status === 'Pendente' && p.vencimento_iso) {
                        allPending.push({
                            vencimento: p.vencimento,
                            vencimento_iso: p.vencimento_iso,
                            prestacao: p.prestacao,
                            contrato_nome: c.nome
                        });
                    }
                });
            });
            allPending.sort((a, b) => a.vencimento_iso.localeCompare(b.vencimento_iso));
            proximaParc = allPending.length > 0 ? allPending[0] : null;
        }

        const pctQuit = totalParc > 0 ? (totalPagas / totalParc * 100.0) : 0.0;

        // KPI 1: Total Financiado Original
        const elFin = document.getElementById('fin-kpi-total-financiado');
        if (elFin) elFin.innerText = formatMoeda(totalFin);
        const elFinSub = document.getElementById('fin-kpi-total-financiado-sub');
        if (elFinSub) elFinSub.innerText = `${filtered.length} contrato(s) ${hasFilters ? 'filtrado(s)' : 'ativos'}`;

        // KPI 2: Total Já Amortizado / Pago
        const elPago = document.getElementById('fin-kpi-total-amortizado');
        if (elPago) elPago.innerText = formatMoeda(totalPago);
        const elPagoSub = document.getElementById('fin-kpi-total-amortizado-sub');
        if (elPagoSub) elPagoSub.innerText = `${formatPct(pctQuit)} quitado (${totalPagas} parcelas)`;

        // KPI 3: Saldo Devedor Projetado
        const elSaldo = document.getElementById('fin-kpi-saldo-devedor');
        if (elSaldo) elSaldo.innerText = formatMoeda(saldoDev);
        const elSaldoSub = document.getElementById('fin-kpi-saldo-devedor-sub');
        if (elSaldoSub) elSaldoSub.innerText = `${totalPend} parcelas pendentes`;

        // KPI 4: Compromisso Mensal Atual
        const elMensal = document.getElementById('fin-kpi-compromisso-mensal');
        if (elMensal) elMensal.innerText = formatMoeda(compromisso);

        // KPI 5: Próximo Vencimento
        const elProx = document.getElementById('fin-kpi-proximo-vencimento');
        const elProxSub = document.getElementById('fin-kpi-proximo-vencimento-sub');
        if (proximaParc) {
            if (elProx) elProx.innerText = proximaParc.vencimento;
            if (elProxSub) elProxSub.innerText = `${proximaParc.contrato_nome} • ${formatMoeda(proximaParc.prestacao)}`;
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
    // 2. CARDS DE COMPOSIÇÃO DA CARTEIRA POR CATEGORIA
    // ==========================================
    function renderCompositionCards() {
        const container = document.getElementById('fin-composition-container');
        if (!container) return;

        const data = window.FINANCIAMENTOS_DATA;
        if (!data || !data.totais_gerais || !data.totais_gerais.por_categoria) return;

        const catData = data.totais_gerais.por_categoria;
        const totalSaldo = data.totais_gerais.saldo_devedor || 1;

        const categories = [
            {
                key: 'Máquinas',
                title: 'Máquinas & Perfuratrizes',
                icon: 'fa-person-digging',
                cardClass: 'card-maquinas',
                badgeClass: 'fin-badge-cat-maquinas',
                color: '#388bfd'
            },
            {
                key: 'Imóveis',
                title: 'Imóveis & Patrimônio',
                icon: 'fa-building',
                cardClass: 'card-imoveis',
                badgeClass: 'fin-badge-cat-imoveis',
                color: '#8b5cf6'
            },
            {
                key: 'Veículos',
                title: 'Veículos & Caminhões',
                icon: 'fa-truck',
                cardClass: 'card-veiculos',
                badgeClass: 'fin-badge-cat-veiculos',
                color: '#f59e0b'
            }
        ];

        let html = '';
        categories.forEach(c => {
            const info = catData[c.key] || { financiado: 0, pago: 0, saldo_devedor: 0, contratos: 0, total_parcelas: 0, qtd_pagas: 0, pct_quitado: 0 };
            const pctCarteira = (info.saldo_devedor / totalSaldo * 100.0);
            const isSelected = state.filterCategoria === c.key;

            html += `
            <div class="fin-composition-card ${c.cardClass}" style="cursor: pointer; ${isSelected ? 'outline: 2px solid ' + c.color + '; box-shadow: 0 0 15px rgba(56, 139, 253, 0.25);' : ''}" onclick="window.selectCategoryFilter('${c.key}')" title="Clique para filtrar por ${c.title}">
                <div class="fin-comp-header">
                    <span class="fin-comp-title">
                        <i class="fa-solid ${c.icon}" style="color: ${c.color};"></i> ${c.title}
                    </span>
                    <span class="fin-comp-badge ${c.badgeClass}">${formatPct(pctCarteira)} da carteira</span>
                </div>
                <div class="fin-comp-saldo" style="color: ${c.color};">${formatMoeda(info.saldo_devedor)}</div>
                <div style="font-size: 0.76rem; color: var(--text-secondary); margin-bottom: 8px;">
                    Saldo restante a amortizar (${info.contratos} contratos)
                </div>
                <div class="fin-progress-wrapper">
                    <div class="fin-progress-bar-bg">
                        <div class="fin-progress-bar-fill" style="width: ${info.pct_quitado}%; background: ${c.color};"></div>
                    </div>
                    <span class="fin-progress-text">${info.pct_quitado}%</span>
                </div>
                <div class="fin-comp-sub">
                    <span>Original: <strong>${formatMoeda(info.financiado)}</strong></span>
                    <span style="color: #10b981;">Pago: <strong>${formatMoeda(info.pago)}</strong></span>
                </div>
            </div>
            `;
        });

        container.innerHTML = html;
    }

    window.selectCategoryFilter = function (cat) {
        if (state.filterCategoria === cat) {
            state.filterCategoria = 'TODAS';
        } else {
            state.filterCategoria = cat;
        }
        const selCat = document.getElementById('fin-filter-categoria');
        if (selCat) selCat.value = state.filterCategoria;
        renderActiveTab();
    };

    // ==========================================
    // 3. GRÁFICO COMBINADO (PADRÃO IMPOSTOS)
    // ==========================================
    function renderChartFluxoPMTs() {
        const ctx = document.getElementById('fin-chart-fluxo-pmts');
        if (!ctx) return;

        if (state.charts.fluxoPmts) {
            state.charts.fluxoPmts.destroy();
        }

        const data = window.FINANCIAMENTOS_DATA;
        if (!data) return;

        const filteredContracts = getFilteredContracts();

        // Gerar horizonte de 2026 a 2028 (36 competências)
        const labels = [];
        for (let a = 2026; a <= 2028; a++) {
            for (let m = 1; m <= 12; m++) {
                labels.push(`${String(m).padStart(2, '0')}/${a}`);
            }
        }

        const mapComp = {};
        labels.forEach(comp => {
            mapComp[comp] = { maquinas: 0, imoveis: 0, veiculos: 0, total: 0 };
        });

        const hasFilters = (state.filterCategoria !== 'TODAS' || state.filterInstituicao !== 'TODAS' || state.filterStatus !== 'TODOS' || state.searchQuery);

        if (!hasFilters && data.totais_gerais && data.totais_gerais.fluxo_mensal) {
            data.totais_gerais.fluxo_mensal.forEach(m => {
                if (m.competencia && mapComp[m.competencia]) {
                    mapComp[m.competencia].maquinas = m.maquinas || 0;
                    mapComp[m.competencia].imoveis = m.imoveis || 0;
                    mapComp[m.competencia].veiculos = m.veiculos || 0;
                    mapComp[m.competencia].total = m.total_previsto || 0;
                }
            });
        } else {
            filteredContracts.forEach(c => {
                const cat = c.categoria;
                (c.parcelas || []).forEach(p => {
                    const comp = p.mes_ano || p.competencia || (p.vencimento && p.vencimento.length === 10 ? p.vencimento.substring(3, 10) : null);
                    if (comp && mapComp[comp]) {
                        const v = Number(p.prestacao) || 0;
                        if (cat === 'Máquinas') mapComp[comp].maquinas += v;
                        else if (cat === 'Imóveis') mapComp[comp].imoveis += v;
                        else if (cat === 'Veículos') mapComp[comp].veiculos += v;
                        mapComp[comp].total += v;
                    }
                });
            });
        }

        const maq = labels.map(c => mapComp[c].maquinas);
        const imo = labels.map(c => mapComp[c].imoveis);
        const vei = labels.map(c => mapComp[c].veiculos);
        const tot = labels.map(c => mapComp[c].total);

        // Plugin de Linha Vertical Guia no Cursor (Crosshair)
        const verticalGuidePlugin = {
            id: 'verticalGuideLine',
            afterDraw: (chart) => {
                if (chart.tooltip && chart.tooltip._active && chart.tooltip._active.length) {
                    const activePoint = chart.tooltip._active[0];
                    const chartCtx = chart.ctx;
                    const x = activePoint.element.x;
                    const topY = chart.scales.y.top;
                    const bottomY = chart.scales.y.bottom;
                    chartCtx.save();
                    chartCtx.beginPath();
                    chartCtx.moveTo(x, topY);
                    chartCtx.lineTo(x, bottomY);
                    chartCtx.lineWidth = 1.5;
                    chartCtx.strokeStyle = 'rgba(0, 210, 211, 0.45)';
                    chartCtx.setLineDash([4, 4]);
                    chartCtx.stroke();
                    chartCtx.restore();
                }
            }
        };

        const activePlugins = [verticalGuidePlugin];
        if (typeof ChartDataLabels !== 'undefined') activePlugins.push(ChartDataLabels);

        state.charts.fluxoPmts = new Chart(ctx, {
            plugins: activePlugins,
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Compromisso Total Mensal',
                        data: tot,
                        borderColor: '#00d2d3',
                        backgroundColor: '#00d2d3',
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointHoverRadius: 7,
                        pointBackgroundColor: '#00d2d3',
                        pointBorderColor: '#161b22',
                        pointBorderWidth: 2,
                        tension: 0.25,
                        order: 1,
                        yAxisID: 'y',
                        datalabels: {
                            display: (ctxD) => ctxD.dataset.data[ctxD.dataIndex] > 0,
                            color: '#00e5ff',
                            backgroundColor: 'rgba(13, 17, 23, 0.90)',
                            borderColor: 'rgba(0, 210, 211, 0.45)',
                            borderWidth: 1,
                            borderRadius: 4,
                            padding: { top: 2, bottom: 2, left: 4, right: 4 },
                            anchor: 'end',
                            align: 'top',
                            offset: 5,
                            clip: false,
                            font: { family: 'Outfit, Inter', weight: 'bold', size: 9 },
                            formatter: (val) => {
                                if (!val || val <= 0) return '';
                                if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
                                if (val >= 1000) return (val / 1000).toFixed(0) + 'k';
                                return String(val);
                            }
                        }
                    },
                    {
                        type: 'bar',
                        label: 'Máquinas & Perfuratrizes',
                        data: maq,
                        backgroundColor: 'rgba(56, 139, 253, 0.55)',
                        borderColor: '#388bfd',
                        borderWidth: 1,
                        stack: 'stack1',
                        borderRadius: 3,
                        order: 2,
                        yAxisID: 'y',
                        datalabels: { display: false }
                    },
                    {
                        type: 'bar',
                        label: 'Imóveis & Patrimônio',
                        data: imo,
                        backgroundColor: 'rgba(139, 92, 246, 0.55)',
                        borderColor: '#8b5cf6',
                        borderWidth: 1,
                        stack: 'stack1',
                        borderRadius: 3,
                        order: 2,
                        yAxisID: 'y',
                        datalabels: { display: false }
                    },
                    {
                        type: 'bar',
                        label: 'Veículos & Caminhões',
                        data: vei,
                        backgroundColor: 'rgba(245, 158, 11, 0.65)',
                        borderColor: '#f59e0b',
                        borderWidth: 1,
                        stack: 'stack1',
                        borderRadius: 3,
                        order: 2,
                        yAxisID: 'y',
                        datalabels: { display: false }
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 25,
                        bottom: 5,
                        left: 5,
                        right: 5
                    }
                },
                interaction: {
                    mode: 'index',
                    intersect: false,
                    axis: 'x'
                },
                hover: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { color: '#8b949e', font: { family: 'Outfit, Inter', size: 10 } }
                    },
                    y: {
                        stacked: true,
                        grace: '18%',
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
                        position: 'bottom',
                        labels: { color: '#c9d1d9', font: { family: 'Outfit, Inter', size: 11 }, boxWidth: 12, padding: 15 }
                    },
                    tooltip: {
                        enabled: true,
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(13, 17, 23, 0.96)',
                        titleColor: '#ffffff',
                        titleFont: { family: 'Outfit, Inter', weight: 'bold', size: 12 },
                        bodyColor: '#c9d1d9',
                        bodyFont: { family: 'Outfit, Inter', size: 11 },
                        borderColor: 'rgba(255, 255, 255, 0.15)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
                        boxWidth: 10,
                        boxHeight: 10,
                        usePointStyle: true,
                        callbacks: {
                            title: function (items) {
                                if (!items.length) return '';
                                return `Competência: ${items[0].label}`;
                            },
                            label: function (context) {
                                const label = context.dataset.label || '';
                                const val = context.parsed.y || 0;
                                if (context.dataset.type === 'line') {
                                    return ` ${label}: ${formatMoeda(val)}`;
                                }
                                if (val === 0) return ` ${label}: –`;
                                return ` ${label}: ${formatMoeda(val)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    // ==========================================
    // 4. TABELA CONSOLIDADA DOS CONTRATOS
    // ==========================================
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
    // 5. ABA 2: CRONOGRAMA DETALHADO & PMTs
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

        renderContractBanner(c);
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
    // 6. ABA 3: PROJEÇÃO DE DESEMBOLSO ANUAL
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
                        backgroundColor: 'rgba(16, 185, 129, 0.65)',
                        borderColor: '#10b981',
                        borderWidth: 1,
                        stack: 'stack1',
                        borderRadius: 4,
                        datalabels: { display: false }
                    },
                    {
                        label: 'Saldo Pendente de Amortização',
                        data: pendentes,
                        backgroundColor: 'rgba(56, 139, 253, 0.45)',
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
                interaction: {
                    mode: 'index',
                    intersect: false
                },
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
                        enabled: true,
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(13, 17, 23, 0.95)',
                        titleColor: '#ffffff',
                        titleFont: { family: 'Outfit, Inter', weight: 'bold', size: 12 },
                        bodyColor: '#c9d1d9',
                        bodyFont: { family: 'Outfit, Inter', size: 11 },
                        borderColor: 'rgba(255, 255, 255, 0.15)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
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
                <td class="num" style="color: #58a6ff;">${m.maquinas > 0 ? formatMoeda(m.maquinas) : '–'}</td>
                <td class="num" style="color: #f59e0b;">${m.veiculos > 0 ? formatMoeda(m.veiculos) : '–'}</td>
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
    // 7. EXPORTAÇÃO EXCEL (.XLSX)
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

        const contractsRows = (getFilteredContracts() || []).map(c => ({
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
    // 8. EVENT LISTENERS DE FILTROS SUPERIORES
    // ==========================================
    window.setFinFilterCategoria = function (cat) {
        state.filterCategoria = cat;
        renderActiveTab();
    };

    window.setFinFilterInstituicao = function (inst) {
        state.filterInstituicao = inst;
        renderActiveTab();
    };

    window.setFinFilterStatus = function (st) {
        state.filterStatus = st;
        renderActiveTab();
    };

    window.setFinSearchQuery = function (val) {
        state.searchQuery = val;
        renderOverviewKPIs();
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

        renderActiveTab();
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
