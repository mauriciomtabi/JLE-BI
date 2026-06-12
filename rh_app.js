// JLE Office Layout Manager - Lógica Principal (Reconstrução Limpa: Paredes Polyline)

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

// --- ESTADO GLOBAL DA APLICAÇÃO ---
let state = {
    layoutId: 'single-global-layout',
    layoutName: 'Layout Principal JLE',
    walls: [],
    isDesignerMode: false,
    selectedWallId: null,
    activeTool: 'select', // 'select', 'draw-wall'
    drawingStart: null
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

// Variáveis de controle de desenho e mouse
let lastMouseClientX = 0;
let lastMouseClientY = 0;
let shiftPressed = false;
let handleDragState = null; // { wallId, propX: 'x1'|'x2', propY: 'y1'|'y2' }

// Monitorar tecla Shift
window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') {
        shiftPressed = true;
        if (state.activeTool === 'draw-wall' && state.drawingStart) {
            atualizarPreviewDesenho();
            atualizarSnapIndicator();
        }
    }
    // Deletar ou voltar
    if (state.isDesignerMode) {
        if (state.selectedWallId && (e.key === 'Delete' || e.key === 'Backspace')) {
            excluirParedeSelecionada();
        }
        if (e.key === 'Escape') {
            cancelarDesenho();
        }
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
        shiftPressed = false;
        if (state.activeTool === 'draw-wall' && state.drawingStart) {
            atualizarPreviewDesenho();
            atualizarSnapIndicator();
        }
    }
});

// --- MAPEAMENTO DE COORDENADAS SVG ---
function obterCoordenadasSVG(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const globalPoint = pt.matrixTransform(panZoomGroup.getScreenCTM().inverse());
    return {
        x: globalPoint.x,
        y: globalPoint.y
    };
}

// Obter coordenadas ajustadas ao Grid e Snapping Híbrido + Trava Ortogonal
function obterCoordenadasAjustadas(clientX, clientY, ignoreOrtho = false, ignoreWallId = null) {
    let raw = obterCoordenadasSVG(clientX, clientY);
    let x = raw.x;
    let y = raw.y;
    
    // 1. Grid Snap (10px)
    x = Math.round(x / 10) * 10;
    y = Math.round(y / 10) * 10;
    
    // 2. Snap Híbrido: Snapping nas pontas de paredes existentes (dentro de 15px de raio)
    let bestSnap = null;
    let minDistance = 15;
    
    state.walls.forEach(w => {
        if (ignoreWallId && w.id === ignoreWallId) return;
        
        let d1 = Math.hypot(raw.x - w.x1, raw.y - w.y1);
        if (d1 < minDistance) {
            minDistance = d1;
            bestSnap = { x: w.x1, y: w.y1 };
        }
        let d2 = Math.hypot(raw.x - w.x2, raw.y - w.y2);
        if (d2 < minDistance) {
            minDistance = d2;
            bestSnap = { x: w.x2, y: w.y2 };
        }
    });
    
    if (bestSnap) {
        x = bestSnap.x;
        y = bestSnap.y;
    }
    
    // 3. Trava Ortogonal (horizontal/vertical a 90° em relação ao drawingStart se SHIFT não estiver pressionado)
    if (state.drawingStart && !ignoreOrtho && !shiftPressed) {
        let dx = Math.abs(x - state.drawingStart.x);
        let dy = Math.abs(y - state.drawingStart.y);
        
        if (dx > dy) {
            y = state.drawingStart.y;
        } else {
            x = state.drawingStart.x;
        }
    }
    
    return { x, y };
}

// --- FUNÇÕES DE DESENHO (CAD PREVIEWS) ---
function garantirLinhaGuia() {
    let preview = document.getElementById('svg-drawing-preview');
    if (!preview) {
        preview = document.createElementNS("http://www.w3.org/2000/svg", "line");
        preview.setAttribute('id', 'svg-drawing-preview');
        preview.setAttribute('class', 'svg-drawing-preview');
        preview.setAttribute('stroke', '#0077aa');
        preview.setAttribute('stroke-width', '4');
        preview.setAttribute('stroke-dasharray', '5,5');
        preview.setAttribute('display', 'none');
        preview.setAttribute('style', 'pointer-events: none;');
        panZoomGroup.appendChild(preview);
    }
}

function garantizarSnapIndicator() {
    let dot = document.getElementById('svg-snap-indicator');
    if (!dot) {
        dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute('id', 'svg-snap-indicator');
        dot.setAttribute('r', '5');
        dot.setAttribute('fill', '#0077aa');
        dot.setAttribute('display', 'none');
        dot.setAttribute('style', 'pointer-events: none;');
        panZoomGroup.appendChild(dot);
    }
}

function garantirAlignmentGuidesGroup() {
    let g = document.getElementById('svg-alignment-guides');
    if (!g) {
        g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute('id', 'svg-alignment-guides');
        const staticWalls = document.getElementById('svg-walls-static');
        if (staticWalls) {
            panZoomGroup.insertBefore(g, staticWalls);
        } else {
            panZoomGroup.appendChild(g);
        }
    }
    return g;
}

function criarLinhaGuia(parent, x1, y1, x2, y2) {
    if (x1 === x2 && y1 === y2) return;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", "#2ecc71"); // green alignment guide
    line.setAttribute("stroke-width", "1.5");
    line.setAttribute("stroke-dasharray", "4,4");
    line.setAttribute("style", "pointer-events: none;");
    parent.appendChild(line);
}

function atualizarGuiasDeAlinhamento(pt, ignoreWallId = null) {
    const g = garantirAlignmentGuidesGroup();
    g.innerHTML = '';
    
    if (state.activeTool !== 'draw-wall' && !handleDragState) return;
    
    let matchedX = false;
    let matchedY = false;
    
    state.walls.forEach(w => {
        if (ignoreWallId && w.id === ignoreWallId) return;
        
        // Alignment with w.x1 / w.y1
        if (pt.x === w.x1 && !matchedX) {
            criarLinhaGuia(g, pt.x, pt.y, w.x1, w.y1);
            matchedX = true;
        }
        if (pt.y === w.y1 && !matchedY) {
            criarLinhaGuia(g, pt.x, pt.y, w.x1, w.y1);
            matchedY = true;
        }
        
        // Alignment with w.x2 / w.y2
        if (pt.x === w.x2 && !matchedX) {
            criarLinhaGuia(g, pt.x, pt.y, w.x2, w.y2);
            matchedX = true;
        }
        if (pt.y === w.y2 && !matchedY) {
            criarLinhaGuia(g, pt.x, pt.y, w.x2, w.y2);
            matchedY = true;
        }
    });
}

function atualizarPreviewDesenho() {
    const preview = document.getElementById('svg-drawing-preview');
    if (!preview) return;
    
    if (state.activeTool === 'draw-wall' && state.drawingStart) {
        let endPoint = obterCoordenadasAjustadas(lastMouseClientX, lastMouseClientY);
        preview.setAttribute('x1', state.drawingStart.x);
        preview.setAttribute('y1', state.drawingStart.y);
        preview.setAttribute('x2', endPoint.x);
        preview.setAttribute('y2', endPoint.y);
        preview.setAttribute('display', 'block');
    } else {
        preview.setAttribute('display', 'none');
    }
}

function atualizarSnapIndicator() {
    const dot = document.getElementById('svg-snap-indicator');
    if (!dot) return;
    
    if (state.activeTool === 'draw-wall') {
        let pt = obterCoordenadasAjustadas(lastMouseClientX, lastMouseClientY);
        dot.setAttribute('cx', pt.x);
        dot.setAttribute('cy', pt.y);
        dot.setAttribute('display', 'block');
    } else {
        dot.setAttribute('display', 'none');
    }
}

function cancelarDesenho() {
    state.drawingStart = null;
    const preview = document.getElementById('svg-drawing-preview');
    if (preview) preview.setAttribute('display', 'none');
    const dot = document.getElementById('svg-snap-indicator');
    if (dot) dot.setAttribute('display', 'none');
    const g = document.getElementById('svg-alignment-guides');
    if (g) g.innerHTML = '';
}

// --- CONFIGURAÇÃO DE TRANSLATE & ZOOM DO CANVAS ---
function aplicarPanZoom() {
    panZoomGroup.setAttribute('transform', `translate(${zoomState.x}, ${zoomState.y}) scale(${zoomState.scale})`);
}

function zoomAt(clientX, clientY, factor) {
    const mousePos = obterCoordenadasSVG(clientX, clientY);
    const oldScale = zoomState.scale;
    let newScale = oldScale * factor;
    newScale = Math.max(0.2, Math.min(10, newScale));
    
    zoomState.x = mousePos.x * (oldScale - newScale) + zoomState.x;
    zoomState.y = mousePos.y * (oldScale - newScale) + zoomState.y;
    zoomState.scale = newScale;
    aplicarPanZoom();
}

function resetZoom() {
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width / 1200;
    const scaleY = rect.height / 800;
    zoomState.scale = Math.min(scaleX, scaleY) * 0.95;
    zoomState.x = (rect.width - 1200 * zoomState.scale) / 2;
    zoomState.y = (rect.height - 800 * zoomState.scale) / 2;
    aplicarPanZoom();
}

function configurarEventosPanZoom() {
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    svg.addEventListener('mousedown', (e) => {
        const isMiddleClick = e.button === 1;
        const isRightClick = e.button === 2;
        const isSelectTool = state.activeTool === 'select';
        
        if (state.activeTool === 'draw-wall' && isRightClick) {
            cancelarDesenho();
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (isMiddleClick || isRightClick || (isSelectTool && !e.target.closest('.designer-editable') && !e.target.closest('.svg-wall-handle'))) {
            isDragging = true;
            startX = e.clientX - zoomState.x;
            startY = e.clientY - zoomState.y;
            svg.classList.add('grabbing');
            e.preventDefault();
        }
    });

    svg.addEventListener('mousemove', (e) => {
        lastMouseClientX = e.clientX;
        lastMouseClientY = e.clientY;
        
        if (handleDragState) {
            let pt = obterCoordenadasAjustadas(e.clientX, e.clientY, true, handleDragState.wallId);
            const wall = state.walls.find(w => w.id === handleDragState.wallId);
            if (wall) {
                wall[handleDragState.propX] = pt.x;
                wall[handleDragState.propY] = pt.y;
                atualizarGuiasDeAlinhamento(pt, handleDragState.wallId);
                renderApp();
            }
        } else if (isDragging) {
            zoomState.x = e.clientX - startX;
            zoomState.y = e.clientY - startY;
            aplicarPanZoom();
        } else if (state.activeTool === 'draw-wall') {
            let pt = obterCoordenadasAjustadas(e.clientX, e.clientY);
            atualizarPreviewDesenho();
            atualizarSnapIndicator();
            atualizarGuiasDeAlinhamento(pt);
        }
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        svg.classList.remove('grabbing');
        
        if (handleDragState) {
            const wall = state.walls.find(w => w.id === handleDragState.wallId);
            if (wall && wall.x1 === wall.x2 && wall.y1 === wall.y2) {
                state.walls = state.walls.filter(w => w.id !== handleDragState.wallId);
                selecionarParede(null);
                showToast("Parede encurtada até zero e excluída.", "info");
            }
            salvarLayoutNoLocalStorage();
            salvarLayoutNoSupabase();
            
            // Clear alignment guides
            const g = document.getElementById('svg-alignment-guides');
            if (g) g.innerHTML = '';
            
            handleDragState = null;
            renderApp();
        }
    });

    svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = 1.1;
        let factor = e.deltaY < 0 ? zoomFactor : (1 / zoomFactor);
        zoomAt(e.clientX, e.clientY, factor);
    });

    svg.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
}

// --- INTERAÇÕES DO CANVAS (CLIQUES E EDICÃO) ---
svg.addEventListener('click', (e) => {
    if (e.button !== 0) return; // apenas botão esquerdo
    
    if (state.activeTool === 'draw-wall') {
        let pt = obterCoordenadasAjustadas(e.clientX, e.clientY);
        
        if (!state.drawingStart) {
            state.drawingStart = { x: pt.x, y: pt.y };
            atualizarPreviewDesenho();
            atualizarSnapIndicator();
        } else {
            if (pt.x === state.drawingStart.x && pt.y === state.drawingStart.y) {
                return;
            }
            
            const wallId = `wall-${Date.now()}`;
            const newWall = {
                id: wallId,
                x1: state.drawingStart.x,
                y1: state.drawingStart.y,
                x2: pt.x,
                y2: pt.y
            };
            state.walls.push(newWall);
            
            // Continuidade do desenho Polyline: o fim desse segmento é o início do próximo
            state.drawingStart = { x: pt.x, y: pt.y };
            
            salvarLayoutNoLocalStorage();
            salvarLayoutNoSupabase();
            renderApp();
            
            atualizarPreviewDesenho();
            atualizarSnapIndicator();
        }
    } else if (state.activeTool === 'select') {
        if (e.target === svg || e.target === document.getElementById('svg-background-image') || e.target.id === 'pan-zoom-group') {
            selecionarParede(null);
        }
    }
});

// --- EXCLUSÃO E SELECÃO DE ELEMENTOS ---
function selecionarParede(id) {
    state.selectedWallId = id;
    const indicator = document.getElementById('selected-element-indicator');
    if (indicator) {
        if (id) {
            indicator.textContent = `Parede Selecionada (${id})`;
        } else {
            indicator.textContent = 'Selecione um item';
        }
    }
    renderApp();
}

function excluirParedeSelecionada() {
    if (!state.selectedWallId) return;
    
    const index = state.walls.findIndex(w => w.id === state.selectedWallId);
    if (index !== -1) {
        state.walls.splice(index, 1);
        showToast("Parede excluída.", "info");
        selecionarParede(null);
        salvarLayoutNoLocalStorage();
        salvarLayoutNoSupabase();
        renderApp();
    }
}

// --- PERSISTÊNCIA SUPABASE & LOCAL STORAGE ---
function salvarLayoutNoLocalStorage() {
    const dataToSave = {
        layoutId: state.layoutId,
        layoutName: state.layoutName,
        walls: state.walls
    };
    localStorage.setItem('jle_office_layout_local', JSON.stringify(dataToSave));
}

function carregarLayoutDoLocalStorage() {
    const local = localStorage.getItem('jle_office_layout_local');
    if (local) {
        try {
            const parsed = JSON.parse(local);
            state.walls = parsed.walls || [];
            console.log("LocalStorage carregado:", state.walls.length, "paredes");
        } catch (e) {
            console.error("Erro ao ler LocalStorage:", e);
        }
    } else {
        state.walls = [];
    }
}

async function carregarLayoutsDoSupabase() {
    if (!supabaseRH) {
        carregarLayoutDoLocalStorage();
        return;
    }
    try {
        const { data, error } = await supabaseRH
            .from('jle_office_layouts')
            .select('*')
            .eq('id', state.layoutId);

        if (error) {
            console.error("Erro ao ler tabela do Supabase:", error);
            carregarLayoutDoLocalStorage();
            return;
        }

        if (data && data.length > 0) {
            const activeLayout = data[0];
            state.walls = activeLayout.data.walls || [];
            console.log("Supabase carregado:", state.walls.length, "paredes");
            salvarLayoutNoLocalStorage();
        } else {
            console.log("Nenhum layout remoto encontrado. Usando dados locais.");
            carregarLayoutDoLocalStorage();
        }
    } catch (err) {
        console.error("Exceção Supabase. Rodando localmente:", err);
        carregarLayoutDoLocalStorage();
    }
}

async function salvarLayoutNoSupabase() {
    if (!supabaseRH) return;
    
    const layoutData = {
        walls: state.walls
    };

    try {
        const { error } = await supabaseRH
            .from('jle_office_layouts')
            .upsert({
                id: state.layoutId,
                name: state.layoutName,
                data: layoutData,
                updated_at: new Date().toISOString()
            });

        if (error) {
            console.error("Erro ao gravar no Supabase:", error);
        }
    } catch (err) {
        console.error("Erro ao gravar no Supabase:", err);
    }
}

function iniciarArrastoHandle(wallId, propX, propY) {
    handleDragState = {
        wallId: wallId,
        propX: propX,
        propY: propY
    };
    svg.classList.add('grabbing');
}

function splitWallAt(wallId, clientX, clientY) {
    const wall = state.walls.find(w => w.id === wallId);
    if (!wall) return;
    
    // Obter ponto cru em coordenadas SVG
    const pt = obterCoordenadasSVG(clientX, clientY);
    
    // Projeção do ponto pt no segmento da parede (x1, y1) -> (x2, y2)
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const lenSq = dx * dx + dy * dy;
    
    if (lenSq === 0) return;
    
    // Fator de projeção t
    let t = ((pt.x - wall.x1) * dx + (pt.y - wall.y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t)); // limitar ao segmento
    
    // Coordenadas projetadas
    let projX = wall.x1 + t * dx;
    let projY = wall.y1 + t * dy;
    
    // Snap de 10px ao grid
    projX = Math.round(projX / 10) * 10;
    projY = Math.round(projY / 10) * 10;
    
    // Verificar se o ponto de corte coincide com uma das extremidades
    const atStart = projX === wall.x1 && projY === wall.y1;
    const atEnd = projX === wall.x2 && projY === wall.y2;
    
    if (atStart || atEnd) {
        showToast("Não é possível dividir a parede nas extremidades.", "warning");
        return;
    }
    
    // Criar duas novas paredes
    const wallA = {
        id: `wall-${Date.now()}-a`,
        x1: wall.x1,
        y1: wall.y1,
        x2: projX,
        y2: projY
    };
    
    const wallB = {
        id: `wall-${Date.now()}-b`,
        x1: projX,
        y1: projY,
        x2: wall.x2,
        y2: wall.y2
    };
    
    // Remover a parede antiga e empurrar os novos segmentos
    state.walls = state.walls.filter(w => w.id !== wallId);
    state.walls.push(wallA);
    state.walls.push(wallB);
    
    selecionarParede(null);
    salvarLayoutNoLocalStorage();
    salvarLayoutNoSupabase();
    renderApp();
    
    showToast("Parede dividida em dois segmentos.", "success");
}

// --- RENDERIZAÇÃO VETORIAL ---
function renderStructuralElements() {
    const wallsGroup = document.getElementById('svg-walls-static');
    if (!wallsGroup) return;
    wallsGroup.innerHTML = '';
    
    state.walls.forEach(w => {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", w.x1);
        line.setAttribute("y1", w.y1);
        line.setAttribute("x2", w.x2);
        line.setAttribute("y2", w.y2);
        
        let cls = "svg-wall";
        if (state.isDesignerMode) cls += " designer-editable";
        if (state.selectedWallId === w.id) cls += " selected";
        line.setAttribute("class", cls);
        line.setAttribute("id", w.id);
        
        if (state.isDesignerMode) {
            line.addEventListener('click', (e) => {
                if (state.activeTool === 'select') {
                    e.stopPropagation();
                    selecionarParede(w.id);
                }
            });
            
            // Duplo clique para dividir a parede
            line.addEventListener('dblclick', (e) => {
                if (state.activeTool === 'select') {
                    e.stopPropagation();
                    splitWallAt(w.id, e.clientX, e.clientY);
                }
            });
        }
        wallsGroup.appendChild(line);
        
        // Círculos marcadores nas extremidades se estiver selecionada
        if (state.selectedWallId === w.id && state.isDesignerMode) {
            const c1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            c1.setAttribute("cx", w.x1);
            c1.setAttribute("cy", w.y1);
            c1.setAttribute("r", "6");
            c1.setAttribute("class", "svg-wall-handle");
            
            c1.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                iniciarArrastoHandle(w.id, 'x1', 'y1');
            });
            
            const c2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            c2.setAttribute("cx", w.x2);
            c2.setAttribute("cy", w.y2);
            c2.setAttribute("r", "6");
            c2.setAttribute("class", "svg-wall-handle");
            
            c2.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                iniciarArrastoHandle(w.id, 'x2', 'y2');
            });
            
            wallsGroup.appendChild(c1);
            wallsGroup.appendChild(c2);
        }
    });
}

function renderApp() {
    renderStructuralElements();
    
    // Ocultar elementos de legenda / outras métricas desnecessárias
    const legend = document.getElementById('canvas-legend');
    if (legend) legend.style.display = 'none';
    
    const activeLayoutDesc = document.getElementById('active-layout-desc');
    if (activeLayoutDesc) activeLayoutDesc.style.display = 'none';
    
    const svgDesks = document.getElementById('svg-desks-dynamic');
    if (svgDesks) svgDesks.innerHTML = '';
    
    const svgSectors = document.getElementById('svg-sectors-background');
    if (svgSectors) svgSectors.innerHTML = '';
}

// --- GERENCIAMENTO DO MODO DESIGNER E SIDEBARS ---
function alternarModo(isDesigner) {
    state.isDesignerMode = isDesigner;
    
    const btnView = document.getElementById('btn-mode-view');
    const btnDesign = document.getElementById('btn-mode-design');
    const sidebar = document.querySelector('.rh-sub-sidebar');
    const toolbar = document.getElementById('designer-toolbar');
    
    if (isDesigner) {
        btnView.classList.remove('active');
        btnDesign.classList.add('active');
        sidebar.style.display = 'flex';
        
        document.getElementById('rh-roster-panel').style.display = 'none';
        document.getElementById('rh-roster-footer').style.display = 'none';
        document.getElementById('designer-element-palette').style.display = 'block';
        
        toolbar.style.display = 'flex';
        setDesignerTool('select');
    } else {
        btnView.classList.add('active');
        btnDesign.classList.remove('active');
        sidebar.style.display = 'none';
        
        toolbar.style.display = 'none';
        cancelarDesenho();
        state.selectedWallId = null;
    }
    
    renderApp();
}

window.setDesignerTool = function(toolName) {
    state.activeTool = toolName;
    cancelarDesenho();
    state.selectedWallId = null;
    
    document.querySelectorAll('.palette-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`tool-${toolName}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    renderApp();
    atualizarPreviewDesenho();
    atualizarSnapIndicator();
};

function configurarEventosInterface() {
    document.getElementById('btn-mode-view').addEventListener('click', () => {
        alternarModo(false);
    });
    
    document.getElementById('btn-mode-design').addEventListener('click', () => {
        alternarModo(true);
    });
    
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        const rect = svg.getBoundingClientRect();
        zoomAt(rect.width / 2, rect.height / 2, 1.2);
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        const rect = svg.getBoundingClientRect();
        zoomAt(rect.width / 2, rect.height / 2, 1 / 1.2);
    });
    document.getElementById('btn-zoom-reset').addEventListener('click', () => {
        resetZoom();
    });
    
    document.getElementById('btn-toggle-original').addEventListener('click', () => {
        const bgImg = document.getElementById('svg-background-image');
        if (bgImg) {
            if (bgImg.style.display === 'none') {
                bgImg.style.display = 'block';
                showToast("Planta de fundo exibida", "success");
            } else {
                bgImg.style.display = 'none';
                showToast("Planta de fundo oculta", "info");
            }
        }
    });
    
    document.getElementById('btn-delete-desk').addEventListener('click', () => {
        excluirParedeSelecionada();
    });
    
    const rotateBtn = document.getElementById('btn-rotate-desk');
    if (rotateBtn) rotateBtn.style.display = 'none';
}

// --- UTILITÁRIO: TOAST NOTIFICATIONS ---
function showToast(message, type = "info") {
    const container = document.getElementById('toast-container');
    if (!container) {
        // Criar container de toast se não existir
        const newContainer = document.createElement('div');
        newContainer.setAttribute('id', 'toast-container');
        newContainer.className = 'toast-container';
        newContainer.setAttribute('style', 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;');
        document.body.appendChild(newContainer);
    }
    const targetContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('style', 'background: #1e2d3b; color: #fff; padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 10px; min-width: 200px; animation: slideInRight 0.3s ease;');
    
    let icon = '<i class="fa-solid fa-circle-info" style="color: #4cc9f0;"></i>';
    if (type === 'success') icon = '<i class="fa-solid fa-circle-check" style="color: #2ecc71;"></i>';
    if (type === 'error') icon = '<i class="fa-solid fa-triangle-exclamation" style="color: #e74c3c;"></i>';
    if (type === 'warning') icon = '<i class="fa-solid fa-pen-ruler" style="color: #f1c40f;"></i>';

    toast.innerHTML = `${icon}<span>${message}</span>`;
    targetContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// --- INICIALIZAÇÃO DA APLICAÇÃO ---
async function iniciarAplicacao() {
    const CLEAN_REBUILD_FLAG = 'jle_office_layout_rebuilt_v1';
    if (!localStorage.getItem(CLEAN_REBUILD_FLAG)) {
        localStorage.removeItem('jle_office_layout_local');
        localStorage.setItem(CLEAN_REBUILD_FLAG, 'true');
    }

    configurarEventosInterface();
    configurarEventosPanZoom();
    
    garantirLinhaGuia();
    garantirSnapIndicator();
    
    // Inicia com Visualização ativa por padrão (sidebar oculta, mapa 100% de largura)
    alternarModo(false);
    
    carregarLayoutDoLocalStorage();
    renderApp();
    
    await carregarLayoutsDoSupabase();
    renderApp();
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', iniciarAplicacao);
} else {
    iniciarAplicacao();
}

window.renderRHApp = renderApp;
