// veiculos_app.js - Dashboard de Veículos JLE BI
// Padrão visual e funcional idêntico ao Dashboard Financeiro
// Build trigger: 202506090001

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
    try {
        if (typeof VEICULOS_DATA === 'undefined') {
            console.error('VEICULOS_DATA não carregado.');
            return;
        }
        filteredVeiculosData = [...VEICULOS_DATA];

        populateVeiculosFilters();
        initVeiculosEventListeners();
        applyVeiculosFilters();

        veiculosDataLoaded = true;
    } catch (err) {
        console.error("Erro fatal ao inicializar Veículos:", err);
    }
}

// ── Listeners ─────────────────────────────────────────────────────────────
function initVeiculosEventListeners() {
    try {
        // Abas
        document.querySelectorAll('#view-veiculos-container .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchVeiculosTab(btn.getAttribute('data-tab')));
        });
    } catch (err) {
        console.error("Erro ao registrar listeners de abas:", err);
    }

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
    try {
        const monthSelect = document.getElementById('filter-veiculos-month');
        if (monthSelect) {
            const monthOrder = {
                'JANEIRO':1,'FEVEREIRO':2,'MARÇO':3,'MARCO':3,'ABRIL':4,
                'MAIO':5,'JUNHO':6,'JULHO':7,'AGOSTO':8,
                'SETEMBRO':9,'OUTUBRO':10,'NOVEMBRO':11,'DEZEMBRO':12
            };
            const uniqueMonths = [...new Set(VEICULOS_DATA.map(r => String(r.month || '').trim()))]
                .filter(m => m && m !== '')
                .sort((a, b) => (monthOrder[a.toUpperCase()] || 99) - (monthOrder[b.toUpperCase()] || 99));

            if (uniqueMonths.length > 0) {
                monthSelect.innerHTML = '<option value="all">Todos os Meses</option>';
                uniqueMonths.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m;
                    const formattedText = m.charAt(0).toUpperCase() + m.slice(1).toLowerCase() + '/2026';
                    opt.textContent = formattedText;
                    monthSelect.appendChild(opt);
                });

                // Pré-seleção do mês anterior do sistema
                const monthsPt = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
                const prevMonthDate = new Date();
                prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
                const prevMonthName = monthsPt[prevMonthDate.getMonth()];

                if (uniqueMonths.includes(prevMonthName)) {
                    monthSelect.value = prevMonthName;
                } else {
                    monthSelect.value = uniqueMonths[uniqueMonths.length - 1];
                }
            }
        }
    } catch (err) {
        console.error("Erro ao popular filtro de meses:", err);
    }

    // Combustível
    try {
        const fuelSelect = document.getElementById('filter-veiculos-fuel');
        if (fuelSelect) {
            const fuels = [...new Set(VEICULOS_DATA.map(r => String(r.fuel || '').trim()).filter(Boolean))].sort();
            if (fuels.length > 0) {
                fuelSelect.innerHTML = '<option value="all">Todas as Categorias</option>';
                fuels.forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f;
                    opt.textContent = f;
                    fuelSelect.appendChild(opt);
                });
            }
        }
    } catch (err) {
        console.error("Erro ao popular filtro de combustível:", err);
    }

    // Datalists
    try {
        const drivers = [...new Set(VEICULOS_DATA.map(r => String(r.driver || '').trim()).filter(Boolean))].sort();
        const plates  = [...new Set(VEICULOS_DATA.map(r => String(r.plate || '').trim()).filter(Boolean))].sort();

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
    } catch (err) {
        console.error("Erro ao popular datalists de veículos/condutores:", err);
    }
}

// ── Reset ─────────────────────────────────────────────────────────────────
function resetVeiculosFilters() {
    try {
        ['filter-veiculos-month','filter-veiculos-uf','filter-veiculos-fuel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = 'all';
        });
        ['filter-veiculos-driver','filter-veiculos-plate','filter-veiculos-data-inicio','filter-veiculos-data-fim'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        driverDrillState  = { active: false, driver: null };
        vehicleDrillState = { active: false, plate: null };
        applyVeiculosFilters();
    } catch (err) {
        console.error("Erro ao resetar filtros de veículos:", err);
    }
}

function resetVeiculosDateFilter() {
    try {
        const startEl = document.getElementById('filter-veiculos-data-inicio');
        const endEl = document.getElementById('filter-veiculos-data-fim');
        if (startEl) startEl.value = '';
        if (endEl) endEl.value = '';
        applyVeiculosFilters();
    } catch (err) {
        console.error("Erro ao resetar filtro de datas de veículos:", err);
    }
}

// ── Aplicar Filtros ───────────────────────────────────────────────────────
function applyVeiculosFilters() {
    try {
        const month      = document.getElementById('filter-veiculos-month')?.value || 'all';
        const uf         = document.getElementById('filter-veiculos-uf')?.value    || 'all';
        const fuel       = document.getElementById('filter-veiculos-fuel')?.value  || 'all';
        const driver     = (document.getElementById('filter-veiculos-driver')?.value || '').trim().toUpperCase();
        const plate      = (document.getElementById('filter-veiculos-plate')?.value  || '').trim().toUpperCase();
        const dataInicio = document.getElementById('filter-veiculos-data-inicio')?.value || '';
        const dataFim    = document.getElementById('filter-veiculos-data-fim')?.value    || '';

        filteredVeiculosData = VEICULOS_DATA.filter(r => {
            if (month !== 'all' && String(r.month || '').toUpperCase() !== month.toUpperCase()) return false;
            if (uf    !== 'all' && String(r.uf || '') !== uf)    return false;
            if (fuel  !== 'all' && String(r.fuel || '') !== fuel)  return false;
            if (driver && !String(r.driver || '').toUpperCase().includes(driver)) return false;
            if (plate  && !String(r.plate || '').toUpperCase().includes(plate))  return false;

            // Filtro por Período de Data
            const rDateOnly = r.date ? r.date.substring(0, 10) : '';
            if (dataInicio && rDateOnly < dataInicio) return false;
            if (dataFim && rDateOnly > dataFim) return false;

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
    } catch (err) {
        console.error("Erro ao aplicar filtros de veículos:", err);
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
    const totalSpent  = filteredVeiculosData.reduce((s, r) => s + (r.value || 0), 0);
    const totalCount  = filteredVeiculosData.length;
    const avgSpent    = totalCount > 0 ? totalSpent / totalCount : 0;
    const vehicles    = new Set(filteredVeiculosData.map(r => r.plate).filter(Boolean));
    const drivers     = new Set(filteredVeiculosData.map(r => r.driver).filter(Boolean));
    const richRecs    = filteredVeiculosData.filter(r => r.liters !== null && r.liters > 0);
    const totalLiters = richRecs.reduce((s, r) => s + r.liters, 0);

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('kpi-veiculos-total',          fmtBRL(totalSpent));
    set('kpi-veiculos-avg',            fmtBRL(avgSpent));
    set('kpi-veiculos-count',          totalCount.toLocaleString('pt-BR'));
    set('kpi-veiculos-active-vehicles',vehicles.size.toLocaleString('pt-BR'));
    set('kpi-veiculos-active-drivers', drivers.size.toLocaleString('pt-BR'));
    set('kpi-veiculos-liters',         totalLiters.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' L');

    // Cards Regionais
    const regional = { SC:{spent:0,count:0}, RS:{spent:0,count:0}, PR:{spent:0,count:0} };
    filteredVeiculosData.forEach(r => {
        if (regional[r.uf]) { regional[r.uf].spent += (r.value || 0); regional[r.uf].count++; }
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
    return (v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

function fmtBRLCompact(v) {
    if (v >= 1e6) return 'R$ ' + (v / 1e6).toFixed(1).replace('.', ',') + 'M';
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
        isLight:       light,
        textColor:     light ? '#637381' : '#8a99a8',
        textPrimary:   light ? '#1f2c3d' : '#f5f6f8',
        gridColor:     light ? '#e2e8f0' : '#20313f',
        tooltipBg:     light ? '#ffffff' : '#111c24',
        tooltipText:   light ? '#1f2c3d' : '#f5f6f8',
        tooltipBorder: light ? '#e0e6ed' : '#20313f',
        cardBg:        light ? '#f8fafc' : '#0f1f2b',
    };
}

function buildTooltipBase(th) {
    return {
        backgroundColor:  th.tooltipBg,
        titleColor:       th.tooltipText,
        bodyColor:        th.tooltipText,
        borderColor:      th.tooltipBorder,
        borderWidth:      1,
        padding:          12,
        displayColors:    true,
        cornerRadius:     8,
        titleFont:        { family: "'Outfit', sans-serif", size: 12, weight: '600' },
        bodyFont:         { family: "'Outfit', sans-serif", size: 12 },
    };
}

// ── Gráfico: Evolução (Mensal / Semanal / Diário) ─────────────────────────
function buildEvolutionData() {
    const gran = veiculosEvolutionGranularity;

    if (gran === 'mensal') {
        const monthOrder = ['JANEIRO','FEVEREIRO','MARCO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
        const buckets = {};
        
        // Ignorar o filtro de competência/mês na evolução mensal
        const uf         = document.getElementById('filter-veiculos-uf')?.value    || 'all';
        const fuel       = document.getElementById('filter-veiculos-fuel')?.value  || 'all';
        const driver     = (document.getElementById('filter-veiculos-driver')?.value || '').trim().toUpperCase();
        const plate      = (document.getElementById('filter-veiculos-plate')?.value  || '').trim().toUpperCase();
        const dataInicio = document.getElementById('filter-veiculos-data-inicio')?.value || '';
        const dataFim    = document.getElementById('filter-veiculos-data-fim')?.value    || '';

        const dataForMensal = VEICULOS_DATA.filter(r => {
            if (uf    !== 'all' && String(r.uf || '') !== uf)    return false;
            if (fuel  !== 'all' && String(r.fuel || '') !== fuel)  return false;
            if (driver && !String(r.driver || '').toUpperCase().includes(driver)) return false;
            if (plate  && !String(r.plate || '').toUpperCase().includes(plate))  return false;

            const rDateOnly = r.date ? r.date.substring(0, 10) : '';
            if (dataInicio && rDateOnly < dataInicio) return false;
            if (dataFim && rDateOnly > dataFim) return false;

            return true;
        });

        dataForMensal.forEach(r => {
            const key = (r.month || 'N/D').toUpperCase();
            if (!buckets[key]) buckets[key] = { SC:0, RS:0, PR:0 };
            if (buckets[key][r.uf] !== undefined) buckets[key][r.uf] += (r.value || 0);
        });
        const sorted = Object.keys(buckets).sort((a, b) => {
            const ia = monthOrder.indexOf(a);
            const ib = monthOrder.indexOf(b);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
        const labelMap = { JANEIRO:'Jan', FEVEREIRO:'Fev', MARCO:'Mar', MARÇO:'Mar', ABRIL:'Abr', MAIO:'Mai', JUNHO:'Jun', JULHO:'Jul', AGOSTO:'Ago', SETEMBRO:'Set', OUTUBRO:'Out', NOVEMBRO:'Nov', DEZEMBRO:'Dez' };
        return {
            labels: sorted.map(k => labelMap[k] || k),
            SC:     sorted.map(k => buckets[k].SC),
            RS:     sorted.map(k => buckets[k].RS),
            PR:     sorted.map(k => buckets[k].PR),
        };
    }

    if (gran === 'semanal') {
        const getWeekKey = dateStr => {
            if (!dateStr) return null;
            const d = new Date(dateStr.replace(' ', 'T'));
            if (isNaN(d)) return null;
            const start = new Date(d.getFullYear(), 0, 1);
            const week  = Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
            const m     = String(d.getMonth() + 1).padStart(2, '0');
            const day   = String(d.getDate()).padStart(2, '0');
            return { key: `${d.getFullYear()}-W${String(week).padStart(2,'0')}`, label: `Sem ${week} (${day}/${m})` };
        };
        const buckets = {};
        filteredVeiculosData.forEach(r => {
            const wk = getWeekKey(r.date);
            if (wk) {
                if (!buckets[wk.key]) buckets[wk.key] = { SC:0, RS:0, PR:0, label: wk.label };
                if (buckets[wk.key][r.uf] !== undefined) buckets[wk.key][r.uf] += (r.value || 0);
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
        if (buckets[key][r.uf] !== undefined) buckets[key][r.uf] += (r.value || 0);
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
    // Limpar dimensões inline/atributos obsoletos de abas ocultas para forçar redimensionamento correto pelo pai
    canvas.removeAttribute('width');
    canvas.removeAttribute('height');
    canvas.style.width = '';
    canvas.style.height = '';

    const instance = new Chart(canvas, { type, data, options });
    chartVeiculosInstances[canvasId] = instance;
    return instance;
}

function updateVeiculosCharts() {
    const th = getThemeVars();

    Chart.defaults.color         = th.textColor;
    Chart.defaults.font.family   = "'Outfit', 'Inter', sans-serif";
    Chart.defaults.font.size     = 12;
    Chart.defaults.responsive    = true;
    Chart.defaults.maintainAspectRatio = false;

    const tooltipBase = buildTooltipBase(th);

    // 1. Evolução
    const evoData = buildEvolutionData();
    const granTitle = { mensal:'Mensal', semanal:'Semanal', diario:'Diário' }[veiculosEvolutionGranularity] || '';
    const isWeekly = veiculosEvolutionGranularity === 'semanal';
    const isDiario = veiculosEvolutionGranularity === 'diario';
    const isMensal = veiculosEvolutionGranularity === 'mensal';

    let dlConfig = {};
    if (isMensal) {
        dlConfig = {
            align: 'top',
            anchor: 'end',
            rotation: 0,
            font: { family: 'Outfit', size: 10, weight: 'bold' }
        };
    } else if (isWeekly) {
        dlConfig = {
            align: 'end',
            anchor: 'end',
            rotation: 0,
            font: { family: 'Outfit', size: 9, weight: '700' }
        };
    } else {
        dlConfig = {
            align: 'end',
            anchor: 'end',
            rotation: -90,
            font: { family: 'Outfit', size: 8, weight: '700' }
        };
    }

    renderVeiculosChart('chart-veiculos-evolution', 'line', {
        labels: evoData.labels,
        datasets: [
            {
                label: 'Santa Catarina (SC)',
                data: evoData.SC,
                borderColor: '#2ecc71',
                backgroundColor: 'rgba(46,204,113,0.08)',
                tension: 0.35,
                borderWidth: 2.5,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 7,
                pointBackgroundColor: '#2ecc71',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
            },
            {
                label: 'Rio Grande do Sul (RS)',
                data: evoData.RS,
                borderColor: '#3498db',
                backgroundColor: 'rgba(52,152,219,0.08)',
                tension: 0.35,
                borderWidth: 2.5,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 7,
                pointBackgroundColor: '#3498db',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
            },
            {
                label: 'Paraná (PR)',
                data: evoData.PR,
                borderColor: '#f39f18',
                backgroundColor: 'rgba(243,159,24,0.08)',
                tension: 0.35,
                borderWidth: 2.5,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 7,
                pointBackgroundColor: '#f39f18',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
            },
        ]
    }, {
        responsive: true,
        maintainAspectRatio: false,
        onHover: (event, chartElement) => {
            event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
        },
        interaction: { mode: 'index', intersect: false },
        scales: {
            x: {
                grid: { color: 'transparent' },
                ticks: {
                    color: th.textColor,
                    font: { size: isWeekly ? 10 : 9, family: "'Outfit', sans-serif" }
                },
            },
            y: {
                grid: { color: th.gridColor },
                ticks: {
                    color: th.textColor,
                    font: { size: 10, family: "'Outfit', sans-serif" },
                    callback: (val) => {
                        const a = Math.abs(val);
                        if (val === 0) return '0';
                        if (a >= 1000000) return (a/1000000).toFixed(1).replace('.', ',') + 'M';
                        if (a >= 1000) return (a/1000).toFixed(0) + 'k';
                        return a.toString();
                    }
                },
                grace: '15%'
            },
        },
        plugins: {
            legend: {
                labels: {
                    color: th.textColor,
                    usePointStyle: true,
                    pointStyle: 'rectRounded',
                    boxWidth: 16,
                    boxHeight: 8,
                    padding: 16,
                    font: { family: 'Outfit', size: 11 }
                }
            },
            datalabels: {
                display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0,
                align: dlConfig.align,
                anchor: dlConfig.anchor,
                rotation: dlConfig.rotation,
                color: th.textColor,
                font: dlConfig.font,
                formatter: (val) => {
                    const a = Math.abs(val);
                    if (a >= 1000000) return (a/1000000).toFixed(1).replace('.', ',') + 'M';
                    if (a >= 1000) return (a/1000).toFixed(0) + 'k';
                    return a > 0 ? a.toFixed(0) : '';
                },
                clamp: true,
                clip: false
            },
            tooltip: {
                ...tooltipBase,
                callbacks: {
                    title: items => items[0].label,
                    label: ctx  => ` ${ctx.dataset.label}: ${fmtBRL(ctx.raw)}`,
                }
            }
        }
    });

    // Título dinâmico da evolução
    const evoTitle = document.getElementById('veiculos-evolution-title');
    if (evoTitle) evoTitle.textContent = `Evolução de Gastos de Frota (${granTitle})`;

    // 2. Mapa SVG de distribuição por UF
    renderVeiculosMap(th);

    // 3. Gráfico de Condutores (com drill-down)
    renderDriverChart(th, tooltipBase);

    // 4. Gráfico de Veículos (com drill-down)
    renderVehicleChart(th, tooltipBase);

    // 5. Gráficos de consumo detalhado (ricos)
    renderRichCharts(th, tooltipBase);

    // 6. Top 3 Consumos
    renderTop3Consumo();
}

// ── Mapa SVG Interativo PR / SC / RS ─────────────────────────────────────
function renderVeiculosMap(th) {
    const mapContainer = document.getElementById('veiculos-map-container');
    if (!mapContainer) return;

    const ufMetrics = { SC: { spent: 0, count: 0 }, RS: { spent: 0, count: 0 }, PR: { spent: 0, count: 0 } };
    filteredVeiculosData.forEach(r => {
        if (ufMetrics[r.uf]) {
            ufMetrics[r.uf].spent += (r.value || 0);
            ufMetrics[r.uf].count++;
        }
    });

    const totalSpent = Object.values(ufMetrics).reduce((s, v) => s + v.spent, 0);
    const maxSpent   = Math.max(...Object.values(ufMetrics).map(v => v.spent), 1);

    // Gradiente de cor por volume de gastos — escala de opacidade
    const getColorForUF = uf => {
        const opacity = 0.15 + 0.75 * (ufMetrics[uf].spent / maxSpent);
        return `rgba(0, 79, 113, ${opacity.toFixed(2)})`;
    };

    const filterUf  = document.getElementById('filter-veiculos-uf')?.value || 'all';
    const classOf   = uf => filterUf === uf ? 'active' : (filterUf !== 'all' ? 'dimmed' : '');
    const stateName = uf => uf === 'PR' ? 'Paraná' : uf === 'SC' ? 'Santa Catarina' : 'Rio Grande do Sul';
    const dotClass  = uf => uf === 'SC' ? 'sc' : uf === 'RS' ? 'rs' : 'pr';

    const cardHtml = uf => `
        <div class="uf-compact-card ${dotClass(uf)}-card ${classOf(uf)}" id="veic-card-UF-${uf}"
             onclick="toggleVeiculosUFFromMap('${uf}')"
             onmouseenter="handleVeiculosCardHover('${uf}')"
             onmouseleave="handleVeiculosCardLeave('${uf}')">
            <div class="uf-compact-header">
                <span class="uf-compact-name">
                    <span class="uf-status-indicator ${dotClass(uf)}-dot"></span>
                    <strong>${stateName(uf)}</strong>
                </span>
            </div>
            <div class="uf-compact-content">
                <div class="uf-compact-main-stat">
                    <span class="uf-stat-label"><i class="fa-solid fa-gas-pump"></i> Abastecimentos</span>
                    <span class="uf-stat-value">${ufMetrics[uf].count.toLocaleString('pt-BR')}</span>
                </div>
                <div class="uf-compact-sub-stats">
                    <div class="uf-sub-stat success">
                        <span class="uf-sub-label success"><i class="fa-solid fa-sack-dollar"></i></span>
                        <span class="uf-sub-val success">${fmtBRL(ufMetrics[uf].spent)}</span>
                    </div>
                    <div class="uf-sub-stat">
                        <span class="uf-sub-label" style="color:var(--text-secondary)"><i class="fa-solid fa-percent"></i></span>
                        <span class="uf-sub-val" style="color:var(--text-secondary)">${totalSpent > 0 ? ((ufMetrics[uf].spent / totalSpent) * 100).toFixed(1) : '0,0'}%</span>
                    </div>
                </div>
            </div>
        </div>`;

    mapContainer.innerHTML = `
        <div class="uf-premium-container">
            <!-- LEFT: Mapa SVG -->
            <div class="uf-map-side">
                <svg class="map-svg-centered" viewBox="125 242 136 136" style="overflow: visible;">

                    <!-- PARANÁ -->
                    <polygon class="map-state ${classOf('PR')}" id="veic-state-PR" points="
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
                        onmouseenter="handleVeiculosMapHover(event,'PR')"
                        onmousemove="handleVeiculosMapMove(event)"
                        onmouseleave="handleVeiculosMapLeave()"
                        onclick="toggleVeiculosUFFromMap('PR')">
                    </polygon>
                    <text class="map-label ${classOf('PR')}" x="205" y="272" style="font-size:3.5px;" onclick="toggleVeiculosUFFromMap('PR')">PR</text>

                    <!-- SANTA CATARINA -->
                    <polygon class="map-state ${classOf('SC')}" id="veic-state-SC" points="
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
                        onmouseenter="handleVeiculosMapHover(event,'SC')"
                        onmousemove="handleVeiculosMapMove(event)"
                        onmouseleave="handleVeiculosMapLeave()"
                        onclick="toggleVeiculosUFFromMap('SC')">
                    </polygon>
                    <text class="map-label ${classOf('SC')}" x="215" y="298" style="font-size:3.5px;" onclick="toggleVeiculosUFFromMap('SC')">SC</text>

                    <!-- RIO GRANDE DO SUL -->
                    <polygon class="map-state ${classOf('RS')}" id="veic-state-RS" points="
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
                        200.43,348.172 200.828,348.57 201.327,347.477 204.822,345.389 211.312,338.824 216.604,326.889 218.351,320.922
                        218.663,320.547 217.33,319.502"
                        style="fill: ${getColorForUF('RS')};"
                        onmouseenter="handleVeiculosMapHover(event,'RS')"
                        onmousemove="handleVeiculosMapMove(event)"
                        onmouseleave="handleVeiculosMapLeave()"
                        onclick="toggleVeiculosUFFromMap('RS')">
                    </polygon>
                    <text class="map-label ${classOf('RS')}" x="186" y="335" style="font-size:3.5px;" onclick="toggleVeiculosUFFromMap('RS')">RS</text>
                </svg>
            </div>

            <!-- Paraná -->
            ${cardHtml('PR')}
            <!-- Santa Catarina -->
            ${cardHtml('SC')}
            <!-- Rio Grande do Sul -->
            ${cardHtml('RS')}

            <!-- Legenda de volume -->
            <div class="uf-discreet-legend">
                <span style="font-size:9px;opacity:0.8;margin-right:4px;">Menor Gasto</span>
                <div class="legend-gradient-bar"></div>
                <span style="font-size:9px;opacity:0.8;margin-left:4px;">Maior Gasto</span>
            </div>
        </div>
    `;
}

// ── Interatividade do mapa (Escopo Global) ──
window.handleVeiculosCardHover = uf => {
    const polygon = document.getElementById('veic-state-' + uf);
    if (polygon) polygon.classList.add('hovered');
};
window.handleVeiculosCardLeave = uf => {
    const polygon = document.getElementById('veic-state-' + uf);
    if (polygon) polygon.classList.remove('hovered');
};
window.handleVeiculosMapHover = (e, uf) => {
    const card    = document.getElementById('veic-card-UF-' + uf);
    const polygon = document.getElementById('veic-state-' + uf);
    if (card)    card.classList.add('hovered');
    if (polygon) polygon.classList.add('hovered');
};
window.handleVeiculosMapMove  = () => {};
window.handleVeiculosMapLeave = () => {
    ['PR','SC','RS'].forEach(uf => {
        const card    = document.getElementById('veic-card-UF-' + uf);
        const polygon = document.getElementById('veic-state-' + uf);
        if (card)    card.classList.remove('hovered');
        if (polygon) polygon.classList.remove('hovered');
    });
};
window.toggleVeiculosUFFromMap = uf => {
    const sel = document.getElementById('filter-veiculos-uf');
    if (!sel) return;
    sel.value = sel.value === uf ? 'all' : uf;
    applyVeiculosFilters();
};

// ── Drill-Down Condutores → Veículos ─────────────────────────────────────
function renderDriverChart(th, tooltipBase) {
    const drillInfo    = document.getElementById('driver-drill-info');
    const drillBackBtn = document.getElementById('driver-drill-back');
    const chartTitle   = document.getElementById('driver-chart-title');
    const drillHint    = document.getElementById('driver-drill-hint');
    const canvas       = document.getElementById('chart-veiculos-top-drivers');

    if (driverDrillState.active) {
        const driver = driverDrillState.driver;
        if (chartTitle)   chartTitle.textContent = `Veículos de ${shortName(driver)}`;
        if (drillInfo)    { drillInfo.textContent = `Condutor: ${shortName(driver)}`; drillInfo.style.display = 'inline-flex'; }
        if (drillBackBtn) drillBackBtn.style.display = 'inline-flex';
        if (drillHint)    drillHint.style.display = 'none';

        const vehicleSpends = {};
        filteredVeiculosData
            .filter(r => r.driver === driver && r.plate)
            .forEach(r => { vehicleSpends[r.plate] = (vehicleSpends[r.plate] || 0) + (r.value || 0); });

        const items = Object.keys(vehicleSpends)
            .map(plate => ({ plate, value: vehicleSpends[plate] }))
            .sort((a, b) => b.value - a.value);

        // Altura dinâmica para rolagem vertical
        if (canvas && canvas.parentElement) {
            const chartHeight = Math.max(352, items.length * 32);
            canvas.parentElement.style.height = chartHeight + 'px';
        }

        renderVeiculosChart('chart-veiculos-top-drivers', 'bar', {
            labels: items.map(i => i.plate),
            datasets: [{ label:'Gasto (R$)', data: items.map(i => i.value), backgroundColor: 'rgba(46,204,113,0.85)', hoverBackgroundColor: '#2ecc71', borderRadius: 5, borderSkipped: false }]
        }, buildHBarOptions(th, tooltipBase, v => ` Gasto: ${fmtBRL(v)}`, true));
    } else {
        if (chartTitle)   chartTitle.textContent = 'Gasto por Condutores';
        if (drillInfo)    drillInfo.style.display = 'none';
        if (drillBackBtn) drillBackBtn.style.display = 'none';
        if (drillHint)    drillHint.style.display = 'flex';

        const spends = {};
        filteredVeiculosData.forEach(r => {
            if (r.driver) spends[r.driver] = (spends[r.driver] || 0) + (r.value || 0);
        });
        const allDrivers = Object.keys(spends)
            .map(name => ({ name, value: spends[name] }))
            .sort((a, b) => b.value - a.value);

        // Altura dinâmica para rolagem vertical
        if (canvas && canvas.parentElement) {
            const chartHeight = Math.max(352, allDrivers.length * 32);
            canvas.parentElement.style.height = chartHeight + 'px';
        }

        const opts = buildHBarOptions(th, tooltipBase, v => ` Gasto: ${fmtBRL(v)}`, false);
        opts.onClick = (evt, elements) => {
            if (!elements.length) return;
            const clickedDriver = allDrivers[elements[0].index].name;
            const driverInput = document.getElementById('filter-veiculos-driver');
            if (!driverInput) return;
            // Toggle: se já filtrado pelo mesmo condutor, limpa o filtro
            if (driverInput.value.trim().toUpperCase() === clickedDriver.trim().toUpperCase()) {
                driverInput.value = '';
            } else {
                driverInput.value = clickedDriver;
            }
            applyVeiculosFilters();
        };
        opts.plugins.tooltip.callbacks.title = items => shortName(items[0].label);

        // Highlight da barra com filtro ativo
        const activeDriver = (document.getElementById('filter-veiculos-driver')?.value || '').trim().toUpperCase();
        const driverColors = allDrivers.map(d =>
            activeDriver && d.name.trim().toUpperCase() === activeDriver
                ? '#3498db'                       // barra selecionada: cor sólida
                : activeDriver
                    ? 'rgba(52,152,219,0.25)'     // demais: esmaecidas
                    : 'rgba(52,152,219,0.85)'     // sem filtro: cor padrão
        );

        renderVeiculosChart('chart-veiculos-top-drivers', 'bar', {
            labels: allDrivers.map(d => shortName(d.name)),
            datasets: [{ label:'Gasto (R$)', data: allDrivers.map(d => d.value), backgroundColor: driverColors, hoverBackgroundColor: '#3498db', borderRadius: 5, borderSkipped: false }]
        }, opts);
    }
}

function resetDriverDrill() {
    driverDrillState = { active: false, driver: null };
    const th = getThemeVars();
    renderDriverChart(th, buildTooltipBase(th));
}

// ── Drill-Down Veículos → Condutores ─────────────────────────────────────
function renderVehicleChart(th, tooltipBase) {
    const drillInfo    = document.getElementById('vehicle-drill-info');
    const drillBackBtn = document.getElementById('vehicle-drill-back');
    const chartTitle   = document.getElementById('vehicle-chart-title');
    const drillHint    = document.getElementById('vehicle-drill-hint');
    const canvas       = document.getElementById('chart-veiculos-top-vehicles');

    if (vehicleDrillState.active) {
        const plate = vehicleDrillState.plate;
        if (chartTitle)   chartTitle.textContent = `Condutores do Veículo ${plate}`;
        if (drillInfo)    { drillInfo.textContent = `Placa: ${plate}`; drillInfo.style.display = 'inline-flex'; }
        if (drillBackBtn) drillBackBtn.style.display = 'inline-flex';
        if (drillHint)    drillHint.style.display = 'none';

        const driverSpends = {};
        filteredVeiculosData
            .filter(r => r.plate === plate && r.driver)
            .forEach(r => { driverSpends[r.driver] = (driverSpends[r.driver] || 0) + (r.value || 0); });

        const items = Object.keys(driverSpends)
            .map(driver => ({ driver, value: driverSpends[driver] }))
            .sort((a, b) => b.value - a.value);

        // Altura dinâmica para rolagem vertical
        if (canvas && canvas.parentElement) {
            const chartHeight = Math.max(352, items.length * 32);
            canvas.parentElement.style.height = chartHeight + 'px';
        }

        const opts = buildHBarOptions(th, tooltipBase, v => ` Gasto: ${fmtBRL(v)}`, true);
        opts.plugins.tooltip.callbacks.title = ctxItems => shortName(ctxItems[0].label);

        renderVeiculosChart('chart-veiculos-top-vehicles', 'bar', {
            labels: items.map(i => shortName(i.driver)),
            datasets: [{ label:'Gasto (R$)', data: items.map(i => i.value), backgroundColor: 'rgba(243,159,24,0.85)', hoverBackgroundColor: '#f39f18', borderRadius: 5, borderSkipped: false }]
        }, opts);
    } else {
        if (chartTitle)   chartTitle.textContent = 'Gasto por Veículos';
        if (drillInfo)    drillInfo.style.display = 'none';
        if (drillBackBtn) drillBackBtn.style.display = 'none';
        if (drillHint)    drillHint.style.display = 'flex';

        const spends = {};
        const vehicleModels = {};
        filteredVeiculosData.forEach(r => {
            if (r.plate) {
                const plate = r.plate.trim();
                spends[plate] = (spends[plate] || 0) + (r.value || 0);
                if (r.model && !vehicleModels[plate]) {
                    vehicleModels[plate] = r.model.trim();
                }
            }
        });
        const allVehicles = Object.keys(spends)
            .map(plate => ({ 
                plate, 
                value: spends[plate], 
                model: vehicleModels[plate] || '' 
            }))
            .sort((a, b) => b.value - a.value);

        // Altura dinâmica para rolagem vertical
        if (canvas && canvas.parentElement) {
            const chartHeight = Math.max(352, allVehicles.length * 32);
            canvas.parentElement.style.height = chartHeight + 'px';
        }

        const opts = buildHBarOptions(th, tooltipBase, v => ` Gasto: ${fmtBRL(v)}`, false);
        opts.onClick = (evt, elements) => {
            if (!elements.length) return;
            const clickedPlate = allVehicles[elements[0].index].plate;
            const plateInput = document.getElementById('filter-veiculos-plate');
            if (!plateInput) return;
            // Toggle: se já filtrado pela mesma placa, limpa o filtro
            if (plateInput.value.trim().toUpperCase() === clickedPlate.trim().toUpperCase()) {
                plateInput.value = '';
            } else {
                plateInput.value = clickedPlate;
            }
            applyVeiculosFilters();
        };

        // Highlight da barra com filtro ativo
        const activePlate = (document.getElementById('filter-veiculos-plate')?.value || '').trim().toUpperCase();
        const vehicleColors = allVehicles.map(v =>
            activePlate && v.plate.trim().toUpperCase() === activePlate
                ? '#f39f18'                        // barra selecionada: cor sólida
                : activePlate
                    ? 'rgba(243,159,24,0.25)'      // demais: esmaecidas
                    : 'rgba(243,159,24,0.85)'      // sem filtro: cor padrão
        );

        renderVeiculosChart('chart-veiculos-top-vehicles', 'bar', {
            labels: allVehicles.map(v => v.model ? `${v.plate} (${v.model})` : v.plate),
            datasets: [{ label:'Gasto (R$)', data: allVehicles.map(v => v.value), backgroundColor: vehicleColors, hoverBackgroundColor: '#f39f18', borderRadius: 5, borderSkipped: false }]
        }, opts);
    }
}

function resetVehicleDrill() {
    vehicleDrillState = { active: false, plate: null };
    const th = getThemeVars();
    renderVehicleChart(th, buildTooltipBase(th));
}

// ── Helper: opções de gráfico de barras horizontais ──────────────────────
function buildHBarOptions(th, tooltipBase, labelCb, isDrillResult) {
    return {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                grid: { color: th.gridColor, drawBorder: false },
                ticks: {
                    color: th.textColor,
                    font: { size: 11, family: "'Outfit', sans-serif" },
                    callback: v => fmtBRLCompact(v),
                }
            },
            y: {
                grid: { display: false },
                ticks: {
                    color: th.textColor,
                    font: { size: 11, family: "'Outfit', sans-serif" },
                }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                ...tooltipBase,
                callbacks: {
                    label: ctx => labelCb(ctx.raw),
                }
            },
            datalabels: {
                display: true,
                align: 'right',
                anchor: 'end',
                color: th.textColor,
                font: { family: "'Outfit', sans-serif", size: 10, weight: 'bold' },
                formatter: v => fmtBRLCompact(v)
            }
        }
    };
}

// ── Gráficos de consumo detalhado (dados ricos: litros, KM/L) ────────────
function renderRichCharts(th, tooltipBase) {
    const richRecs = filteredVeiculosData.filter(r => r.liters !== null && r.liters > 0);
    const richEl   = document.querySelectorAll('#view-veiculos-container .data-rich-only');
    richEl.forEach(el => el.classList.toggle('hidden', richRecs.length === 0));
    if (!richRecs.length) return;



    // B. Preço médio por litro por UF
    const ufFuelPrices = { SC: { gas: [], diesel: [] }, RS: { gas: [], diesel: [] }, PR: { gas: [], diesel: [] } };
    richRecs.forEach(r => {
        if (!ufFuelPrices[r.uf] || !r.vlLiter || r.vlLiter <= 0) return;
        if (r.fuel && r.fuel.toUpperCase().includes('GASOLINA')) ufFuelPrices[r.uf].gas.push(r.vlLiter);
        else if (r.fuel && r.fuel.toUpperCase().includes('DIESEL'))  ufFuelPrices[r.uf].diesel.push(r.vlLiter);
    });
    const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    renderVeiculosChart('chart-veiculos-avg-price', 'bar', {
        labels: ['SC', 'RS', 'PR'],
        datasets: [
            { label: 'Gasolina', data: ['SC','RS','PR'].map(u => avg(ufFuelPrices[u].gas)),    backgroundColor: 'rgba(243,159,24,0.85)', borderRadius: 4 },
            { label: 'Diesel',   data: ['SC','RS','PR'].map(u => avg(ufFuelPrices[u].diesel)), backgroundColor: 'rgba(52,152,219,0.85)',  borderRadius: 4 }
        ]
    }, {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: { grid: { color: th.gridColor }, min: 4, max: 7.5, ticks: { color: th.textColor, callback: v => 'R$ ' + v.toFixed(2) } },
            x: { grid: { display: false }, ticks: { color: th.textColor } }
        },
        plugins: {
            legend: { labels: { color: th.textColor, boxWidth: 10 } },
            tooltip: { ...tooltipBase, callbacks: { label: ctx => ' ' + ctx.dataset.label + ': R$ ' + ctx.raw.toFixed(2) } },
            datalabels: {
                display: ctx => ctx.dataset.data[ctx.dataIndex] > 0,
                align: 'top',
                anchor: 'end',
                color: th.textColor,
                font: { family: "'Outfit', sans-serif", size: 10, weight: 'bold' },
                formatter: v => 'R$ ' + v.toFixed(2).replace('.', ',')
            }
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
        set('table-veiculos-row-start', '0'); set('table-veiculos-row-end', '0');
        const prevBtn = document.getElementById('btn-veiculos-page-prev');
        const nextBtn = document.getElementById('btn-veiculos-page-next');
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        set('veiculos-page-indicator', 'Pág. 0 / 0');
        return;
    }

    set('table-veiculos-row-start', (start + 1).toString());
    set('table-veiculos-row-end',   end.toString());
    const prevBtn = document.getElementById('btn-veiculos-page-prev');
    const nextBtn = document.getElementById('btn-veiculos-page-next');
    if (prevBtn) prevBtn.disabled = tableVeiculosPage === 1;
    if (nextBtn) nextBtn.disabled = tableVeiculosPage === totalPages;
    set('veiculos-page-indicator', `Pág. ${tableVeiculosPage} / ${totalPages}`);

    data.slice(start, end).forEach(r => {
        const dateParts  = (r.date || '').split(' ');
        const dp         = (dateParts[0] || '').split('-');
        const displayDate = dp.length === 3 ? `${dp[2]}/${dp[1]}/${dp[0]} ${(dateParts[1] || '').substring(0, 5)}` : r.date;
        const ufBadge    = r.uf ? `<span class="badge ${(r.uf).toLowerCase()}">${r.uf}</span>` : '-';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Data Transação">${displayDate || '-'}</td>
            <td data-label="Placa"><strong>${r.plate || '-'}</strong></td>
            <td data-label="Modelo">${r.model  || '-'}</td>
            <td data-label="Motorista">${r.driver || '-'}</td>
            <td data-label="UF">${ufBadge}</td>
            <td data-label="Valor" class="text-right"><strong>${fmtBRL(r.value || 0)}</strong></td>
            <td data-label="Litros" class="text-right">${r.liters !== null && r.liters !== undefined ? r.liters.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) + ' L' : '-'}</td>
            <td data-label="Preço/L" class="text-right">${r.vlLiter !== null && r.vlLiter !== undefined ? fmtBRL(r.vlLiter) : '-'}</td>
            <td data-label="Combustível">${r.fuel || '-'}</td>
            <td data-label="Km" class="text-right">${r.km !== null && r.km !== undefined ? r.km.toLocaleString('pt-BR') : '-'}</td>
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
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.getAttribute('data-sort') === column) {
            th.classList.add(tableVeiculosSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
    tableVeiculosPage = 1;
    renderVeiculosTable();
}

// ── Componente: Top 3 Motoristas e Veículos com maior consumo ──────────────
function renderTop3Consumo() {
    try {
        const driversContainer = document.getElementById('top-3-drivers-container');
        const vehiclesContainer = document.getElementById('top-3-vehicles-container');
        if (!driversContainer || !vehiclesContainer) return;

        // 1. Agrupar motoristas
        const driverData = {};
        filteredVeiculosData.forEach(r => {
            if (!r.driver) return;
            const driver = r.driver.trim();
            if (!driverData[driver]) {
                driverData[driver] = { spent: 0, count: 0, ufs: new Set() };
            }
            driverData[driver].spent += (r.value || 0);
            driverData[driver].count += 1;
            if (r.uf) driverData[driver].ufs.add(r.uf);
        });

        // Ordenar e pegar top 3
        const topDrivers = Object.keys(driverData)
            .map(name => ({
                name,
                spent: driverData[name].spent,
                count: driverData[name].count,
                ufs: Array.from(driverData[name].ufs)
            }))
            .sort((a, b) => b.spent - a.spent)
            .slice(0, 3);

        // 2. Agrupar veículos
        const vehicleData = {};
        filteredVeiculosData.forEach(r => {
            if (!r.plate) return;
            const plate = r.plate.trim();
            if (!vehicleData[plate]) {
                vehicleData[plate] = { spent: 0, count: 0, ufs: new Set(), model: r.model || '' };
            }
            vehicleData[plate].spent += (r.value || 0);
            vehicleData[plate].count += 1;
            if (r.uf) vehicleData[plate].ufs.add(r.uf);
            if (r.model && !vehicleData[plate].model) {
                vehicleData[plate].model = r.model.trim();
            }
        });

        // Ordenar e pegar top 3
        const topVehicles = Object.keys(vehicleData)
            .map(plate => ({
                plate,
                spent: vehicleData[plate].spent,
                count: vehicleData[plate].count,
                ufs: Array.from(vehicleData[plate].ufs),
                model: vehicleData[plate].model || ''
            }))
            .sort((a, b) => b.spent - a.spent)
            .slice(0, 3);

        // Renderizar motoristas
        if (topDrivers.length === 0) {
            driversContainer.innerHTML = `<div style="font-size: 11px; color: var(--text-secondary); text-align: center; padding: 8px;">Nenhum dado disponível</div>`;
        } else {
            driversContainer.innerHTML = topDrivers.map((d, index) => {
                const ufsBadges = d.ufs.map(uf => `<span class="badge ${uf.toLowerCase()}" style="margin-left: 4px; padding: 2px 6px; font-size: 9px; border-radius: 4px;">${uf}</span>`).join('');
                const avgSpent = d.count > 0 ? (d.spent / d.count) : 0;
                return `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 12px; font-size: 12px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <strong style="color: var(--text-primary); font-size: 11px;">#${index + 1}</strong>
                            <div>
                                <div style="font-weight: 600; color: var(--text-primary); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${d.name}">${shortName(d.name)}</div>
                                <div style="font-size: 10px; color: var(--text-secondary); margin-top: 2px;">
                                    ${d.count} abast. • Méd. ${fmtBRL(avgSpent)} ${ufsBadges}
                                </div>
                            </div>
                        </div>
                        <div style="text-align: right; font-weight: 700; color: var(--color-primary-light); font-size: 12.5px;">
                            ${fmtBRL(d.spent)}
                        </div>
                    </div>`;
            }).join('');
        }

        // Renderizar veículos
        if (topVehicles.length === 0) {
            vehiclesContainer.innerHTML = `<div style="font-size: 11px; color: var(--text-secondary); text-align: center; padding: 8px;">Nenhum dado disponível</div>`;
        } else {
            vehiclesContainer.innerHTML = topVehicles.map((v, index) => {
                const ufsBadges = v.ufs.map(uf => `<span class="badge ${uf.toLowerCase()}" style="margin-left: 4px; padding: 2px 6px; font-size: 9px; border-radius: 4px;">${uf}</span>`).join('');
                const avgSpent = v.count > 0 ? (v.spent / v.count) : 0;
                const modelDisplay = v.model ? ` <span style="font-weight: 500; font-size: 10.5px; color: var(--text-secondary);">(${v.model})</span>` : '';
                return `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 12px; font-size: 12px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <strong style="color: var(--text-primary); font-size: 11px;">#${index + 1}</strong>
                            <div>
                                <div style="font-weight: 700; color: var(--text-primary); letter-spacing: 0.5px;">${v.plate}${modelDisplay}</div>
                                <div style="font-size: 10px; color: var(--text-secondary); margin-top: 2px;">
                                    ${v.count} abast. • Méd. ${fmtBRL(avgSpent)} ${ufsBadges}
                                </div>
                            </div>
                        </div>
                        <div style="text-align: right; font-weight: 700; color: var(--color-secondary-light); font-size: 12.5px;">
                            ${fmtBRL(v.spent)}
                        </div>
                    </div>`;
            }).join('');
        }

    } catch (err) {
        console.error("Erro ao renderizar Top 3 Consumo:", err);
    }
}

// ── Exportações Globais para Handlers Inline do HTML ──
window.initVeiculos = initVeiculos;
window.applyVeiculosFilters = applyVeiculosFilters;
window.resetVeiculosFilters = resetVeiculosFilters;
window.resetVeiculosDateFilter = resetVeiculosDateFilter;
window.resetDriverDrill = resetDriverDrill;
window.resetVehicleDrill = resetVehicleDrill;
window.setVeiculosEvolutionGranularity = setVeiculosEvolutionGranularity;
window.switchVeiculosTab = switchVeiculosTab;
window.renderTop3Consumo = renderTop3Consumo;
