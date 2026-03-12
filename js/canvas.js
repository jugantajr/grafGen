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

window.points = []; window.edges = []; window.texts = []; 
// Made global so macros can safely increment them
window.pointIdCounter = 0; window.edgeIdCounter = 0; window.textIdCounter = 0;

let currentMode = 'point'; 
let selectedPointId = null; let selectedEdgeId = null; let selectedTextId = null;
let isDragging = false; let draggedPointId = null; let draggedTextId = null;
let isPanning = false; let lastPanX = 0; let lastPanY = 0;

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
            if (p.id === draggedPointId) return;
            if (Math.abs(mx - p.x) < 0.15) { mx = p.x; activeSnapLineX = p.x; }
            if (Math.abs(my - p.y) < 0.15) { my = p.y; activeSnapLineY = p.y; }
        });
    }
    return { x: mx, y: my };
}

function mathToScreen(mx, my) { return { x: originX + (mx * getUnitSize()), y: originY - (my * getUnitSize()) }; }

window.setMode = function(mode, keepSelection = false) {
    currentMode = mode; 
    if (!keepSelection) { selectedPointId = null; selectedEdgeId = null; selectedTextId = null; }
    document.querySelectorAll('.tool-group button').forEach(btn => btn.classList.remove('active'));
    let btn = document.getElementById(`mode-${mode}`); if(btn) btn.classList.add('active');
    
    if (mode === 'move') canvas.style.cursor = 'grab';
    else if (mode === 'select') canvas.style.cursor = 'pointer';
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
    if (selectedPointId !== null) { let p = window.points.find(p => p.id === selectedPointId); if(p) p[prop] = value; }
    else if (selectedEdgeId !== null) { let e = window.edges.find(e => e.id === selectedEdgeId); if(e) e[prop] = value; }
    else if (selectedTextId !== null) { let t = window.texts.find(t => t.id === selectedTextId); if(t) t[prop] = value; }
    draw();
};

window.deleteSelected = function() {
    if (selectedPointId !== null) {
        window.points = window.points.filter(p => p.id !== selectedPointId);
        window.edges = window.edges.filter(e => e.sourceId !== selectedPointId && e.targetId !== selectedPointId);
        selectedPointId = null;
    } 
    else if (selectedEdgeId !== null) { window.edges = window.edges.filter(e => e.id !== selectedEdgeId); selectedEdgeId = null; }
    else if (selectedTextId !== null) { window.texts = window.texts.filter(t => t.id !== selectedTextId); selectedTextId = null; }
    updatePropertyPanel(); draw();
};

window.clearAll = function() {
    if(confirm("Are you sure you want to clear the entire graph?")) {
        window.points = []; window.edges = []; window.texts = [];
        selectedPointId = null; selectedEdgeId = null; selectedTextId = null;
        updatePropertyPanel(); draw();
    }
};

// ==========================================
// GRAPH GENERATOR (MACROS)
// ==========================================
window.toggleMacroInputs = function() {
    let type = document.getElementById('macro-type').value;
    document.getElementById('macro-m').style.display = (type === 'Km,n') ? 'inline-block' : 'none';
};

window.insertMacro = function() {
    let type = document.getElementById('macro-type').value;
    let n = parseInt(document.getElementById('macro-n').value) || 5;
    let m = parseInt(document.getElementById('macro-m').value) || 3;
    
    // Scale radius automatically so large graphs don't squish together
    let r = Math.max(3, n * 0.5); 
    
    let newPts = [];
    let startLbl = window.points.length + 1;

    // Viewport Center Offset (spawns graph where you are currently looking)
    let cx = (canvasWidth / 2 - originX) / getUnitSize();
    let cy = (originY - canvasHeight / 2) / getUnitSize();

    if (type === 'Kn' || type === 'Cn') {
        for (let i = 0; i < n; i++) {
            let angle = -Math.PI/2 + (i * 2 * Math.PI) / n; 
            let deg = Math.round((-angle * 180 / Math.PI + 360) % 360);
            let id = window.pointIdCounter++;
            window.points.push({ 
                id, x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle), 
                color: window.activeColor, style: 'solid', label: String(startLbl + i), labelAngle: deg 
            });
            newPts.push(id);
        }
        if (type === 'Cn') {
            for (let i = 0; i < n; i++) {
                window.edges.push({ id: window.edgeIdCounter++, type: 'line', sourceId: newPts[i], targetId: newPts[(i+1)%n], color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
            }
        } else { // Kn
            for (let i = 0; i < n; i++) {
                for (let j = i+1; j < n; j++) {
                    window.edges.push({ id: window.edgeIdCounter++, type: 'line', sourceId: newPts[i], targetId: newPts[j], color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
                }
            }
        }
    } 
    else if (type === 'Star') {
        let centerId = window.pointIdCounter++;
        window.points.push({ id: centerId, x: cx, y: cy, color: window.activeColor, style: 'solid', label: String(startLbl), labelAngle: 90 });
        for (let i = 0; i < n; i++) {
            let angle = -Math.PI/2 + (i * 2 * Math.PI) / n;
            let deg = Math.round((-angle * 180 / Math.PI + 360) % 360);
            let leafId = window.pointIdCounter++;
            window.points.push({ id: leafId, x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle), color: window.activeColor, style: 'solid', label: String(startLbl + 1 + i), labelAngle: deg });
            window.edges.push({ id: window.edgeIdCounter++, type: 'line', sourceId: centerId, targetId: leafId, color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
        }
    } 
    else if (type === 'Pn') {
        let startX = cx - ((n-1) * 2) / 2;
        for (let i = 0; i < n; i++) {
            let id = window.pointIdCounter++;
            window.points.push({ id, x: startX + i*2, y: cy, color: window.activeColor, style: 'solid', label: String(startLbl + i), labelAngle: 90 });
            newPts.push(id);
        }
        for (let i = 0; i < n-1; i++) {
            window.edges.push({ id: window.edgeIdCounter++, type: 'line', sourceId: newPts[i], targetId: newPts[i+1], color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
        }
    } 
    else if (type === 'Km,n') {
        let setA = []; let setB = [];
        let rBip = Math.max(3, Math.max(m, n) * 0.5);
        let startYa = cy + ((m-1) * 2) / 2;
        let startYb = cy + ((n-1) * 2) / 2;
        
        for (let i = 0; i < m; i++) {
            let id = window.pointIdCounter++; setA.push(id);
            window.points.push({ id, x: cx - rBip, y: startYa - i*2, color: window.activeColor, style: 'solid', label: String(startLbl + i), labelAngle: 180 });
        }
        for (let i = 0; i < n; i++) {
            let id = window.pointIdCounter++; setB.push(id);
            window.points.push({ id, x: cx + rBip, y: startYb - i*2, color: window.activeColor, style: 'solid', label: String(startLbl + m + i), labelAngle: 0 });
        }
        for (let a of setA) {
            for (let b of setB) {
                window.edges.push({ id: window.edgeIdCounter++, type: 'line', sourceId: a, targetId: b, color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
            }
        }
    }
    
    window.setMode('select'); 
    draw();
};
// ==========================================


function updatePropertyPanel() {
    const lblInput = document.getElementById('prop-label'); const angInput = document.getElementById('prop-label-angle');
    const posInput = document.getElementById('prop-label-pos'); const arrInput = document.getElementById('prop-arrow');
    const rInput = document.getElementById('prop-radius'); const saInput = document.getElementById('prop-angle-start');
    const eaInput = document.getElementById('prop-angle-end'); const pStyleInput = document.getElementById('point-style');
    const lStyleInput = document.getElementById('line-style'); const clrInput = document.getElementById('current-color');
    const delBtn = document.getElementById('prop-delete-btn');

    lblInput.disabled = true; angInput.disabled = true; angInput.style.display = 'none'; posInput.disabled = true; posInput.style.display = 'none';
    arrInput.disabled = true; arrInput.style.display = 'none'; rInput.disabled = true; rInput.style.display = 'none';
    saInput.disabled = true; saInput.style.display = 'none'; eaInput.disabled = true; eaInput.style.display = 'none';
    pStyleInput.disabled = true; lStyleInput.disabled = true; delBtn.disabled = true;

    if (selectedPointId !== null) {
        let p = window.points.find(p => p.id === selectedPointId); if(!p) return;
        lblInput.disabled = false; lblInput.value = p.label || "";
        angInput.disabled = false; angInput.style.display = 'inline-block'; angInput.value = p.labelAngle !== undefined ? p.labelAngle : 90;
        pStyleInput.disabled = false; pStyleInput.value = p.style; delBtn.disabled = false;
        clrInput.innerHTML = `<span class="color-box" style="background: ${window.getHexFromName(p.color)};"></span> ${p.color}`;
    } else if (selectedEdgeId !== null) {
        let e = window.edges.find(e => e.id === selectedEdgeId); if(!e) return;
        lblInput.disabled = false; lblInput.value = e.label || "";
        posInput.disabled = false; posInput.style.display = 'inline-block'; posInput.value = e.labelPos || "above";
        delBtn.disabled = false;
        
        if (['line', 'arc', 'elliptic-arc'].includes(e.type)) { arrInput.disabled = false; arrInput.style.display = 'inline-block'; arrInput.value = e.arrow || "none"; }
        if (['arc', 'elliptic-arc'].includes(e.type)) {
            rInput.disabled = false; rInput.style.display = 'inline-block'; rInput.value = e.radius;
            if (e.type === 'elliptic-arc') { rInput.title = "Semi-Major Axis (a)"; rInput.placeholder = "Axis(a)"; } else { rInput.title = "Radius"; rInput.placeholder = "Radius"; }
            saInput.disabled = false; saInput.style.display = 'inline-block'; saInput.value = e.startAngle;
            eaInput.disabled = false; eaInput.style.display = 'inline-block'; eaInput.value = e.endAngle;
        }
        lStyleInput.disabled = false; lStyleInput.value = e.style;
        clrInput.innerHTML = `<span class="color-box" style="background: ${window.getHexFromName(e.color)};"></span> ${e.color}`;
    } else if (selectedTextId !== null) {
        let t = window.texts.find(t => t.id === selectedTextId); if(!t) return;
        lblInput.disabled = false; lblInput.value = t.text || ""; delBtn.disabled = false;
        clrInput.innerHTML = `<span class="color-box" style="background: ${window.getHexFromName(t.color)};"></span> ${t.color}`;
    } else { lblInput.value = ""; }
}

document.getElementById('prop-label').addEventListener('input', (e) => { 
    if (selectedTextId !== null) applyPropertyToSelection('text', e.target.value); 
    else applyPropertyToSelection('label', e.target.value); 
});
document.getElementById('prop-label-angle').addEventListener('input', (e) => applyPropertyToSelection('labelAngle', Number(e.target.value)));
document.getElementById('prop-label-pos').addEventListener('change', (e) => applyPropertyToSelection('labelPos', e.target.value));
document.getElementById('prop-arrow').addEventListener('change', (e) => applyPropertyToSelection('arrow', e.target.value));
document.getElementById('prop-radius').addEventListener('input', (e) => applyPropertyToSelection('radius', Number(e.target.value)));
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
    const mx = e.clientX - canvas.getBoundingClientRect().left; 
    const my = e.clientY - canvas.getBoundingClientRect().top;
    
    let pId = null, tId = null, eId = null;

    let pObj = window.points.find(p => Math.hypot(mathToScreen(p.x, p.y).x - mx, mathToScreen(p.x, p.y).y - my) < 15);
    if (pObj) pId = pObj.id;

    if (pId === null) {
        let tObj = window.texts.find(t => {
            let s = mathToScreen(t.x, t.y); return Math.abs(mx - s.x) < 50 && Math.abs(my - s.y) < 25; 
        });
        if (tObj) tId = tObj.id;
    }

    if (pId === null && tId === null) {
        let eObj = window.edges.find(ed => {
            let p1 = window.points.find(p => p.id === ed.sourceId); let p2 = window.points.find(p => p.id === ed.targetId);
            if(!p1) return false; let s1 = mathToScreen(p1.x, p1.y); 
            if (ed.type === 'line') {
                if(!p2) return false; let s2 = mathToScreen(p2.x, p2.y); return distToSegment(mx, my, s1.x, s1.y, s2.x, s2.y) < 15;
            } else if (ed.type === 'circle') {
                if(!p2) return false; let s2 = mathToScreen(p2.x, p2.y);
                let r = Math.hypot(s2.x - s1.x, s2.y - s1.y); return Math.abs(Math.hypot(s1.x - mx, s1.y - my) - r) < 15; 
            } else if (ed.type === 'arc') {
                let r = ed.radius * getUnitSize(); return Math.abs(Math.hypot(s1.x - mx, s1.y - my) - r) < 15;
            } else if (ed.type === 'elliptic-arc') {
                if(!p2) return false; let s2 = mathToScreen(p2.x, p2.y);
                let sum = Math.hypot(s1.x - mx, s1.y - my) + Math.hypot(s2.x - mx, s2.y - my);
                return Math.abs(sum - (2 * ed.radius * getUnitSize())) < 20; 
            }
            return false;
        });
        if (eObj) eId = eObj.id;
    }

    if (currentMode === 'delete') {
        if (pId !== null) {
            window.points = window.points.filter(p => p.id !== pId);
            window.edges = window.edges.filter(ed => ed.sourceId !== pId && ed.targetId !== pId);
        } else if (tId !== null) { window.texts = window.texts.filter(t => t.id !== tId); }
        else if (eId !== null) { window.edges = window.edges.filter(ed => ed.id !== eId); }
        
        if (selectedPointId === pId) selectedPointId = null;
        if (selectedTextId === tId) selectedTextId = null;
        if (selectedEdgeId === eId) selectedEdgeId = null;
        updatePropertyPanel(); draw(); return;
    }

    if (currentMode === 'select' || currentMode === 'move') {
        selectedPointId = pId; selectedTextId = tId; selectedEdgeId = eId;
        
        if (pId !== null) { if (currentMode === 'move') { isDragging = true; draggedPointId = pId; } } 
        else if (tId !== null) { if (currentMode === 'move') { isDragging = true; draggedTextId = tId; } } 
        else if (eId === null) { isPanning = true; lastPanX = mx; lastPanY = my; canvas.style.cursor = 'grabbing'; }
        
        if (window.updatePropertyPanel) window.updatePropertyPanel();
    } 
    else if (currentMode === 'point' && !pId) {
        let m = screenToMath(mx, my); let newId = window.pointIdCounter++;
        window.points.push({ id: newId, x: m.x, y: m.y, color: window.activeColor, style: 'solid', label: String(window.points.length + 1) });
        selectedPointId = newId; setMode('select', true);
    } 
    else if (currentMode === 'text' && !tId) {
        let m = screenToMath(mx, my);
        let input = document.createElement('input');
        input.id = 'inline-text-editor'; input.type = 'text'; input.placeholder = "Math/Text...";
        input.style.position = 'absolute'; input.style.left = mx + 'px'; input.style.top = my + 'px';
        input.style.transform = 'translate(-50%, -50%)'; input.style.zIndex = '2000';
        input.style.padding = '6px'; input.style.border = '2px solid #007bff'; input.style.borderRadius = '4px';
        document.getElementById('canvas-container').appendChild(input);
        
        setTimeout(() => input.focus(), 50);
        let isFinished = false;
        input.onkeydown = (evt) => { if(evt.key === 'Enter') input.blur(); };
        input.onblur = () => {
            if(isFinished) return; isFinished = true;
            if (input.value) {
                let newId = window.textIdCounter++;
                window.texts.push({ id: newId, x: m.x, y: m.y, text: input.value, color: window.activeColor });
                selectedTextId = newId; setMode('select', true);
            }
            input.remove(); draw();
        };
    } 
    else if (['line', 'circle'].includes(currentMode) && pId !== null) {
        if (selectedPointId === null) selectedPointId = pId;
        else if (selectedPointId !== pId) {
            let newId = window.edgeIdCounter++;
            window.edges.push({ id: newId, type: currentMode, sourceId: selectedPointId, targetId: pId, color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
            selectedPointId = null; selectedEdgeId = newId; setMode('select', true);
        }
    } 
    else if (currentMode === 'arc' && pId !== null) {
        let newId = window.edgeIdCounter++;
        window.edges.push({ id: newId, type: 'arc', sourceId: pId, radius: 2, startAngle: 0, endAngle: 90, color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
        selectedEdgeId = newId; setMode('select', true);
    } 
    else if (currentMode === 'elliptic-arc' && pId !== null) {
        if (selectedPointId === null) selectedPointId = pId;
        else if (selectedPointId !== pId) {
            let p1 = window.points.find(p=>p.id===selectedPointId); let p2 = window.points.find(p=>p.id===pId);
            let c = Math.hypot(p2.x-p1.x, p2.y-p1.y)/2; let newId = window.edgeIdCounter++;
            window.edges.push({ id: newId, type: 'elliptic-arc', sourceId: selectedPointId, targetId: pId, radius: Math.ceil(c+1), startAngle: 0, endAngle: 180, color: window.activeColor, style: 'solid', arrow: 'none', label: "", labelPos: 'above' });
            selectedPointId = null; selectedEdgeId = newId; setMode('select', true);
        }
    }
    draw();
});

canvas.addEventListener('mousemove', (e) => {
    const mx = e.clientX - canvas.getBoundingClientRect().left;
    const my = e.clientY - canvas.getBoundingClientRect().top;
    if (isPanning) {
        originX += (mx - lastPanX); originY += (my - lastPanY);
        lastPanX = mx; lastPanY = my; draw();
    } else if (isDragging) {
        let m = screenToMath(mx, my);
        if (draggedPointId !== null) { let p = window.points.find(p => p.id === draggedPointId); if(p) { p.x = m.x; p.y = m.y; } }
        if (draggedTextId !== null) { let t = window.texts.find(t => t.id === draggedTextId); if(t) { t.x = m.x; t.y = m.y; } }
        draw();
    }
});

window.addEventListener('mouseup', () => { 
    isPanning = false; isDragging = false; draggedPointId = null; draggedTextId = null; activeSnapLineX = null; activeSnapLineY = null; 
    if (currentMode === 'move') canvas.style.cursor = 'grab';
    else if (currentMode === 'select') canvas.style.cursor = 'pointer';
    draw(); 
});

window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
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

    if (document.getElementById('toggle-grid').checked) {
        ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1;
        let sX = originX % u; if (sX < 0) sX += u;
        for (let i = sX; i <= canvasWidth; i += u) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvasHeight); ctx.stroke(); }
        let sY = originY % u; if (sY < 0) sY += u;
        for (let i = sY; i <= canvasHeight; i += u) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvasWidth, i); ctx.stroke(); }
    }

    if (activeSnapLineX !== null || activeSnapLineY !== null) {
        ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(0, 123, 255, 0.4)';
        if (activeSnapLineX !== null) { let sx = originX + activeSnapLineX * u; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, canvasHeight); ctx.stroke(); }
        if (activeSnapLineY !== null) { let sy = originY - activeSnapLineY * u; ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(canvasWidth, sy); ctx.stroke(); }
        ctx.setLineDash([]);
    }

    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(originX, 0); ctx.lineTo(originX, canvasHeight); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, originY); ctx.lineTo(canvasWidth, originY); ctx.stroke();

    window.edges.forEach(e => {
        let p1 = window.points.find(p => p.id === e.sourceId);
        if (!p1) return; let s1 = mathToScreen(p1.x, p1.y); 
        ctx.strokeStyle = e.id === selectedEdgeId ? 'rgba(255, 215, 0, 0.8)' : window.getHexFromName(e.color);
        ctx.lineWidth = e.id === selectedEdgeId ? 5 : 2;
        ctx.setLineDash(e.style === 'dashed' ? [8, 8] : e.style === 'dotted' ? [3, 4] : []);
        ctx.beginPath(); let midX = s1.x; let midY = s1.y;

        if (e.type === 'line') {
            let p2 = window.points.find(p => p.id === e.targetId); if (!p2) return; let s2 = mathToScreen(p2.x, p2.y);
            midX = (s1.x+s2.x)/2; midY = (s1.y+s2.y)/2; ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
            let ang = Math.atan2(s2.y-s1.y, s2.x-s1.x);
            if (['end','both'].includes(e.arrow)) drawArrowhead(ctx, s2.x-5*Math.cos(ang), s2.y-5*Math.sin(ang), ang, ctx.strokeStyle);
            if (['start','both'].includes(e.arrow)) drawArrowhead(ctx, s1.x+5*Math.cos(ang), s1.y+5*Math.sin(ang), ang+Math.PI, ctx.strokeStyle);
        } else if (e.type === 'circle') {
            let p2 = window.points.find(p => p.id === e.targetId); if (!p2) return; let s2 = mathToScreen(p2.x, p2.y); 
            let r = Math.hypot(s2.x-s1.x, s2.y-s1.y); ctx.arc(s1.x, s1.y, r, 0, Math.PI*2); ctx.stroke(); midY -= r;
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
            let oY = e.labelPos === 'above' ? -15 : 15;
            let overlay = document.createElement('div');
            overlay.className = 'math-overlay';
            overlay.style.position = 'absolute';
            overlay.style.left = midX + 'px'; overlay.style.top = (midY + oY) + 'px';
            overlay.style.transform = 'translate(-50%, -50%)';
            overlay.style.color = window.getHexFromName(e.color);
            overlay.style.pointerEvents = 'none'; 
            document.getElementById('canvas-container').appendChild(overlay);
            try { katex.render(e.label, overlay); } catch(err) { overlay.innerText = e.label; }
        }
    });

    window.texts.forEach(t => {
        let s = mathToScreen(t.x, t.y);
        if (t.id === selectedTextId) { ctx.fillStyle = 'rgba(255, 215, 0, 0.4)'; ctx.fillRect(s.x-25, s.y-15, 50, 30); }
        let overlay = document.createElement('div');
        overlay.className = 'math-overlay';
        overlay.style.position = 'absolute';
        overlay.style.left = s.x + 'px'; overlay.style.top = s.y + 'px';
        overlay.style.transform = 'translate(-50%, -50%)';
        overlay.style.color = window.getHexFromName(t.color);
        overlay.style.pointerEvents = 'none'; 
        document.getElementById('canvas-container').appendChild(overlay);
        try { katex.render(t.text, overlay); } catch(err) { overlay.innerText = t.text; }
    });

    window.points.forEach(p => {
        let s = mathToScreen(p.x, p.y);
        ctx.fillStyle = p.style === 'solid' ? (p.id === selectedPointId ? 'gold' : window.getHexFromName(p.color)) : 'white';
        ctx.strokeStyle = p.id === selectedPointId ? 'gold' : window.getHexFromName(p.color);
        ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI*2); ctx.fill(); ctx.stroke();

        if (p.label) {
            let r = (p.labelAngle !== undefined ? p.labelAngle : 90) * Math.PI/180;
            let overlay = document.createElement('div');
            overlay.className = 'math-overlay';
            overlay.style.position = 'absolute';
            overlay.style.left = (s.x + Math.cos(r)*20) + 'px'; overlay.style.top = (s.y - Math.sin(r)*20) + 'px';
            overlay.style.transform = 'translate(-50%, -50%)';
            overlay.style.color = '#333';
            overlay.style.pointerEvents = 'none'; 
            document.getElementById('canvas-container').appendChild(overlay);
            try { katex.render(p.label, overlay); } catch(err) { overlay.innerText = p.label; }
        }
    });

    if (window.generateCode) window.generateCode();
};

window.exportJSON = function() {
    let a = document.createElement('a'); a.download = "graph_data.json";
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({points: window.points, edges: window.edges, texts: window.texts, originX, originY, zoom: window.zoom}, null, 2)); a.click();
}
window.importJSON = function(e) {
    let reader = new FileReader();
    reader.onload = function(ev) {
        let obj = JSON.parse(ev.target.result); window.points = obj.points || []; window.edges = obj.edges || []; window.texts = obj.texts || [];
        if (obj.originX !== undefined) originX = obj.originX; if (obj.originY !== undefined) originY = obj.originY; if (obj.zoom !== undefined) window.zoom = obj.zoom;
        window.pointIdCounter = window.points.length ? Math.max(...window.points.map(p=>p.id))+1 : 0; 
        window.edgeIdCounter = window.edges.length ? Math.max(...window.edges.map(e=>e.id))+1 : 0; 
        window.textIdCounter = window.texts.length ? Math.max(...window.texts.map(t=>t.id))+1 : 0;
        draw();
    }; reader.readAsText(e.target.files[0]);
}