// veiculos_app.js - Vehicle Fueling Dashboard Controller for JLE BI

// State management (scoped specifically for vehicles view)
let activeVeiculosTab = 'indicators'; // 'indicators' or 'details'
let filteredVeiculosData = [];
let chartVeiculosInstances = {};
let veiculosDataLoaded = false;

// Table pagination and sorting
let tableVeiculosPage = 1;
const tableVeiculosRowsPerPage = 50;
let tableVeiculosSortColumn = 'date';
let tableVeiculosSortDirection = 'asc';
let tableVeiculosSearchQuery = '';

// Initialize Vehicles Dashboard
function initVeiculos() {
    if (typeof VEICULOS_DATA === 'undefined') {
        console.error("VEICULOS_DATA not loaded. Check veiculos_data.js");
        return;
    }
    
    // Set initial data
    filteredVeiculosData = [...VEICULOS_DATA];
    
    // Setup event listeners
    initVeiculosEventListeners();
    
    // Populate filter dropdowns
    populateVeiculosFilters();
    
    // Apply filters first time
    applyVeiculosFilters();
    
    // Render report
    renderVeiculosReport();
    
    veiculosDataLoaded = true;
}

// Setup Event Listeners
function initVeiculosEventListeners() {
    // Tab switching inside Veículos view
    document.querySelectorAll('#view-veiculos-container .tab-btn').forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            switchVeiculosTab(tabName);
        });
    });
    
    // Filter controls
    document.getElementById('filter-veiculos-month').addEventListener('change', applyVeiculosFilters);
    document.getElementById('filter-veiculos-uf').addEventListener('change', applyVeiculosFilters);
    document.getElementById('filter-veiculos-fuel').addEventListener('change', applyVeiculosFilters);
    
    // Autocomplete search filters
    document.getElementById('filter-veiculos-driver').addEventListener('input', applyVeiculosFilters);
    document.getElementById('filter-veiculos-plate').addEventListener('input', applyVeiculosFilters);
    
    // Reset filters
    document.getElementById('btn-veiculos-reset').addEventListener('click', resetVeiculosFilters);
    
    // Table global search
    document.getElementById('table-veiculos-search').addEventListener('input', (e) => {
        tableVeiculosSearchQuery = e.target.value;
        tableVeiculosPage = 1;
        renderVeiculosTable();
    });
    
    // Table headers click for sorting
    document.querySelectorAll('#view-veiculos-container .data-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-sort');
            handleVeiculosTableSort(col);
        });
    });
    
    // Pagination buttons
    document.getElementById('btn-veiculos-page-prev').addEventListener('click', () => {
        if (tableVeiculosPage > 1) {
            tableVeiculosPage--;
            renderVeiculosTable();
        }
    });
    document.getElementById('btn-veiculos-page-next').addEventListener('click', () => {
        const totalPages = Math.ceil(getVeiculosTableFilteredData().length / tableVeiculosRowsPerPage);
        if (tableVeiculosPage < totalPages) {
            tableVeiculosPage++;
            renderVeiculosTable();
        }
    });
    
    // Re-draw charts when light/dark theme toggle button is clicked (main sidebar button)
    const mainThemeBtn = document.getElementById('theme-toggle-btn') || document.getElementById('themeToggleBtn');
    if (mainThemeBtn) {
        mainThemeBtn.addEventListener('click', () => {
            setTimeout(updateVeiculosCharts, 100);
        });
    }
}

// Populate filter select options dynamically
function populateVeiculosFilters() {
    const fuelSelect = document.getElementById('filter-veiculos-fuel');
    if (!fuelSelect) return;
    
    const fuels = new Set();
    const drivers = new Set();
    const plates = new Set();
    
    VEICULOS_DATA.forEach(r => {
        if (r.fuel) fuels.add(r.fuel);
        if (r.driver) drivers.add(r.driver);
        if (r.plate) plates.add(r.plate);
    });
    
    // Fuel types
    Array.from(fuels).sort().forEach(fuel => {
        const opt = document.createElement('option');
        opt.value = fuel;
        opt.textContent = fuel;
        fuelSelect.appendChild(opt);
    });
    
    // Drivers datalist
    const driverDatalist = document.getElementById('veiculos-driver-list');
    if (driverDatalist) {
        driverDatalist.innerHTML = '';
        Array.from(drivers).sort().forEach(driver => {
            const opt = document.createElement('option');
            opt.value = driver;
            driverDatalist.appendChild(opt);
        });
    }
    
    // Plates datalist
    const plateDatalist = document.getElementById('veiculos-plate-list');
    if (plateDatalist) {
        plateDatalist.innerHTML = '';
        Array.from(plates).sort().forEach(plate => {
            const opt = document.createElement('option');
            opt.value = plate;
            plateDatalist.appendChild(opt);
        });
    }
}

// Reset filters to default values
function resetVeiculosFilters() {
    document.getElementById('filter-veiculos-month').value = 'all';
    document.getElementById('filter-veiculos-uf').value = 'all';
    document.getElementById('filter-veiculos-fuel').value = 'all';
    document.getElementById('filter-veiculos-driver').value = '';
    document.getElementById('filter-veiculos-plate').value = '';
    
    applyVeiculosFilters();
}

// Apply selected filters
function applyVeiculosFilters() {
    const month = document.getElementById('filter-veiculos-month').value;
    const uf = document.getElementById('filter-veiculos-uf').value;
    const fuel = document.getElementById('filter-veiculos-fuel').value;
    const driver = document.getElementById('filter-veiculos-driver').value.trim().toUpperCase();
    const plate = document.getElementById('filter-veiculos-plate').value.trim().toUpperCase();
    
    filteredVeiculosData = VEICULOS_DATA.filter(r => {
        if (month !== 'all' && r.month !== month) return false;
        if (uf !== 'all' && r.uf !== uf) return false;
        if (fuel !== 'all' && r.fuel !== fuel) return false;
        if (driver && !r.driver.includes(driver)) return false;
        if (plate && !r.plate.includes(plate)) return false;
        return true;
    });
    
    tableVeiculosPage = 1;
    
    // Update Competence Badge in Main Header
    updateVeiculosCompetenceBadge();
    
    // Update KPIs & Accounts
    updateVeiculosKPIs();
    
    // Check rich data visibility
    const hasRichData = filteredVeiculosData.some(r => r.liters !== null && r.liters > 0);
    const richElements = document.querySelectorAll('#view-veiculos-container .data-rich-only');
    richElements.forEach(el => {
        if (hasRichData) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });
    
    // Re-render panels
    if (activeVeiculosTab === 'indicators') {
        updateVeiculosCharts();
    } else {
        renderVeiculosTable();
    }
}

// Switch between subtabs (Indicadores, Lançamentos)
function switchVeiculosTab(tabName) {
    activeVeiculosTab = tabName;
    
    document.querySelectorAll('#view-veiculos-container .tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    if (tabName === 'indicators') {
        document.getElementById('subview-veiculos-indicators').classList.add('active');
        document.getElementById('subview-veiculos-details').classList.remove('active');
        setTimeout(updateVeiculosCharts, 50);
    } else {
        document.getElementById('subview-veiculos-indicators').classList.remove('active');
        document.getElementById('subview-veiculos-details').classList.add('active');
        renderVeiculosTable();
    }
}

// Update header competence badge inside the main viewport subtitle
function updateVeiculosCompetenceBadge() {
    const mesSelect = document.getElementById('filter-veiculos-month');
    if (!mesSelect) return;
    
    const mesText = mesSelect.options[mesSelect.selectedIndex].text;
    const subtitleEl = document.getElementById('view-subtitle');
    if (subtitleEl) {
        subtitleEl.innerHTML = `Gestão de Frota e Controle de Combustível. <span class="badge-competencia">Competência: ${mesText}</span>`;
    }
}

// Calculate KPIs & Regional cards
function updateVeiculosKPIs() {
    // General metrics
    const totalSpent = filteredVeiculosData.reduce((sum, r) => sum + r.value, 0);
    document.getElementById('kpi-veiculos-total').textContent = formatVeiculosCurrency(totalSpent);
    
    const totalCount = filteredVeiculosData.length;
    document.getElementById('kpi-veiculos-count').textContent = totalCount.toLocaleString('pt-BR');
    
    const avgSpent = totalCount > 0 ? totalSpent / totalCount : 0;
    document.getElementById('kpi-veiculos-avg').textContent = formatVeiculosCurrency(avgSpent);
    
    const vehicles = new Set(filteredVeiculosData.map(r => r.plate).filter(p => p !== ''));
    document.getElementById('kpi-veiculos-active-vehicles').textContent = vehicles.size.toLocaleString('pt-BR');
    
    const drivers = new Set(filteredVeiculosData.map(r => r.driver).filter(d => d !== ''));
    document.getElementById('kpi-veiculos-active-drivers').textContent = drivers.size.toLocaleString('pt-BR');
    
    const richRecords = filteredVeiculosData.filter(r => r.liters !== null);
    const totalLiters = richRecords.reduce((sum, r) => sum + r.liters, 0);
    document.getElementById('kpi-veiculos-liters').textContent = totalLiters.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " L";

    // Regional progress cards (SC, RS, PR)
    const regionalData = {
        SC: { spent: 0, count: 0 },
        RS: { spent: 0, count: 0 },
        PR: { spent: 0, count: 0 }
    };
    
    filteredVeiculosData.forEach(r => {
        if (regionalData[r.uf]) {
            regionalData[r.uf].spent += r.value;
            regionalData[r.uf].count++;
        }
    });
    
    const updateRegionalCard = (ufCode) => {
        const data = regionalData[ufCode];
        const pct = totalSpent > 0 ? (data.spent / totalSpent) * 100 : 0;
        
        const balanceEl = document.getElementById(`balance-veiculos-${ufCode}`);
        const countEl = document.getElementById(`count-veiculos-${ufCode}`);
        const pctEl = document.getElementById(`pct-veiculos-${ufCode}`);
        const progressEl = document.getElementById(`progress-veiculos-${ufCode}`);
        
        if (balanceEl) balanceEl.textContent = formatVeiculosCurrency(data.spent);
        if (countEl) countEl.textContent = data.count.toLocaleString('pt-BR');
        if (pctEl) pctEl.textContent = pct.toFixed(1) + "%";
        if (progressEl) progressEl.style.width = pct + "%";
    };
    
    updateRegionalCard('SC');
    updateRegionalCard('RS');
    updateRegionalCard('PR');
}

// Helper to format currency values in BRL
function formatVeiculosCurrency(val) {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Update charts using JLE BI colors and detecting themes
function updateVeiculosCharts() {
    // Detect theme class on body
    const isLight = document.body.classList.contains('light-theme');
    
    // Style configurations based on theme
    const textColor = isLight ? '#637381' : '#8a99a8';
    const gridColor = isLight ? '#e2e8f0' : '#20313f';
    const tooltipBg = isLight ? '#ffffff' : '#111c24';
    const tooltipText = isLight ? '#1f2c3d' : '#f5f6f8';
    const tooltipBorder = isLight ? '#e0e6ed' : '#20313f';
    
    // Set chart defaults
    Chart.defaults.color = textColor;
    Chart.defaults.font.family = "'Outfit', 'Inter', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.responsive = true;
    Chart.defaults.maintainAspectRatio = false;

    // 1. Line Chart: Evolution of spent by State (SC: Green, RS: Blue, PR: Gold/Orange)
    const monthlyData = {
        'JANEIRO': { SC: 0, RS: 0, PR: 0 },
        'FEVEREIRO': { SC: 0, RS: 0, PR: 0 },
        'MARCO': { SC: 0, RS: 0, PR: 0 },
        'ABRIL': { SC: 0, RS: 0, PR: 0 },
        'MAIO': { SC: 0, RS: 0, PR: 0 }
    };
    
    filteredVeiculosData.forEach(r => {
        if (monthlyData[r.month] && monthlyData[r.month][r.uf] !== undefined) {
            monthlyData[r.month][r.uf] += r.value;
        }
    });
    
    const months = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO'];
    const scEvolution = months.map(m => monthlyData[m].SC);
    const rsEvolution = months.map(m => monthlyData[m].RS);
    const prEvolution = months.map(m => monthlyData[m].PR);
    
    renderVeiculosChart('chart-veiculos-evolution', 'line', {
        labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai'],
        datasets: [
            {
                label: 'Santa Catarina (SC)',
                data: scEvolution,
                borderColor: '#2ecc71', // JLE Green/Success
                backgroundColor: 'rgba(46, 204, 113, 0.03)',
                tension: 0.2,
                borderWidth: 2,
                fill: true,
                pointRadius: 3.5,
                pointHoverRadius: 5
            },
            {
                label: 'Rio Grande do Sul (RS)',
                data: rsEvolution,
                borderColor: '#3498db', // JLE Blue/Info
                backgroundColor: 'rgba(52, 152, 219, 0.03)',
                tension: 0.2,
                borderWidth: 2,
                fill: true,
                pointRadius: 3.5,
                pointHoverRadius: 5
            },
            {
                label: 'Paraná (PR)',
                data: prEvolution,
                borderColor: '#f39f18', // JLE Orange/Secondary
                backgroundColor: 'rgba(243, 159, 24, 0.03)',
                tension: 0.2,
                borderWidth: 2,
                fill: true,
                pointRadius: 3.5,
                pointHoverRadius: 5
            }
        ]
    }, {
        scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { 
                grid: { color: gridColor }, 
                ticks: { 
                    color: textColor,
                    callback: (value) => 'R$ ' + value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
                } 
            }
        },
        plugins: {
            legend: { position: 'top', labels: { boxWidth: 10, boxHeight: 6 } },
            tooltip: {
                backgroundColor: tooltipBg,
                titleColor: tooltipText,
                bodyColor: tooltipText,
                borderColor: tooltipBorder,
                borderWidth: 1,
                callbacks: {
                    label: (context) => ' ' + context.dataset.label + ': ' + formatVeiculosCurrency(context.raw)
                }
            }
        }
    });

    // 2. Doughnut Chart: UF Breakdown
    const ufTotals = { SC: 0, RS: 0, PR: 0 };
    filteredVeiculosData.forEach(r => {
        if (ufTotals[r.uf] !== undefined) {
            ufTotals[r.uf] += r.value;
        }
    });
    
    renderVeiculosChart('chart-veiculos-uf', 'doughnut', {
        labels: ['Santa Catarina (SC)', 'Rio Grande do Sul (RS)', 'Paraná (PR)'],
        datasets: [{
            data: [ufTotals.SC, ufTotals.RS, ufTotals.PR],
            backgroundColor: ['#2ecc71', '#3498db', '#f39f18'],
            borderWidth: isLight ? 1 : 2,
            borderColor: isLight ? '#ffffff' : '#111c24'
        }]
    }, {
        plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 8, boxHeight: 8 } },
            tooltip: {
                backgroundColor: tooltipBg,
                titleColor: tooltipText,
                bodyColor: tooltipText,
                borderColor: tooltipBorder,
                borderWidth: 1,
                callbacks: {
                    label: (context) => ' ' + context.label + ': ' + formatVeiculosCurrency(context.raw)
                }
            }
        },
        cutout: '70%'
    });

    // 3. Horizontal Bar Chart: Top 10 Drivers
    const driverSpends = {};
    filteredVeiculosData.forEach(r => {
        if (r.driver) {
            driverSpends[r.driver] = (driverSpends[r.driver] || 0) + r.value;
        }
    });
    const topDrivers = Object.keys(driverSpends)
        .map(name => ({ name, value: driverSpends[name] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
        
    renderVeiculosChart('chart-veiculos-top-drivers', 'bar', {
        labels: topDrivers.map(d => formatShortName(d.name)),
        datasets: [{
            label: 'Total Gasto (R$)',
            data: topDrivers.map(d => d.value),
            backgroundColor: 'rgba(52, 152, 219, 0.85)',
            hoverBackgroundColor: '#3498db',
            borderRadius: 4
        }]
    }, {
        indexAxis: 'y',
        scales: {
            x: { 
                grid: { color: gridColor }, 
                ticks: { 
                    color: textColor,
                    callback: (value) => 'R$ ' + value.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) 
                } 
            },
            y: { grid: { display: false }, ticks: { color: textColor } }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: tooltipBg,
                titleColor: tooltipText,
                bodyColor: tooltipText,
                borderColor: tooltipBorder,
                borderWidth: 1,
                callbacks: {
                    label: (context) => ' Gasto: ' + formatVeiculosCurrency(context.raw)
                }
            }
        }
    });

    // 4. Horizontal Bar Chart: Top 10 Vehicles
    const vehicleSpends = {};
    filteredVeiculosData.forEach(r => {
        if (r.plate) {
            vehicleSpends[r.plate] = (vehicleSpends[r.plate] || 0) + r.value;
        }
    });
    const topVehicles = Object.keys(vehicleSpends)
        .map(plate => ({ plate, value: vehicleSpends[plate] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
        
    renderVeiculosChart('chart-veiculos-top-vehicles', 'bar', {
        labels: topVehicles.map(v => v.plate),
        datasets: [{
            label: 'Total Gasto (R$)',
            data: topVehicles.map(v => v.value),
            backgroundColor: 'rgba(243, 159, 24, 0.85)',
            hoverBackgroundColor: '#f39f18',
            borderRadius: 4
        }]
    }, {
        indexAxis: 'y',
        scales: {
            x: { 
                grid: { color: gridColor }, 
                ticks: { 
                    color: textColor,
                    callback: (value) => 'R$ ' + value.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) 
                } 
            },
            y: { grid: { display: false }, ticks: { color: textColor } }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: tooltipBg,
                titleColor: tooltipText,
                bodyColor: tooltipText,
                borderColor: tooltipBorder,
                borderWidth: 1,
                callbacks: {
                    label: (context) => ' Gasto: ' + formatVeiculosCurrency(context.raw)
                }
            }
        }
    });

    // 5. Rich Data charts (Fev/Mai)
    const richRecords = filteredVeiculosData.filter(r => r.liters !== null && r.liters > 0);
    if (richRecords.length > 0) {
        // A. Fuel Types
        const fuelLiters = {};
        richRecords.forEach(r => {
            if (r.fuel) {
                fuelLiters[r.fuel] = (fuelLiters[r.fuel] || 0) + r.liters;
            }
        });
        const sortedFuels = Object.keys(fuelLiters).map(f => ({ name: f, liters: fuelLiters[f] }));
        
        renderVeiculosChart('chart-veiculos-fuel-dist', 'doughnut', {
            labels: sortedFuels.map(f => f.name),
            datasets: [{
                data: sortedFuels.map(f => f.liters),
                backgroundColor: ['#2ecc71', '#3498db', '#f39f18', '#34495e', '#9b59b6', '#e74c3c'],
                borderWidth: isLight ? 1 : 2,
                borderColor: isLight ? '#ffffff' : '#111c24'
            }]
        }, {
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 9 } } },
                tooltip: {
                    backgroundColor: tooltipBg,
                    titleColor: tooltipText,
                    bodyColor: tooltipText,
                    borderColor: tooltipBorder,
                    borderWidth: 1,
                    callbacks: {
                        label: (context) => ' ' + context.label + ': ' + context.raw.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' L'
                    }
                }
            },
            cutout: '60%'
        });

        // B. Average prices per liter
        const stateFuelPrices = {
            'SC': { 'GASOLINA COMUM': [], 'DIESEL S-10 COMUM': [] },
            'RS': { 'GASOLINA COMUM': [], 'DIESEL S-10 COMUM': [] },
            'PR': { 'GASOLINA COMUM': [], 'DIESEL S-10 COMUM': [] }
        };
        richRecords.forEach(r => {
            if (stateFuelPrices[r.uf] && stateFuelPrices[r.uf][r.fuel] && r.vlLiter > 0) {
                stateFuelPrices[r.uf][r.fuel].push(r.vlLiter);
            }
        });
        const getAvg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const ufs = ['SC', 'RS', 'PR'];
        const gasPrices = ufs.map(uf => getAvg(stateFuelPrices[uf]['GASOLINA COMUM']));
        const dieselPrices = ufs.map(uf => getAvg(stateFuelPrices[uf]['DIESEL S-10 COMUM']));

        renderVeiculosChart('chart-veiculos-avg-price', 'bar', {
            labels: ['SC', 'RS', 'PR'],
            datasets: [
                {
                    label: 'Gasolina Comum',
                    data: gasPrices,
                    backgroundColor: 'rgba(243, 159, 24, 0.85)',
                    borderRadius: 3
                },
                {
                    label: 'Diesel S-10 Comum',
                    data: dieselPrices,
                    backgroundColor: 'rgba(52, 152, 219, 0.85)',
                    borderRadius: 3
                }
            ]
        }, {
            scales: {
                y: { 
                    grid: { color: gridColor }, 
                    min: 4,
                    max: 7.5,
                    ticks: { 
                        color: textColor,
                        callback: (value) => 'R$ ' + value.toFixed(2) 
                    } 
                },
                x: { grid: { display: false } }
            },
            plugins: {
                tooltip: {
                    backgroundColor: tooltipBg,
                    titleColor: tooltipText,
                    bodyColor: tooltipText,
                    borderColor: tooltipBorder,
                    borderWidth: 1,
                    callbacks: {
                        label: (context) => ' ' + context.dataset.label + ': R$ ' + context.raw.toFixed(2)
                    }
                }
            }
        });

        // C. Fleet efficiency (KM/L)
        const modelEfficiency = {};
        richRecords.forEach(r => {
            if (r.model && r.kml > 0 && r.kml < 30) {
                if (!modelEfficiency[r.model]) {
                    modelEfficiency[r.model] = [];
                }
                modelEfficiency[r.model].push(r.kml);
            }
        });
        const topModels = Object.keys(modelEfficiency)
            .map(m => ({ name: m, avgKml: getAvg(modelEfficiency[m]), count: modelEfficiency[m].length }))
            .filter(item => item.count >= 2)
            .sort((a, b) => b.avgKml - a.avgKml)
            .slice(0, 5);

        renderVeiculosChart('chart-veiculos-efficiency', 'bar', {
            labels: topModels.map(m => m.name),
            datasets: [{
                label: 'KM/L Média',
                data: topModels.map(m => m.avgKml),
                backgroundColor: 'rgba(46, 204, 113, 0.85)',
                borderRadius: 3
            }]
        }, {
            scales: {
                y: { 
                    grid: { color: gridColor },
                    ticks: { 
                        color: textColor,
                        callback: (value) => value.toFixed(1) + ' Km/L' 
                    } 
                },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: tooltipBg,
                    titleColor: tooltipText,
                    bodyColor: tooltipText,
                    borderColor: tooltipBorder,
                    borderWidth: 1,
                    callbacks: {
                        label: (context) => ' Eficiência: ' + context.raw.toFixed(2) + ' Km/L'
                    }
                }
            }
        });
    }
}

// Format short driver name for display
function formatShortName(name) {
    if (!name) return "";
    const parts = name.split(" ");
    if (parts.length <= 2) return name;
    return parts[0] + " " + parts[parts.length - 1];
}

// Render vehicle chart helper
function renderVeiculosChart(canvasId, type, data, options) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    if (chartVeiculosInstances[canvasId]) {
        chartVeiculosInstances[canvasId].destroy();
    }
    
    chartVeiculosInstances[canvasId] = new Chart(canvas, {
        type: type,
        data: data,
        options: options
    });
}

// Filter and search table records
function getVeiculosTableFilteredData() {
    let data = [...filteredVeiculosData];
    
    // Global search query filter
    if (tableVeiculosSearchQuery) {
        const query = tableVeiculosSearchQuery.trim().toUpperCase();
        data = data.filter(r => {
            return r.driver.includes(query) ||
                   r.plate.includes(query) ||
                   r.uf.includes(query) ||
                   (r.fuel && r.fuel.includes(query)) ||
                   (r.model && r.model.toUpperCase().includes(query)) ||
                   r.date.includes(query);
        });
    }
    
    // Apply Sorting
    data.sort((a, b) => {
        let valA = a[tableVeiculosSortColumn];
        let valB = b[tableVeiculosSortColumn];
        
        if (valA === null || valA === undefined) return tableVeiculosSortDirection === 'asc' ? 1 : -1;
        if (valB === null || valB === undefined) return tableVeiculosSortDirection === 'asc' ? -1 : 1;
        
        if (typeof valA === 'string') {
            return tableVeiculosSortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
            return tableVeiculosSortDirection === 'asc' ? valA - valB : valB - valA;
        }
    });
    
    return data;
}

// Render data table rows
function renderVeiculosTable() {
    const tableData = getVeiculosTableFilteredData();
    const tbody = document.getElementById('table-veiculos-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const totalRecords = tableData.length;
    document.getElementById('table-veiculos-row-total').textContent = totalRecords.toLocaleString('pt-BR');
    
    if (totalRecords === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-secondary); padding: 40px 0;">Nenhum lançamento encontrado para os filtros e busca atuais.</td></tr>`;
        document.getElementById('table-veiculos-row-start').textContent = '0';
        document.getElementById('table-veiculos-row-end').textContent = '0';
        document.getElementById('btn-veiculos-page-prev').disabled = true;
        document.getElementById('btn-veiculos-page-next').disabled = true;
        document.getElementById('veiculos-page-indicator').textContent = 'Pág. 0 / 0';
        return;
    }
    
    const totalPages = Math.ceil(totalRecords / tableVeiculosRowsPerPage);
    if (tableVeiculosPage > totalPages) tableVeiculosPage = totalPages;
    
    const startIndex = (tableVeiculosPage - 1) * tableVeiculosRowsPerPage;
    const endIndex = Math.min(startIndex + tableVeiculosRowsPerPage, totalRecords);
    
    document.getElementById('table-veiculos-row-start').textContent = (startIndex + 1).toString();
    document.getElementById('table-veiculos-row-end').textContent = endIndex.toString();
    
    document.getElementById('btn-veiculos-page-prev').disabled = (tableVeiculosPage === 1);
    document.getElementById('btn-veiculos-page-next').disabled = (tableVeiculosPage === totalPages);
    document.getElementById('veiculos-page-indicator').textContent = `Pág. ${tableVeiculosPage} / ${totalPages}`;
    
    const pageSlice = tableData.slice(startIndex, endIndex);
    
    pageSlice.forEach(r => {
        const tr = document.createElement('tr');
        
        const displayDate = formatDate(r.date);
        const displayValue = formatVeiculosCurrency(r.value);
        const displayLiters = r.liters !== null ? r.liters.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) + " L" : "-";
        const displayVlLiter = r.vlLiter !== null ? r.vlLiter.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }) : "-";
        const displayModel = r.model ? r.model : "-";
        const displayFuel = r.fuel ? r.fuel : "-";
        const displayKM = r.km !== null ? r.km.toLocaleString('pt-BR') : "-";
        
        tr.innerHTML = `
            <td>${displayDate}</td>
            <td><strong>${r.plate}</strong></td>
            <td>${displayModel}</td>
            <td>${r.driver}</td>
            <td><span class="badge ${r.uf.toLowerCase()}">${r.uf}</span></td>
            <td class="text-right"><strong>${displayValue}</strong></td>
            <td class="text-right">${displayLiters}</td>
            <td class="text-right">${displayVlLiter}</td>
            <td>${displayFuel}</td>
            <td class="text-right">${displayKM}</td>
        `;
        
        tbody.appendChild(tr);
    });
}

// Convert "yyyy-MM-dd HH:mm:ss" to Brazilian "dd/MM/yyyy HH:mm"
function formatDate(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split(" ");
    const dateParts = parts[0].split("-");
    const timeParts = parts[1] ? parts[1].split(":") : ["00", "00"];
    return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]} ${timeParts[0]}:${timeParts[1]}`;
}

// Handle sorting column change
function handleVeiculosTableSort(column) {
    if (tableVeiculosSortColumn === column) {
        tableVeiculosSortDirection = tableVeiculosSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        tableVeiculosSortColumn = column;
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

// Render report contents
function renderVeiculosReport() {
    const reportDiv = document.getElementById('veiculos-analysis-content');
    if (!reportDiv) return;
    
    reportDiv.innerHTML = `
        <h3>1. Resumo Executivo e Evolução de Custos</h3>
        <p>Este relatório apresenta a consolidação e análise gerencial dos dados de abastecimento de veículos da <strong>JLE Telecomunicações</strong> referentes ao período de <strong>janeiro a maio de 2026</strong>. Ao todo, foram registradas <strong>2.020 transações individuais</strong> de abastecimento, totalizando um desembolso de <strong>R$ 540.845,64</strong>.</p>
        
        <p>Abaixo, apresentamos a evolução mensal consolidada dos gastos da frota:</p>
        
        <table>
            <thead>
                <tr>
                    <th>Mês de Referência</th>
                    <th>Nº Abastecimentos</th>
                    <th>Valor Total Gasto</th>
                    <th>Gasto Médio p/ Transação</th>
                    <th>Litros Abastecidos (Apenas Fev/Mai)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><strong>Janeiro</strong></td>
                    <td>451</td>
                    <td>R$ 105.344,01</td>
                    <td>R$ 233,58</td>
                    <td>-</td>
                </tr>
                <tr>
                    <td><strong>Fevereiro</strong></td>
                    <td>363</td>
                    <td>R$ 96.448,82</td>
                    <td>R$ 265,70</td>
                    <td>15.218,9 L</td>
                </tr>
                <tr>
                    <td><strong>Março</strong></td>
                    <td>403</td>
                    <td>R$ 112.867,73</td>
                    <td>R$ 280,07</td>
                    <td>-</td>
                </tr>
                <tr>
                    <td><strong>Abril</strong></td>
                    <td>399</td>
                    <td>R$ 114.552,17</td>
                    <td>R$ 287,10</td>
                    <td>-</td>
                </tr>
                <tr>
                    <td><strong>Maio</strong></td>
                    <td>404</td>
                    <td>R$ 111.632,91</td>
                    <td>R$ 276,32</td>
                    <td>16.879,9 L</td>
                </tr>
                <tr style="background-color: var(--bg-input); font-weight: 700;">
                    <td>TOTAL CONSOLIDADO</td>
                    <td>2.020</td>
                    <td>R$ 540.845,64</td>
                    <td>R$ 267,75</td>
                    <td>32.098,7 L (Fev/Mai)</td>
                </tr>
            </tbody>
        </table>
        
        <p><strong>Observação sobre tendências:</strong> O volume mensal de gastos manteve-se relativamente estável, oscilando entre R$ 96k e R$ 114k. Fevereiro registrou o menor custo absoluto devido ao menor número de dias e abastecimentos (363 transações). Nota-se uma tendência clara de aumento do valor médio por abastecimento, subindo de R$ 233,58 em janeiro para R$ 276,32 em maio, indicando potenciais aumentos de preço nos postos ou o uso de veículos de maior capacidade volumétrica.</p>
        
        <h3>2. Análise Regional e Disparidades Estaduais (UF)</h3>
        <p>A frota opera em três estados da Região Sul: Santa Catarina (SC), Rio Grande do Sul (RS) e Paraná (PR). Os gastos por região mostram um comportamento extremamente desigual:</p>
        
        <ul>
            <li><strong>Santa Catarina (SC)</strong> representa o principal polo de consumo da empresa, concentrando <strong>58,7% do valor gasto</strong> (R$ 316.910,63) com 1.341 abastecimentos.</li>
            <li><strong>Rio Grande do Sul (RS)</strong> ocupa a segunda posição, com <strong>35,4% dos custos</strong> (R$ 191.492,56) e 697 abastecimentos.</li>
            <li><strong>Paraná (PR)</strong> tem operação reduzida, somando apenas <strong>5,9% dos custos</strong> (R$ 32.442,45) e 76 abastecimentos no período.</li>
        </ul>

        <blockquote>
            <p><strong>Disparidade de Preço por Litro:</strong> A análise detalhada de preços em Fevereiro e Maio indica que <strong>o Rio Grande do Sul (RS) possui a gasolina mais cara</strong> da região, com preço médio de <strong>R$ 6,56/L</strong>, seguido de perto por Santa Catarina (R$ 6,29/L). O Paraná (PR), embora com poucos dados, demonstrou alta volatilidade de preços em rodovias (R$ 6,28/L). No caso do Diesel S-10, Santa Catarina apresentou melhor custo-benefício de contratos, com média de R$ 5,85/L, contra R$ 6,12/L no RS.</p>
        </blockquote>

        <h3>3. Concentração de Custos por Veículos e Motoristas</h3>
        <p>A análise revela uma forte concentração de consumo na frota. Um grupo restrito de veículos e motoristas responde por uma fatia desproporcional do orçamento de combustível:</p>
        
        <h4>Principais Veículos (Placas) em Destaque de Custos:</h4>
        <ol>
            <li><strong>IMM4770 (Cargo / Caminhão Diesel):</strong> Gasto acumulado de <strong>R$ 17.514,52</strong> no período. É o maior consumidor individual devido à capacidade de carga pesada e percurso de longo alcance.</li>
            <li><strong>AYL8H92 (Montana / Gasolina):</strong> Custo acumulado de <strong>R$ 11.455,52</strong>.</li>
            <li><strong>BAV2F37 (Strada / Gasolina):</strong> Custo de <strong>R$ 6.843,26</strong>.</li>
        </ol>

        <h4>Principais Condutores por Gasto:</h4>
        <ol>
            <li><strong>NILTON TALASKA (Motorista do caminhão Cargo):</strong> Responsável por <strong>R$ 18.067,52</strong> em abastecimentos.</li>
            <li><strong>EDSON SANTOS DE BARROS:</strong> Responsável por <strong>R$ 11.246,63</strong>.</li>
            <li><strong>ANDRE KRAEMER:</strong> Acumulou <strong>R$ 10.741,63</strong>.</li>
        </ol>
        
        <p>Recomenda-se realizar auditorias focadas nestes 10 motoristas de topo para certificar a eficiência de suas rotas e confirmar a correspondência hodômetro-combustível.</p>

        <h3>4. Análise de Eficiência e Combustíveis (Fev/Mai)</h3>
        <p>Os dados completos fornecidos em Fevereiro e Maio contendo litros e hodômetro nos trazem informações valiosas:</p>
        
        <ul>
            <li><strong>Mix de Combustíveis:</strong> O maior volume de abastecimento da frota em litros é do tipo <strong>Gasolina Comum</strong>, seguida por <strong>Diesel S-10 Comum</strong>.</li>
            <li><strong>Eficiência Média por Modelo (Km/L):</strong> Os veículos leves do modelo <strong>Strada</strong> e <strong>Doblo</strong> apresentaram média de consumo urbano/misto variando entre <strong>9,2 Km/L e 11,5 Km/L</strong>. Já os caminhões pesados de transporte regional rodoviário (como o modelo Cargo) rodam em médias baixas de <strong>2,5 a 4,1 Km/L</strong>, dependendo da carga e topografia regional.</li>
        </ul>

        <h3>5. Oportunidades de Otimização e Recomendações</h3>
        
        <p><strong>1. Erro de Cálculo Identificado no Excel Original:</strong><br>
        Identificamos um erro de fórmula no fechamento de <strong>Maio</strong> na planilha original Excel do usuário. A fórmula do total geral de Maio na célula correspondente totalizava <strong>R$ 111.315,07</strong>, no entanto, ela deixou de incluir a transação de número 405 (motorista Felipe Morando no valor de R$ 317,84). Nosso dashboard corrigiu essa distorção, consolidando o valor real de Maio em <strong>R$ 111.632,91</strong>. Recomenda-se retificar o fechamento contábil interno da empresa.</p>

        <p><strong>2. Auditoria de Preços e Rastreabilidade de Notas:</strong><br>
        Em vários postos rodoviários no RS, a gasolina foi cobrada a mais de R$ 6,80 o litro, e em postos de SC a R$ 6,40. Propõe-se estabelecer uma rede de <strong>Postos Conveniados</strong> ao longo das rotas usuais para garantir um desconto corporativo fixo e preço fixado em bomba.</p>

        <p><strong>3. Monitoramento de Hodômetro Obrigatório:</strong><br>
        A planilha de Maio possui <strong>KM Rodados ou Horas Trabalhadas</strong> em branco para vários lançamentos de abastecimento. Para garantir a fidelidade do cálculo de consumo (KM/L) e evitar fraudes ou desvios de combustível, a empresa deve impor o preenchimento obrigatório do hodômetro no momento da emissão do cupom.</p>
    `;
}
