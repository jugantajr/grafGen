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
let pointIdCounter = 0; let edgeIdCounter = 0; let textIdCounter = 0;

let currentMode = 'point'; 
let selectedPointId = null; let selectedEdgeId = null; let selectedTextId = null;
let isDragging = false; let draggedPointId = null; let draggedTextId = null;
let isPanning = false; let lastPanX = 0; let lastPanY = 0;
let arcStep = 0; let arcStartPointId = null;

function getUnitSize() { return baseUnitSize * window.zoom; }
window.zoomIn = function() { window.zoom *= 1.2; draw(); }
window.zoomOut = function() { window.zoom *= 0.8; draw(); }

function screenToMath(sx, sy) {
    let u = getUnitSize(); let mx = (sx - originX) / u; let my = (originY - sy) / u;
    if (document.getElementById('snap-grid').checked) { mx = Math.round(mx * 2) / 2; my = Math.round(my * 2) / 2; }
    return { x: mx, y: my };
}

function mathToScreen(mx, my) { return { x: originX + (mx * getUnitSize()), y: originY - (my * getUnitSize()) }; }

window.applyPropertyToSelection = function(prop, value) {
    if (currentMode === 'select') {
        if (selectedPointId !== null) window.points.find(p => p.id === selectedPointId)[prop] = value;
        if (selectedEdgeId !== null) window.edges.find(e => e.id === selectedEdgeId)[prop] = value;
        if (selectedTextId !== null) window.texts.find(t => t.id === selectedTextId)[prop] = value;
        draw();
    }
};

function updatePropertyPanel() {
    const lblInput = document.getElementById('prop-label'); const angInput = document.getElementById('prop-label-angle');
    const posInput = document.getElementById('prop-label-pos'); const arrInput = document.getElementById('prop-arrow');
    const rInput = document.getElementById('prop-radius'); const saInput = document.getElementById('prop-angle-start');
    const eaInput = document.getElementById('prop-angle-end'); const pStyleInput = document.getElementById('point-style');
    const lStyleInput = document.getElementById('line-style'); const clrInput = document.getElementById('current-color');

    lblInput.disabled = true; angInput.disabled = true; angInput.style.display = 'none'; posInput.disabled = true; posInput.style.display = 'none';
    arrInput.disabled = true; arrInput.style.display = 'none'; rInput.disabled = true; rInput.style.display = 'none';
    saInput.disabled = true; saInput.style.display = 'none'; eaInput.disabled = true; eaInput.style.display = 'none';
    pStyleInput.disabled = true; lStyleInput.disabled = true;

    if (selectedPointId !== null) {
        let p = window.points.find(p => p.id === selectedPointId);
        lblInput.disabled = false; lblInput.value = p.label;
        angInput.disabled = false; angInput.style.display = 'inline-block'; angInput.value = p.labelAngle || 90;
        pStyleInput.disabled = false; pStyleInput.value = p.style;
        clrInput.innerHTML = `<span class="color-box" style="background: ${window.getHexFromName(p.color)};"></span> ${p.color}`;
    } else if (selectedEdgeId !== null) {
        let e = window.edges.find(e => e.id === selectedEdgeId);
        lblInput.disabled = false; lblInput.value = e.label || "";
        posInput.disabled = false; posInput.style.display = 'inline-block'; posInput.value = e.labelPos || "above";
        if (['line','arc','elliptic-arc'].includes(e.type)) { arrInput.disabled = false; arrInput.style.display = 'inline-block'; arrInput.value = e.arrow || "none"; }
        if (['arc','elliptic-arc'].includes(e.type)) {
            rInput.disabled = false; rInput.style.display = 'inline-block'; rInput.value = e.radius;
            saInput.disabled = false; saInput.style.display = 'inline-block'; saInput.value = e.startAngle;
            eaInput.disabled = false; eaInput.style.display = 'inline-block'; eaInput.value = e.endAngle;
        }
        lStyleInput.disabled = false; lStyleInput.value = e.style;
        clrInput.innerHTML = `<span class="color-box" style="background: ${window.getHexFromName(e.color)};"></span> ${e.color}`;
    } else if (selectedTextId !== null) {
        let t = window.texts.find(t => t.id === selectedTextId);
        lblInput.disabled = false; lblInput.value = t.text;
        clrInput.innerHTML = `<span class="color-box" style="background: ${window.getHexFromName(t.color)};"></span> ${t.color}`;
    } else { lblInput.value = ""; }
}

document.getElementById('prop-label').addEventListener('input', (e) => { if (selectedTextId !== null) applyPropertyToSelection('text', e.target.value); else applyPropertyToSelection('label', e.target.value); });
document.getElementById('prop-label-angle').addEventListener('input', (e) => applyPropertyToSelection('labelAngle', Number(e.target.value)));
document.getElementById('prop-label-pos').addEventListener('change', (e) => applyPropertyToSelection('labelPos', e.target.value));
document.getElementById('prop-arrow').addEventListener('change', (e) => applyPropertyToSelection('arrow', e.target.value));
document.getElementById('prop-radius').addEventListener('input', (e) => applyPropertyToSelection('radius', Number(e.target.value)));
document.getElementById('prop-angle-start').addEventListener('input', (e) => applyPropertyToSelection('startAngle', Number(e.target.value)));
document.getElementById('prop-angle-end').addEventListener('input', (e) => applyPropertyToSelection('endAngle', Number(e.target.value)));
document.getElementById('point-style').addEventListener('change', (e) => applyPropertyToSelection('style', e.target.value));
document.getElementById('line-style').addEventListener('change', (e) => applyPropertyToSelection('style', e.target.value));

window.setMode = function(mode) {
    currentMode = mode; selectedPointId = null; selectedEdgeId = null; selectedTextId = null; arcStep = 0;
    document.querySelectorAll('.tool-group button').forEach(btn => btn.classList.remove('active'));
    let btn = document.getElementById(`mode-${mode}`); if(btn) btn.classList.add('active');
    canvas.style.cursor = mode === 'move' ? 'grab' : mode === 'select' ? 'pointer' : mode === 'text' ? 'text' : 'crosshair';
    updatePropertyPanel(); draw();
}

// Distance helper
function distToSegment(px, py, x1, y1, x2, y2) {
    let l2 = (x2-x1)**2 + (y2-y1)**2;
    if (l2 === 0) return Math.hypot(px-x1, py-y1);
    let t = Math.max(0, Math.min(1, ((px-x1)*(x2-x1) + (py-y1)*(y2-y1)) / l2));
    return Math.hypot(px - (x1 + t*(x2-x1)), py - (y1 + t*(y2-y1)));
}

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
    const mx = e.clientX - canvas.getBoundingClientRect().left; const my = e.clientY - canvas.getBoundingClientRect().top;

    let pId = null, eId = null, tId = null;

    // 1. SELECT POINTS (Highest priority)
    let pObj = window.points.find(p => {
        let s = mathToScreen(p.x, p.y);
        return Math.hypot(s.x - mx, s.y - my) < 15;
    });
    if (pObj) pId = pObj.id;

    // 2. SELECT TEXT
    if (!pId) {
        let tObj = window.texts.find(t => {
            let s = mathToScreen(t.x, t.y); ctx.font = 'bold 15px Arial'; let w = ctx.measureText(t.text).width;
            return mx > s.x-w/2-10 && mx < s.x+w/2+10 && my > s.y-12 && my < s.y+12;
        });
        if (tObj) tId = tObj.id;
    }

    // 3. SELECT EDGES (Lines, Arcs)
    if (!pId && !tId) {
        let eObj = window.edges.find(ed => {
            let p1 = window.points.find(p => p.id === ed.sourceId);
            if(!p1) return false;
            let s1 = mathToScreen(p1.x, p1.y);

            if (ed.type === 'line' || ed.type === 'circle') {
                let p2 = window.points.find(p => p.id === ed.targetId);
                if(!p2) return false;
                let s2 = mathToScreen(p2.x, p2.y);
                if (ed.type === 'line') return distToSegment(mx, my, s1.x, s1.y, s2.x, s2.y) < 15;
                let r = Math.hypot(s2.x - s1.x, s2.y - s1.y);
                return Math.abs(Math.hypot(s1.x - mx, s1.y - my) - r) < 15;
            } else if (ed.type === 'arc') {
                let r = ed.radius * getUnitSize();
                return Math.abs(Math.hypot(s1.x - mx, s1.y - my) - r) < 15;
            } else if (ed.type === 'elliptic-arc') {
                let p2 = window.points.find(p => p.id === ed.targetId);
                if(!p2) return false;
                let s2 = mathToScreen(p2.x, p2.y);
                let distSum = Math.hypot(s1.x - mx, s1.y - my) + Math.hypot(s2.x - mx, s2.y - my);
                return Math.abs(distSum - (2 * ed.radius * getUnitSize())) < 20;
            }
        });
        if (eObj) eId = eObj.id;
    }

    // Panning & Selection
    if (currentMode === 'select') {
        selectedPointId = pId; selectedEdgeId = eId; selectedTextId = tId;
        updatePropertyPanel();
        if (!pId && !eId && !tId) {
            isPanning = true; lastPanX = mx; lastPanY = my; canvas.style.cursor = 'grabbing';
        }
    } else if (currentMode === 'move') {
        if (pId !== null) { isDragging = true; draggedPointId = pId; }
        else if (tId !== null) { isDragging = true; draggedTextId = tId; }
        else { isPanning = true; lastPanX = mx; lastPanY = my; }
    } else if (currentMode === 'point' && !pId) {
        let coords = screenToMath(mx, my); let newId = pointIdCounter++;
        window.points.push({ id: newId, x: coords.x, y: coords.y, labelAngle: 90, style: document.getElementById('point-style').value, color: window.activeColor, label: String(window.points.length + 1) });
        selectedPointId = newId; setMode('select');
    } else if (currentMode === 'text') {
        let coords = screenToMath(mx, my); 
        let input = document.createElement('input'); input.id = 'inline-text-editor'; input.type = 'text';
        input.style.position = 'absolute'; input.style.left = mx + 'px'; input.style.top = my + 'px'; input.style.transform = 'translate(-50%, -50%)'; 
        document.getElementById('canvas-container').appendChild(input);
        setTimeout(() => input.focus(), 50);
        function finalizeText() {
            if (input.value.trim() !== '') { 
                let newId = textIdCounter++; window.texts.push({ id: newId, x: coords.x, y: coords.y, text: input.value.trim(), color: window.activeColor }); 
                selectedTextId = newId; setMode('select');
            }
            if (input.parentNode) input.parentNode.removeChild(input); draw();
        }
        input.addEventListener('blur', finalizeText);
        input.addEventListener('keydown', (evt) => { if (evt.key === 'Enter') finalizeText(); });
    } else if (['line', 'circle'].includes(currentMode)) {
        if (pId !== null) {
            if (selectedPointId === null) selectedPointId = pId;
            else if (selectedPointId !== pId) { 
                let newId = edgeIdCounter++;
                window.edges.push({ id: newId, type: currentMode, sourceId: selectedPointId, targetId: pId, style: document.getElementById('line-style').value, color: window.activeColor, arrow: 'none', label: "", labelPos: "above" }); 
                selectedEdgeId = newId; setMode('select');
            }
        }
    } else if (currentMode === 'arc' && pId !== null) {
        let newId = edgeIdCounter++;
        window.edges.push({ id: newId, type: 'arc', sourceId: pId, radius: 2, startAngle: 0, endAngle: 90, arrow: 'none', style: document.getElementById('line-style').value, color: window.activeColor, label: "", labelPos: "above" });
        selectedEdgeId = newId; setMode('select');
    } else if (currentMode === 'elliptic-arc') {
        if (pId !== null) {
            if (arcStep === 0) { selectedPointId = pId; arcStep = 1; }
            else if (arcStep === 1 && pId !== selectedPointId) {
                let newId = edgeIdCounter++;
                window.edges.push({ id: newId, type: 'elliptic-arc', sourceId: selectedPointId, targetId: pId, radius: 3, startAngle: 0, endAngle: 180, arrow: 'none', style: document.getElementById('line-style').value, color: window.activeColor, label: "", labelPos: "above" });
                selectedEdgeId = newId; setMode('select');
            }
        }
    }
    draw();
});

canvas.addEventListener('mousemove', (e) => {
    const mx = e.clientX - canvas.getBoundingClientRect().left; const my = e.clientY - canvas.getBoundingClientRect().top;
    if (isPanning) { originX += (mx - lastPanX); originY += (my - lastPanY); lastPanX = mx; lastPanY = my; draw(); return; }
    if (isDragging) {
        let coords = screenToMath(mx, my);
        if (draggedPointId !== null) { let p = window.points.find(p => p.id === draggedPointId); if (p) { p.x = coords.x; p.y = coords.y; } }
        else if (draggedTextId !== null) { let t = window.texts.find(t => t.id === draggedTextId); if (t) { t.x = coords.x; t.y = coords.y; } }
        draw();
    }
});

window.addEventListener('mouseup', () => { isPanning = false; isDragging = false; draggedPointId = null; draggedTextId = null; draw(); });

window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedPointId !== null) { window.points = window.points.filter(p => p.id !== selectedPointId); window.edges = window.edges.filter(e => e.sourceId !== selectedPointId && e.targetId !== selectedPointId); selectedPointId = null; } 
        else if (selectedEdgeId !== null) { window.edges = window.edges.filter(e => e.id !== selectedEdgeId); selectedEdgeId = null; }
        else if (selectedTextId !== null) { window.texts = window.texts.filter(t => t.id !== selectedTextId); selectedTextId = null; }
        updatePropertyPanel(); draw();
    }
});

function drawArrowhead(ctx, x, y, angle, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x - 12 * Math.cos(angle - Math.PI/6), y - 12 * Math.sin(angle - Math.PI/6));
    ctx.lineTo(x - 12 * Math.cos(angle + Math.PI/6), y - 12 * Math.sin(angle + Math.PI/6)); ctx.fill();
}

window.draw = function() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    let u = getUnitSize();
    if (document.getElementById('toggle-grid').checked) {
        ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1;
        let sX = originX % u; if (sX < 0) sX += u;
        for (let i = sX; i <= canvasWidth; i += u) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvasHeight); ctx.stroke(); }
        let sY = originY % u; if (sY < 0) sY += u;
        for (let i = sY; i <= canvasHeight; i += u) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvasWidth, i); ctx.stroke(); }
    }
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2;
    if (originX > 0 && originX < canvasWidth) { ctx.beginPath(); ctx.moveTo(originX, 0); ctx.lineTo(originX, canvasHeight); ctx.stroke(); }
    if (originY > 0 && originY < canvasHeight) { ctx.beginPath(); ctx.moveTo(0, originY); ctx.lineTo(canvasWidth, originY); ctx.stroke(); }

    window.edges.forEach(edge => {
        let p1 = window.points.find(p => p.id === edge.sourceId);
        if (!p1) return; let s1 = mathToScreen(p1.x, p1.y); 
        ctx.strokeStyle = edge.id === selectedEdgeId ? 'rgba(255, 215, 0, 0.8)' : window.getHexFromName(edge.color);
        ctx.lineWidth = edge.id === selectedEdgeId ? 5 : 2;
        ctx.setLineDash(edge.style === 'dashed' ? [8, 8] : edge.style === 'dotted' ? [3, 4] : []);
        ctx.beginPath(); let midX = s1.x; let midY = s1.y;

        if (edge.type === 'line') {
            let p2 = window.points.find(p => p.id === edge.targetId); if (!p2) return;
            let s2 = mathToScreen(p2.x, p2.y); midX = (s1.x+s2.x)/2; midY = (s1.y+s2.y)/2;
            ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
            let ang = Math.atan2(s2.y-s1.y, s2.x-s1.x);
            if (['end','both'].includes(edge.arrow)) drawArrowhead(ctx, s2.x-5*Math.cos(ang), s2.y-5*Math.sin(ang), ang, ctx.strokeStyle);
            if (['start','both'].includes(edge.arrow)) drawArrowhead(ctx, s1.x+5*Math.cos(ang), s1.y+5*Math.sin(ang), ang+Math.PI, ctx.strokeStyle);
        } else if (edge.type === 'circle') {
            let p2 = window.points.find(p => p.id === edge.targetId); if (!p2) return;
            let s2 = mathToScreen(p2.x, p2.y); let r = Math.hypot(s2.x-s1.x, s2.y-s1.y);
            ctx.arc(s1.x, s1.y, r, 0, Math.PI*2); ctx.stroke(); midY -= r;
        } else if (edge.type === 'arc') {
            let r = edge.radius * u; ctx.arc(s1.x, s1.y, r, -edge.startAngle*Math.PI/180, -edge.endAngle*Math.PI/180, true); ctx.stroke();
            let mA = -(edge.startAngle+edge.endAngle)/2 * Math.PI/180; midX = s1.x+Math.cos(mA)*r; midY = s1.y+Math.sin(mA)*r;
        } else if (edge.type === 'elliptic-arc') {
            let p2 = window.points.find(p => p.id === edge.targetId); if (!p2) return;
            let s2 = mathToScreen(p2.x, p2.y); let c = Math.hypot(p2.x-p1.x, p2.y-p1.y)/2;
            let a = Math.max(edge.radius, c+0.01); let b = Math.sqrt(a*a - c*c);
            let rot = Math.atan2(s2.y-s1.y, s2.x-s1.x); let cx = (s1.x+s2.x)/2; let cy = (s1.y+s2.y)/2;
            ctx.ellipse(cx, cy, a*u, b*u, rot, -edge.startAngle*Math.PI/180, -edge.endAngle*Math.PI/180, true); ctx.stroke();
        }
        ctx.setLineDash([]);
        if (edge.label) {
            ctx.font = 'bold 13px Arial'; let m = ctx.measureText(edge.label);
            let oY = edge.labelPos === 'above' ? -15 : 15;
            ctx.fillStyle = 'white'; ctx.fillRect(midX-m.width/2-2, midY+oY-8, m.width+4, 16);
            ctx.fillStyle = 'black'; ctx.textAlign='center'; ctx.fillText(edge.label, midX, midY+oY+4);
        }
    });

    window.texts.forEach(t => {
        let s = mathToScreen(t.x, t.y); ctx.font = 'bold 15px Arial';
        if (t.id === selectedTextId) { let w = ctx.measureText(t.text).width; ctx.fillStyle = 'rgba(255, 215, 0, 0.4)'; ctx.fillRect(s.x-w/2-4, s.y-12, w+8, 24); }
        ctx.fillStyle = window.getHexFromName(t.color); ctx.textAlign='center'; ctx.fillText(t.text, s.x, s.y);
    });

    window.points.forEach(p => {
        let s = mathToScreen(p.x, p.y);
        ctx.fillStyle = p.style === 'solid' ? (p.id === selectedPointId ? 'gold' : window.getHexFromName(p.color)) : 'white';
        ctx.strokeStyle = p.id === selectedPointId ? 'gold' : window.getHexFromName(p.color);
        ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        if (p.label) {
            let r = (p.labelAngle || 90) * Math.PI/180;
            ctx.fillStyle = 'black'; ctx.font = '13px Arial';
            ctx.fillText(p.label, s.x + Math.cos(r)*18, s.y - Math.sin(r)*18);
        }
    });

    window.generateCode();
};