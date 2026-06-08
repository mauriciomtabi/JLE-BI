// veiculos_app.js - Dashboard de Veículos JLE BI
// Padrão visual e funcional idêntico ao Dashboard Financeiro
// Build trigger: 202606081933

// ── Estado Global ──────────────────────────────────────────────────────────
let activeVeiculosTab      = 'indicators';
let filteredVeiculosData   = [];
let chartVeiculosInstances = {};
let veiculosDataLoaded     = false;
let veiculosEvolutionGranularity = 'mensal'; // 'mensal' | 'semanal' | 'diario'

// Drill-down de condutor
let driverDrillState = { active: false, driver: null };
// Drill-down de veículo
let vehicleDrillState = { active: false, plate: null };

// Paginação / ordenação da tabela
let tableVeiculosPage           = 1;
const tableVeiculosRowsPerPage  = 50;
let tableVeiculosSortColumn     = 'date';
let tableVeiculosSortDirection  = 'asc';
let tableVeiculosSearchQuery    = '';

// ── Inicialização ─────────────────────────────────────────────────────────
function initVeiculos() {
    if (typeof VEICULOS_DATA === 'undefined') {
        console.error('VEICULOS_DATA não carregado.');
        return;
    }
    filteredVeiculosData = [...VEICULOS_DATA];

    populateVeiculosFilters();
    initVeiculosEventListeners();
    applyVeiculosFilters();

    veiculosDataLoaded = true;
}

// ── Listeners ─────────────────────────────────────────────────────────────
function initVeiculosEventListeners() {
    // Abas
    document.querySelectorAll('#view-veiculos-container .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchVeiculosTab(btn.getAttribute('data-tab')));
    });

    // Filtros
    ['filter-veiculos-month','filter-veiculos-uf','filter-veiculos-fuel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', applyVeiculosFilters);
    });
    ['filter-veiculos-driver','filter-veiculos-plate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', applyVeiculosFilters);
    });

    const resetBtn = document.getElementById('btn-veiculos-reset');
    if (resetBtn) resetBtn.addEventListener('click', resetVeiculosFilters);

    // Busca na tabela
    const searchEl = document.getElementById('table-veiculos-search');
    if (searchEl) {
        searchEl.addEventListener('input', e => {
            tableVeiculosSearchQuery = e.target.value;
            tableVeiculosPage = 1;
            renderVeiculosTable();
        });
    }

    // Ordenação de colunas
    document.querySelectorAll('#view-veiculos-container .data-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => handleVeiculosTableSort(th.getAttribute('data-sort')));
    });

    // Paginação
    const prevBtn = document.getElementById('btn-veiculos-page-prev');
    const nextBtn = document.getElementById('btn-veiculos-page-next');
    if (prevBtn) prevBtn.addEventListener('click', () => { if (tableVeiculosPage > 1) { tableVeiculosPage--; renderVeiculosTable(); } });
    if (nextBtn) nextBtn.addEventListener('click', () => {
        const total = Math.ceil(getVeiculosTableFilteredData().length / tableVeiculosRowsPerPage);
        if (tableVeiculosPage < total) { tableVeiculosPage++; renderVeiculosTable(); }
    });

    // Botões de granularidade
    document.querySelectorAll('#view-veiculos-container .btn-granularidade-veiculos').forEach(btn => {
        btn.addEventListener('click', () => {
            setVeiculosEvolutionGranularity(btn.getAttribute('data-gran'));
        });
    });

    // Tema
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) themeBtn.addEventListener('click', () => setTimeout(updateVeiculosCharts, 100));
}

// ── Granularidade do Gráfico de Evolução ──────────────────────────────────
function setVeiculosEvolutionGranularity(g) {
    veiculosEvolutionGranularity = g;
    document.querySelectorAll('#view-veiculos-container .btn-granularidade-veiculos').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-gran') === g);
    });
    updateVeiculosCharts();
}

// ── Popula filtros dinamicamente ──────────────────────────────────────────
function populateVeiculosFilters() {
    // Competência/Mês
    const monthSelect = document.getElementById('filter-veiculos-month');
    if (monthSelect) {
        const monthOrder = {
            'JANEIRO':1,'FEVEREIRO':2,'MARÇO':3,'MARCO':3,'ABRIL':4,
            'MAIO':5,'JUNHO':6,'JULHO':7,'AGOSTO':8,
            'SETEMBRO':9,'OUTUBRO':10,'NOVEMBRO':11,'DEZEMBRO':12
        };
        const uniqueMonths = [...new Set(VEICULOS_DATA.map(r => r.month))]
            .filter(m => m && m !== '')
            .sort((a, b) => (monthOrder[a] || 99) - (monthOrder[b] || 99));

        monthSelect.innerHTML = '<option value="all">Todos os Meses</option>';
        uniqueMonths.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m.charAt(0) + m.slice(1).toLowerCase();
            monthSelect.appendChild(opt);
        });
    }

    // Combustível
    const fuelSelect = document.getElementById('filter-veiculos-fuel');
    if (fuelSelect) {
        const fuels = [...new Set(VEICULOS_DATA.map(r => r.fuel).filter(Boolean))].sort();
        fuelSelect.innerHTML = '<option value="all">Todas as Categorias</option>';
        fuels.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            fuelSelect.appendChild(opt);
        });
    }

    // Datalists
    const drivers = [...new Set(VEICULOS_DATA.map(r => r.driver).filter(Boolean))].sort();
    const plates  = [...new Set(VEICULOS_DATA.map(r => r.plate).filter(Boolean))].sort();

    const driverList = document.getElementById('veiculos-driver-list');
    if (driverList) {
        driverList.innerHTML = '';
        drivers.forEach(d => { const o = document.createElement('option'); o.value = d; driverList.appendChild(o); });
    }
    const plateList = document.getElementById('veiculos-plate-list');
    if (plateList) {
        plateList.innerHTML = '';
        plates.forEach(p => { const o = document.createElement('option'); o.value = p; plateList.appendChild(o); });
    }
}

// ── Reset ─────────────────────────────────────────────────────────────────
function resetVeiculosFilters() {
    ['filter-veiculos-month','filter-veiculos-uf','filter-veiculos-fuel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 'all';
    });
    ['filter-veiculos-driver','filter-veiculos-plate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    driverDrillState  = { active: false, driver: null };
    vehicleDrillState = { active: false, plate: null };
    applyVeiculosFilters();
}

// ── Aplicar Filtros ───────────────────────────────────────────────────────
function applyVeiculosFilters() {
    const month  = document.getElementById('filter-veiculos-month')?.value || 'all';
    const uf     = document.getElementById('filter-veiculos-uf')?.value    || 'all';
    const fuel   = document.getElementById('filter-veiculos-fuel')?.value  || 'all';
    const driver = (document.getElementById('filter-veiculos-driver')?.value || '').trim().toUpperCase();
    const plate  = (document.getElementById('filter-veiculos-plate')?.value  || '').trim().toUpperCase();

    filteredVeiculosData = VEICULOS_DATA.filter(r => {
        if (month !== 'all' && r.month !== month) return false;
        if (uf    !== 'all' && r.uf    !== uf)    return false;
        if (fuel  !== 'all' && r.fuel  !== fuel)  return false;
        if (driver && !(r.driver || '').toUpperCase().includes(driver)) return false;
        if (plate  && !(r.plate  || '').toUpperCase().includes(plate))  return false;
        return true;
    });

    // Reset drill-downs ao mudar filtros
    driverDrillState  = { active: false, driver: null };
    vehicleDrillState = { active: false, plate: null };

    tableVeiculosPage = 1;
    updateVeiculosCompetenceBadge();
    updateVeiculosKPIs();

    if (activeVeiculosTab === 'indicators') {
        updateVeiculosCharts();
    } else {
        renderVeiculosTable();
    }
}

// ── Badge de Competência ──────────────────────────────────────────────────
function updateVeiculosCompetenceBadge() {
    const sel = document.getElementById('filter-veiculos-month');
    if (!sel) return;
    const mesText = sel.options[sel.selectedIndex].text;
    const subtitleEl = document.getElementById('view-subtitle');
    if (subtitleEl) {
        subtitleEl.innerHTML = `Gestão de Frota e Controle de Combustível. <span class="badge-competencia">Competência: ${mesText}</span>`;
    }
}

// ── KPIs ──────────────────────────────────────────────────────────────────
function updateVeiculosKPIs() {
    const totalSpent  = filteredVeiculosData.reduce((s, r) => s + r.value, 0);
    const totalCount  = filteredVeiculosData.length;
    const avgSpent    = totalCount > 0 ? totalSpent / totalCount : 0;
    const vehicles    = new Set(filteredVeiculosData.map(r => r.plate).filter(Boolean));
    const drivers     = new Set(filteredVeiculosData.map(r => r.driver).filter(Boolean));
    const richRecs    = filteredVeiculosData.filter(r => r.liters !== null && r.liters > 0);
    const totalLiters = richRecs.reduce((s, r) => s + r.liters, 0);

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('kpi-veiculos-total',          fmtBRL(totalSpent));
    set('kpi-veiculos-count',          totalCount.toLocaleString('pt-BR'));
    set('kpi-veiculos-avg',            fmtBRL(avgSpent));
    set('kpi-veiculos-active-vehicles',vehicles.size.toLocaleString('pt-BR'));
    set('kpi-veiculos-active-drivers', drivers.size.toLocaleString('pt-BR'));
    set('kpi-veiculos-liters',         totalLiters.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' L');

    // Cards Regionais
    const regional = { SC:{spent:0,count:0}, RS:{spent:0,count:0}, PR:{spent:0,count:0} };
    filteredVeiculosData.forEach(r => {
        if (regional[r.uf]) { regional[r.uf].spent += r.value; regional[r.uf].count++; }
    });
    ['SC','RS','PR'].forEach(uf => {
        const d   = regional[uf];
        const pct = totalSpent > 0 ? (d.spent / totalSpent) * 100 : 0;
        set(`balance-veiculos-${uf}`, fmtBRL(d.spent));
        set(`count-veiculos-${uf}`,   d.count.toLocaleString('pt-BR'));
        set(`pct-veiculos-${uf}`,     pct.toFixed(1) + '%');
        const bar = document.getElementById(`progress-veiculos-${uf}`);
        if (bar) bar.style.width = pct + '%';
    });
}

// ── Utilitários ───────────────────────────────────────────────────────────
function fmtBRL(v) {
    return v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

function fmtBRLCompact(v) {
    if (v >= 1e6) return 'R$ ' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return 'R$ ' + (v / 1e3).toFixed(0) + 'k';
    return 'R$ ' + v.toFixed(0);
}

function shortName(name) {
    if (!name) return '';
    const p = name.split(' ');
    if (p.length <= 2) return name;
    return p[0] + ' ' + p[p.length - 1];
}

function getThemeVars() {
    const light = document.body.classList.contains('light-theme');
    return {
        isLight:      light,
        textColor:    light ? '#637381' : '#8a99a8',
        gridColor:    light ? '#e2e8f0' : '#20313f',
        tooltipBg:    light ? '#ffffff' : '#111c24',
        tooltipText:  light ? '#1f2c3d' : '#f5f6f8',
        tooltipBorder:light ? '#e0e6ed' : '#20313f',
    };
}

// ── Gráfico: Evolução (Mensal / Semanal / Diário) ─────────────────────────
function buildEvolutionData() {
    const gran = veiculosEvolutionGranularity;

    if (gran === 'mensal') {
        const monthOrder = ['JANEIRO','FEVEREIRO','MARCO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
        const buckets = {};
        filteredVeiculosData.forEach(r => {
            const key = r.month || 'N/D';
            if (!buckets[key]) buckets[key] = { SC:0, RS:0, PR:0, _total:0 };
            if (buckets[key][r.uf] !== undefined) buckets[key][r.uf] += r.value;
            buckets[key]._total += r.value;
        });
        const sorted = Object.keys(buckets).sort((a, b) => {
            const ia = monthOrder.indexOf(a.toUpperCase());
            const ib = monthOrder.indexOf(b.toUpperCase());
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
        const labelMap = { JANEIRO:'Jan', FEVEREIRO:'Fev', MARCO:'Mar', MARÇO:'Mar', ABRIL:'Abr', MAIO:'Mai', JUNHO:'Jun', JULHO:'Jul', AGOSTO:'Ago', SETEMBRO:'Set', OUTUBRO:'Out', NOVEMBRO:'Nov', DEZEMBRO:'Dez' };
        return {
            labels: sorted.map(k => labelMap[k.toUpperCase()] || k),
            SC:     sorted.map(k => buckets[k].SC),
            RS:     sorted.map(k => buckets[k].RS),
            PR:     sorted.map(k => buckets[k].PR),
        };
    }

    if (gran === 'semanal') {
        const getWeekKey = dateStr => {
            if (!dateStr) return 'N/D';
            const d = new Date(dateStr.replace(' ', 'T'));
            if (isNaN(d)) return 'N/D';
            const start = new Date(d.getFullYear(), 0, 1);
            const week  = Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
            const m     = String(d.getMonth() + 1).padStart(2, '0');
            const day   = String(d.getDate()).padStart(2, '0');
            return { key: `${d.getFullYear()}-W${String(week).padStart(2,'0')}`, label: `Sem ${week} (${day}/${m})` };
        };
        const buckets = {};
        filteredVeiculosData.forEach(r => {
            const wk = getWeekKey(r.date);
            if (typeof wk === 'object') {
                if (!buckets[wk.key]) buckets[wk.key] = { SC:0, RS:0, PR:0, label: wk.label };
                if (buckets[wk.key][r.uf] !== undefined) buckets[wk.key][r.uf] += r.value;
            }
        });
        const sorted = Object.keys(buckets).sort();
        return {
            labels: sorted.map(k => buckets[k].label),
            SC:     sorted.map(k => buckets[k].SC),
            RS:     sorted.map(k => buckets[k].RS),
            PR:     sorted.map(k => buckets[k].PR),
        };
    }

    // Diário
    const buckets = {};
    filteredVeiculosData.forEach(r => {
        const key = (r.date || '').substring(0, 10);
        if (!key) return;
        if (!buckets[key]) buckets[key] = { SC:0, RS:0, PR:0 };
        if (buckets[key][r.uf] !== undefined) buckets[key][r.uf] += r.value;
    });
    const sorted = Object.keys(buckets).sort().slice(-60);
    const fmtDay = k => { const [y,m,d] = k.split('-'); return `${d}/${m}`; };
    return {
        labels: sorted.map(fmtDay),
        SC:     sorted.map(k => buckets[k].SC),
        RS:     sorted.map(k => buckets[k].RS),
        PR:     sorted.map(k => buckets[k].PR),
    };
}

// ── Renderização de Gráficos ──────────────────────────────────────────────
function renderVeiculosChart(canvasId, type, data, options) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    if (chartVeiculosInstances[canvasId]) {
        chartVeiculosInstances[canvasId].destroy();
        delete chartVeiculosInstances[canvasId];
    }
    const instance = new Chart(canvas, { type, data, options });
    chartVeiculosInstances[canvasId] = instance;
    return instance;
}

function updateVeiculosCharts() {
    const th = getThemeVars();

    Chart.defaults.color         = th.textColor;
    Chart.defaults.font.family   = "'Outfit', 'Inter', sans-serif";
    Chart.defaults.font.size     = 11;
    Chart.defaults.responsive    = true;
    Chart.defaults.maintainAspectRatio = false;

    const tooltipBase = {
        backgroundColor: th.tooltipBg,
        titleColor:      th.tooltipText,
        bodyColor:       th.tooltipText,
        borderColor:     th.tooltipBorder,
        borderWidth:     1,
        padding:         10,
        displayColors:   true,
    };

    // 1. Evolução
    const evoData = buildEvolutionData();
    const granTitle = { mensal:'Mensal', semanal:'Semanal', diario:'Diário' }[veiculosEvolutionGranularity] || '';
    renderVeiculosChart('chart-veiculos-evolution', 'line', {
        labels: evoData.labels,
        datasets: [
            { label:'Santa Catarina (SC)', data:evoData.SC, borderColor:'#2ecc71', backgroundColor:'rgba(46,204,113,0.06)', tension:0.3, borderWidth:2.5, fill:true, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:'#2ecc71' },
            { label:'Rio Grande do Sul (RS)', data:evoData.RS, borderColor:'#3498db', backgroundColor:'rgba(52,152,219,0.06)', tension:0.3, borderWidth:2.5, fill:true, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:'#3498db' },
            { label:'Paraná (PR)', data:evoData.PR, borderColor:'#f39f18', backgroundColor:'rgba(243,159,24,0.06)', tension:0.3, borderWidth:2.5, fill:true, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:'#f39f18' },
        ]
    }, {
        responsive:true, maintainAspectRatio:false,
        scales: {
            x: { grid:{ color:th.gridColor }, ticks:{ color:th.textColor, font:{size:11} } },
            y: { grid:{ color:th.gridColor }, ticks:{ color:th.textColor, font:{size:11}, callback: v => fmtBRLCompact(v) } },
        },
        plugins: {
            legend: { position:'top', labels:{ boxWidth:10, boxHeight:6, color:th.textColor } },
            tooltip: { ...tooltipBase, callbacks: {
                title: items => items[0].label,
                label: ctx  => ` ${ctx.dataset.label}: ${fmtBRL(ctx.raw)}`
            }}
        }
    });

    // Título dinâmico da evolução
    const evoTitle = document.getElementById('veiculos-evolution-title');
    if (evoTitle) evoTitle.textContent = `Evolução de Gastos de Frota (${granTitle})`;

    // 2. Distribuição Regional (Doughnut)
    const ufTotals = { SC:0, RS:0, PR:0 };
    filteredVeiculosData.forEach(r => { if (ufTotals[r.uf] !== undefined) ufTotals[r.uf] += r.value; });
    renderVeiculosChart('chart-veiculos-uf', 'doughnut', {
        labels: ['Santa Catarina (SC)', 'Rio Grande do Sul (RS)', 'Paraná (PR)'],
        datasets: [{ data:[ufTotals.SC, ufTotals.RS, ufTotals.PR], backgroundColor:['#2ecc71','#3498db','#f39f18'], borderWidth:th.isLight?1:2, borderColor:th.isLight?'#ffffff':'#111c24' }]
    }, {
        cutout:'70%', responsive:true, maintainAspectRatio:false,
        plugins: {
            legend: { position:'bottom', labels:{ boxWidth:10, boxHeight:10, color:th.textColor, padding:12 } },
            tooltip: { ...tooltipBase, callbacks: {
                label: ctx => {
                    const total = ctx.dataset.data.reduce((a,b) => a+b, 0);
                    const pct   = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                    return ` ${ctx.label}: ${fmtBRL(ctx.raw)} (${pct}%)`;
                }
            }}
        }
    });

    // 3. Gráfico de Condutores (com drill-down)
    renderDriverChart(th, tooltipBase);

    // 4. Gráfico de Veículos (com drill-down)
    renderVehicleChart(th, tooltipBase);

    // 5. Gráficos de consumo detalhado (ricos)
    renderRichCharts(th, tooltipBase);
}

// ── Drill-Down Condutores → Veículos ─────────────────────────────────────
function renderDriverChart(th, tooltipBase) {
    // Atualiza UI do painel de drill-down
    const drillInfo    = document.getElementById('driver-drill-info');
    const drillBackBtn = document.getElementById('driver-drill-back');
    const chartTitle   = document.getElementById('driver-chart-title');

    if (driverDrillState.active) {
        // Drill-down: mostra veículos do condutor selecionado
        const driver = driverDrillState.driver;
        if (chartTitle)   chartTitle.textContent = `Veículos de ${shortName(driver)}`;
        if (drillInfo)    { drillInfo.textContent = `Condutor: ${driver}`; drillInfo.style.display = 'flex'; }
        if (drillBackBtn) drillBackBtn.style.display = 'flex';

        const vehicleSpends = {};
        filteredVeiculosData
            .filter(r => r.driver === driver && r.plate)
            .forEach(r => { vehicleSpends[r.plate] = (vehicleSpends[r.plate] || 0) + r.value; });

        const items = Object.keys(vehicleSpends)
            .map(plate => ({ plate, value: vehicleSpends[plate] }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 12);

        renderVeiculosChart('chart-veiculos-top-drivers', 'bar', {
            labels: items.map(i => i.plate),
            datasets: [{ label:'Gasto (R$)', data:items.map(i => i.value), backgroundColor:'rgba(46,204,113,0.85)', hoverBackgroundColor:'#2ecc71', borderRadius:4 }]
        }, buildHBarOptions(th, tooltipBase, v => ` Gasto: ${fmtBRL(v)}`, true));
    } else {
        // Topo 10 condutores
        if (chartTitle)   chartTitle.textContent = 'Top 10 Condutores por Gasto';
        if (drillInfo)    drillInfo.style.display = 'none';
        if (drillBackBtn) drillBackBtn.style.display = 'none';

        const spends = {};
        filteredVeiculosData.forEach(r => {
            if (r.driver) spends[r.driver] = (spends[r.driver] || 0) + r.value;
        });
        const topDrivers = Object.keys(spends)
            .map(name => ({ name, value: spends[name] }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        const opts = buildHBarOptions(th, tooltipBase, v => ` Gasto: ${fmtBRL(v)}`, false);

        // onClick para drill-down
        opts.onClick = (evt, elements) => {
            if (!elements.length) return;
            const idx = elements[0].index;
            driverDrillState = { active: true, driver: topDrivers[idx].name };
            renderDriverChart(th, tooltipBase);
        };
        opts.plugins.tooltip.callbacks.title = items => shortName(items[0].label);

        renderVeiculosChart('chart-veiculos-top-drivers', 'bar', {
            labels: topDrivers.map(d => shortName(d.name)),
            datasets: [{ label:'Gasto (R$)', data:topDrivers.map(d => d.value), backgroundColor:'rgba(52,152,219,0.85)', hoverBackgroundColor:'#3498db', borderRadius:4 }]
        }, opts);
    }
}

function drillIntoDriver(name) {
    driverDrillState = { active: true, driver: name };
    const th = getThemeVars();
    const tooltipBase = buildTooltipBase(th);
    renderDriverChart(th, tooltipBase);
}

function resetDriverDrill() {
    driverDrillState = { active: false, driver: null };
    const th = getThemeVars();
    const tooltipBase = buildTooltipBase(th);
    renderDriverChart(th, tooltipBase);
}

// ── Drill-Down Veículos → Condutores ─────────────────────────────────────
function renderVehicleChart(th, tooltipBase) {
    const drillInfo    = document.getElementById('vehicle-drill-info');
    const drillBackBtn = document.getElementById('vehicle-drill-back');
    const chartTitle   = document.getElementById('vehicle-chart-title');

    if (vehicleDrillState.active) {
        const plate = vehicleDrillState.plate;
        if (chartTitle)   chartTitle.textContent = `Condutores de ${plate}`;
        if (drillInfo)    { drillInfo.textContent = `Placa: ${plate}`; drillInfo.style.display = 'flex'; }
        if (drillBackBtn) drillBackBtn.style.display = 'flex';

        const driverSpends = {};
        filteredVeiculosData
            .filter(r => r.plate === plate && r.driver)
            .forEach(r => { driverSpends[r.driver] = (driverSpends[r.driver] || 0) + r.value; });

        const items = Object.keys(driverSpends)
            .map(driver => ({ driver, value: driverSpends[driver] }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 12);

        const opts = buildHBarOptions(th, tooltipBase, v => ` Gasto: ${fmtBRL(v)}`, true);
        opts.plugins.tooltip.callbacks.title = ctxItems => shortName(ctxItems[0].label);

        renderVeiculosChart('chart-veiculos-top-vehicles', 'bar', {
            labels: items.map(i => shortName(i.driver)),
            datasets: [{ label:'Gasto (R$)', data:items.map(i => i.value), backgroundColor:'rgba(243,159,24,0.85)', hoverBackgroundColor:'#f39f18', borderRadius:4 }]
        }, opts);
    } else {
        if (chartTitle)   chartTitle.textContent = 'Top 10 Veículos por Gasto';
        if (drillInfo)    drillInfo.style.display = 'none';
        if (drillBackBtn) drillBackBtn.style.display = 'none';

        const spends = {};
        filteredVeiculosData.forEach(r => {
            if (r.plate) spends[r.plate] = (spends[r.plate] || 0) + r.value;
        });
        const topVehicles = Object.keys(spends)
            .map(plate => ({ plate, value: spends[plate] }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        const opts = buildHBarOptions(th, tooltipBase, v => ` Gasto: ${fmtBRL(v)}`, false);
        opts.onClick = (evt, elements) => {
            if (!elements.length) return;
            const idx = elements[0].index;
            vehicleDrillState = { active: true, plate: topVehicles[idx].plate };
            renderVehicleChart(th, tooltipBase);
        };

        renderVeiculosChart('chart-veiculos-top-vehicles', 'bar', {
            labels: topVehicles.map(v => v.plate),
            datasets: [{ label:'Gasto (R$)', data:topVehicles.map(v => v.value), backgroundColor:'rgba(243,159,24,0.85)', hoverBackgroundColor:'#f39f18', borderRadius:4 }]
        }, opts);
    }
}

function resetVehicleDrill() {
    vehicleDrillState = { active: false, plate: null };
    const th = getThemeVars();
    const tooltipBase = buildTooltipBase(th);
    renderVehicleChart(th, tooltipBase);
}

// ── Helper: opções de gráfico de barras horizontais ──────────────────────
function buildTooltipBase(th) {
    return {
        backgroundColor: th.tooltipBg, titleColor:th.tooltipText,
        bodyColor:th.tooltipText, borderColor:th.tooltipBorder,
        borderWidth:1, padding:10, displayColors:true,
    };
}

function buildHBarOptions(th, tooltipBase, labelCb, isDrillResult) {
    return {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        cursor: isDrillResult ? 'default' : 'pointer',
        scales: {
            x: {
                grid: { color: th.gridColor },
                ticks: { color: th.textColor, font:{size:11}, callback: v => fmtBRLCompact(v) }
            },
            y: { grid: { display:false }, ticks: { color:th.textColor, font:{size:11} } }
        },
        plugins: {
            legend: { display: false },
            tooltip: { ...tooltipBase, callbacks: { label: ctx => labelCb(ctx.raw) } }
        }
    };
}

// ── Gráficos de consumo detalhado (dados ricos: litros, KM/L) ────────────
function renderRichCharts(th, tooltipBase) {
    const richRecs = filteredVeiculosData.filter(r => r.liters !== null && r.liters > 0);
    const richEl   = document.querySelectorAll('#view-veiculos-container .data-rich-only');
    richEl.forEach(el => el.classList.toggle('hidden', richRecs.length === 0));
    if (!richRecs.length) return;

    // A. Combustível (litros por tipo)
    const fuelLiters = {};
    richRecs.forEach(r => { if (r.fuel) fuelLiters[r.fuel] = (fuelLiters[r.fuel] || 0) + r.liters; });
    const fuels = Object.keys(fuelLiters).map(f => ({ name:f, liters:fuelLiters[f] }));
    renderVeiculosChart('chart-veiculos-fuel-dist', 'doughnut', {
        labels: fuels.map(f => f.name),
        datasets: [{ data:fuels.map(f => f.liters), backgroundColor:['#2ecc71','#3498db','#f39f18','#9b59b6','#e74c3c','#34495e'], borderWidth:th.isLight?1:2, borderColor:th.isLight?'#ffffff':'#111c24' }]
    }, {
        cutout:'65%', responsive:true, maintainAspectRatio:false,
        plugins: {
            legend:{ position:'bottom', labels:{ boxWidth:8, font:{size:9}, color:th.textColor } },
            tooltip:{ ...tooltipBase, callbacks:{ label: ctx => ` ${ctx.label}: ${ctx.raw.toLocaleString('pt-BR',{minimumFractionDigits:0})} L` } }
        }
    });

    // B. Preço médio por litro por UF
    const ufFuelPrices = { SC:{gas:[],diesel:[]}, RS:{gas:[],diesel:[]}, PR:{gas:[],diesel:[]} };
    richRecs.forEach(r => {
        if (!ufFuelPrices[r.uf] || !r.vlLiter || r.vlLiter <= 0) return;
        if (r.fuel && r.fuel.toUpperCase().includes('GASOLINA')) ufFuelPrices[r.uf].gas.push(r.vlLiter);
        else if (r.fuel && r.fuel.toUpperCase().includes('DIESEL'))  ufFuelPrices[r.uf].diesel.push(r.vlLiter);
    });
    const avg = arr => arr.length > 0 ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
    renderVeiculosChart('chart-veiculos-avg-price', 'bar', {
        labels: ['SC','RS','PR'],
        datasets: [
            { label:'Gasolina', data:['SC','RS','PR'].map(u => avg(ufFuelPrices[u].gas)), backgroundColor:'rgba(243,159,24,0.85)', borderRadius:3 },
            { label:'Diesel',   data:['SC','RS','PR'].map(u => avg(ufFuelPrices[u].diesel)), backgroundColor:'rgba(52,152,219,0.85)', borderRadius:3 }
        ]
    }, {
        responsive:true, maintainAspectRatio:false,
        scales: {
            y:{ grid:{color:th.gridColor}, min:4, max:7.5, ticks:{color:th.textColor, callback: v => 'R$ '+v.toFixed(2)} },
            x:{ grid:{display:false}, ticks:{color:th.textColor} }
        },
        plugins: {
            legend:{labels:{color:th.textColor, boxWidth:10}},
            tooltip:{...tooltipBase, callbacks:{ label:ctx=>' '+ctx.dataset.label+': R$ '+ctx.raw.toFixed(2) }}
        }
    });

    // C. Eficiência (KM/L por modelo)
    const modelEff = {};
    richRecs.forEach(r => {
        if (r.model && r.kml > 0 && r.kml < 30) {
            if (!modelEff[r.model]) modelEff[r.model] = [];
            modelEff[r.model].push(r.kml);
        }
    });
    const topModels = Object.keys(modelEff)
        .map(m => ({ name:m, avgKml:avg(modelEff[m]), count:modelEff[m].length }))
        .filter(x => x.count >= 2)
        .sort((a,b) => b.avgKml - a.avgKml)
        .slice(0, 5);

    renderVeiculosChart('chart-veiculos-efficiency', 'bar', {
        labels: topModels.map(m => m.name),
        datasets: [{ label:'Km/L Média', data:topModels.map(m => m.avgKml), backgroundColor:'rgba(46,204,113,0.85)', borderRadius:3 }]
    }, {
        responsive:true, maintainAspectRatio:false,
        scales: {
            y:{ grid:{color:th.gridColor}, ticks:{color:th.textColor, callback:v=>v.toFixed(1)+' Km/L'} },
            x:{ grid:{display:false}, ticks:{color:th.textColor} }
        },
        plugins: {
            legend:{display:false},
            tooltip:{...tooltipBase, callbacks:{label:ctx=>' Eficiência: '+ctx.raw.toFixed(2)+' Km/L'}}
        }
    });
}

// ── Troca de aba ──────────────────────────────────────────────────────────
function switchVeiculosTab(tabName) {
    activeVeiculosTab = tabName;
    document.querySelectorAll('#view-veiculos-container .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
    const indPane = document.getElementById('subview-veiculos-indicators');
    const detPane = document.getElementById('subview-veiculos-details');
    if (indPane) indPane.classList.toggle('active', tabName === 'indicators');
    if (detPane) detPane.classList.toggle('active', tabName === 'details');

    if (tabName === 'indicators') {
        setTimeout(updateVeiculosCharts, 50);
    } else {
        renderVeiculosTable();
    }
}

// ── Tabela ────────────────────────────────────────────────────────────────
function getVeiculosTableFilteredData() {
    let data = [...filteredVeiculosData];
    if (tableVeiculosSearchQuery) {
        const q = tableVeiculosSearchQuery.trim().toUpperCase();
        data = data.filter(r =>
            (r.driver || '').toUpperCase().includes(q) ||
            (r.plate  || '').toUpperCase().includes(q) ||
            (r.uf     || '').toUpperCase().includes(q) ||
            (r.fuel   || '').toUpperCase().includes(q) ||
            (r.model  || '').toUpperCase().includes(q) ||
            (r.date   || '').includes(q)
        );
    }
    data.sort((a, b) => {
        let va = a[tableVeiculosSortColumn];
        let vb = b[tableVeiculosSortColumn];
        if (va === null || va === undefined) return tableVeiculosSortDirection === 'asc' ? 1 : -1;
        if (vb === null || vb === undefined) return tableVeiculosSortDirection === 'asc' ? -1 : 1;
        if (typeof va === 'string') return tableVeiculosSortDirection === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        return tableVeiculosSortDirection === 'asc' ? va - vb : vb - va;
    });
    return data;
}

function renderVeiculosTable() {
    const data  = getVeiculosTableFilteredData();
    const tbody = document.getElementById('table-veiculos-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const total      = data.length;
    const totalPages = Math.ceil(total / tableVeiculosRowsPerPage);
    if (tableVeiculosPage > totalPages && totalPages > 0) tableVeiculosPage = totalPages;

    const start = (tableVeiculosPage - 1) * tableVeiculosRowsPerPage;
    const end   = Math.min(start + tableVeiculosRowsPerPage, total);

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('table-veiculos-row-total', total.toLocaleString('pt-BR'));

    if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-secondary);padding:40px 0;">Nenhum lançamento encontrado.</td></tr>`;
        set('table-veiculos-row-start','0'); set('table-veiculos-row-end','0');
        document.getElementById('btn-veiculos-page-prev').disabled = true;
        document.getElementById('btn-veiculos-page-next').disabled = true;
        set('veiculos-page-indicator','Pág. 0 / 0');
        return;
    }

    set('table-veiculos-row-start', (start+1).toString());
    set('table-veiculos-row-end',   end.toString());
    document.getElementById('btn-veiculos-page-prev').disabled = tableVeiculosPage === 1;
    document.getElementById('btn-veiculos-page-next').disabled = tableVeiculosPage === totalPages;
    set('veiculos-page-indicator', `Pág. ${tableVeiculosPage} / ${totalPages}`);

    data.slice(start, end).forEach(r => {
        const dateParts = (r.date || '').split(' ');
        const dp        = (dateParts[0] || '').split('-');
        const displayDate = dp.length === 3 ? `${dp[2]}/${dp[1]}/${dp[0]} ${(dateParts[1]||'').substring(0,5)}` : r.date;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${displayDate}</td>
            <td><strong>${r.plate || '-'}</strong></td>
            <td>${r.model  || '-'}</td>
            <td>${r.driver || '-'}</td>
            <td><span class="badge ${(r.uf||'').toLowerCase()}">${r.uf || '-'}</span></td>
            <td class="text-right"><strong>${fmtBRL(r.value)}</strong></td>
            <td class="text-right">${r.liters !== null ? r.liters.toLocaleString('pt-BR',{minimumFractionDigits:1})+' L' : '-'}</td>
            <td class="text-right">${r.vlLiter !== null ? fmtBRL(r.vlLiter) : '-'}</td>
            <td>${r.fuel || '-'}</td>
            <td class="text-right">${r.km !== null ? r.km.toLocaleString('pt-BR') : '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function handleVeiculosTableSort(column) {
    if (tableVeiculosSortColumn === column) {
        tableVeiculosSortDirection = tableVeiculosSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        tableVeiculosSortColumn    = column;
        tableVeiculosSortDirection = 'asc';
    }
    document.querySelectorAll('#view-veiculos-container th[data-sort]').forEach(th => {
        th.classList.remove('sort-asc','sort-desc');
        if (th.getAttribute('data-sort') === column) {
            th.classList.add(tableVeiculosSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
    tableVeiculosPage = 1;
    renderVeiculosTable();
}
