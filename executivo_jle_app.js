// Visao executiva JLE: faturamento bruto ERP x saidas bancarias do mesmo mes.
(function () {
    'use strict';
    let selected = null;
    let chart = null;
    let page = 0;
    let installed = false;
    const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const money = n => n == null ? '—' : brl.format(n);
    const label = period => {
        const [year, month] = period.split('-').map(Number);
        return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
    };
    const shortLabel = period => `${period.slice(5)}/${period.slice(0, 4)}`;
    const el = id => document.getElementById(`exec-jle-${id}`);
    const set = (id, value) => { if (el(id)) el(id).textContent = value; };
    const rows = () => window.EXECUTIVO_JLE_DATA?.months || [];
    const good = n => n == null ? '' : n >= 0 ? 'exec-jle-positive' : 'exec-jle-negative';

    function render() {
        const data = window.EXECUTIVO_JLE_DATA;
        if (!data?.months?.length) {
            set('notice', 'Base consolidada indisponível. Atualize os dados para continuar.');
            return;
        }
        const all = rows();
        const matched = all.filter(m => m.comparable);
        const current = selected === 'ALL' ? {
            revenue: matched.reduce((s, m) => s + m.revenue, 0),
            expense: matched.reduce((s, m) => s + m.expense, 0),
            result: matched.reduce((s, m) => s + m.result, 0),
            comparable: matched.length > 0,
            revenue_count: matched.reduce((s, m) => s + m.revenue_count, 0),
            expense_count: matched.reduce((s, m) => s + m.expense_count, 0),
            net_revenue: matched.reduce((s, m) => s + m.net_revenue, 0),
            withholding: matched.reduce((s, m) => s + m.withholding, 0)
        } : all.find(m => m.period === selected);
        if (!current) return;
        const caption = selected === 'ALL' ? `Acumulado comparável · ${shortLabel(matched[0].period)} a ${shortLabel(matched.at(-1).period)}` : label(selected);
        set('period-label', caption);
        set('revenue', money(current.revenue));
        set('expense', money(current.expense));
        set('result', money(current.result));
        set('revenue-detail', current.revenue == null ? 'Sem notas neste mês.' : `No período selecionado: bruto ${money(current.revenue)} − retenções ${money(current.withholding)} = líquido faturado ${money(current.net_revenue)}.`);
        el('result')?.classList.remove('exec-jle-positive', 'exec-jle-negative');
        if (good(current.result)) el('result')?.classList.add(good(current.result));
        set('revenue-note', current.revenue == null ? 'Faturamento ainda não disponível neste mês' : `${current.revenue_count.toLocaleString('pt-BR')} notas · bruto faturado no ERP`);
        set('expense-note', current.expense == null ? 'Movimentação bancária ainda não disponível' : `${current.expense_count.toLocaleString('pt-BR')} saídas · transferências excluídas`);
        set('result-note', !current.comparable ? 'Aguardando as duas fontes do mês' : current.revenue ? `${(current.result / current.revenue * 100).toFixed(1).replace('.', ',')}% da receita · ${current.result >= 0 ? 'receita acima das despesas' : 'despesas acima da receita'}` : 'Receita menos despesas');
        const incomplete = all.filter(m => !m.comparable);
        set('notice', selected !== 'ALL' && !current.comparable
            ? `${label(selected)}: ${current.revenue == null ? 'sem faturamento na aba RECEITA' : 'sem movimentação bancária'}. O resultado não é calculado até as duas fontes estarem disponíveis.`
            : incomplete.length ? `${incomplete.map(m => shortLabel(m.period)).join(', ')}: fonte incompleta, fora do acumulado comparável. Último mês com as duas fontes: ${shortLabel(data.metadata.default_period)}.` : 'Receita e despesas consolidadas nos mesmos meses.');
        set('source', `Fonte: ${data.metadata.source_file} · última nota: ${data.metadata.last_invoice_date.split('-').reverse().join('/')} · últimas despesas: ${data.metadata.last_expense_date?.split('-').reverse().join('/') || 'N/D'}${data.metadata.fallback ? ' · usando cópia de contingência' : ''}`);
        renderTable(all);
        renderChart(all);
    }

    function renderTable(all) {
        const tbody = el('monthly-body');
        tbody.replaceChildren();
        for (const m of all.slice(page * 50, (page + 1) * 50)) {
            const tr = document.createElement('tr');
            tr.className = m.period === selected ? 'exec-jle-selected' : '';
            const fields = [shortLabel(m.period), money(m.revenue), money(m.expense), money(m.result), m.comparable ? 'Fontes disponíveis' : 'Fonte incompleta'];
            fields.forEach((v, i) => {
                const td = document.createElement('td');
                if (i === 0) {
                    const button = document.createElement('button'); button.type = 'button';
                    button.className = 'exec-jle-month-link'; button.textContent = v;
                    button.setAttribute('aria-label', `Ver ${label(m.period)}`);
                    button.onclick = () => { selected = m.period; el('month').value = selected; render(); };
                    td.append(button);
                } else { td.textContent = v; }
                if (i === 3 && good(m.result)) td.className = good(m.result);
                if (i === 4 && !m.comparable) td.className = 'exec-jle-pending';
                tr.append(td);
            });
            tbody.append(tr);
        }
        el('pagination').hidden = all.length <= 50;
        el('previous').disabled = page === 0;
        el('next').disabled = (page + 1) * 50 >= all.length;
        set('page', `${page + 1} de ${Math.ceil(all.length / 50)}`);
    }

    function renderChart(all) {
        if (chart) { chart.destroy(); chart = null; }
        if (typeof Chart === 'undefined') return;
        const style = getComputedStyle(document.body);
        const color = style.getPropertyValue('--text-secondary').trim() || '#8a99a8';
        const border = style.getPropertyValue('--border-color').trim() || '#20313f';
        chart = new Chart(el('chart'), {
            type: 'bar',
            data: { labels: all.map(m => shortLabel(m.period)), datasets: [
                { label: 'Receita bruta', data: all.map(m => m.revenue), backgroundColor: '#10b981', borderRadius: 4 },
                { label: 'Despesas', data: all.map(m => m.expense), backgroundColor: '#f59e0b', borderRadius: 4 },
                { type: 'line', label: 'Resultado', data: all.map(m => m.result), borderColor: '#388bfd', backgroundColor: '#388bfd', pointRadius: 4, borderWidth: 2, tension: .2, spanGaps: false }
            ] },
            options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                plugins: { datalabels: { display: false }, legend: { position: 'bottom', labels: { color, boxWidth: 12, usePointStyle: true } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.raw)}` } } },
                scales: { x: { grid: { display: false }, ticks: { color } }, y: { grid: { color: border }, ticks: { color, callback: n => new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL', maximumFractionDigits: 1 }).format(n) } } },
                onClick: (_, elements) => { if (elements.length) { selected = all[elements[0].index].period; el('month').value = selected; render(); } }
            }
        });
    }

    window.initExecutivoJle = function () {
        if (!el('month')) return;
        const all = rows();
        if (!all.length) { render(); return; }
        if (!selected || (selected !== 'ALL' && !all.some(m => m.period === selected))) selected = window.EXECUTIVO_JLE_DATA.metadata.default_period;
        const select = el('month'); select.replaceChildren();
        const accumulated = document.createElement('option'); accumulated.value = 'ALL'; accumulated.textContent = 'Acumulado comparável'; select.append(accumulated);
        for (const m of all) { const opt = document.createElement('option'); opt.value = m.period; opt.textContent = `${label(m.period)}${m.comparable ? '' : ' · fonte incompleta'}`; select.append(opt); }
        select.value = selected;
        if (!installed) {
            installed = true;
            select.addEventListener('change', () => { selected = select.value; render(); });
            el('latest').onclick = () => { selected = window.EXECUTIVO_JLE_DATA.metadata.default_period; select.value = selected; render(); };
            el('previous').onclick = () => { page--; render(); };
            el('next').onclick = () => { page++; render(); };
            new MutationObserver(() => { if (window.activeView === 'executivo') render(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        }
        render();
    };
})();
