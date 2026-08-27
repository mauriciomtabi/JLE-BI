/**
 * tecnodrill_app.js
 * Módulo do Dashboard Financeiro Tecnodrill
 * 100% alinhado com a dinâmica, gráficos, mapa por UF e visual do JLE Financeiro.
 */

(function () {
    'use strict';

    window.tecnodrillDataLoaded = false;
    let tdAllTransactions = [];
    let tdFilteredTransactions = [];
    let tdCurrentPage = 1;
    const TD_PAGE_SIZE = 50;

    let tdCategoryFluxState = 'Saída';
    let tdActiveTab = 'indicators';
    let tdEvolutionGranularity = null; // 'monthly' | 'weekly' | 'daily'
    let tdCategoryDrillDown = { active: false, category: null };

    // Instâncias Chart.js
    let tdCharts = {
        evolution: null,
        customers: null,
        categories: null
    };

    // ──────────────────────────────────────────────
    // Accordion sidebar
    // ──────────────────────────────────────────────
    window.toggleNavGroup = function (groupId) {
        const toggle = document.getElementById(`nav-${groupId}-toggle`);
        const submenu = document.getElementById(`submenu-${groupId}`);
        if (!toggle || !submenu) return;
        const isOpen = submenu.classList.contains('open');
        if (isOpen) {
            submenu.classList.remove('open');
            toggle.classList.remove('open');
        } else {
            submenu.classList.add('open');
            toggle.classList.add('open');
        }
    };

    function openFinanceiroAccordion() {
        const submenu = document.getElementById('submenu-financeiro');
        const toggle = document.getElementById('nav-financeiro-toggle');
        if (submenu && !submenu.classList.contains('open')) {
            submenu.classList.add('open');
            if (toggle) toggle.classList.add('open');
        }
    }

    // ──────────────────────────────────────────────
    // Inicialização
    // ──────────────────────────────────────────────
    window.initTecnodrill = function () {
        if (!window.TECNODRILL_DATA) {
            console.warn('[Tecnodrill] window.TECNODRILL_DATA não disponível.');
            return;
        }
        tdAllTransactions = window.TECNODRILL_DATA.transactions || [];
        window.tecnodrillDataLoaded = true;

        openFinanceiroAccordion();
        populateTecnodrillMonthFilter();
        populateTecnodrillCategoryFilter();
        applyTecnodrillFilters();
    };

    // ──────────────────────────────────────────────
    // Filtros
    // ──────────────────────────────────────────────
    function populateTecnodrillMonthFilter() {
        const monthOrder = {
            'JANEIRO': 1, 'FEVEREIRO': 2, 'MARÇO': 3, 'ABRIL': 4,
            'MAIO': 5, 'JUNHO': 6, 'JULHO': 7, 'AGOSTO': 8,
            'SETEMBRO': 9, 'OUTUBRO': 10, 'NOVEMBRO': 11, 'DEZEMBRO': 12
        };
        const competencias = [...new Set(tdAllTransactions.map(t => t.competencia).filter(Boolean))];
        competencias.sort((a, b) => {
            const [ma, ya] = a.split('/');
            const [mb, yb] = b.split('/');
            return (parseInt(ya) - parseInt(yb)) || ((monthOrder[ma] || 0) - (monthOrder[mb] || 0));
        });
        const sel = document.getElementById('td-filter-mes');
        if (!sel) return;
        sel.innerHTML = '<option value="ALL">Todos os Meses</option>';
        competencias.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.text = c.charAt(0) + c.slice(1).toLowerCase();
            sel.appendChild(opt);
        });

        // Auto-selecionar mês atual se existir nos dados
        const now = new Date();
        const months = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
        const currentComp = `${months[now.getMonth()]}/${now.getFullYear()}`;
        if (competencias.includes(currentComp)) {
            sel.value = currentComp;
        } else if (competencias.length > 0) {
            sel.value = competencias[competencias.length - 1];
        }
    }

    function populateTecnodrillCategoryFilter() {
        const cats = [...new Set(tdAllTransactions.map(t => t.categoria).filter(c => c && c !== 'Saldo Inicial' && c !== 'N/D'))].sort();
        const sel = document.getElementById('td-filter-categoria');
        if (!sel) return;
        sel.innerHTML = '<option value="ALL">Todas as Categorias</option>';
        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.text = c;
            sel.appendChild(opt);
        });
    }

    function updateTecnodrillHeaderSubtitle() {
        const tdContainer = document.getElementById('view-tecnodrill-container');
        if (tdContainer && tdContainer.style.display === 'none') return;
        const subtitleEl = document.getElementById('view-subtitle');
        if (!subtitleEl) return;
        const sel = document.getElementById('td-filter-mes');
        const rawMesText = (sel && sel.selectedIndex >= 0) ? sel.options[sel.selectedIndex].text : '';
        const mesText = rawMesText.replace(/\s*\/\s*/g, '/');
        if (tdActiveTab === 'indicators') {
            subtitleEl.innerHTML = `Dashboard de Gestão e Análise de Indicadores.${mesText && mesText !== 'Todos os Meses' ? ' <span class="badge-competencia">COMPETÊNCIA: ' + mesText.toUpperCase() + '</span>' : ''}`;
        } else {
            subtitleEl.innerHTML = `Relação completa de transações com ferramentas de busca e auditoria${mesText && mesText !== 'Todos os Meses' ? ' <span class="badge-competencia">COMPETÊNCIA: ' + mesText.toUpperCase() + '</span>' : ''}`;
        }
    }

    window.applyTecnodrillFilters = function () {
        if (!window.tecnodrillDataLoaded) return;
        const mes = document.getElementById('td-filter-mes')?.value || 'ALL';
        const cat = document.getElementById('td-filter-categoria')?.value || 'ALL';
        const uf = document.getElementById('td-filter-uf')?.value || 'ALL';
        const di = document.getElementById('td-filter-data-inicio')?.value || '';
        const df = document.getElementById('td-filter-data-fim')?.value || '';

        tdFilteredTransactions = tdAllTransactions.filter(t => {
            if (mes !== 'ALL' && t.competencia !== mes) return false;
            if (cat !== 'ALL' && t.categoria !== cat) return false;
            if (uf !== 'ALL' && t.uf !== uf) return false;
            if (di && t.data < di) return false;
            if (df && t.data > df) return false;
            if (tdCategoryDrillDown.active && t.categoria !== tdCategoryDrillDown.category) return false;
            return true;
        });

        tdCurrentPage = 1;
        updateTecnodrillHeaderSubtitle();
        renderTecnodrillKPIs();
        renderTecnodrillCharts();
        if (tdActiveTab === 'transactions') renderTecnodrillTable();
    };

    window.clearTecnodrillDateRange = function () {
        const di = document.getElementById('td-filter-data-inicio');
        const df = document.getElementById('td-filter-data-fim');
        if (di) di.value = '';
        if (df) df.value = '';
        applyTecnodrillFilters();
    };

    // ──────────────────────────────────────────────
    // Utilitários de Formatação
    // ──────────────────────────────────────────────
    function formatCurrency(val) {
        return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatShortCurrencyNoR$(val) {
        const a = Math.abs(val);
        if (a >= 1000000) return (a / 1000000).toFixed(1).replace('.', ',') + 'M';
        if (a >= 1000) return (a / 1000).toFixed(0) + 'k';
        return a.toFixed(0);
    }

    function nonTransfer(txs) {
        if (!txs) return [];
        return txs.filter(t => !t.is_transfer && t.categoria !== 'Saldo Inicial');
    }

    // ──────────────────────────────────────────────
    // KPIs (Topo)
    // ──────────────────────────────────────────────
    function renderTecnodrillKPIs() {
        const txs = nonTransfer(tdFilteredTransactions);
        const entradas = txs.filter(t => t.fluxo === 'Entrada').reduce((s, t) => s + t.valor_nominal, 0);
        const saidas = txs.filter(t => t.fluxo === 'Saída').reduce((s, t) => s + t.valor_nominal, 0);
        const saldo = entradas - saidas;

        const transfTxs = tdFilteredTransactions.filter(t => t.is_transfer);
        const transfRec = transfTxs.filter(t => t.fluxo === 'Entrada').reduce((s, t) => s + t.valor_nominal, 0);
        const transfEnv = transfTxs.filter(t => t.fluxo === 'Saída').reduce((s, t) => s + t.valor_nominal, 0);
        const transfTotal = transfEnv > 0 ? transfEnv : transfRec;

        const dates = [...new Set(txs.map(t => t.data).filter(Boolean))];
        const dias = dates.length || 1;

        const kpiEntradas = document.getElementById('td-kpi-entradas');
        const kpiSaidas = document.getElementById('td-kpi-saidas');
        const kpiTransf = document.getElementById('td-kpi-transferencias');
        const kpiSaldo = document.getElementById('td-kpi-saldo-final');

        if (kpiEntradas) kpiEntradas.innerText = formatCurrency(entradas);
        if (kpiSaidas) kpiSaidas.innerText = formatCurrency(saidas);
        if (kpiTransf) kpiTransf.innerText = formatCurrency(transfTotal);
        if (kpiSaldo) kpiSaldo.innerText = formatCurrency(saldo);

        const subTransfRec = document.getElementById('td-sub-transf-rec');
        const subTransfEnv = document.getElementById('td-sub-transf-env');
        if (subTransfRec) subTransfRec.innerHTML = `Recebidas (+): <strong class="trend-up">${formatCurrency(transfRec)}</strong>`;
        if (subTransfEnv) subTransfEnv.innerHTML = `Enviadas (-): <strong class="trend-down">${formatCurrency(transfEnv)}</strong>`;

        const subEntradasDia = document.getElementById('td-sub-entradas-diaria');
        const subSaidasDia = document.getElementById('td-sub-saidas-diaria');
        const subSaidasComp = document.getElementById('td-sub-saidas-comp');
        const subSaldoSobra = document.getElementById('td-sub-saldo-sobra');

        if (subEntradasDia) subEntradasDia.innerText = `Média: ${formatCurrency(entradas / dias)}/dia`;
        if (subSaidasDia) subSaidasDia.innerText = `Média: ${formatCurrency(saidas / dias)}/dia`;

        const comp = entradas > 0 ? ((saidas / entradas) * 100).toFixed(1).replace('.', ',') : '0,0';
        if (subSaidasComp) subSaidasComp.innerText = `Comprometimento: ${comp}%`;

        const efic = entradas > 0 ? ((saldo / entradas) * 100).toFixed(1).replace('.', ',') : '0,0';
        if (subSaldoSobra) subSaldoSobra.innerText = `Eficiência: ${efic}%`;

        // vs. Mês Anterior
        const mesEl = document.getElementById('td-filter-mes');
        const subComp = document.getElementById('td-sub-entradas-comp');
        if (subComp && mesEl && mesEl.value !== 'ALL') {
            const monthOrderMap = {'JANEIRO':1,'FEVEREIRO':2,'MARÇO':3,'ABRIL':4,'MAIO':5,'JUNHO':6,'JULHO':7,'AGOSTO':8,'SETEMBRO':9,'OUTUBRO':10,'NOVEMBRO':11,'DEZEMBRO':12};
            const parts = mesEl.value.split('/');
            const mesNum = monthOrderMap[parts[0]] || 0;
            const prevMesNum = mesNum === 1 ? 12 : mesNum - 1;
            const prevAno = mesNum === 1 ? (parseInt(parts[1]) - 1) : parseInt(parts[1]);
            const prevMesNome = Object.keys(monthOrderMap).find(k => monthOrderMap[k] === prevMesNum) || '';
            const prevComp = `${prevMesNome}/${prevAno}`;

            const prevTxs = nonTransfer(tdAllTransactions.filter(t => t.competencia === prevComp));
            const prevEntradas = prevTxs.filter(t => t.fluxo === 'Entrada').reduce((s, t) => s + t.valor_nominal, 0);

            if (prevEntradas > 0) {
                const diff = ((entradas - prevEntradas) / prevEntradas * 100).toFixed(1).replace('.', ',');
                const sign = diff >= 0 ? '+' : '';
                subComp.innerText = `vs. Mês Ant.: ${sign}${diff}%`;
            } else {
                subComp.innerText = `vs. Mês Ant.: N/D`;
            }
        }
    }

    // ──────────────────────────────────────────────
    // Gráficos (Mesma lógica e palette visual do JLE)
    // ──────────────────────────────────────────────
    function destroyChart(key) {
        if (tdCharts[key]) {
            try { tdCharts[key].destroy(); } catch (e) {}
            tdCharts[key] = null;
        }
    }

    function renderTecnodrillCharts() {
        if (tdActiveTab !== 'indicators') return;
        renderTdEvolutionChart();
        renderTdCustomerChart();
        renderTdCategoryChart();
        renderTdUFMap();
    }

    // --- GRÁFICO 1: EVOLUÇÃO (Mensal, Semanal ou Diário) ---
    window.setTecnodrillEvolutionGranularity = function (g) {
        tdEvolutionGranularity = g;
        renderTdEvolutionChart();
    };

    function renderTdEvolutionChart() {
        destroyChart('evolution');
        const canvas = document.getElementById('td-chart-evolution');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const isDark = !document.body.classList.contains('light-theme');
        const gridColor = isDark ? '#20313f' : '#e0e6ed';
        const textColor = isDark ? '#8a99a8' : '#637381';

        const selectedMonth = document.getElementById('td-filter-mes')?.value || 'ALL';
        const isAllSelected = selectedMonth === 'ALL';
        const isMobile = window.innerWidth <= 768;

        let activeGranularity = tdEvolutionGranularity;
        if (isAllSelected) {
            activeGranularity = 'monthly';
            tdEvolutionGranularity = null;
        } else if (!activeGranularity) {
            activeGranularity = isMobile ? 'weekly' : 'daily';
        }

        const controlsContainer = document.getElementById('td-evolution-chart-controls');
        if (controlsContainer) {
            controlsContainer.innerHTML = `
                <button class="chart-toggle-btn ${activeGranularity === 'monthly' ? 'active' : ''}" 
                        onclick="setTecnodrillEvolutionGranularity('monthly')">
                    Mensal
                </button>
                <button class="chart-toggle-btn ${activeGranularity === 'weekly' ? 'active' : ''}" 
                        ${isAllSelected ? 'disabled style="opacity: 0.35; pointer-events: none;"' : ''} 
                        onclick="setTecnodrillEvolutionGranularity('weekly')">
                    Semanal
                </button>
                <button class="chart-toggle-btn ${activeGranularity === 'daily' ? 'active' : ''}" 
                        ${isAllSelected ? 'disabled style="opacity: 0.35; pointer-events: none;"' : ''} 
                        onclick="setTecnodrillEvolutionGranularity('daily')">
                    Diário
                </button>
            `;
        }

        const titleEl = document.getElementById('td-evolution-chart-title');
        let chartLabels = [];
        let chartEntradas = [];
        let chartSaidas = [];

        if (activeGranularity === 'monthly') {
            if (titleEl) titleEl.innerText = isAllSelected ? 'Evolução de Fluxo Mensal' : `Evolução de Fluxo Mensal (Visão Geral)`;

            const monthOrderMap = {'JANEIRO':1,'FEVEREIRO':2,'MARÇO':3,'ABRIL':4,'MAIO':5,'JUNHO':6,'JULHO':7,'AGOSTO':8,'SETEMBRO':9,'OUTUBRO':10,'NOVEMBRO':11,'DEZEMBRO':12};
            const months = [...new Set(tdAllTransactions.map(t => t.competencia))]
                .filter(m => m && m !== 'N/D')
                .sort((a, b) => {
                    const pa = a.split('/'); const pb = b.split('/');
                    return (parseInt(pa[1]) - parseInt(pb[1])) || ((monthOrderMap[pa[0]] || 0) - (monthOrderMap[pb[0]] || 0));
                });

            const catVal = document.getElementById('td-filter-categoria')?.value || 'ALL';
            const ufVal = document.getElementById('td-filter-uf')?.value || 'ALL';

            const filteredForEvolution = tdAllTransactions.filter(t => {
                if (t.is_transfer || t.categoria === 'Saldo Inicial') return false;
                if (catVal !== 'ALL' && t.categoria !== catVal) return false;
                if (ufVal !== 'ALL' && t.uf !== ufVal) return false;
                return true;
            });

            chartEntradas = new Array(months.length).fill(0);
            chartSaidas = new Array(months.length).fill(0);

            filteredForEvolution.forEach(t => {
                const idx = months.indexOf(t.competencia);
                if (idx !== -1) {
                    if (t.fluxo === 'Entrada') chartEntradas[idx] += t.valor_nominal;
                    else if (t.fluxo === 'Saída') chartSaidas[idx] += t.valor_nominal;
                }
            });

            const shortMonthsMap = {'JANEIRO':'Jan','FEVEREIRO':'Fev','MARÇO':'Mar','ABRIL':'Abr','MAIO':'Mai','JUNHO':'Jun','JULHO':'Jul','AGOSTO':'Ago','SETEMBRO':'Set','OUTUBRO':'Out','NOVEMBRO':'Nov','DEZEMBRO':'Dez'};
            chartLabels = months.map(m => {
                const p = m.split('/');
                return `${shortMonthsMap[p[0]] || p[0]}/${(p[1] || '').slice(-2)}`;
            });
        } else {
            const isWeekly = activeGranularity === 'weekly';
            if (titleEl) titleEl.innerText = isWeekly ? `Evolução de Fluxo Semanal - ${selectedMonth}` : `Evolução de Fluxo Diário - ${selectedMonth}`;

            const daysInMonth = {'JANEIRO':31,'FEVEREIRO':28,'MARÇO':31,'ABRIL':30,'MAIO':31,'JUNHO':30,'JULHO':31,'AGOSTO':31,'SETEMBRO':30,'OUTUBRO':31,'NOVEMBRO':30,'DEZEMBRO':31};
            const [mName] = selectedMonth.split('/');
            const maxDays = daysInMonth[mName] || 31;
            const dailyE = Array(maxDays).fill(0);
            const dailyS = Array(maxDays).fill(0);

            nonTransfer(tdFilteredTransactions).forEach(t => {
                if (t.data) {
                    const parts = t.data.split('-');
                    if (parts.length === 3) {
                        const day = parseInt(parts[2]);
                        if (day >= 1 && day <= maxDays) {
                            if (t.fluxo === 'Entrada') dailyE[day - 1] += t.valor_nominal;
                            else if (t.fluxo === 'Saída') dailyS[day - 1] += t.valor_nominal;
                        }
                    }
                }
            });

            if (isWeekly) {
                const numWeeks = Math.ceil(maxDays / 7);
                chartLabels = Array.from({ length: numWeeks }, (_, i) => `Semana ${i + 1}`);
                chartEntradas = Array(numWeeks).fill(0);
                chartSaidas = Array(numWeeks).fill(0);
                for (let d = 1; d <= maxDays; d++) {
                    const wIdx = Math.min(Math.floor((d - 1) / 7), numWeeks - 1);
                    chartEntradas[wIdx] += dailyE[d - 1];
                    chartSaidas[wIdx] += dailyS[d - 1];
                }
            } else {
                chartLabels = Array.from({ length: maxDays }, (_, i) => (i + 1).toString());
                chartEntradas = dailyE;
                chartSaidas = dailyS;
            }
        }

        tdCharts.evolution = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartLabels,
                datasets: [
                    {
                        label: 'Entradas',
                        data: chartEntradas,
                        backgroundColor: '#004f71',
                        borderColor: '#004f71',
                        borderRadius: 3
                    },
                    {
                        label: 'Saídas',
                        data: chartSaidas,
                        backgroundColor: '#f39f18',
                        borderColor: '#f39f18',
                        borderRadius: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: textColor, font: { family: 'Outfit', size: 11 } }
                    },
                    datalabels: {
                        display: ctx => ctx.dataset.data[ctx.dataIndex] > 0,
                        align: 'end',
                        anchor: 'end',
                        color: textColor,
                        font: { family: 'Outfit', size: 9, weight: 'bold' },
                        formatter: val => formatShortCurrencyNoR$(val)
                    }
                },
                scales: {
                    x: { grid: { color: 'transparent' }, ticks: { color: textColor } },
                    y: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, callback: v => formatShortCurrencyNoR$(v) },
                        grace: '25%'
                    }
                }
            }
        });
    }

    // --- GRÁFICO 2: RECEITA POR CLIENTE (Rosca) ---
    function renderTdCustomerChart() {
        destroyChart('customers');
        const canvas = document.getElementById('td-chart-customers');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const isDark = !document.body.classList.contains('light-theme');
        const textColor = isDark ? '#8a99a8' : '#637381';

        const titleEl = document.getElementById('td-customers-chart-title');
        if (titleEl) titleEl.innerText = 'Receita por Cliente (Cobranças)';

        // Considerar APENAS 'Cobranças' e 'Outros Recebimentos' sob o fluxo 'Entrada'
        const txs = tdFilteredTransactions.filter(t => 
            t.fluxo === 'Entrada' && 
            (t.categoria === 'Cobranças' || t.categoria === 'Outros Recebimentos')
        );

        const customerSum = {};
        txs.forEach(t => {
            const clientName = (t.descricao && t.descricao.trim()) ? t.descricao.trim().toUpperCase() : 'OUTROS';
            customerSum[clientName] = (customerSum[clientName] || 0) + t.valor_nominal;
        });

        const sortedCustomers = Object.keys(customerSum)
            .map(c => ({ name: c, value: customerSum[c] }))
            .sort((a, b) => b.value - a.value);

        if (!sortedCustomers.length) return;

        function abbrevClient(name) {
            let s = name
                .replace(/\s+LTDA\.?$/i, '')
                .replace(/\s+ME\.?$/i, '')
                .replace(/\s+EPP\.?$/i, '')
                .replace(/\s+S\/A\.?$/i, '')
                .replace(/\s+S\.A\.?$/i, '')
                .replace(/\s+BRASIL$/i, '')
                .replace(/\s+BR$/i, '')
                .trim();
            s = s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
            return s.length > 15 ? s.substring(0, 14) + '…' : s;
        }

        const chartLabels = sortedCustomers.map(c => abbrevClient(c.name));
        const chartData = sortedCustomers.map(c => c.value);
        const totalSum = chartData.reduce((sum, val) => sum + val, 0);

        // Fatia visual mínima de 2.5%
        const MIN_PCT = 0.025;
        const minSliceVal = totalSum * MIN_PCT;
        let totalBorrowed = 0;
        const chartDataDisplay = chartData.map(v => {
            if (v > 0 && v < minSliceVal) { totalBorrowed += minSliceVal - v; return minSliceVal; }
            return v;
        });
        if (totalBorrowed > 0) {
            const bigSum = chartData.reduce((s, v) => v >= minSliceVal ? s + v : s, 0);
            for (let i = 0; i < chartDataDisplay.length; i++) {
                if (chartData[i] >= minSliceVal && bigSum > 0)
                    chartDataDisplay[i] -= (chartData[i] / bigSum) * totalBorrowed;
            }
        }

        const colorPalette = [
            '#004f71', '#ffb83d', '#7209b7', '#00b4d8', 
            '#ff4d6d', '#2ecc71', '#f72585', '#4cc9f0',
            '#f39f18', '#9b59b6', '#1abc9c', '#e74c3c'
        ];

        const centerTextPlugin = {
            id: 'tdCenterText',
            afterDraw: function(chart) {
                const chartArea = chart.chartArea;
                if (!chartArea) return;
                const centerX = (chartArea.left + chartArea.right) / 2;
                const centerY = (chartArea.top + chartArea.bottom) / 2;
                const cCtx = chart.ctx;
                
                cCtx.save();
                
                const isDarkTheme = !document.body.classList.contains('light-theme');
                const textSec = isDarkTheme ? '#8a99a8' : '#637381';
                const textPri = isDarkTheme ? '#f5f6f8' : '#1f2c3d';
                
                const innerRadius = chart.innerRadius || 60;
                
                const textValue = formatCurrency(totalSum);
                let valueFontSize = innerRadius * 0.32;
                cCtx.font = `700 ${valueFontSize}px Outfit, sans-serif`;
                
                const maxTextWidth = innerRadius * 2 * 0.85;
                while (cCtx.measureText(textValue).width > maxTextWidth && valueFontSize > 10) {
                    valueFontSize -= 1;
                    cCtx.font = `700 ${valueFontSize}px Outfit, sans-serif`;
                }
                
                const labelFontSize = Math.max(9, valueFontSize * 0.50);
                
                cCtx.textAlign = 'center';
                cCtx.textBaseline = 'middle';
                
                cCtx.font = `700 ${valueFontSize}px Outfit, sans-serif`;
                cCtx.fillStyle = textPri;
                cCtx.fillText(textValue, centerX, centerY - (labelFontSize * 0.15));
                
                cCtx.font = `600 ${labelFontSize}px Outfit, sans-serif`;
                cCtx.fillStyle = textSec;
                cCtx.fillText("FATURAMENTO", centerX, centerY + (valueFontSize * 0.70));
                
                cCtx.restore();
            }
        };

        tdCharts.customers = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: chartLabels,
                datasets: [{
                    data: chartDataDisplay,
                    backgroundColor: colorPalette.slice(0, chartLabels.length),
                    borderColor: isDark ? '#0d1b26' : '#f5f6f8',
                    borderWidth: 1.5,
                    spacing: 2.5,
                    borderRadius: 4,
                    hoverOffset: 8,
                    hoverBorderColor: '#ffffff',
                    hoverBorderWidth: 2
                }]
            },
            plugins: [centerTextPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        align: 'center',
                        labels: {
                            color: textColor,
                            usePointStyle: true,
                            pointStyle: 'rectRounded',
                            boxWidth: 16,
                            boxHeight: 8,
                            padding: 16,
                            font: { family: 'Outfit', size: 11 }
                        }
                    },
                    datalabels: {
                        display: (context) => {
                            const realVal = chartData[context.dataIndex] || 0;
                            const pct = totalSum > 0 ? (realVal / totalSum) * 100 : 0;
                            return pct >= 5;
                        },
                        color: '#ffffff',
                        font: { family: 'Outfit', size: 10, weight: 'bold' },
                        textStrokeColor: 'rgba(0, 0, 0, 0.4)',
                        textStrokeWidth: 2,
                        formatter: (value, context) => {
                            const realVal = chartData[context.dataIndex] || 0;
                            const pct = totalSum > 0 ? (realVal / totalSum) * 100 : 0;
                            return pct.toFixed(1).replace('.', ',') + '%';
                        }
                    },
                    tooltip: {
                        position: 'cursor',
                        callbacks: {
                            label: (context) => {
                                const realVal = chartData[context.dataIndex];
                                const pct = totalSum > 0 ? (realVal / totalSum) * 100 : 0;
                                return ` ${context.label}: ${formatCurrency(realVal)} (${pct.toFixed(1).replace('.', ',')}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // --- GRÁFICO 3: CATEGORIAS DE DESPESA / RECEITA (Barra Horizontal + Drilldown) ---
    window.setTecnodrillCategoryFlux = function (flux) {
        tdCategoryFluxState = flux;
        document.getElementById('td-btn-toggle-saidas').style.backgroundColor = flux === 'Saída' ? 'var(--color-secondary)' : 'transparent';
        document.getElementById('td-btn-toggle-saidas').style.color = flux === 'Saída' ? 'white' : 'var(--text-secondary)';
        document.getElementById('td-btn-toggle-entradas').style.backgroundColor = flux === 'Entrada' ? 'var(--color-secondary)' : 'transparent';
        document.getElementById('td-btn-toggle-entradas').style.color = flux === 'Entrada' ? 'white' : 'var(--text-secondary)';
        renderTdCategoryChart();
    };

    window.resetTecnodrillCategoryChart = function () {
        tdCategoryDrillDown.active = false;
        tdCategoryDrillDown.category = null;
        applyTecnodrillFilters();
    };

    function renderTdCategoryChart() {
        destroyChart('categories');
        const canvas = document.getElementById('td-chart-categories');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const isDark = !document.body.classList.contains('light-theme');
        const gridColor = isDark ? '#20313f' : '#e0e6ed';
        const textColor = isDark ? '#8a99a8' : '#637381';

        const isSaida = tdCategoryFluxState === 'Saída';
        const fluxLabel = isSaida ? 'Despesas (Saídas)' : 'Receitas (Entradas)';
        const barColor = isSaida ? 'rgba(243, 159, 24, 0.85)' : 'rgba(0, 79, 113, 0.85)';
        const barBorderColor = isSaida ? '#f39f18' : '#004f71';

        let chartLabels = [];
        let chartData = [];

        if (tdCategoryDrillDown.active) {
            const targetCat = tdCategoryDrillDown.category;
            const titleEl = document.getElementById('td-categories-chart-title');
            if (titleEl) titleEl.innerText = `${isSaida ? 'Despesas' : 'Receitas'}: ${targetCat}`;

            const backContainer = document.getElementById('td-categories-back-container');
            if (backContainer) {
                backContainer.innerHTML = `
                    <button class="btn-chart-back" onclick="resetTecnodrillCategoryChart()">
                        <i class="fa-solid fa-arrow-left"></i> Voltar
                    </button>
                `;
            }

            const descSum = {};
            nonTransfer(tdFilteredTransactions).forEach(t => {
                if (t.fluxo === tdCategoryFluxState && t.categoria === targetCat) {
                    descSum[t.descricao] = (descSum[t.descricao] || 0) + t.valor_nominal;
                }
            });

            const sorted = Object.entries(descSum).sort((a, b) => b[1] - a[1]);
            chartLabels = sorted.map(([k]) => k);
            chartData = sorted.map(([, v]) => v);
        } else {
            const titleEl = document.getElementById('td-categories-chart-title');
            if (titleEl) titleEl.innerText = fluxLabel;

            const backContainer = document.getElementById('td-categories-back-container');
            if (backContainer) backContainer.innerHTML = '';

            const catSum = {};
            nonTransfer(tdFilteredTransactions).forEach(t => {
                if (t.fluxo === tdCategoryFluxState) {
                    catSum[t.categoria] = (catSum[t.categoria] || 0) + t.valor_nominal;
                }
            });

            const sorted = Object.entries(catSum).sort((a, b) => b[1] - a[1]);
            chartLabels = sorted.map(([k]) => k);
            chartData = sorted.map(([, v]) => v);
        }

        const N = chartLabels.length;
        const wrapperHeight = Math.max(380, N * 35);
        const scrollWrapper = document.getElementById('td-categories-scroll-wrapper');
        if (scrollWrapper) scrollWrapper.style.height = wrapperHeight + 'px';

        const totalSum = chartData.reduce((s, v) => s + v, 0);

        tdCharts.categories = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartLabels,
                datasets: [{
                    label: isSaida ? 'Total Pago (R$)' : 'Total Recebido (R$)',
                    data: chartData,
                    backgroundColor: barColor,
                    borderColor: barBorderColor,
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                onHover: (event, chartElement) => {
                    event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
                },
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        display: true,
                        align: 'end',
                        anchor: 'end',
                        color: textColor,
                        font: { family: 'Outfit', size: 10, weight: 'bold' },
                        formatter: val => {
                            const pct = totalSum > 0 ? (val / totalSum) * 100 : 0;
                            return `${formatShortCurrencyNoR$(val)} (${pct.toFixed(1).replace('.', ',')}%)`;
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const val = ctx.raw;
                                const pct = totalSum > 0 ? (val / totalSum) * 100 : 0;
                                return ` ${formatCurrency(val)} (${pct.toFixed(1).replace('.', ',')}%)`;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => formatShortCurrencyNoR$(v) }, grace: '25%' },
                    y: {
                        grid: { color: 'transparent' },
                        ticks: {
                            color: textColor, font: { size: 11 },
                            callback: function (val) {
                                const l = this.getLabelForValue(val);
                                return (l && l.length > 25) ? l.substring(0, 22) + '...' : l;
                            }
                        }
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0 && !tdCategoryDrillDown.active) {
                        const clickedCat = tdCharts.categories.data.labels[elements[0].index];
                        tdCategoryDrillDown.active = true;
                        tdCategoryDrillDown.category = clickedCat;
                        applyTecnodrillFilters();
                    }
                }
            }
        });
    }

    // --- GRÁFICO 4: MAPA CHOROPLETH DE UFs (RS, SC, PR) ---
    function renderTdUFMap() {
        const mapContainer = document.getElementById('td-map-container');
        if (!mapContainer) return;

        const mapTransactions = nonTransfer(tdFilteredTransactions);

        const ufMetrics = {
            "PR": { entradas: 0, saidas: 0, txCount: 0 },
            "SC": { entradas: 0, saidas: 0, txCount: 0 },
            "RS": { entradas: 0, saidas: 0, txCount: 0 }
        };

        mapTransactions.forEach(t => {
            const uf = t.uf || 'RS';
            if (ufMetrics.hasOwnProperty(uf)) {
                ufMetrics[uf].txCount++;
                if (t.fluxo === 'Entrada') ufMetrics[uf].entradas += t.valor_nominal;
                else if (t.fluxo === 'Saída') ufMetrics[uf].saidas += t.valor_nominal;
            }
        });

        const volumes = Object.keys(ufMetrics).map(k => ufMetrics[k].saidas + ufMetrics[k].entradas);
        const maxVolume = Math.max(...volumes, 1);

        const getColorForUF = (ufCode) => {
            const vol = ufMetrics[ufCode].saidas + ufMetrics[ufCode].entradas;
            const opacity = 0.2 + 0.75 * (vol / maxVolume);
            return `rgba(0, 79, 113, ${opacity})`;
        };

        const filterUf = document.getElementById('td-filter-uf')?.value || 'ALL';

        const isSelectPR = filterUf === 'PR' ? 'active' : (filterUf !== 'ALL' ? 'dimmed' : '');
        const isSelectSC = filterUf === 'SC' ? 'active' : (filterUf !== 'ALL' ? 'dimmed' : '');
        const isSelectRS = filterUf === 'RS' ? 'active' : (filterUf !== 'ALL' ? 'dimmed' : '');

        mapContainer.innerHTML = `
            <div class="uf-premium-container">
                <div class="uf-map-side">
                    <svg class="map-svg-centered" viewBox="125 242 136 136" style="overflow: visible;">
                        <polygon class="map-state ${isSelectPR}" id="td-state-PR" points="
                            234.456,277.734 235.218,274.689 232.173,276.213 229.318,273.357 228.368,269.744 224.942,269.172 221.898,269.363
                            220.375,266.127 220.757,263.463 220.945,258.326 218.663,256.424 212.384,257.186 207.056,254.33 203.061,254.33 202.109,254.33
                            201.158,252.809 199.635,253.189 196.591,253.949 193.356,254.141 190.407,253.475 186.887,256.709 185.364,259.564
                            184.604,263.369 183.556,265.082 180.196,265.885 177.763,274.082 177.664,278.756 176.28,281.801 182.956,283.033
                            184.454,288.203 183.603,290.621 186.648,288.984 189.502,290.197 192.356,289.484 193.927,291.41 196.425,291.34
                            199.706,292.695 204.844,293.695 206.058,292.98 205.985,291.197 207.199,289.414 212.052,286.273 214.478,286.844
                            217.401,286.346 220.686,288.344 224.823,285.988 228.248,287.129 230.233,287.793 230.184,284.873 229.085,284.475
                            230.033,284.375 231.132,282.336 232.28,281.49 231.682,281.291 231.082,281.49 231.032,280.943 229.585,281.043 229.085,281.143
                            229.385,280.695 228.485,279.9 229.934,280.396 230.482,280.098 230.932,279.6 231.381,278.807 231.932,279.004
                            232.33,278.705 232.28,279.502 232.879,279.9 233.478,279.451 233.777,279.65 233.029,280.297 233.129,281.143 233.528,281.094
                            234.377,279.65 236.125,278.635" 
                            style="fill: ${getColorForUF('PR')};"
                            onclick="toggleTecnodrillUF('PR')">
                        </polygon>
                        <text class="map-label ${isSelectPR}" x="205" y="272" style="font-size: 3.5px;" onclick="toggleTecnodrillUF('PR')">PR</text>

                        <polygon class="map-state ${isSelectSC}" id="td-state-SC" points="
                            224.823,285.988 220.686,288.344 217.401,286.346 214.478,286.844 212.052,286.273 207.199,289.414 205.985,291.197
                            206.058,292.98 204.844,293.695 199.706,292.695 196.425,291.34 193.927,291.41 192.356,289.484 189.502,290.197 186.648,288.984
                            183.603,290.621 185.153,294.27 183.62,298.275 185.364,298.57 188.98,298.191 192.976,298.191 196.211,298.762 198.873,300.379
                            201.348,301.615 205.153,302.566 207.342,303.613 209.054,306.941 211.053,310.463 213.052,312.271 214.478,312.271
                            216.569,311.32 218.378,310.844 219.71,311.795 219.899,313.508 217.235,316.076 214.667,320.357 215.714,320.738 217.33,319.502
                            218.663,320.547 226.838,312.867 227.688,313.016 228.336,312.471 227.937,311.176 228.186,310.182 229.285,309.934
                            229.435,308.641 229.885,308.59 229.535,310.133 229.834,309.982 230.282,307.746 230.333,305.807 230.184,305.605
                            230.433,304.465 229.834,302.873 230.033,301.68 230.433,301.23 229.834,300.834 229.885,300.039 230.732,299.691
                            230.832,299.393 230.533,298.893 231.432,298.348 231.932,298.646 232.33,298.1 231.381,297.203 231.032,297.75 230.533,297.551
                            230.732,296.756 230.184,296.707 230.033,295.762 230.533,294.867 229.783,294.619 229.634,292.777 230.083,290.689
                            229.285,289.496 228.535,289.695 227.786,289.545 228.685,288.998 227.837,287.955 229.034,288.75 230.233,287.793
                            228.248,287.129" 
                            style="fill: ${getColorForUF('SC')};"
                            onclick="toggleTecnodrillUF('SC')">
                        </polygon>
                        <text class="map-label ${isSelectSC}" x="215" y="298" style="font-size: 3.5px;" onclick="toggleTecnodrillUF('SC')">SC</text>

                        <polygon class="map-state ${isSelectRS}" id="td-state-RS" points="
                            215.714,320.738 214.667,320.357 217.235,316.076 219.899,313.508 219.71,311.795 218.378,310.844 216.569,311.32
                            214.478,312.271 213.052,312.271 211.053,310.463 209.054,306.941 207.342,303.613 205.153,302.566 201.348,301.615
                            198.873,300.379 196.211,298.762 192.976,298.191 188.98,298.191 185.364,298.57 183.62,298.275 171.023,304.363 165.032,310.133
                            159.191,319.432 151.903,325.398 150.604,328.383 155.53,328.646 158.924,331.697 161.122,332.293 161.988,334.215
                            163.452,335.875 163.384,336.668 164.583,337.729 165.981,336.934 166.381,335.875 168.843,335.807 171.04,338.459
                            180.825,347.012 183.354,347.674 189.013,354.637 186.883,359.477 187.082,362.857 185.951,366.57 186.449,367.764
                            187.647,364.881 192.641,360.205 195.536,356.029 197.033,350.758 200.129,348.77 199.829,348.371 198.532,348.869
                            198.432,347.773 199.629,347.477 197.934,346.879 198.232,346.082 199.23,345.984 199.829,344.988 200.129,342.803
                            201.527,341.707 202.725,341.906 203.125,340.613 203.724,340.912 203.923,338.027 205.021,336.535 205.121,337.631
                            205.722,335.74 206.818,334.547 206.818,333.752 205.121,333.156 205.021,332.559 205.621,331.762 206.021,332.758
                            207.019,333.254 208.616,333.156 209.614,331.861 211.612,331.166 212.012,333.254 211.312,333.553 211.212,332.857
                            210.612,332.758 210.812,336.535 209.314,337.232 209.216,338.027 208.117,338.525 207.917,341.111 206.52,342.305
                            205.321,342.404 203.623,345.189 202.825,345.189 202.226,346.184 200.629,345.785 200.329,346.283 201.028,347.277
                            200.43,348.172 200.828,348.57 201.327,347.477 204.822,345.389 211.312,338.824 211.312,338.824 216.604,326.889 218.351,320.922
                            218.663,320.547 217.33,319.502" 
                            style="fill: ${getColorForUF('RS')};"
                            onclick="toggleTecnodrillUF('RS')">
                        </polygon>
                        <text class="map-label ${isSelectRS}" x="186" y="335" style="font-size: 3.5px;" onclick="toggleTecnodrillUF('RS')">RS</text>
                    </svg>
                </div>

                <div class="uf-compact-card pr-card ${isSelectPR}" onclick="toggleTecnodrillUF('PR')">
                    <div class="uf-compact-header">
                        <span class="uf-compact-name"><span class="uf-status-indicator pr-dot"></span><strong>Paraná</strong></span>
                    </div>
                    <div class="uf-compact-content">
                        <div class="uf-compact-main-stat">
                            <span class="uf-stat-label"><i class="fa-solid fa-list-ol"></i> Lançamentos</span>
                            <span class="uf-stat-value">${ufMetrics['PR'].txCount}</span>
                        </div>
                        <div class="uf-compact-sub-stats">
                            <div class="uf-sub-stat success">
                                <span class="uf-sub-val success">${formatCurrency(ufMetrics['PR'].entradas)}</span>
                            </div>
                            <div class="uf-sub-stat danger">
                                <span class="uf-sub-val danger">${formatCurrency(ufMetrics['PR'].saidas)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="uf-compact-card sc-card ${isSelectSC}" onclick="toggleTecnodrillUF('SC')">
                    <div class="uf-compact-header">
                        <span class="uf-compact-name"><span class="uf-status-indicator sc-dot"></span><strong>Santa Catarina</strong></span>
                    </div>
                    <div class="uf-compact-content">
                        <div class="uf-compact-main-stat">
                            <span class="uf-stat-label"><i class="fa-solid fa-list-ol"></i> Lançamentos</span>
                            <span class="uf-stat-value">${ufMetrics['SC'].txCount}</span>
                        </div>
                        <div class="uf-compact-sub-stats">
                            <div class="uf-sub-stat success">
                                <span class="uf-sub-val success">${formatCurrency(ufMetrics['SC'].entradas)}</span>
                            </div>
                            <div class="uf-sub-stat danger">
                                <span class="uf-sub-val danger">${formatCurrency(ufMetrics['SC'].saidas)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="uf-compact-card rs-card ${isSelectRS}" onclick="toggleTecnodrillUF('RS')">
                    <div class="uf-compact-header">
                        <span class="uf-compact-name"><span class="uf-status-indicator rs-dot"></span><strong>Rio Grande do Sul</strong></span>
                    </div>
                    <div class="uf-compact-content">
                        <div class="uf-compact-main-stat">
                            <span class="uf-stat-label"><i class="fa-solid fa-list-ol"></i> Lançamentos</span>
                            <span class="uf-stat-value">${ufMetrics['RS'].txCount}</span>
                        </div>
                        <div class="uf-compact-sub-stats">
                            <div class="uf-sub-stat success">
                                <span class="uf-sub-val success">${formatCurrency(ufMetrics['RS'].entradas)}</span>
                            </div>
                            <div class="uf-sub-stat danger">
                                <span class="uf-sub-val danger">${formatCurrency(ufMetrics['RS'].saidas)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    window.toggleTecnodrillUF = function (ufCode) {
        const ufSel = document.getElementById('td-filter-uf');
        if (!ufSel) return;
        if (ufSel.value === ufCode) {
            ufSel.value = 'ALL';
        } else {
            ufSel.value = ufCode;
        }
        applyTecnodrillFilters();
    };

    // ──────────────────────────────────────────────
    // Tabela de Lançamentos
    // ──────────────────────────────────────────────
    window.switchTecnodrillTab = function (tab) {
        tdActiveTab = tab;
        document.getElementById('td-subview-indicators').style.display = tab === 'indicators' ? 'block' : 'none';
        document.getElementById('td-subview-transactions').style.display = tab === 'transactions' ? 'block' : 'none';
        document.getElementById('td-tab-btn-indicators').classList.toggle('active', tab === 'indicators');
        document.getElementById('td-tab-btn-transactions').classList.toggle('active', tab === 'transactions');
        updateTecnodrillHeaderSubtitle();
        if (tab === 'indicators') {
            window.dispatchEvent(new Event('resize'));
            renderTecnodrillCharts();
        } else {
            renderTecnodrillTable();
        }
    };

    function renderTecnodrillTable() {
        const tbody = document.getElementById('td-table-body');
        if (!tbody) return;

        const search = (document.getElementById('td-table-search')?.value || '').toLowerCase();
        let txs = tdFilteredTransactions;
        if (search) {
            txs = txs.filter(t =>
                (t.descricao || '').toLowerCase().includes(search) ||
                (t.categoria || '').toLowerCase().includes(search)
            );
        }

        const total = txs.length;
        const start = (tdCurrentPage - 1) * TD_PAGE_SIZE;
        const pageData = txs.slice(start, start + TD_PAGE_SIZE);

        const infoEl = document.getElementById('td-pagination-info');
        if (infoEl) infoEl.innerText = `Mostrando ${start + 1}-${Math.min(start + TD_PAGE_SIZE, total)} de ${total} transações`;

        const prevBtn = document.getElementById('td-pagination-prev');
        const nextBtn = document.getElementById('td-pagination-next');
        if (prevBtn) prevBtn.disabled = tdCurrentPage <= 1;
        if (nextBtn) nextBtn.disabled = start + TD_PAGE_SIZE >= total;

        tbody.innerHTML = pageData.map(t => {
            const isEntrada = t.fluxo === 'Entrada';
            const color = isEntrada ? '#2ecc71' : '#e74c3c';
            const [y, m, d] = (t.data || '').split('-');
            const dataFmt = (y && m && d) ? `${d}/${m}/${y}` : t.data || '';
            return `<tr>
                <td>${dataFmt}</td>
                <td>${t.banco || ''}</td>
                <td>${t.competencia || ''}</td>
                <td><span style="color:${color}; font-weight:600;">${t.fluxo || ''}</span></td>
                <td>${t.categoria || ''}</td>
                <td>${t.descricao || ''}</td>
                <td style="text-align:right; color:${color}; font-weight:600;">${formatCurrency(t.valor_nominal)}</td>
                <td>${t.meio_pagamento || ''}</td>
            </tr>`;
        }).join('');
    }

    window.handleTecnodrillSearch = function () {
        tdCurrentPage = 1;
        renderTecnodrillTable();
    };

    window.changeTecnodrillPage = function (dir) {
        tdCurrentPage += dir;
        renderTecnodrillTable();
    };

    window.exportTecnodrillToXLSX = function () {
        if (typeof XLSX === 'undefined') { alert('Biblioteca XLSX não disponível.'); return; }
        const data = tdFilteredTransactions.map(t => ({
            Data: t.data || '',
            Banco: t.banco || '',
            Competência: t.competencia || '',
            Fluxo: t.fluxo || '',
            Categoria: t.categoria || '',
            Descrição: t.descricao || '',
            Valor: t.valor_nominal || 0,
            'Meio de Pagamento': t.meio_pagamento || ''
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Tecnodrill');
        XLSX.writeFile(wb, `Tecnodrill_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    // Override de switchView para manter accordion sincronizado
    const origSwitchView = window.switchView;
    if (typeof origSwitchView === 'function') {
        window.switchView = function (viewName) {
            origSwitchView(viewName);
            if (viewName === 'dashboard' || viewName === 'tecnodrill') {
                openFinanceiroAccordion();
            }
        };
    }

    console.log('[Tecnodrill] tecnodrill_app.js atualizado com sucesso (visual 100% idêntico ao JLE).');
})();
