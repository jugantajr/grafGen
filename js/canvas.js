const canvas = document.getElementById('graphCanvas');
const ctx = canvas.getContext('2d');
const cssSize = 600;
const dpr = window.devicePixelRatio || 1;
canvas.width = cssSize * dpr; canvas.height = cssSize * dpr;
canvas.style.width = cssSize + 'px'; canvas.style.height = cssSize + 'px';
ctx.scale(dpr, dpr);

const baseUnitSize = 50; 
const originX = cssSize / 2; const originY = cssSize / 2;

// State Data
let points = []; 
let edges = []; // lines, arrows, circles, parabolas, arcs
let texts = []; 
let pointIdCounter = 0; let edgeIdCounter = 0; let textIdCounter = 0;

let currentMode = 'point'; 
let selectedPointId = null; let selectedEdgeId = null; let selectedTextId = null;
let isDragging = false; let draggedPointId = null; let draggedTextId = null;
let arcStep = 0; let arcStartPointId = null;

function getUnitSize() { return baseUnitSize * zoom; }

function screenToMath(sx, sy) {
    let u = getUnitSize();
    let mx = (sx - originX) / u;
    let my = (originY - sy) / u;
    if (document.getElementById('snap-grid').checked) {
        mx = Math.round(mx * 2) / 2; my = Math.round(my * 2) / 2;
    }
    return { x: mx, y: my };
}

function mathToScreen(mx, my) {
    let u = getUnitSize();
    return { x: originX + (mx * u), y: originY - (my * u) };
}

// Universal Property Updater
window.applyPropertyToSelection = function(prop, value) {
    if (currentMode === 'select') {
        if (selectedPointId !== null) points.find(p => p.id === selectedPointId)[prop] = value;
        if (selectedEdgeId !== null) edges.find(e => e.id === selectedEdgeId)[prop] = value;
        if (selectedTextId !== null) texts.find(t => t.id === selectedTextId)[prop] = value;
        draw();
    }
};

function updatePropertyPanel() {
    const lblInput = document.getElementById('prop-label');
    const posInput = document.getElementById('prop-label-pos');
    const styleInput = document.getElementById('item-style');
    const clrInput = document.getElementById('current-color');

    if (selectedPointId !== null) {
        let p = points.find(p => p.id === selectedPointId);
        lblInput.disabled = false; lblInput.value = p.label; posInput.disabled = true;
        styleInput.disabled = false; styleInput.value = p.style;
        clrInput.innerHTML = `<span class="color-box" style="background: ${getHexFromName(p.color)};"></span> ${p.color}`;
    } else if (selectedEdgeId !== null) {
        let e = edges.find(e => e.id === selectedEdgeId);
        lblInput.disabled = false; lblInput.value = e.label || ""; posInput.disabled = false; posInput.value = e.labelPos || "above";
        styleInput.disabled = false; styleInput.value = e.style;
        clrInput.innerHTML = `<span class="color-box" style="background: ${getHexFromName(e.color)};"></span> ${e.color}`;
    } else if (selectedTextId !== null) {
        let t = texts.find(t => t.id === selectedTextId);
        lblInput.disabled = false; lblInput.value = t.text; posInput.disabled = true; styleInput.disabled = true;
        clrInput.innerHTML = `<span class="color-box" style="background: ${getHexFromName(t.color)};"></span> ${t.color}`;
    } else {
        lblInput.disabled = true; lblInput.value = ""; posInput.disabled = true;
    }
}

// Event Listeners for UI panel
document.getElementById('prop-label').addEventListener('input', (e) => {
    if (selectedTextId !== null) applyPropertyToSelection('text', e.target.value);
    else applyPropertyToSelection('label', e.target.value);
});
document.getElementById('prop-label-pos').addEventListener('change', (e) => applyPropertyToSelection('labelPos', e.target.value));
document.getElementById('item-style').addEventListener('change', (e) => applyPropertyToSelection('style', e.target.value));

function setMode(mode) {
    currentMode = mode; selectedPointId = null; selectedEdgeId = null; selectedTextId = null; arcStep = 0;
    document.querySelectorAll('.tool-group button').forEach(btn => btn.classList.remove('active'));
    let btn = document.getElementById(`mode-${mode}`);
    if(btn) btn.classList.add('active');
    canvas.style.cursor = mode === 'move' ? 'grab' : mode === 'select' ? 'pointer' : mode === 'text' ? 'text' : 'crosshair';
    updatePropertyPanel(); draw();
}

// True Distance from Point to Line Segment Math
function distToSegment(px, py, x1, y1, x2, y2) {
    let A = px - x1; let B = py - y1;
    let C = x2 - x1; let D = y2 - y1;
    let dot = A * C + B * D;
    let len_sq = C * C + D * D;
    let param = len_sq !== 0 ? dot / len_sq : -1;
    let xx, yy;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }
    return Math.hypot(px - xx, py - yy);
}

// Mouse Down
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left; const my = e.clientY - rect.top;

    let clkPoint = points.find(p => Math.hypot(mathToScreen(p.x, p.y).x - mx, mathToScreen(p.x, p.y).y - my) < 12);
    
    let clkText = texts.find(t => {
        let s = mathToScreen(t.x, t.y);
        ctx.font = 'bold 15px Arial'; let width = ctx.measureText(t.text).width;
        return mx > s.x - width/2 - 10 && mx < s.x + width/2 + 10 && my > s.y - 12 && my < s.y + 12;
    });

    let clkEdge = null;
    if (!clkPoint && !clkText) {
        clkEdge = edges.find(ed => {
            let p1 = points.find(p => p.id === ed.sourceId); let p2 = points.find(p => p.id === ed.targetId);
            if(!p1 || !p2) return false;
            let s1 = mathToScreen(p1.x, p1.y); let s2 = mathToScreen(p2.x, p2.y);
            
            if (ed.type === 'line' || ed.type === 'arrow') {
                return distToSegment(mx, my, s1.x, s1.y, s2.x, s2.y) < 8; // 8 pixel selection radius around the line
            } else if (ed.type === 'circle' || ed.type === 'arc') {
                let r = Math.hypot(s2.x - s1.x, s2.y - s1.y);
                return Math.abs(Math.hypot(s1.x - mx, s1.y - my) - r) < 8; 
            } else if (ed.type === 'parabola') {
                return Math.hypot((s1.x+s2.x)/2 - mx, (s1.y+s2.y)/2 - my) < 15;
            } return false;
        });
    }

    let pId = clkPoint ? clkPoint.id : null;
    let eId = clkEdge ? clkEdge.id : null;
    let tId = clkText ? clkText.id : null;

    if (currentMode === 'point' && !pId) {
        let coords = screenToMath(mx, my);
        points.push({ id: pointIdCounter++, x: coords.x, y: coords.y, angle: 90, style: document.getElementById('item-style').value, color: activeColor, label: `P_{${points.length + 1}}` });
    } 
    else if (currentMode === 'text' && !pId && !tId) {
        let coords = screenToMath(mx, my);
        let val = prompt("Enter text/equation:");
        if (val) texts.push({ id: textIdCounter++, x: coords.x, y: coords.y, text: val, color: activeColor });
    }
    else if (['line', 'arrow', 'circle', 'parabola'].includes(currentMode)) {
        if (pId !== null) {
            if (selectedPointId === null) {
                selectedPointId = pId; // Select first point
            } else if (selectedPointId !== pId) {
                edges.push({ id: edgeIdCounter++, type: currentMode, sourceId: selectedPointId, targetId: pId, style: document.getElementById('item-style').value, color: activeColor, label: "", labelPos: "above" });
                selectedPointId = null; // Reset after connecting
            }
        } else {
            selectedPointId = null; // Clicked empty space, cancel line drawing
        }
    }
    else if (currentMode === 'arc') {
        if (pId !== null) {
            if (arcStep === 0) { selectedPointId = pId; arcStep = 1; }
            else if (arcStep === 1 && pId !== selectedPointId) { arcStartPointId = pId; arcStep = 2; }
            else if (arcStep === 2 && pId !== selectedPointId && pId !== arcStartPointId) {
                edges.push({ id: edgeIdCounter++, type: 'arc', sourceId: selectedPointId, targetId: arcStartPointId, thirdId: pId, style: document.getElementById('item-style').value, color: activeColor, label: "", labelPos: "above" });
                selectedPointId = null; arcStartPointId = null; arcStep = 0;
            }
        }
    }
    else if (currentMode === 'select') {
        selectedPointId = pId; selectedEdgeId = eId; selectedTextId = tId; 
        updatePropertyPanel();
    }
    else if (currentMode === 'move') {
        if (pId !== null) { isDragging = true; draggedPointId = pId; canvas.style.cursor = 'grabbing'; }
        else if (tId !== null) { isDragging = true; draggedTextId = tId; canvas.style.cursor = 'grabbing'; }
    }
    draw();
});

canvas.addEventListener('mousemove', (e) => {
    if (isDragging) {
        const rect = canvas.getBoundingClientRect();
        let coords = screenToMath(e.clientX - rect.left, e.clientY - rect.top);
        if (draggedPointId !== null) { let p = points.find(p => p.id === draggedPointId); if (p) { p.x = coords.x; p.y = coords.y; draw(); } }
        else if (draggedTextId !== null) { let t = texts.find(t => t.id === draggedTextId); if (t) { t.x = coords.x; t.y = coords.y; draw(); } }
    }
});

window.addEventListener('mouseup', () => { isDragging = false; draggedPointId = null; draggedTextId = null; if(currentMode==='move') canvas.style.cursor='grab'; draw(); });

// KEYBOARD DELETE LOGIC
window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedPointId !== null) {
            points = points.filter(p => p.id !== selectedPointId);
            edges = edges.filter(e => e.sourceId !== selectedPointId && e.targetId !== selectedPointId && e.thirdId !== selectedPointId);
            selectedPointId = null;
        } else if (selectedEdgeId !== null) { edges = edges.filter(e => e.id !== selectedEdgeId); selectedEdgeId = null; }
          else if (selectedTextId !== null) { texts = texts.filter(t => t.id !== selectedTextId); selectedTextId = null; }
        updatePropertyPanel(); draw();
    }
});

window.exportJSON = function() {
    let a = document.createElement('a'); a.download = "graph_data.json";
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({points, edges, texts}, null, 2));
    a.click();
}
window.importJSON = function(e) {
    let reader = new FileReader();
    reader.onload = function(ev) {
        let obj = JSON.parse(ev.target.result);
        points = obj.points || []; edges = obj.edges || []; texts = obj.texts || [];
        pointIdCounter = points.length ? Math.max(...points.map(p=>p.id))+1 : 0;
        edgeIdCounter = edges.length ? Math.max(...edges.map(e=>e.id))+1 : 0;
        textIdCounter = texts.length ? Math.max(...texts.map(t=>t.id))+1 : 0;
        draw();
    }; reader.readAsText(e.target.files[0]);
}

// Arrow Drawing Helper
function drawArrowhead(ctx, x, y, angle, color) {
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 12 * Math.cos(angle - Math.PI/6), y - 12 * Math.sin(angle - Math.PI/6));
    ctx.lineTo(x - 12 * Math.cos(angle + Math.PI/6), y - 12 * Math.sin(angle + Math.PI/6));
    ctx.fill();
}

window.draw = function() {
    ctx.clearRect(0, 0, cssSize, cssSize);
    let u = getUnitSize();

    if (document.getElementById('toggle-grid').checked) {
        ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1;
        for (let i = originX % u; i <= cssSize; i += u) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, cssSize); ctx.stroke(); }
        for (let i = originY % u; i <= cssSize; i += u) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(cssSize, i); ctx.stroke(); }
    }
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(originX, 0); ctx.lineTo(originX, cssSize); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, originY); ctx.lineTo(cssSize, originY); ctx.stroke();

    edges.forEach(edge => {
        let p1 = points.find(p => p.id === edge.sourceId); let p2 = points.find(p => p.id === edge.targetId);
        if (!p1 || !p2) return;
        let s1 = mathToScreen(p1.x, p1.y); let s2 = mathToScreen(p2.x, p2.y);

        ctx.strokeStyle = edge.id === selectedEdgeId ? 'rgba(255, 215, 0, 0.8)' : getHexFromName(edge.color);
        ctx.lineWidth = edge.id === selectedEdgeId ? 5 : 2;
        ctx.setLineDash(edge.style === 'dashed' ? [8, 8] : edge.style === 'dotted' ? [3, 4] : []);
        
        ctx.beginPath();
        let midX = (s1.x + s2.x)/2; let midY = (s1.y + s2.y)/2;

        if (edge.type === 'line' || edge.type === 'arrow') {
            ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y);
            ctx.stroke();
            if (edge.type === 'arrow') {
                let angle = Math.atan2(s2.y - s1.y, s2.x - s1.x);
                let pullBackX = s2.x - 5 * Math.cos(angle); let pullBackY = s2.y - 5 * Math.sin(angle);
                drawArrowhead(ctx, pullBackX, pullBackY, angle, ctx.strokeStyle);
            }
        } else if (edge.type === 'circle') {
            let r = Math.hypot(s2.x - s1.x, s2.y - s1.y);
            ctx.arc(s1.x, s1.y, r, 0, Math.PI*2); ctx.stroke();
            midX = s1.x; midY = s1.y - r; 
        } else if (edge.type === 'parabola') {
            ctx.moveTo(s1.x, s1.y); ctx.quadraticCurveTo(s2.x, s1.y, s2.x, s2.y); ctx.stroke();
        } else if (edge.type === 'arc') {
            let p3 = points.find(p => p.id === edge.thirdId);
            if(p3) {
                let s3 = mathToScreen(p3.x, p3.y);
                let r = Math.hypot(s2.x - s1.x, s2.y - s1.y);
                let startAng = Math.atan2(s2.y - s1.y, s2.x - s1.x); let endAng = Math.atan2(s3.y - s1.y, s3.x - s1.x);
                ctx.arc(s1.x, s1.y, r, startAng, endAng, true); ctx.stroke();
                midX = s1.x + Math.cos((startAng+endAng)/2) * r; midY = s1.y + Math.sin((startAng+endAng)/2) * r;
            }
        }
        ctx.setLineDash([]); 

        // Force label drawing if it exists
        if (edge.label && edge.label.trim() !== "") {
            ctx.font = 'bold 13px Arial'; let metrics = ctx.measureText(edge.label);
            ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(midX - metrics.width/2 - 2, midY - 8, metrics.width + 4, 16);
            ctx.fillStyle = getHexFromName(edge.color); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(edge.label, midX, midY);
        }
    });

    texts.forEach(t => {
        let s = mathToScreen(t.x, t.y);
        ctx.font = 'bold 15px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (t.id === selectedTextId) {
            let w = ctx.measureText(t.text).width;
            ctx.fillStyle = 'rgba(255, 215, 0, 0.4)'; ctx.fillRect(s.x - w/2 - 4, s.y - 12, w + 8, 24);
        }
        ctx.fillStyle = getHexFromName(t.color); ctx.fillText(t.text, s.x, s.y);
    });

    points.forEach((p) => {
        let s = mathToScreen(p.x, p.y); let hex = getHexFromName(p.color);
        ctx.fillStyle = p.style === 'solid' ? (p.id === selectedPointId ? '#ffda00' : hex) : 'white';
        ctx.strokeStyle = p.id === selectedPointId ? (p.style === 'solid' ? '#b39900' : '#ffda00') : hex;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

        if (p.label !== "") {
            let rad = p.angle * (Math.PI / 180);
            ctx.fillStyle = '#333'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(p.label, s.x + Math.cos(rad) * 18, s.y - Math.sin(rad) * 18);
        }
    });

    if(typeof generateCode === 'function') generateCode();
};

setMode('point');