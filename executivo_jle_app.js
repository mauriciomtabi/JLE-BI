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
        banks: null
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
    // LOGOS SVG DOS CLIENTES
    // ============================================================
    function getCustomerLogoSvg(customerName) {
        const c = String(customerName || '').toUpperCase();

        if (c.includes('CLARO S.A') || c === 'CLARO') {
            return `
            <svg viewBox="0 0 100 100" width="100%" height="100%">
                <rect width="100" height="100" rx="14" fill="#da291c"/>
                <circle cx="50" cy="50" r="32" fill="#ffffff"/>
                <circle cx="50" cy="50" r="23" fill="#da291c"/>
                <ellipse cx="50" cy="50" rx="27" ry="14" fill="none" stroke="#ffffff" stroke-width="4.5" transform="rotate(-30 50 50)"/>
                <circle cx="50" cy="50" r="12" fill="#ffffff"/>
            </svg>`;
        }

        if (c.includes('NXT') || c.includes('NEXTEL')) {
            return `
            <svg viewBox="0 0 100 100" width="100%" height="100%">
                <rect width="100" height="100" rx="14" fill="#18181b"/>
                <circle cx="50" cy="50" r="38" fill="#da291c"/>
                <text x="50" y="58" font-family="'Outfit', sans-serif" font-weight="900" font-size="24" fill="#ffffff" text-anchor="middle">NXT</text>
            </svg>`;
        }

        if (c.includes('FIBRASIL')) {
            return `
            <svg viewBox="0 0 100 100" width="100%" height="100%">
                <defs>
                    <linearGradient id="fibrasilGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#00c0f3"/>
                        <stop offset="100%" stop-color="#4a00e0"/>
                    </linearGradient>
                </defs>
                <rect width="100" height="100" rx="14" fill="url(#fibrasilGrad)"/>
                <path d="M30 70 L30 30 Q45 25 55 35 Q65 45 55 55 L38 55 M30 45 L50 45" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
                <circle cx="70" cy="40" r="6" fill="#00ffff"/>
            </svg>`;
        }

        if (c.includes('TELEMONT')) {
            return `
            <svg viewBox="0 0 100 100" width="100%" height="100%">
                <rect width="100" height="100" rx="14" fill="#002d62"/>
                <path d="M25 35 L75 35 M50 35 L50 72" fill="none" stroke="#ff7900" stroke-width="9" stroke-linecap="round"/>
                <path d="M32 46 L68 46" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
            </svg>`;
        }

        if (c.includes('TLP')) {
            return `
            <svg viewBox="0 0 100 100" width="100%" height="100%">
                <rect width="100" height="100" rx="14" fill="#0353a4"/>
                <text x="50" y="60" font-family="'Outfit', sans-serif" font-weight="900" font-size="28" fill="#ffffff" text-anchor="middle" letter-spacing="1">TLP</text>
            </svg>`;
        }

        if (c.includes('WIP') || c.includes('TOWER')) {
            return `
            <svg viewBox="0 0 100 100" width="100%" height="100%">
                <rect width="100" height="100" rx="14" fill="#6d28d9"/>
                <path d="M50 20 L50 75 M35 75 L65 75 M40 50 L60 50 M44 35 L56 35" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
                <circle cx="50" cy="20" r="5" fill="#f59e0b"/>
            </svg>`;
        }

        // Outros Clientes
        return `
        <svg viewBox="0 0 100 100" width="100%" height="100%">
            <rect width="100" height="100" rx="14" fill="#334155"/>
            <path d="M30 70 L30 40 L50 25 L70 40 L70 70 Z" fill="none" stroke="#94a3b8" stroke-width="6" stroke-linejoin="round"/>
            <rect x="44" y="52" width="12" height="18" fill="#38bdf8"/>
        </svg>`;
    }

    function getCleanCustomerName(customerName) {
        const c = String(customerName || '').toUpperCase();
        if (c.includes('CLARO S.A')) return 'Claro S.A.';
        if (c.includes('CLARO NXT') || c.includes('NEXTEL')) return 'Claro NXT (Nextel)';
        if (c.includes('FIBRASIL')) return 'FiBrasil Infraestrutura';
        if (c.includes('TELEMONT')) return 'Telemont Engenharia';
        if (c.includes('TLP')) return 'TLP CP Serviços';
        if (c.includes('WIP') || c.includes('TOWER')) return 'AP Wip Tower';
        return customerName || 'Outros';
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

        // 1. Atualizar KPIs Cards (Valores do Período)
        set('revenue', money(totalRevenue));
        set('expense', money(totalExpense));
        set('result', money(totalResult));

        const revCount = filteredRecords.filter(r => r.kind === 'revenue').length;
        const expCount = filteredRecords.filter(r => r.kind === 'expense').length;

        set('revenue-note', totalRevenue == null ? 'Faturamento indisponível' : `${revCount.toLocaleString('pt-BR')} notas · faturado bruto ERP`);
        set('expense-note', (state.customer !== 'ALL' && state.customer) ? 'Despesas sem vínculo com cliente ERP' : totalExpense == null ? 'Despesas indisponíveis' : `${expCount.toLocaleString('pt-BR')} saídas · sem transferências`);

        // 2. CALCULAR E EXIBIR SEMPRE A RECEITA E DESPESA DO MÊS ANTERIOR (REQUISITO 1)
        let prevPeriod = null;
        let prevRev = null;
        let prevExp = null;
        let prevRes = null;

        if (state.month !== 'ALL') {
            const idx = data.months.findIndex(m => m.period === state.month);
            if (idx > 0) {
                prevPeriod = data.months[idx - 1].period;
            }
        } else {
            // No acumulado, pegar o penúltimo mês comparável vs último mês comparável
            const compMonths = data.months.filter(m => m.comparable);
            if (compMonths.length >= 2) {
                prevPeriod = compMonths[compMonths.length - 2].period; // ex: Agosto/2026
            }
        }

        if (prevPeriod) {
            const prevRs = data.records.filter(r => r.period === prevPeriod && matches(r));
            const mMeta = data.months.find(m => m.period === prevPeriod);
            prevRev = mMeta?.revenue == null ? null : sum(prevRs, 'revenue');
            prevExp = (state.customer !== 'ALL' && state.customer) || mMeta?.expense == null ? null : sum(prevRs, 'expense');
            prevRes = (prevRev == null || prevExp == null) ? null : Math.round((prevRev - prevExp) * 100) / 100;
        }

        // Receita do Mês Anterior
        const revPrevEl = el('revenue-prev');
        if (revPrevEl) {
            if (prevRev != null) {
                let diffPctStr = '';
                if (totalRevenue != null && prevRev > 0) {
                    const diffPct = ((totalRevenue - prevRev) / prevRev) * 100;
                    const sign = diffPct >= 0 ? '+' : '';
                    const color = diffPct >= 0 ? '#10b981' : '#e74c3c';
                    const icon = diffPct >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
                    diffPctStr = ` <span style="color: ${color}; font-weight: 700; margin-left: 4px;"><i class="fa-solid ${icon}"></i> ${sign}${diffPct.toFixed(1).replace('.', ',')}%</span>`;
                }
                revPrevEl.innerHTML = `Mês Ant. (${shortMonthLabel(prevPeriod)}): <strong>${money(prevRev)}</strong>${diffPctStr}`;
            } else {
                revPrevEl.innerHTML = `Mês Anterior: <strong>—</strong>`;
            }
        }

        // Despesa do Mês Anterior
        const expPrevEl = el('expense-prev');
        if (expPrevEl) {
            if (prevExp != null) {
                let diffPctStr = '';
                if (totalExpense != null && prevExp > 0) {
                    const diffPct = ((totalExpense - prevExp) / prevExp) * 100;
                    const sign = diffPct >= 0 ? '+' : '';
                    // Para despesas, redução é positivo (#10b981), aumento é alerta (#f59e0b)
                    const color = diffPct <= 0 ? '#10b981' : '#f59e0b';
                    const icon = diffPct >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
                    diffPctStr = ` <span style="color: ${color}; font-weight: 700; margin-left: 4px;"><i class="fa-solid ${icon}"></i> ${sign}${diffPct.toFixed(1).replace('.', ',')}%</span>`;
                }
                expPrevEl.innerHTML = `Mês Ant. (${shortMonthLabel(prevPeriod)}): <strong>${money(prevExp)}</strong>${diffPctStr}`;
            } else {
                expPrevEl.innerHTML = `Mês Anterior: <strong>—</strong>`;
            }
        }

        // Resultado do Mês Anterior
        const resPrevEl = el('result-prev');
        if (resPrevEl) {
            if (prevRes != null) {
                const color = prevRes >= 0 ? '#2ecc71' : '#e74c3c';
                resPrevEl.innerHTML = `Mês Ant. (${shortMonthLabel(prevPeriod)}): <strong style="color: ${color};">${money(prevRes)}</strong>`;
            } else {
                resPrevEl.innerHTML = `Mês Anterior: <strong>—</strong>`;
            }
        }

        // Formatação do Card de Resultado
        const resultCard = el('result-card');
        const resultNoteEl = el('result-note');

        if (resultCard) {
            resultCard.classList.toggle('is-negative', totalResult != null && totalResult < 0);
            resultCard.classList.toggle('is-positive', totalResult != null && totalResult >= 0);
        }

        if (totalResult != null) {
            const marginStr = totalRevenue ? pct(totalResult, totalRevenue) : '0,0%';
            if (resultNoteEl) resultNoteEl.textContent = `Margem Líquida: ${marginStr}`;
        } else {
            if (resultNoteEl) resultNoteEl.textContent = (state.customer !== 'ALL' && state.customer) ? 'Resultado por cliente indisponível' : 'Aguardando fontes completas';
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

        // 3. Renderizar Gráficos, Minicards de Clientes e Mapa de Estados
        updateGranularityButtons();
        renderEvolutionChart(data, filteredRecords, periods);
        renderCustomersMinicards(filteredRecords);
        renderBanksChart(filteredRecords);
        renderUfMap(filteredRecords);
        renderMonthlyTable(data, monthlySummaries);
        renderRecordsTable(filteredRecords);
    }

    // ============================================================
    // CONTROLES DE GRANULARIDADE (DIÁRIO, SEMANAL, MENSAL)
    // ============================================================
    function updateGranularityButtons() {
        const isAllSelected = state.month === 'ALL';
        const isMobile = window.innerWidth <= 768;

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
            const isAll = state.month === 'ALL';
            set('chart-title', isAll ? 'Evolução Mensal Consolidada' : `Evolução Mensal (Visão Geral) · ${monthLabel(state.month)}`);
            set('chart-note', 'Faturamento bruto ERP vs saídas bancárias · Clique em um mês para detalhar');

            chartLabels = data.months.map(m => shortMonthLabel(m.period));

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
    // 2. MINICARDS COM LOGOS DOS CLIENTES (REQUISITO 2)
    // ============================================================
    function renderCustomersMinicards(records) {
        const container = el('customer-cards');
        if (!container) return;

        const backContainer = el('customers-back-container');
        if (backContainer) {
            if (state.customer !== 'ALL' && state.customer) {
                backContainer.innerHTML = `<button class="exec-back-btn" onclick="window.clearExecutivoCustomer()"><i class="fa-solid fa-arrow-left"></i> Ver Todos</button>`;
            } else {
                backContainer.innerHTML = '';
            }
        }

        const revRecords = records.filter(r => r.kind === 'revenue');
        const byCustomer = {};

        revRecords.forEach(r => {
            const rawName = r.customer || 'Não Identificado';
            if (!byCustomer[rawName]) {
                byCustomer[rawName] = { value: 0, count: 0 };
            }
            byCustomer[rawName].value += r.value;
            byCustomer[rawName].count++;
        });

        const totalRev = revRecords.reduce((s, r) => s + r.value, 0) || 1;
        const sorted = Object.entries(byCustomer).sort((a, b) => b[1].value - a[1].value);

        // Pegar os top 5 clientes individuais e agrupar os demais em "Demais Clientes"
        const topClients = sorted.slice(0, 5);
        const remainder = sorted.slice(5);

        container.replaceChildren();

        if (!sorted.length) {
            const emptyEl = document.createElement('div');
            emptyEl.style.padding = '30px';
            emptyEl.style.textAlign = 'center';
            emptyEl.style.color = 'var(--text-secondary)';
            emptyEl.textContent = 'Nenhum faturamento registrado para os filtros ativos.';
            container.appendChild(emptyEl);
            return;
        }

        topClients.forEach(([rawName, dataObj]) => {
            const cleanName = getCleanCustomerName(rawName);
            const logoSvg = getCustomerLogoSvg(rawName);
            const pctStr = ((dataObj.value / totalRev) * 100).toFixed(1).replace('.', ',') + '%';
            const isActive = state.customer === rawName;

            const card = document.createElement('div');
            card.className = `exec-client-card ${isActive ? 'active' : ''}`;
            card.onclick = () => window.toggleExecutivoCustomer(rawName);

            card.innerHTML = `
                <div class="exec-client-logo-box">
                    ${logoSvg}
                </div>
                <div class="exec-client-details">
                    <div class="exec-client-top">
                        <span class="exec-client-title" title="${rawName}">${cleanName}</span>
                        <span class="exec-client-share">${pctStr}</span>
                    </div>
                    <div class="exec-client-bottom">
                        <span class="exec-client-amount">${money(dataObj.value)}</span>
                        <span class="exec-client-sub">${dataObj.count} ${dataObj.count === 1 ? 'nota' : 'notas'}</span>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

        // Se houver mais clientes, adicionar minicard consolidado "Demais Clientes"
        if (remainder.length > 0) {
            const remVal = remainder.reduce((s, r) => s + r[1].value, 0);
            const remCount = remainder.reduce((s, r) => s + r[1].count, 0);
            const remPctStr = ((remVal / totalRev) * 100).toFixed(1).replace('.', ',') + '%';

            const card = document.createElement('div');
            card.className = `exec-client-card`;
            card.style.opacity = '0.9';

            card.innerHTML = `
                <div class="exec-client-logo-box">
                    ${getCustomerLogoSvg('OUTROS')}
                </div>
                <div class="exec-client-details">
                    <div class="exec-client-top">
                        <span class="exec-client-title">Demais Clientes (${remainder.length})</span>
                        <span class="exec-client-share" style="color: #a855f7; background: rgba(168, 85, 247, 0.12);">${remPctStr}</span>
                    </div>
                    <div class="exec-client-bottom">
                        <span class="exec-client-amount" style="color: #a855f7;">${money(remVal)}</span>
                        <span class="exec-client-sub">${remCount} notas</span>
                    </div>
                </div>
            `;
            container.appendChild(card);
        }
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
    // 4. MAPA DE ESTADOS INTERATIVO (REQUISITO 3)
    // ============================================================
    function renderUfMap(records) {
        const mapContainer = el('map-container');
        if (!mapContainer) return;

        const revRecords = records.filter(r => r.kind === 'revenue');
        const expRecords = records.filter(r => r.kind === 'expense');

        const ufMetrics = {
            'PR': { faturamento: 0, txCount: 0 },
            'SC': { faturamento: 0, txCount: 0 },
            'RS': { faturamento: 0, txCount: 0 },
            'OUTROS': { faturamento: 0, txCount: 0 }
        };

        revRecords.forEach(r => {
            const uf = r.uf;
            if (uf === 'PR' || uf === 'SC' || uf === 'RS') {
                ufMetrics[uf].faturamento += r.value;
                ufMetrics[uf].txCount++;
            } else {
                ufMetrics['OUTROS'].faturamento += r.value;
                ufMetrics['OUTROS'].txCount++;
            }
        });

        const maxFat = Math.max(ufMetrics.PR.faturamento, ufMetrics.SC.faturamento, ufMetrics.RS.faturamento, 1);

        const getColorForUF = (uf) => {
            const fat = ufMetrics[uf]?.faturamento || 0;
            const opacity = fat > 0 ? (0.25 + 0.7 * (fat / maxFat)) : 0.12;
            return `rgba(0, 79, 113, ${opacity.toFixed(2)})`;
        };

        const isSelectPR = state.uf === 'PR' ? 'active' : (state.uf !== 'ALL' ? 'dimmed' : '');
        const isSelectSC = state.uf === 'SC' ? 'active' : (state.uf !== 'ALL' ? 'dimmed' : '');
        const isSelectRS = state.uf === 'RS' ? 'active' : (state.uf !== 'ALL' ? 'dimmed' : '');
        const isSelectOutros = (state.uf !== 'ALL' && state.uf !== 'PR' && state.uf !== 'SC' && state.uf !== 'RS') ? 'active' : (state.uf !== 'ALL' ? 'dimmed' : '');

        mapContainer.innerHTML = `
            <div class="uf-premium-container">
                <div class="uf-map-side">
                    <svg class="map-svg-centered" viewBox="125 242 136 136" style="overflow: visible;">
                        <!-- PARANÁ -->
                        <polygon class="map-state ${isSelectPR}" id="exec-state-PR" points="
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
                            onclick="window.toggleExecutivoUF('PR')">
                        </polygon>
                        <text class="map-label ${isSelectPR}" x="205" y="272" style="font-size: 3.5px;" onclick="window.toggleExecutivoUF('PR')">PR</text>

                        <!-- SANTA CATARINA -->
                        <polygon class="map-state ${isSelectSC}" id="exec-state-SC" points="
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
                            onclick="window.toggleExecutivoUF('SC')">
                        </polygon>
                        <text class="map-label ${isSelectSC}" x="215" y="298" style="font-size: 3.5px;" onclick="window.toggleExecutivoUF('SC')">SC</text>

                        <!-- RIO GRANDE DO SUL -->
                        <polygon class="map-state ${isSelectRS}" id="exec-state-RS" points="
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
                            onclick="window.toggleExecutivoUF('RS')">
                        </polygon>
                        <text class="map-label ${isSelectRS}" x="186" y="335" style="font-size: 3.5px;" onclick="window.toggleExecutivoUF('RS')">RS</text>
                    </svg>
                </div>

                <!-- PARANÁ CAPSULE -->
                <div class="uf-compact-card pr-card ${isSelectPR}" onclick="window.toggleExecutivoUF('PR')">
                    <div class="uf-compact-header">
                        <span class="uf-compact-name"><span class="uf-status-indicator pr-dot"></span><strong>Paraná</strong></span>
                    </div>
                    <div class="uf-compact-content">
                        <div class="uf-compact-main-stat">
                            <span class="uf-stat-label"><i class="fa-solid fa-file-invoice"></i> Notas ERP</span>
                            <span class="uf-stat-value">${ufMetrics.PR.txCount}</span>
                        </div>
                        <div class="uf-compact-sub-stats">
                            <div class="uf-sub-stat success">
                                <span class="uf-sub-val success">${money(ufMetrics.PR.faturamento)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- SANTA CATARINA CAPSULE -->
                <div class="uf-compact-card sc-card ${isSelectSC}" onclick="window.toggleExecutivoUF('SC')">
                    <div class="uf-compact-header">
                        <span class="uf-compact-name"><span class="uf-status-indicator sc-dot"></span><strong>Santa Catarina</strong></span>
                    </div>
                    <div class="uf-compact-content">
                        <div class="uf-compact-main-stat">
                            <span class="uf-stat-label"><i class="fa-solid fa-file-invoice"></i> Notas ERP</span>
                            <span class="uf-stat-value">${ufMetrics.SC.txCount}</span>
                        </div>
                        <div class="uf-compact-sub-stats">
                            <div class="uf-sub-stat success">
                                <span class="uf-sub-val success">${money(ufMetrics.SC.faturamento)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- RIO GRANDE DO SUL CAPSULE -->
                <div class="uf-compact-card rs-card ${isSelectRS}" onclick="window.toggleExecutivoUF('RS')">
                    <div class="uf-compact-header">
                        <span class="uf-compact-name"><span class="uf-status-indicator rs-dot"></span><strong>Rio Grande do Sul</strong></span>
                    </div>
                    <div class="uf-compact-content">
                        <div class="uf-compact-main-stat">
                            <span class="uf-stat-label"><i class="fa-solid fa-file-invoice"></i> Notas ERP</span>
                            <span class="uf-stat-value">${ufMetrics.RS.txCount}</span>
                        </div>
                        <div class="uf-compact-sub-stats">
                            <div class="uf-sub-stat success">
                                <span class="uf-sub-val success">${money(ufMetrics.RS.faturamento)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- OUTROS ESTADOS (SE HOUVER) -->
                ${ufMetrics.OUTROS.faturamento > 0 ? `
                <div class="uf-compact-card outros-card ${isSelectOutros}" onclick="window.toggleExecutivoUF('OUTROS')" style="right: 8px; bottom: 15px; border-left-color: #a855f7;">
                    <div class="uf-compact-header">
                        <span class="uf-compact-name"><span class="uf-status-indicator" style="background:#a855f7; box-shadow:0 0 6px #a855f7;"></span><strong>Demais Estados</strong></span>
                    </div>
                    <div class="uf-compact-content">
                        <div class="uf-compact-main-stat">
                            <span class="uf-stat-label"><i class="fa-solid fa-file-invoice"></i> Notas ERP</span>
                            <span class="uf-stat-value">${ufMetrics.OUTROS.txCount}</span>
                        </div>
                        <div class="uf-compact-sub-stats">
                            <div class="uf-sub-stat success">
                                <span class="uf-sub-val success">${money(ufMetrics.OUTROS.faturamento)}</span>
                            </div>
                        </div>
                    </div>
                </div>` : ''}
            </div>
        `;
    }

    // ============================================================
    // 5. TABELA RESUMO MENSAL (CONSOLIDADO DO EXERCÍCIO)
    // ============================================================
    function renderMonthlyTable(data, monthlySummaries) {
        const body = el('monthly-body');
        if (!body) return;
        body.replaceChildren();

        let totRev = 0, totExp = 0, totRes = 0;

        for (const m of data.months) {
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

                const tdDate = document.createElement('td');
                tdDate.textContent = r.date ? r.date.split('-').reverse().join('/') : '—';
                tdDate.style.fontWeight = '500';
                tr.appendChild(tdDate);

                const tdKind = document.createElement('td');
                tdKind.style.textAlign = 'center';
                tdKind.innerHTML = r.kind === 'revenue'
                    ? `<span class="exec-badge-kind revenue"><i class="fa-solid fa-arrow-down-left"></i> Receita</span>`
                    : `<span class="exec-badge-kind expense"><i class="fa-solid fa-arrow-up-right"></i> Despesa</span>`;
                tr.appendChild(tdKind);

                const tdDesc = document.createElement('td');
                tdDesc.style.maxWidth = '400px';
                tdDesc.style.whiteSpace = 'normal';
                if (r.customer) {
                    tdDesc.innerHTML = `<strong style="color: var(--text-primary);">${r.customer}</strong> <span style="color: var(--text-secondary); font-size: 12px;">(${r.description})</span>`;
                } else {
                    tdDesc.textContent = r.description || '—';
                }
                tr.appendChild(tdDesc);

                const tdUf = document.createElement('td');
                tdUf.style.textAlign = 'center';
                tdUf.innerHTML = `<span class="exec-badge-uf">${r.uf || 'N/D'}</span>`;
                tr.appendChild(tdUf);

                const tdCat = document.createElement('td');
                const catInfo = [r.bank, r.category].filter(Boolean).join(' · ');
                tdCat.textContent = catInfo || '—';
                tdCat.style.color = 'var(--text-secondary)';
                tdCat.style.fontSize = '12.5px';
                tr.appendChild(tdCat);

                const tdVal = document.createElement('td');
                tdVal.style.textAlign = 'right';
                tdVal.style.fontWeight = '700';
                tdVal.textContent = (r.kind === 'revenue' ? '+ ' : '- ') + money(r.value);
                tdVal.className = r.kind === 'revenue' ? 'cell-pos' : 'cell-neg';
                tr.appendChild(tdVal);

                body.appendChild(tr);
            });
        }

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
        state.granularity = window.innerWidth <= 768 ? 'weekly' : 'daily';
        state.userSelectedGranularity = null;
        state.page = 0;
        render();
    };

    window.toggleExecutivoCustomer = function (custName) {
        if (state.customer === custName) {
            state.customer = 'ALL';
        } else {
            state.customer = custName;
        }
        if (el('customer')) el('customer').value = state.customer;
        state.page = 0;
        render();
    };

    window.clearExecutivoCustomer = function () {
        state.customer = 'ALL';
        if (el('customer')) el('customer').value = 'ALL';
        state.page = 0;
        render();
    };

    window.toggleExecutivoUF = function (ufCode) {
        if (state.uf === ufCode) {
            state.uf = 'ALL';
        } else {
            state.uf = ufCode;
        }
        if (el('uf')) el('uf').value = state.uf;
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
