// manutencao_app.js
// Logic for Manutenção (Claro RS) page in BI JLE Telecom - 100% System Standardized with Analítico Claro

(function() {
    let rawData = [];
    let filteredData = [];

    // State for pagination & filters
    let currentPage = 1;
    const itemsPerPage = 15;
    let activeTab = 'indicadores'; // 'indicadores' or 'relatorio'

    // Chart instances
    let chartMensal = null;
    let chartAtividades = null;
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
        'OUTROS': 'fa-solid fa-folder-open'
    };

    function initManutencao() {
        if (!window.MANUTENCAO_DATA) {
            console.warn("MANUTENCAO_DATA não carregado ainda.");
            return;
        }

        rawData = window.MANUTENCAO_DATA;
        filteredData = [...rawData];

        populateFilterDropdowns();
        setupEventListeners();
        renderPage();
    }

    function populateFilterDropdowns() {
        const selStatus = document.getElementById('manut-filter-status');
        const selAtividade = document.getElementById('manut-filter-atividade');
        const selLocalidade = document.getElementById('manut-filter-localidade');
        const selEquipe = document.getElementById('manut-filter-equipe');

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
    }

    function setupEventListeners() {
        const selStatus = document.getElementById('manut-filter-status');
        const selAtividade = document.getElementById('manut-filter-atividade');
        const selLocalidade = document.getElementById('manut-filter-localidade');
        const selEquipe = document.getElementById('manut-filter-equipe');
        const inputDtInicio = document.getElementById('manut-filter-data-inicio');
        const inputDtFim = document.getElementById('manut-filter-data-fim');
        const inputSearch = document.getElementById('manut-search-input');
        const btnRefresh = document.getElementById('manut-btn-refresh-data');

        [selStatus, selAtividade, selLocalidade, selEquipe, inputDtInicio, inputDtFim].forEach(el => {
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
        const inputDtInicio = document.getElementById('manut-filter-data-inicio');
        const inputDtFim = document.getElementById('manut-filter-data-fim');
        const inputSearch = document.getElementById('manut-search-input');

        if (selStatus) selStatus.value = '';
        if (selAtividade) selAtividade.value = '';
        if (selLocalidade) selLocalidade.value = '';
        if (selEquipe) selEquipe.value = '';
        if (inputDtInicio) inputDtInicio.value = '';
        if (inputDtFim) inputDtFim.value = '';
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
            if (viewIndicadores) viewIndicadores.style.display = 'block';
            if (viewRelatorio) viewRelatorio.style.display = 'none';
            renderCharts();
        } else {
            if (viewIndicadores) viewIndicadores.style.display = 'none';
            if (viewRelatorio) viewRelatorio.style.display = 'block';
            renderTable();
        }
    }

    function parseAcionamentoDate(dateStr) {
        if (!dateStr || dateStr === '-') return null;
        const parts = dateStr.split(' ')[0].split('/');
        if (parts.length === 3) {
            return new Date(parts[2], parts[1] - 1, parts[0]);
        } else if (parts.length === 2) {
            return new Date(2026, parts[1] - 1, parts[0]);
        }
        return null;
    }

    function applyFilters() {
        const selStatus = document.getElementById('manut-filter-status')?.value || '';
        const selAtividade = document.getElementById('manut-filter-atividade')?.value || '';
        const selLocalidade = document.getElementById('manut-filter-localidade')?.value || '';
        const selEquipe = document.getElementById('manut-filter-equipe')?.value || '';
        const dtInicioStr = document.getElementById('manut-filter-data-inicio')?.value || '';
        const dtFimStr = document.getElementById('manut-filter-data-fim')?.value || '';
        const searchQuery = (document.getElementById('manut-search-input')?.value || '').toLowerCase().trim();

        const dtInicio = dtInicioStr ? new Date(dtInicioStr + 'T00:00:00') : null;
        const dtFim = dtFimStr ? new Date(dtFimStr + 'T23:59:59') : null;

        filteredData = rawData.filter(r => {
            if (selStatus && r.status !== selStatus) return false;
            if (selAtividade && r.tipo_atividade !== selAtividade) return false;
            if (selLocalidade && r.localidade !== selLocalidade) return false;
            if (selEquipe && r.equipe !== selEquipe) return false;

            if (dtInicio || dtFim) {
                const dateObj = parseAcionamentoDate(r.data_acionamento);
                if (dtInicio && (!dateObj || dateObj < dtInicio)) return false;
                if (dtFim && (!dateObj || dateObj > dtFim)) return false;
            }

            if (searchQuery) {
                const matchSearch = 
                    (r.ral_rec || '').toLowerCase().includes(searchQuery) ||
                    (r.atividade || '').toLowerCase().includes(searchQuery) ||
                    (r.localidade || '').toLowerCase().includes(searchQuery) ||
                    (r.equipe || '').toLowerCase().includes(searchQuery) ||
                    (r.status || '').toLowerCase().includes(searchQuery) ||
                    (r.tipo_atividade || '').toLowerCase().includes(searchQuery);
                if (!matchSearch) return false;
            }

            return true;
        });

        currentPage = 1;
        renderPage();
    }

    function renderPage() {
        renderKpiCards();
        renderCategoryCards();
        if (activeTab === 'indicadores') {
            renderCharts();
        } else {
            renderTable();
        }
    }

    function renderKpiCards() {
        const totalOfs = filteredData.length;
        const emObra = filteredData.filter(r => r.status === 'OBRA').length;
        const concluidas = filteredData.filter(r => r.status === 'CONCLUIDO').length;
        const emMedicao = filteredData.filter(r => r.status === 'MEDIÇÃO').length;
        const precificados = filteredData.filter(r => r.precificado === 'SIM').length;

        document.getElementById('manut-kpi-total').textContent = totalOfs.toLocaleString('pt-BR');
        document.getElementById('manut-kpi-obra').textContent = emObra.toLocaleString('pt-BR');
        document.getElementById('manut-kpi-concluido').textContent = concluidas.toLocaleString('pt-BR');
        document.getElementById('manut-kpi-medicao').textContent = emMedicao.toLocaleString('pt-BR');
        document.getElementById('manut-kpi-precificado').textContent = precificados.toLocaleString('pt-BR');
    }

    function renderCategoryCards() {
        const container = document.getElementById('manut-category-cards-container');
        if (!container) return;

        const ativCounts = {};
        filteredData.forEach(r => {
            const at = r.tipo_atividade && r.tipo_atividade !== '-' ? r.tipo_atividade : 'OUTROS';
            ativCounts[at] = (ativCounts[at] || 0) + 1;
        });

        const totalCount = filteredData.length || 1;
        const sortedAtiv = Object.keys(ativCounts).sort((a,b) => ativCounts[b] - ativCounts[a]).slice(0, 6);

        container.innerHTML = sortedAtiv.map(cat => {
            const count = ativCounts[cat];
            const pct = ((count / totalCount) * 100).toFixed(1).replace('.', ',');
            const iconClass = CATEGORY_ICONS[cat] || 'fa-solid fa-wrench';
            const activeAtiv = document.getElementById('manut-filter-atividade')?.value || '';

            return `
            <div class="cobranca-category-card${activeAtiv === cat ? ' active' : ''}" onclick="window.filterByManutCategory('${cat}')">
                <div class="kpi-info" style="flex-grow: 1;">
                    <div class="cobranca-category-title">${cat}</div>
                    <div class="cobranca-category-value">${count.toLocaleString('pt-BR')} <span style="font-size: 11px; color: var(--text-secondary); font-weight: 600;">OFs</span></div>
                    <div class="kpi-sub" style="font-size: 11px; color: var(--color-primary); font-weight: 700;">
                        <span style="background: rgba(0,180,216,0.12); padding: 2px 7px; border-radius: 10px;">${pct}% do Total</span>
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

        // 1. Chart Mensal de Manutenção (Data de Acionamento)
        const monthNames = { '01':'JAN', '02':'FEV', '03':'MAR', '04':'ABR', '05':'MAI', '06':'JUN', '07':'JUL', '08':'AGO', '09':'SET', '10':'OUT', '11':'NOV', '12':'DEZ' };
        const monthOrder = ['FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL'];
        const monthlyCounts = { FEV:0, MAR:0, ABR:0, MAI:0, JUN:0, JUL:0 };

        filteredData.forEach(r => {
            if (r.data_acionamento && r.data_acionamento !== '-') {
                const parts = r.data_acionamento.split(' ')[0].split('/');
                if (parts.length >= 2) {
                    const mKey = monthNames[parts[1].substring(0, 2)];
                    if (mKey && monthlyCounts[mKey] !== undefined) {
                        monthlyCounts[mKey]++;
                    }
                }
            }
        });

        const dataMensal = monthOrder.map(m => monthlyCounts[m]);

        const ctxMensal = document.getElementById('manut-chart-mensal')?.getContext('2d');
        if (ctxMensal) {
            if (chartMensal) chartMensal.destroy();

            const gradLine = ctxMensal.createLinearGradient(0, 0, 0, 300);
            gradLine.addColorStop(0, 'rgba(0, 180, 216, 0.35)');
            gradLine.addColorStop(1, 'rgba(0, 180, 216, 0.0)');

            chartMensal = new Chart(ctxMensal, {
                type: 'line',
                data: {
                    labels: monthOrder,
                    datasets: [{
                        label: 'Acionamentos de Manutenção',
                        data: dataMensal,
                        borderColor: '#00b4d8',
                        borderWidth: 3,
                        backgroundColor: gradLine,
                        fill: true,
                        tension: 0.35,
                        pointBackgroundColor: '#00b4d8',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 7
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: {
                            display: true,
                            color: '#ffffff',
                            align: 'top',
                            anchor: 'end',
                            offset: 4,
                            font: { weight: 'bold', size: 12 },
                            formatter: (val) => val > 0 ? val.toLocaleString('pt-BR') : ''
                        }
                    },
                    scales: {
                        x: { ticks: { color: textColor, font: { weight: 'bold' } }, grid: { display: false } },
                        y: { ticks: { color: '#94a3b8' }, grid: { color: gridColor }, grace: '18%' }
                    }
                },
                plugins: pluginsList
            });
        }

        // 2. Chart Atividades (Bar Horizontal)
        const ativCounts = {};
        filteredData.forEach(r => {
            const at = r.tipo_atividade && r.tipo_atividade !== '-' ? r.tipo_atividade : 'Outros';
            ativCounts[at] = (ativCounts[at] || 0) + 1;
        });
        const sortedAtiv = Object.keys(ativCounts).sort((a,b) => ativCounts[b] - ativCounts[a]).slice(0, 8);
        const dataAtiv = sortedAtiv.map(k => ativCounts[k]);

        const ctxAtiv = document.getElementById('manut-chart-atividades')?.getContext('2d');
        if (ctxAtiv) {
            if (chartAtividades) chartAtividades.destroy();
            chartAtividades = new Chart(ctxAtiv, {
                type: 'bar',
                data: {
                    labels: sortedAtiv,
                    datasets: [{
                        label: 'Quantidade de OFs',
                        data: dataAtiv,
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
                        datalabels: {
                            display: true,
                            color: '#ffffff',
                            anchor: 'end',
                            align: 'end',
                            font: { weight: 'bold', size: 11 },
                            formatter: (val) => val.toLocaleString('pt-BR')
                        }
                    },
                    scales: {
                        x: { ticks: { color: '#94a3b8' }, grid: { color: gridColor }, grace: '20%' },
                        y: { ticks: { color: textColor, font: { weight: 'bold' } }, grid: { display: false } }
                    }
                },
                plugins: pluginsList
            });
        }

        // 3. Chart Localidades (Top 8 Cidades)
        const locCounts = {};
        filteredData.forEach(r => {
            const loc = r.localidade && r.localidade !== '-' ? r.localidade : 'Outros';
            locCounts[loc] = (locCounts[loc] || 0) + 1;
        });
        const sortedLoc = Object.keys(locCounts).sort((a,b) => locCounts[b] - locCounts[a]).slice(0, 8);
        const dataLoc = sortedLoc.map(k => locCounts[k]);

        const ctxLoc = document.getElementById('manut-chart-localidades')?.getContext('2d');
        if (ctxLoc) {
            if (chartLocalidades) chartLocalidades.destroy();
            chartLocalidades = new Chart(ctxLoc, {
                type: 'bar',
                data: {
                    labels: sortedLoc,
                    datasets: [{
                        label: 'OFs por Localidade',
                        data: dataLoc,
                        backgroundColor: '#10b981',
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: {
                            display: true,
                            color: '#ffffff',
                            anchor: 'end',
                            align: 'end',
                            font: { weight: 'bold', size: 11 },
                            formatter: (val) => val.toLocaleString('pt-BR')
                        }
                    },
                    scales: {
                        x: { ticks: { color: textColor, font: { weight: 'bold' } }, grid: { display: false } },
                        y: { ticks: { color: '#94a3b8' }, grid: { color: gridColor }, grace: '18%' }
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
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: #94a3b8;">Nenhum registro localizado.</td></tr>`;
            renderPagination(0);
            return;
        }

        tbody.innerHTML = pageItems.map(r => {
            const statusBadge = getStatusBadge(r.status);
            return `
            <tr>
                <td style="font-weight: 700; color: #38ef7d;">${r.ral_rec}</td>
                <td><span style="font-weight: 600; color: #f8fafc;">${r.tipo_atividade}</span></td>
                <td>${r.atividade}</td>
                <td>${r.localidade}</td>
                <td>${r.equipe}</td>
                <td>${statusBadge}</td>
                <td style="text-align: center;">
                    <button class="action-btn view-of-btn" data-ral="${r.ral_rec}" title="Ver detalhes" style="background: rgba(2,132,199,0.15); color: #38bdf8; border: 1px solid rgba(2,132,199,0.3); padding: 5px 10px; border-radius: 6px; cursor: pointer;">
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
            case 'MEDIÇÃO': return `<span class="badge" style="background: rgba(2,132,199,0.2); color: #38bdf8; border: 1px solid rgba(2,132,199,0.4); padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 11px;">MEDIÇÃO</span>`;
            case 'CONCLUIDO': return `<span class="badge" style="background: rgba(22,163,74,0.2); color: #4ade80; border: 1px solid rgba(22,163,74,0.4); padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 11px;">CONCLUÍDO</span>`;
            case 'OBRA': return `<span class="badge" style="background: rgba(230,126,34,0.2); color: #fb923c; border: 1px solid rgba(230,126,34,0.4); padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 11px;">OBRA</span>`;
            default: return `<span class="badge" style="background: rgba(148,163,184,0.2); color: #cbd5e1; border: 1px solid rgba(148,163,184,0.4); padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 11px;">${st || '-'}</span>`;
        }
    }

    function renderPagination(totalCount) {
        const container = document.getElementById('manut-pagination');
        if (!container) return;

        const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;
        container.innerHTML = `
            <div style="font-size: 13px; color: #94a3b8;">
                Exibindo página <strong>${currentPage}</strong> de <strong>${totalPages}</strong> (${totalCount} OFs no total)
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
                const item = rawData.find(r => r.ral_rec === ral);
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
                    <h3 style="margin: 0; font-size: 18px; color: #38ef7d;">OF ${item.ral_rec}</h3>
                    <button id="manut-close-modal" style="background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer;">&times;</button>
                </div>
                
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8; width: 40%;">Tipo de OF:</td><td style="font-weight: 700;">${item.tipo_of}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Tipo Atividade:</td><td style="font-weight: 700; color: #38bdf8;">${item.tipo_atividade}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Atividade:</td><td>${item.atividade}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Localidade:</td><td>${item.localidade}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Endereço:</td><td>${item.endereco}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Status:</td><td>${getStatusBadge(item.status)}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Equipe:</td><td>${item.equipe}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Data Acionamento:</td><td>${item.data_acionamento}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Data Conclusão:</td><td>${item.data_conclusao}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Precificado Claro:</td><td><strong style="color: ${item.precificado === 'SIM' ? '#4ade80' : '#cbd5e1'}">${item.precificado}</strong></td></tr>
                    <tr><td style="padding: 8px 0; color: #94a3b8;">Observação:</td><td>${item.observacao}</td></tr>
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
