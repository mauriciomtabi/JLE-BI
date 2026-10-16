/* ============================================================
   CONSOLIDADO JLE - CONTROLLER EXECUTIVO UNIFICADO
   Padrão visual e funcional corporativo do BI JLE Telecom
   ============================================================ */

(function () {
    'use strict';

    // Utilitários de DOM e formatação
    const el = id => document.getElementById('exec-jle-' + id);
    const money = v => (v == null || isNaN(v)) ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    const compact = v => {
        if (v == null || isNaN(v) || v === 0) return '0';
        const a = Math.abs(v);
        if (a >= 1000000) return 'R$ ' + (a / 1000000).toFixed(1).replace('.', ',') + 'M';
        if (a >= 1000) return 'R$ ' + (a / 1000).toFixed(0) + 'k';
        return 'R$ ' + a.toFixed(0);
    };
    const pct = (num, den) => {
        if (!den || num == null) return '—';
        const val = (num / den) * 100;
        return (val >= 0 ? '+' : '') + val.toFixed(1).replace('.', ',') + '%';
    };
    const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    const shortMonthsMap = {
        '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun',
        '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez'
    };
    const fullMonthsMap = {
        '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril', '05': 'Maio', '06': 'Junho',
        '07': 'Julho', '08': 'Agosto', '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
    };

    function monthLabel(p) {
        if (!p || p === 'ALL') return 'Todos os Meses';
        const [y, m] = p.split('-');
        return `${fullMonthsMap[m] || m}/${y}`;
    }

    function shortMonthLabel(p) {
        if (!p || p === 'ALL') return 'Todos';
        const [y, m] = p.split('-');
        return `${shortMonthsMap[m] || m}/${(y || '').slice(-2)}`;
    }

    const set = (id, v) => {
        const elem = el(id);
        if (elem) elem.textContent = v;
    };

    // Estado da Aplicação
    const state = {
        month: 'ALL',
        uf: 'ALL',
        customer: 'ALL',
        start: '',
        end: '',
        search: '',
        kind: '',
        page: 0,
        tab: 'indicators',
        sort: 'date',
        direction: -1,
        granularity: 'monthly',
        userSelectedGranularity: null
    };

    const charts = {
        evolution: null,
        customers: null,
        banks: null,
        uf: null
    };

    let installed = false;
    let searchTimer = null;
    let displayedRecords = [];

    const source = () => window.EXECUTIVO_JLE_DATA;

    const sum = (records, kind) => {
        let total = 0;
        for (let i = 0; i < records.length; i++) {
            const r = records[i];
            if (r.kind === kind && typeof r.value === 'number') {
                total += r.value;
            }
        }
        return Math.round(total * 100) / 100;
    };

    function matches(r) {
        if (state.uf !== 'ALL' && state.uf && r.uf !== state.uf) return false;
        if (state.customer !== 'ALL' && state.customer && r.customer !== state.customer) return false;
        if (state.start && r.date < state.start) return false;
        if (state.end && r.date > state.end) return false;
        if (state.search) {
            const query = norm(state.search);
            const text = norm([r.customer, r.description, r.category, r.bank, r.uf].join(' '));
            if (!text.includes(query)) return false;
        }
        return true;
    }

    function summarizeMonth(meta, records) {
        const rs = records.filter(r => r.period === meta.period);
        const revenue = meta.revenue == null ? null : sum(rs, 'revenue');
        // A base bancária de despesas não possui atribuição de cliente ERP
        const expense = (state.customer !== 'ALL' && state.customer) || meta.expense == null ? null : sum(rs, 'expense');
        const result = (revenue == null || expense == null) ? null : Math.round((revenue - expense) * 100) / 100;
        return {
            ...meta,
            revenue,
            expense,
            result,
            revenue_count: rs.filter(r => r.kind === 'revenue').length,
            expense_count: rs.filter(r => r.kind === 'expense').length
        };
    }

    // ============================================================
    // RENDER PRINCIPAL
    // ============================================================
    function render() {
        const data = source();
        if (!data?.records) {
            set('notice-text', 'Carregando dados do consolidado JLE...');
            if (el('notice')) el('notice').style.display = 'flex';
            return;
        }

        if (state.start && state.end && state.start > state.end) {
            set('notice-text', 'A data inicial não pode ser superior à data final.');
            if (el('notice')) el('notice').style.display = 'flex';
            return;
        }

        // Determinar competências ativas para o cálculo dos KPIs
        const isAllSelected = state.month === 'ALL';
        const periods = data.months.filter(m => isAllSelected ? m.comparable : m.period === state.month);
        const allowedPeriods = new Set(periods.map(m => m.period));

        // Registros filtrados conforme filtros globais
        const filteredRecords = data.records.filter(r => allowedPeriods.has(r.period) && matches(r));

        // Resumo mês a mês
        const monthlySummaries = periods.map(m => summarizeMonth(m, filteredRecords));

        // Agregados gerais
        const aggregate = field => {
            if (monthlySummaries.some(m => m[field] == null)) return null;
            return monthlySummaries.reduce((s, m) => s + Math.round((m[field] || 0) * 100), 0) / 100;
        };

        const totalRevenue = aggregate('revenue');
        const totalExpense = aggregate('expense');
        const totalResult = aggregate('result');

        // 1. Atualizar KPIs Cards
        set('revenue', money(totalRevenue));
        set('expense', money(totalExpense));
        set('result', money(totalResult));

        const revCount = filteredRecords.filter(r => r.kind === 'revenue').length;
        const expCount = filteredRecords.filter(r => r.kind === 'expense').length;

        set('revenue-note', totalRevenue == null ? 'Faturamento indisponível' : `${revCount.toLocaleString('pt-BR')} notas · faturado bruto ERP`);
        set('expense-note', (state.customer !== 'ALL' && state.customer) ? 'Despesas sem vínculo com cliente ERP' : totalExpense == null ? 'Despesas indisponíveis' : `${expCount.toLocaleString('pt-BR')} saídas · sem transferências`);

        // Médias Diárias / Mensais
        const revDailyEl = el('revenue-daily');
        const expDailyEl = el('expense-daily');
        if (!isAllSelected) {
            const [y, m] = state.month.split('-').map(Number);
            const daysInMonth = new Date(y, m, 0).getDate();
            if (revDailyEl) revDailyEl.textContent = totalRevenue ? `Média: ${money(totalRevenue / daysInMonth)}/dia` : 'Média: —/dia';
            if (expDailyEl) expDailyEl.textContent = totalExpense ? `Média: ${money(totalExpense / daysInMonth)}/dia` : 'Média: —/dia';
        } else {
            const compCount = periods.length || 1;
            if (revDailyEl) revDailyEl.textContent = totalRevenue ? `Média: ${money(totalRevenue / compCount)}/mês` : 'Média: —/mês';
            if (expDailyEl) expDailyEl.textContent = totalExpense ? `Média: ${money(totalExpense / compCount)}/mês` : 'Média: —/mês';
        }

        // Formatação do Resultado (Positivo / Negativo)
        const resultCard = el('result-card');
        const resultStatusEl = el('result-status');
        const resultNoteEl = el('result-note');

        if (resultCard) {
            resultCard.classList.toggle('is-negative', totalResult != null && totalResult < 0);
            resultCard.classList.toggle('is-positive', totalResult != null && totalResult >= 0);
        }

        if (totalResult != null) {
            const marginStr = totalRevenue ? pct(totalResult, totalRevenue) : '0,0%';
            if (resultNoteEl) resultNoteEl.textContent = `Margem Líquida: ${marginStr}`;
            if (resultStatusEl) {
                if (totalResult >= 0) {
                    resultStatusEl.textContent = 'Superávit Operacional';
                    resultStatusEl.style.color = '#2ecc71';
                } else {
                    resultStatusEl.textContent = 'Déficit Operacional';
                    resultStatusEl.style.color = '#e74c3c';
                }
            }
        } else {
            if (resultNoteEl) resultNoteEl.textContent = (state.customer !== 'ALL' && state.customer) ? 'Resultado por cliente indisponível' : 'Aguardando fontes completas';
            if (resultStatusEl) {
                resultStatusEl.textContent = 'Indisponível';
                resultStatusEl.style.color = 'var(--text-secondary)';
            }
        }

        // Badge de Período Ativo
        set('period-label', isAllSelected ? 'Acumulado Comparável' : monthLabel(state.month));

        // Notificações e Avisos Contextuais
        const notes = [];
        if (state.customer !== 'ALL' && state.customer) notes.push(`Filtro de cliente ativo (${state.customer}): exibindo faturamento correspondente (as despesas bancárias não possuem vínculo de cliente).`);
        if (monthlySummaries.some(m => m.revenue == null)) notes.push('O faturamento deste período ainda está pendente de emissão/fechamento no ERP.');
        if (!filteredRecords.length) notes.push('Nenhum lançamento foi encontrado para os filtros selecionados.');
        if (state.uf !== 'ALL' && state.uf) notes.push(`Filtrando apenas lançamentos registrados na UF ${state.uf}.`);
        if (isAllSelected && data.months.some(m => !m.comparable)) notes.push('O acumulado comparável inclui exclusivamente meses que possuem tanto faturamento quanto despesas bancárias conciliadas.');

        const noticeContainer = el('notice');
        if (noticeContainer) {
            if (notes.length) {
                set('notice-text', notes.join(' '));
                noticeContainer.style.display = 'flex';
            } else {
                noticeContainer.style.display = 'none';
            }
        }

        // 2. Renderizar Gráficos e Tabelas
        updateGranularityButtons();
        renderEvolutionChart(data, filteredRecords, periods);
        renderCustomersChart(filteredRecords);
        renderBanksChart(filteredRecords);
        renderUfChart(filteredRecords);
        renderMonthlyTable(data, monthlySummaries);
        renderRecordsTable(filteredRecords);
    }

    // ============================================================
    // CONTROLES DE GRANULARIDADE (DIÁRIO, SEMANAL, MENSAL)
    // ============================================================
    function updateGranularityButtons() {
        const isAllSelected = state.month === 'ALL';
        const isMobile = window.innerWidth <= 768;

        // Se 'ALL' estiver selecionado, a única granularidade viável é 'monthly'
        if (isAllSelected) {
            state.granularity = 'monthly';
        } else if (!state.userSelectedGranularity) {
            state.granularity = isMobile ? 'weekly' : 'daily';
        } else {
            state.granularity = state.userSelectedGranularity;
        }

        const btnMonthly = el('btn-monthly');
        const btnWeekly = el('btn-weekly');
        const btnDaily = el('btn-daily');

        if (btnMonthly) {
            btnMonthly.classList.toggle('active', state.granularity === 'monthly');
            btnMonthly.disabled = false;
        }

        if (btnWeekly) {
            btnWeekly.classList.toggle('active', state.granularity === 'weekly');
            btnWeekly.disabled = isAllSelected;
            btnWeekly.title = isAllSelected ? 'Selecione um mês específico para visualizar por semana' : 'Visão agrupada por semanas';
        }

        if (btnDaily) {
            btnDaily.classList.toggle('active', state.granularity === 'daily');
            btnDaily.disabled = isAllSelected;
            btnDaily.title = isAllSelected ? 'Selecione um mês específico para visualizar por dia' : 'Visão dia a dia detalhada';
        }
    }

    window.setExecutivoGranularity = function (gran) {
        if (state.month === 'ALL' && gran !== 'monthly') return;
        state.granularity = gran;
        state.userSelectedGranularity = gran;
        updateGranularityButtons();
        const data = source();
        if (!data) return;
        const periods = data.months.filter(m => state.month === 'ALL' ? m.comparable : m.period === state.month);
        const allowedPeriods = new Set(periods.map(m => m.period));
        const filteredRecords = data.records.filter(r => allowedPeriods.has(r.period) && matches(r));
        renderEvolutionChart(data, filteredRecords, periods);
    };

    // ============================================================
    // 1. GRÁFICO DE EVOLUÇÃO (MENSAL / SEMANAL / DIÁRIO)
    // ============================================================
    function renderEvolutionChart(data, filteredRecords, activePeriods) {
        if (charts.evolution) {
            charts.evolution.destroy();
            charts.evolution = null;
        }

        const canvas = el('chart');
        if (!canvas || typeof Chart === 'undefined') return;

        const isLight = document.body.classList.contains('light-theme');
        const textColor = isLight ? '#1f2c3d' : '#f5f6f8';
        const textSecondary = isLight ? '#637381' : '#8a99a8';
        const gridColor = isLight ? '#e0e6ed' : 'rgba(255, 255, 255, 0.06)';

        let chartLabels = [];
        let revenueData = [];
        let expenseData = [];

        const gran = state.granularity;

        if (gran === 'monthly') {
            // MENSAL: Exibe todos os meses disponíveis na base histórica
            const isAll = state.month === 'ALL';
            set('chart-title', isAll ? 'Evolução Mensal Consolidada' : `Evolução Mensal (Visão Geral) · ${monthLabel(state.month)}`);
            set('chart-note', 'Faturamento bruto ERP vs saídas bancárias · Clique em um mês para detalhar');

            chartLabels = data.months.map(m => shortMonthLabel(m.period));

            // Para cada mês da base, calcular receita e despesa conforme filtros globais (UF, cliente, busca)
            revenueData = data.months.map(m => {
                const rs = data.records.filter(r => r.period === m.period && r.kind === 'revenue' && matches(r));
                return m.revenue == null && !rs.length ? null : rs.reduce((s, r) => s + r.value, 0);
            });

            expenseData = data.months.map(m => {
                if (state.customer !== 'ALL' && state.customer) return 0;
                const rs = data.records.filter(r => r.period === m.period && r.kind === 'expense' && matches(r));
                return m.expense == null && !rs.length ? null : rs.reduce((s, r) => s + r.value, 0);
            });

        } else if (gran === 'weekly') {
            // SEMANAL: Agrupa os dias do mês selecionado em Semana 1..5
            set('chart-title', `Evolução Semanal · ${monthLabel(state.month)}`);
            set('chart-note', 'Consolidação semanal do fluxo operacional');

            const [yr, mo] = state.month.split('-').map(Number);
            const daysInMonth = new Date(yr, mo, 0).getDate();
            const numWeeks = Math.ceil(daysInMonth / 7);

            chartLabels = Array.from({ length: numWeeks }, (_, i) => `Semana ${i + 1}`);
            revenueData = new Array(numWeeks).fill(0);
            expenseData = new Array(numWeeks).fill(0);

            const monthRecords = data.records.filter(r => r.period === state.month && matches(r));

            monthRecords.forEach(r => {
                let day = null;
                if (r.date && r.date.startsWith(state.month)) {
                    day = parseInt(r.date.slice(8, 10), 10);
                }
                const wIdx = (day && day >= 1 && day <= daysInMonth)
                    ? Math.min(Math.floor((day - 1) / 7), numWeeks - 1)
                    : numWeeks - 1;

                if (r.kind === 'revenue') revenueData[wIdx] += r.value;
                else if (r.kind === 'expense' && (state.customer === 'ALL' || !state.customer)) expenseData[wIdx] += r.value;
            });

        } else {
            // DIÁRIO: Exibe cada dia (1..28/30/31) do mês selecionado
            set('chart-title', `Evolução Diária · ${monthLabel(state.month)}`);
            set('chart-note', 'Detalhamento dia a dia dos lançamentos operacionais');

            const [yr, mo] = state.month.split('-').map(Number);
            const daysInMonth = new Date(yr, mo, 0).getDate();

            chartLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));
            revenueData = new Array(daysInMonth).fill(0);
            expenseData = new Array(daysInMonth).fill(0);

            const monthRecords = data.records.filter(r => r.period === state.month && matches(r));

            monthRecords.forEach(r => {
                if (r.date && r.date.startsWith(state.month)) {
                    const day = parseInt(r.date.slice(8, 10), 10);
                    if (day >= 1 && day <= daysInMonth) {
                        if (r.kind === 'revenue') revenueData[day - 1] += r.value;
                        else if (r.kind === 'expense' && (state.customer === 'ALL' || !state.customer)) expenseData[day - 1] += r.value;
                    }
                }
            });
        }

        charts.evolution = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: chartLabels,
                datasets: [
                    {
                        label: 'Receita Bruta (ERP)',
                        data: revenueData,
                        backgroundColor: '#10b981',
                        borderColor: '#10b981',
                        hoverBackgroundColor: '#34d399',
                        borderRadius: 4,
                        borderWidth: 0
                    },
                    {
                        label: 'Despesas Bancárias',
                        data: expenseData,
                        backgroundColor: '#f59e0b',
                        borderColor: '#f59e0b',
                        hoverBackgroundColor: '#fbbf24',
                        borderRadius: 4,
                        borderWidth: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: { top: 24, right: 12 }
                },
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor,
                            boxWidth: 14,
                            usePointStyle: true,
                            pointStyle: 'rectRounded',
                            font: { family: 'Outfit', size: 11, weight: '500' },
                            padding: 16
                        }
                    },
                    datalabels: {
                        display: ctx => {
                            const val = ctx.dataset.data[ctx.dataIndex];
                            return val != null && val > 0 && (gran !== 'daily' || ctx.dataIndex % 2 === 0);
                        },
                        anchor: 'end',
                        align: 'top',
                        offset: 4,
                        clip: false,
                        color: textSecondary,
                        font: { family: 'Outfit', size: 9, weight: 'bold' },
                        formatter: compact
                    },
                    tooltip: {
                        backgroundColor: 'rgba(10, 17, 24, 0.95)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: c => `${c.dataset.label}: ${money(c.raw)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: textSecondary,
                            font: { family: 'Outfit', size: 11 },
                            maxRotation: 0,
                            autoSkip: gran === 'daily'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grace: '18%',
                        grid: { color: gridColor },
                        ticks: {
                            color: textSecondary,
                            font: { family: 'Outfit', size: 10 },
                            callback: compact
                        }
                    }
                },
                onClick: (_, items) => {
                    if (gran === 'monthly' && items.length) {
                        const clickedMonth = data.months[items[0].index]?.period;
                        if (clickedMonth) {
                            window.selectExecutivoMonth(clickedMonth);
                        }
                    }
                }
            }
        });
    }

    // ============================================================
    // 2. GRÁFICO DE RECEITA POR CLIENTE (COBRANÇAS / ERP)
    // ============================================================
    function renderCustomersChart(records) {
        if (charts.customers) {
            charts.customers.destroy();
            charts.customers = null;
        }

        const canvas = el('chart-customers');
        if (!canvas || typeof Chart === 'undefined') return;

        const backContainer = el('customers-back-container');
        if (backContainer) {
            if (state.customer !== 'ALL' && state.customer) {
                backContainer.innerHTML = `<button class="exec-back-btn" onclick="window.clearExecutivoCustomer()"><i class="fa-solid fa-arrow-left"></i> Todos os clientes</button>`;
            } else {
                backContainer.innerHTML = '';
            }
        }

        const revRecords = records.filter(r => r.kind === 'revenue');
        const byCustomer = {};

        revRecords.forEach(r => {
            const cust = r.customer || 'Não Identificado';
            byCustomer[cust] = (byCustomer[cust] || 0) + r.value;
        });

        const sorted = Object.entries(byCustomer).sort((a, b) => b[1] - a[1]);
        const top5 = sorted.slice(0, 5);
        const othersSum = sorted.slice(5).reduce((s, c) => s + c[1], 0);

        if (othersSum > 0) {
            top5.push(['Outros Clientes', othersSum]);
        }

        const labels = top5.map(c => c[0].length > 22 ? c[0].slice(0, 20) + '…' : c[0]);
        const values = top5.map(c => c[1]);
        const total = values.reduce((s, v) => s + v, 0);

        const palette = ['#10b981', '#38bdf8', '#f59e0b', '#a855f7', '#ec4899', '#64748b'];
        const isLight = document.body.classList.contains('light-theme');
        const textColor = isLight ? '#1f2c3d' : '#f5f6f8';

        charts.customers = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: palette.slice(0, values.length),
                    borderColor: isLight ? '#ffffff' : '#111c24',
                    borderWidth: 2,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor,
                            boxWidth: 12,
                            usePointStyle: true,
                            font: { family: 'Outfit', size: 10.5 },
                            padding: 10
                        }
                    },
                    datalabels: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(10, 17, 24, 0.95)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        callbacks: {
                            label: c => {
                                const val = c.raw;
                                const p = total ? ((val / total) * 100).toFixed(1).replace('.', ',') + '%' : '0%';
                                return ` ${money(val)} (${p})`;
                            }
                        }
                    }
                },
                onClick: (_, items) => {
                    if (items.length) {
                        const clicked = top5[items[0].index][0];
                        if (clicked && clicked !== 'Outros Clientes') {
                            state.customer = clicked;
                            if (el('customer')) el('customer').value = clicked;
                            state.page = 0;
                            render();
                        }
                    }
                }
            }
        });
    }

    // ============================================================
    // 3. GRÁFICO DE DESPESAS POR BANCO
    // ============================================================
    function renderBanksChart(records) {
        if (charts.banks) {
            charts.banks.destroy();
            charts.banks = null;
        }

        const canvas = el('chart-banks');
        if (!canvas || typeof Chart === 'undefined') return;

        const expRecords = records.filter(r => r.kind === 'expense');
        const byBank = {};

        expRecords.forEach(r => {
            const b = r.bank || 'Não Informado';
            byBank[b] = (byBank[b] || 0) + r.value;
        });

        const sorted = Object.entries(byBank).sort((a, b) => b[1] - a[1]);
        const labels = sorted.map(b => b[0]);
        const values = sorted.map(b => b[1]);
        const total = values.reduce((s, v) => s + v, 0);

        const palette = ['#38bdf8', '#10b981', '#f59e0b', '#a855f7', '#64748b'];
        const isLight = document.body.classList.contains('light-theme');
        const textColor = isLight ? '#1f2c3d' : '#f5f6f8';

        charts.banks = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: palette.slice(0, values.length),
                    borderColor: isLight ? '#ffffff' : '#111c24',
                    borderWidth: 2,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '66%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor,
                            boxWidth: 12,
                            usePointStyle: true,
                            font: { family: 'Outfit', size: 10.5 },
                            padding: 10
                        }
                    },
                    datalabels: { display: false },
                    tooltip: {
                        callbacks: {
                            label: c => {
                                const val = c.raw;
                                const p = total ? ((val / total) * 100).toFixed(1).replace('.', ',') + '%' : '0%';
                                return ` ${money(val)} (${p})`;
                            }
                        }
                    }
                }
            }
        });
    }

    // ============================================================
    // 4. GRÁFICO DE FATURAMENTO POR UF
    // ============================================================
    function renderUfChart(records) {
        if (charts.uf) {
            charts.uf.destroy();
            charts.uf = null;
        }

        const canvas = el('chart-uf');
        if (!canvas || typeof Chart === 'undefined') return;

        const revRecords = records.filter(r => r.kind === 'revenue');
        const byUf = {};

        revRecords.forEach(r => {
            const uf = r.uf || 'N/D';
            byUf[uf] = (byUf[uf] || 0) + r.value;
        });

        const sorted = Object.entries(byUf).sort((a, b) => b[1] - a[1]);
        const labels = sorted.map(u => u[0]);
        const values = sorted.map(u => u[1]);

        const isLight = document.body.classList.contains('light-theme');
        const textColor = isLight ? '#1f2c3d' : '#f5f6f8';
        const textSecondary = isLight ? '#637381' : '#8a99a8';
        const gridColor = isLight ? '#e0e6ed' : 'rgba(255, 255, 255, 0.06)';

        charts.uf = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Faturamento Bruto',
                    data: values,
                    backgroundColor: '#004f71',
                    hoverBackgroundColor: '#0077aa',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        anchor: 'end',
                        align: 'right',
                        color: textSecondary,
                        font: { family: 'Outfit', size: 9.5, weight: 'bold' },
                        formatter: compact
                    },
                    tooltip: {
                        callbacks: {
                            label: c => ` Faturamento: ${money(c.raw)}`
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grace: '15%',
                        grid: { color: gridColor },
                        ticks: { color: textSecondary, callback: compact, font: { family: 'Outfit', size: 10 } }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: textColor, font: { family: 'Outfit', size: 11, weight: '600' } }
                    }
                },
                onClick: (_, items) => {
                    if (items.length) {
                        const clickedUf = labels[items[0].index];
                        if (clickedUf) {
                            state.uf = clickedUf;
                            if (el('uf')) el('uf').value = clickedUf;
                            state.page = 0;
                            render();
                        }
                    }
                }
            }
        });
    }

    // ============================================================
    // 5. TABELA RESUMO MENSAL (CONSOLIDADO DO EXERCÍCIO)
    // ============================================================
    function renderMonthlyTable(data, monthlySummaries) {
        const body = el('monthly-body');
        if (!body) return;
        body.replaceChildren();

        // Para a tabela completa, exibimos todos os meses do exercício
        let totRev = 0, totExp = 0, totRes = 0;

        for (const m of data.months) {
            // Calcular valores do mês aplicando filtros de UF, busca e cliente
            const mRs = data.records.filter(r => r.period === m.period && matches(r));
            const rev = m.revenue == null ? null : sum(mRs, 'revenue');
            const exp = (state.customer !== 'ALL' && state.customer) || m.expense == null ? null : sum(mRs, 'expense');
            const res = (rev == null || exp == null) ? null : Math.round((rev - exp) * 100) / 100;

            if (rev != null) totRev += rev;
            if (exp != null) totExp += exp;
            if (res != null) totRes += res;

            const tr = document.createElement('tr');
            if (m.period === state.month) {
                tr.style.backgroundColor = 'rgba(56, 189, 248, 0.08)';
            }

            // Coluna 1: Botão do Mês
            const tdMonth = document.createElement('td');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `exec-month-btn ${m.period === state.month ? 'active' : ''}`;
            btn.innerHTML = `<i class="fa-solid fa-calendar"></i> ${monthLabel(m.period)}`;
            btn.onclick = () => window.selectExecutivoMonth(m.period);
            tdMonth.appendChild(btn);
            tr.appendChild(tdMonth);

            // Coluna 2: Receita
            const tdRev = document.createElement('td');
            tdRev.style.textAlign = 'right';
            tdRev.style.fontWeight = '600';
            tdRev.textContent = money(rev);
            tr.appendChild(tdRev);

            // Coluna 3: Despesa
            const tdExp = document.createElement('td');
            tdExp.style.textAlign = 'right';
            tdExp.style.fontWeight = '600';
            tdExp.textContent = money(exp);
            tr.appendChild(tdExp);

            // Coluna 4: Resultado
            const tdRes = document.createElement('td');
            tdRes.style.textAlign = 'right';
            tdRes.style.fontWeight = '700';
            tdRes.textContent = money(res);
            if (res != null) tdRes.className = res >= 0 ? 'cell-pos' : 'cell-neg';
            tr.appendChild(tdRes);

            // Coluna 5: Margem
            const tdMargin = document.createElement('td');
            tdMargin.style.textAlign = 'right';
            tdMargin.style.fontWeight = '600';
            tdMargin.textContent = pct(res, rev);
            if (res != null) tdMargin.className = res >= 0 ? 'cell-pos' : 'cell-neg';
            tr.appendChild(tdMargin);

            // Coluna 6: Situação
            const tdStatus = document.createElement('td');
            tdStatus.style.textAlign = 'center';
            const isComp = m.comparable;
            tdStatus.innerHTML = isComp
                ? `<span class="exec-badge-status success"><i class="fa-solid fa-check"></i> Consolidado</span>`
                : `<span class="exec-badge-status warning"><i class="fa-solid fa-clock"></i> Parcial (Pendente ERP)</span>`;
            tr.appendChild(tdStatus);

            body.appendChild(tr);
        }

        // Linha de Rodapé com Totais
        const tfoot = document.createElement('tr');
        tfoot.style.fontWeight = '750';
        tfoot.style.borderTop = '2px solid var(--border-color)';
        tfoot.style.backgroundColor = 'rgba(0, 0, 0, 0.15)';

        tfoot.innerHTML = `
            <td>TOTAL CONSOLIDADO</td>
            <td style="text-align: right; color: #10b981;">${money(totRev)}</td>
            <td style="text-align: right; color: #f59e0b;">${money(totExp)}</td>
            <td style="text-align: right;" class="${totRes >= 0 ? 'cell-pos' : 'cell-neg'}">${money(totRes)}</td>
            <td style="text-align: right;" class="${totRes >= 0 ? 'cell-pos' : 'cell-neg'}">${pct(totRes, totRev)}</td>
            <td style="text-align: center;"><span class="badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8;">Exercício</span></td>
        `;
        body.appendChild(tfoot);
    }

    // ============================================================
    // 6. TABELA DE LANÇAMENTOS (TAB 2)
    // ============================================================
    function renderRecordsTable(records) {
        displayedRecords = records
            .filter(r => !state.kind || r.kind === state.kind)
            .sort((a, b) => {
                const factor = state.direction;
                if (state.sort === 'value') return factor * (a.value - b.value);
                return factor * a.date.localeCompare(b.date);
            });

        const pageSize = 50;
        const totalCount = displayedRecords.length;
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
        state.page = Math.max(0, Math.min(state.page, totalPages - 1));

        const body = el('record-body');
        if (!body) return;
        body.replaceChildren();

        const startIdx = state.page * pageSize;
        const pageRecords = displayedRecords.slice(startIdx, startIdx + pageSize);

        if (!pageRecords.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 6;
            td.style.textAlign = 'center';
            td.style.padding = '30px';
            td.style.color = 'var(--text-secondary)';
            td.textContent = 'Nenhum lançamento correspondente aos filtros foi encontrado.';
            tr.appendChild(td);
            body.appendChild(tr);
        } else {
            pageRecords.forEach(r => {
                const tr = document.createElement('tr');

                // Data DD/MM/AAAA
                const tdDate = document.createElement('td');
                tdDate.textContent = r.date ? r.date.split('-').reverse().join('/') : '—';
                tdDate.style.fontWeight = '500';
                tr.appendChild(tdDate);

                // Tipo (Badge)
                const tdKind = document.createElement('td');
                tdKind.style.textAlign = 'center';
                tdKind.innerHTML = r.kind === 'revenue'
                    ? `<span class="exec-badge-kind revenue"><i class="fa-solid fa-arrow-down-left"></i> Receita</span>`
                    : `<span class="exec-badge-kind expense"><i class="fa-solid fa-arrow-up-right"></i> Despesa</span>`;
                tr.appendChild(tdKind);

                // Cliente / Descrição
                const tdDesc = document.createElement('td');
                tdDesc.style.maxWidth = '400px';
                tdDesc.style.whiteSpace = 'normal';
                if (r.customer) {
                    tdDesc.innerHTML = `<strong style="color: var(--text-primary);">${r.customer}</strong> <span style="color: var(--text-secondary); font-size: 12px;">(${r.description})</span>`;
                } else {
                    tdDesc.textContent = r.description || '—';
                }
                tr.appendChild(tdDesc);

                // UF
                const tdUf = document.createElement('td');
                tdUf.style.textAlign = 'center';
                tdUf.innerHTML = `<span class="exec-badge-uf">${r.uf || 'N/D'}</span>`;
                tr.appendChild(tdUf);

                // Banco / Categoria
                const tdCat = document.createElement('td');
                const catInfo = [r.bank, r.category].filter(Boolean).join(' · ');
                tdCat.textContent = catInfo || '—';
                tdCat.style.color = 'var(--text-secondary)';
                tdCat.style.fontSize = '12.5px';
                tr.appendChild(tdCat);

                // Valor
                const tdVal = document.createElement('td');
                tdVal.style.textAlign = 'right';
                tdVal.style.fontWeight = '700';
                tdVal.textContent = (r.kind === 'revenue' ? '+ ' : '- ') + money(r.value);
                tdVal.className = r.kind === 'revenue' ? 'cell-pos' : 'cell-neg';
                tr.appendChild(tdVal);

                body.appendChild(tr);
            });
        }

        // Contadores e Paginação
        set('record-count', `(${totalCount.toLocaleString('pt-BR')} registros)`);
        set('record-tab-badge', totalCount.toLocaleString('pt-BR'));
        set('page', `${state.page + 1} de ${totalPages}`);

        const infoEl = el('pagination-info');
        if (infoEl) {
            const startNum = totalCount === 0 ? 0 : startIdx + 1;
            const endNum = Math.min(startIdx + pageSize, totalCount);
            infoEl.textContent = `Exibindo ${startNum} a ${endNum} de ${totalCount.toLocaleString('pt-BR')} lançamentos`;
        }

        const prevBtn = el('previous');
        const nextBtn = el('next');
        if (prevBtn) prevBtn.disabled = state.page === 0;
        if (nextBtn) nextBtn.disabled = state.page + 1 >= totalPages;
    }

    // ============================================================
    // AÇÕES DE FILTROS E NAVEGAÇÃO EXPOSTAS GLOBALMENTE
    // ============================================================
    window.selectExecutivoMonth = function (period) {
        state.month = period;
        if (el('month')) el('month').value = period;
        // Ao selecionar um mês específico, define como 'daily' (ou 'weekly' se mobile)
        state.granularity = window.innerWidth <= 768 ? 'weekly' : 'daily';
        state.userSelectedGranularity = null;
        state.page = 0;
        render();
    };

    window.clearExecutivoCustomer = function () {
        state.customer = 'ALL';
        if (el('customer')) el('customer').value = 'ALL';
        state.page = 0;
        render();
    };

    window.clearExecutivoDates = function () {
        state.start = '';
        state.end = '';
        if (el('start')) el('start').value = '';
        if (el('end')) el('end').value = '';
        state.page = 0;
        render();
    };

    window.toggleExecutivoSort = function (field) {
        if (state.sort === field) {
            state.direction = -state.direction;
        } else {
            state.sort = field;
            state.direction = -1;
        }

        const iconDate = document.getElementById('exec-sort-icon-date');
        const iconValue = document.getElementById('exec-sort-icon-value');

        if (iconDate) iconDate.className = state.sort === 'date' ? (state.direction === 1 ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down') : 'fa-solid fa-sort';
        if (iconValue) iconValue.className = state.sort === 'value' ? (state.direction === 1 ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down') : 'fa-solid fa-sort';

        state.page = 0;
        const data = source();
        if (data) {
            const periods = data.months.filter(m => state.month === 'ALL' ? m.comparable : m.period === state.month);
            const allowedPeriods = new Set(periods.map(m => m.period));
            const filteredRecords = data.records.filter(r => allowedPeriods.has(r.period) && matches(r));
            renderRecordsTable(filteredRecords);
        }
    };

    function resetFilters() {
        state.month = 'ALL';
        state.uf = 'ALL';
        state.customer = 'ALL';
        state.start = '';
        state.end = '';
        state.search = '';
        state.kind = '';
        state.page = 0;
        state.granularity = 'monthly';
        state.userSelectedGranularity = null;

        if (el('month')) el('month').value = 'ALL';
        if (el('uf')) el('uf').value = 'ALL';
        if (el('customer')) el('customer').value = 'ALL';
        if (el('start')) el('start').value = '';
        if (el('end')) el('end').value = '';
        if (el('search')) el('search').value = '';
        if (el('kind')) el('kind').value = '';

        render();
    }

    function switchTab(name) {
        state.tab = name;
        const indSection = el('indicators');
        const recSection = el('records');
        const tabInd = el('tab-indicators');
        const tabRec = el('tab-records');

        if (indSection) indSection.style.display = name === 'indicators' ? 'block' : 'none';
        if (recSection) recSection.style.display = name === 'records' ? 'block' : 'none';

        if (tabInd) {
            tabInd.classList.toggle('active', name === 'indicators');
            tabInd.setAttribute('aria-selected', String(name === 'indicators'));
        }
        if (tabRec) {
            tabRec.classList.toggle('active', name === 'records');
            tabRec.setAttribute('aria-selected', String(name === 'records'));
        }

        if (name === 'indicators') {
            render();
        }
    }

    // ============================================================
    // INICIALIZAÇÃO
    // ============================================================
    window.initExecutivoJle = function () {
        const data = source();
        if (!data?.months?.length) return;

        // 1. Preencher Select de Competência / Mês
        const monthSelect = el('month');
        if (monthSelect) {
            monthSelect.replaceChildren();
            const allOpt = document.createElement('option');
            allOpt.value = 'ALL';
            allOpt.textContent = 'Todos os Meses (Acumulado)';
            monthSelect.appendChild(allOpt);

            data.months.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.period;
                opt.textContent = `${monthLabel(m.period)}${m.comparable ? '' : ' · Parcial'}`;
                monthSelect.appendChild(opt);
            });

            monthSelect.value = state.month;
        }

        // 2. Preencher Select de UFs
        const ufSelect = el('uf');
        if (ufSelect) {
            const ufs = [...new Set((data.records || []).map(r => r.uf).filter(Boolean))].sort();
            ufSelect.replaceChildren();
            const allUf = document.createElement('option');
            allUf.value = 'ALL';
            allUf.textContent = 'Todas as UFs';
            ufSelect.appendChild(allUf);

            ufs.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u;
                opt.textContent = u;
                ufSelect.appendChild(opt);
            });
            ufSelect.value = state.uf;
        }

        // 3. Preencher Select de Clientes
        const custSelect = el('customer');
        if (custSelect) {
            const customers = [...new Set((data.records || []).map(r => r.customer).filter(Boolean))].sort();
            custSelect.replaceChildren();
            const allCust = document.createElement('option');
            allCust.value = 'ALL';
            allCust.textContent = 'Todos os Clientes';
            custSelect.appendChild(allCust);

            customers.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                custSelect.appendChild(opt);
            });
            custSelect.value = state.customer;
        }

        // 4. Instalar Listeners de Eventos (uma única vez)
        if (!installed) {
            installed = true;

            ['month', 'uf', 'customer', 'start', 'end'].forEach(id => {
                const element = el(id);
                if (element) {
                    element.addEventListener('change', () => {
                        state[id] = element.value;
                        if (id === 'month') {
                            if (element.value === 'ALL') {
                                state.granularity = 'monthly';
                                state.userSelectedGranularity = null;
                            } else if (!state.userSelectedGranularity) {
                                state.granularity = window.innerWidth <= 768 ? 'weekly' : 'daily';
                            }
                        }
                        state.page = 0;
                        render();
                    });
                }
            });

            const searchInput = el('search');
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    clearTimeout(searchTimer);
                    searchTimer = setTimeout(() => {
                        state.search = searchInput.value.trim();
                        state.page = 0;
                        render();
                    }, 250);
                });
            }

            const kindSelect = el('kind');
            if (kindSelect) {
                kindSelect.addEventListener('change', () => {
                    state.kind = kindSelect.value;
                    state.page = 0;
                    render();
                });
            }

            const clearBtn = el('clear');
            if (clearBtn) clearBtn.onclick = resetFilters;

            const prevBtn = el('previous');
            if (prevBtn) prevBtn.onclick = () => { if (state.page > 0) { state.page--; render(); } };

            const nextBtn = el('next');
            if (nextBtn) nextBtn.onclick = () => { state.page++; render(); };

            const tabInd = el('tab-indicators');
            const tabRec = el('tab-records');
            if (tabInd) tabInd.onclick = () => switchTab('indicators');
            if (tabRec) tabRec.onclick = () => switchTab('records');

            // Exportação Excel
            const exportBtn = el('export');
            if (exportBtn) {
                exportBtn.onclick = () => {
                    if (typeof XLSX === 'undefined') {
                        alert('Biblioteca de exportação XLSX indisponível. Recarregue a página.');
                        return;
                    }

                    const rows = displayedRecords.map(r => ({
                        'Data': r.date ? r.date.split('-').reverse().join('/') : '',
                        'Competência': monthLabel(r.period),
                        'Tipo': r.kind === 'revenue' ? 'Receita' : 'Despesa',
                        'Cliente': r.customer || '',
                        'Descrição': r.description || '',
                        'UF': r.uf || '',
                        'Banco': r.bank || '',
                        'Categoria': r.category || '',
                        'Valor': r.value
                    }));

                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.json_to_sheet(rows);
                    XLSX.utils.book_append_sheet(wb, ws, 'Consolidado');
                    XLSX.writeFile(wb, `Consolidado_JLE_${state.month}_${new Date().toISOString().slice(0, 10)}.xlsx`);
                };
            }

            // Observador de mudança de tema Claro/Escuro para repintar gráficos
            new MutationObserver(() => {
                if (window.activeView === 'executivo') {
                    render();
                }
            }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        }

        render();
    };
})();
