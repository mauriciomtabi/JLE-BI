// JLE Office Layout Manager - Lógica Principal

// --- CONFIGURAÇÃO E INICIALIZAÇÃO SUPABASE ---
const SUPABASE_URL = "https://fowlctvebdcodphntsjw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvd2xjdHZlYmRjb2RwaG50c2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzg2NjUsImV4cCI6MjA5NTY1NDY2NX0.PxzD_PlU4sBFPBukthuXpkBlzYbQqMLXLE4DQwctPOM";

let supabase = null;
try {
    if (typeof window.supabase !== 'undefined') {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch (e) {
    console.error("Falha ao inicializar Supabase:", e);
}

// --- DADOS PADRÃO DE SEED (FALLBACK SE NÃO HOUVER CONEXÃO) ---
const DEFAULT_SECTORS = [
    { id: 1, name: "Diretoria", color: "#e74c3c" },
    { id: 2, name: "Suporte Técnico", color: "#3498db" },
    { id: 3, name: "TI", color: "#2ecc71" },
    { id: 4, name: "Comercial", color: "#f1c40f" },
    { id: 5, name: "Financeiro", color: "#9b59b6" },
    { id: 6, name: "Administrativo", color: "#1abc9c" },
    { id: 7, name: "Operações", color: "#e67e22" },
    { id: 8, name: "Recursos Humanos (RH)", color: "#e84393" }
];

const DEFAULT_EMPLOYEES = [
    { id: "emp-1", name: "Guilherme Santos", sectorId: 3, shift: "Integral", hours: "44h", activities: "Administração de redes, servidores e segurança de TI.", deskId: "desk-3", equipments: [
        { tipo: "Computador", patrimonio: "PAT-2026-0045", detalhes: "Notebook Dell Vostro i7 16GB" },
        { tipo: "Monitor", patrimonio: "PAT-2026-0091", detalhes: "Monitor Dell 24\" IPS" }
    ]},
    { id: "emp-2", name: "Mariana Souza", sectorId: 5, shift: "Integral", hours: "44h", activities: "Conciliação bancária, faturamento, contas a pagar e receber.", deskId: "desk-15", equipments: [
        { tipo: "Computador", patrimonio: "PAT-2026-0032", detalhes: "Desktop Lenovo ThinkCentre i5" },
        { tipo: "Monitor", patrimonio: "PAT-2026-0102", detalhes: "Monitor Samsung 22\"" }
    ]},
    { id: "emp-3", name: "Carlos Oliveira", sectorId: 2, shift: "Tarde", hours: "40h", activities: "Atendimento técnico N1 e N2 a clientes corporativos.", deskId: "desk-7", equipments: [
        { tipo: "Computador", patrimonio: "PAT-2026-0056", detalhes: "Desktop HP EliteDesk" },
        { tipo: "Headset", patrimonio: "PAT-2026-0231", detalhes: "Headset Intelbras USB com cancelamento ruído" }
    ]},
    { id: "emp-4", name: "Ana Clara Lima", sectorId: 8, shift: "Integral", hours: "44h", activities: "Recrutamento, seleção, controle de folha e ponto eletrônico.", deskId: "desk-22", equipments: [
        { tipo: "Computador", patrimonio: "PAT-2026-0112", detalhes: "Notebook Dell Vostro i5" }
    ]},
    { id: "emp-5", name: "Felipe Ramos", sectorId: 4, shift: "Integral", hours: "44h", activities: "Vendas corporativas de links dedicados e novos negócios.", deskId: "desk-25", equipments: [
        { tipo: "Computador", patrimonio: "PAT-2026-0089", detalhes: "Notebook Lenovo ThinkPad" }
    ]},
    { id: "emp-6", name: "Beatriz Costa", sectorId: 6, shift: "Integral", hours: "44h", activities: "Contratos de facilities, compras administrativas e recepção.", deskId: "desk-30", equipments: [
        { tipo: "Computador", patrimonio: "PAT-2026-0010", detalhes: "Desktop HP ProDesk" }
    ]},
    { id: "emp-7", name: "Thiago Silva", sectorId: 3, shift: "Integral", hours: "44h", activities: "Desenvolvimento de sistemas internos e automações BI.", deskId: "desk-4", equipments: [
        { tipo: "Computador", patrimonio: "PAT-2026-0012", detalhes: "Notebook Acer Nitro Ryzen 7" }
    ]},
    { id: "emp-8", name: "Júlia Mendes", sectorId: 2, shift: "Manhã", hours: "30h", activities: "Suporte N1 ao cliente JLE Telecom.", deskId: "desk-8", equipments: [
        { tipo: "Computador", patrimonio: "PAT-2026-0105", detalhes: "Desktop Lenovo ThinkCentre" }
    ]},
    { id: "emp-9", name: "Mateus Alencar", sectorId: 4, shift: "Integral", hours: "44h", activities: "Prospecção ativa B2B e vendas de telefonia corporativa.", deskId: "desk-26", equipments: [
        { tipo: "Computador", patrimonio: "PAT-2026-0041", detalhes: "Notebook Lenovo" }
    ]},
    { id: "emp-10", name: "Renata Vasconcellos", sectorId: 1, shift: "Integral", hours: "44h", activities: "Diretora de Operações e Administração da JLE.", deskId: "desk-32", equipments: [
        { tipo: "Computador", patrimonio: "PAT-2026-0001", detalhes: "MacBook Air M2 16GB" }
    ]},
    // Sem mesa (Roster)
    { id: "emp-11", name: "Douglas Lima", sectorId: 3, shift: "Integral", hours: "44h", activities: "Suporte interno de infraestrutura e helpdesk.", deskId: null, equipments: [] },
    { id: "emp-12", name: "Larissa Antunes", sectorId: 4, shift: "Integral", hours: "44h", activities: "Pós-vendas e relacionamento pós-contratação.", deskId: null, equipments: [] },
    { id: "emp-13", name: "Pedro Henrique", sectorId: 2, shift: "Noite", hours: "40h", activities: "Suporte noturno a MDU e links dedicados corporativos.", deskId: null, equipments: [] },
    { id: "emp-14", name: "Sofia Andrade", sectorId: 5, shift: "Integral", hours: "44h", activities: "Escrituração contábil, conciliação e relatórios fiscais.", deskId: null, equipments: [] }
];

const DEFAULT_DESKS = [
    // Top-left room (TI / Suporte)
    { id: "desk-1", x: 95, y: 70, rotation: 90, sectorId: 3 },
    { id: "desk-2", x: 95, y: 165, rotation: 90, sectorId: 3 },
    { id: "desk-3", x: 215, y: 100, rotation: 0, sectorId: 3 },
    { id: "desk-4", x: 280, y: 100, rotation: 0, sectorId: 3 },
    { id: "desk-5", x: 345, y: 100, rotation: 0, sectorId: 3 },
    
    // Top-middle hallway row (facing north wall)
    { id: "desk-6", x: 470, y: 245, rotation: 0, sectorId: 2 },
    { id: "desk-7", x: 585, y: 245, rotation: 0, sectorId: 2 },
    { id: "desk-8", x: 700, y: 245, rotation: 0, sectorId: 2 },
    { id: "desk-9", x: 815, y: 245, rotation: 0, sectorId: 2 },
    
    // Middle column 1 (vertical row, facing left)
    { id: "desk-10", x: 180, y: 300, rotation: 90, sectorId: 7 },
    { id: "desk-11", x: 180, y: 400, rotation: 90, sectorId: 7 },
    { id: "desk-12", x: 180, y: 500, rotation: 90, sectorId: 7 },
    { id: "desk-13", x: 180, y: 600, rotation: 90, sectorId: 7 },
    
    // Middle column 2 (vertical row, facing right)
    { id: "desk-14", x: 350, y: 260, rotation: 180, sectorId: 6 },
    { id: "desk-15", x: 350, y: 390, rotation: 180, sectorId: 6 },
    { id: "desk-16", x: 350, y: 470, rotation: 180, sectorId: 6 },
    { id: "desk-17", x: 350, y: 590, rotation: 180, sectorId: 6 },
    
    // Middle column 3 (vertical row, facing left)
    { id: "desk-18", x: 480, y: 450, rotation: 90, sectorId: 5 },
    { id: "desk-19", x: 480, y: 550, rotation: 90, sectorId: 5 },
    { id: "desk-20", x: 480, y: 650, rotation: 90, sectorId: 5 },
    { id: "desk-21", x: 480, y: 750, rotation: 90, sectorId: 5 },
    
    // Right large open room
    { id: "desk-22", x: 730, y: 390, rotation: 0, sectorId: 8 },
    { id: "desk-23", x: 805, y: 390, rotation: 0, sectorId: 8 },
    { id: "desk-24", x: 880, y: 390, rotation: 0, sectorId: 8 },
    
    { id: "desk-25", x: 735, y: 490, rotation: 90, sectorId: 4 },
    { id: "desk-26", x: 875, y: 490, rotation: 270, sectorId: 4 },
    
    { id: "desk-27", x: 730, y: 590, rotation: 180, sectorId: 4 },
    { id: "desk-28", x: 805, y: 590, rotation: 180, sectorId: 4 },
    { id: "desk-29", x: 880, y: 590, rotation: 180, sectorId: 4 },
    
    { id: "desk-30", x: 740, y: 700, rotation: 90, sectorId: 6 },
    { id: "desk-31", x: 865, y: 700, rotation: 90, sectorId: 6 },
    
    // Bottom-right room (Diretoria)
    { id: "desk-32", x: 840, y: 800, rotation: 180, sectorId: 1 },
    
    // Bottom-left room
    { id: "desk-33", x: 350, y: 730, rotation: 0, sectorId: 6 }
];

// --- ESTADO GLOBAL DA APLICAÇÃO ---
let state = {
    layoutId: 'default',
    layoutName: 'Layout Padrão (Local)',
    sectors: [...DEFAULT_SECTORS],
    desks: [...DEFAULT_DESKS],
    employees: [...DEFAULT_EMPLOYEES],
    isDesignerMode: false,
    selectedDeskId: null,
    activeFilters: {
        sector: 'all',
        shift: 'all',
        equipment: 'all',
        search: ''
    }
};

// --- CONFIGURAÇÃO DE TRANSLATE & ZOOM DO CANVAS ---
let zoomState = {
    x: 0,
    y: 0,
    scale: 0.95,
    isDragging: false,
    startX: 0,
    startY: 0
};

// --- ELEMENTOS DO DOM ---
const svg = document.getElementById('office-svg');
const panZoomGroup = document.getElementById('pan-zoom-group');
const rosterList = document.getElementById('roster-list');
const layoutSelector = document.getElementById('layout-selector');
const designerToolbar = document.getElementById('designer-toolbar');
const slideOver = document.getElementById('slide-over');
const slideBody = document.getElementById('slide-body');
const canvasLegend = document.getElementById('canvas-legend');
const rosterSearchInput = document.getElementById('roster-search');

// Modais
const modalEmployee = document.getElementById('modal-employee');
const modalSectors = document.getElementById('modal-sectors');
const modalLayout = document.getElementById('modal-layout');

// --- INICIALIZAÇÃO SEGURA DA APLICAÇÃO ---
async function iniciarAplicacao() {
    inicializarParedesEstaticas();
    configurarEventosPanZoom();
    configurarDragAndDrop();
    configurarEventosInterface();
    
    // Tenta carregar os layouts do Supabase
    await carregarLayoutsDoSupabase();
    
    // Inicializa a renderização
    renderApp();
    showToast("Layout carregado com sucesso!", "success");
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', iniciarAplicacao);
} else {
    iniciarAplicacao();
}

// --- RENDERIZAÇÃO PRINCIPAL ---
function renderApp() {
    renderKPIs();
    renderFiltrosDropdowns();
    renderRosterList();
    renderDesks();
    renderSectorsBackground();
    renderLegend();
    renderActiveLayoutInfo();
    atualizarControleDesignToolbar();
}

// --- DESENHO DA PLANTA BAIXA ESTÁTICA (Walls & Layout) ---
function inicializarParedesEstaticas() {
    const wallsGroup = document.getElementById('svg-walls-static');
    wallsGroup.innerHTML = ''; // Limpa antes

    // DEFINIÇÕES DAS PAREDES DO ESCRITÓRIO (Baseado em input_file_0.png)
    // Coordenadas aproximadas para recriar fielmente a estrutura física
    
    // 1. Paredes Externas (Contorno Principal)
    const outerWalls = [
        // Top-left wing
        { x1: 80, y1: 200, x2: 80, y2: 50 },
        { x1: 80, y1: 50, x2: 430, y2: 50 },
        { x1: 430, y1: 50, x2: 430, y2: 200 },
        // Main block top
        { x1: 430, y1: 200, x2: 900, y2: 200 },
        // Right vertical boundary
        { x1: 900, y1: 200, x2: 900, y2: 880 },
        // Bottom boundary (Diretoria / Copa)
        { x1: 900, y1: 880, x2: 430, y2: 880 },
        { x1: 430, y1: 880, x2: 430, y2: 730 },
        { x1: 430, y1: 730, x2: 75, y2: 730 },
        { x1: 75, y1: 730, x2: 75, y2: 250 } // Entry boundary (dashed on drawing)
    ];

    // 2. Paredes Internas (Divisórias)
    const partitionWalls = [
        // Top-left vertical separation (desk 1/2 from desk 3/4)
        { x1: 135, y1: 50, x2: 135, y2: 200 },
        { x1: 200, y1: 50, x2: 200, y2: 150 },
        { x1: 260, y1: 50, x2: 260, y2: 150 },
        { x1: 320, y1: 50, x2: 320, y2: 150 },
        { x1: 200, y1: 150, x2: 430, y2: 150 },

        // Hallway boundaries
        { x1: 310, y1: 200, x2: 310, y2: 300 },
        { x1: 310, y1: 300, x2: 430, y2: 300 },

        // Restroom structures (bottom-middle)
        { x1: 430, y1: 630, x2: 550, y2: 630 },
        { x1: 430, y1: 680, x2: 550, y2: 680 },
        { x1: 430, y1: 730, x2: 550, y2: 730 },
        { x1: 550, y1: 630, x2: 550, y2: 730 }, // Restroom right wall

        // Partition between middle columns and right open area
        { x1: 660, y1: 350, x2: 660, y2: 730 },
        { x1: 660, y1: 350, x2: 900, y2: 350 },
        { x1: 660, y1: 450, x2: 900, y2: 450 },
        { x1: 660, y1: 550, x2: 900, y2: 550 },
        { x1: 660, y1: 650, x2: 900, y2: 650 },
        { x1: 660, y1: 730, x2: 900, y2: 730 },

        // Directors room bottom right (Diretoria)
        { x1: 660, y1: 730, x2: 660, y2: 880 }
    ];

    // 3. Portas e Janelas (Desenho representativo)
    const doors = [
        { x1: 135, y1: 160, x2: 175, y2: 200 }, // Porta sala TI
        { x1: 430, y1: 210, x2: 460, y2: 200 }, // Porta principal
        { x1: 500, y1: 730, x2: 530, y2: 730 }, // Porta banheiro 1
        { x1: 500, y1: 680, x2: 530, y2: 680 }  // Porta banheiro 2
    ];

    // Renderizar Paredes Externas (Grossas)
    outerWalls.forEach(w => {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", w.x1);
        line.setAttribute("y1", w.y1);
        line.setAttribute("x2", w.x2);
        line.setAttribute("y2", w.y2);
        line.setAttribute("class", "svg-wall");
        line.style.strokeWidth = "5px";
        wallsGroup.appendChild(line);
    });

    // Renderizar Divisórias (Mais finas)
    partitionWalls.forEach(w => {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", w.x1);
        line.setAttribute("y1", w.y1);
        line.setAttribute("x2", w.x2);
        line.setAttribute("y2", w.y2);
        line.setAttribute("class", "svg-wall");
        line.style.stroke = "#2b3d52";
        line.style.strokeWidth = "2.5px";
        wallsGroup.appendChild(line);
    });

    // Renderizar Portas (Laranja JLE)
    doors.forEach(d => {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", d.x1);
        line.setAttribute("y1", d.y1);
        line.setAttribute("x2", d.x2);
        line.setAttribute("y2", d.y2);
        line.setAttribute("class", "svg-door");
        wallsGroup.appendChild(line);
    });

    // Renderizar Decorações (Sanitários com base na imagem)
    const restroomFixtures = [
        { cx: 490, cy: 655 },
        { cx: 490, cy: 705 }
    ];
    
    restroomFixtures.forEach(fix => {
        // Vaso sanitário simplificado
        const toiletOval = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
        toiletOval.setAttribute("cx", fix.cx);
        toiletOval.setAttribute("cy", fix.cy);
        toiletOval.setAttribute("rx", 10);
        toiletOval.setAttribute("ry", 13);
        toiletOval.setAttribute("class", "svg-toilet");
        wallsGroup.appendChild(toiletOval);

        const tank = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        tank.setAttribute("x", fix.cx - 14);
        tank.setAttribute("y", fix.cy - 12);
        tank.setAttribute("width", 6);
        tank.setAttribute("height", 24);
        tank.setAttribute("rx", 2);
        tank.setAttribute("class", "svg-toilet");
        wallsGroup.appendChild(tank);
    });

    // Renderizar Blocos Cinza (Copa e Mesas Grandes)
    const grayBlocks = [
        { x: 440, y: 800, w: 180, h: 65, label: "Área de Café / Copa" },
        { x: 740, y: 810, w: 120, h: 50, label: "Mesa de Reuniões" }
    ];

    grayBlocks.forEach(block => {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", block.x);
        rect.setAttribute("y", block.y);
        rect.setAttribute("width", block.w);
        rect.setAttribute("height", block.h);
        rect.setAttribute("fill", "#1b2936");
        rect.setAttribute("stroke", "#3b5066");
        rect.setAttribute("stroke-width", "1");
        rect.setAttribute("rx", "6");
        wallsGroup.appendChild(rect);

        // Texto explicativo
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", block.x + block.w / 2);
        text.setAttribute("y", block.y + block.h / 2 + 4);
        text.setAttribute("fill", "#637a91");
        text.setAttribute("font-size", "10px");
        text.setAttribute("font-weight", "600");
        text.setAttribute("text-anchor", "middle");
        text.textContent = block.label;
        wallsGroup.appendChild(text);
    });

    // Rótulos de Áreas Administrativas
    const areaLabels = [
        { x: 280, y: 190, text: "TI / SUPORTE" },
        { x: 260, y: 350, text: "OPERACIONAL" },
        { x: 500, y: 380, text: "FINANCEIRO" },
        { x: 780, y: 330, text: "RECURSOS HUMANOS" },
        { x: 780, y: 630, text: "COMERCIAL / VENDAS" },
        { x: 780, y: 770, text: "DIRETORIA" }
    ];

    areaLabels.forEach(label => {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", label.x);
        text.setAttribute("y", label.y);
        text.setAttribute("class", "svg-area-label");
        text.textContent = label.text;
        wallsGroup.appendChild(text);
    });
}

// --- RENDERIZAÇÃO DOS FUNDOS COLORIDOS DOS SETORES ---
function renderSectorsBackground() {
    const sectorsBgGroup = document.getElementById('svg-sectors-background');
    sectorsBgGroup.innerHTML = '';

    // Define zonas geográficas aproximadas para colorir sutilmente os setores no mapa
    const zones = [
        { sectorId: 3, x: 80, y: 50, w: 350, h: 150 },   // TI
        { sectorId: 8, x: 660, y: 350, w: 240, h: 100 },  // RH
        { sectorId: 4, x: 660, y: 450, w: 240, h: 200 },  // Comercial
        { sectorId: 1, x: 660, y: 730, w: 240, h: 150 }   // Diretoria
    ];

    zones.forEach(zone => {
        const sector = state.sectors.find(s => s.id === zone.sectorId);
        if (!sector) return;

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", zone.x);
        rect.setAttribute("y", zone.y);
        rect.setAttribute("width", zone.w);
        rect.setAttribute("height", zone.h);
        rect.setAttribute("fill", sector.color);
        rect.setAttribute("stroke", sector.color);
        rect.setAttribute("class", "sector-zone");
        sectorsBgGroup.appendChild(rect);
    });
}

// --- RENDERIZAÇÃO DAS MESAS (DYNAMIC DESKS) ---
function renderDesks() {
    const desksGroup = document.getElementById('svg-desks-dynamic');
    desksGroup.innerHTML = '';

    state.desks.forEach(desk => {
        const employee = state.employees.find(emp => emp.deskId === desk.id);
        const sector = state.sectors.find(s => s.id === desk.sectorId);
        const sectorColor = sector ? sector.color : "#334759";

        // Verifica se a mesa passa pelos filtros ativos
        let passesFilter = true;
        if (state.activeFilters.sector !== 'all' && desk.sectorId != state.activeFilters.sector) {
            passesFilter = false;
        }
        if (state.activeFilters.shift !== 'all') {
            if (!employee || employee.shift !== state.activeFilters.shift) {
                passesFilter = false;
            }
        }
        if (state.activeFilters.equipment !== 'all') {
            if (!employee || !employee.equipments.some(eq => eq.tipo === state.activeFilters.equipment)) {
                passesFilter = false;
            }
        }
        if (state.activeFilters.search) {
            const term = state.activeFilters.search.toLowerCase();
            if (!employee || !employee.name.toLowerCase().includes(term)) {
                passesFilter = false;
            }
        }

        // Criar elemento de grupo para a mesa
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("id", desk.id);
        
        let classes = "desk-group";
        if (employee) classes += " occupied";
        if (desk.id === state.selectedDeskId) classes += " selected";
        if (state.activeFilters.sector !== 'all' || state.activeFilters.shift !== 'all' || state.activeFilters.equipment !== 'all' || state.activeFilters.search) {
            if (passesFilter) {
                classes += " highlighted";
            } else {
                classes += " dimmed";
            }
        }
        g.setAttribute("class", classes);

        // Aplica Rotação e Posicionamento através da tag de transformação do SVG
        g.setAttribute("transform", `translate(${desk.x}, ${desk.y}) rotate(${desk.rotation})`);

        // Desenhar Retângulo da Mesa (Proporções da mesa: 50x34)
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", -25);
        rect.setAttribute("y", -17);
        rect.setAttribute("width", 50);
        rect.setAttribute("height", 34);
        rect.setAttribute("class", "desk-rect");
        // Borda brilha na cor do setor
        rect.style.stroke = sectorColor;
        g.appendChild(rect);

        // Desenhar a Cadeira
        const chair = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        chair.setAttribute("x", -12);
        chair.setAttribute("y", 20); // Posicionada abaixo da mesa
        chair.setAttribute("width", 24);
        chair.setAttribute("height", 10);
        chair.setAttribute("class", "desk-chair");
        g.appendChild(chair);

        // Desenhar Computador (Tela e base)
        const monitor = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        monitor.setAttribute("x", -15);
        monitor.setAttribute("y", -10);
        monitor.setAttribute("width", 30);
        monitor.setAttribute("height", 4);
        monitor.setAttribute("class", "desk-pc");
        g.appendChild(monitor);

        const monitorStand = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        monitorStand.setAttribute("x", -4);
        monitorStand.setAttribute("y", -6);
        monitorStand.setAttribute("width", 8);
        monitorStand.setAttribute("height", 4);
        monitorStand.setAttribute("class", "desk-pc");
        g.appendChild(monitorStand);

        // Bolinha de status da mesa (ocupada = verde, livre = azul/vazia)
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", -20);
        dot.setAttribute("cy", -12);
        dot.setAttribute("r", 3.5);
        dot.setAttribute("fill", employee ? "#2ecc71" : "#576575");
        g.appendChild(dot);

        // Rótulo da mesa: Se ocupada mostra nome, se vazia mostra ID ou "LIVRE"
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", 0);
        text.setAttribute("y", 8);
        
        if (employee) {
            text.setAttribute("class", "desk-text desk-text-occupied");
            // Abrevia o nome se for muito longo
            const names = employee.name.split(' ');
            const shortName = names[0] + (names.length > 1 ? ' ' + names[names.length - 1][0] + '.' : '');
            text.textContent = shortName;
        } else {
            text.setAttribute("class", "desk-text");
            text.textContent = "LIVRE";
            text.style.fill = "#4e6173";
        }
        g.appendChild(text);

        // --- EVENTOS INTERATIVOS DA MESA ---
        
        // Clique para selecionar a mesa e ver detalhes
        g.addEventListener('click', (e) => {
            e.stopPropagation();
            selecionarMesa(desk.id);
        });

        // Eventos de Drag over / Drop de funcionários
        g.addEventListener('dragover', (e) => {
            if (!state.isDesignerMode) {
                e.preventDefault();
            }
        });

        g.addEventListener('dragenter', () => {
            if (!state.isDesignerMode) {
                g.classList.add('drag-over');
            }
        });

        g.addEventListener('dragleave', () => {
            if (!state.isDesignerMode) {
                g.classList.remove('drag-over');
            }
        });

        g.addEventListener('drop', (e) => {
            if (!state.isDesignerMode) {
                e.preventDefault();
                g.classList.remove('drag-over');
                const employeeId = e.dataTransfer.getData('text/plain');
                alocarFuncionarioNaMesa(employeeId, desk.id);
            }
        });

        // Eventos de Arrastar mesa (somente no Modo Designer)
        if (state.isDesignerMode) {
            g.addEventListener('mousedown', (e) => {
                if (e.button === 0) { // Botão esquerdo
                    e.stopPropagation();
                    selecionarMesa(desk.id);
                    iniciarArrastarMesa(e, desk.id);
                }
            });
        }

        desksGroup.appendChild(g);
    });
}

// --- CONTROLE DE SELEÇÃO E VISUALIZAÇÃO DE DETALHES ---
function selecionarMesa(deskId) {
    state.selectedDeskId = deskId;
    renderDesks(); // Atualiza contorno de seleção no mapa

    if (!deskId) {
        slideOver.classList.remove('open');
        return;
    }

    const desk = state.desks.find(d => d.id === deskId);
    if (!desk) return;

    const employee = state.employees.find(emp => emp.deskId === deskId);
    const sector = state.sectors.find(s => s.id === desk.sectorId);

    slideBody.innerHTML = '';
    
    // Altera o título do slide
    document.getElementById('slide-title').textContent = `Mesa: ${desk.id}`;

    // Construção HTML para o painel lateral
    let html = `
        <div class="detail-section">
            <div class="detail-section-title">Informações Técnicas da Mesa</div>
            <div class="detail-row">
                <span class="detail-label">Setor Associado:</span>
                <span class="detail-value" style="color: ${sector ? sector.color : 'inherit'}">${sector ? sector.name : 'Nenhum'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Posição X:</span>
                <span class="detail-value">${Math.round(desk.x)}px</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Posição Y:</span>
                <span class="detail-value">${Math.round(desk.y)}px</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Rotação Atual:</span>
                <span class="detail-value">${desk.rotation}°</span>
            </div>
        </div>
    `;

    if (employee) {
        const initials = employee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        html += `
            <div class="detail-section">
                <div class="detail-section-title">Funcionário Alocado</div>
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 12px;">
                    <div class="avatar-circle" style="width: 50px; height: 50px; font-size: 18px; background-color: ${sector ? sector.color : 'var(--color-primary)'}">
                        ${initials}
                    </div>
                    <div>
                        <div style="font-weight: 700; font-size: 15px;">${employee.name}</div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${employee.hours} | Turno ${employee.shift}</div>
                    </div>
                </div>
                
                <div class="detail-row">
                    <span class="detail-label">Atividades:</span>
                </div>
                <div style="font-size: 12px; line-height: 1.4; color: var(--text-secondary); background-color: var(--bg-input); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color)">
                    ${employee.activities || 'Nenhuma atividade cadastrada.'}
                </div>

                <div style="margin-top: 15px; display: flex; gap: 8px;">
                    <button class="btn-sidebar-action" onclick="desalocarFuncionario('${employee.id}')" style="background-color: var(--color-danger-bg); border-color: rgba(231, 76, 60, 0.3); color: var(--color-danger);">
                        <i class="fa-solid fa-user-minus"></i> Remover da Mesa
                    </button>
                    <button class="btn-sidebar-action" onclick="abrirEditarFuncionarioModal('${employee.id}')">
                        <i class="fa-solid fa-user-pen"></i> Editar Perfil
                    </button>
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">Equipamentos e Patrimônio (${employee.equipments ? employee.equipments.length : 0})</div>
                <div class="equipment-list">
        `;

        if (employee.equipments && employee.equipments.length > 0) {
            employee.equipments.forEach((eq, index) => {
                html += `
                    <div class="equipment-item">
                        <div class="equipment-item-info">
                            <span class="equipment-name">${eq.tipo}: ${eq.detalhes}</span>
                            <span class="equipment-patrimony"><i class="fa-solid fa-barcode"></i> ${eq.patrimonio}</span>
                        </div>
                        <button class="btn-delete-equipment" onclick="removerEquipamento('${employee.id}', ${index})" title="Remover Equipamento">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                `;
            });
        } else {
            html += `<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 10px;">Nenhum equipamento vinculado a esta pessoa.</div>`;
        }

        html += `
                </div>
                
                <!-- Formulário rápido para adicionar equipamento -->
                <div class="detail-section-title" style="margin-top: 15px; border-bottom: none; font-size: 10px;">Vincular Novo Equipamento</div>
                <form class="form-add-equipment" id="form-add-eq" onsubmit="adicionarEquipamento(event, '${employee.id}')">
                    <select id="eq-type" required>
                        <option value="Computador">Computador</option>
                        <option value="Monitor">Monitor</option>
                        <option value="Headset">Headset</option>
                        <option value="Telefone IP">Telefone IP</option>
                        <option value="Outro">Outro...</option>
                    </select>
                    <input type="text" id="eq-patrimony" placeholder="Patrimônio (Ex: PAT-010)" required>
                    <input type="text" id="eq-details" placeholder="Modelo/Marca (Ex: Dell Vostro)" style="grid-column: span 2;" required>
                    <button type="submit">Adicionar Equipamento</button>
                </form>
            </div>
        `;
    } else {
        html += `
            <div class="detail-section" style="text-align: center; padding: 30px 10px;">
                <i class="fa-solid fa-chair" style="font-size: 40px; color: var(--text-muted); opacity: 0.3; margin-bottom: 15px;"></i>
                <div style="font-weight: 700; font-size: 14px; margin-bottom: 5px;">Mesa Disponível</div>
                <p style="font-size: 12px; color: var(--text-secondary); max-width: 200px; margin: 0 auto 15px auto;">
                    Esta posição está vazia no momento.
                </p>
                <div style="font-size: 11px; color: var(--text-secondary); font-style: italic; background-color: var(--bg-hover); padding: 8px; border-radius: 6px; border: 1px dashed var(--border-color)">
                    Arraste um funcionário da lista lateral (roster) e solte-o aqui para alocá-lo.
                </div>
            </div>
        `;
    }

    // Se estiver em modo designer, adiciona seletor de setor da mesa
    if (state.isDesignerMode) {
        html += `
            <div class="detail-section" style="margin-top: 15px;">
                <div class="detail-section-title">Design da Mesa</div>
                <div class="form-group">
                    <label>Setor da Posição</label>
                    <select onchange="alterarSetorDaMesa('${deskId}', this.value)" style="background-color: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-primary); padding: 8px; border-radius: 6px; font-size: 13px; outline: none; width: 100%;">
                        ${state.sectors.map(s => `<option value="${s.id}" ${s.id === desk.sectorId ? 'selected' : ''}>${s.name}</option>`).join('')}
                    </select>
                </div>
            </div>
        `;
    }

    slideBody.innerHTML = html;
    slideOver.classList.add('open');
}

// --- PROCESSAMENTO DE DRAG & DROP DE PESSOAS ---
function configurarDragAndDrop() {
    // Escuta eventos de drop no Roster (lista de pessoas sem mesa) para tirar o funcionário da mesa
    rosterList.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    rosterList.addEventListener('drop', (e) => {
        e.preventDefault();
        const employeeId = e.dataTransfer.getData('text/plain');
        const employee = state.employees.find(emp => emp.id === employeeId);
        
        if (employee && employee.deskId !== null) {
            desalocarFuncionario(employeeId);
        }
    });
}

function alocarFuncionarioNaMesa(employeeId, deskId) {
    const employee = state.employees.find(emp => emp.id === employeeId);
    if (!employee) return;

    // Se a mesa já possui alguém, envia a pessoa de volta pro roster
    const occupier = state.employees.find(emp => emp.deskId === deskId);
    if (occupier) {
        occupier.deskId = null;
        showToast(`${occupier.name} retornou ao roster.`, "info");
    }

    // Se o funcionário já estava em outra mesa, limpa a mesa anterior dele
    if (employee.deskId) {
        const oldDeskId = employee.deskId;
        employee.deskId = null;
    }

    employee.deskId = deskId;
    
    // Atualiza a seleção e renderiza
    selecionarMesa(deskId);
    renderApp();
    showToast(`${employee.name} alocado na mesa ${deskId}!`, "success");
    salvarLayoutNoLocalStorage();
}

// Global scope para os botões do slideover
window.desalocarFuncionario = function(employeeId) {
    const employee = state.employees.find(emp => emp.id === employeeId);
    if (!employee) return;

    const deskId = employee.deskId;
    employee.deskId = null;

    if (state.selectedDeskId === deskId) {
        selecionarMesa(deskId);
    }
    renderApp();
    showToast(`${employee.name} removido da mesa e enviado ao Roster.`, "info");
    salvarLayoutNoLocalStorage();
};

// --- LOGICA DE EQUIPAMENTOS POR FUNCIONÁRIO ---
window.adicionarEquipamento = function(e, employeeId) {
    e.preventDefault();
    const employee = state.employees.find(emp => emp.id === employeeId);
    if (!employee) return;

    const tipo = document.getElementById('eq-type').value;
    const patrimonio = document.getElementById('eq-patrimony').value.trim().toUpperCase();
    const detalhes = document.getElementById('eq-details').value.trim();

    if (!patrimonio || !detalhes) return;

    if (!employee.equipments) {
        employee.equipments = [];
    }

    employee.equipments.push({ tipo, patrimonio, detalhes });
    
    selecionarMesa(employee.deskId);
    renderApp();
    showToast("Equipamento vinculado com sucesso!", "success");
    salvarLayoutNoLocalStorage();
};

window.removerEquipamento = function(employeeId, index) {
    const employee = state.employees.find(emp => emp.id === employeeId);
    if (!employee || !employee.equipments) return;

    employee.equipments.splice(index, 1);
    
    selecionarMesa(employee.deskId);
    renderApp();
    showToast("Equipamento removido do cadastro.", "info");
    salvarLayoutNoLocalStorage();
};

// --- EVENTOS DO MODO DESIGNER (EDICAO DE COORDENADAS) ---
let dragDeskState = {
    deskId: null,
    initialX: 0,
    initialY: 0,
    startMouseX: 0,
    startMouseY: 0
};

function iniciarArrastarMesa(e, deskId) {
    const desk = state.desks.find(d => d.id === deskId);
    if (!desk) return;

    dragDeskState.deskId = deskId;
    dragDeskState.initialX = desk.x;
    dragDeskState.initialY = desk.y;
    
    // Obtém a coordenada do cursor no SVG
    const pt = obterCoordenadasSVG(e);
    dragDeskState.startMouseX = pt.x;
    dragDeskState.startMouseY = pt.y;

    const windowMoveHandler = (moveEv) => {
        if (!dragDeskState.deskId) return;
        const currentPt = obterCoordenadasSVG(moveEv);
        
        // Calcula o delta considerando a escala do Zoom
        const dx = currentPt.x - dragDeskState.startMouseX;
        const dy = currentPt.y - dragDeskState.startMouseY;

        // Atualiza coordenadas no estado (com Snap-to-Grid opcional de 5px para alinhamento profissional)
        const snap = 5;
        desk.x = Math.round((dragDeskState.initialX + dx) / snap) * snap;
        desk.y = Math.round((dragDeskState.initialY + dy) / snap) * snap;

        // Atualiza a posição da mesa renderizada em tempo real
        const el = document.getElementById(deskId);
        if (el) {
            el.setAttribute("transform", `translate(${desk.x}, ${desk.y}) rotate(${desk.rotation})`);
        }
    };

    const windowUpHandler = () => {
        window.removeEventListener('mousemove', windowMoveHandler);
        window.removeEventListener('mouseup', windowUpHandler);
        
        if (dragDeskState.deskId) {
            selecionarMesa(dragDeskState.deskId);
            salvarLayoutNoLocalStorage();
            dragDeskState.deskId = null;
        }
    };

    window.addEventListener('mousemove', windowMoveHandler);
    window.addEventListener('mouseup', windowUpHandler);
}

// Converte evento de mouse para coordenadas SVG levando em conta pan e zoom
function obterCoordenadasSVG(e) {
    const rect = svg.getBoundingClientRect();
    
    // Obtém coordenadas locais no container do SVG
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Inverte a transformação do pan e zoom aplicada ao panZoomGroup
    const svgPt = svg.createSVGPoint();
    svgPt.x = x;
    svgPt.y = y;

    // Aplica a matriz de transformação invertida do elemento panZoomGroup
    const globalToLocalMatrix = panZoomGroup.getScreenCTM().inverse();
    const localPt = svgPt.matrixTransform(globalToLocalMatrix);

    return {
        x: localPt.x,
        y: localPt.y
    };
}

// Global scope para mudar o setor no painel
window.alterarSetorDaMesa = function(deskId, val) {
    const desk = state.desks.find(d => d.id === deskId);
    if (!desk) return;

    desk.sectorId = parseInt(val);
    renderApp();
    salvarLayoutNoLocalStorage();
    showToast("Setor da mesa alterado.", "info");
};

// --- LOGICA DE ZOOM E PAN DO CANVAS ---
function configurarEventosPanZoom() {
    
    // 1. Pan (Arrastar o mapa)
    svg.addEventListener('mousedown', (e) => {
        // Clica fora de mesas ou com botão do meio/direito ativa o pan
        if (e.target.id === 'office-svg' || e.target.classList.contains('svg-wall') || e.target.classList.contains('sector-zone') || e.button === 1) {
            zoomState.isDragging = true;
            svg.classList.add('grabbing');
            zoomState.startX = e.clientX - zoomState.x;
            zoomState.startY = e.clientY - zoomState.y;
            e.preventDefault();
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!zoomState.isDragging) return;
        zoomState.x = e.clientX - zoomState.startX;
        zoomState.y = e.clientY - zoomState.startY;
        aplicarPanZoom();
    });

    window.addEventListener('mouseup', () => {
        if (zoomState.isDragging) {
            zoomState.isDragging = false;
            svg.classList.remove('grabbing');
        }
    });

    // 2. Zoom via Roda do Mouse
    svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        const rect = svg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Coordenada do ponto sob o mouse antes do zoom
        const ptX = (mouseX - zoomState.x) / zoomState.scale;
        const ptY = (mouseY - zoomState.y) / zoomState.scale;

        // Fator de zoom
        const zoomFactor = 1.08;
        if (e.deltaY < 0) {
            zoomState.scale = Math.min(zoomState.scale * zoomFactor, 4); // limite máx 4x
        } else {
            zoomState.scale = Math.max(zoomState.scale / zoomFactor, 0.4); // limite mín 0.4x
        }

        // Reposiciona o pan para que o ponto sob o mouse continue o mesmo
        zoomState.x = mouseX - ptX * zoomState.scale;
        zoomState.y = mouseY - ptY * zoomState.scale;

        aplicarPanZoom();
    });

    // 3. Botões de Zoom Flutuantes
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        ajustarZoomCentralizado(1.15);
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        ajustarZoomCentralizado(0.85);
    });

    document.getElementById('btn-zoom-reset').addEventListener('click', () => {
        zoomState.x = 0;
        zoomState.y = 0;
        zoomState.scale = 0.95;
        aplicarPanZoom();
    });

    // 4. Alternar Exibição do Layout Original (WOW effect)
    let showOriginalLayout = false;
    document.getElementById('btn-toggle-original').addEventListener('click', () => {
        showOriginalLayout = !showOriginalLayout;
        const bgImg = document.getElementById('svg-background-image');
        const btn = document.getElementById('btn-toggle-original');
        if (showOriginalLayout) {
            bgImg.style.display = 'block';
            btn.style.borderColor = 'var(--color-secondary)';
            btn.style.color = 'var(--color-secondary)';
            showToast("Planta original exibida como fundo.", "info");
        } else {
            bgImg.style.display = 'none';
            btn.style.borderColor = 'var(--border-color)';
            btn.style.color = 'var(--text-primary)';
            showToast("Planta original oculta.", "info");
        }
    });
}

function ajustarZoomCentralizado(factor) {
    const rect = svg.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const ptX = (centerX - zoomState.x) / zoomState.scale;
    const ptY = (centerY - zoomState.y) / zoomState.scale;

    zoomState.scale = Math.max(0.4, Math.min(4, zoomState.scale * factor));
    zoomState.x = centerX - ptX * zoomState.scale;
    zoomState.y = centerY - ptY * zoomState.scale;

    aplicarPanZoom();
}

function aplicarPanZoom() {
    panZoomGroup.setAttribute('transform', `translate(${zoomState.x}, ${zoomState.y}) scale(${zoomState.scale})`);
}

// --- INTERFACE GERAL E EVENTOS (FILTROS, METRICAS, BOTOES) ---
function renderKPIs() {
    const totalDesks = state.desks.length;
    const occupiedDesks = state.employees.filter(emp => emp.deskId !== null).length;
    const emptyDesks = totalDesks - occupiedDesks;
    const totalEmployees = state.employees.length;

    // Contabiliza total de equipamentos vinculados
    let totalAssets = 0;
    state.employees.forEach(emp => {
        if (emp.equipments) {
            totalAssets += emp.equipments.length;
        }
    });

    document.getElementById('metric-total-desks').textContent = totalDesks;
    document.getElementById('metric-occupied-desks').textContent = occupiedDesks;
    document.getElementById('metric-empty-desks').textContent = emptyDesks;
    document.getElementById('metric-total-employees').textContent = totalEmployees;
    document.getElementById('metric-total-assets').textContent = totalAssets;
}

function renderFiltrosDropdowns() {
    // Preenche filtros de Setores
    const sectorFilter = document.getElementById('filter-sector');
    
    // Salva o valor selecionado antes
    const selectedSector = sectorFilter.value;
    
    sectorFilter.innerHTML = '<option value="all">Todos os Setores</option>';
    state.sectors.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        sectorFilter.appendChild(opt);
    });

    sectorFilter.value = selectedSector || 'all';

    // Preenche também o dropdown de setores dentro do Modal de Funcionário
    const empSectorSelect = document.getElementById('emp-sector');
    empSectorSelect.innerHTML = '';
    state.sectors.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        empSectorSelect.appendChild(opt);
    });
}

function renderRosterList() {
    rosterList.innerHTML = '';
    
    // Funcionários sem mesa vinculada (deskId == null)
    let unassigned = state.employees.filter(emp => emp.deskId === null);

    // Filtra pelo search do Roster
    const searchVal = rosterSearchInput.value.toLowerCase();
    if (searchVal) {
        unassigned = unassigned.filter(emp => emp.name.toLowerCase().includes(searchVal));
    }

    document.getElementById('roster-count').textContent = unassigned.length;

    if (unassigned.length === 0) {
        rosterList.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 20px;">Nenhum funcionário disponível no Roster.</div>`;
        return;
    }

    unassigned.forEach(emp => {
        const sector = state.sectors.find(s => s.id === emp.sectorId);
        const initials = emp.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

        const card = document.createElement('div');
        card.className = "employee-card";
        card.setAttribute("draggable", "true");
        card.setAttribute("id", `roster-${emp.id}`);

        card.innerHTML = `
            <div class="avatar-circle" style="background-color: ${sector ? sector.color : 'var(--color-primary)'}">
                ${initials}
            </div>
            <div class="employee-info">
                <div class="employee-name">${emp.name}</div>
                <div class="employee-role">${sector ? sector.name : 'Sem Setor'}</div>
                <div class="employee-badges">
                    <span class="badge badge-shift">${emp.shift}</span>
                    <span class="badge badge-hours">${emp.hours}</span>
                </div>
            </div>
        `;

        // Eventos de arrastar funcionário
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.setData('text/plain', emp.id);
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        // Clique para abrir detalhes mesmo se não estiver alocado
        card.addEventListener('click', () => {
            // Simulamos abrir detalhes
            abrirDetalhesFuncionarioRoster(emp.id);
        });

        rosterList.appendChild(card);
    });
}

function abrirDetalhesFuncionarioRoster(empId) {
    const employee = state.employees.find(emp => emp.id === empId);
    if (!employee) return;
    
    const sector = state.sectors.find(s => s.id === employee.sectorId);
    slideBody.innerHTML = '';
    document.getElementById('slide-title').textContent = `Perfil (Não alocado)`;

    const initials = employee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    
    let html = `
        <div class="detail-section">
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 12px;">
                <div class="avatar-circle" style="width: 50px; height: 50px; font-size: 18px; background-color: ${sector ? sector.color : 'var(--color-primary)'}">
                    ${initials}
                </div>
                <div>
                    <div style="font-weight: 700; font-size: 15px;">${employee.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${employee.hours} | Turno ${employee.shift}</div>
                </div>
            </div>
            
            <div class="detail-row">
                <span class="detail-label">Setor de Atuação:</span>
                <span class="detail-value" style="color: ${sector ? sector.color : 'inherit'}">${sector ? sector.name : 'Nenhum'}</span>
            </div>
            
            <div class="detail-row">
                <span class="detail-label">Atividades:</span>
            </div>
            <div style="font-size: 12px; line-height: 1.4; color: var(--text-secondary); background-color: var(--bg-input); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color)">
                ${employee.activities || 'Nenhuma atividade cadastrada.'}
            </div>

            <div style="margin-top: 15px; display: flex; gap: 8px;">
                <button class="btn-sidebar-action primary" onclick="abrirEditarFuncionarioModal('${employee.id}')" style="flex: 1;">
                    <i class="fa-solid fa-user-pen"></i> Editar Perfil
                </button>
                <button class="btn-sidebar-action" onclick="excluirFuncionario('${employee.id}')" style="background-color: var(--color-danger-bg); border-color: rgba(231, 76, 60, 0.3); color: var(--color-danger); flex: 1;">
                    <i class="fa-solid fa-trash-can"></i> Excluir Registro
                </button>
            </div>
        </div>
        
        <div class="detail-section">
            <div class="detail-section-title">Equipamentos e Patrimônio (${employee.equipments ? employee.equipments.length : 0})</div>
            <div class="equipment-list">
    `;

    if (employee.equipments && employee.equipments.length > 0) {
        employee.equipments.forEach((eq, index) => {
            html += `
                <div class="equipment-item">
                    <div class="equipment-item-info">
                        <span class="equipment-name">${eq.tipo}: ${eq.detalhes}</span>
                        <span class="equipment-patrimony"><i class="fa-solid fa-barcode"></i> ${eq.patrimonio}</span>
                    </div>
                    <button class="btn-delete-equipment" onclick="removerEquipamento('${employee.id}', ${index})" title="Remover Equipamento">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;
        });
    } else {
        html += `<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 10px;">Nenhum equipamento vinculado.</div>`;
    }

    html += `
            </div>
            
            <div style="margin-top: 15px; border-bottom: none; font-size: 10px;" class="detail-section-title">Vincular Novo Equipamento</div>
            <form class="form-add-equipment" id="form-add-eq" onsubmit="adicionarEquipamento(event, '${employee.id}')">
                <select id="eq-type" required>
                    <option value="Computador">Computador</option>
                    <option value="Monitor">Monitor</option>
                    <option value="Headset">Headset</option>
                    <option value="Telefone IP">Telefone IP</option>
                    <option value="Outro">Outro...</option>
                </select>
                <input type="text" id="eq-patrimony" placeholder="Patrimônio (Ex: PAT-010)" required>
                <input type="text" id="eq-details" placeholder="Modelo/Marca (Ex: Dell Vostro)" style="grid-column: span 2;" required>
                <button type="submit">Adicionar Equipamento</button>
            </form>
        </div>
    `;

    slideBody.innerHTML = html;
    slideOver.classList.add('open');
}

function renderLegend() {
    canvasLegend.innerHTML = '<span class="legend-title">Setores do Escritório</span>';
    
    state.sectors.forEach(s => {
        const div = document.createElement('div');
        div.className = "legend-item";
        div.innerHTML = `
            <div class="legend-dot" style="background-color: ${s.color}"></div>
            <span>${s.name}</span>
        `;
        canvasLegend.appendChild(div);
    });
}

function renderActiveLayoutInfo() {
    document.getElementById('active-layout-desc').textContent = `Layout Ativo: ${state.layoutName} (Carregado com sucesso)`;
}

function atualizarControleDesignToolbar() {
    if (state.isDesignerMode) {
        designerToolbar.style.display = 'flex';
    } else {
        designerToolbar.style.display = 'none';
    }
}

// --- CONFIGURAÇÃO DE EVENTOS DE INTERFACE ---
function configurarEventosInterface() {
    // 1. Alternância de Modo (Visualizar vs Designer)
    const btnView = document.getElementById('btn-mode-view');
    const btnDesign = document.getElementById('btn-mode-design');

    btnView.addEventListener('click', () => {
        if (!state.isDesignerMode) return;
        state.isDesignerMode = false;
        btnDesign.classList.remove('active');
        btnView.classList.add('active', 'view-mode');
        
        // Remove seleção e fecha slide-over se Designer Mode foi fechado
        state.selectedDeskId = null;
        slideOver.classList.remove('open');
        
        inicializarParedesEstaticas(); // Reseta o desenho estático
        renderApp();
        showToast("Modo Visualização Ativado.", "info");
    });

    btnDesign.addEventListener('click', () => {
        if (state.isDesignerMode) return;
        state.isDesignerMode = true;
        btnView.classList.remove('active', 'view-mode');
        btnDesign.classList.add('active');
        
        renderApp();
        showToast("Modo Designer Ativado. Edite livremente as mesas!", "warning");
    });

    // 2. Eventos de Clique fora (Fechar slide-over e limpar seleção de mesa)
    svg.addEventListener('click', (e) => {
        // Se clicar no fundo do SVG, cancela a seleção
        if (e.target.id === 'office-svg' || e.target.classList.contains('svg-wall') || e.target.classList.contains('sector-zone')) {
            state.selectedDeskId = null;
            slideOver.classList.remove('open');
            renderDesks();
        }
    });

    document.getElementById('btn-close-slide').addEventListener('click', () => {
        state.selectedDeskId = null;
        slideOver.classList.remove('open');
        renderDesks();
    });

    // 3. Lógica de Busca no Roster
    rosterSearchInput.addEventListener('input', () => {
        renderRosterList();
    });

    // 4. Modificação de Filtros
    document.getElementById('filter-sector').addEventListener('change', (e) => {
        state.activeFilters.sector = e.target.value;
        renderDesks();
    });
    
    document.getElementById('filter-shift').addEventListener('change', (e) => {
        state.activeFilters.shift = e.target.value;
        renderDesks();
    });
    
    document.getElementById('filter-equipment').addEventListener('change', (e) => {
        state.activeFilters.equipment = e.target.value;
        renderDesks();
    });

    document.getElementById('btn-clear-filters').addEventListener('click', () => {
        state.activeFilters = { sector: 'all', shift: 'all', equipment: 'all', search: '' };
        document.getElementById('filter-sector').value = 'all';
        document.getElementById('filter-shift').value = 'all';
        document.getElementById('filter-equipment').value = 'all';
        rosterSearchInput.value = '';
        renderDesks();
        renderRosterList();
        showToast("Filtros limpos.", "info");
    });

    // 5. Botões do Toolbar do Designer
    document.getElementById('btn-add-desk').addEventListener('click', () => {
        adicionarNovaMesa();
    });

    document.getElementById('btn-rotate-desk').addEventListener('click', () => {
        rotacionarMesaSelecionada();
    });

    document.getElementById('btn-delete-desk').addEventListener('click', () => {
        removerMesaSelecionada();
    });

    // 6. Controle de Abertura de Modais
    document.getElementById('btn-add-employee-modal').addEventListener('click', () => {
        abrirNovoFuncionarioModal();
    });

    document.getElementById('btn-close-employee-modal').addEventListener('click', () => {
        modalEmployee.classList.remove('open');
    });

    document.getElementById('btn-cancel-employee').addEventListener('click', () => {
        modalEmployee.classList.remove('open');
    });

    document.getElementById('form-employee').addEventListener('submit', (e) => {
        e.preventDefault();
        salvarPerfilFuncionario();
    });

    // Gerenciar Setores
    document.getElementById('btn-manage-sectors-modal').addEventListener('click', () => {
        renderSectorsInModal();
        modalSectors.classList.add('open');
    });

    document.getElementById('btn-close-sectors-modal').addEventListener('click', () => {
        modalSectors.classList.remove('open');
    });
    
    document.getElementById('btn-save-sectors-close').addEventListener('click', () => {
        modalSectors.classList.remove('open');
        renderApp();
    });

    document.getElementById('btn-create-sector').addEventListener('click', () => {
        criarNovoSetor();
    });

    // Novo Layout
    document.getElementById('btn-create-layout').addEventListener('click', () => {
        modalLayout.classList.add('open');
    });

    document.getElementById('btn-close-layout-modal').addEventListener('click', () => {
        modalLayout.classList.remove('open');
    });

    document.getElementById('btn-cancel-layout').addEventListener('click', () => {
        modalLayout.classList.remove('open');
    });

    document.getElementById('btn-submit-layout').addEventListener('click', () => {
        criarNovoLayoutRascunho();
    });

    // Salvar Layout na Nuvem
    document.getElementById('btn-save-layout').addEventListener('click', async () => {
        await salvarLayoutNoSupabase();
    });

    // Mudança de Layout selecionado
    layoutSelector.addEventListener('change', async (e) => {
        const id = e.target.value;
        await carregarLayoutSelecionado(id);
    });
}

// --- FUNÇÕES DE MUTACÃO DE MESAS (DESIGNER MODE) ---
function adicionarNovaMesa() {
    // Spawna uma nova mesa no centro geométrico visível
    const rect = svg.getBoundingClientRect();
    
    // Obtém o centro relativo do SVG aplicando as transformações de Pan e Zoom
    const centerX = (rect.width / 2 - zoomState.x) / zoomState.scale;
    const centerY = (rect.height / 2 - zoomState.y) / zoomState.scale;

    const id = `desk-${Date.now()}`;
    const newDesk = {
        id: id,
        x: Math.round(centerX / 10) * 10,
        y: Math.round(centerY / 10) * 10,
        rotation: 0,
        sectorId: state.sectors[0].id // vincula ao primeiro setor por padrão
    };

    state.desks.push(newDesk);
    renderApp();
    selecionarMesa(id);
    showToast("Nova mesa adicionada. Arraste-a para a posição correta!", "success");
    salvarLayoutNoLocalStorage();
}

function rotacionarMesaSelecionada() {
    if (!state.selectedDeskId) {
        showToast("Nenhuma mesa selecionada para rotacionar.", "error");
        return;
    }

    const desk = state.desks.find(d => d.id === state.selectedDeskId);
    if (!desk) return;

    // Incrementa 90 graus
    desk.rotation = (desk.rotation + 90) % 360;
    
    renderApp();
    selecionarMesa(state.selectedDeskId);
    salvarLayoutNoLocalStorage();
}

function removerMesaSelecionada() {
    if (!state.selectedDeskId) {
        showToast("Nenhuma mesa selecionada para remover.", "error");
        return;
    }

    const deskId = state.selectedDeskId;
    const deskIndex = state.desks.findIndex(d => d.id === deskId);
    if (deskIndex === -1) return;

    // Se tiver funcionário alocado, manda de volta pro roster
    const employee = state.employees.find(emp => emp.deskId === deskId);
    if (employee) {
        employee.deskId = null;
        showToast(`${employee.name} retornou ao roster.`, "info");
    }

    state.desks.splice(deskIndex, 1);
    state.selectedDeskId = null;
    slideOver.classList.remove('open');
    
    renderApp();
    salvarLayoutNoLocalStorage();
    showToast("Mesa removida com sucesso.", "info");
}

// --- CRUD DE FUNCIONÁRIOS (MODAIS) ---
function abrirNovoFuncionarioModal() {
    document.getElementById('employee-modal-title').textContent = "Novo Funcionário";
    document.getElementById('emp-id').value = "";
    document.getElementById('emp-name').value = "";
    document.getElementById('emp-activities').value = "";
    document.getElementById('emp-shift').value = "Integral";
    document.getElementById('emp-hours').value = "44h";
    
    modalEmployee.classList.add('open');
}

window.abrirEditarFuncionarioModal = function(empId) {
    const employee = state.employees.find(emp => emp.id === empId);
    if (!employee) return;

    document.getElementById('employee-modal-title').textContent = "Editar Perfil do Funcionário";
    document.getElementById('emp-id').value = employee.id;
    document.getElementById('emp-name').value = employee.name;
    document.getElementById('emp-sector').value = employee.sectorId;
    document.getElementById('emp-shift').value = employee.shift;
    document.getElementById('emp-hours').value = employee.hours;
    document.getElementById('emp-activities').value = employee.activities || "";

    modalEmployee.classList.add('open');
};

function salvarPerfilFuncionario() {
    const id = document.getElementById('emp-id').value;
    const name = document.getElementById('emp-name').value.trim();
    const sectorId = parseInt(document.getElementById('emp-sector').value);
    const shift = document.getElementById('emp-shift').value;
    const hours = document.getElementById('emp-hours').value;
    const activities = document.getElementById('emp-activities').value.trim();

    if (!name) return;

    if (id) {
        // Modo Edição
        const employee = state.employees.find(emp => emp.id === id);
        if (employee) {
            employee.name = name;
            employee.sectorId = sectorId;
            employee.shift = shift;
            employee.hours = hours;
            employee.activities = activities;
            showToast("Perfil de funcionário atualizado!", "success");
        }
    } else {
        // Modo Criação
        const newEmp = {
            id: `emp-${Date.now()}`,
            name: name,
            sectorId: sectorId,
            shift: shift,
            hours: hours,
            activities: activities,
            deskId: null,
            equipments: []
        };
        state.employees.push(newEmp);
        showToast(`Funcionário ${name} cadastrado!`, "success");
    }

    modalEmployee.classList.remove('open');
    renderApp();
    salvarLayoutNoLocalStorage();
}

window.excluirFuncionario = function(empId) {
    const confirmDelete = confirm("Tem certeza que deseja excluir o cadastro desse funcionário? Esta ação é irreversível.");
    if (!confirmDelete) return;

    const empIndex = state.employees.findIndex(emp => emp.id === empId);
    if (empIndex === -1) return;

    const employee = state.employees[empIndex];
    state.employees.splice(empIndex, 1);
    
    slideOver.classList.remove('open');
    renderApp();
    salvarLayoutNoLocalStorage();
    showToast(`Funcionário ${employee.name} excluído do cadastro.`, "info");
};

// --- CRUD DE SETORES (MODAL) ---
function renderSectorsInModal() {
    const container = document.getElementById('sectors-list-container');
    container.innerHTML = '';

    state.sectors.forEach(s => {
        const div = document.createElement('div');
        div.className = "status-item";
        div.style.display = "flex";
        div.style.alignItems = "center";
        div.style.justifyContent = "space-between";
        div.style.padding = "10px";
        div.style.borderBottom = "1px solid var(--border-color)";

        // Cores disponíveis
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <input type="color" value="${s.color}" onchange="atualizarCorDoSetor(${s.id}, this.value)" style="width: 30px; height: 30px; border-radius: 4px; border: 1px solid var(--border-color); cursor: pointer; padding: 0;">
                <span style="font-weight: 600; font-size: 13px;">${s.name}</span>
            </div>
            <button onclick="removerSetor(${s.id})" style="background: none; border: none; color: var(--color-danger); cursor: pointer;" title="Excluir Setor">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        container.appendChild(div);
    });
}

window.atualizarCorDoSetor = function(sectorId, hexColor) {
    const sector = state.sectors.find(s => s.id === sectorId);
    if (sector) {
        sector.color = hexColor;
        salvarLayoutNoLocalStorage();
    }
};

window.removerSetor = function(sectorId) {
    // Bloqueia deleção se houver pessoas ou mesas com esse setor
    const hasEmployees = state.employees.some(emp => emp.sectorId === sectorId);
    const hasDesks = state.desks.some(d => d.sectorId === sectorId);

    if (hasEmployees || hasDesks) {
        alert("Não é possível remover este setor pois existem mesas ou funcionários vinculados a ele.");
        return;
    }

    const index = state.sectors.findIndex(s => s.id === sectorId);
    if (index !== -1) {
        state.sectors.splice(index, 1);
        renderSectorsInModal();
        salvarLayoutNoLocalStorage();
    }
};

function criarNovoSetor() {
    const nameInput = document.getElementById('new-sector-name');
    const name = nameInput.value.trim();
    if (!name) return;

    const colors = ["#2ecc71", "#e74c3c", "#3498db", "#f1c40f", "#9b59b6", "#1abc9c", "#e67e22", "#e84393", "#1abc9c", "#34495e"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newSec = {
        id: Date.now(),
        name: name,
        color: randomColor
    };

    state.sectors.push(newSec);
    nameInput.value = '';
    
    renderSectorsInModal();
    salvarLayoutNoLocalStorage();
    showToast(`Setor ${name} adicionado.`, "success");
}

// --- PERSISTÊNCIA SUPABASE E MULTIPLOS LAYOUTS ---

let layoutsDBList = []; // Lista carregada do Supabase

async function carregarLayoutsDoSupabase() {
    if (!supabase) {
        console.warn("Supabase não disponível. Iniciando no modo de armazenamento LocalStorage.");
        carregarLayoutDoLocalStorage();
        return;
    }

    try {
        const { data, error } = await supabase
            .from('jle_office_layouts')
            .select('*')
            .order('name');

        if (error) {
            console.error("Erro ao ler tabela do Supabase:", error);
            carregarLayoutDoLocalStorage();
            return;
        }

        layoutsDBList = data || [];
        
        // Atualiza o dropdown no cabeçalho
        const select = document.getElementById('layout-selector');
        select.innerHTML = '';
        
        if (layoutsDBList.length === 0) {
            // Se a tabela estiver vazia, adiciona o padrão
            select.innerHTML = '<option value="default">Layout Padrão (Local)</option>';
            carregarLayoutDoLocalStorage();
        } else {
            layoutsDBList.forEach(lay => {
                const opt = document.createElement('option');
                opt.value = lay.id;
                opt.textContent = lay.name + (lay.is_active ? ' (Ativo)' : '');
                if (lay.is_active) opt.selected = true;
                select.appendChild(opt);
            });

            // Carrega o layout ativo
            const activeLayout = layoutsDBList.find(lay => lay.is_active) || layoutsDBList[0];
            state.layoutId = activeLayout.id;
            state.layoutName = activeLayout.name;
            state.desks = activeLayout.data.desks || [...DEFAULT_DESKS];
            state.employees = activeLayout.data.employees || [...DEFAULT_EMPLOYEES];
            state.sectors = activeLayout.data.sectors || [...DEFAULT_SECTORS];
        }
    } catch (err) {
        console.error("Exceção Supabase. Rodando localmente:", err);
        carregarLayoutDoLocalStorage();
    }
}

async function carregarLayoutSelecionado(id) {
    if (id === 'default') {
        carregarLayoutDoLocalStorage();
        renderApp();
        return;
    }

    const layout = layoutsDBList.find(lay => lay.id === id);
    if (!layout) return;

    state.layoutId = layout.id;
    state.layoutName = layout.name;
    state.desks = layout.data.desks || [];
    state.employees = layout.data.employees || [];
    state.sectors = layout.data.sectors || [];

    // Limpa seleções
    state.selectedDeskId = null;
    slideOver.classList.remove('open');

    renderApp();
    showToast(`Carregado layout: ${layout.name}`, "success");
}

async function salvarLayoutNoSupabase() {
    if (!supabase) {
        showToast("Conexão Supabase indisponível. Salvo localmente.", "warning");
        salvarLayoutNoLocalStorage();
        return;
    }

    const layoutData = {
        sectors: state.sectors,
        desks: state.desks,
        employees: state.employees
    };

    try {
        if (state.layoutId === 'default') {
            // Se está no default, pede nome para salvar na nuvem
            const name = prompt("Digite um nome para salvar este layout no Supabase:", "Layout Principal JLE");
            if (!name) return;

            const { data, error } = await supabase
                .from('jle_office_layouts')
                .insert([{ name: name, data: layoutData, is_active: true }])
                .select();

            if (error) throw error;

            showToast("Layout criado e salvo no Supabase!", "success");
            await carregarLayoutsDoSupabase();
        } else {
            // Atualiza o layout aberto na nuvem
            const { error } = await supabase
                .from('jle_office_layouts')
                .update({ data: layoutData, updated_at: new Date().toISOString() })
                .eq('id', state.layoutId);

            if (error) throw error;
            showToast("Alterações salvas no Supabase com sucesso!", "success");
        }
    } catch (err) {
        console.error("Erro ao gravar no Supabase:", err);
        showToast("Erro ao gravar dados no Supabase. Salvo localmente.", "error");
        salvarLayoutNoLocalStorage();
    }
}

async function criarNovoLayoutRascunho() {
    const name = document.getElementById('new-layout-name').value.trim();
    const base = document.getElementById('new-layout-base').value;

    if (!name) return;

    let layoutData = {
        sectors: [...state.sectors],
        desks: [],
        employees: []
    };

    if (base === 'current') {
        layoutData.desks = JSON.parse(JSON.stringify(state.desks));
        // Copia também employees limpando alocação opcional ou mantendo
        layoutData.employees = JSON.parse(JSON.stringify(state.employees));
    } else {
        // Mantém somente os setores padrão
        layoutData.sectors = [...DEFAULT_SECTORS];
    }

    modalLayout.classList.remove('open');

    if (!supabase) {
        // Modo local
        state.layoutId = `local-${Date.now()}`;
        state.layoutName = name;
        state.desks = layoutData.desks;
        state.employees = layoutData.employees;
        state.sectors = layoutData.sectors;
        
        // Adiciona no seletor
        const select = document.getElementById('layout-selector');
        const opt = document.createElement('option');
        opt.value = state.layoutId;
        opt.textContent = name + ' (Local)';
        opt.selected = true;
        select.appendChild(opt);

        renderApp();
        showToast(`Layout local '${name}' criado!`, "success");
        salvarLayoutNoLocalStorage();
        return;
    }

    try {
        // Salva na nuvem
        const { data, error } = await supabase
            .from('jle_office_layouts')
            .insert([{ name: name, data: layoutData, is_active: true }])
            .select();

        if (error) throw error;

        showToast(`Novo layout '${name}' criado com sucesso!`, "success");
        await carregarLayoutsDoSupabase();
        renderApp();
    } catch (err) {
        console.error(err);
        showToast("Falha ao criar layout no Supabase.", "error");
    }
}

// Fallback LocalStorage
function salvarLayoutNoLocalStorage() {
    const dataToSave = {
        layoutId: state.layoutId,
        layoutName: state.layoutName,
        sectors: state.sectors,
        desks: state.desks,
        employees: state.employees
    };
    localStorage.setItem('jle_office_layout_local', JSON.stringify(dataToSave));
}

function carregarLayoutDoLocalStorage() {
    const local = localStorage.getItem('jle_office_layout_local');
    if (local) {
        try {
            const parsed = JSON.parse(local);
            state.layoutId = parsed.layoutId || 'default';
            state.layoutName = parsed.layoutName || 'Layout Padrão (Local)';
            state.sectors = parsed.sectors || [...DEFAULT_SECTORS];
            state.desks = parsed.desks || [...DEFAULT_DESKS];
            state.employees = parsed.employees || [...DEFAULT_EMPLOYEES];
            console.log("Layout local restaurado do LocalStorage");
        } catch (e) {
            console.error("Erro ao ler LocalStorage:", e);
        }
    }
}

// --- UTILITÁRIO: TOAST NOTIFICATIONS ---
function showToast(message, type = "info") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '<i class="fa-solid fa-circle-info"></i>';
    if (type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
    if (type === 'error') icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
    if (type === 'warning') icon = '<i class="fa-solid fa-pen-ruler"></i>';

    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Expor função de renderização globalmente para transição de abas
window.renderRHApp = renderApp;
