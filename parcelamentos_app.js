/**
 * BI JLE TELECOM - MÓDULO IMPOSTOS & GESTÃO TRIBUTÁRIA
 * Controlador Modular Frontend (Vanilla JS)
 * 1. Aba 1: Visão Geral & Consolidado (Cards + Gráfico Carga vs Faturamento + Matriz Mensal + Resumo Executivo Acordos).
 * 2. Aba 2: Detalhamento por Acordo (60x) (Seletor + Débitos de Origem + Cronograma 60 Parcelas).
 * 3. Datalabels calibrados sem sobreposição (Faturamento dentro da barra, % no topo da linha com badge).
 */

(function () {
    // Estado interno do módulo
    const state = {
        activeTab: 'visao_geral', // 'visao_geral', 'acordos'
        selectedAcordoId: null,
        scheduleSearchQuery: '',
        scheduleStatusFilter: 'ALL',
        schedulePage: 1,
        scheduleRowsPerPage: 20,
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
    window.initParcelamentos = function () {
        if (!window.PARCELAMENTOS_DATA) {
            console.warn('[Impostos] window.PARCELAMENTOS_DATA não encontrado.');
            return;
        }

        const data = window.PARCELAMENTOS_DATA;
        if (!state.selectedAcordoId && data.acordos && data.acordos.length > 0) {
            state.selectedAcordoId = data.acordos[0].id;
        }

        renderOverviewKPIs();
        renderActiveTab();
    };

    window.switchParcTab = function (tabId) {
        state.activeTab = tabId;
        
        document.querySelectorAll('.parc-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });

        document.querySelectorAll('.parc-tab-content').forEach(content => {
            content.style.display = (content.id === `parc-tab-content-${tabId}`) ? 'block' : 'none';
        });

        renderActiveTab();
    };

    function renderActiveTab() {
        if (state.activeTab === 'visao_geral') {
            renderChartCargaTributaria();
            renderAcompanhamentoTable();
            renderOverviewTable();
        } else if (state.activeTab === 'acordos') {
            renderAcordosTab();
        }
    }

    // ==========================================
    // 1. ABA: VISÃO GERAL & CONSOLIDADO
    // ==========================================
    function renderOverviewKPIs() {
        const data = window.PARCELAMENTOS_DATA;
        if (!data || !data.totais_gerais) return;

        const tot = data.totais_gerais;

        // KPI 1: Dívida Original
        const elDivida = document.getElementById('parc-kpi-divida-original');
        if (elDivida) elDivida.innerText = formatMoeda(tot.divida_original_parcelados);
        const elDividaSub = document.getElementById('parc-kpi-divida-original-sub');
        if (elDividaSub) elDividaSub.innerText = `${data.acordos.length} acordos ativos`;

        // KPI 2: Dívida Restante
        const elSaldo = document.getElementById('parc-kpi-saldo-parcelado');
        if (elSaldo) elSaldo.innerText = formatMoeda(tot.saldo_devedor_parcelado);
        const elSaldoSub = document.getElementById('parc-kpi-saldo-parcelado-sub');
        if (elSaldoSub) elSaldoSub.innerText = `${formatPct(100 - tot.pct_quitado_geral)} a amortizar`;

        // KPI 3: Total Já Amortizado
        const elPago = document.getElementById('parc-kpi-total-amortizado');
        if (elPago) elPago.innerText = formatMoeda(tot.total_pago_amortizado);
        const elPagoSub = document.getElementById('parc-kpi-total-amortizado-sub');
        if (elPagoSub) elPagoSub.innerText = `${formatPct(tot.pct_quitado_geral)} quitado`;

        // KPI 4: Juros Selic Pagos
        const elJuros = document.getElementById('parc-kpi-juros-selic');
        if (elJuros) elJuros.innerText = formatMoeda(tot.juros_selic_pagos_parcelas);

        // KPI 5: Compromisso Mensal
        const elMensal = document.getElementById('parc-kpi-compromisso-mensal');
        if (elMensal) elMensal.innerText = formatMoeda(tot.compromisso_mensal_atual);

        // Timestamp
        const elTs = document.getElementById('parc-data-timestamp');
        if (elTs && data.metadata) {
            elTs.innerText = data.metadata.generated_at || 'Atualizado';
        }
    }

    // Gráfico de Carga Tributária vs Faturamento (SEM SOBREPOSIÇÃO DE RÓTULOS)
    function renderChartCargaTributaria() {
        const data = window.PARCELAMENTOS_DATA;
        if (!data) return;

        const ctx = document.getElementById('parc-chart-carga-tributaria');
        if (!ctx) return;

        if (state.charts.cargaTributaria) {
            state.charts.cargaTributaria.destroy();
        }

        const acomp = data.acompanhamento_mensal || [];
        const labels = acomp.map(m => m.mes);
        const fat = acomp.map(m => m.faturamento);
        const imp = acomp.map(m => m.total_impostos);
        const carga = acomp.map(m => m.carga_tributaria_pct);

        const datalabelsPlugin = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

        state.charts.cargaTributaria = new Chart(ctx, {
            plugins: datalabelsPlugin,
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Carga Tributária Efetiva (%)',
                        data: carga,
                        borderColor: '#00d2d3',
                        backgroundColor: '#00d2d3',
                        yAxisID: 'y1',
                        borderWidth: 2.5,
                        pointRadius: 4.5,
                        pointHoverRadius: 7.5,
                        pointBackgroundColor: '#00d2d3',
                        tension: 0.25,
                        datalabels: {
                            display: true,
                            color: '#00e5ff',
                            backgroundColor: 'rgba(13, 17, 23, 0.88)',
                            borderColor: 'rgba(0, 210, 211, 0.4)',
                            borderWidth: 1,
                            borderRadius: 4,
                            padding: { top: 2, bottom: 2, left: 4, right: 4 },
                            anchor: 'end',
                            align: 'top',
                            offset: 6,
                            font: { family: 'Outfit, Inter', weight: 'bold', size: 10 },
                            formatter: (val) => val > 0 ? val.toFixed(1) + '%' : '0.0%'
                        }
                    },
                    {
                        type: 'bar',
                        label: 'Faturamento Bruto',
                        data: fat,
                        backgroundColor: 'rgba(56, 139, 253, 0.45)',
                        borderColor: '#388bfd',
                        borderWidth: 1,
                        yAxisID: 'y',
                        borderRadius: 4,
                        datalabels: {
                            display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0,
                            color: '#ffffff',
                            anchor: 'end',
                            align: 'bottom', // Rótulo DENTRO da barra no topo para nunca colidir com a linha de %
                            offset: 6,
                            font: { family: 'Outfit, Inter', weight: 'bold', size: 9.5 },
                            formatter: (val) => val > 0 ? 'R$ ' + (val / 1000000).toFixed(1) + 'M' : ''
                        }
                    },
                    {
                        type: 'bar',
                        label: 'Total Impostos Provisionados',
                        data: imp,
                        backgroundColor: 'rgba(245, 158, 11, 0.65)',
                        borderColor: '#f59e0b',
                        borderWidth: 1,
                        yAxisID: 'y',
                        borderRadius: 4,
                        datalabels: {
                            display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0,
                            color: '#f59e0b',
                            anchor: 'end',
                            align: 'top',
                            offset: 2,
                            font: { family: 'Outfit, Inter', weight: '600', size: 8.5 },
                            formatter: (val) => {
                                if (!val || val === 0) return '';
                                if (val >= 1000000) return 'R$ ' + (val / 1000000).toFixed(2) + 'M';
                                return 'R$ ' + (val / 1000).toFixed(0) + 'k';
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
                        grid: { display: false },
                        ticks: { color: '#c9d1d9', font: { family: 'Outfit, Inter', size: 10 } }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#8b949e',
                            font: { family: 'Outfit, Inter', size: 10 },
                            callback: val => 'R$ ' + (val / 1000000).toFixed(1) + 'M'
                        },
                        grace: '18%'
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: {
                            color: '#00d2d3',
                            font: { family: 'Outfit, Inter', size: 10 },
                            callback: val => val.toFixed(1) + '%'
                        },
                        grace: '25%'
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#c9d1d9', font: { family: 'Outfit, Inter', size: 11 }, boxWidth: 12 }
                    },
                    tooltip: {
                        backgroundColor: '#161b22',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        callbacks: {
                            label: function (ctx) {
                                if (ctx.dataset.yAxisID === 'y1') {
                                    return ` ${ctx.dataset.label}: ${ctx.raw.toFixed(2)}%`;
                                }
                                return ` ${ctx.dataset.label}: ${formatMoeda(ctx.raw)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Tabela de Acompanhamento Mensal (Matriz Mensal de Apuração)
    function renderAcompanhamentoTable() {
        const data = window.PARCELAMENTOS_DATA;
        if (!data) return;

        const acomp = data.acompanhamento_mensal || [];
        const tbody = document.getElementById('parc-acompanhamento-table-body');
        if (!tbody) return;

        let html = '';
        let totFat = 0, totIss = 0, totPis = 0, totCofins = 0, totIr = 0, totCsll = 0, totImp = 0;

        acomp.forEach(m => {
            totFat += m.faturamento;
            totIss += m.iss;
            totPis += m.pis;
            totCofins += m.cofins;
            totIr += m.ir;
            totCsll += m.csll;
            totImp += m.total_impostos;

            html += `
                <tr>
                    <td><strong>${m.mes}</strong></td>
                    <td class="num">${formatMoeda(m.faturamento)}</td>
                    <td class="num">${formatMoeda(m.iss)}</td>
                    <td class="num">${formatMoeda(m.pis)}</td>
                    <td class="num">${formatMoeda(m.cofins)}</td>
                    <td class="num">${formatMoeda(m.ir)}</td>
                    <td class="num">${formatMoeda(m.csll)}</td>
                    <td class="num" style="font-weight: 700; color: #f59e0b;">${formatMoeda(m.total_impostos)}</td>
                    <td class="num" style="font-weight: 700; color: #388bfd;">${formatPct(m.carga_tributaria_pct)}</td>
                </tr>
            `;
        });

        const avgCarga = totFat > 0 ? (totImp / totFat * 100) : 0;
        html += `
            <tr style="font-weight: 700; background: rgba(255,255,255,0.05); border-top: 2px solid var(--border-color);">
                <td>TOTAL / MÉDIA</td>
                <td class="num">${formatMoeda(totFat)}</td>
                <td class="num">${formatMoeda(totIss)}</td>
                <td class="num">${formatMoeda(totPis)}</td>
                <td class="num">${formatMoeda(totCofins)}</td>
                <td class="num">${formatMoeda(totIr)}</td>
                <td class="num">${formatMoeda(totCsll)}</td>
                <td class="num" style="color: #f59e0b;">${formatMoeda(totImp)}</td>
                <td class="num" style="color: #388bfd;">${formatPct(avgCarga)}</td>
            </tr>
        `;

        tbody.innerHTML = html;
    }

    // Tabela Resumo Executivo dos Acordos
    function renderOverviewTable() {
        const data = window.PARCELAMENTOS_DATA;
        const tbody = document.getElementById('parc-overview-table-body');
        if (!tbody || !data || !data.acordos) return;

        let html = '';
        data.acordos.forEach(ac => {
            html += `
                <tr>
                    <td><strong>${ac.label}</strong></td>
                    <td>${ac.data_adesao || '-'}</td>
                    <td class="num">${formatMoeda(ac.divida_original)}</td>
                    <td class="num" style="color: #10b981;"><strong>${formatMoeda(ac.total_pago)}</strong></td>
                    <td class="num" style="color: #388bfd;"><strong>${formatMoeda(ac.saldo_devedor)}</strong></td>
                    <td class="num">${formatMoeda(ac.juros_totais_pagos)}</td>
                    <td style="text-align: center;">
                        <span class="parc-badge parc-badge-pago">${ac.parcelas_pagas} / ${ac.total_parcelas}</span>
                    </td>
                    <td style="text-align: center;">
                        <span class="parc-badge ${ac.parcelas_faltantes > 0 ? 'parc-badge-aberto' : 'parc-badge-pago'}">
                            ${ac.parcelas_faltantes}
                        </span>
                    </td>
                    <td class="num">${formatMoeda(ac.valor_parcela_base)}</td>
                    <td style="text-align: center;">
                        <div class="parc-progress-wrapper" style="min-width: 60px;">
                            <div class="parc-progress-bar-bg">
                                <div class="parc-progress-bar-fill" style="width: ${Math.min(100, ac.pct_amortizado)}%;"></div>
                            </div>
                            <small style="font-size: 0.68rem; color: var(--text-secondary);">${formatPct(ac.pct_amortizado)}</small>
                        </div>
                    </td>
                    <td style="text-align: center;">
                        <button class="parc-btn" style="padding: 3px 6px; font-size: 0.72rem;" onclick="window.selectAndOpenAcordo('${ac.id}')" title="Ver Detalhes">
                            <i class="fa-solid fa-magnifying-glass"></i> Detalhes
                        </button>
                    </td>
                </tr>
            `;
        });

        // Linha de Totalizador
        const tot = data.totais_gerais;
        html += `
            <tr style="font-weight: 700; background: rgba(255,255,255,0.04); border-top: 2px solid var(--border-color);">
                <td colspan="2">TOTAL CONSOLIDADO</td>
                <td class="num">${formatMoeda(tot.divida_original_parcelados)}</td>
                <td class="num" style="color: #10b981;">${formatMoeda(tot.total_pago_amortizado)}</td>
                <td class="num" style="color: #388bfd;">${formatMoeda(tot.saldo_devedor_parcelado)}</td>
                <td class="num">${formatMoeda(tot.juros_selic_pagos_parcelas)}</td>
                <td colspan="2" style="text-align: center;">
                    <span class="parc-badge parc-badge-info">${data.acordos.length} Acordos</span>
                </td>
                <td class="num">${formatMoeda(tot.compromisso_mensal_atual)}</td>
                <td style="text-align: center;">${formatPct(tot.pct_quitado_geral)}</td>
                <td></td>
            </tr>
        `;

        tbody.innerHTML = html;
    }

    window.selectAndOpenAcordo = function (acordoId) {
        state.selectedAcordoId = acordoId;
        window.switchParcTab('acordos');
    };

    // ==========================================
    // 2. ABA: DETALHAMENTO POR ACORDO (60X)
    // ==========================================
    function renderAcordosTab() {
        const data = window.PARCELAMENTOS_DATA;
        if (!data || !data.acordos) return;

        // Preencher seletor de acordos
        const selectEl = document.getElementById('parc-select-acordo');
        if (selectEl) {
            selectEl.innerHTML = data.acordos.map(ac => 
                `<option value="${ac.id}" ${ac.id === state.selectedAcordoId ? 'selected' : ''}>${ac.label} (Saldo: ${formatMoeda(ac.saldo_devedor)})</option>`
            ).join('');
        }

        const acordo = data.acordos.find(a => a.id === state.selectedAcordoId) || data.acordos[0];
        if (!acordo) return;

        // Renderizar Header e Métricas do Acordo Selecionado
        const titleEl = document.getElementById('parc-acordo-selected-title');
        if (titleEl) titleEl.innerText = acordo.label;

        const infoEl = document.getElementById('parc-acordo-selected-info');
        if (infoEl) {
            infoEl.innerHTML = `
                <div class="parc-acordo-metrics">
                    <div class="parc-acordo-metric-item">
                        <div class="parc-acordo-metric-label">Dívida Original</div>
                        <div class="parc-acordo-metric-val">${formatMoeda(acordo.divida_original)}</div>
                    </div>
                    <div class="parc-acordo-metric-item" style="border-left: 3px solid #10b981;">
                        <div class="parc-acordo-metric-label">Total Já Pago</div>
                        <div class="parc-acordo-metric-val" style="color: #10b981;">${formatMoeda(acordo.total_pago)}</div>
                    </div>
                    <div class="parc-acordo-metric-item" style="border-left: 3px solid #388bfd;">
                        <div class="parc-acordo-metric-label">Dívida Restante</div>
                        <div class="parc-acordo-metric-val" style="color: #388bfd;">${formatMoeda(acordo.saldo_devedor)}</div>
                    </div>
                    <div class="parc-acordo-metric-item" style="border-left: 3px solid #f59e0b;">
                        <div class="parc-acordo-metric-label">Juros Selic Pagos</div>
                        <div class="parc-acordo-metric-val" style="color: #f59e0b;">${formatMoeda(acordo.juros_totais_pagos)}</div>
                    </div>
                    <div class="parc-acordo-metric-item">
                        <div class="parc-acordo-metric-label">Parcelas Pagas</div>
                        <div class="parc-acordo-metric-val">${acordo.parcelas_pagas} / ${acordo.total_parcelas} (${formatPct(acordo.pct_amortizado)})</div>
                    </div>
                    <div class="parc-acordo-metric-item">
                        <div class="parc-acordo-metric-label">Parcela Base</div>
                        <div class="parc-acordo-metric-val">${formatMoeda(acordo.valor_parcela_base)}</div>
                    </div>
                </div>
            `;
        }

        // Renderizar Tributos de Origem
        renderDebitosOrigemTable(acordo);

        // Renderizar Cronograma de Parcelas
        renderCronogramaTable(acordo);
    }

    window.onParcAcordoChange = function (val) {
        state.selectedAcordoId = val;
        state.schedulePage = 1;
        renderAcordosTab();
    };

    function renderDebitosOrigemTable(acordo) {
        const tbody = document.getElementById('parc-debitos-origem-table-body');
        if (!tbody) return;

        const debitos = acordo.debitos_origem || [];
        if (debitos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 14px;">Nenhum tributo individual discriminado para este acordo.</td></tr>`;
            return;
        }

        let html = '';
        let totPrin = 0, totMulta = 0, totJuros = 0, totSaldo = 0;

        debitos.forEach(d => {
            totPrin += d.valor_principal;
            totMulta += d.valor_multa;
            totJuros += d.valor_juros;
            totSaldo += d.saldo_consolidado;

            html += `
                <tr>
                    <td><strong>${d.codigo_receita}</strong></td>
                    <td>${d.apuracao || '-'}</td>
                    <td>${d.vencimento_original || '-'}</td>
                    <td class="num">${formatMoeda(d.valor_principal)}</td>
                    <td class="num">${formatMoeda(d.valor_multa)}</td>
                    <td class="num">${formatMoeda(d.valor_juros)}</td>
                    <td class="num" style="color: #388bfd; font-weight: 600;">${formatMoeda(d.saldo_consolidado)}</td>
                </tr>
            `;
        });

        html += `
            <tr style="font-weight: 700; background: rgba(255,255,255,0.04);">
                <td colspan="3">TOTAL DÉBITOS DE ORIGEM</td>
                <td class="num">${formatMoeda(totPrin)}</td>
                <td class="num">${formatMoeda(totMulta)}</td>
                <td class="num">${formatMoeda(totJuros)}</td>
                <td class="num" style="color: #388bfd;">${formatMoeda(totSaldo)}</td>
            </tr>
        `;

        tbody.innerHTML = html;
    }

    function renderCronogramaTable(acordo) {
        const tbody = document.getElementById('parc-cronograma-table-body');
        if (!tbody) return;

        let parcelas = [...(acordo.cronograma_parcelas || [])];

        // Filtro de Status
        if (state.scheduleStatusFilter !== 'ALL') {
            parcelas = parcelas.filter(p => p.status === state.scheduleStatusFilter);
        }

        // Busca
        if (state.scheduleSearchQuery) {
            const q = state.scheduleSearchQuery.toLowerCase();
            parcelas = parcelas.filter(p => 
                p.numero.toString().includes(q) || 
                (p.vencimento && p.vencimento.toLowerCase().includes(q)) ||
                p.status.toLowerCase().includes(q)
            );
        }

        // Ordenação
        parcelas.sort((a, b) => {
            let va = a[state.scheduleSortCol];
            let vb = b[state.scheduleSortCol];
            if (va < vb) return state.scheduleSortAsc ? -1 : 1;
            if (va > vb) return state.scheduleSortAsc ? 1 : -1;
            return 0;
        });

        // Paginação
        const totalRows = parcelas.length;
        const totalPages = Math.ceil(totalRows / state.scheduleRowsPerPage) || 1;
        if (state.schedulePage > totalPages) state.schedulePage = totalPages;

        const startIdx = (state.schedulePage - 1) * state.scheduleRowsPerPage;
        const pageRows = parcelas.slice(startIdx, startIdx + state.scheduleRowsPerPage);

        let html = '';
        if (pageRows.length === 0) {
            html = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 14px;">Nenhuma parcela encontrada com os filtros atuais.</td></tr>`;
        } else {
            pageRows.forEach(p => {
                const isPaga = p.status === 'Paga';
                html += `
                    <tr>
                        <td><strong>Parc. ${p.numero}/${acordo.total_parcelas}</strong></td>
                        <td>${p.vencimento || '-'}</td>
                        <td class="num">${formatMoeda(p.valor_base)}</td>
                        <td class="num" style="color: ${p.juros_selic > 0 ? '#f59e0b' : 'inherit'};">${formatMoeda(p.juros_selic)}</td>
                        <td class="num"><strong>${formatMoeda(p.valor_total)}</strong></td>
                        <td class="num">${p.saldo_devedor_restante !== null ? formatMoeda(p.saldo_devedor_restante) : '-'}</td>
                        <td style="text-align: center;">
                            <span class="parc-badge ${isPaga ? 'parc-badge-pago' : 'parc-badge-aberto'}">
                                <i class="fa-solid ${isPaga ? 'fa-circle-check' : 'fa-clock'}"></i> ${p.status}
                            </span>
                        </td>
                    </tr>
                `;
            });
        }

        tbody.innerHTML = html;

        // Renderizar controles de paginação
        renderSchedulePagination(totalRows, totalPages);
    }

    function renderSchedulePagination(totalRows, totalPages) {
        const container = document.getElementById('parc-schedule-pagination');
        if (!container) return;

        const startItem = totalRows === 0 ? 0 : (state.schedulePage - 1) * state.scheduleRowsPerPage + 1;
        const endItem = Math.min(state.schedulePage * state.scheduleRowsPerPage, totalRows);

        container.innerHTML = `
            <div>Exibindo <strong>${startItem}</strong> a <strong>${endItem}</strong> de <strong>${totalRows}</strong> parcelas</div>
            <div class="parc-pagination-controls">
                <button class="parc-page-btn" onclick="window.changeSchedulePage(1)" ${state.schedulePage <= 1 ? 'disabled' : ''}>
                    <i class="fa-solid fa-angles-left"></i>
                </button>
                <button class="parc-page-btn" onclick="window.changeSchedulePage(${state.schedulePage - 1})" ${state.schedulePage <= 1 ? 'disabled' : ''}>
                    <i class="fa-solid fa-angle-left"></i>
                </button>
                <span style="padding: 0 6px; font-weight: 600;">Pág. ${state.schedulePage}/${totalPages}</span>
                <button class="parc-page-btn" onclick="window.changeSchedulePage(${state.schedulePage + 1})" ${state.schedulePage >= totalPages ? 'disabled' : ''}>
                    <i class="fa-solid fa-angle-right"></i>
                </button>
                <button class="parc-page-btn" onclick="window.changeSchedulePage(${totalPages})" ${state.schedulePage >= totalPages ? 'disabled' : ''}>
                    <i class="fa-solid fa-angles-right"></i>
                </button>
            </div>
        `;
    }

    window.changeSchedulePage = function (newPage) {
        state.schedulePage = newPage;
        const data = window.PARCELAMENTOS_DATA;
        const acordo = data.acordos.find(a => a.id === state.selectedAcordoId);
        if (acordo) renderCronogramaTable(acordo);
    };

    window.onParcScheduleSearch = function (val) {
        state.scheduleSearchQuery = val;
        state.schedulePage = 1;
        const data = window.PARCELAMENTOS_DATA;
        const acordo = data.acordos.find(a => a.id === state.selectedAcordoId);
        if (acordo) renderCronogramaTable(acordo);
    };

    window.onParcScheduleFilterChange = function (val) {
        state.scheduleStatusFilter = val;
        state.schedulePage = 1;
        const data = window.PARCELAMENTOS_DATA;
        const acordo = data.acordos.find(a => a.id === state.selectedAcordoId);
        if (acordo) renderCronogramaTable(acordo);
    };

    window.onParcScheduleSort = function (col) {
        if (state.scheduleSortCol === col) {
            state.scheduleSortAsc = !state.scheduleSortAsc;
        } else {
            state.scheduleSortCol = col;
            state.scheduleSortAsc = true;
        }
        const data = window.PARCELAMENTOS_DATA;
        const acordo = data.acordos.find(a => a.id === state.selectedAcordoId);
        if (acordo) renderCronogramaTable(acordo);
    };

    // ==========================================
    // EXPORTAÇÃO EXCEL (.XLSX) VIA SHEETJS
    // ==========================================
    window.exportParcScheduleExcel = function () {
        const data = window.PARCELAMENTOS_DATA;
        if (!data || !window.XLSX) {
            alert('Biblioteca SheetJS indisponível para exportação.');
            return;
        }

        const acordo = data.acordos.find(a => a.id === state.selectedAcordoId);
        if (!acordo) return;

        const wb = XLSX.utils.book_new();

        // Aba 1: Cronograma de Parcelas
        const scheduleRows = (acordo.cronograma_parcelas || []).map(p => ({
            'Nº Parcela': `Parcela ${p.numero}/${acordo.total_parcelas}`,
            'Data Vencimento': p.vencimento || '',
            'Valor Base (R$)': p.valor_base,
            'Juros Selic (R$)': p.juros_selic,
            'Valor Total (R$)': p.valor_total,
            'Saldo Restante (R$)': p.saldo_devedor_restante !== null ? p.saldo_devedor_restante : '',
            'Status': p.status
        }));
        const wsSchedule = XLSX.utils.json_to_sheet(scheduleRows);
        XLSX.utils.book_append_sheet(wb, wsSchedule, "Cronograma Parcelas");

        // Aba 2: Débitos de Origem
        const debitsRows = (acordo.debitos_origem || []).map(d => ({
            'Código Receita': d.codigo_receita,
            'Apuração': d.apuracao,
            'Vencimento Original': d.vencimento_original,
            'Principal (R$)': d.valor_principal,
            'Multa (R$)': d.valor_multa,
            'Juros (R$)': d.valor_juros,
            'Saldo Consolidado (R$)': d.saldo_consolidado
        }));
        const wsDebits = XLSX.utils.json_to_sheet(debitsRows);
        XLSX.utils.book_append_sheet(wb, wsDebits, "Debitos Consolidados");

        const fileName = `JLE_Parcelamento_${acordo.id}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    window.exportParcOverviewExcel = function () {
        const data = window.PARCELAMENTOS_DATA;
        if (!data || !window.XLSX) return;

        const wb = XLSX.utils.book_new();

        // Resumo de Acordos
        const acordosRows = data.acordos.map(a => ({
            'Acordo': a.label,
            'Data Adesão': a.data_adesao,
            'Dívida Original (R$)': a.divida_original,
            'Total Pago (R$)': a.total_pago,
            'Dívida Restante (R$)': a.saldo_devedor,
            'Juros Selic Pagos (R$)': a.juros_totais_pagos,
            'Parcelas Pagas': a.parcelas_pagas,
            'Total Parcelas': a.total_parcelas,
            'Parcelas Restantes': a.parcelas_faltantes,
            '% Quitado': a.pct_amortizado
        }));
        const wsAcordos = XLSX.utils.json_to_sheet(acordosRows);
        XLSX.utils.book_append_sheet(wb, wsAcordos, "Resumo Acordos");

        // Acompanhamento Mensal
        const acompRows = (data.acompanhamento_mensal || []).map(m => ({
            'Competência': m.mes,
            'Faturamento Bruto (R$)': m.faturamento,
            'ISS (R$)': m.iss,
            'PIS (R$)': m.pis,
            'COFINS (R$)': m.cofins,
            'IRPJ (R$)': m.ir,
            'CSLL (R$)': m.csll,
            'Total Impostos (R$)': m.total_impostos,
            'Carga Efetiva (%)': m.carga_tributaria_pct
        }));
        const wsAcomp = XLSX.utils.json_to_sheet(acompRows);
        XLSX.utils.book_append_sheet(wb, wsAcomp, "Acompanhamento Mensal");

        const fileName = `JLE_Controle_Parcelamentos_Consolidado_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

})();
