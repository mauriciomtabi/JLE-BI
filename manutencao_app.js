// manutencao_app.js
// Logic for Manutenção (Claro RS) page in BI JLE Telecom - Clean Top 10 Charts (No Scroll, Vertical Columns for Cities)

(function() {
    let rawData = [];
    let filteredData = [];

    // State for pagination & filters
    let currentPage = 1;
    const itemsPerPage = 15;
    let activeTab = 'indicadores'; // 'indicadores' or 'relatorio'

    // Chart instances
    let chartMensal = null;
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

    function initManutencao() {
        if (!window.MANUTENCAO_DATA) {
            console.warn("MANUTENCAO_DATA não carregado ainda.");
            return;
        }

        // Filter out empty spreadsheet rows without status (Column I) to strictly reflect valid OFs matching CONTROLE DASH
        rawData = window.MANUTENCAO_DATA.filter(r => r.status && r.status !== '-' && r.status !== 'STATUS');
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

        // Unique Statuses (Coluna I)
        const statuses = [...new Set(rawData.map(r => r.status).filter(s => s && s !== '-'))].sort();
        selStatus.innerHTML = '<option value="">Todos os Status</option>' + 
            statuses.map(s => `<option value="${s}">${s}</option>`).join('');

        // Unique Tipos de Atividade (Coluna F)
        const atividades = [...new Set(rawData.map(r => r.tipo_atividade).filter(a => a && a !== '-'))].sort();
        selAtividade.innerHTML = '<option value="">Todas as Atividades</option>' + 
            atividades.map(a => `<option value="${a}">${a}</option>`).join('');

        // Unique Localidades (Coluna G)
        const localidades = [...new Set(rawData.map(r => r.localidade).filter(l => l && l !== '-'))].sort();
        selLocalidade.innerHTML = '<option value="">Todas as Localidades</option>' + 
            localidades.map(l => `<option value="${l}">${l}</option>`).join('');

        // Unique Equipes (Coluna N)
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
        const cleanStr = dateStr.split(' ')[0].trim();
        if (cleanStr.includes('/')) {
            const parts = cleanStr.split('/');
            if (parts.length === 3) {
                return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            } else if (parts.length === 2) {
                return new Date(2026, parseInt(parts[1]) - 1, parseInt(parts[0]));
            }
        } else if (cleanStr.includes('-')) {
            const parts = cleanStr.split('-');
            if (parts.length === 3) {
                return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            }
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
                const dateObj = parseAcionamentoDate(r.data_acionamento) || parseAcionamentoDate(r.data_envio_relatorio);
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
                    (r.tipo_atividade || '').toLowerCase().includes(searchQuery) ||
                    (r.tipo_defeito || '').toLowerCase().includes(searchQuery) ||
                    (r.causa_defeito || '').toLowerCase().includes(searchQuery);
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

    // 1. CARDS DE STATUS (Estritamente baseados na Coluna I - Status, sem subtexto)
    function renderKpiCards() {
        const totalOfs = filteredData.length;
        const emMedicao = filteredData.filter(r => r.status === 'MEDIÇÃO').length;
        const concluidas = filteredData.filter(r => r.status === 'CONCLUIDO').length;
        const emObra = filteredData.filter(r => r.status === 'OBRA').length;
        const adequacao = filteredData.filter(r => r.status === 'ADEQUAÇÃO').length;
        const documentacao = filteredData.filter(r => r.status === 'DOCUMENTAÇÃO').length;
        const fotos = filteredData.filter(r => r.status === 'FOTOS').length;

        document.getElementById('manut-kpi-total').textContent = totalOfs.toLocaleString('pt-BR');
        document.getElementById('manut-kpi-medicao').textContent = emMedicao.toLocaleString('pt-BR');
        document.getElementById('manut-kpi-concluido').textContent = concluidas.toLocaleString('pt-BR');
        document.getElementById('manut-kpi-obra').textContent = emObra.toLocaleString('pt-BR');
        document.getElementById('manut-kpi-adequacao').textContent = adequacao.toLocaleString('pt-BR');
        document.getElementById('manut-kpi-documentacao').textContent = documentacao.toLocaleString('pt-BR');
        document.getElementById('manut-kpi-fotos').textContent = fotos.toLocaleString('pt-BR');
    }

    // 2. CARDS DE CATEGORIA (Filtrados VISUALMENTE para exibir somente quantidade >= 10, mantendo os dados nos demais gráficos)
    function renderCategoryCards() {
        const container = document.getElementById('manut-category-cards-container');
        if (!container) return;

        const ativCounts = {};
        filteredData.forEach(r => {
            if (r.tipo_atividade && r.tipo_atividade !== '-') {
                const at = r.tipo_atividade;
                ativCounts[at] = (ativCounts[at] || 0) + 1;
            }
        });

        const totalCount = filteredData.length || 1;
        // Visual filter: Only display categories with count >= 10 in this row
        const sortedAtiv = Object.keys(ativCounts)
            .filter(cat => ativCounts[cat] >= 10)
            .sort((a,b) => ativCounts[b] - ativCounts[a]);

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

        // 1. Chart Mensal de Manutenção (Data de Acionamento - Até mês atual JUL/2026)
        const monthNames = { '01':'JAN', '02':'FEV', '03':'MAR', '04':'ABR', '05':'MAI', '06':'JUN', '07':'JUL', '08':'AGO', '09':'SET', '10':'OUT', '11':'NOV', '12':'DEZ' };
        const monthOrder = ['FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL'];
        const monthlyCounts = { FEV:0, MAR:0, ABR:0, MAI:0, JUN:0, JUL:0 };
        
        // Mapeamento de dias por mês (Ano 2026)
        const daysInMonths = { FEV: 28, MAR: 31, ABR: 30, MAI: 31, JUN: 30, JUL: 31 };
        
        // Ajuste dinâmico de dias decorridos se for o mês corrente (ex: Julho)
        const today = new Date();
        if (today.getFullYear() === 2026 && today.getMonth() === 6) { // Julho
            daysInMonths['JUL'] = Math.max(1, today.getDate());
        }

        // Janela móvel dos últimos 30 dias a partir da data de referência (hoje ou última data do conjunto)
        let refDate = new Date();
        refDate.setHours(23, 59, 59, 999);
        const ref30DaysAgo = new Date(refDate.getTime() - (29 * 24 * 60 * 60 * 1000));
        ref30DaysAgo.setHours(0, 0, 0, 0);

        let count30Days = 0;

        filteredData.forEach(r => {
            const dtObj = parseAcionamentoDate(r.data_acionamento) || parseAcionamentoDate(r.data_envio_relatorio);
            
            if (dtObj) {
                // Filtro para contagem mensal
                const mStr = (dtObj.getMonth() + 1).toString().padStart(2, '0');
                const mKey = monthNames[mStr];
                if (mKey && monthlyCounts[mKey] !== undefined) {
                    if (dtObj.getFullYear() === 2026 && dtObj.getMonth() <= 6) {
                        monthlyCounts[mKey]++;
                    }
                }

                // Filtro para janela de 30 dias
                if (dtObj >= ref30DaysAgo && dtObj <= refDate) {
                    count30Days++;
                }
            }
        });

        const dataMensal = monthOrder.map(m => monthlyCounts[m]);
        const dataMediasDiarias = monthOrder.map(m => {
            const cnt = monthlyCounts[m] || 0;
            const dCount = daysInMonths[m] || 30;
            return cnt / dCount;
        });

        // Atualizar o indicador de média dos últimos 30 dias no canto superior direito (arredondado para número inteiro)
        const avg30Days = count30Days / 30.0;
        const avg30DaysEl = document.getElementById('manut-avg-30days-val');
        if (avg30DaysEl) {
            avg30DaysEl.innerText = Math.round(avg30Days).toLocaleString('pt-BR');
        }

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
                                    const idx = context.dataIndex;
                                    const val = context.raw || 0;
                                    const avg = dataMediasDiarias[idx] || 0;
                                    return [
                                        ` Acionamentos: ${val.toLocaleString('pt-BR')}`,
                                        ` Média Diária: ${Math.round(avg).toLocaleString('pt-BR')} acionamentos/dia`
                                    ];
                                }
                            }
                        },
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

        // 2. Chart Tipo de Defeito - Estritamente TOP 10 (Sem rolagem, visual ultra limpo)
        const tipoDefCounts = {};
        filteredData.forEach(r => {
            if (r.tipo_defeito && r.tipo_defeito !== '-') {
                const td = r.tipo_defeito;
                tipoDefCounts[td] = (tipoDefCounts[td] || 0) + 1;
            }
        });
        const sortedTipoDef = Object.keys(tipoDefCounts).sort((a,b) => tipoDefCounts[b] - tipoDefCounts[a]).slice(0, 10);
        const dataTipoDef = sortedTipoDef.map(k => tipoDefCounts[k]);

        const ctxTipoDef = document.getElementById('manut-chart-tipo-defeito')?.getContext('2d');
        if (ctxTipoDef) {
            if (chartTipoDefeito) chartTipoDefeito.destroy();
            chartTipoDefeito = new Chart(ctxTipoDef, {
                type: 'bar',
                data: {
                    labels: sortedTipoDef,
                    datasets: [{
                        label: 'OFs por Tipo de Defeito',
                        data: dataTipoDef,
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

        // 3. Chart Causa do Defeito - Estritamente TOP 10 (Sem rolagem, visual ultra limpo)
        const causaDefCounts = {};
        filteredData.forEach(r => {
            if (r.causa_defeito && r.causa_defeito !== '-') {
                const cd = r.causa_defeito;
                causaDefCounts[cd] = (causaDefCounts[cd] || 0) + 1;
            }
        });
        const sortedCausaDef = Object.keys(causaDefCounts).sort((a,b) => causaDefCounts[b] - causaDefCounts[a]).slice(0, 10);
        const dataCausaDef = sortedCausaDef.map(k => causaDefCounts[k]);

        const ctxCausaDef = document.getElementById('manut-chart-causa-defeito')?.getContext('2d');
        if (ctxCausaDef) {
            if (chartCausaDefeito) chartCausaDefeito.destroy();
            chartCausaDefeito = new Chart(ctxCausaDef, {
                type: 'bar',
                data: {
                    labels: sortedCausaDef,
                    datasets: [{
                        label: 'OFs por Causa do Defeito',
                        data: dataCausaDef,
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

        // 4. Chart Localidades / Cidades - COLUNAS VERTICAIS (indexAxis: 'x') Estritamente TOP 10
        const locCounts = {};
        filteredData.forEach(r => {
            if (r.localidade && r.localidade !== '-') {
                const loc = r.localidade;
                locCounts[loc] = (locCounts[loc] || 0) + 1;
            }
        });
        const sortedLoc = Object.keys(locCounts).sort((a,b) => locCounts[b] - locCounts[a]).slice(0, 10);
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
                    indexAxis: 'x', // COLUNAS VERTICAIS EM PÉ
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: {
                            display: true,
                            color: '#ffffff',
                            anchor: 'end',
                            align: 'top',
                            font: { weight: 'bold', size: 11 },
                            formatter: (val) => val.toLocaleString('pt-BR')
                        }
                    },
                    scales: {
                        x: { ticks: { color: textColor, font: { weight: 'bold', size: 11 } }, grid: { display: false } },
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
            case 'ADEQUAÇÃO': return `<span class="badge" style="background: rgba(168,85,247,0.2); color: #c084fc; border: 1px solid rgba(168,85,247,0.4); padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 11px;">ADEQUAÇÃO</span>`;
            case 'DOCUMENTAÇÃO': return `<span class="badge" style="background: rgba(234,179,8,0.2); color: #facc15; border: 1px solid rgba(234,179,8,0.4); padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 11px;">DOCUMENTAÇÃO</span>`;
            case 'FOTOS': return `<span class="badge" style="background: rgba(236,72,153,0.2); color: #f472b6; border: 1px solid rgba(236,72,153,0.4); padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 11px;">FOTOS</span>`;
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
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Tipo Defeito:</td><td style="font-weight: 700; color: #fb923c;">${item.tipo_defeito}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Causa Defeito:</td><td style="font-weight: 700; color: #e67e22;">${item.causa_defeito}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Localidade:</td><td>${item.localidade}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Endereço:</td><td>${item.endereco}</td></tr>
                    <tr style="border-bottom: 1px solid #1e293b;"><td style="padding: 8px 0; color: #94a3b8;">Status (Coluna I):</td><td>${getStatusBadge(item.status)}</td></tr>
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
