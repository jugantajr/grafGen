const canvas = document.getElementById('graphCanvas');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;
document.getElementById('canvas-container').style.position = 'relative';

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
window.pointIdCounter = 0; window.edgeIdCounter = 0; window.textIdCounter = 0; window.regionIdCounter = 0;

let historyState = []; let historyIndex = -1;

// NEW: Lasso Tracking Variables
let isLassoing = false;
let lassoPath = [];

window.saveState = function() {
    if (historyIndex < historyState.length - 1) historyState = historyState.slice(0, historyIndex + 1);
    historyState.push(JSON.stringify({
        points: window.points, edges: window.edges, texts: window.texts, regions: window.regions,
        pId: window.pointIdCounter, eId: window.edgeIdCounter, tId: window.textIdCounter, rId: window.regionIdCounter
    }));
    historyIndex++;
};

window.undo = function() {
    if (historyIndex > 0) {
        historyIndex--; let state = JSON.parse(historyState[historyIndex]);
        window.points = state.points; window.edges = state.edges; window.texts = state.texts; window.regions = state.regions || [];
        window.pointIdCounter = state.pId; window.edgeIdCounter = state.eId; window.textIdCounter = state.tId; window.regionIdCounter = state.rId || 0;
        window.selectedPointIds = []; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = []; updatePropertyPanel(); draw();
    }
};

window.redo = function() {
    if (historyIndex < historyState.length - 1) {
        historyIndex++; let state = JSON.parse(historyState[historyIndex]);
        window.points = state.points; window.edges = state.edges; window.texts = state.texts; window.regions = state.regions || [];
        window.pointIdCounter = state.pId; window.edgeIdCounter = state.eId; window.textIdCounter = state.tId; window.regionIdCounter = state.rId || 0;
        window.selectedPointIds = []; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = []; updatePropertyPanel(); draw();
    }
};

let currentMode = 'point'; 
window.selectedPointIds = []; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = [];

let isDragging = false; let draggedPointId = null; let draggedTextId = null; let draggedRegionId = null; let lastDragMath = null; 
let isPanning = false; let lastPanX = 0; let lastPanY = 0; let isDrawingRegion = false;
let activeSnapLineX = null; let activeSnapLineY = null;

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
        window.points = []; window.edges = []; window.texts = []; window.regions = [];
        window.selectedPointIds = []; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = [];
        window.pointIdCounter = 0; window.edgeIdCounter = 0; window.textIdCounter = 0; window.regionIdCounter = 0;
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
    const hud = document.getElementById('graph-hud'); if (!hud) return;
    
    let vCount = window.points.length;
    let eCount = window.edges.filter(e => ['line', 'curve', 'loop'].includes(e.type) && e.sourceId !== undefined && e.targetId !== undefined).length;
    
    document.getElementById('hud-v').innerText = vCount;
    document.getElementById('hud-e').innerText = eCount;
    
    const degContainer = document.getElementById('hud-deg-container');
    if (window.selectedPointIds && window.selectedPointIds.length === 1) {
        let pId = window.selectedPointIds[0]; let degree = 0;
        window.edges.forEach(e => {
            if (['line', 'curve', 'loop'].includes(e.type)) {
                if (e.sourceId === pId && e.targetId === pId) degree += 2; 
                else if (e.sourceId === pId || e.targetId === pId) degree += 1;
            }
        });
        document.getElementById('hud-deg').innerText = degree; degContainer.style.display = 'block';
    } else { degContainer.style.display = 'none'; }

    const specContainer = document.getElementById('hud-spec-container');
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
            document.getElementById('hud-spec').innerText = '{ ' + formatted.join(', ') + ' }';
            specContainer.style.display = 'block';
        } catch(err) { specContainer.style.display = 'none'; }
    } else { specContainer.style.display = 'none'; }
}

function updatePropertyPanel() {
    const wPanel = document.getElementById('properties-wrapper'); 
    const pPlaceholder = document.getElementById('properties-placeholder');
    const delBtn = document.getElementById('prop-delete-btn');
    
    // Hide all dynamic property wrappers by default
    ['wrap-label','wrap-angle','wrap-pos','wrap-radius','wrap-offset','wrap-loop-angle','wrap-start','wrap-end','wrap-arrow','wrap-p-style','wrap-l-style'].forEach(id => { document.getElementById(id).style.display = 'none'; });

    if(delBtn) delBtn.disabled = true;
    pPlaceholder.innerText = "Select an item to edit"; // Default text

    // 🎨 Paint Mode Helper Text
    if (currentMode === 'paint') {
        wPanel.style.display = 'none'; 
        pPlaceholder.style.display = 'inline';
        pPlaceholder.innerText = "🖌️ Click items on canvas to paint them";
        
        // Ensure color picker reflects the current active drawing color
        let activeCol = window.activeColor || 'Black';
        document.getElementById('current-color').innerHTML = `<span class="color-box" style="background: ${window.getHexFromName(activeCol)};"></span> ${activeCol}`;
        return;
    }

    // If nothing is selected, hide properties and ensure color picker shows the global active color
    if (window.selectedPointIds.length === 0 && window.selectedEdgeIds.length === 0 && window.selectedTextIds.length === 0 && window.selectedRegionIds.length === 0) {
        wPanel.style.display = 'none'; 
        pPlaceholder.style.display = 'inline'; 
        
        let activeCol = window.activeColor || 'Black';
        document.getElementById('current-color').innerHTML = `<span class="color-box" style="background: ${window.getHexFromName(activeCol)};"></span> ${activeCol}`;
        return;
    }

    // Show Properties Panel when items are selected
    wPanel.style.display = 'flex'; pPlaceholder.style.display = 'none';
    if(delBtn) delBtn.disabled = false; 

    // Update properties and color picker based on selected item
    if (window.selectedPointIds.length > 0) {
        let p = window.points.find(p => p.id === window.selectedPointIds[0]); if(!p) return;
        document.getElementById('wrap-label').style.display = 'flex'; document.getElementById('prop-label').value = p.label || "";
        document.getElementById('wrap-angle').style.display = 'flex'; document.getElementById('prop-label-angle').value = p.labelAngle !== undefined ? p.labelAngle : 90;
        document.getElementById('wrap-p-style').style.display = 'flex'; document.getElementById('point-style').value = p.style;
        document.getElementById('current-color').innerHTML = `<span class="color-box" style="background: ${window.getHexFromName(p.color)};"></span> ${p.color}`;
    } else if (window.selectedEdgeIds.length > 0) {
        let e = window.edges.find(e => e.id === window.selectedEdgeIds[0]); if(!e) return;
        document.getElementById('wrap-label').style.display = 'flex'; document.getElementById('prop-label').value = e.label || "";
        document.getElementById('wrap-pos').style.display = 'flex'; document.getElementById('prop-label-pos').value = e.labelPos || "above";
        if (['line', 'curve', 'loop', 'arc', 'elliptic-arc'].includes(e.type)) { document.getElementById('wrap-arrow').style.display = 'flex'; document.getElementById('prop-arrow').value = e.arrow || "none"; }
        if (e.type === 'curve') { document.getElementById('wrap-offset').style.display = 'flex'; document.getElementById('prop-offset').value = e.offset; }
        if (['arc', 'elliptic-arc', 'circle', 'loop'].includes(e.type)) {
            document.getElementById('wrap-radius').style.display = 'flex'; document.getElementById('prop-radius').value = e.radius;
            if (e.type === 'elliptic-arc') { document.getElementById('lbl-radius').innerText = "Axis(a):"; } else { document.getElementById('lbl-radius').innerText = "Radius:"; }
            if (e.type === 'loop') { document.getElementById('wrap-loop-angle').style.display = 'flex'; document.getElementById('prop-loop-angle').value = e.loopAngle;
            } else if (e.type !== 'circle') { document.getElementById('wrap-start').style.display = 'flex'; document.getElementById('prop-angle-start').value = e.startAngle; document.getElementById('wrap-end').style.display = 'flex'; document.getElementById('prop-angle-end').value = e.endAngle; }
        }
        document.getElementById('wrap-l-style').style.display = 'flex'; document.getElementById('line-style').value = e.style;
        document.getElementById('current-color').innerHTML = `<span class="color-box" style="background: ${window.getHexFromName(e.color)};"></span> ${e.color}`;
    } else if (window.selectedTextIds.length > 0) {
        let t = window.texts.find(t => t.id === window.selectedTextIds[0]); if(!t) return;
        document.getElementById('wrap-label').style.display = 'flex'; document.getElementById('prop-label').value = t.text || "";
        document.getElementById('current-color').innerHTML = `<span class="color-box" style="background: ${window.getHexFromName(t.color)};"></span> ${t.color}`;
    } else if (window.selectedRegionIds.length > 0) {
        let r = window.regions.find(r => r.id === window.selectedRegionIds[0]); if(!r) return;
        document.getElementById('current-color').innerHTML = `<span class="color-box" style="background: ${window.getHexFromName(r.color)};"></span> ${r.color}`;
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
    let pObj = window.points.find(p => Math.hypot(mathToScreen(p.x, p.y).x - mx, mathToScreen(p.x, p.y).y - my) < 15);
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
            input.remove(); draw();
        };
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
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); window.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); window.redo(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { window.deleteSelected(); }
});

function drawArrowhead(ctx, x, y, angle, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x - 12 * Math.cos(angle - Math.PI/6), y - 12 * Math.sin(angle - Math.PI/6));
    ctx.lineTo(x - 12 * Math.cos(angle + Math.PI/6), y - 12 * Math.sin(angle + Math.PI/6)); ctx.fill();
}

window.draw = function() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    let u = getUnitSize();
    document.querySelectorAll('.math-overlay').forEach(el => el.remove());

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

    ctx.strokeStyle = isDark ? '#808080' : '#ccc'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(originX, 0); ctx.lineTo(originX, canvasHeight); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, originY); ctx.lineTo(canvasWidth, originY); ctx.stroke();

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
            midX = (s1.x+s2.x)/2; midY = (s1.y+s2.y)/2; ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
            let ang = Math.atan2(s2.y-s1.y, s2.x-s1.x);
            if (['end','both'].includes(e.arrow)) drawArrowhead(ctx, s2.x-5*Math.cos(ang), s2.y-5*Math.sin(ang), ang, ctx.strokeStyle);
            if (['start','both'].includes(e.arrow)) drawArrowhead(ctx, s1.x+5*Math.cos(ang), s1.y+5*Math.sin(ang), ang+Math.PI, ctx.strokeStyle);
        } else if (e.type === 'curve') {
            let p2 = window.points.find(p => p.id === e.targetId); if (!p2) return; let s2 = mathToScreen(p2.x, p2.y);
            let d_screen = e.offset * u;
            let dx = s2.x - s1.x, dy = s2.y - s1.y; let len = Math.hypot(dx, dy);
            if (len > 0) {
                let nx = dy / len, ny = -dx / len; 
                let cx = (s1.x + s2.x)/2 + 2 * d_screen * nx; let cy = (s1.y + s2.y)/2 + 2 * d_screen * ny;
                ctx.moveTo(s1.x, s1.y); ctx.quadraticCurveTo(cx, cy, s2.x, s2.y); ctx.stroke();
                midX = (s1.x + s2.x)/2 + d_screen * nx; midY = (s1.y + s2.y)/2 + d_screen * ny;
                if (['end','both'].includes(e.arrow)) { let ang = Math.atan2(s2.y-cy, s2.x-cx); drawArrowhead(ctx, s2.x-5*Math.cos(ang), s2.y-5*Math.sin(ang), ang, ctx.strokeStyle); }
                if (['start','both'].includes(e.arrow)) { let ang = Math.atan2(s1.y-cy, s1.x-cx); drawArrowhead(ctx, s1.x+5*Math.cos(ang), s1.y+5*Math.sin(ang), ang+Math.PI, ctx.strokeStyle); }
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
        ctx.fillStyle = p.style === 'solid' ? (window.selectedPointIds.includes(p.id) ? 'gold' : window.getHexFromName(p.color)) : 'white';
        ctx.strokeStyle = window.selectedPointIds.includes(p.id) ? 'gold' : window.getHexFromName(p.color);
        ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI*2); ctx.fill(); ctx.stroke();

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

    if (window.generateCode) window.generateCode();
    updateHUD();
};

window.exportImage = async function() {
    let oldGrid = document.getElementById('toggle-grid').checked; document.getElementById('toggle-grid').checked = false;
    let oldPoints = window.selectedPointIds; let oldEdges = window.selectedEdgeIds; let oldTexts = window.selectedTextIds; let oldRegions = window.selectedRegionIds;
    window.selectedPointIds = []; window.selectedEdgeIds = []; window.selectedTextIds = []; window.selectedRegionIds = [];
    draw(); 
    const container = document.getElementById('canvas-container');
    const canvasImg = await html2canvas(container, { backgroundColor: null, scale: 2 });
    document.getElementById('toggle-grid').checked = oldGrid;
    window.selectedPointIds = oldPoints; window.selectedEdgeIds = oldEdges; window.selectedTextIds = oldTexts; window.selectedRegionIds = oldRegions;
    draw();
    const link = document.createElement('a'); link.download = 'graph_export.png'; link.href = canvasImg.toDataURL('image/png'); link.click();
};

window.exportJSON = function() {
    let a = document.createElement('a'); a.download = "graph_data.json";
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({points: window.points, edges: window.edges, texts: window.texts, regions: window.regions, originX, originY, zoom: window.zoom}, null, 2)); a.click();
}
window.importJSON = function(e) {
    let reader = new FileReader();
    reader.onload = function(ev) {
        let obj = JSON.parse(ev.target.result); window.points = obj.points || []; window.edges = obj.edges || []; window.texts = obj.texts || []; window.regions = obj.regions || [];
        if (obj.originX !== undefined) originX = obj.originX; if (obj.originY !== undefined) originY = obj.originY; if (obj.zoom !== undefined) window.zoom = obj.zoom;
        window.pointIdCounter = window.points.length ? Math.max(...window.points.map(p=>p.id))+1 : 0; window.edgeIdCounter = window.edges.length ? Math.max(...window.edges.map(e=>e.id))+1 : 0; 
        window.textIdCounter = window.texts.length ? Math.max(...window.texts.map(t=>t.id))+1 : 0; window.regionIdCounter = window.regions.length ? Math.max(...window.regions.map(r=>r.id))+1 : 0;
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


setTimeout(() => { saveState(); draw(); }, 100);