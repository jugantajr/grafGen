const canvas = document.getElementById('graphCanvas');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;
document.getElementById('canvas-container').style.position = 'relative';

// Global error handlers: log full stack and attempt graceful recovery so UI doesn't remain frozen
window.addEventListener('error', (ev) => {
    try {
        console.error('Captured error:', ev.message, ev.filename + ':' + ev.lineno + ':' + ev.colno);
        if (ev.error && ev.error.stack) console.error(ev.error.stack);
        // Attempt to clean up transient UI state that may block interactions
        setTimeout(() => {
            try {
                const inp = document.getElementById('inline-text-editor'); if (inp && inp.isConnected) inp.remove();
                const menu = document.getElementById('context-menu'); if (menu) menu.style.display = 'none';
                if (window._generateCodeTimer) { clearTimeout(window._generateCodeTimer); window._generateCodeTimer = null; }
                if (typeof draw === 'function') draw();
            } catch (cleanupErr) { console.error('Recovery cleanup failed:', cleanupErr); }
        }, 50);
    } catch (logErr) { console.error('Error in global error handler:', logErr); }
});

window.addEventListener('unhandledrejection', (ev) => {
    try {
        console.error('Unhandled promise rejection:', ev.reason);
        setTimeout(() => { try { const inp = document.getElementById('inline-text-editor'); if (inp && inp.isConnected) inp.remove(); if (typeof draw === 'function') draw(); } catch(e){console.error(e);} }, 50);
    } catch(e) { console.error('Error in unhandledrejection handler:', e); }
});

const baseUnitSize = 50; 
let canvasWidth = 600; let canvasHeight = 600;
let originX = canvasWidth / 2; let originY = canvasHeight / 2;
window.zoom = 1.0;

const resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
        const newWidth = entry.contentRect.width; const newHeight = entry.contentRect.height;
        if (canvasWidth !== 600) { originX += (newWidth - canvasWidth) / 2; originY += (newHeight - canvasHeight) / 2; } 
        else { originX = newWidth / 2; originY = newHeight / 2; }
        canvasWidth = newWidth; canvasHeight = newHeight;
        canvas.width = canvasWidth * dpr; canvas.height = canvasHeight * dpr;
        canvas.style.width = canvasWidth + 'px'; canvas.style.height = canvasHeight + 'px';
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);
        if (typeof draw === 'function') draw();
    }
});
resizeObserver.observe(document.getElementById('canvas-container'));

window.points = []; window.edges = []; window.texts = []; window.regions = [];
window.plots = [];
window.pointIdCounter = 0; window.edgeIdCounter = 0; window.textIdCounter = 0; window.regionIdCounter = 0;
window.plotIdCounter = 0;

let historyState = []; let historyIndex = -1;

// NEW: Lasso Tracking Variables
let isLassoing = false;
let lassoPath = [];

window.saveState = function() {
    if (historyIndex < historyState.length - 1) historyState = historyState.slice(0, historyIndex + 1);
    historyState.push(JSON.stringify({
        points: window.points, edges: window.edges, texts: window.texts, regions: window.regions, plots: window.plots,
        pId: window.pointIdCounter, eId: window.edgeIdCounter, tId: window.textIdCounter, rId: window.regionIdCounter, plId: window.plotIdCounter
    }));
    historyIndex++;
};

window.undo = function() {
    if (historyIndex > 0) {
        historyIndex--; let state = JSON.parse(historyState[historyIndex]);
        window.points = state.points; window.edges = state.edges; window.texts = state.texts; window.regions = state.regions || []; window.plots = state.plots || [];
        window.pointIdCounter = state.pId; window.edgeIdCounter = state.eId; window.textIdCounter = state.tId; window.regionIdCounter = state.rId || 0; window.plotIdCounter = state.plId || 0;
        window.selectedPointIds = []; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = []; updatePropertyPanel(); draw();
    }
};

window.redo = function() {
    if (historyIndex < historyState.length - 1) {
        historyIndex++; let state = JSON.parse(historyState[historyIndex]);
        window.points = state.points; window.edges = state.edges; window.texts = state.texts; window.regions = state.regions || []; window.plots = state.plots || [];
        window.pointIdCounter = state.pId; window.edgeIdCounter = state.eId; window.textIdCounter = state.tId; window.regionIdCounter = state.rId || 0; window.plotIdCounter = state.plId || 0;
        window.selectedPointIds = []; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = []; updatePropertyPanel(); draw();
    }
};

let currentMode = 'point'; 
window.selectedPointIds = []; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = [];
window._selectionClipboard = null;

let isDragging = false; let draggedPointId = null; let draggedTextId = null; let draggedRegionId = null; let lastDragMath = null; 
let isPanning = false; let lastPanX = 0; let lastPanY = 0; let isDrawingRegion = false;
let activeSnapLineX = null; let activeSnapLineY = null;

function clearSelection() {
    window.selectedPointIds = []; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = [];
}

function getSelectionSummary() {
    return {
        points: window.selectedPointIds.slice(),
        edges: window.selectedEdgeIds.slice(),
        texts: window.selectedTextIds.slice(),
        regions: window.selectedRegionIds.slice(),
    };
}

function getSelectionBounds(selection) {
    const pointIds = new Set(selection.points || []);
    const textIds = new Set(selection.texts || []);
    const regionIds = new Set(selection.regions || []);

    const selectedPoints = window.points.filter(p => pointIds.has(p.id));
    const selectedTexts = window.texts.filter(t => textIds.has(t.id));
    const selectedRegions = window.regions.filter(r => regionIds.has(r.id));

    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    selectedPoints.forEach(p => {
        bounds.minX = Math.min(bounds.minX, p.x);
        bounds.maxX = Math.max(bounds.maxX, p.x);
        bounds.minY = Math.min(bounds.minY, p.y);
        bounds.maxY = Math.max(bounds.maxY, p.y);
    });
    selectedTexts.forEach(t => {
        bounds.minX = Math.min(bounds.minX, t.x);
        bounds.maxX = Math.max(bounds.maxX, t.x);
        bounds.minY = Math.min(bounds.minY, t.y);
        bounds.maxY = Math.max(bounds.maxY, t.y);
    });
    selectedRegions.forEach(r => {
        bounds.minX = Math.min(bounds.minX, r.minX);
        bounds.maxX = Math.max(bounds.maxX, r.maxX);
        bounds.minY = Math.min(bounds.minY, r.minY);
        bounds.maxY = Math.max(bounds.maxY, r.maxY);
    });

    if (!Number.isFinite(bounds.minX)) return null;
    return bounds;
}

window.selectConnectedFigure = function() {
    let seedPointIds = [...window.selectedPointIds];

    if (seedPointIds.length === 0 && window.selectedEdgeIds.length > 0) {
        window.selectedEdgeIds.forEach(id => {
            const edge = window.edges.find(e => e.id === id);
            if (!edge) return;
            if (edge.sourceId !== undefined) seedPointIds.push(edge.sourceId);
            if (edge.targetId !== undefined) seedPointIds.push(edge.targetId);
        });
    }

    seedPointIds = [...new Set(seedPointIds)];
    if (seedPointIds.length === 0) return;

    const pointSet = new Set(seedPointIds);
    const queue = [...seedPointIds];

    while (queue.length > 0) {
        const pointId = queue.pop();
        window.edges.forEach(edge => {
            const isGraphEdge = ['line', 'curve', 'loop', 'circle', 'arc', 'elliptic-arc'].includes(edge.type);
            if (!isGraphEdge) return;

            if (edge.sourceId === pointId && edge.targetId !== undefined && !pointSet.has(edge.targetId)) {
                pointSet.add(edge.targetId);
                queue.push(edge.targetId);
            }
            if (edge.targetId === pointId && edge.sourceId !== undefined && !pointSet.has(edge.sourceId)) {
                pointSet.add(edge.sourceId);
                queue.push(edge.sourceId);
            }
        });
    }

    const edgeIds = window.edges
        .filter(edge => {
            const isGraphEdge = ['line', 'curve', 'loop', 'circle', 'arc', 'elliptic-arc'].includes(edge.type);
            if (!isGraphEdge) return false;
            if (edge.sourceId !== undefined && !pointSet.has(edge.sourceId)) return false;
            if (edge.targetId !== undefined && !pointSet.has(edge.targetId)) return false;
            return true;
        })
        .map(edge => edge.id);

    const bounds = getSelectionBounds({ points: [...pointSet], texts: [], regions: [] });
    const textIds = bounds ? window.texts.filter(text => text.x >= bounds.minX - 0.5 && text.x <= bounds.maxX + 0.5 && text.y >= bounds.minY - 0.5 && text.y <= bounds.maxY + 0.5).map(text => text.id) : [];
    const regionIds = bounds ? window.regions.filter(region => region.minX >= bounds.minX - 0.5 && region.maxX <= bounds.maxX + 0.5 && region.minY >= bounds.minY - 0.5 && region.maxY <= bounds.maxY + 0.5).map(region => region.id) : [];

    window.selectedPointIds = [...pointSet];
    window.selectedEdgeIds = edgeIds;
    window.selectedTextIds = textIds;
    window.selectedRegionIds = regionIds;
    if (window.updatePropertyPanel) window.updatePropertyPanel();
    draw();
};

window.copySelection = function() {
    const selection = getSelectionSummary();
    if (selection.points.length === 0 && selection.edges.length === 0 && selection.texts.length === 0 && selection.regions.length === 0) return false;

    const copiedPoints = window.points.filter(point => selection.points.includes(point.id)).map(point => JSON.parse(JSON.stringify(point)));
    const copiedEdges = window.edges.filter(edge => selection.edges.includes(edge.id)).map(edge => JSON.parse(JSON.stringify(edge)));
    const copiedTexts = window.texts.filter(text => selection.texts.includes(text.id)).map(text => JSON.parse(JSON.stringify(text)));
    const copiedRegions = window.regions.filter(region => selection.regions.includes(region.id)).map(region => JSON.parse(JSON.stringify(region)));

    window._selectionClipboard = {
        points: copiedPoints,
        edges: copiedEdges,
        texts: copiedTexts,
        regions: copiedRegions,
        bounds: getSelectionBounds(selection),
        pasteCount: 0,
        sourceSelection: selection,
    };
    return true;
};

window.pasteSelection = function() {
    const clipboard = window._selectionClipboard;
    if (!clipboard) return false;

    const pointIdMap = new Map();
    const pastedPointIds = [];
    const pastedTextIds = [];
    const pastedRegionIds = [];
    const pastedEdgeIds = [];

    const bounds = clipboard.bounds;
    const pasteOffset = bounds ? Math.max(1.5, Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.15) : 1.5;
    const offsetX = pasteOffset * (clipboard.pasteCount + 1);
    const offsetY = -pasteOffset * (clipboard.pasteCount + 1);

    clipboard.points.forEach(point => {
        const newId = window.pointIdCounter++;
        const clone = JSON.parse(JSON.stringify(point));
        clone.id = newId;
        clone.x += offsetX;
        clone.y += offsetY;
        window.points.push(clone);
        pointIdMap.set(point.id, newId);
        pastedPointIds.push(newId);
    });

    clipboard.texts.forEach(text => {
        const newId = window.textIdCounter++;
        const clone = JSON.parse(JSON.stringify(text));
        clone.id = newId;
        clone.x += offsetX;
        clone.y += offsetY;
        window.texts.push(clone);
        pastedTextIds.push(newId);
    });

    clipboard.regions.forEach(region => {
        const newId = window.regionIdCounter++;
        const clone = JSON.parse(JSON.stringify(region));
        clone.id = newId;
        clone.minX += offsetX;
        clone.maxX += offsetX;
        clone.minY += offsetY;
        clone.maxY += offsetY;
        window.regions.push(clone);
        pastedRegionIds.push(newId);
    });

    clipboard.edges.forEach(edge => {
        const newSourceId = edge.sourceId !== undefined ? pointIdMap.get(edge.sourceId) : undefined;
        const newTargetId = edge.targetId !== undefined ? pointIdMap.get(edge.targetId) : undefined;
        const sourceReady = edge.sourceId === undefined || newSourceId !== undefined;
        const targetReady = edge.targetId === undefined || newTargetId !== undefined;
        if (!sourceReady || !targetReady) return;

        const newId = window.edgeIdCounter++;
        const clone = JSON.parse(JSON.stringify(edge));
        clone.id = newId;
        if (newSourceId !== undefined) clone.sourceId = newSourceId;
        if (newTargetId !== undefined) clone.targetId = newTargetId;
        window.edges.push(clone);
        pastedEdgeIds.push(newId);
    });

    clipboard.pasteCount += 1;
    window.selectedPointIds = pastedPointIds;
    window.selectedEdgeIds = pastedEdgeIds;
    window.selectedTextIds = pastedTextIds;
    window.selectedRegionIds = pastedRegionIds;
    saveState();
    if (window.updatePropertyPanel) window.updatePropertyPanel();
    draw();
    return true;
};

function getUnitSize() { return baseUnitSize * window.zoom; }
window.zoomIn = function() { window.zoom *= 1.2; draw(); }
window.zoomOut = function() { window.zoom *= 0.8; draw(); }

function screenToMath(sx, sy, ignoreObjectSnap = false) {
    let u = getUnitSize(); let mx = (sx - originX) / u; let my = (originY - sy) / u;
    activeSnapLineX = null; activeSnapLineY = null;
    if (document.getElementById('snap-grid').checked) { mx = Math.round(mx * 2) / 2; my = Math.round(my * 2) / 2; }
    if (!ignoreObjectSnap && (isDragging || currentMode === 'point')) {
        window.points.forEach(p => {
            if (window.selectedPointIds.includes(p.id)) return;
            if (Math.abs(mx - p.x) < 0.15) { mx = p.x; activeSnapLineX = p.x; }
            if (Math.abs(my - p.y) < 0.15) { my = p.y; activeSnapLineY = p.y; }
        });
    }
    return { x: mx, y: my };
}

function mathToScreen(mx, my) { return { x: originX + (mx * getUnitSize()), y: originY - (my * getUnitSize()) }; }

// Debounced code generation to avoid blocking during rapid interactive changes
window._generateCodeTimer = null;
window.requestGenerateCode = function(delay = 200) {
    if (window._generateCodeTimer) clearTimeout(window._generateCodeTimer);
    window._generateCodeTimer = setTimeout(() => {
        try { if (window.generateCode) window.generateCode(); }
        catch (err) { console.error('generateCode error:', err); }
        window._generateCodeTimer = null;
    }, delay);
};

// Ray-casting algorithm for the Lasso tool
function isPointInPolygon(point, vs) {
    let x = point.x, y = point.y; let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].x, yi = vs[i].y; let xj = vs[j].x, yj = vs[j].y;
        let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

window.untangleGraph = function() {
    if (window.points.length < 2) return;
    
    // 🧲 TIGHTER GRAPH SCALING: Reduced ideal edge length (k) and increased gravity
    let k = 1.5; 
    let temp = 2.0;
    let iterations = 0;
    
    let cx = 0, cy = 0;
    window.points.forEach(p => { cx += p.x; cy += p.y; });
    cx /= window.points.length; cy /= window.points.length;

    function step() {
        let disp = {};
        window.points.forEach(p => disp[p.id] = {x: 0, y: 0});
        
        // Gravity to center (Stronger to keep it compact)
        window.points.forEach(p => { disp[p.id].x += (cx - p.x) * 0.2; disp[p.id].y += (cy - p.y) * 0.2; });

        // Node Repulsion
        for(let i=0; i<window.points.length; i++) {
            for(let j=i+1; j<window.points.length; j++) {
                let u = window.points[i], v = window.points[j];
                let dx = u.x - v.x, dy = u.y - v.y;
                let dist = Math.hypot(dx, dy) || 0.01;
                let force = (k * k) / dist;
                disp[u.id].x += (dx/dist)*force; disp[u.id].y += (dy/dist)*force;
                disp[v.id].x -= (dx/dist)*force; disp[v.id].y -= (dy/dist)*force;
            }
        }
        
        // Edge Attraction
        window.edges.forEach(e => {
            if(['line', 'curve'].includes(e.type)) {
                let u = window.points.find(p => p.id === e.sourceId); let v = window.points.find(p => p.id === e.targetId);
                if(u && v) {
                    let dx = u.x - v.x, dy = u.y - v.y; let dist = Math.hypot(dx, dy) || 0.01;
                    let force = (dist * dist) / k;
                    disp[u.id].x -= (dx/dist)*force; disp[u.id].y -= (dy/dist)*force;
                    disp[v.id].x += (dx/dist)*force; disp[v.id].y += (dy/dist)*force;
                }
            }
        });
        
        // Apply Displacement
        window.points.forEach(p => {
            let dx = disp[p.id].x, dy = disp[p.id].y; let dist = Math.hypot(dx, dy) || 0.01;
            p.x += (dx/dist) * Math.min(dist, temp); p.y += (dy/dist) * Math.min(dist, temp);
        });
        
        temp *= 0.95; 
        draw();
        iterations++;
        
        if (iterations < 60) { requestAnimationFrame(step); } 
        else { saveState(); updatePropertyPanel(); }
    }
    step(); // Start the animation
};


window.setMode = function(mode, keepSelection = false) {
    currentMode = mode; 
    if (!keepSelection) { window.selectedPointIds = []; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = []; }
    document.querySelectorAll('.tool-group button').forEach(btn => btn.classList.remove('active'));
    let btn = document.getElementById(`mode-${mode}`); if(btn) btn.classList.add('active');
    
    if (mode === 'move') canvas.style.cursor = 'grab';
    else if (mode === 'select' || mode === 'paint') canvas.style.cursor = 'pointer';
    else if (mode === 'delete') canvas.style.cursor = 'not-allowed';
    else canvas.style.cursor = 'crosshair';

    if (window.updatePropertyPanel) window.updatePropertyPanel(); draw();
}

function distToSegment(px, py, x1, y1, x2, y2) {
    let l2 = (x2 - x1)**2 + (y2 - y1)**2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

window.applyPropertyToSelection = function(prop, value) {
    let changed = false;
    window.selectedPointIds.forEach(id => { let p = window.points.find(p => p.id === id); if(p) { p[prop] = value; changed = true; } });
    window.selectedEdgeIds.forEach(id => { let e = window.edges.find(e => e.id === id); if(e) { e[prop] = value; changed = true; } });
    window.selectedTextIds.forEach(id => { let t = window.texts.find(t => t.id === id); if(t) { t[prop] = value; changed = true; } });
    window.selectedRegionIds.forEach(id => { let r = window.regions.find(r => r.id === id); if(r) { r[prop] = value; changed = true; } });
    if (changed) { saveState(); draw(); }
};

window.deleteSelected = function() {
    let changed = false;
    if (window.selectedPointIds.length > 0) {
        window.points = window.points.filter(p => !window.selectedPointIds.includes(p.id));
        window.edges = window.edges.filter(e => !window.selectedPointIds.includes(e.sourceId) && !window.selectedPointIds.includes(e.targetId));
        window.selectedPointIds = []; changed = true;
    } 
    if (window.selectedEdgeIds.length > 0) { window.edges = window.edges.filter(e => !window.selectedEdgeIds.includes(e.id)); window.selectedEdgeIds = []; changed = true; }
    if (window.selectedTextIds.length > 0) { window.texts = window.texts.filter(t => !window.selectedTextIds.includes(t.id)); window.selectedTextIds = []; changed = true; }
    if (window.selectedRegionIds.length > 0) { window.regions = window.regions.filter(r => !window.selectedRegionIds.includes(r.id)); window.selectedRegionIds = []; changed = true; }
    if (changed) { saveState(); updatePropertyPanel(); draw(); }
};

window.clearAll = function() {
    if(confirm("Are you sure you want to clear the entire graph?")) {
        window.points = []; window.edges = []; window.texts = []; window.regions = []; window.plots = [];
        window.selectedPointIds = []; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = [];
        window.pointIdCounter = 0; window.edgeIdCounter = 0; window.textIdCounter = 0; window.regionIdCounter = 0; window.plotIdCounter = 0;
        saveState(); updatePropertyPanel(); draw();
    }
};

window.toggleMacroInputs = function() {
    let type = document.getElementById('macro-type').value;
    document.getElementById('macro-m').style.display = (type === 'Km,n' || type === 'Grid') ? 'inline-block' : 'none';
};

window.insertMacro = function() {
    let type = document.getElementById('macro-type').value;
    let n = parseInt(document.getElementById('macro-n').value) || 3; let m = parseInt(document.getElementById('macro-m').value) || 3;
    let r = Math.max(3, n * 0.5); let newPts = []; let startLbl = window.points.length + 1;
    let cx = (canvasWidth / 2 - originX) / getUnitSize(); let cy = (originY - canvasHeight / 2) / getUnitSize();

    if (type === 'Kn' || type === 'Cn') {
        for (let i = 0; i < n; i++) {
            let angle = -Math.PI/2 + (i * 2 * Math.PI) / n; let deg = Math.round((-angle * 180 / Math.PI + 360) % 360); let id = window.pointIdCounter++;
            window.points.push({ id, x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle), color: window.activeColor, style: 'solid', label: String(startLbl + i), labelAngle: deg }); newPts.push(id);
        }
        if (type === 'Cn') {
            for (let i = 0; i < n; i++) window.edges.push({ id: window.edgeIdCounter++, type: 'line', sourceId: newPts[i], targetId: newPts[(i+1)%n], color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
        } else {
            for (let i = 0; i < n; i++) for (let j = i+1; j < n; j++) window.edges.push({ id: window.edgeIdCounter++, type: 'line', sourceId: newPts[i], targetId: newPts[j], color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
        }
    } else if (type === 'Star') {
        let centerId = window.pointIdCounter++; window.points.push({ id: centerId, x: cx, y: cy, color: window.activeColor, style: 'solid', label: String(startLbl), labelAngle: 90 });
        for (let i = 0; i < n; i++) {
            let angle = -Math.PI/2 + (i * 2 * Math.PI) / n; let deg = Math.round((-angle * 180 / Math.PI + 360) % 360); let leafId = window.pointIdCounter++;
            window.points.push({ id: leafId, x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle), color: window.activeColor, style: 'solid', label: String(startLbl + 1 + i), labelAngle: deg });
            window.edges.push({ id: window.edgeIdCounter++, type: 'line', sourceId: centerId, targetId: leafId, color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
        }
    } else if (type === 'Pn') {
        let startX = cx - ((n-1) * 2) / 2;
        for (let i = 0; i < n; i++) {
            let id = window.pointIdCounter++; window.points.push({ id, x: startX + i*2, y: cy, color: window.activeColor, style: 'solid', label: String(startLbl + i), labelAngle: 90 }); newPts.push(id);
        }
        for (let i = 0; i < n-1; i++) window.edges.push({ id: window.edgeIdCounter++, type: 'line', sourceId: newPts[i], targetId: newPts[i+1], color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
    } else if (type === 'Km,n') {
        let setA = []; let setB = []; let rBip = Math.max(3, Math.max(m, n) * 0.5);
        let startYa = cy + ((m-1) * 2) / 2; let startYb = cy + ((n-1) * 2) / 2;
        for (let i = 0; i < m; i++) { let id = window.pointIdCounter++; setA.push(id); window.points.push({ id, x: cx - rBip, y: startYa - i*2, color: window.activeColor, style: 'solid', label: String(startLbl + i), labelAngle: 180 }); }
        for (let i = 0; i < n; i++) { let id = window.pointIdCounter++; setB.push(id); window.points.push({ id, x: cx + rBip, y: startYb - i*2, color: window.activeColor, style: 'solid', label: String(startLbl + m + i), labelAngle: 0 }); }
        for (let a of setA) for (let b of setB) window.edges.push({ id: window.edgeIdCounter++, type: 'line', sourceId: a, targetId: b, color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
    } else if (type === 'Wn') {
        let centerId = window.pointIdCounter++;
        window.points.push({ id: centerId, x: cx, y: cy, color: window.activeColor, style: 'solid', label: String(startLbl), labelAngle: 90 });
        let rimNodes = Math.max(3, n - 1); 
        for (let i = 0; i < rimNodes; i++) {
            let angle = -Math.PI/2 + (i * 2 * Math.PI) / rimNodes; let deg = Math.round((-angle * 180 / Math.PI + 360) % 360); let rimId = window.pointIdCounter++;
            window.points.push({ id: rimId, x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle), color: window.activeColor, style: 'solid', label: String(startLbl + 1 + i), labelAngle: deg }); newPts.push(rimId);
            window.edges.push({ id: window.edgeIdCounter++, type: 'line', sourceId: centerId, targetId: rimId, color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
        }
        for (let i = 0; i < rimNodes; i++) { window.edges.push({ id: window.edgeIdCounter++, type: 'line', sourceId: newPts[i], targetId: newPts[(i+1)%rimNodes], color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' }); }
    } else if (type === 'Grid') {
        let gridNodes = []; let startX = cx - ((m-1) * 2) / 2; let startY = cy + ((n-1) * 2) / 2;
        for (let j = 0; j < n; j++) {
            let row = [];
            for (let i = 0; i < m; i++) {
                let id = window.pointIdCounter++;
                window.points.push({ id, x: startX + i*2, y: startY - j*2, color: window.activeColor, style: 'solid', label: String(startLbl + j*m + i), labelAngle: 90 }); row.push(id);
                if (i > 0) window.edges.push({ id: window.edgeIdCounter++, type: 'line', sourceId: row[i-1], targetId: id, color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
                if (j > 0) window.edges.push({ id: window.edgeIdCounter++, type: 'line', sourceId: gridNodes[j-1][i], targetId: id, color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
            }
            gridNodes.push(row);
        }
    } else if (type === 'Q3') {
        let offset = 1.5; let s = 3; 
        let pts = [ {x: cx - s/2, y: cy - s/2}, {x: cx + s/2, y: cy - s/2}, {x: cx + s/2, y: cy + s/2}, {x: cx - s/2, y: cy + s/2}, {x: cx - s/2 + offset, y: cy - s/2 + offset}, {x: cx + s/2 + offset, y: cy - s/2 + offset}, {x: cx + s/2 + offset, y: cy + s/2 + offset}, {x: cx - s/2 + offset, y: cy + s/2 + offset} ];
        pts.forEach((p, i) => {
            let id = window.pointIdCounter++; window.points.push({ id, x: p.x, y: p.y, color: window.activeColor, style: 'solid', label: String(startLbl + i), labelAngle: 90 }); newPts.push(id);
        });
        let edges = [ [0,1], [1,2], [2,3], [3,0], [4,5], [5,6], [6,7], [7,4], [0,4], [1,5], [2,6], [3,7] ];
        edges.forEach(pair => { window.edges.push({ id: window.edgeIdCounter++, type: 'line', sourceId: newPts[pair[0]], targetId: newPts[pair[1]], color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' }); });
    }
    saveState(); window.setMode('select'); 
};

function updateHUD() {
    const el = (id) => document.getElementById(id);
    const hud = el('graph-hud'); if (!hud) return;

    let vCount = window.points.length;
    let eCount = window.edges.filter(e => ['line', 'curve', 'loop'].includes(e.type) && e.sourceId !== undefined && e.targetId !== undefined).length;

    const hudV = el('hud-v'); if (hudV) hudV.innerText = vCount;
    const hudE = el('hud-e'); if (hudE) hudE.innerText = eCount;

    const degContainer = el('hud-deg-container');
    if (window.selectedPointIds && window.selectedPointIds.length === 1) {
        let pId = window.selectedPointIds[0]; let degree = 0;
        window.edges.forEach(e => {
            if (['line', 'curve', 'loop'].includes(e.type)) {
                if (e.sourceId === pId && e.targetId === pId) degree += 2; 
                else if (e.sourceId === pId || e.targetId === pId) degree += 1;
            }
        });
        const hudDeg = el('hud-deg'); if (hudDeg) hudDeg.innerText = degree;
        if (degContainer) degContainer.style.display = 'block';
    } else { if (degContainer) degContainer.style.display = 'none'; }

    const specContainer = el('hud-spec-container');
    if (vCount > 0 && typeof numeric !== 'undefined') {
        let idToIndex = {}; window.points.forEach((p, i) => idToIndex[p.id] = i);
        let A = Array(vCount).fill(0).map(() => Array(vCount).fill(0));
        
        window.edges.forEach(e => {
            if (e.sourceId !== undefined && e.targetId !== undefined && ['line', 'curve', 'loop'].includes(e.type)) {
                let u = idToIndex[e.sourceId]; let v = idToIndex[e.targetId];
                if (u !== undefined && v !== undefined) {
                    if (e.arrow === 'end' || e.arrow === 'both' || e.arrow === 'none') A[u][v] += 1;
                    if (e.arrow === 'start' || e.arrow === 'both' || e.arrow === 'none') {
                        if (u !== v) A[v][u] += 1; 
                    }
                }
            }
        });

        try {
            let ev = numeric.eig(A); let eigens = [];
            for(let i = 0; i < vCount; i++) eigens.push({ re: ev.lambda.x[i], im: ev.lambda.y ? ev.lambda.y[i] : 0 });
            eigens.sort((a, b) => b.re - a.re); 
            
            let formatted = eigens.map(val => {
                let roundedRe = (Math.abs(val.re) < 1e-10) ? 0 : val.re; 
                if (Math.abs(val.im) > 1e-6) return roundedRe.toFixed(2) + (val.im > 0 ? '+' : '') + val.im.toFixed(2) + 'i';
                return roundedRe.toFixed(2);
            });
            const hudSpec = el('hud-spec'); if (hudSpec) hudSpec.innerText = '{ ' + formatted.join(', ') + ' }';
            if (specContainer) specContainer.style.display = 'block';
        } catch(err) { if (specContainer) specContainer.style.display = 'none'; }
    } else { if (specContainer) specContainer.style.display = 'none'; }
}

function updatePropertyPanel() {
    // Safe DOM access helpers
    const el = (id) => document.getElementById(id);
    const setDisplay = (id, v) => { let e = el(id); if (e) e.style.display = v; };
    const setValue = (id, v) => { let e = el(id); if (e) e.value = v; };
    const setInner = (id, v) => { let e = el(id); if (e) e.innerHTML !== undefined ? e.innerHTML = v : (e && (e.innerText = v)); };

    const wPanel = document.getElementById('properties-wrapper'); 
    const pPlaceholder = document.getElementById('properties-placeholder');
    const delBtn = document.getElementById('prop-delete-btn');
    
    // Hide all dynamic property wrappers by default
    ['wrap-label','wrap-angle','wrap-pos','wrap-radius','wrap-offset','wrap-loop-angle','wrap-start','wrap-end','wrap-arrow','wrap-p-style','wrap-l-style'].forEach(id => { setDisplay(id, 'none'); });

    if(delBtn) delBtn.disabled = true;
    if (pPlaceholder) pPlaceholder.innerText = "Select an item to edit"; // Default text

    // 🎨 Paint Mode Helper Text
    if (currentMode === 'paint') {
        if (wPanel) wPanel.style.display = 'none'; 
        if (pPlaceholder) pPlaceholder.style.display = 'inline';
        if (pPlaceholder) pPlaceholder.innerText = "🖌️ Click items on canvas to paint them";
        
        // Ensure color picker reflects the current active drawing color
        let activeCol = window.activeColor || 'Black';
        setInner('current-color', `<span class="color-box" style="background: ${window.getHexFromName(activeCol)};"></span> ${activeCol}`);
        return;
    }

    // If nothing is selected, hide properties and ensure color picker shows the global active color
    if (window.selectedPointIds.length === 0 && window.selectedEdgeIds.length === 0 && window.selectedTextIds.length === 0 && window.selectedRegionIds.length === 0) {
        if (wPanel) wPanel.style.display = 'none'; 
        if (pPlaceholder) pPlaceholder.style.display = 'inline'; 
        
        let activeCol = window.activeColor || 'Black';
        setInner('current-color', `<span class="color-box" style="background: ${window.getHexFromName(activeCol)};"></span> ${activeCol}`);
        return;
    }

    // Show Properties Panel when items are selected
    if (wPanel) wPanel.style.display = 'flex'; if (pPlaceholder) pPlaceholder.style.display = 'none';
    if(delBtn) delBtn.disabled = false; 

    // Update properties and color picker based on selected item
    if (window.selectedPointIds.length > 0) {
        let p = window.points.find(p => p.id === window.selectedPointIds[0]); if(!p) return;
        setDisplay('wrap-label', 'flex'); setValue('prop-label', p.label || "");
        setDisplay('wrap-angle', 'flex'); setValue('prop-label-angle', p.labelAngle !== undefined ? p.labelAngle : 90);
        
        // NEW: Show radius for points
        setDisplay('wrap-radius', 'flex'); 
        setValue('prop-radius', p.radius !== undefined ? p.radius : 5); 
        let lblRadiusEl = el('lbl-radius'); if (lblRadiusEl) lblRadiusEl.innerText = "Radius:";
        
        setDisplay('wrap-p-style', 'flex'); setValue('point-style', p.style);
        setInner('current-color', `<span class="color-box" style="background: ${window.getHexFromName(p.color)};"></span> ${p.color}`);
    } else if (window.selectedEdgeIds.length > 0) {
        let e = window.edges.find(e => e.id === window.selectedEdgeIds[0]); if(!e) return;
        setDisplay('wrap-label', 'flex'); setValue('prop-label', e.label || "");
        setDisplay('wrap-pos', 'flex'); setValue('prop-label-pos', e.labelPos || "above");
        if (['line', 'curve', 'loop', 'arc', 'elliptic-arc'].includes(e.type)) { setDisplay('wrap-arrow', 'flex'); setValue('prop-arrow', e.arrow || "none"); }
        if (e.type === 'curve') { setDisplay('wrap-offset', 'flex'); setValue('prop-offset', e.offset); }
        if (['arc', 'elliptic-arc', 'circle', 'loop'].includes(e.type)) {
            setDisplay('wrap-radius', 'flex'); setValue('prop-radius', e.radius);
            if (e.type === 'elliptic-arc') { let l = el('lbl-radius'); if (l) l.innerText = "Axis(a):"; } else { let l = el('lbl-radius'); if (l) l.innerText = "Radius:"; }
            if (e.type === 'loop') { setDisplay('wrap-loop-angle', 'flex'); setValue('prop-loop-angle', e.loopAngle);
            } else if (e.type !== 'circle') { setDisplay('wrap-start', 'flex'); setValue('prop-angle-start', e.startAngle); setDisplay('wrap-end', 'flex'); setValue('prop-angle-end', e.endAngle); }
        }
        setDisplay('wrap-l-style', 'flex'); setValue('line-style', e.style);
        setInner('current-color', `<span class="color-box" style="background: ${window.getHexFromName(e.color)};"></span> ${e.color}`);
    } else if (window.selectedTextIds.length > 0) {
        let t = window.texts.find(t => t.id === window.selectedTextIds[0]); if(!t) return;
        setDisplay('wrap-label', 'flex'); setValue('prop-label', t.text || "");
        setInner('current-color', `<span class="color-box" style="background: ${window.getHexFromName(t.color)};"></span> ${t.color}`);
    } else if (window.selectedRegionIds.length > 0) {
        let r = window.regions.find(r => r.id === window.selectedRegionIds[0]); if(!r) return;
        setInner('current-color', `<span class="color-box" style="background: ${window.getHexFromName(r.color)};"></span> ${r.color}`);
    }
}

document.getElementById('prop-label').addEventListener('input', (e) => { if (window.selectedTextIds.length > 0) applyPropertyToSelection('text', e.target.value); else applyPropertyToSelection('label', e.target.value); });
document.getElementById('prop-label-angle').addEventListener('input', (e) => applyPropertyToSelection('labelAngle', Number(e.target.value)));
document.getElementById('prop-label-pos').addEventListener('change', (e) => applyPropertyToSelection('labelPos', e.target.value));
document.getElementById('prop-arrow').addEventListener('change', (e) => applyPropertyToSelection('arrow', e.target.value));
document.getElementById('prop-radius').addEventListener('input', (e) => applyPropertyToSelection('radius', Number(e.target.value)));
document.getElementById('prop-offset').addEventListener('input', (e) => applyPropertyToSelection('offset', Number(e.target.value)));
document.getElementById('prop-loop-angle').addEventListener('input', (e) => applyPropertyToSelection('loopAngle', Number(e.target.value)));
document.getElementById('prop-angle-start').addEventListener('input', (e) => applyPropertyToSelection('startAngle', Number(e.target.value)));
document.getElementById('prop-angle-end').addEventListener('input', (e) => applyPropertyToSelection('endAngle', Number(e.target.value)));
document.getElementById('point-style').addEventListener('change', (e) => applyPropertyToSelection('style', e.target.value));
document.getElementById('line-style').addEventListener('change', (e) => applyPropertyToSelection('style', e.target.value));

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const mx = e.clientX - canvas.getBoundingClientRect().left; const my = e.clientY - canvas.getBoundingClientRect().top;
    const mathX = (mx - originX) / getUnitSize(); const mathY = (originY - my) / getUnitSize();
    window.zoom *= (e.deltaY > 0 ? 0.9 : 1.1); window.zoom = Math.max(0.1, Math.min(window.zoom, 20)); 
    originX = mx - mathX * getUnitSize(); originY = my + mathY * getUnitSize();
    draw();
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
    if (document.getElementById('inline-text-editor')) return;
    canvas.focus(); 
    const mx = e.clientX - canvas.getBoundingClientRect().left; const my = e.clientY - canvas.getBoundingClientRect().top;
    
    // 🪢 NEW: Lasso Mode Initialization
    if (currentMode === 'lasso') {
        isLassoing = true; lassoPath = [{x: mx, y: my}]; return;
    }

    let pId = null, tId = null, eId = null, rId = null;
    let pObj = window.points.find(p => {
        let s = mathToScreen(p.x, p.y);
        let r = p.radius !== undefined ? p.radius : 5;
        let hitRadius = Math.max(r + 5, 15); // Ensures a minimum 15px invisible hitbox
        return Math.hypot(s.x - mx, s.y - my) < hitRadius;
    });
    if (pObj) pId = pObj.id;

    if (pId === null) {
        let tObj = window.texts.find(t => { let s = mathToScreen(t.x, t.y); return Math.abs(mx - s.x) < 50 && Math.abs(my - s.y) < 25; });
        if (tObj) tId = tObj.id;
    }

    if (pId === null && tId === null) {
        let eObj = window.edges.find(ed => {
            let p1 = window.points.find(p => p.id === ed.sourceId); if(!p1) return false; let s1 = mathToScreen(p1.x, p1.y); 
            if (ed.type === 'line') {
                let p2 = window.points.find(p => p.id === ed.targetId); if(!p2) return false; let s2 = mathToScreen(p2.x, p2.y);
                return distToSegment(mx, my, s1.x, s1.y, s2.x, s2.y) < 15;
            } else if (ed.type === 'curve') {
                let p2 = window.points.find(p => p.id === ed.targetId); if(!p2) return false; let s2 = mathToScreen(p2.x, p2.y);
                let d_screen = ed.offset * getUnitSize(); let dx = s2.x - s1.x, dy = s2.y - s1.y; let len = Math.hypot(dx, dy); if (len === 0) return false;
                let nx = dy / len, ny = -dx / len; let cx = (s1.x + s2.x)/2 + 2 * d_screen * nx; let cy = (s1.y + s2.y)/2 + 2 * d_screen * ny;
                let minDist = Infinity;
                for (let t=0; t<=1; t+=0.1) {
                    let bx = (1-t)*(1-t)*s1.x + 2*(1-t)*t*cx + t*t*s2.x; let by = (1-t)*(1-t)*s1.y + 2*(1-t)*t*cy + t*t*s2.y;
                    minDist = Math.min(minDist, Math.hypot(mx - bx, my - by));
                } return minDist < 15;
            } else if (ed.type === 'loop') {
                let r = ed.radius * getUnitSize(); let ang = ed.loopAngle * Math.PI / 180;
                let cx = s1.x + r * Math.cos(ang); let cy = s1.y - r * Math.sin(ang);
                return Math.abs(Math.hypot(cx - mx, cy - my) - r) < 15;
            } else if (ed.type === 'circle' || ed.type === 'arc') {
                let r = ed.radius * getUnitSize(); return Math.abs(Math.hypot(s1.x - mx, s1.y - my) - r) < 15;
            } else if (ed.type === 'elliptic-arc') {
                let p2 = window.points.find(p => p.id === e.targetId); if(!p2) return false; let s2 = mathToScreen(p2.x, p2.y);
                let sum = Math.hypot(s1.x - mx, s1.y - my) + Math.hypot(s2.x - mx, s2.y - my); return Math.abs(sum - (2 * ed.radius * getUnitSize())) < 20; 
            } return false;
        });
        if (eObj) eId = eObj.id;
    }

    if (pId === null && tId === null && eId === null && currentMode !== 'region') {
        for (let i = window.regions.length - 1; i >= 0; i--) {
            let r = window.regions[i]; let sTopL = mathToScreen(r.minX, r.maxY); let sBotR = mathToScreen(r.maxX, r.minY);
            if (mx >= sTopL.x && mx <= sBotR.x && my >= sTopL.y && my <= sBotR.y) { rId = r.id; break; }
        }
    }

    // 🎨 NEW: Paint Bucket Logic
    if (currentMode === 'paint') {
        let changed = false;
        if (pId !== null) { let p = window.points.find(x => x.id === pId); if(p) { p.color = window.activeColor; changed = true; } }
        else if (tId !== null) { let t = window.texts.find(x => x.id === tId); if(t) { t.color = window.activeColor; changed = true; } }
        else if (eId !== null) { let e = window.edges.find(x => x.id === eId); if(e) { e.color = window.activeColor; changed = true; } }
        else if (rId !== null) { let r = window.regions.find(x => x.id === rId); if(r) { r.color = window.activeColor; changed = true; } }
        
        if (changed) { saveState(); updatePropertyPanel(); draw(); }
        return;
    }

    if (currentMode === 'delete') {
        if (pId !== null) {
            window.points = window.points.filter(p => p.id !== pId); window.edges = window.edges.filter(ed => ed.sourceId !== pId && ed.targetId !== pId);
        } else if (tId !== null) { window.texts = window.texts.filter(t => t.id !== tId); }
        else if (eId !== null) { window.edges = window.edges.filter(ed => ed.id !== eId); }
        else if (rId !== null) { window.regions = window.regions.filter(r => r.id !== rId); }
        window.selectedPointIds = []; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = [];
        saveState(); updatePropertyPanel(); draw(); return;
    }

    if (currentMode === 'region') {
        let m = screenToMath(mx, my); let newId = window.regionIdCounter++;
        window.regions.push({ id: newId, minX: m.x, minY: m.y, maxX: m.x, maxY: m.y, color: window.activeColor });
        isDrawingRegion = true; draggedRegionId = newId; return;
    }

    if (currentMode === 'select' || currentMode === 'move') {
        if (pId !== null) {
            if (e.shiftKey) { if (window.selectedPointIds.includes(pId)) window.selectedPointIds = window.selectedPointIds.filter(id => id !== pId); else window.selectedPointIds.push(pId); } 
            else { if (!window.selectedPointIds.includes(pId)) { window.selectedPointIds = [pId]; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = []; } }
            if (currentMode === 'move') { isDragging = true; draggedPointId = pId; let pRef = window.points.find(p => p.id === pId); lastDragMath = {x: pRef.x, y: pRef.y}; }
        } 
        else if (tId !== null) { 
            if (e.shiftKey) { if (window.selectedTextIds.includes(tId)) window.selectedTextIds = window.selectedTextIds.filter(id => id !== tId); else window.selectedTextIds.push(tId); } 
            else { if (!window.selectedTextIds.includes(tId)) { window.selectedTextIds = [tId]; window.selectedPointIds = []; window.selectedEdgeIds = []; window.selectedRegionIds = []; } }
            if (currentMode === 'move') { isDragging = true; draggedTextId = tId; let tRef = window.texts.find(t => t.id === tId); lastDragMath = {x: tRef.x, y: tRef.y}; } 
        } 
        else if (eId !== null) { 
            if (e.shiftKey) { if (window.selectedEdgeIds.includes(eId)) window.selectedEdgeIds = window.selectedEdgeIds.filter(id => id !== eId); else window.selectedEdgeIds.push(eId); } 
            else { if (!window.selectedEdgeIds.includes(eId)) { window.selectedEdgeIds = [eId]; window.selectedPointIds = []; window.selectedTextIds = []; window.selectedRegionIds = []; } }
        }
        else if (rId !== null) {
            if (e.shiftKey) { if (window.selectedRegionIds.includes(rId)) window.selectedRegionIds = window.selectedRegionIds.filter(id => id !== rId); else window.selectedRegionIds.push(rId); } 
            else { if (!window.selectedRegionIds.includes(rId)) { window.selectedRegionIds = [rId]; window.selectedPointIds = []; window.selectedTextIds = []; window.selectedEdgeIds = []; } }
            if (currentMode === 'move') { isDragging = true; draggedRegionId = rId; let rRef = window.regions.find(r => r.id === rId); lastDragMath = {x: rRef.minX, y: rRef.minY}; }
        }
        else { window.selectedPointIds = []; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = []; isPanning = true; lastPanX = mx; lastPanY = my; canvas.style.cursor = 'grabbing'; }
        if (window.updatePropertyPanel) window.updatePropertyPanel();
    } 
    else if (currentMode === 'point' && !pId) {
        let m = screenToMath(mx, my); let newId = window.pointIdCounter++;
        window.points.push({ id: newId, x: m.x, y: m.y, color: window.activeColor, style: 'solid', label: String(window.points.length + 1) });
        window.selectedPointIds = [newId]; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = [];
        saveState(); if (window.updatePropertyPanel) window.updatePropertyPanel();
    } 
    else if (currentMode === 'text' && !tId) {
        let m = screenToMath(mx, my);
        let input = document.createElement('input'); input.id = 'inline-text-editor'; input.type = 'text'; input.placeholder = "Math/Text...";
        input.style.position = 'absolute'; input.style.left = mx + 'px'; input.style.top = my + 'px';
        input.style.transform = 'translate(-50%, -50%)'; input.style.zIndex = '2000'; input.style.padding = '6px'; input.style.border = '2px solid #007bff'; input.style.borderRadius = '4px';
        document.getElementById('canvas-container').appendChild(input); setTimeout(() => input.focus(), 50);
        let isFinished = false; input.onkeydown = (evt) => { if(evt.key === 'Enter') input.blur(); };
        input.onblur = () => {
            if(isFinished) return; isFinished = true;
            if (input.value) {
                let newId = window.textIdCounter++; window.texts.push({ id: newId, x: m.x, y: m.y, text: input.value, color: window.activeColor });
                window.selectedTextIds = [newId]; window.selectedPointIds = []; window.selectedEdgeIds = []; window.selectedRegionIds = []; setMode('select', true); saveState();
            }
            try { if (input && input.isConnected) input.parentNode.removeChild(input); } catch(e) { console.error('Failed removing inline editor:', e); }
            draw();
        };

        // Close the inline editor when clicking outside or pressing Escape.
        const outsideHandler = (ev) => {
            if (!input) return;
            if (ev.target === input) return; // clicking inside should not close
            input.blur();
        };
        const escHandler = (ev) => { if (ev.key === 'Escape') input.blur(); };
        // Use capture so outside clicks are detected before other handlers
        document.addEventListener('mousedown', outsideHandler, true);
        document.addEventListener('keydown', escHandler);

        // Clean up listeners when the editor is removed
        const cleanup = () => {
            document.removeEventListener('mousedown', outsideHandler, true);
            document.removeEventListener('keydown', escHandler);
        };
        // Wrap existing onblur to ensure cleanup runs
        const origOnblur = input.onblur;
        input.onblur = () => { try { origOnblur(); } finally { cleanup(); } };
    } 
    else if (['line', 'curve'].includes(currentMode) && pId !== null) {
        if (window.selectedPointIds.length === 0) { window.selectedPointIds = [pId]; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = []; if (window.updatePropertyPanel) window.updatePropertyPanel(); }
        else if (window.selectedPointIds[0] !== pId) {
            let newId = window.edgeIdCounter++;
            window.edges.push({ id: newId, type: currentMode, sourceId: window.selectedPointIds[0], targetId: pId, color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above', offset: currentMode === 'curve' ? 1 : undefined });
            window.selectedPointIds = []; window.selectedEdgeIds = [newId]; window.selectedTextIds = []; window.selectedRegionIds = []; saveState(); if (window.updatePropertyPanel) window.updatePropertyPanel();
        }
    } 
    else if (['circle', 'loop'].includes(currentMode) && pId !== null) {
        let newId = window.edgeIdCounter++; let eType = currentMode;
        window.edges.push({ id: newId, type: eType, sourceId: pId, targetId: pId, radius: 1, loopAngle: eType === 'loop' ? 90 : undefined, color: window.activeColor, style: 'solid', label: "", labelPos: 'above', arrow: eType === 'loop' ? 'end' : 'none' });
        window.selectedEdgeIds = [newId]; window.selectedPointIds = []; window.selectedTextIds = []; window.selectedRegionIds = []; saveState(); if (window.updatePropertyPanel) window.updatePropertyPanel();
    }
    else if (currentMode === 'arc' && pId !== null) {
        let newId = window.edgeIdCounter++;
        window.edges.push({ id: newId, type: 'arc', sourceId: pId, radius: 2, startAngle: 0, endAngle: 90, color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
        window.selectedEdgeIds = [newId]; window.selectedPointIds = []; window.selectedTextIds = []; window.selectedRegionIds = []; saveState(); if (window.updatePropertyPanel) window.updatePropertyPanel();
    } 
    else if (currentMode === 'elliptic-arc' && pId !== null) {
        if (window.selectedPointIds.length === 0) { window.selectedPointIds = [pId]; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = []; if (window.updatePropertyPanel) window.updatePropertyPanel(); }
        else if (window.selectedPointIds[0] !== pId) {
            let p1 = window.points.find(p=>p.id===window.selectedPointIds[0]); let p2 = window.points.find(p=>p.id===pId);
            let c = Math.hypot(p2.x-p1.x, p2.y-p1.y)/2; let newId = window.edgeIdCounter++;
            window.edges.push({ id: newId, type: 'elliptic-arc', sourceId: window.selectedPointIds[0], targetId: pId, radius: Math.ceil(c+1), startAngle: 0, endAngle: 180, color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
            window.selectedPointIds = []; window.selectedEdgeIds = [newId]; window.selectedTextIds = []; window.selectedRegionIds = []; saveState(); if (window.updatePropertyPanel) window.updatePropertyPanel();
        }
    }
    draw();
});

canvas.addEventListener('mousemove', (e) => {
    const mx = e.clientX - canvas.getBoundingClientRect().left; const my = e.clientY - canvas.getBoundingClientRect().top;
    
    // 🪢 NEW: Lasso Tracing
    if (isLassoing) { lassoPath.push({x: mx, y: my}); draw(); return; }
    
    if (isPanning) {
        originX += (mx - lastPanX); originY += (my - lastPanY); lastPanX = mx; lastPanY = my; draw();
    } else if (isDrawingRegion && draggedRegionId !== null) {
        let m = screenToMath(mx, my, true); let r = window.regions.find(reg => reg.id === draggedRegionId);
        if (r) { r.maxX = m.x; r.maxY = m.y; draw(); }
    } else if (isDragging) {
        let currMath = screenToMath(mx, my, false); 
        if (draggedPointId !== null && window.selectedPointIds.length > 0) { 
            let dx = currMath.x - lastDragMath.x; let dy = currMath.y - lastDragMath.y;
            if (dx !== 0 || dy !== 0) { window.selectedPointIds.forEach(id => { let p = window.points.find(p => p.id === id); if(p) { p.x += dx; p.y += dy; } }); lastDragMath = currMath; draw(); }
        }
        else if (draggedTextId !== null && window.selectedTextIds.length > 0) { 
            let dx = currMath.x - lastDragMath.x; let dy = currMath.y - lastDragMath.y;
            if (dx !== 0 || dy !== 0) { window.selectedTextIds.forEach(id => { let t = window.texts.find(t => t.id === id); if(t) { t.x += dx; t.y += dy; } }); lastDragMath = currMath; draw(); }
        }
        else if (draggedRegionId !== null && window.selectedRegionIds.length > 0) {
            let dx = currMath.x - lastDragMath.x; let dy = currMath.y - lastDragMath.y;
            if (dx !== 0 || dy !== 0) { window.selectedRegionIds.forEach(id => { let r = window.regions.find(r => r.id === id); if(r) { r.minX += dx; r.maxX += dx; r.minY += dy; r.maxY += dy; } }); lastDragMath = currMath; draw(); }
        }
    }
});

window.addEventListener('mouseup', () => { 
    // 🪢 NEW: Lasso Check Enclosed Points -> Auto-Switch to Move Mode
    if (isLassoing) {
        isLassoing = false;
        if (lassoPath.length > 2) {
            window.selectedPointIds = window.points.filter(p => isPointInPolygon(mathToScreen(p.x, p.y), lassoPath)).map(p => p.id);
            window.selectedTextIds = window.texts.filter(t => isPointInPolygon(mathToScreen(t.x, t.y), lassoPath)).map(t => t.id);
            if (window.selectedPointIds.length > 0 || window.selectedTextIds.length > 0) {
                setMode('move', true); // Instantly switches to Move tool so you can drag the cluster!
            }
        }
        lassoPath = []; draw(); return;
    }

    if (isDragging) saveState(); 
    if (isDrawingRegion && draggedRegionId !== null) {
        let r = window.regions.find(reg => reg.id === draggedRegionId);
        if (r) {
            let tempX1 = Math.min(r.minX, r.maxX); let tempX2 = Math.max(r.minX, r.maxX); let tempY1 = Math.min(r.minY, r.maxY); let tempY2 = Math.max(r.minY, r.maxY);
            r.minX = tempX1; r.maxX = tempX2; r.minY = tempY1; r.maxY = tempY2;
            if (r.maxX - r.minX < 0.2 && r.maxY - r.minY < 0.2) { window.regions = window.regions.filter(reg => reg.id !== r.id); } 
            else { window.selectedRegionIds = [r.id]; setMode('select', true); saveState(); }
        }
    }
    isPanning = false; isDragging = false; isDrawingRegion = false; draggedPointId = null; draggedTextId = null; draggedRegionId = null; activeSnapLineX = null; activeSnapLineY = null; lastDragMath = null;
    if (currentMode === 'move') canvas.style.cursor = 'grab'; else if (currentMode === 'select' || currentMode === 'paint') canvas.style.cursor = 'pointer';
    draw(); 
});

window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { 
        e.preventDefault(); window.selectedPointIds = window.points.map(p => p.id); window.selectedEdgeIds = window.edges.map(ed => ed.id);
        window.selectedTextIds = window.texts.map(t => t.id); window.selectedRegionIds = window.regions.map(r => r.id); window.setMode('select', true); return; 
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (window.copySelection && window.copySelection()) e.preventDefault();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (window.pasteSelection && window.pasteSelection()) e.preventDefault();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (window.selectConnectedFigure) window.selectConnectedFigure();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); window.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); window.redo(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { window.deleteSelected(); }
});

function drawArrowhead(ctx, x, y, angle, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x - 12 * Math.cos(angle - Math.PI/6), y - 12 * Math.sin(angle - Math.PI/6));
    ctx.lineTo(x - 12 * Math.cos(angle + Math.PI/6), y - 12 * Math.sin(angle + Math.PI/6)); ctx.fill();
}

function getPlotControlState() {
    return {
        type: document.getElementById('plot-type')?.value || 'line',
        mode: document.getElementById('plot-mode')?.value || 'shared-x',
        title: (document.getElementById('plot-title')?.value || '').trim(),
        xlabel: (document.getElementById('plot-xlabel')?.value || '').trim() || 'x',
        ylabel: (document.getElementById('plot-ylabel')?.value || '').trim() || 'y',
        legendPos: document.getElementById('plot-legend-pos')?.value || 'best',
        showGrid: document.getElementById('plot-grid') ? document.getElementById('plot-grid').checked : true,
        showLegend: document.getElementById('plot-legend') ? document.getElementById('plot-legend').checked : true,
    };
}

function parsePlotTable(text, options) {
    const control = options || getPlotControlState();
    const rows = text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(line => line.split(/[\t,; ]+/).filter(Boolean));

    if (rows.length < 2) return null;

    const headers = rows[0];
    const dataRows = rows.slice(1);
    const series = [];

    if (control.mode === 'paired') {
        for (let i = 0; i + 1 < headers.length; i += 2) {
            const points = [];
            dataRows.forEach(row => {
                const x = parseFloat(row[i]);
                const y = parseFloat(row[i + 1]);
                if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
            });
            if (points.length > 0) {
                series.push({
                    name: headers[i + 1] || `Series ${series.length + 1}`,
                    x: points.map(p => p.x),
                    y: points.map(p => p.y),
                });
            }
        }
    } else {
        const xValues = [];
        const yColumns = headers.slice(1);
        const ySeries = yColumns.map(name => ({ name: name || `Series ${series.length + 1}`, y: [], x: [] }));
        dataRows.forEach(row => {
            const x = parseFloat(row[0]);
            if (!Number.isFinite(x)) return;
            xValues.push(x);
            ySeries.forEach((s, idx) => {
                const y = parseFloat(row[idx + 1]);
                if (Number.isFinite(y)) {
                    s.x.push(x);
                    s.y.push(y);
                }
            });
        });
        ySeries.forEach(s => { if (s.x.length > 0) series.push(s); });
    }

    if (series.length === 0) return null;

    const allX = series.flatMap(s => s.x);
    const allY = series.flatMap(s => s.y);
    const xMin = Math.min(...allX);
    const xMax = Math.max(...allX);
    const yMin = Math.min(...allY);
    const yMax = Math.max(...allY);

    return {
        id: window.plotIdCounter++,
        type: control.type,
        mode: control.mode,
        title: control.title,
        xlabel: control.xlabel,
        ylabel: control.ylabel,
        legendPos: control.legendPos,
        showGrid: control.showGrid,
        showLegend: control.showLegend,
        series,
        bounds: {
            xMin: xMin === xMax ? xMin - 1 : xMin,
            xMax: xMin === xMax ? xMax + 1 : xMax,
            yMin: yMin === yMax ? yMin - 1 : yMin,
            yMax: yMin === yMax ? yMax + 1 : yMax,
        },
    };
}

function getPlotPalette() {
    return ['#0056b3', '#d63384', '#20c997', '#fd7e14', '#6f42c1', '#198754', '#dc3545', '#0d6efd'];
}

function buildPlotLegendEntries(plot, palette) {
    return plot.series.map((series, index) => ({
        label: series.name || `Series ${index + 1}`,
        color: palette[index % palette.length],
    }));
}

function drawPlotLegend(plotCtx, plot, box, entries) {
    if (!plot.showLegend || entries.length === 0) return;
    const padding = 10;
    const lineHeight = 18;
    const sampleWidth = 18;
    plotCtx.font = '12px sans-serif';
    const widths = entries.map(entry => plotCtx.measureText(entry.label).width);
    const legendWidth = Math.max(...widths, 0) + sampleWidth + padding * 3;
    const legendHeight = entries.length * lineHeight + padding * 2;
    const legendX = plot.legendPos === 'upper left' || plot.legendPos === 'lower left' ? box.x + 18 : box.x + box.w - legendWidth - 18;
    const legendY = plot.legendPos === 'lower left' || plot.legendPos === 'lower right' ? box.y + box.h - legendHeight - 18 : box.y + 18;

    plotCtx.save();
    plotCtx.fillStyle = 'rgba(255,255,255,0.9)';
    plotCtx.strokeStyle = 'rgba(0,0,0,0.12)';
    plotCtx.lineWidth = 1;
    plotCtx.beginPath();
    if (plotCtx.roundRect) plotCtx.roundRect(legendX, legendY, legendWidth, legendHeight, 10); else plotCtx.rect(legendX, legendY, legendWidth, legendHeight);
    plotCtx.fill();
    plotCtx.stroke();
    plotCtx.fillStyle = '#222';
    entries.forEach((entry, index) => {
        const y = legendY + padding + index * lineHeight + 10;
        plotCtx.strokeStyle = entry.color;
        plotCtx.fillStyle = entry.color;
        plotCtx.lineWidth = 2;
        plotCtx.beginPath();
        plotCtx.moveTo(legendX + padding, y);
        plotCtx.lineTo(legendX + padding + sampleWidth, y);
        plotCtx.stroke();
        plotCtx.beginPath();
        plotCtx.arc(legendX + padding + sampleWidth / 2, y, 3, 0, Math.PI * 2);
        plotCtx.fill();
        plotCtx.fillStyle = '#222';
        plotCtx.fillText(entry.label, legendX + padding + sampleWidth + 8, y + 4);
    });
    plotCtx.restore();
}

function renderPlotCanvas() {
    const plotCanvas = document.getElementById('plotCanvas');
    if (!plotCanvas) return;
    const plotCtx = plotCanvas.getContext('2d');
    const hasPlot = window.plots && window.plots.length > 0;
    plotCanvas.style.display = hasPlot ? 'block' : 'none';
    if (!hasPlot) {
        plotCtx.clearRect(0, 0, plotCanvas.width, plotCanvas.height);
        window._activePlotLayout = null;
        return;
    }

    const width = canvasWidth;
    const height = canvasHeight;
    plotCanvas.width = width * dpr;
    plotCanvas.height = height * dpr;
    plotCanvas.style.width = width + 'px';
    plotCanvas.style.height = height + 'px';
    plotCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    plotCtx.clearRect(0, 0, width, height);

    const plot = window.plots[0];
    const palette = getPlotPalette();
    const legendEntries = buildPlotLegendEntries(plot, palette);
    const box = { x: width * 0.12, y: height * 0.12, w: width * 0.76, h: height * 0.76 };
    const pad = 42;
    const left = box.x + pad;
    const top = box.y + pad * 0.8;
    const right = box.x + box.w - 18;
    const bottom = box.y + box.h - 32;
    const chartW = right - left;
    const chartH = bottom - top;
    const xMin = plot.bounds.xMin;
    const xMax = plot.bounds.xMax;
    const yMin = plot.bounds.yMin;
    const yMax = plot.bounds.yMax;
    const xSpan = xMax - xMin || 1;
    const ySpan = yMax - yMin || 1;

    plotCtx.fillStyle = 'rgba(255,255,255,0.92)';
    plotCtx.strokeStyle = 'rgba(0,0,0,0.15)';
    plotCtx.lineWidth = 1;
    plotCtx.beginPath();
    if (plotCtx.roundRect) plotCtx.roundRect(box.x, box.y, box.w, box.h, 18); else plotCtx.rect(box.x, box.y, box.w, box.h);
    plotCtx.fill();
    plotCtx.stroke();

    if (plot.title) {
        plotCtx.fillStyle = '#111';
        plotCtx.font = '600 16px sans-serif';
        plotCtx.textAlign = 'center';
        plotCtx.fillText(plot.title, box.x + box.w / 2, box.y + 22);
    }

    plotCtx.font = '12px sans-serif';
    plotCtx.fillStyle = '#333';
    plotCtx.textAlign = 'center';
    plotCtx.fillText(plot.xlabel, left + chartW / 2, box.y + box.h - 10);
    plotCtx.save();
    plotCtx.translate(box.x + 16, top + chartH / 2);
    plotCtx.rotate(-Math.PI / 2);
    plotCtx.fillText(plot.ylabel, 0, 0);
    plotCtx.restore();

    const toX = (x) => left + ((x - xMin) / xSpan) * chartW;
    const toY = (y) => bottom - ((y - yMin) / ySpan) * chartH;

    if (plot.showGrid) {
        plotCtx.strokeStyle = 'rgba(0,0,0,0.08)';
        plotCtx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const gx = left + (chartW * i) / 5;
            const gy = top + (chartH * i) / 5;
            plotCtx.beginPath(); plotCtx.moveTo(gx, top); plotCtx.lineTo(gx, bottom); plotCtx.stroke();
            plotCtx.beginPath(); plotCtx.moveTo(left, gy); plotCtx.lineTo(right, gy); plotCtx.stroke();
        }
    }

    plotCtx.strokeStyle = '#111';
    plotCtx.lineWidth = 1.5;
    plotCtx.beginPath(); plotCtx.moveTo(left, bottom); plotCtx.lineTo(right, bottom); plotCtx.stroke();
    plotCtx.beginPath(); plotCtx.moveTo(left, top); plotCtx.lineTo(left, bottom); plotCtx.stroke();

    const drawLineSeries = (series, color) => {
        plotCtx.strokeStyle = color;
        plotCtx.fillStyle = color;
        plotCtx.lineWidth = 2.2;
        plotCtx.beginPath();
        series.x.forEach((x, pointIndex) => {
            const px = toX(x);
            const py = toY(series.y[pointIndex]);
            if (pointIndex === 0) plotCtx.moveTo(px, py); else plotCtx.lineTo(px, py);
        });
        plotCtx.stroke();
        series.x.forEach((x, pointIndex) => {
            const px = toX(x);
            const py = toY(series.y[pointIndex]);
            plotCtx.beginPath();
            plotCtx.arc(px, py, 3.5, 0, Math.PI * 2);
            plotCtx.fill();
        });
    };

    const drawScatterSeries = (series, color) => {
        plotCtx.fillStyle = color;
        series.x.forEach((x, pointIndex) => {
            const px = toX(x);
            const py = toY(series.y[pointIndex]);
            plotCtx.beginPath();
            plotCtx.arc(px, py, 4, 0, Math.PI * 2);
            plotCtx.fill();
        });
    };

    const drawStepSeries = (series, color) => {
        plotCtx.strokeStyle = color;
        plotCtx.fillStyle = color;
        plotCtx.lineWidth = 2.2;
        plotCtx.beginPath();
        series.x.forEach((x, pointIndex) => {
            const px = toX(x);
            const py = toY(series.y[pointIndex]);
            if (pointIndex === 0) {
                plotCtx.moveTo(px, py);
            } else {
                plotCtx.lineTo(px, toY(series.y[pointIndex - 1]));
                plotCtx.lineTo(px, py);
            }
        });
        plotCtx.stroke();
    };

    const drawBarSeries = (series, color, seriesIndex) => {
        plotCtx.fillStyle = color;
        const xValues = [...new Set(series.x)].sort((a, b) => a - b);
        const groupWidth = chartW / Math.max(xValues.length, 1);
        const barWidth = groupWidth / (window.plots[0].series.length + 1);
        xValues.forEach((xVal) => {
            const idx = series.x.findIndex(x => x === xVal);
            if (idx < 0) return;
            const xCenter = toX(xVal);
            const barTop = toY(series.y[idx]);
            const xOffset = (seriesIndex - (window.plots[0].series.length - 1) / 2) * barWidth;
            plotCtx.fillRect(xCenter + xOffset - barWidth / 2, barTop, barWidth * 0.85, bottom - barTop);
        });
    };

    plot.series.forEach((series, index) => {
        const color = palette[index % palette.length];
        if (plot.type === 'scatter') drawScatterSeries(series, color);
        else if (plot.type === 'bar') drawBarSeries(series, color, index);
        else if (plot.type === 'step') drawStepSeries(series, color);
        else drawLineSeries(series, color);
    });

    drawPlotLegend(plotCtx, plot, box, legendEntries);
    window._activePlotLayout = { plot, box, left, top, right, bottom, xMin, xMax, yMin, yMax, chartW, chartH };
}

window.generatePlotFromTable = function() {
    const table = document.getElementById('plot-table');
    const plot = parsePlotTable(table ? table.value : '', getPlotControlState());
    if (!plot) {
        window.plots = [];
        renderPlotCanvas();
        draw();
        return;
    }
    window.plots = [plot];
    saveState();
    renderPlotCanvas();
    draw();
};

window.importPlotCSV = function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        const table = document.getElementById('plot-table');
        if (table) table.value = ev.target.result;
        generatePlotFromTable();
    };
    reader.readAsText(file);
    event.target.value = '';
};

window.clearPlot = function() {
    window.plots = [];
    window._activePlotLayout = null;
    const readout = document.getElementById('plot-readout');
    if (readout) readout.innerText = 'Move the mouse over the plot preview to inspect coordinates.';
    renderPlotCanvas();
    saveState();
    draw();
};

window.generateMatplotlibCode = function() {
    if (!window.plots || window.plots.length === 0) return '# Add plot data and click Render Plot to generate Matplotlib code.';
    const plot = window.plots[0];
    const lines = [];
    lines.push('import matplotlib.pyplot as plt');
    lines.push('');
    plot.series.forEach((series, index) => {
        const label = series.name ? JSON.stringify(series.name) : JSON.stringify(`Series ${index + 1}`);
        lines.push(`x${index + 1} = ${JSON.stringify(series.x)}`);
        lines.push(`y${index + 1} = ${JSON.stringify(series.y)}`);
        if (plot.type === 'scatter') lines.push(`plt.scatter(x${index + 1}, y${index + 1}, label=${label})`);
        else if (plot.type === 'bar') lines.push(`plt.bar(x${index + 1}, y${index + 1}, label=${label}, alpha=0.85)`);
        else if (plot.type === 'step') lines.push(`plt.step(x${index + 1}, y${index + 1}, where='mid', label=${label})`);
        else lines.push(`plt.plot(x${index + 1}, y${index + 1}, marker='o', linewidth=2, label=${label})`);
        lines.push('');
    });
    if (plot.title) lines.push(`plt.title(${JSON.stringify(plot.title)})`);
    lines.push(`plt.xlabel(${JSON.stringify(plot.xlabel || 'x')})`);
    lines.push(`plt.ylabel(${JSON.stringify(plot.ylabel || 'y')})`);
    if (plot.showGrid) lines.push('plt.grid(True, alpha=0.3)');
    if (plot.showLegend) lines.push(`plt.legend(loc=${JSON.stringify(plot.legendPos || 'best')})`);
    lines.push('plt.tight_layout()');
    lines.push('plt.show()');
    return lines.join('\n');
};

window.generatePGFPlotsCode = function() {
    if (!window.plots || window.plots.length === 0) return '% Add plot data and click Render Plot to generate PGFPlots code.';
    const plot = window.plots[0];
    const lines = [];
    lines.push('\\begin{tikzpicture}');
    lines.push(`\\begin{axis}[title={${plot.title || ''}}, xlabel={${plot.xlabel || 'x'}}, ylabel={${plot.ylabel || 'y'}}, grid=${plot.showGrid ? 'both' : 'none'}]`);
    plot.series.forEach((series, index) => {
        const label = series.name || `Series ${index + 1}`;
        const coords = series.x.map((x, i) => `(${x},${series.y[i]})`).join(' ');
        if (plot.type === 'scatter') lines.push(`\\addplot+[only marks] coordinates { ${coords} };`);
        else if (plot.type === 'bar') lines.push(`\\addplot+[ybar] coordinates { ${coords} };`);
        else if (plot.type === 'step') lines.push(`\\addplot+[const plot mark left] coordinates { ${coords} };`);
        else lines.push(`\\addplot coordinates { ${coords} };`);
        if (plot.showLegend) lines.push(`\\addlegendentry{${label}}`);
    });
    lines.push('\\end{axis}');
    lines.push('\\end{tikzpicture}');
    return lines.join('\n');
};

window.generateGnuplotCode = function() {
    if (!window.plots || window.plots.length === 0) return '# Add plot data and click Render Plot to generate Gnuplot code.';
    const plot = window.plots[0];
    const lines = [];
    lines.push(`set title ${JSON.stringify(plot.title || '')}`);
    lines.push(`set xlabel ${JSON.stringify(plot.xlabel || 'x')}`);
    lines.push(`set ylabel ${JSON.stringify(plot.ylabel || 'y')}`);
    if (plot.showGrid) lines.push('set grid');
    lines.push('plot \\');
    plot.series.forEach((series, index) => {
        const label = series.name || `Series ${index + 1}`;
        const style = plot.type === 'scatter' ? 'with points pointtype 7' : plot.type === 'bar' ? 'with boxes' : plot.type === 'step' ? 'with steps' : 'with linespoints';
        lines.push(`'-' ${style} title ${JSON.stringify(label)}${index < plot.series.length - 1 ? ', \\' : ''}`);
        series.x.forEach((x, i) => {
            lines.push(`${x} ${series.y[i]}`);
        });
        lines.push('e');
    });
    return lines.join('\n');
};

const plotContainer = document.getElementById('canvas-container');
if (plotContainer) {
    plotContainer.addEventListener('mousemove', (event) => {
        const readout = document.getElementById('plot-readout');
        if (!readout || !window._activePlotLayout || !window.plots || window.plots.length === 0) return;
        const layout = window._activePlotLayout;
        const rect = canvas.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        if (mx < layout.left || mx > layout.right || my < layout.top || my > layout.bottom) {
            readout.innerText = 'Move the mouse over the plot preview to inspect coordinates.';
            return;
        }
        const x = layout.xMin + ((mx - layout.left) / layout.chartW) * (layout.xMax - layout.xMin);
        const y = layout.yMin + ((layout.bottom - my) / layout.chartH) * (layout.yMax - layout.yMin);
        readout.innerText = `x = ${x.toFixed(3)}, y = ${y.toFixed(3)}`;
    });
    plotContainer.addEventListener('mouseleave', () => {
        const readout = document.getElementById('plot-readout');
        if (readout) readout.innerText = 'Move the mouse over the plot preview to inspect coordinates.';
    });
}

window.draw = function() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    let u = getUnitSize();
    document.querySelectorAll('.math-overlay').forEach(el => el.remove());
    renderPlotCanvas();

    let isDark = document.body.classList.contains('dark-mode');

    if (document.getElementById('toggle-grid').checked) {
        ctx.strokeStyle = isDark ? '#b0b0b0' : '#e0e0e0'; ctx.lineWidth = 1;
        let sX = originX % u; if (sX < 0) sX += u;
        for (let i = sX; i <= canvasWidth; i += u) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvasHeight); ctx.stroke(); }
        let sY = originY % u; if (sY < 0) sY += u;
        for (let i = sY; i <= canvasHeight; i += u) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvasWidth, i); ctx.stroke(); }
    }

    if (activeSnapLineX !== null || activeSnapLineY !== null) {
        ctx.setLineDash([5, 5]); ctx.strokeStyle = isDark ? 'rgba(255, 150, 0, 0.6)' : 'rgba(0, 123, 255, 0.4)';
        if (activeSnapLineX !== null) { let sx = originX + activeSnapLineX * u; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, canvasHeight); ctx.stroke(); }
        if (activeSnapLineY !== null) { let sy = originY - activeSnapLineY * u; ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(canvasWidth, sy); ctx.stroke(); }
        ctx.setLineDash([]);
    }

    if (document.getElementById('toggle-axes') && document.getElementById('toggle-axes').checked) {
        ctx.strokeStyle = isDark ? '#808080' : '#ccc'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(originX, 0); ctx.lineTo(originX, canvasHeight); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, originY); ctx.lineTo(canvasWidth, originY); ctx.stroke();
    }

    window.regions.forEach(r => {
        let s1 = mathToScreen(r.minX, r.maxY); let s2 = mathToScreen(r.maxX, r.minY);
        let w = s2.x - s1.x; let h = s2.y - s1.y;
        ctx.fillStyle = window.getHexFromName(r.color) + '33'; 
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(s1.x, s1.y, w, h, 25); else ctx.rect(s1.x, s1.y, w, h); ctx.fill();
        if (window.selectedRegionIds.includes(r.id)) { ctx.strokeStyle = 'gold'; ctx.lineWidth = 3; ctx.setLineDash([8,8]); ctx.stroke(); ctx.setLineDash([]); }
    });

    window.edges.forEach(e => {
        let p1 = window.points.find(p => p.id === e.sourceId); if (!p1) return; let s1 = mathToScreen(p1.x, p1.y); 
        ctx.strokeStyle = window.selectedEdgeIds.includes(e.id) ? 'rgba(255, 215, 0, 0.8)' : window.getHexFromName(e.color);
        ctx.lineWidth = window.selectedEdgeIds.includes(e.id) ? 5 : 2;
        ctx.setLineDash(e.style === 'dashed' ? [8, 8] : e.style === 'dotted' ? [3, 4] : []);
        ctx.beginPath(); let midX = s1.x; let midY = s1.y;

        if (e.type === 'line') {
            let p2 = window.points.find(p => p.id === e.targetId); if (!p2) return; let s2 = mathToScreen(p2.x, p2.y);
            
            let r1 = p1.radius !== undefined ? p1.radius : 5;
            let r2 = p2.radius !== undefined ? p2.radius : 5;
            
            let dx = s2.x - s1.x; let dy = s2.y - s1.y;
            let len = Math.hypot(dx, dy);
            
            // Only draw if the nodes aren't completely overlapping
            if (len > r1 + r2) {
                let ang = Math.atan2(dy, dx);
                
                // Shorten the line so it starts and stops exactly at the border (+ 2px buffer)
                let startX = s1.x + (r1 + 2) * Math.cos(ang);
                let startY = s1.y + (r1 + 2) * Math.sin(ang);
                let endX = s2.x - (r2 + 2) * Math.cos(ang);
                let endY = s2.y - (r2 + 2) * Math.sin(ang);
                
                midX = (s1.x + s2.x) / 2; midY = (s1.y + s2.y) / 2; 
                ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke();
                
                // Draw arrowheads exactly at the trimmed ends
                if (['end','both'].includes(e.arrow)) drawArrowhead(ctx, endX, endY, ang, ctx.strokeStyle);
                if (['start','both'].includes(e.arrow)) drawArrowhead(ctx, startX, startY, ang + Math.PI, ctx.strokeStyle);
            }
            
        } else if (e.type === 'curve') {
            let p2 = window.points.find(p => p.id === e.targetId); if (!p2) return; let s2 = mathToScreen(p2.x, p2.y);
            
            let r1 = p1.radius !== undefined ? p1.radius : 5;
            let r2 = p2.radius !== undefined ? p2.radius : 5;
            
            let d_screen = e.offset * u;
            let dx = s2.x - s1.x, dy = s2.y - s1.y; let len = Math.hypot(dx, dy);
            
            if (len > 0) {
                let nx = dy / len, ny = -dx / len; 
                let cx = (s1.x + s2.x)/2 + 2 * d_screen * nx; let cy = (s1.y + s2.y)/2 + 2 * d_screen * ny;
                
                // Calculate the angle of the curve as it leaves/enters the nodes
                let angStart = Math.atan2(cy - s1.y, cx - s1.x);
                let angEnd = Math.atan2(s2.y - cy, s2.x - cx);
                
                // Trim the curve to the node borders
                let startX = s1.x + (r1 + 2) * Math.cos(angStart);
                let startY = s1.y + (r1 + 2) * Math.sin(angStart);
                let endX = s2.x - (r2 + 2) * Math.cos(angEnd);
                let endY = s2.y - (r2 + 2) * Math.sin(angEnd);
                
                ctx.moveTo(startX, startY); ctx.quadraticCurveTo(cx, cy, endX, endY); ctx.stroke();
                midX = (s1.x + s2.x)/2 + d_screen * nx; midY = (s1.y + s2.y)/2 + d_screen * ny;
                
                if (['end','both'].includes(e.arrow)) drawArrowhead(ctx, endX, endY, angEnd, ctx.strokeStyle);
                if (['start','both'].includes(e.arrow)) drawArrowhead(ctx, startX, startY, angStart + Math.PI, ctx.strokeStyle);
            }
        } else if (e.type === 'loop') {
            let r = e.radius * u; let ang = e.loopAngle * Math.PI / 180;
            let cx = s1.x + r * Math.cos(ang); let cy = s1.y - r * Math.sin(ang);
            ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
            midX = cx + r * Math.cos(ang); midY = cy - r * Math.sin(ang);
            if (['end','both'].includes(e.arrow)) { drawArrowhead(ctx, midX, midY, -ang + Math.PI/2, ctx.strokeStyle); }
            if (['start','both'].includes(e.arrow)) { drawArrowhead(ctx, midX, midY, -ang - Math.PI/2, ctx.strokeStyle); }
        } else if (e.type === 'circle') {
            let r = e.radius * u; ctx.arc(s1.x, s1.y, r, 0, Math.PI*2); ctx.stroke(); midY -= r;
        } else if (e.type === 'arc') {
            let r = e.radius * u; ctx.arc(s1.x, s1.y, r, -e.startAngle*Math.PI/180, -e.endAngle*Math.PI/180, true); ctx.stroke();
            let mA = -(e.startAngle+e.endAngle)/2 * Math.PI/180; midX = s1.x+Math.cos(mA)*r; midY = s1.y+Math.sin(mA)*r;
        } else if (e.type === 'elliptic-arc') {
            let p2 = window.points.find(p => p.id === e.targetId); if (!p2) return; let s2 = mathToScreen(p2.x, p2.y); 
            let c = Math.hypot(p2.x-p1.x, p2.y-p1.y)/2; let a = Math.max(e.radius, c+0.01); let b = Math.sqrt(a*a - c*c);
            let rot = Math.atan2(s2.y-s1.y, s2.x-s1.x); let cx = (s1.x+s2.x)/2; let cy = (s1.y+s2.y)/2;
            ctx.ellipse(cx, cy, a*u, b*u, rot, -e.startAngle*Math.PI/180, -e.endAngle*Math.PI/180, true); ctx.stroke();
            let midT = -(e.startAngle + e.endAngle)/2 * Math.PI/180; let aCos = a*u * Math.cos(midT); let bSin = b*u * Math.sin(midT);
            midX = cx + aCos*Math.cos(rot) - bSin*Math.sin(rot); midY = cy + aCos*Math.sin(rot) + bSin*Math.cos(rot);
        }
        ctx.setLineDash([]);

        if (e.label) {
            let oX = 0; let oY = 0;
            if (e.labelPos === 'above') oY = -15; else if (e.labelPos === 'below') oY = 15; else if (e.labelPos === 'left') oX = -20; else if (e.labelPos === 'right') oX = 20;
            let overlay = document.createElement('div'); overlay.className = 'math-overlay';
            overlay.style.position = 'absolute'; overlay.style.left = (midX + oX) + 'px'; overlay.style.top = (midY + oY) + 'px';
            overlay.style.transform = 'translate(-50%, -50%)'; overlay.style.color = window.getHexFromName(e.color); 
            overlay.style.backgroundColor = e.labelPos === 'on' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)';
            overlay.style.padding = '2px 4px'; overlay.style.borderRadius = '4px';
            if (e.labelPos === 'on') overlay.style.border = '1px solid transparent';
            overlay.style.pointerEvents = 'none'; document.getElementById('canvas-container').appendChild(overlay);
            try { katex.render(e.label, overlay); } catch(err) { overlay.innerText = e.label; }
        }
    });

    window.texts.forEach(t => {
        let s = mathToScreen(t.x, t.y);
        if (window.selectedTextIds.includes(t.id)) { ctx.fillStyle = 'rgba(255, 215, 0, 0.4)'; ctx.fillRect(s.x-25, s.y-15, 50, 30); }
        let overlay = document.createElement('div'); overlay.className = 'math-overlay';
        overlay.style.position = 'absolute'; overlay.style.left = s.x + 'px'; overlay.style.top = s.y + 'px';
        overlay.style.transform = 'translate(-50%, -50%)'; overlay.style.color = window.getHexFromName(t.color); overlay.style.pointerEvents = 'none';
        document.getElementById('canvas-container').appendChild(overlay);
        try { katex.render(t.text, overlay); } catch(err) { overlay.innerText = t.text; }
    });

    window.points.forEach(p => {
        let s = mathToScreen(p.x, p.y);
        let r = p.radius !== undefined ? p.radius : 5;
        
        // Only draw the physical node if radius is greater than 0
        if (r > 0) {
            ctx.fillStyle = p.style === 'solid' ? window.getHexFromName(p.color) : (isDark ? '#222' : 'white');
            ctx.strokeStyle = window.getHexFromName(p.color);
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        }

        // ALWAYS draw the yellow highlight ring if selected, even if invisible
        if (window.selectedPointIds.includes(p.id)) {
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(s.x, s.y, r === 0 ? 5 : r + 4, 0, Math.PI*2); ctx.stroke();
        }

        if (p.label) {
            let r = (p.labelAngle !== undefined ? p.labelAngle : 90) * Math.PI/180;
            let overlay = document.createElement('div'); overlay.className = 'math-overlay';
            overlay.style.position = 'absolute'; overlay.style.left = (s.x + Math.cos(r)*20) + 'px'; overlay.style.top = (s.y - Math.sin(r)*20) + 'px';
            overlay.style.transform = 'translate(-50%, -50%)'; overlay.style.color = '#333'; overlay.style.pointerEvents = 'none';
            document.getElementById('canvas-container').appendChild(overlay);
            try { katex.render(p.label, overlay); } catch(err) { overlay.innerText = p.label; }
        }
    });

    // 🪢 NEW: Render Lasso Path
    if (isLassoing && lassoPath.length > 0) {
        ctx.save(); ctx.beginPath(); ctx.moveTo(lassoPath[0].x, lassoPath[0].y);
        for(let i=1; i<lassoPath.length; i++) { ctx.lineTo(lassoPath[i].x, lassoPath[i].y); }
        ctx.closePath();
        ctx.fillStyle = isDark ? 'rgba(138, 180, 248, 0.2)' : 'rgba(0, 123, 255, 0.1)'; ctx.fill();
        ctx.strokeStyle = isDark ? '#8ab4f8' : '#007bff'; ctx.setLineDash([5, 5]); ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
    }

    if (window.requestGenerateCode) window.requestGenerateCode();
    updateHUD();
};

window.exportImage = async function() {
    // 1. Save current selection state and theme BEFORE the try block
    let oldPoints = window.selectedPointIds; 
    let oldEdges = window.selectedEdgeIds; 
    let oldTexts = window.selectedTextIds; 
    let oldRegions = window.selectedRegionIds;
    let wasDark = document.body.classList.contains('dark-mode');

    try {
        // 2. Prepare canvas for clean photo
        // (We hide the yellow selection highlights, but leave the grid exactly as it is!)
        window.selectedPointIds = []; 
        window.selectedEdgeIds = []; 
        window.selectedTextIds = []; 
        window.selectedRegionIds = [];
        
        if (wasDark) document.body.classList.remove('dark-mode');

        draw(); 
        await new Promise(resolve => setTimeout(resolve, 100));

        const container = document.getElementById('canvas-container');
        
        // 3. Generate Image with a SOLID WHITE BACKGROUND
        const canvasImg = await html2canvas(container, { 
            backgroundColor: '#ffffff',
            scale: 2,
            useCORS: true, 
            logging: false 
        });

        // 4. Trigger Download
        const link = document.createElement('a'); 
        link.download = 'ProGraph_Export.png'; 
        link.href = canvasImg.toDataURL('image/png'); 
        link.click();

    } catch (error) {
        console.error("Advanced export failed:", error);
        
        // FALLBACK: Create a temporary canvas, fill it with white, and draw the raw graph on top
        const rawCanvas = document.getElementById('graphCanvas');
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = rawCanvas.width;
        tempCanvas.height = rawCanvas.height;
        const tCtx = tempCanvas.getContext('2d');
        
        // Fill white background for fallback
        tCtx.fillStyle = '#ffffff';
        tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tCtx.drawImage(rawCanvas, 0, 0);

        const link = document.createElement('a');
        link.download = 'ProGraph_Raw_Export.png';
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
        
    } finally {
        // 5. ALWAYS RESTORE STATE (Even if the export failed)
        if (wasDark) document.body.classList.add('dark-mode');
        
        // Restore your selections
        window.selectedPointIds = oldPoints; 
        window.selectedEdgeIds = oldEdges; 
        window.selectedTextIds = oldTexts; 
        window.selectedRegionIds = oldRegions;
        draw();
    }
};

window.exportJSON = function() {
    let a = document.createElement('a'); a.download = "graph_data.json";
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({points: window.points, edges: window.edges, texts: window.texts, regions: window.regions, plots: window.plots, originX, originY, zoom: window.zoom}, null, 2)); a.click();
}
window.importJSON = function(e) {
    let reader = new FileReader();
    reader.onload = function(ev) {
        let obj = JSON.parse(ev.target.result); window.points = obj.points || []; window.edges = obj.edges || []; window.texts = obj.texts || []; window.regions = obj.regions || []; window.plots = obj.plots || [];
        if (obj.originX !== undefined) originX = obj.originX; if (obj.originY !== undefined) originY = obj.originY; if (obj.zoom !== undefined) window.zoom = obj.zoom;
        window.pointIdCounter = window.points.length ? Math.max(...window.points.map(p=>p.id))+1 : 0; window.edgeIdCounter = window.edges.length ? Math.max(...window.edges.map(e=>e.id))+1 : 0; 
        window.textIdCounter = window.texts.length ? Math.max(...window.texts.map(t=>t.id))+1 : 0; window.regionIdCounter = window.regions.length ? Math.max(...window.regions.map(r=>r.id))+1 : 0; window.plotIdCounter = window.plots.length ? Math.max(...window.plots.map(pl=>pl.id))+1 : 0;
        renderPlotCanvas();
        saveState(); draw();
    }; reader.readAsText(e.target.files[0]);
}

// 🎨 UPDATED: Greedy Auto-Coloring Algorithm (Lowercase Fix)
window.autoColorGraph = function() {
    if (window.points.length === 0) return;
    
    // 1. Strictly lowercase palette so getHexFromName() doesn't crash
    const palette = ['blue', 'red', 'green', 'orange', 'purple', 'cyan', 'magenta', 'brown', 'black', 'gray'];
    
    // 2. Build adjacency list for undirected connections
    let adj = {};
    window.points.forEach(p => adj[p.id] = []);
    
    window.edges.forEach(e => {
        if (['line', 'curve'].includes(e.type)) {
            if (adj[e.sourceId] !== undefined && adj[e.targetId] !== undefined && e.sourceId !== e.targetId) {
                adj[e.sourceId].push(e.targetId);
                adj[e.targetId].push(e.sourceId);
            }
        }
    });

    // 3. Sort vertices by degree descending
    let sortedPoints = [...window.points].sort((a, b) => adj[b.id].length - adj[a.id].length);
    
    let colorAssignment = {}; 
    let maxColorUsed = 0;

    // 4. Assign colors
    sortedPoints.forEach(p => {
        let neighborColors = new Set(adj[p.id].map(neighborId => colorAssignment[neighborId]).filter(c => c !== undefined));
        
        let c = 0;
        while (neighborColors.has(c)) { 
            c++; 
        } 
        
        colorAssignment[p.id] = c;
        if (c > maxColorUsed) maxColorUsed = c;

        // Apply lowercase color to the actual point object
        let actualPoint = window.points.find(wp => wp.id === p.id);
        if (actualPoint) {
            actualPoint.color = palette[c % palette.length]; 
        }
    });
    
    // 5. Save and Redraw
    saveState(); 
    if (typeof updatePropertyPanel === 'function') updatePropertyPanel(); 
    if (typeof draw === 'function') draw();
};

// ✂️ UPDATED: Bipartite Snapper (Lowercase Fix)
window.snapBipartite = function() {
    if (window.points.length === 0) return;

    let adj = {};
    window.points.forEach(p => adj[p.id] = []);
    window.edges.forEach(e => {
        if (['line', 'curve'].includes(e.type)) {
            if (adj[e.sourceId] !== undefined && adj[e.targetId] !== undefined && e.sourceId !== e.targetId) {
                adj[e.sourceId].push(e.targetId);
                adj[e.targetId].push(e.sourceId);
            }
        }
    });

    let color = {}; let parent = {}; let isBipartite = true;
    let conflictEdge = null; let sets = {0: [], 1: []};

    for (let i = 0; i < window.points.length; i++) {
        let startNode = window.points[i];
        if (color[startNode.id] === undefined) {
            let queue = [startNode.id];
            color[startNode.id] = 0;
            sets[0].push(startNode.id);

            while(queue.length > 0 && isBipartite) {
                let u = queue.shift();
                for (let v of adj[u]) {
                    if (color[v] === undefined) {
                        color[v] = 1 - color[u];
                        sets[color[v]].push(v);
                        parent[v] = u; queue.push(v);
                    } else if (color[v] === color[u]) {
                        isBipartite = false; conflictEdge = [u, v]; break;
                    }
                }
            }
        }
        if (!isBipartite) break;
    }

    if (isBipartite) {
        let cx = (canvasWidth / 2 - originX) / getUnitSize();
        let cy = (originY - canvasHeight / 2) / getUnitSize();
        let setA = sets[0]; let setB = sets[1];
        let startYa = cy + ((setA.length-1) * 2) / 2; let startYb = cy + ((setB.length-1) * 2) / 2;

        setA.forEach((id, idx) => {
            let p = window.points.find(p => p.id === id);
            if(p) { p.x = cx - 2.5; p.y = startYa - idx * 2; p.color = 'blue'; } // LOWERCASE
        });
        setB.forEach((id, idx) => {
            let p = window.points.find(p => p.id === id);
            if(p) { p.x = cx + 2.5; p.y = startYb - idx * 2; p.color = 'red'; } // LOWERCASE
        });
        
        window.edges.forEach(e => { if (['line', 'curve'].includes(e.type)) e.color = 'black'; });
        alert("Graph is Bipartite! Snapped into Set A (blue) and Set B (red).");
    } else {
        let u = conflictEdge[0], v = conflictEdge[1];
        window.points.forEach(p => p.color = 'black');
        window.edges.forEach(e => e.color = 'black');

        let pathU = []; let curr = u; while(curr !== undefined) { pathU.push(curr); curr = parent[curr]; }
        let pathV = []; curr = v; while(curr !== undefined) { pathV.push(curr); curr = parent[curr]; }
        
        let lca = null;
        for(let node of pathU) { if (pathV.includes(node)) { lca = node; break; } }
        
        let cycleNodes = new Set();
        if (lca !== null) {
            for(let node of pathU) { cycleNodes.add(node); if (node === lca) break; }
            for(let node of pathV) { cycleNodes.add(node); if (node === lca) break; }
        }

        cycleNodes.forEach(id => { let p = window.points.find(p => p.id === id); if (p) p.color = 'red'; }); // LOWERCASE
        window.edges.forEach(e => {
            if (cycleNodes.has(e.sourceId) && cycleNodes.has(e.targetId)) e.color = 'red'; // LOWERCASE
        });

        alert("Graph is NOT Bipartite! Found an odd-length cycle (highlighted in red).");
    }
    saveState(); updatePropertyPanel(); draw();
};


// ==========================================
// RIGHT-CLICK CONTEXT MENU LOGIC
// ==========================================

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // Stop the default browser menu from opening

    const mx = e.clientX - canvas.getBoundingClientRect().left;
    const my = e.clientY - canvas.getBoundingClientRect().top;

    // 1. Quick hit-detect to see if the user right-clicked on a point
    let pObj = window.points.find(p => {
        let s = mathToScreen(p.x, p.y);
        let r = p.radius !== undefined ? p.radius : 5;
        return Math.hypot(s.x - mx, s.y - my) < Math.max(r + 5, 15);
    });

    // 2. If they right-clicked a point, auto-select it!
    if (pObj) {
        if (!window.selectedPointIds.includes(pObj.id)) {
            window.selectedPointIds = [pObj.id];
            window.selectedEdgeIds = [];
            window.selectedTextIds = [];
            window.selectedRegionIds = [];
            window.setMode('select', true);
        }
    }

    // 3. If ANY item is selected (points, edges, or regions), show the menu
    if (window.selectedPointIds.length > 0 || window.selectedEdgeIds.length > 0 || window.selectedTextIds.length > 0 || window.selectedRegionIds.length > 0) {
        const menu = document.getElementById('context-menu');
        menu.style.display = 'block';
        menu.style.left = e.pageX + 'px';
        menu.style.top = e.pageY + 'px';
    }
});

// Hide the menu if the user left-clicks anywhere else on the screen
document.addEventListener('click', (e) => {
    const menu = document.getElementById('context-menu');
    // If the click wasn't inside the context menu, close it
    if (menu && e.target.closest('#context-menu') === null) {
        menu.style.display = 'none';
    }
});

// The function triggered by the color swatches
window.fastColor = function(colorName) {
    window.applyPropertyToSelection('color', colorName);
    document.getElementById('context-menu').style.display = 'none'; // Close menu after painting
};

setTimeout(() => { saveState(); draw(); }, 100);