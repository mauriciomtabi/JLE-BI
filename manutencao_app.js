// manutencao_app.js
// Logic for Manutenção (Claro RS) page in BI JLE Telecom - 100% Excel Master Base

(function() {
    let rawData = [];
    let filteredData = [];

    // State for pagination & filters
    let currentPage = 1;
    const itemsPerPage = 15;
    let activeTab = 'indicadores'; // 'indicadores' or 'relatorio'

    // Chart instances
    let chartMensal = null;
    let chartDemandaInteg = null;
    let chartTipoDefeito = null;
    let chartCausaDefeito = null;
    let chartLocalidades = null;

    const CATEGORY_ICONS = {
        'ROMPIMENTO': 'fa-solid fa-link-slash',
        'ATENUAÇÃO': 'fa-solid fa-triangle-exclamation',
        'ADEQUAÇÃO DE REDE': 'fa-solid fa-wrench',
        'MOBILIZAÇÃO': 'fa-solid fa-truck-fast',
        'RAL DE QUALIDADE': 'fa-solid fa-award',
        'MELHORIA DE REDE': 'fa-solid fa-network-wired',
        'OBRAS': 'fa-solid fa-helmet-safety',
        'FORNECIMENTO / MATERIAIS': 'fa-solid fa-boxes-stacked',
        'LINK': 'fa-solid fa-signal',
        'EVENTO': 'fa-solid fa-calendar-star',
        'ACIONANDO': 'fa-solid fa-bolt'
    };

    function formatCurrency(val) {
        if (!val || isNaN(val)) return "R$ 0,00";
        return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatShortCurrency(val) {
        if (!val || isNaN(val) || val === 0) return "R$ 0";
        if (val >= 1000000) {
            return `R$ ${(val / 1000000).toFixed(2).replace('.', ',')}M`;
        }
        if (val >= 1000) {
            return `R$ ${(val / 1000).toFixed(1).replace('.', ',')}k`;
        }
        return `R$ ${val.toFixed(0)}`;
    }

    // Rotulo simples sem o "R$" na frente: 900 mil, 585 mil, 86 mil, 1 mi
    function formatSimpleNumber(val) {
        if (!val || isNaN(val) || val === 0) return '';
        if (val >= 1000000) {
            const mi = val / 1000000;
            return Number.isInteger(mi) ? `${mi} mi` : `${mi.toFixed(2).replace('.', ',')} mi`;
        }
        if (val >= 1000) {
            const mil = Math.round(val / 1000);
            return `${mil} mil`;
        }
        return Math.round(val).toString();
    }

    function initManutencao() {
        if (!window.MANUTENCAO_DATA) {
            console.warn("MANUTENCAO_DATA não carregado ainda.");
            return;
        }

        rawData = [...window.MANUTENCAO_DATA];
        
        populateFilterDropdowns();
        setupEventListeners();

        // A pagina deve sempre estar filtrada pelo mês atual por padrão (ex: JULHO/2026)
        const selMesBase = document.getElementById('manut-filter-mes-base');
        if (selMesBase) {
            const hasJulho = Array.from(selMesBase.options).some(opt => opt.value === 'JULHO/2026');
            if (hasJulho) {
                selMesBase.value = 'JULHO/2026';
            }
        }

        applyFilters();
    }

    function populateFilterDropdowns() {
        const selStatus = document.getElementById('manut-filter-status');
        const selAtividade = document.getElementById('manut-filter-atividade');
        const selLocalidade = document.getElementById('manut-filter-localidade');
        const selEquipe = document.getElementById('manut-filter-equipe');
        const selMesBase = document.getElementById('manut-filter-mes-base');

        if (!selStatus) return;

        // Unique Statuses
        const statuses = [...new Set(rawData.map(r => r.status).filter(s => s && s !== '-'))].sort();
        selStatus.innerHTML = '<option value="">Todos os Status</option>' + 
            statuses.map(s => `<option value="${s}">${s}</option>`).join('');

        // Unique Tipos de Atividade
        const atividades = [...new Set(rawData.map(r => r.tipo_atividade).filter(a => a && a !== '-'))].sort();
        selAtividade.innerHTML = '<option value="">Todas as Atividades</option>' + 
            atividades.map(a => `<option value="${a}">${a}</option>`).join('');

        // Unique Localidades
        const localidades = [...new Set(rawData.map(r => r.localidade).filter(l => l && l !== '-'))].sort();
        selLocalidade.innerHTML = '<option value="">Todas as Localidades</option>' + 
            localidades.map(l => `<option value="${l}">${l}</option>`).join('');

        // Unique Equipes
        const equipes = [...new Set(rawData.map(r => r.equipe).filter(e => e && e !== '-'))].sort();
        selEquipe.innerHTML = '<option value="">Todas as Equipes</option>' + 
            equipes.map(e => `<option value="${e}">${e}</option>`).join('');

        // Unique Mês Base Pagamento (Coluna N)
        const monthOrder = ["FEVEREIRO/2026", "MARÇO/2026", "ABRIL/2026", "MAIO/2026", "JUNHO/2026", "JULHO/2026", "AGOSTO/2026", "SETEMBRO/2026", "OUTUBRO/2026"];
        const rawMonths = [...new Set(rawData.map(r => r.mes_pagamento).filter(m => m && m !== '-' && m !== 'SEM MÊS'))];
        const months = monthOrder.filter(m => rawMonths.includes(m)).concat(rawMonths.filter(m => !monthOrder.includes(m)));

        if (selMesBase) {
            selMesBase.innerHTML = '<option value="">Todos os Meses</option>' + 
                months.map(m => `<option value="${m}">${m}</option>`).join('');
        }
    }

    function setupEventListeners() {
        const selStatus = document.getElementById('manut-filter-status');
        const selAtividade = document.getElementById('manut-filter-atividade');
        const selLocalidade = document.getElementById('manut-filter-localidade');
        const selEquipe = document.getElementById('manut-filter-equipe');
        const selMesBase = document.getElementById('manut-filter-mes-base');
        const inputSearch = document.getElementById('manut-search-input');
        const btnRefresh = document.getElementById('manut-btn-refresh-data');

        [selStatus, selAtividade, selLocalidade, selEquipe, selMesBase].forEach(el => {
            if (el) el.addEventListener('change', applyFilters);
        });

        if (inputSearch) {
            inputSearch.addEventListener('input', applyFilters);
        }

        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => {
                window.location.reload();
            });
        }

        // Sub Tab Selector
        const tabBtns = document.querySelectorAll('.manut-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.getAttribute('data-tab');
                switchTab(target);
            });
        });
    }

    window.clearManutFilters = function() {
        const selStatus = document.getElementById('manut-filter-status');
        const selAtividade = document.getElementById('manut-filter-atividade');
        const selLocalidade = document.getElementById('manut-filter-localidade');
        const selEquipe = document.getElementById('manut-filter-equipe');
        const selMesBase = document.getElementById('manut-filter-mes-base');
        const inputSearch = document.getElementById('manut-search-input');

        if (selStatus) selStatus.value = '';
        if (selAtividade) selAtividade.value = '';
        if (selLocalidade) selLocalidade.value = '';
        if (selEquipe) selEquipe.value = '';
        if (selMesBase) selMesBase.value = '';
        if (inputSearch) inputSearch.value = '';
        applyFilters();
    };

    function switchTab(tabName) {
        activeTab = tabName;
        document.querySelectorAll('.manut-tab-btn').forEach(b => {
            if (b.getAttribute('data-tab') === tabName) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });

        const viewIndicadores = document.getElementById('subview-manut-indicators');
        const viewRelatorio = document.getElementById('subview-manut-report');

        if (tabName === 'indicadores') {
            if (viewIndicadores) {
                viewIndicadores.classList.add('active');
                viewIndicadores.style.display = 'flex';
            }
            if (viewRelatorio) {
                viewRelatorio.classList.remove('active');
                viewRelatorio.style.display = 'none';
            }
            renderCharts();
        } else {
            if (viewIndicadores) {
                viewIndicadores.classList.remove('active');
                viewIndicadores.style.display = 'none';
            }
            if (viewRelatorio) {
                viewRelatorio.classList.add('active');
                viewRelatorio.style.display = 'block';
            }
            renderTable();
        }
    }

    function applyFilters() {
        const selStatus = document.getElementById('manut-filter-status')?.value || '';
        const selAtividade = document.getElementById('manut-filter-atividade')?.value || '';
        const selLocalidade = document.getElementById('manut-filter-localidade')?.value || '';
        const selEquipe = document.getElementById('manut-filter-equipe')?.value || '';
        const selMesBase = document.getElementById('manut-filter-mes-base')?.value || '';
        const searchQuery = (document.getElementById('manut-search-input')?.value || '').toLowerCase().trim();

        filteredData = rawData.filter(r => {
            if (selStatus && r.status !== selStatus) return false;
            if (selAtividade && r.tipo_atividade !== selAtividade) return false;
            if (selLocalidade && r.localidade !== selLocalidade) return false;
            if (selEquipe && r.equipe !== selEquipe) return false;
            if (selMesBase && r.mes_pagamento !== selMesBase) return false;

            if (searchQuery) {
                const matchRal = (r.ral || '').toLowerCase().includes(searchQuery);
                const matchAtiv = (r.atividade || '').toLowerCase().includes(searchQuery);
                const matchTipoAtiv = (r.tipo_atividade || '').toLowerCase().includes(searchQuery);
                const matchLoc = (r.localidade || '').toLowerCase().includes(searchQuery);
                const matchWf2 = (r.wf2 || '').toLowerCase().includes(searchQuery);
                if (!matchRal && !matchAtiv && !matchTipoAtiv && !matchLoc && !matchWf2) return false;
            }

            return true;
        });

        currentPage = 1;
        renderCategoryCards();
        if (activeTab === 'indicadores') {
            renderCharts();
        } else {
            renderTable();
        }
    }

    function renderPage() {
        renderCategoryCards();
        if (activeTab === 'indicadores') {
            renderCharts();
        } else {
            renderTable();
        }
    }

    // CARDS DE CATEGORIA
    function renderCategoryCards() {
        const container = document.getElementById('manut-category-cards-container');
        if (!container) return;

        const ativStats = {};
        filteredData.forEach(r => {
            if (r.tipo_atividade && r.tipo_atividade !== '-') {
                const at = r.tipo_atividade;
                if (!ativStats[at]) {
                    ativStats[at] = { count: 0, totalVal: 0 };
                }
                ativStats[at].count += 1;
                ativStats[at].totalVal += (r.valor_medicao || 0);
            }
        });

        const overallVal = filteredData.reduce((sum, r) => sum + (r.valor_medicao || 0), 0) || 1;
        const sortedAtiv = Object.keys(ativStats)
            .filter(cat => ativStats[cat].count >= 1 || ativStats[cat].totalVal > 0)
            .sort((a,b) => ativStats[b].totalVal - ativStats[a].totalVal);

        container.innerHTML = sortedAtiv.map(cat => {
            const stats = ativStats[cat];
            const pct = ((stats.totalVal / overallVal) * 100).toFixed(1).replace('.', ',');
            const iconClass = CATEGORY_ICONS[cat] || 'fa-solid fa-wrench';
            const activeAtiv = document.getElementById('manut-filter-atividade')?.value || '';

            return `
            <div class="cobranca-category-card${activeAtiv === cat ? ' active' : ''}" onclick="window.filterByManutCategory('${cat}')">
                <div class="kpi-info" style="flex-grow: 1;">
                    <div class="cobranca-category-title">${cat}</div>
                    <div class="cobranca-category-value" style="font-size: 1.05rem; font-weight: 800; color: var(--text-primary);">${formatShortCurrency(stats.totalVal)}</div>
                    <div class="kpi-sub" style="font-size: 11px; color: var(--text-secondary); font-weight: 600; display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                        <span>${stats.count.toLocaleString('pt-BR')} OFs</span>
                        <span style="background: rgba(0,180,216,0.12); color: var(--color-primary); padding: 1px 6px; border-radius: 8px; font-weight: 700;">${pct}%</span>
                    </div>
                </div>
                <div class="kpi-icon-container">
                    <i class="${iconClass}"></i>
                </div>
            </div>`;
        }).join('');
    }

    window.filterByManutCategory = function(cat) {
        const sel = document.getElementById('manut-filter-atividade');
        if (sel) {
            sel.value = sel.value === cat ? '' : cat;
            applyFilters();
        }
    };

    function renderCharts() {
        if (typeof Chart === 'undefined') return;

        const textColor = '#f8fafc';
        const gridColor = 'rgba(255, 255, 255, 0.05)';
        const pluginsList = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

        // 1. GRÁFICO DE EVOLUÇÃO MENSAL (COLUNAS EMPILHADAS)
        // Regra de Legendas:
        // - Aprovado: Coluna T não vazia (wf2) E Coluna U vazia
        // - Pedido Gerado: Coluna T não vazia (wf2) E Coluna U não vazia (obs_medicao)
        // - Aguard. aprovação: Coluna T vazia (wf2)
        const monthMapKeys = ['FEVEREIRO/2026', 'MARÇO/2026', 'ABRIL/2026', 'MAIO/2026', 'JUNHO/2026', 'JULHO/2026', 'AGOSTO/2026', 'SETEMBRO/2026', 'OUTUBRO/2026'];
        const monthShortLabels = ['FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT'];

        const monthlyStats = {};
        monthMapKeys.forEach(m => {
            monthlyStats[m] = { aprovado: 0, pedGerado: 0, aguard: 0, totalVal: 0 };
        });

        filteredData.forEach(r => {
            const mKey = r.mes_pagamento;
            if (mKey && monthlyStats[mKey]) {
                const v = r.valor_medicao || 0;
                const hasColT = Boolean(r.wf2 && r.wf2 !== '-' && r.wf2.toUpperCase() !== 'NONE');
                const hasColU = Boolean(r.obs_medicao && r.obs_medicao !== '-' && r.obs_medicao.toUpperCase() !== 'NONE');

                if (hasColT && hasColU) {
                    monthlyStats[mKey].pedGerado += v;
                } else if (hasColT) {
                    monthlyStats[mKey].aprovado += v;
                } else {
                    monthlyStats[mKey].aguard += v;
                }
                monthlyStats[mKey].totalVal += v;
            }
        });

        const dataAprovado = monthMapKeys.map(m => monthlyStats[m].aprovado);
        const dataPedGerado = monthMapKeys.map(m => monthlyStats[m].pedGerado);
        const dataAguard = monthMapKeys.map(m => monthlyStats[m].aguard);

        // Update Total Medido Badge
        const overallTotalMedido = filteredData.reduce((sum, r) => sum + (r.valor_medicao || 0), 0);
        const avg30DaysEl = document.getElementById('manut-avg-30days-val');
        if (avg30DaysEl) {
            avg30DaysEl.innerText = formatCurrency(overallTotalMedido);
        }

        const ctxMensal = document.getElementById('manut-chart-mensal')?.getContext('2d');
        if (ctxMensal) {
            if (chartMensal) chartMensal.destroy();

            chartMensal = new Chart(ctxMensal, {
                type: 'bar',
                data: {
                    labels: monthShortLabels,
                    datasets: [
                        {
                            label: 'Aprovado',
                            data: dataAprovado,
                            backgroundColor: '#10b981',
                            borderRadius: 4
                        },
                        {
                            label: 'Pedido Gerado',
                            data: dataPedGerado,
                            backgroundColor: '#a855f7',
                            borderRadius: 4
                        },
                        {
                            label: 'Aguard. aprovação',
                            data: dataAguard,
                            backgroundColor: '#f59e0b',
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: { color: textColor, font: { weight: 'bold', size: 11 }, usePointStyle: true, boxWidth: 8 }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            titleColor: '#38bdf8',
                            bodyColor: '#f8fafc',
                            borderColor: 'rgba(56, 189, 248, 0.3)',
                            borderWidth: 1,
                            padding: 10,
                            boxPadding: 4,
                            callbacks: {
                                label: function(context) {
                                    const val = context.raw || 0;
                                    return ` ${context.dataset.label}: ${formatCurrency(val)}`;
                                }
                            }
                        },
                        datalabels: {
                            display: false
                        }
                    },
                    scales: {
                        x: { stacked: true, ticks: { color: textColor, font: { weight: 'bold' } }, grid: { display: false } },
                        y: { 
                            stacked: true,
                            ticks: { 
                                color: '#94a3b8',
                                callback: (v) => formatShortCurrency(v)
                            }, 
                            grid: { color: gridColor }, 
                            grace: '18%' 
                        }
                    }
                },
                plugins: pluginsList
            });
        }

        // 2. GRÁFICO DEMANDA vs INTEGRIDADE (COLUNA O)
        const demStats = { 'DEMANDA': 0, 'INTEGRIDADE': 0, 'OUTROS': 0 };
        const demCount = { 'DEMANDA': 0, 'INTEGRIDADE': 0, 'OUTROS': 0 };

        filteredData.forEach(r => {
            const d = r.demanda_integ || 'OUTROS';
            if (demStats[d] !== undefined) {
                demStats[d] += (r.valor_medicao || 0);
                demCount[d] += 1;
            } else {
                demStats['OUTROS'] += (r.valor_medicao || 0);
                demCount['OUTROS'] += 1;
            }
        });

        const demLabels = Object.keys(demStats).filter(k => demCount[k] > 0);
        const demValues = demLabels.map(k => demStats[k]);

        const ctxDem = document.getElementById('manut-chart-demanda-integ')?.getContext('2d');
        if (ctxDem) {
            if (chartDemandaInteg) chartDemandaInteg.destroy();
            chartDemandaInteg = new Chart(ctxDem, {
                type: 'bar',
                data: {
                    labels: demLabels,
                    datasets: [{
                        label: 'Valor Medido (R$)',
                        data: demValues,
                        backgroundColor: ['#a855f7', '#3b82f6', '#64748b'],
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => {
                                    const k = demLabels[ctx.dataIndex];
                                    return [
                                        ` Valor: ${formatCurrency(demStats[k])}`,
                                        ` Qtd: ${demCount[k].toLocaleString('pt-BR')} OFs`
                                    ];
                                }
                            }
                        },
                        datalabels: {
                            display: true,
                            color: '#ffffff',
                            anchor: 'end',
                            align: 'top',
                            font: { weight: 'bold', size: 11 },
                            formatter: (val) => formatSimpleNumber(val) // Formato sem R$: 900 mil, 585 mil, 1 mi
                        }
                    },
                    scales: {
                        x: { ticks: { color: textColor, font: { weight: 'bold', size: 11 } }, grid: { display: false } },
                        y: { 
                            ticks: { 
                                color: '#94a3b8',
                                callback: (v) => formatShortCurrency(v)
                            }, 
                            grid: { color: gridColor }, 
                            grace: '20%' 
                        }
                    }
                },
                plugins: pluginsList
            });
        }

        // 3. GRÁFICO LOCALIDADES / CIDADES - TOP 10 (SEM R$ NO DATALABEL)
        const locStats = {};
        filteredData.forEach(r => {
            if (r.localidade && r.localidade !== '-') {
                const loc = r.localidade;
                if (!locStats[loc]) locStats[loc] = { val: 0, count: 0 };
                locStats[loc].val += (r.valor_medicao || 0);
                locStats[loc].count += 1;
            }
        });
        const sortedLoc = Object.keys(locStats)
            .sort((a,b) => locStats[b].val - locStats[a].val)
            .slice(0, 10);
        const dataLocVal = sortedLoc.map(k => locStats[k].val);

        const ctxLoc = document.getElementById('manut-chart-localidades')?.getContext('2d');
        if (ctxLoc) {
            if (chartLocalidades) chartLocalidades.destroy();
            chartLocalidades = new Chart(ctxLoc, {
                type: 'bar',
                data: {
                    labels: sortedLoc,
                    datasets: [{
                        label: 'Valor Medido (R$)',
                        data: dataLocVal,
                        backgroundColor: '#10b981',
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'x',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => {
                                    const labelKey = sortedLoc[ctx.dataIndex];
                                    const st = locStats[labelKey];
                                    return [
                                        ` Valor: ${formatCurrency(st.val)}`,
                                        ` Qtd: ${st.count.toLocaleString('pt-BR')} OFs`
                                    ];
                                }
                            }
                        },
                        datalabels: {
                            display: true,
                            color: '#ffffff',
                            anchor: 'end',
                            align: 'top',
                            font: { weight: 'bold', size: 10 },
                            formatter: (val) => formatSimpleNumber(val) // Sem R$: 900 mil, 585 mil, 1 mi
                        }
                    },
                    scales: {
                        x: { ticks: { color: textColor, font: { weight: 'bold', size: 11 } }, grid: { display: false } },
                        y: { 
                            ticks: { 
                                color: '#94a3b8',
                                callback: (v) => formatShortCurrency(v)
                            }, 
                            grid: { color: gridColor }, 
                            grace: '18%' 
                        }
                    }
                },
                plugins: pluginsList
            });
        }

        // 4. GRÁFICO TIPO DE DEFEITO - TOP 10 (SEM R$ NO DATALABEL)
        const tipoDefStats = {};
        filteredData.forEach(r => {
            if (r.tipo_defeito && r.tipo_defeito !== '-') {
                const td = r.tipo_defeito;
                if (!tipoDefStats[td]) tipoDefStats[td] = { val: 0, count: 0 };
                tipoDefStats[td].val += (r.valor_medicao || 0);
                tipoDefStats[td].count += 1;
            }
        });
        const sortedTipoDef = Object.keys(tipoDefStats)
            .sort((a,b) => tipoDefStats[b].val - tipoDefStats[a].val)
            .slice(0, 10);
        const dataTipoDefVal = sortedTipoDef.map(k => tipoDefStats[k].val);

        const ctxTipoDef = document.getElementById('manut-chart-tipo-defeito')?.getContext('2d');
        if (ctxTipoDef) {
            if (chartTipoDefeito) chartTipoDefeito.destroy();
            chartTipoDefeito = new Chart(ctxTipoDef, {
                type: 'bar',
                data: {
                    labels: sortedTipoDef,
                    datasets: [{
                        label: 'Valor Medido (R$)',
                        data: dataTipoDefVal,
                        backgroundColor: '#0284c7',
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => {
                                    const labelKey = sortedTipoDef[ctx.dataIndex];
                                    const st = tipoDefStats[labelKey];
                                    return [
                                        ` Valor: ${formatCurrency(st.val)}`,
                                        ` Qtd: ${st.count.toLocaleString('pt-BR')} OFs`
                                    ];
                                }
                            }
                        },
                        datalabels: {
                            display: true,
                            color: '#ffffff',
                            anchor: 'end',
                            align: 'end',
                            font: { weight: 'bold', size: 10 },
                            formatter: (val) => formatSimpleNumber(val) // Sem R$: 900 mil, 585 mil, 1 mi
                        }
                    },
                    scales: {
                        x: { 
                            ticks: { 
                                color: '#94a3b8',
                                callback: (v) => formatShortCurrency(v)
                            }, 
                            grid: { color: gridColor }, 
                            grace: '20%' 
                        },
                        y: { ticks: { color: textColor, font: { weight: 'bold' } }, grid: { display: false } }
                    }
                },
                plugins: pluginsList
            });
        }

        // 5. GRÁFICO CAUSA DO DEFEITO - TOP 10 (SEM R$ NO DATALABEL)
        const causaDefStats = {};
        filteredData.forEach(r => {
            if (r.causa_defeito && r.causa_defeito !== '-') {
                const cd = r.causa_defeito;
                if (!causaDefStats[cd]) causaDefStats[cd] = { val: 0, count: 0 };
                causaDefStats[cd].val += (r.valor_medicao || 0);
                causaDefStats[cd].count += 1;
            }
        });
        const sortedCausaDef = Object.keys(causaDefStats)
            .sort((a,b) => causaDefStats[b].val - causaDefStats[a].val)
            .slice(0, 10);
        const dataCausaDefVal = sortedCausaDef.map(k => causaDefStats[k].val);

        const ctxCausaDef = document.getElementById('manut-chart-causa-defeito')?.getContext('2d');
        if (ctxCausaDef) {
            if (chartCausaDefeito) chartCausaDefeito.destroy();
            chartCausaDefeito = new Chart(ctxCausaDef, {
                type: 'bar',
                data: {
                    labels: sortedCausaDef,
                    datasets: [{
                        label: 'Valor Medido (R$)',
                        data: dataCausaDefVal,
                        backgroundColor: '#e67e22',
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => {
                                    const labelKey = sortedCausaDef[ctx.dataIndex];
                                    const st = causaDefStats[labelKey];
                                    return [
                                        ` Valor: ${formatCurrency(st.val)}`,
                                        ` Qtd: ${st.count.toLocaleString('pt-BR')} OFs`
                                    ];
                                }
                            }
                        },
                        datalabels: {
                            display: true,
                            color: '#ffffff',
                            anchor: 'end',
                            align: 'end',
                            font: { weight: 'bold', size: 10 },
                            formatter: (val) => formatSimpleNumber(val) // Sem R$: 900 mil, 585 mil, 1 mi
                        }
                    },
                    scales: {
                        x: { 
                            ticks: { 
                                color: '#94a3b8',
                                callback: (v) => formatShortCurrency(v)
                            }, 
                            grid: { color: gridColor }, 
                            grace: '20%' 
                        },
                        y: { ticks: { color: textColor, font: { weight: 'bold' } }, grid: { display: false } }
                    }
                },
                plugins: pluginsList
            });
        }
    }

    function renderTable() {
        const tbody = document.getElementById('manut-table-tbody');
        if (!tbody) return;

        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = filteredData.slice(start, end);

        if (pageItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 30px; color: #94a3b8;">Nenhum registro localizado.</td></tr>`;
            renderPagination(0);
            return;
        }

        tbody.innerHTML = pageItems.map(r => {
            const statusBadge = getStatusBadge(r.status);
            const valStr = r.valor_medicao > 0 ? formatCurrency(r.valor_medicao) : 'R$ 0,00';
            const mesPag = r.mes_pagamento && r.mes_pagamento !== '-' ? r.mes_pagamento : '-';

            return `
            <tr>
                <td style="font-weight: 700; color: #38ef7d;">${r.ral}</td>
                <td><span style="font-weight: 600; color: #f8fafc;">${r.tipo_atividade}</span></td>
                <td>${r.atividade}</td>
                <td>${r.localidade}</td>
                <td>${r.equipe}</td>
                <td>${statusBadge}</td>
                <td style="text-align: right; font-weight: 700; color: #38bdf8;">${valStr}</td>
                <td style="text-align: center; font-weight: 600; color: #cbd5e1;">${mesPag}</td>
                <td style="text-align: center;">
                    <button class="action-btn view-of-btn" data-ral="${r.ral}" title="Ver detalhes" style="background: rgba(2,132,199,0.15); color: #38bdf8; border: 1px solid rgba(2,132,199,0.3); padding: 5px 10px; border-radius: 6px; cursor: pointer;">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');

        renderPagination(filteredData.length);
        setupModalButtons();
    }

    function getStatusBadge(st) {
        switch (st) {
            case 'PEDIDO_GERADO': return `<span class="badge" style="background: rgba(168,85,247,0.2); color: #c084fc; border: 1px solid rgba(168,85,247,0.4); padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 11px;">PEDIDO GERADO</span>`;
            case 'APROVADO': return `<span class="badge" style="background: rgba(22,163,74,0.2); color: #4ade80; border: 1px solid rgba(22,163,74,0.4); padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 11px;">APROVADO</span>`;
            case 'AGUARD_APROVACAO': return `<span class="badge" style="background: rgba(245,158,11,0.2); color: #fbbf24; border: 1px solid rgba(245,158,11,0.4); padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 11px;">AGUARD. APROVAÇÃO</span>`;
            default: return `<span class="badge" style="background: rgba(148,163,184,0.2); color: #cbd5e1; border: 1px solid rgba(148,163,184,0.4); padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 11px;">${st || '-'}</span>`;
        }
    }

    function renderPagination(totalCount) {
        const container = document.getElementById('manut-pagination');
        if (!container) return;

        const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;
        container.innerHTML = `
            <div style="font-size: 13px; color: #94a3b8;">
                Exibindo página <strong>${currentPage}</strong> de <strong>${totalPages}</strong> (${totalCount} OSs no total)
            </div>
            <div style="display: flex; gap: 8px;">
                <button id="manut-prev-page" ${currentPage === 1 ? 'disabled' : ''} style="padding: 6px 14px; background: #1e293b; color: #f8fafc; border: 1px solid #334155; border-radius: 6px; cursor: pointer;">Anterior</button>
                <button id="manut-next-page" ${currentPage >= totalPages ? 'disabled' : ''} style="padding: 6px 14px; background: #1e293b; color: #f8fafc; border: 1px solid #334155; border-radius: 6px; cursor: pointer;">Próxima</button>
            </div>
        `;

        document.getElementById('manut-prev-page')?.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderTable();
            }
        });

        document.getElementById('manut-next-page')?.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderTable();
            }
        });
    }

    function setupModalButtons() {
        document.querySelectorAll('.view-of-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const ral = e.currentTarget.getAttribute('data-ral');
                const item = rawData.find(r => r.ral === ral);
                if (item) openOfModal(item);
            });
        });
    }

    function openOfModal(item) {
        let modal = document.getElementById('manut-modal-detail');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'manut-modal-detail';
            modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 9999; backdrop-filter: blur(4px);`;
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="background: #0f172a; border: 1px solid #334155; border-radius: 16px; padding: 24px 30px; width: 620px; max-width: 90%; max-height: 85vh; overflow-y: auto; color: #f8fafc; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 14px; margin-bottom: 18px;">
                    <h3 style="margin: 0; font-size: 18px; color: #38ef7d;">OS ${item.ral}</h3>
                    <button id="manut-close-modal" style="background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer;">&times;</button>
                </div>
                
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8; width: 40%;">Tipo de OF:</td><td style="font-weight: 700;">${item.tipo_of}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Tipo Atividade:</td><td style="font-weight: 700; color: #38bdf8;">${item.tipo_atividade}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Atividade:</td><td>${item.atividade}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Demanda / Integridade:</td><td style="font-weight: 700; color: #c084fc;">${item.demanda_integ}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Nº WF2 (Coluna T):</td><td style="font-weight: 700;">${item.wf2}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Observação Medição (Coluna U):</td><td>${item.obs_medicao}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Localidade:</td><td>${item.localidade}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Status Financeiro:</td><td>${getStatusBadge(item.legend_status)}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Equipe / Cluster:</td><td>${item.equipe}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Data Acionamento:</td><td>${item.data_acionamento}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Mês Base Pagamento:</td><td style="font-weight: 700; color: #38bdf8;">${item.mes_pagamento}</td></tr>
                    <tr><td style="padding: 8px 0; color: #94a3b8;">Valor Medido:</td><td style="font-weight: 700; color: #38ef7d;">${formatCurrency(item.valor_medicao)}</td></tr>
                </table>

                <div style="text-align: right; margin-top: 20px;">
                    <button onclick="document.getElementById('manut-modal-detail').remove()" style="background: #0284c7; color: #ffffff; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; cursor: pointer;">Fechar</button>
                </div>
            </div>
        `;

        document.getElementById('manut-close-modal')?.addEventListener('click', () => {
            modal.remove();
        });
    }

    // Auto-init when DOM ready or when navigation switches
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initManutencao);
    } else {
        initManutencao();
    }

    window.initManutencaoModule = initManutencao;
})();
