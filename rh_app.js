// JLE Office Layout Manager - Lógica Principal

// --- CONFIGURAÇÃO E INICIALIZAÇÃO SUPABASE ---
const SUPABASE_URL = "https://fowlctvebdcodphntsjw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvd2xjdHZlYmRjb2RwaG50c2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzg2NjUsImV4cCI6MjA5NTY1NDY2NX0.PxzD_PlU4sBFPBukthuXpkBlzYbQqMLXLE4DQwctPOM";

let supabaseRH = null;
try {
    if (typeof window.supabase !== 'undefined') {
        supabaseRH = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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

const DEFAULT_SECTOR_ZONES = [
    { id: "zone-1", sectorId: 3, x: 80, y: 50, w: 350, h: 150 },   // TI
    { id: "zone-2", sectorId: 8, x: 660, y: 350, w: 240, h: 100 },  // RH
    { id: "zone-3", sectorId: 4, x: 660, y: 450, w: 240, h: 200 },  // Comercial
    { id: "zone-4", sectorId: 1, x: 660, y: 730, w: 240, h: 150 }   // Diretoria
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
// --- DADOS ESTRUTURAIS PADRÃO DE SEED (FALLBACKS) ---
const DEFAULT_WALLS = [
    { id: "wall-1", type: "wall", x1: 80, y1: 200, x2: 80, y2: 50 },
    { id: "wall-2", type: "wall", x1: 80, y1: 50, x2: 430, y2: 50 },
    { id: "wall-3", type: "wall", x1: 430, y1: 50, x2: 430, y2: 200 },
    { id: "wall-4", type: "wall", x1: 430, y1: 200, x2: 900, y2: 200 },
    { id: "wall-5", type: "wall", x1: 900, y1: 200, x2: 900, y2: 880 },
    { id: "wall-6", type: "wall", x1: 900, y1: 880, x2: 430, y2: 880 },
    { id: "wall-7", type: "wall", x1: 430, y1: 880, x2: 430, y2: 730 },
    { id: "wall-8", type: "wall", x1: 430, y1: 730, x2: 75, y2: 730 },
    { id: "wall-9", type: "wall", x1: 75, y1: 730, x2: 75, y2: 250 },
    // Partition Walls
    { id: "wall-10", type: "wall", x1: 135, y1: 50, x2: 135, y2: 200 },
    { id: "wall-11", type: "wall", x1: 200, y1: 50, x2: 200, y2: 150 },
    { id: "wall-12", type: "wall", x1: 260, y1: 50, x2: 260, y2: 150 },
    { id: "wall-13", type: "wall", x1: 320, y1: 50, x2: 320, y2: 150 },
    { id: "wall-14", type: "wall", x1: 200, y1: 150, x2: 430, y2: 150 },
    { id: "wall-15", type: "wall", x1: 310, y1: 200, x2: 310, y2: 300 },
    { id: "wall-16", type: "wall", x1: 310, y1: 300, x2: 430, y2: 300 },
    { id: "wall-17", type: "wall", x1: 430, y1: 630, x2: 550, y2: 630 },
    { id: "wall-18", type: "wall", x1: 430, y1: 680, x2: 550, y2: 680 },
    { id: "wall-19", type: "wall", x1: 430, y1: 730, x2: 550, y2: 730 },
    { id: "wall-20", type: "wall", x1: 550, y1: 630, x2: 550, y2: 730 },
    { id: "wall-21", type: "wall", x1: 660, y1: 730, x2: 660, y2: 880 }
];

const DEFAULT_PARTITIONS = [
    { id: "part-1", type: "partition", x1: 660, y1: 350, x2: 660, y2: 730 },
    { id: "part-2", type: "partition", x1: 660, y1: 350, x2: 900, y2: 350 },
    { id: "part-3", type: "partition", x1: 660, y1: 450, x2: 900, y2: 450 },
    { id: "part-4", type: "partition", x1: 660, y1: 550, x2: 900, y2: 550 },
    { id: "part-5", type: "partition", x1: 660, y1: 650, x2: 900, y2: 650 },
    { id: "part-6", type: "partition", x1: 660, y1: 730, x2: 900, y2: 730 }
];

const DEFAULT_DOORS = [
    { id: "door-1", type: "door", x: 135, y: 200, rotation: 90 },
    { id: "door-2", type: "door", x: 430, y: 200, rotation: 0 },
    { id: "door-3", type: "door", x: 500, y: 730, rotation: 180 },
    { id: "door-4", type: "door", x: 500, y: 680, rotation: 180 }
];

const DEFAULT_FIXTURES = [
    { id: "fix-toilet-1", type: "toilet", x: 490, y: 655, rotation: 0 },
    { id: "fix-toilet-2", type: "toilet", x: 490, y: 705, rotation: 0 },
    { id: "fix-sink-1", type: "sink", x: 535, y: 655, rotation: -90 },
    { id: "fix-sink-2", type: "sink", x: 535, y: 705, rotation: -90 },
    { id: "fix-cafe", type: "cafe", x: 530, y: 832, rotation: 0, width: 180, height: 65, name: "Área de Café / Copa" },
    { id: "fix-table", type: "table", x: 800, y: 835, rotation: 0, width: 120, height: 50, name: "Mesa de Reuniões" },
    { id: "fix-printer-1", type: "printer", x: 500, y: 280, rotation: 0 },
    { id: "fix-printer-2", type: "printer", x: 690, y: 380, rotation: 90 }
];

let state = {
    layoutId: 'default',
    layoutName: 'Layout Padrão (Local)',
    sectors: [...DEFAULT_SECTORS],
    desks: [...DEFAULT_DESKS],
    employees: [...DEFAULT_EMPLOYEES],
    walls: [...DEFAULT_WALLS],
    partitions: [...DEFAULT_PARTITIONS],
    doors: [...DEFAULT_DOORS],
    fixtures: [...DEFAULT_FIXTURES],
    sectorZones: [...DEFAULT_SECTOR_ZONES],
    isDesignerMode: false,
    selectedDeskId: null, // ID do elemento selecionado (mesa, parede, etc.)
    activeTool: 'select', // select, draw-wall, draw-partition, add-door, add-desk, add-meeting-table, add-printer, add-cafe, add-toilet, add-sink
    drawingStart: null, // { x, y } para desenho CAD
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
const modalZone = document.getElementById('modal-zone');

// --- INICIALIZAÇÃO SEGURA DA APLICAÇÃO ---
async function iniciarAplicacao() {
    configurarEventosPanZoom();
    configurarDragAndDrop();
    configurarEventosInterface();
    
    // Carrega o layout do cache local/padrão para exibir instantaneamente
    carregarLayoutDoLocalStorage();
    renderApp();
    
    // Sincroniza com o Supabase em background sem bloquear a UI
    carregarLayoutsDoSupabase()
        .then(() => {
            renderApp();
            showToast("Dados sincronizados com a nuvem!", "success");
        })
        .catch(err => {
            console.error("Falha ao sincronizar com Supabase em background:", err);
        });
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
    renderStructuralElements(); // Renderiza dinamicamente as estruturas físicas (paredes, portas, divisórias)
    renderDesks();
    renderSectorsBackground();
    renderLegend();
    renderActiveLayoutInfo();
    atualizarControleDesignToolbar();
}

let selectedElementType = null; // 'desk', 'wall', 'partition', 'door', 'fixture'
window.selecionarElemento = function(id, label) {
    state.selectedDeskId = id;
    
    if (!id) {
        selectedElementType = null;
        if (state.isDesignerMode) {
            const indicator = document.getElementById('selected-element-indicator');
            if (indicator) indicator.textContent = 'Selecione um item';
        }
        return;
    }
    
    // Identifica o tipo do elemento
    if (state.desks.some(d => d.id === id)) {
        selectedElementType = 'desk';
    } else if (state.walls.some(w => w.id === id)) {
        selectedElementType = 'wall';
    } else if (state.partitions.some(p => p.id === id)) {
        selectedElementType = 'partition';
    } else if (state.doors.some(d => d.id === id)) {
        selectedElementType = 'door';
    } else if (state.fixtures.some(f => f.id === id)) {
        selectedElementType = 'fixture';
    } else if (state.sectorZones && state.sectorZones.some(z => z.id === id)) {
        selectedElementType = 'zone';
    } else {
        selectedElementType = null;
    }

    if (state.isDesignerMode) {
        const indicator = document.getElementById('selected-element-indicator');
        if (indicator) {
            indicator.textContent = `${label} (${id})`;
        }
        renderStructuralElements();
        renderDesks();
        renderSectorsBackground();
    } else {
        // Modo Visualização: abre slide-over para mesas
        if (selectedElementType === 'desk') {
            selecionarMesa(id);
        } else {
            state.selectedDeskId = null;
            slideOver.classList.remove('open');
            renderStructuralElements();
            renderDesks();
        }
    }
};

// --- MOTOR DE RENDERIZAÇÃO VETORIAL DINÂMICA ---
function renderStructuralElements() {
    const wallsGroup = document.getElementById('svg-walls-static');
    if (!wallsGroup) return;
    wallsGroup.innerHTML = ''; // Limpa tudo antes de re-desenhar

    // 1. Renderizar Paredes de Tijolo (Walls)
    state.walls.forEach(w => {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", w.x1);
        line.setAttribute("y1", w.y1);
        line.setAttribute("x2", w.x2);
        line.setAttribute("y2", w.y2);
        
        let cls = "svg-wall";
        if (state.isDesignerMode) cls += " designer-editable";
        if (state.selectedDeskId === w.id) cls += " selected";
        line.setAttribute("class", cls);
        line.style.strokeWidth = "5px";
        
        if (state.isDesignerMode) {
            line.addEventListener('click', (e) => {
                e.stopPropagation();
                selecionarElemento(w.id, 'Parede');
            });
        }
        wallsGroup.appendChild(line);
    });

    // 2. Renderizar Divisórias de Vidro (Partitions)
    state.partitions.forEach(p => {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", p.x1);
        line.setAttribute("y1", p.y1);
        line.setAttribute("x2", p.x2);
        line.setAttribute("y2", p.y2);
        
        let cls = "svg-partition";
        if (state.isDesignerMode) cls += " designer-editable";
        if (state.selectedDeskId === p.id) cls += " selected";
        line.setAttribute("class", cls);
        line.style.strokeWidth = "3px";
        
        if (state.isDesignerMode) {
            line.addEventListener('click', (e) => {
                e.stopPropagation();
                selecionarElemento(p.id, 'Divisória');
            });
        }
        wallsGroup.appendChild(line);
    });

    // 3. Renderizar Portas (Swing Doors)
    state.doors.forEach(d => {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("id", d.id);
        g.setAttribute("transform", `translate(${d.x}, ${d.y}) rotate(${d.rotation})`);
        
        let cls = "door-group";
        if (state.isDesignerMode) cls += " designer-editable";
        if (state.selectedDeskId === d.id) cls += " selected";
        g.setAttribute("class", cls);
        g.style.cursor = state.isDesignerMode ? "move" : "default";

        // Folha da porta (linha laranja)
        const doorLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        doorLine.setAttribute("x1", 0);
        doorLine.setAttribute("y1", 0);
        doorLine.setAttribute("x2", 0);
        doorLine.setAttribute("y2", -35); // 35px largura de passagem padrão
        doorLine.setAttribute("class", "svg-door");
        g.appendChild(doorLine);

        // Arco de abertura
        const arcPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arcPath.setAttribute("d", "M 0,-35 A 35,35 0 0,1 35,0");
        arcPath.setAttribute("fill", "none");
        arcPath.setAttribute("stroke", "var(--color-secondary)");
        arcPath.setAttribute("stroke-width", "1.5");
        arcPath.setAttribute("stroke-dasharray", "3,3");
        g.appendChild(arcPath);

        g.addEventListener('click', (e) => {
            e.stopPropagation();
            selecionarElemento(d.id, 'Porta');
        });

        if (state.isDesignerMode) {
            g.addEventListener('mousedown', (e) => {
                if (e.button === 0) { // Botão esquerdo
                    e.stopPropagation();
                    iniciarArrastarElemento(e, d.id, 'door');
                }
            });
        }

        wallsGroup.appendChild(g);
    });

    // 4. Renderizar Equipamentos Comuns e Sanitários (Fixtures)
    state.fixtures.forEach(fix => {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("id", fix.id);
        g.setAttribute("transform", `translate(${fix.x}, ${fix.y}) rotate(${fix.rotation})`);
        
        let cls = "fixture-group " + fix.type;
        if (state.isDesignerMode) cls += " designer-editable";
        if (state.selectedDeskId === fix.id) cls += " selected";
        g.setAttribute("class", cls);
        g.style.cursor = state.isDesignerMode ? "move" : "default";

        const namesMap = { 
            toilet: 'Vaso Sanitário', 
            sink: 'Pia Sanitária', 
            printer: 'Impressora', 
            cafe: 'Copa / Área de Café', 
            table: 'Mesa de Reuniões' 
        };

        if (fix.type === 'toilet') {
            // Cisterna
            const tank = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            tank.setAttribute("x", -10);
            tank.setAttribute("y", -11);
            tank.setAttribute("width", 20);
            tank.setAttribute("height", 5);
            tank.setAttribute("rx", 1.5);
            tank.setAttribute("fill", "#112233");
            tank.setAttribute("stroke", "#637a91");
            tank.setAttribute("stroke-width", "1");
            g.appendChild(tank);

            // Bacia
            const bowl = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
            bowl.setAttribute("cx", 0);
            bowl.setAttribute("cy", 1);
            bowl.setAttribute("rx", 7.5);
            bowl.setAttribute("ry", 10);
            bowl.setAttribute("fill", "#112233");
            bowl.setAttribute("stroke", "#637a91");
            bowl.setAttribute("stroke-width", "1");
            g.appendChild(bowl);
        }
        else if (fix.type === 'sink') {
            // Base
            const base = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            base.setAttribute("x", -9);
            base.setAttribute("y", -9);
            base.setAttribute("width", 18);
            base.setAttribute("height", 14);
            base.setAttribute("rx", 2);
            base.setAttribute("fill", "#112233");
            base.setAttribute("stroke", "#526880");
            base.setAttribute("stroke-width", "1.2");
            g.appendChild(base);

            // Cuba
            const bowl = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
            bowl.setAttribute("cx", 0);
            bowl.setAttribute("cy", -1);
            bowl.setAttribute("rx", 5);
            bowl.setAttribute("ry", 4);
            bowl.setAttribute("fill", "#1b2936");
            bowl.setAttribute("stroke", "#526880");
            bowl.setAttribute("stroke-width", "0.8");
            g.appendChild(bowl);

            // Torneira
            const tap = document.createElementNS("http://www.w3.org/2000/svg", "line");
            tap.setAttribute("x1", 0);
            tap.setAttribute("y1", -8);
            tap.setAttribute("x2", 0);
            tap.setAttribute("y2", -4);
            tap.setAttribute("stroke", "#bdc3c7");
            tap.setAttribute("stroke-width", "1.5");
            g.appendChild(tap);
        }
        else if (fix.type === 'printer') {
            // Corpo da Impressora
            const body = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            body.setAttribute("x", -15);
            body.setAttribute("y", -15);
            body.setAttribute("width", 30);
            body.setAttribute("height", 30);
            body.setAttribute("rx", 3);
            body.setAttribute("fill", "#1a2c3d");
            body.setAttribute("stroke", "#526880");
            body.setAttribute("stroke-width", "1.5");
            g.appendChild(body);

            // Tampa do Scanner
            const scanner = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            scanner.setAttribute("x", -10);
            scanner.setAttribute("y", -10);
            scanner.setAttribute("width", 20);
            scanner.setAttribute("height", 17);
            scanner.setAttribute("rx", 1.5);
            scanner.setAttribute("fill", "#0e1a26");
            scanner.setAttribute("stroke", "#637a91");
            scanner.setAttribute("stroke-width", "0.8");
            g.appendChild(scanner);

            // Display
            const display = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            display.setAttribute("x", -8);
            display.setAttribute("y", 9);
            display.setAttribute("width", 16);
            display.setAttribute("height", 3);
            display.setAttribute("fill", "#00d2d3");
            g.appendChild(display);
        }
        else if (fix.type === 'cafe' || fix.type === 'table') {
            // Blocos retangulares decorativos
            const w = fix.width || 100;
            const h = fix.height || 50;
            
            const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            r.setAttribute("x", -w / 2);
            r.setAttribute("y", -h / 2);
            r.setAttribute("width", w);
            r.setAttribute("height", h);
            r.setAttribute("fill", "#1b2936");
            r.setAttribute("stroke", "#3b5066");
            r.setAttribute("stroke-width", "1");
            r.setAttribute("rx", "6");
            g.appendChild(r);

            // Rótulo
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", 0);
            text.setAttribute("y", 4);
            text.setAttribute("fill", "#637a91");
            text.setAttribute("font-size", "10px");
            text.setAttribute("font-weight", "600");
            text.setAttribute("text-anchor", "middle");
            text.textContent = fix.name;
            g.appendChild(text);
        }

        g.addEventListener('click', (e) => {
            e.stopPropagation();
            selecionarElemento(fix.id, namesMap[fix.type] || 'Móvel');
        });

        if (state.isDesignerMode) {
            g.addEventListener('mousedown', (e) => {
                if (e.button === 0) { // Botão esquerdo
                    e.stopPropagation();
                    iniciarArrastarElemento(e, fix.id, 'fixture');
                }
            });
        }

        wallsGroup.appendChild(g);
    });

    // 5. Rótulos de Áreas Administrativas (Estáticos)
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
    if (!sectorsBgGroup) return;
    sectorsBgGroup.innerHTML = '';

    const zones = state.sectorZones || [];

    zones.forEach(zone => {
        const sector = state.sectors.find(s => s.id === zone.sectorId);
        if (!sector) return;

        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("id", zone.id);
        
        let gClass = "sector-zone-group";
        if (state.isDesignerMode && state.selectedDeskId === zone.id) {
            gClass += " selected";
        }
        g.setAttribute("class", gClass);

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", zone.x);
        rect.setAttribute("y", zone.y);
        rect.setAttribute("width", zone.w);
        rect.setAttribute("height", zone.h);
        rect.setAttribute("fill", sector.color);
        rect.setAttribute("stroke", sector.color);
        rect.setAttribute("class", "sector-zone");
        
        if (state.isDesignerMode) {
            rect.style.cursor = 'pointer';
            rect.addEventListener('click', (e) => {
                e.stopPropagation();
                selecionarElemento(zone.id, `Área: ${sector.name}`);
            });
        }
        
        g.appendChild(rect);
        sectorsBgGroup.appendChild(g);
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
                    selecionarElemento(desk.id, 'Mesa de Trabalho');
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

function iniciarArrastarElemento(e, elementId, type) {
    let element = null;
    if (type === 'desk') element = state.desks.find(d => d.id === elementId);
    else if (type === 'door') element = state.doors.find(d => d.id === elementId);
    else if (type === 'fixture') element = state.fixtures.find(f => f.id === elementId);
    
    if (!element) return;

    dragDeskState.deskId = elementId;
    dragDeskState.initialX = element.x;
    dragDeskState.initialY = element.y;
    
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

        // Snap-to-Grid de 10px para alinhamento CAD profissional
        const snap = 10;
        element.x = Math.round((dragDeskState.initialX + dx) / snap) * snap;
        element.y = Math.round((dragDeskState.initialY + dy) / snap) * snap;

        // Atualiza a posição renderizada em tempo real
        const el = document.getElementById(elementId);
        if (el) {
            el.setAttribute("transform", `translate(${element.x}, ${element.y}) rotate(${element.rotation})`);
        }
    };

    const windowUpHandler = () => {
        window.removeEventListener('mousemove', windowMoveHandler);
        window.removeEventListener('mouseup', windowUpHandler);
        
        if (dragDeskState.deskId) {
            const namesMap = { door: 'Porta', toilet: 'Vaso Sanitário', sink: 'Pia', printer: 'Impressora', cafe: 'Copa', table: 'Mesa Reuniões' };
            const label = namesMap[element.type] || 'Mesa';
            selecionarElemento(dragDeskState.deskId, label);
            salvarLayoutNoLocalStorage();
            dragDeskState.deskId = null;
        }
    };

    window.addEventListener('mousemove', windowMoveHandler);
    window.addEventListener('mouseup', windowUpHandler);
}

function iniciarArrastarMesa(e, deskId) {
    iniciarArrastarElemento(e, deskId, 'desk');
}

// Converte evento de mouse para coordenadas SVG levando em conta pan e zoom
function obterCoordenadasSVG(e) {
    // Inverte a transformação do pan e zoom aplicada ao panZoomGroup
    const svgPt = svg.createSVGPoint();
    svgPt.x = e.clientX;
    svgPt.y = e.clientY;

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
    const metricsRow = document.querySelector('.rh-metrics-row');
    const btnSave = document.getElementById('btn-save-layout');
    const btnCreate = document.getElementById('btn-create-layout');
    
    if (state.isDesignerMode) {
        designerToolbar.style.display = 'flex';
        if (metricsRow) metricsRow.style.display = 'none';
        if (btnSave) btnSave.style.display = 'flex';
        if (btnCreate) btnCreate.style.display = 'flex';
    } else {
        designerToolbar.style.display = 'none';
        if (metricsRow) metricsRow.style.display = 'flex';
        if (btnSave) btnSave.style.display = 'none';
        if (btnCreate) btnCreate.style.display = 'none';
    }
}

window.setDesignerTool = function(tool) {
    state.activeTool = tool;
    state.drawingStart = null;
    removerLinhaGuia();
    
    // Atualiza classes ativas dos botões da paleta
    const buttons = document.querySelectorAll('#designer-element-palette .palette-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    const activeBtn = document.getElementById(`tool-${tool}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // Atualiza o cursor do SVG
    const svg = document.getElementById('office-svg');
    if (svg) {
        if (tool === 'draw-wall' || tool === 'draw-partition' || tool === 'draw-zone') {
            svg.style.cursor = 'crosshair';
        } else if (tool.startsWith('add-')) {
            svg.style.cursor = 'cell';
        } else {
            svg.style.cursor = 'default';
        }
    }
};

function removerLinhaGuia() {
    const tempLine = document.getElementById('svg-drawing-preview');
    if (tempLine) {
        tempLine.remove();
    }
    const tempRect = document.getElementById('svg-drawing-preview-rect');
    if (tempRect) {
        tempRect.remove();
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
        
        // Restaura a visualização da barra lateral padrão
        document.getElementById('rh-roster-panel').style.display = 'flex';
        document.getElementById('rh-roster-footer').style.display = 'flex';
        document.getElementById('designer-element-palette').style.display = 'none';
        
        // Remove seleção e reseta ferramenta
        state.selectedDeskId = null;
        slideOver.classList.remove('open');
        setDesignerTool('select');
        
        renderApp();
        showToast("Modo Visualização Ativado.", "info");
    });

    btnDesign.addEventListener('click', () => {
        if (state.isDesignerMode) return;
        state.isDesignerMode = true;
        btnView.classList.remove('active', 'view-mode');
        btnDesign.classList.add('active');
        
        // Exibe a paleta de elementos do Designer na barra lateral
        document.getElementById('rh-roster-panel').style.display = 'none';
        document.getElementById('rh-roster-footer').style.display = 'none';
        document.getElementById('designer-element-palette').style.display = 'flex';
        
        // Limpa seleções anteriores e inicia no ponteiro
        state.selectedDeskId = null;
        slideOver.classList.remove('open');
        setDesignerTool('select');
        
        renderApp();
        showToast("Modo Designer Ativado. Construa e edite a planta!", "warning");
    });

    // 2. Ouvintes de Mouse no SVG (Seleção, Posicionamento e Desenho CAD)
    svg.addEventListener('mousemove', (e) => {
        if ((state.activeTool === 'draw-wall' || state.activeTool === 'draw-partition') && state.drawingStart) {
            const pt = obterCoordenadasSVG(e);
            const snap = 10;
            let x2 = Math.round(pt.x / snap) * snap;
            let y2 = Math.round(pt.y / snap) * snap;
            
            // Trava ortogonal (90 graus) por padrão (libera com SHIFT)
            if (!e.shiftKey) {
                const dx = Math.abs(x2 - state.drawingStart.x);
                const dy = Math.abs(y2 - state.drawingStart.y);
                if (dx > dy) {
                    y2 = state.drawingStart.y;
                } else {
                    x2 = state.drawingStart.x;
                }
            }
            
            // Atualiza linha guia temporária
            let tempLine = document.getElementById('svg-drawing-preview');
            if (!tempLine) {
                tempLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
                tempLine.setAttribute("id", "svg-drawing-preview");
                tempLine.setAttribute("class", "svg-drawing-preview");
                tempLine.setAttribute("stroke", state.activeTool === 'draw-wall' ? "#e74c3c" : "#3498db");
                tempLine.setAttribute("stroke-width", state.activeTool === 'draw-wall' ? "4" : "2.5");
                tempLine.setAttribute("stroke-dasharray", "4,4");
                tempLine.style.pointerEvents = 'none';
                svg.appendChild(tempLine);
            }
            tempLine.setAttribute("x1", state.drawingStart.x);
            tempLine.setAttribute("y1", state.drawingStart.y);
            tempLine.setAttribute("x2", x2);
            tempLine.setAttribute("y2", y2);
        } else if (state.activeTool === 'draw-zone' && state.drawingStart) {
            const pt = obterCoordenadasSVG(e);
            const snap = 10;
            const x2 = Math.round(pt.x / snap) * snap;
            const y2 = Math.round(pt.y / snap) * snap;
            
            const rx = Math.min(state.drawingStart.x, x2);
            const ry = Math.min(state.drawingStart.y, y2);
            const rw = Math.abs(x2 - state.drawingStart.x);
            const rh = Math.abs(y2 - state.drawingStart.y);
            
            let tempRect = document.getElementById('svg-drawing-preview-rect');
            if (!tempRect) {
                tempRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                tempRect.setAttribute("id", "svg-drawing-preview-rect");
                tempRect.setAttribute("stroke", "var(--color-secondary)");
                tempRect.setAttribute("stroke-width", "1.5");
                tempRect.setAttribute("stroke-dasharray", "4,4");
                tempRect.setAttribute("fill", "rgba(254, 202, 87, 0.05)");
                tempRect.style.pointerEvents = 'none';
                svg.appendChild(tempRect);
            }
            tempRect.setAttribute("x", rx);
            tempRect.setAttribute("y", ry);
            tempRect.setAttribute("width", rw);
            tempRect.setAttribute("height", rh);
        }
    });

    svg.addEventListener('click', (e) => {
        // Se clicar no fundo do SVG, cancela a seleção
        const clickedBackground = (e.target.id === 'office-svg' || e.target.classList.contains('sector-zone') || e.target.tagName === 'image');
        
        if (state.isDesignerMode && state.activeTool !== 'select') {
            // EXECUTA LÓGICA DE INSERÇÃO E EDICAO CAD
            const pt = obterCoordenadasSVG(e);
            const snap = 10;
            const x = Math.round(pt.x / snap) * snap;
            const y = Math.round(pt.y / snap) * snap;

            if (state.activeTool === 'draw-wall' || state.activeTool === 'draw-partition') {
                if (!state.drawingStart) {
                    // Primeiro Clique: Inicia a linha
                    state.drawingStart = { x, y };
                } else {
                    // Segundo Clique: Finaliza a linha
                    let x2 = x;
                    let y2 = y;
                    if (!e.shiftKey) {
                        const dx = Math.abs(x2 - state.drawingStart.x);
                        const dy = Math.abs(y2 - state.drawingStart.y);
                        if (dx > dy) {
                            y2 = state.drawingStart.y;
                        } else {
                            x2 = state.drawingStart.x;
                        }
                    }
                    
                    const id = `${state.activeTool === 'draw-wall' ? 'wall' : 'part'}-${Date.now()}`;
                    if (state.activeTool === 'draw-wall') {
                        state.walls.push({ id, type: 'wall', x1: state.drawingStart.x, y1: state.drawingStart.y, x2, y2 });
                        showToast("Parede adicionada!", "success");
                    } else {
                        state.partitions.push({ id, type: 'partition', x1: state.drawingStart.x, y1: state.drawingStart.y, x2, y2 });
                        showToast("Divisória de vidro adicionada!", "success");
                    }
                    
                    state.drawingStart = null;
                    removerLinhaGuia();
                    salvarLayoutNoLocalStorage();
                    renderApp();
                }
            } else if (state.activeTool === 'draw-zone') {
                if (!state.drawingStart) {
                    state.drawingStart = { x, y };
                } else {
                    const x2 = x;
                    const y2 = y;
                    const rx = Math.min(state.drawingStart.x, x2);
                    const ry = Math.min(state.drawingStart.y, y2);
                    const rw = Math.abs(x2 - state.drawingStart.x);
                    const rh = Math.abs(y2 - state.drawingStart.y);
                    
                    if (rw < 20 || rh < 20) {
                        showToast("A área desenhada é muito pequena. Desenhe uma área maior.", "warning");
                        state.drawingStart = null;
                        removerLinhaGuia();
                        return;
                    }
                    
                    window.pendingZoneRect = { x: rx, y: ry, w: rw, h: rh };
                    abrirModalZone();
                }
            } else if (state.activeTool.startsWith('add-')) {
                // Posiciona elementos pontuais
                const type = state.activeTool.replace('add-', '');
                const id = `${type}-${Date.now()}`;
                
                if (type === 'desk') {
                    state.desks.push({ id, x, y, rotation: 0, sectorId: 6 }); // Setor administrativo por padrão
                    showToast("Mesa posicionada com sucesso!", "success");
                } else if (type === 'door') {
                    state.doors.push({ id, type: 'door', x, y, rotation: 0 });
                    showToast("Porta swing posicionada!", "success");
                } else if (type === 'meeting-table') {
                    state.fixtures.push({ id, type: 'table', x, y, rotation: 0, width: 120, height: 50, name: "Mesa de Reuniões" });
                    showToast("Mesa de reuniões posicionada!", "success");
                } else if (type === 'cafe') {
                    state.fixtures.push({ id, type: 'cafe', x, y, rotation: 0, width: 180, height: 65, name: "Área de Café / Copa" });
                    showToast("Área de café posicionada!", "success");
                } else {
                    state.fixtures.push({ id, type, x, y, rotation: 0 });
                    const namesMap = { toilet: 'Vaso Sanitário', sink: 'Pia Sanitária', printer: 'Impressora' };
                    showToast(`${namesMap[type] || 'Objeto'} posicionado!`, "success");
                }
                
                salvarLayoutNoLocalStorage();
                setDesignerTool('select'); // Volta para ferramenta seleção
                renderApp();
            }
            return;
        }

        // Seleção de fundo / limpar seleção
        if (clickedBackground) {
            selecionarElemento(null);
            slideOver.classList.remove('open');
        }
    });

    document.getElementById('btn-close-slide').addEventListener('click', () => {
        selecionarElemento(null);
        slideOver.classList.remove('open');
    });

    // Tecla ESC cancela ferramenta de desenho CAD
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (state.isDesignerMode && state.activeTool !== 'select') {
                setDesignerTool('select');
                showToast("Ferramenta redefinida para seleção.", "info");
            }
        }
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

    // Modal de Zonas/Áreas
    const btnCloseZoneModal = document.getElementById('btn-close-zone-modal');
    if (btnCloseZoneModal) {
        btnCloseZoneModal.addEventListener('click', fecharModalZone);
    }
    const btnCancelZone = document.getElementById('btn-cancel-zone');
    if (btnCancelZone) {
        btnCancelZone.addEventListener('click', fecharModalZone);
    }
    const btnSubmitZone = document.getElementById('btn-submit-zone');
    if (btnSubmitZone) {
        btnSubmitZone.addEventListener('click', salvarNovaZona);
    }

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
        showToast("Nenhum elemento selecionado para rotacionar.", "error");
        return;
    }

    if (selectedElementType === 'desk') {
        const desk = state.desks.find(d => d.id === state.selectedDeskId);
        if (desk) {
            desk.rotation = (desk.rotation + 90) % 360;
            renderApp();
            selecionarElemento(state.selectedDeskId, 'Mesa de Trabalho');
            salvarLayoutNoLocalStorage();
        }
    } else if (selectedElementType === 'door') {
        const door = state.doors.find(d => d.id === state.selectedDeskId);
        if (door) {
            door.rotation = (door.rotation + 45) % 360; // Portas rotacionam em 45 graus
            renderApp();
            selecionarElemento(state.selectedDeskId, 'Porta');
            salvarLayoutNoLocalStorage();
        }
    } else if (selectedElementType === 'fixture') {
        const fix = state.fixtures.find(f => f.id === state.selectedDeskId);
        if (fix) {
            fix.rotation = (fix.rotation + 45) % 360; // Objetos comuns rotacionam em 45 graus
            renderApp();
            const namesMap = { toilet: 'Vaso Sanitário', sink: 'Pia Sanitária', printer: 'Impressora', cafe: 'Copa', table: 'Mesa Reuniões' };
            selecionarElemento(state.selectedDeskId, namesMap[fix.type] || 'Objeto');
            salvarLayoutNoLocalStorage();
        }
    } else {
        showToast("Este tipo de elemento não pode ser rotacionado.", "warning");
    }
}

function removerMesaSelecionada() {
    if (!state.selectedDeskId) {
        showToast("Nenhum elemento selecionado para remover.", "error");
        return;
    }

    const id = state.selectedDeskId;

    if (selectedElementType === 'desk') {
        const deskIndex = state.desks.findIndex(d => d.id === id);
        if (deskIndex !== -1) {
            const employee = state.employees.find(emp => emp.deskId === id);
            if (employee) {
                employee.deskId = null;
                showToast(`${employee.name} retornou ao roster.`, "info");
            }
            state.desks.splice(deskIndex, 1);
            showToast("Mesa de trabalho excluída.", "info");
        }
    } else if (selectedElementType === 'wall') {
        const wallIndex = state.walls.findIndex(w => w.id === id);
        if (wallIndex !== -1) {
            state.walls.splice(wallIndex, 1);
            showToast("Parede excluída.", "info");
        }
    } else if (selectedElementType === 'partition') {
        const partIndex = state.partitions.findIndex(p => p.id === id);
        if (partIndex !== -1) {
            state.partitions.splice(partIndex, 1);
            showToast("Divisória de vidro excluída.", "info");
        }
    } else if (selectedElementType === 'door') {
        const doorIndex = state.doors.findIndex(d => d.id === id);
        if (doorIndex !== -1) {
            state.doors.splice(doorIndex, 1);
            showToast("Porta swing excluída.", "info");
        }
    } else if (selectedElementType === 'fixture') {
        const fixIndex = state.fixtures.findIndex(f => f.id === id);
        if (fixIndex !== -1) {
            state.fixtures.splice(fixIndex, 1);
            showToast("Objeto excluído.", "info");
        }
    } else if (selectedElementType === 'zone') {
        const zoneIndex = state.sectorZones.findIndex(z => z.id === id);
        if (zoneIndex !== -1) {
            state.sectorZones.splice(zoneIndex, 1);
            showToast("Área de setor excluída.", "info");
        }
    }

    state.selectedDeskId = null;
    selectedElementType = null;
    const indicator = document.getElementById('selected-element-indicator');
    if (indicator) indicator.textContent = 'Selecione um item';
    
    renderApp();
    salvarLayoutNoLocalStorage();
}

// --- CONTROLE DE ZONAS E ÁREAS DE SETOR (MODAIS) ---
function abrirModalZone() {
    const select = document.getElementById('new-zone-sector');
    if (select) {
        select.innerHTML = state.sectors.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }
    if (modalZone) modalZone.classList.add('open');
}

function fecharModalZone() {
    if (modalZone) modalZone.classList.remove('open');
    state.drawingStart = null;
    removerLinhaGuia();
}

function salvarNovaZona() {
    const select = document.getElementById('new-zone-sector');
    if (!select || !window.pendingZoneRect) return;

    const sectorId = parseInt(select.value);
    const newZone = {
        id: `zone-${Date.now()}`,
        sectorId: sectorId,
        x: window.pendingZoneRect.x,
        y: window.pendingZoneRect.y,
        w: window.pendingZoneRect.w,
        h: window.pendingZoneRect.h
    };

    if (!state.sectorZones) {
        state.sectorZones = [];
    }
    state.sectorZones.push(newZone);

    fecharModalZone();
    salvarLayoutNoLocalStorage();
    renderApp();
    showToast("Área de setor adicionada com sucesso!", "success");
    setDesignerTool('select');
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
    if (!supabaseRH) {
        console.warn("Supabase não disponível. Iniciando no modo de armazenamento LocalStorage.");
        carregarLayoutDoLocalStorage();
        return;
    }

    try {
        const { data, error } = await supabaseRH
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
            state.walls = activeLayout.data.walls || [...DEFAULT_WALLS];
            state.partitions = activeLayout.data.partitions || [...DEFAULT_PARTITIONS];
            state.doors = activeLayout.data.doors || [...DEFAULT_DOORS];
            state.fixtures = activeLayout.data.fixtures || [...DEFAULT_FIXTURES];
            state.sectorZones = activeLayout.data.sectorZones || [...DEFAULT_SECTOR_ZONES];
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
    state.walls = layout.data.walls || [...DEFAULT_WALLS];
    state.partitions = layout.data.partitions || [...DEFAULT_PARTITIONS];
    state.doors = layout.data.doors || [...DEFAULT_DOORS];
    state.fixtures = layout.data.fixtures || [...DEFAULT_FIXTURES];
    state.sectorZones = layout.data.sectorZones || [...DEFAULT_SECTOR_ZONES];

    // Limpa seleções
    state.selectedDeskId = null;
    slideOver.classList.remove('open');

    renderApp();
    showToast(`Carregado layout: ${layout.name}`, "success");
}

async function salvarLayoutNoSupabase() {
    if (!supabaseRH) {
        showToast("Conexão Supabase indisponível. Salvo localmente.", "warning");
        salvarLayoutNoLocalStorage();
        return;
    }

    const layoutData = {
        sectors: state.sectors,
        desks: state.desks,
        employees: state.employees,
        walls: state.walls,
        partitions: state.partitions,
        doors: state.doors,
        fixtures: state.fixtures,
        sectorZones: state.sectorZones
    };

    try {
        if (state.layoutId === 'default') {
            // Se está no default, pede nome para salvar na nuvem
            const name = prompt("Digite um nome para salvar este layout no Supabase:", "Layout Principal JLE");
            if (!name) return;

            const { data, error } = await supabaseRH
                .from('jle_office_layouts')
                .insert([{ name: name, data: layoutData, is_active: true }])
                .select();

            if (error) throw error;

            showToast("Layout criado e salvo no Supabase!", "success");
            await carregarLayoutsDoSupabase();
        } else {
            // Atualiza o layout aberto na nuvem
            const { error } = await supabaseRH
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
        employees: [],
        walls: [],
        partitions: [],
        doors: [],
        fixtures: [],
        sectorZones: []
    };

    if (base === 'current') {
        layoutData.desks = JSON.parse(JSON.stringify(state.desks));
        layoutData.employees = JSON.parse(JSON.stringify(state.employees));
        layoutData.walls = JSON.parse(JSON.stringify(state.walls));
        layoutData.partitions = JSON.parse(JSON.stringify(state.partitions));
        layoutData.doors = JSON.parse(JSON.stringify(state.doors));
        layoutData.fixtures = JSON.parse(JSON.stringify(state.fixtures));
        layoutData.sectorZones = JSON.parse(JSON.stringify(state.sectorZones));
    } else {
        // Mantém somente os setores padrão e as estruturas físicas do seed
        layoutData.sectors = [...DEFAULT_SECTORS];
        layoutData.walls = [...DEFAULT_WALLS];
        layoutData.partitions = [...DEFAULT_PARTITIONS];
        layoutData.doors = [...DEFAULT_DOORS];
        layoutData.fixtures = [...DEFAULT_FIXTURES];
        layoutData.sectorZones = [...DEFAULT_SECTOR_ZONES];
    }

    modalLayout.classList.remove('open');

    if (!supabaseRH) {
        // Modo local
        state.layoutId = `local-${Date.now()}`;
        state.layoutName = name;
        state.desks = layoutData.desks;
        state.employees = layoutData.employees;
        state.sectors = layoutData.sectors;
        state.walls = layoutData.walls;
        state.partitions = layoutData.partitions;
        state.doors = layoutData.doors;
        state.fixtures = layoutData.fixtures;
        state.sectorZones = layoutData.sectorZones;
        
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
        const { data, error } = await supabaseRH
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
        employees: state.employees,
        walls: state.walls,
        partitions: state.partitions,
        doors: state.doors,
        fixtures: state.fixtures,
        sectorZones: state.sectorZones
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
            state.walls = parsed.walls || [...DEFAULT_WALLS];
            state.partitions = parsed.partitions || [...DEFAULT_PARTITIONS];
            state.doors = parsed.doors || [...DEFAULT_DOORS];
            state.fixtures = parsed.fixtures || [...DEFAULT_FIXTURES];
            state.sectorZones = parsed.sectorZones || [...DEFAULT_SECTOR_ZONES];
            console.log("Layout local restaurado do LocalStorage");
        } catch (e) {
            console.error("Erro ao ler LocalStorage:", e);
        }
    } else {
        // Primeira carga limpa
        state.walls = [...DEFAULT_WALLS];
        state.partitions = [...DEFAULT_PARTITIONS];
        state.doors = [...DEFAULT_DOORS];
        state.fixtures = [...DEFAULT_FIXTURES];
        state.sectorZones = [...DEFAULT_SECTOR_ZONES];
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
