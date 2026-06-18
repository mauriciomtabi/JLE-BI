/* ============================================================
   cobranca_app.js — Logica Dashboard COBRANCA
   Acompanhamento financeiro de servicos executados - Claro
   v3.40
   ============================================================ */

// Estado Global da Cobrança
let cobrancaDataLoaded = false;
let cobrancaFilteredData = [];
let cobrancaCurrentPage = 1;
const COBRANCA_PAGE_SIZE = 50;
let cobrancaChart = null;
let cobrancaSortCol = 'mes_medicao'; // Ordenação inicial por mês de medição
let cobrancaSortDir = 'desc'; // Direção descendente (mais recente primeiro)
let cobrancaSearchQuery = '';

// Inicialização principal da página Cobrança
function initCobranca() {
    try {
        if (typeof COBRANCA_DATA === 'undefined') {
            console.error('COBRANCA_DATA não carregado.');
            return;
        }
        cobrancaFilteredData = [...COBRANCA_DATA];
        populateCobrancaFilters();
        initCobrancaEventListeners();
        applyCobrancaFilters();
        cobrancaDataLoaded = true;
    } catch (err) {
        console.error("Erro fatal ao inicializar Cobrança:", err);
    }
}

// Configurar ouvintes de eventos para os filtros e campos
function initCobrancaEventListeners() {
    document.getElementById('cobranca-filter-fase')?.addEventListener('change', applyCobrancaFilters);
    document.getElementById('cobranca-filter-mes')?.addEventListener('change', applyCobrancaFilters);
    document.getElementById('cobranca-filter-uf')?.addEventListener('change', applyCobrancaFilters);
    document.getElementById('cobranca-filter-cc')?.addEventListener('change', applyCobrancaFilters);
    document.getElementById('cobranca-filter-contrato')?.addEventListener('change', applyCobrancaFilters);

    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            setTimeout(() => {
                if (cobrancaDataLoaded) {
                    renderCobrancaChart();
                }
            }, 150);
        });
    }
}

// Preencher os filtros dropdown a partir dos dados únicos da base
function populateCobrancaFilters() {
    try {
        const faseSelect = document.getElementById('cobranca-filter-fase');
        const mesSelect = document.getElementById('cobranca-filter-mes');
        const ufSelect = document.getElementById('cobranca-filter-uf');
        const ccSelect = document.getElementById('cobranca-filter-cc');
        const contratoSelect = document.getElementById('cobranca-filter-contrato');

        // Extrair valores únicos e ordenar
        const uniqueFases = [...new Set(COBRANCA_DATA.map(r => r.fase_atual).filter(Boolean))].sort();
        const uniqueMeses = [...new Set(COBRANCA_DATA.map(r => r.mes_medicao).filter(Boolean))].sort().reverse(); // Meses mais recentes primeiro
        const uniqueUFs = [...new Set(COBRANCA_DATA.map(r => r.uf).filter(Boolean))].sort();
        const uniqueCCs = [...new Set(COBRANCA_DATA.map(r => r.centro_de_custo).filter(Boolean))].sort();
        const uniqueContratos = [...new Set(COBRANCA_DATA.map(r => r.contrato_numero).filter(Boolean))].sort();

        if (faseSelect) {
            faseSelect.innerHTML = '<option value="">Todas as Fases</option>';
            uniqueFases.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f;
                faseSelect.appendChild(opt);
            });
        }

        if (mesSelect) {
            mesSelect.innerHTML = '<option value="">Todos os Meses</option>';
            uniqueMeses.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                mesSelect.appendChild(opt);
            });
        }

        if (ufSelect) {
            ufSelect.innerHTML = '<option value="">Todas as UFs</option>';
            uniqueUFs.forEach(uf => {
                const opt = document.createElement('option');
                opt.value = uf;
                opt.textContent = uf;
                ufSelect.appendChild(opt);
            });
        }

        if (ccSelect) {
            ccSelect.innerHTML = '<option value="">Todos os CCs</option>';
            uniqueCCs.forEach(cc => {
                const opt = document.createElement('option');
                opt.value = cc;
                opt.textContent = cc;
                ccSelect.appendChild(opt);
            });
        }

        if (contratoSelect) {
            contratoSelect.innerHTML = '<option value="">Todos os Contratos</option>';
            uniqueContratos.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                contratoSelect.appendChild(opt);
            });
        }
    } catch (err) {
        console.error("Erro ao popular filtros de cobrança:", err);
    }
}

// Filtra a base estática de acordo com a seleção nos dropdowns
function applyCobrancaFilters() {
    try {
        const fase = document.getElementById('cobranca-filter-fase')?.value || '';
        const mes = document.getElementById('cobranca-filter-mes')?.value || '';
        const uf = document.getElementById('cobranca-filter-uf')?.value || '';
        const cc = document.getElementById('cobranca-filter-cc')?.value || '';
        const contrato = document.getElementById('cobranca-filter-contrato')?.value || '';

        cobrancaFilteredData = COBRANCA_DATA.filter(r => {
            if (fase && r.fase_atual !== fase) return false;
            if (mes && r.mes_medicao !== mes) return false;
            if (uf && r.uf !== uf) return false;
            if (cc && r.centro_de_custo !== cc) return false;
            if (contrato && r.contrato_numero !== contrato) return false;
            return true;
        });

        cobrancaCurrentPage = 1;
        updateCobrancaKPIs();
        renderCobrancaChart();
        renderCobrancaTable();
    } catch (err) {
        console.error("Erro ao aplicar filtros de cobrança:", err);
    }
}

// Limpar todos os filtros da tela
function clearCobrancaFilters() {
    ['cobranca-filter-fase', 'cobranca-filter-mes', 'cobranca-filter-uf', 'cobranca-filter-cc', 'cobranca-filter-contrato'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const searchEl = document.getElementById('cobranca-search');
    if (searchEl) searchEl.value = '';
    cobrancaSearchQuery = '';
    applyCobrancaFilters();
}

// Buscar/filtrar dados de digitação
function applyCobrancaSearch() {
    const searchEl = document.getElementById('cobranca-search');
    if (searchEl) {
        cobrancaSearchQuery = searchEl.value;
        cobrancaCurrentPage = 1;
        renderCobrancaTable();
    }
}

// Calcular os KPIs (Total Faturado, OSs, Pedidos SAP e Período)
function updateCobrancaKPIs() {
    try {
        let totalFaturado = 0;
        const osSet = new Set();
        const pedidoSet = new Set();
        const mesSet = new Set();

        cobrancaFilteredData.forEach(r => {
            totalFaturado += (r.valor_total || 0);
            if (r.os) osSet.add(r.os);
            if (r.numero_pedido && r.numero_pedido !== '-' && r.numero_pedido !== 'N/D') {
                pedidoSet.add(r.numero_pedido);
            }
            if (r.mes_medicao) {
                mesSet.add(r.mes_medicao);
            }
        });

        // Formatar valores utilizando os helpers globais (se disponíveis)
        const formatFaturado = typeof formatCurrency === 'function' 
            ? formatCurrency(totalFaturado) 
            : totalFaturado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const osCountStr = osSet.size.toLocaleString('pt-BR');
        const pedidosCountStr = pedidoSet.size.toLocaleString('pt-BR');

        // Cálculo de período mínimo e máximo
        let periodoStr = '-';
        if (mesSet.size > 0) {
            const sortedMeses = Array.from(mesSet).sort();
            const formatMes = m => {
                const parts = m.split('/');
                if (parts.length === 2) {
                    return `${parts[1]}/${parts[0]}`;
                }
                return m;
            };
            if (sortedMeses.length === 1) {
                periodoStr = formatMes(sortedMeses[0]);
            } else {
                periodoStr = `${formatMes(sortedMeses[0])} - ${formatMes(sortedMeses[sortedMeses.length - 1])}`;
            }
        }

        document.getElementById('cobranca-kpi-faturado').textContent = formatFaturado;
        document.getElementById('cobranca-kpi-os').textContent = osCountStr;
        document.getElementById('cobranca-kpi-pedidos').textContent = pedidosCountStr;
        document.getElementById('cobranca-kpi-periodo').textContent = periodoStr;
    } catch (err) {
        console.error("Erro ao calcular KPIs de cobrança:", err);
    }
}

// Renderiza o gráfico de faturamento mensal usando Chart.js
function renderCobrancaChart() {
    const canvas = document.getElementById('cobranca-monthly-chart');
    if (!canvas) return;

    try {
        const groupData = {};
        cobrancaFilteredData.forEach(r => {
            if (r.mes_medicao) {
                groupData[r.mes_medicao] = (groupData[r.mes_medicao] || 0) + (r.valor_total || 0);
            }
        });

        const sortedMonths = Object.keys(groupData).sort();
        const labels = sortedMonths.map(m => {
            const parts = m.split('/');
            if (parts.length === 2) {
                return `${parts[1]}/${parts[0]}`;
            }
            return m;
        });
        const values = sortedMonths.map(m => groupData[m]);

        if (cobrancaChart) {
            cobrancaChart.destroy();
            cobrancaChart = null;
        }

        const th = getCobrancaThemeVars();

        Chart.defaults.color = th.textColor;
        Chart.defaults.font.family = "'Outfit', 'Inter', sans-serif";
        Chart.defaults.font.size = 12;
        Chart.defaults.responsive = true;
        Chart.defaults.maintainAspectRatio = false;

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 260);
        gradient.addColorStop(0, 'rgba(0, 180, 216, 0.85)');
        gradient.addColorStop(1, 'rgba(0, 119, 182, 0.05)');

        cobrancaChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Valor Faturado',
                    data: values,
                    backgroundColor: gradient,
                    borderColor: '#00b4d8',
                    borderWidth: 1.5,
                    borderRadius: 4,
                    hoverBackgroundColor: '#00b4d8',
                    hoverBorderColor: '#ffffff',
                    hoverBorderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: th.tooltipBg,
                        titleColor: th.tooltipText,
                        bodyColor: th.tooltipText,
                        borderColor: th.tooltipBorder,
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: { family: "'Outfit', sans-serif", size: 12, weight: '600' },
                        bodyFont: { family: "'Outfit', sans-serif", size: 12 },
                        callbacks: {
                            label: function(context) {
                                return ` Faturamento: ${typeof formatCurrency === 'function' ? formatCurrency(context.raw) : context.raw.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
                            }
                        }
                    },
                    datalabels: {
                        display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0,
                        align: 'top',
                        anchor: 'end',
                        color: th.textColor,
                        font: { family: 'Outfit', size: 9, weight: 'bold' },
                        formatter: (val) => {
                            const a = Math.abs(val);
                            if (a >= 1000000) return (a/1000000).toFixed(1).replace('.', ',') + 'M';
                            if (a >= 1000) return (a/1000).toFixed(0) + 'k';
                            return a > 0 ? a.toFixed(0) : '';
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'transparent' },
                        ticks: {
                            color: th.textColor,
                            font: { size: 9, family: "'Outfit', sans-serif" }
                        }
                    },
                    y: {
                        grid: { color: th.gridColor },
                        ticks: {
                            color: th.textColor,
                            font: { size: 9, family: "'Outfit', sans-serif" },
                            callback: (val) => {
                                const a = Math.abs(val);
                                if (val === 0) return '0';
                                if (a >= 1000000) return (a/1000000).toFixed(1).replace('.', ',') + 'M';
                                if (a >= 1000) return (a/1000).toFixed(0) + 'k';
                                return a.toString();
                              }
                        },
                        grace: '15%'
                    }
                }
            }
        });
    } catch (err) {
        console.error("Erro ao renderizar gráfico de cobrança:", err);
    }
}

// Obter as variáveis CSS conforme o tema atual (dark/light)
function getCobrancaThemeVars() {
    const isLight = document.body.classList.contains('light-theme');
    return {
        textColor:     isLight ? '#637381' : '#8a99a8',
        gridColor:     isLight ? '#e2e8f0' : '#20313f',
        tooltipBg:     isLight ? '#ffffff' : '#111c24',
        tooltipText:   isLight ? '#1f2c3d' : '#f5f6f8',
        tooltipBorder: isLight ? '#e0e6ed' : '#20313f'
    };
}

// Retorna dados filtrados, ordenados e prontos para renderizar na tabela
function getCobrancaTableFilteredData() {
    let data = [...cobrancaFilteredData];

    if (cobrancaSearchQuery) {
        const q = cobrancaSearchQuery.trim().toUpperCase();
        data = data.filter(r =>
            (r.pep || '').toUpperCase().includes(q) ||
            (r.projeto_gerencial || '').toUpperCase().includes(q) ||
            (r.cidade || '').toUpperCase().includes(q) ||
            (r.os || '').toString().includes(q) ||
            (r.contrato_numero || '').toUpperCase().includes(q) ||
            (r.numero_pedido || '').toUpperCase().includes(q) ||
            (r.fase_atual || '').toUpperCase().includes(q) ||
            (r.fase_atual_de_para || '').toUpperCase().includes(q)
        );
    }

    if (cobrancaSortCol) {
        data.sort((a, b) => {
            let va = a[cobrancaSortCol];
            let vb = b[cobrancaSortCol];

            if (va === null || va === undefined) return cobrancaSortDir === 'asc' ? 1 : -1;
            if (vb === null || vb === undefined) return cobrancaSortDir === 'asc' ? -1 : 1;

            if (typeof va === 'number' && typeof vb === 'number') {
                return cobrancaSortDir === 'asc' ? va - vb : vb - va;
            }

            va = va.toString().toUpperCase();
            vb = vb.toString().toUpperCase();
            return cobrancaSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        });
    }

    return data;
}

// Renderiza o corpo da tabela e paginação
function renderCobrancaTable() {
    const data = getCobrancaTableFilteredData();
    const tbody = document.getElementById('cobranca-table-body');
    if (!tbody) return;

    const totalCount = data.length;
    document.getElementById('cobranca-results-count').textContent = `${totalCount.toLocaleString('pt-BR')} registros encontrados`;

    const totalPages = Math.ceil(totalCount / COBRANCA_PAGE_SIZE);
    if (cobrancaCurrentPage > totalPages && totalPages > 0) cobrancaCurrentPage = totalPages;

    const start = (cobrancaCurrentPage - 1) * COBRANCA_PAGE_SIZE;
    const end = Math.min(start + COBRANCA_PAGE_SIZE, totalCount);

    tbody.innerHTML = '';

    if (totalCount === 0) {
        tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;color:var(--text-secondary);padding:40px 0;">Nenhum registro encontrado.</td></tr>`;
        document.getElementById('cobranca-page-info').textContent = 'Pág. 0 de 0';
        document.getElementById('cobranca-pagination-btns').innerHTML = '';
        return;
    }

    document.getElementById('cobranca-page-info').textContent = `Exibindo ${start + 1}-${end} de ${totalCount} (Pág. ${cobrancaCurrentPage}/${totalPages})`;

    renderCobrancaPagination(totalPages);

    const items = data.slice(start, end);
    items.forEach(r => {
        const tr = document.createElement('tr');
        const badgeClass = getCobrancaBadgeClass(r.fase_atual_de_para);

        const fmtDate = dStr => {
            if (!dStr || dStr === '-') return '-';
            const p = dStr.split('-');
            return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : dStr;
        };

        const formatValor = typeof formatCurrency === 'function' 
            ? formatCurrency(r.valor_total || 0) 
            : (r.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        tr.innerHTML = `
            <td data-label="PEP">${r.pep || '-'}</td>
            <td data-label="Projeto Gerencial" style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.projeto_gerencial || ''}">${r.projeto_gerencial || '-'}</td>
            <td data-label="Contrato">${r.contrato_numero || '-'}</td>
            <td data-label="Cidade">${r.cidade || '-'}</td>
            <td data-label="UF"><span class="badge ${String(r.uf || '').toLowerCase()}">${r.uf || '-'}</span></td>
            <td data-label="OS"><strong>${r.os || '-'}</strong></td>
            <td data-label="Fase Atual">${r.fase_atual || '-'}</td>
            <td data-label="De Para"><span class="cobranca-badge ${badgeClass}">${r.fase_atual_de_para || '-'}</span></td>
            <td data-label="Dt. Cadastro">${fmtDate(r.data_cadastro)}</td>
            <td data-label="Dt. Aprovação">${fmtDate(r.data_aprovacao)}</td>
            <td data-label="Nº Medição">${r.numero_medicao || '-'}</td>
            <td data-label="Nº Pedido">${r.numero_pedido || '-'}</td>
            <td data-label="Mês Medição">${r.mes_medicao || '-'}</td>
            <td data-label="Valor Total" class="cobranca-td-valor">${formatValor}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Renderizar botões de paginação
function renderCobrancaPagination(totalPages) {
    const container = document.getElementById('cobranca-pagination-btns');
    if (!container) return;
    container.innerHTML = '';

    const btnPrev = document.createElement('button');
    btnPrev.className = 'cobranca-page-btn';
    btnPrev.innerHTML = '<i class="fa-solid fa-angle-left"></i>';
    btnPrev.disabled = cobrancaCurrentPage === 1;
    btnPrev.onclick = () => { if (cobrancaCurrentPage > 1) { cobrancaCurrentPage--; renderCobrancaTable(); } };
    container.appendChild(btnPrev);

    const pagesToShow = [];
    if (totalPages <= 5) {
        for (let i = 1; i <= totalPages; i++) pagesToShow.push(i);
    } else {
        pagesToShow.push(1);
        if (cobrancaCurrentPage > 3) pagesToShow.push('...');
        
        const startPage = Math.max(2, cobrancaCurrentPage - 1);
        const endPage = Math.min(totalPages - 1, cobrancaCurrentPage + 1);
        for (let i = startPage; i <= endPage; i++) {
            if (!pagesToShow.includes(i)) pagesToShow.push(i);
        }
        
        if (cobrancaCurrentPage < totalPages - 2) pagesToShow.push('...');
        if (!pagesToShow.includes(totalPages)) pagesToShow.push(totalPages);
    }

    pagesToShow.forEach(p => {
        if (p === '...') {
            const span = document.createElement('span');
            span.textContent = '...';
            span.style.margin = '0 4px';
            span.style.color = 'var(--text-secondary)';
            container.appendChild(span);
        } else {
            const btn = document.createElement('button');
            btn.className = `cobranca-page-btn${cobrancaCurrentPage === p ? ' active' : ''}`;
            btn.textContent = p;
            btn.onclick = () => { cobrancaCurrentPage = p; renderCobrancaTable(); };
            container.appendChild(btn);
        }
    });

    const btnNext = document.createElement('button');
    btnNext.className = 'cobranca-page-btn';
    btnNext.innerHTML = '<i class="fa-solid fa-angle-right"></i>';
    btnNext.disabled = cobrancaCurrentPage === totalPages;
    btnNext.onclick = () => { if (cobrancaCurrentPage < totalPages) { cobrancaCurrentPage++; renderCobrancaTable(); } };
    container.appendChild(btnNext);
}

// Trata a ordenação ao clicar no cabeçalho das colunas da tabela
function sortCobrancaTable(column) {
    if (cobrancaSortCol === column) {
        cobrancaSortDir = cobrancaSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        cobrancaSortCol = column;
        cobrancaSortDir = 'asc';
    }

    document.querySelectorAll('#cobranca-table th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        const onclickAttr = th.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${column}'`)) {
            th.classList.add(cobrancaSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    cobrancaCurrentPage = 1;
    renderCobrancaTable();
}

// Exportar os dados filtrados como arquivo CSV local
function exportCobrancaCSV() {
    try {
        const data = getCobrancaTableFilteredData();
        if (data.length === 0) {
            alert('Nenhum dado para exportar.');
            return;
        }

        const headers = [
            'PEP', 'Projeto Gerencial', 'Contrato', 'Cidade', 'UF', 'OS', 
            'Fase Atual', 'Fase De Para', 'Data Cadastro', 'Data Aprovacao', 
            'Numero Medicao', 'Numero Pedido', 'Mes Medicao', 'Valor Total'
        ];

        const rows = data.map(r => [
            r.pep || '',
            r.projeto_gerencial || '',
            r.contrato_numero || '',
            r.cidade || '',
            r.uf || '',
            r.os || '',
            r.fase_atual || '',
            r.fase_atual_de_para || '',
            r.data_cadastro || '',
            r.data_aprovacao || '',
            r.numero_medicao || '',
            r.numero_pedido || '',
            r.mes_medicao || '',
            r.valor_total || 0
        ]);

        const csvContent = "\uFEFF" + [
            headers.join(';'),
            ...rows.map(e => e.map(val => {
                if (typeof val === 'string') {
                    let cleanVal = val.replace(/"/g, '""');
                    if (cleanVal.includes(';') || cleanVal.includes('\n') || cleanVal.includes('\r')) {
                        cleanVal = `"${cleanVal}"`;
                    }
                    return cleanVal;
                }
                return val;
            }).join(';'))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `RELATORIO_COBRANCA_${new Date().toISOString().substring(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error("Erro ao exportar CSV:", err);
    }
}

// Obter classe badge adequada conforme a fase de-para mapeada
function getCobrancaBadgeClass(fase) {
    if (!fase) return 'badge-default';
    const f = fase.toUpperCase().trim();
    if (f.includes('PEDIDO EMITIDO')) return 'ped-emitido';
    if (f.includes('FINALIZADO')) return 'finalizado';
    if (f.includes('APROVADO')) return 'aprovado';
    if (f.includes('CANCELADO')) return 'cancelado';
    return 'badge-default';
}

// Registrar funções no escopo global (window) para acesso pelos botões e inputs HTML
window.initCobranca = initCobranca;
window.applyCobrancaFilters = applyCobrancaFilters;
window.clearCobrancaFilters = clearCobrancaFilters;
window.sortCobrancaTable = sortCobrancaTable;
window.exportCobrancaCSV = exportCobrancaCSV;
window.applyCobrancaSearch = applyCobrancaSearch;
