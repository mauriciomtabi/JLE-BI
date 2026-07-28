/**
 * tecnodrill_app.js
 * Módulo do Dashboard Financeiro Tecnodrill (SICOOB)
 * Padrão equivalente ao módulo financeiro JLE (inline no index.html)
 * Todos os IDs e variáveis são prefixados com "td" para evitar conflitos.
 */

(function () {
    'use strict';

    // ──────────────────────────────────────────────
    // Estado do módulo
    // ──────────────────────────────────────────────
    window.tecnodrillDataLoaded = false;
    let tdAllTransactions = [];
    let tdFilteredTransactions = [];
    let tdCurrentPage = 1;
    const TD_PAGE_SIZE = 50;
    let tdActiveCategoryFlux = 'Saída';
    let tdActiveTab = 'indicators';
    let tdCurrentPeriod = 'mensal';

    // Chart instances
    let tdChartEvolution = null;
    let tdChartCustomers = null;
    let tdChartCategories = null;
    let tdChartMonthly = null;

    // ──────────────────────────────────────────────
    // Accordion sidebar — abre/fecha o grupo Financeiro
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

    // Abre o accordion automaticamente se a view ativa for financeiro ou tecnodrill
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
            document.getElementById('td-kpi-entradas').innerText = 'Dados não disponíveis';
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
            opt.text = c.charAt(0) + c.slice(1).toLowerCase().replace('/', ' / ');
            sel.appendChild(opt);
        });

        // Auto-selecionar mês atual
        const now = new Date();
        const months = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
        const currentComp = `${months[now.getMonth()]}/${now.getFullYear()}`;
        const hasCurrentMonth = competencias.includes(currentComp);
        if (hasCurrentMonth) sel.value = currentComp;
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

    window.applyTecnodrillFilters = function () {
        if (!window.tecnodrillDataLoaded) return;
        const mes = document.getElementById('td-filter-mes')?.value || 'ALL';
        const cat = document.getElementById('td-filter-categoria')?.value || 'ALL';
        const di = document.getElementById('td-filter-data-inicio')?.value || '';
        const df = document.getElementById('td-filter-data-fim')?.value || '';

        tdFilteredTransactions = tdAllTransactions.filter(t => {
            if (mes !== 'ALL' && t.competencia !== mes) return false;
            if (cat !== 'ALL' && t.categoria !== cat) return false;
            if (di && t.data < di) return false;
            if (df && t.data > df) return false;
            return true;
        });

        tdCurrentPage = 1;
        renderTecnodrillKPIs();
        renderTecnodrillBankCard();
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
    // Utilitários
    // ──────────────────────────────────────────────
    function fmtBRL(v) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    }

    function nonTransfer(txs) {
        return txs.filter(t => !t.is_transfer);
    }

    // ──────────────────────────────────────────────
    // KPIs
    // ──────────────────────────────────────────────
    function renderTecnodrillKPIs() {
        const txs = nonTransfer(tdFilteredTransactions);
        const entradas = txs.filter(t => t.fluxo === 'Entrada').reduce((s, t) => s + t.valor_nominal, 0);
        const saidas = txs.filter(t => t.fluxo === 'Saída').reduce((s, t) => s + t.valor_nominal, 0);
        const saldo = entradas - saidas;

        // Dias úteis no período (aproximação)
        const dates = [...new Set(txs.map(t => t.data).filter(Boolean))];
        const dias = dates.length || 1;

        document.getElementById('td-kpi-entradas').innerText = fmtBRL(entradas);
        document.getElementById('td-sub-entradas-diaria').innerText = `Média: ${fmtBRL(entradas / dias)}/dia`;

        document.getElementById('td-kpi-saidas').innerText = fmtBRL(saidas);
        document.getElementById('td-sub-saidas-diaria').innerText = `Média: ${fmtBRL(saidas / dias)}/dia`;
        const comp = entradas > 0 ? ((saidas / entradas) * 100).toFixed(1) : '0.0';
        document.getElementById('td-sub-saidas-comp').innerText = `Comprometimento: ${comp}%`;

        document.getElementById('td-kpi-saldo-final').innerText = fmtBRL(saldo);
        const efic = entradas > 0 ? ((saldo / entradas) * 100).toFixed(1) : '0.0';
        document.getElementById('td-sub-saldo-sobra').innerText = `Eficiência: ${efic}%`;

        // Comparativo mês anterior
        const mesEl = document.getElementById('td-filter-mes');
        if (mesEl && mesEl.value !== 'ALL') {
            const monthOrder = {'JANEIRO':1,'FEVEREIRO':2,'MARÇO':3,'ABRIL':4,'MAIO':5,'JUNHO':6,'JULHO':7,'AGOSTO':8,'SETEMBRO':9,'OUTUBRO':10,'NOVEMBRO':11,'DEZEMBRO':12};
            const [mesNome, ano] = mesEl.value.split('/');
            const mesNum = monthOrder[mesNome] || 0;
            const prevMesNum = mesNum === 1 ? 12 : mesNum - 1;
            const prevAno = mesNum === 1 ? parseInt(ano) - 1 : parseInt(ano);
            const prevMesNome = Object.keys(monthOrder).find(k => monthOrder[k] === prevMesNum) || '';
            const prevComp = `${prevMesNome}/${prevAno}`;
            const prevTxs = nonTransfer(tdAllTransactions.filter(t => t.competencia === prevComp));
            const prevEntradas = prevTxs.filter(t => t.fluxo === 'Entrada').reduce((s, t) => s + t.valor_nominal, 0);
            if (prevEntradas > 0) {
                const diff = ((entradas - prevEntradas) / prevEntradas * 100).toFixed(1);
                const sign = diff >= 0 ? '+' : '';
                document.getElementById('td-sub-entradas-comp').innerText = `vs. Mês Ant.: ${sign}${diff}%`;
            }
        }
    }

    // ──────────────────────────────────────────────
    // Card do banco SICOOB
    // ──────────────────────────────────────────────
    function renderTecnodrillBankCard() {
        const container = document.getElementById('td-banks-balance-list');
        if (!container) return;

        const txs = nonTransfer(tdFilteredTransactions);
        const entradas = txs.filter(t => t.fluxo === 'Entrada').reduce((s, t) => s + t.valor_nominal, 0);
        const saidas = txs.filter(t => t.fluxo === 'Saída').reduce((s, t) => s + t.valor_nominal, 0);
        const saldo = entradas - saidas;
        const pct = entradas > 0 ? Math.min((entradas / (entradas + saidas)) * 100, 100).toFixed(1) : 0;

        container.innerHTML = `
            <div class="bank-card" style="max-width: 380px;">
                <div class="bank-card-header">
                    <div class="bank-logo-wrapper" style="background: linear-gradient(135deg,#0057b8,#1976d2); border-radius: 50%; width: 40px; height: 40px; display:flex; align-items:center; justify-content:center;">
                        <i class="fa-solid fa-landmark" style="color:white; font-size:18px;"></i>
                    </div>
                    <div class="bank-info">
                        <span class="bank-name">SICOOB</span>
                        <span class="bank-subtitle">Conta Única Tecnodrill</span>
                    </div>
                    <span class="bank-balance">${fmtBRL(saldo)}</span>
                </div>
                <div class="bank-progress-bar">
                    <div class="bank-progress-fill" style="width: ${pct}%; background: linear-gradient(90deg,#0057b8,#1976d2);"></div>
                </div>
                <div class="bank-details">
                    <span>Entradas (+): <strong>${fmtBRL(entradas)}</strong></span>
                    <span>Saídas (-): <strong>${fmtBRL(saidas)}</strong></span>
                </div>
            </div>
        `;
    }

    // ──────────────────────────────────────────────
    // Abas internas (Indicadores / Lançamentos)
    // ──────────────────────────────────────────────
    window.switchTecnodrillTab = function (tab) {
        tdActiveTab = tab;
        document.getElementById('td-subview-indicators').style.display = tab === 'indicators' ? 'block' : 'none';
        document.getElementById('td-subview-transactions').style.display = tab === 'transactions' ? 'block' : 'none';
        document.getElementById('td-tab-btn-indicators').classList.toggle('active', tab === 'indicators');
        document.getElementById('td-tab-btn-transactions').classList.toggle('active', tab === 'transactions');
        if (tab === 'transactions') renderTecnodrillTable();
    };

    // ──────────────────────────────────────────────
    // Gráficos
    // ──────────────────────────────────────────────
    function destroyChart(chartRef) {
        if (chartRef) { try { chartRef.destroy(); } catch (e) {} }
        return null;
    }

    function renderTecnodrillCharts() {
        renderTdEvolutionChart();
        renderTdCustomersChart();
        renderTdCategoriesChart();
        renderTdMonthlyChart();
    }

    function renderTdEvolutionChart() {
        const canvas = document.getElementById('td-chart-evolution');
        if (!canvas) return;
        tdChartEvolution = destroyChart(tdChartEvolution);

        const ctx = canvas.getContext('2d');
        const txs = nonTransfer(tdFilteredTransactions).filter(t => t.data);

        // Agrupar por dia
        const byDay = {};
        txs.forEach(t => {
            if (!byDay[t.data]) byDay[t.data] = { entrada: 0, saida: 0 };
            if (t.fluxo === 'Entrada') byDay[t.data].entrada += t.valor_nominal;
            else byDay[t.data].saida += t.valor_nominal;
        });
        const labels = Object.keys(byDay).sort();
        const entradas = labels.map(d => byDay[d].entrada);
        const saidas = labels.map(d => byDay[d].saida);

        // Atualizar título
        const titleEl = document.getElementById('td-evolution-chart-title');
        if (titleEl) {
            const mesEl = document.getElementById('td-filter-mes');
            const mes = mesEl && mesEl.value !== 'ALL' ? mesEl.value : 'Geral';
            titleEl.innerText = `Evolução de Fluxo Diário — ${mes}`;
        }

        tdChartEvolution = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.map(d => {
                    const [y, m, day] = d.split('-');
                    return `${day}/${m}`;
                }),
                datasets: [
                    { label: 'Entradas', data: entradas, backgroundColor: 'rgba(46,204,113,0.7)', borderRadius: 4 },
                    { label: 'Saídas', data: saidas, backgroundColor: 'rgba(231,76,60,0.7)', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { labels: { color: '#8a99a8', font: { size: 12 } } } },
                scales: {
                    x: { ticks: { color: '#8a99a8', maxTicksLimit: 15 }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: '#8a99a8', callback: v => 'R$ ' + v.toLocaleString('pt-BR') }, grid: { color: 'rgba(255,255,255,0.06)' } }
                }
            }
        });
    }

    function renderTdCustomersChart() {
        const canvas = document.getElementById('td-chart-customers');
        if (!canvas) return;
        tdChartCustomers = destroyChart(tdChartCustomers);
        const ctx = canvas.getContext('2d');

        // Agrupado por descrição (top 8)
        const txs = nonTransfer(tdFilteredTransactions).filter(t => t.fluxo === 'Entrada' && t.descricao);
        const byDesc = {};
        txs.forEach(t => { byDesc[t.descricao] = (byDesc[t.descricao] || 0) + t.valor_nominal; });
        const sorted = Object.entries(byDesc).sort((a, b) => b[1] - a[1]).slice(0, 8);
        if (!sorted.length) return;

        const COLORS = ['#0057b8','#1976d2','#42a5f5','#64b5f6','#90caf9','#bbdefb','#1565c0','#0288d1'];
        tdChartCustomers = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: sorted.map(([k]) => k.length > 22 ? k.slice(0, 22) + '…' : k),
                datasets: [{ data: sorted.map(([,v]) => v), backgroundColor: COLORS, borderWidth: 2, borderColor: '#111c24' }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: '#8a99a8', font: { size: 11 }, boxWidth: 12 } },
                    tooltip: { callbacks: { label: ctx => ` ${fmtBRL(ctx.raw)}` } }
                }
            }
        });
    }

    function renderTdCategoriesChart() {
        const canvas = document.getElementById('td-chart-categories');
        if (!canvas) return;
        tdChartCategories = destroyChart(tdChartCategories);
        const ctx = canvas.getContext('2d');

        const txs = nonTransfer(tdFilteredTransactions).filter(t => t.fluxo === tdActiveCategoryFlux && t.categoria && t.categoria !== 'N/D' && t.categoria !== 'Saldo Inicial');
        const byCat = {};
        txs.forEach(t => { byCat[t.categoria] = (byCat[t.categoria] || 0) + t.valor_nominal; });
        const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
        if (!sorted.length) return;

        const color = tdActiveCategoryFlux === 'Entrada' ? 'rgba(46,204,113,0.75)' : 'rgba(231,76,60,0.75)';
        tdChartCategories = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(([k]) => k),
                datasets: [{ label: tdActiveCategoryFlux, data: sorted.map(([,v]) => v), backgroundColor: color, borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${fmtBRL(ctx.raw)}` } } },
                scales: {
                    x: { ticks: { color: '#8a99a8', callback: v => 'R$ ' + (v/1000).toFixed(0) + 'k' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: '#f5f6f8', font: { size: 11 } }, grid: { display: false } }
                }
            }
        });
    }

    function renderTdMonthlyChart() {
        const canvas = document.getElementById('td-chart-monthly');
        if (!canvas) return;
        tdChartMonthly = destroyChart(tdChartMonthly);
        const ctx = canvas.getContext('2d');

        // Agrupar todos os dados (sem filtro de mês) por competência
        const txs = nonTransfer(tdAllTransactions);
        const byComp = {};
        txs.forEach(t => {
            if (!t.competencia) return;
            if (!byComp[t.competencia]) byComp[t.competencia] = { entrada: 0, saida: 0 };
            if (t.fluxo === 'Entrada') byComp[t.competencia].entrada += t.valor_nominal;
            else byComp[t.competencia].saida += t.valor_nominal;
        });
        const monthOrder = {'JANEIRO':1,'FEVEREIRO':2,'MARÇO':3,'ABRIL':4,'MAIO':5,'JUNHO':6,'JULHO':7,'AGOSTO':8,'SETEMBRO':9,'OUTUBRO':10,'NOVEMBRO':11,'DEZEMBRO':12};
        const labels = Object.keys(byComp).sort((a, b) => {
            const [ma, ya] = a.split('/'), [mb, yb] = b.split('/');
            return (parseInt(ya) - parseInt(yb)) || ((monthOrder[ma]||0) - (monthOrder[mb]||0));
        });
        if (!labels.length) return;

        tdChartMonthly = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.map(l => { const [m, y] = l.split('/'); return `${m.slice(0,3)}/${y}`; }),
                datasets: [
                    { label: 'Entradas', data: labels.map(l => byComp[l].entrada), borderColor: '#2ecc71', backgroundColor: 'rgba(46,204,113,0.12)', fill: true, tension: 0.3, pointRadius: 4 },
                    { label: 'Saídas', data: labels.map(l => byComp[l].saida), borderColor: '#e74c3c', backgroundColor: 'rgba(231,76,60,0.12)', fill: true, tension: 0.3, pointRadius: 4 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#8a99a8', font: { size: 11 } } } },
                scales: {
                    x: { ticks: { color: '#8a99a8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: '#8a99a8', callback: v => 'R$ ' + (v/1000).toFixed(0) + 'k' }, grid: { color: 'rgba(255,255,255,0.06)' } }
                }
            }
        });
    }

    window.setTecnodrillCategoryFlux = function (flux) {
        tdActiveCategoryFlux = flux;
        document.getElementById('td-btn-toggle-saidas').style.backgroundColor = flux === 'Saída' ? 'var(--color-secondary)' : 'transparent';
        document.getElementById('td-btn-toggle-saidas').style.color = flux === 'Saída' ? 'white' : 'var(--text-secondary)';
        document.getElementById('td-btn-toggle-entradas').style.backgroundColor = flux === 'Entrada' ? 'var(--color-secondary)' : 'transparent';
        document.getElementById('td-btn-toggle-entradas').style.color = flux === 'Entrada' ? 'white' : 'var(--text-secondary)';
        renderTdCategoriesChart();
    };

    // ──────────────────────────────────────────────
    // Tabela de Lançamentos
    // ──────────────────────────────────────────────
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
                <td style="text-align:right; color:${color}; font-weight:600;">${fmtBRL(t.valor_nominal)}</td>
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

    // ──────────────────────────────────────────────
    // Exportar Excel
    // ──────────────────────────────────────────────
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

    // ──────────────────────────────────────────────
    // Garantir que o accordion abre quando se navega para JLE ou Tecnodrill
    // ──────────────────────────────────────────────
    const origSwitchView = window.switchView;
    if (typeof origSwitchView === 'function') {
        window.switchView = function (viewName) {
            origSwitchView(viewName);
            if (viewName === 'dashboard' || viewName === 'tecnodrill') {
                openFinanceiroAccordion();
            }
        };
    }

    console.log('[Tecnodrill] tecnodrill_app.js carregado com sucesso.');
})();
