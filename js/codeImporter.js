const PROGRAPH_IMPORT_STATUS_KEY = 'prograph_last_import_text';

function importerSetStatus(message, isError = false) {
    const el = document.getElementById('import-status');
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? '#c62828' : '';
}

function importerNormalize(text) {
    return String(text || '')
        .replace(/\r\n?/g, '\n')
        .replace(/%[^\n]*/g, line => line.startsWith('\%') ? line : '');
}

function importerCleanLabel(label) {
    return String(label || '').replace(/^\$|\$$/g, '').trim();
}

function importerReadColor(optionsText) {
    const text = String(optionsText || '');
    const tikzDraw = /draw\s*=\s*([^,\]]+)/i.exec(text);
    if (tikzDraw) return tikzDraw[1].trim();
    const tikzFill = /fill\s*=\s*([^,\]]+)/i.exec(text);
    if (tikzFill && tikzFill[1].trim().toLowerCase() !== 'white') return tikzFill[1].trim();
    const pstricksLine = /linecolor\s*=\s*([^,\]]+)/i.exec(text);
    if (pstricksLine) return pstricksLine[1].trim();
    const pstricksFill = /fillcolor\s*=\s*([^,\]]+)/i.exec(text);
    if (pstricksFill && pstricksFill[1].trim().toLowerCase() !== 'white') return pstricksFill[1].trim();
    return 'black';
}

function importerReadStyle(optionsText) {
    const text = String(optionsText || '').toLowerCase();
    if (text.includes('dashed')) return 'dashed';
    if (text.includes('dotted')) return 'dotted';
    return 'solid';
}

function importerReadRadiusFromOptions(optionsText, fallback = 5) {
    const text = String(optionsText || '');
    const innerSep = /inner sep\s*=\s*([\d.]+)pt/i.exec(text);
    if (innerSep) return Math.max(0.2, Number(innerSep[1]) * 2);
    const dotSize = /dotsize\s*=\s*([\d.]+)pt/i.exec(text);
    if (dotSize) return Math.max(0.2, Number(dotSize[1]) / 3);
    const radius = /radius\s*=\s*([\d.]+)/i.exec(text);
    if (radius) return Math.max(0.2, Number(radius[1]));
    const loopSize = /loopsize\s*=\s*([\d.]+)/i.exec(text);
    if (loopSize) return Math.max(0.2, Number(loopSize[1]));
    return fallback;
}

function importerEnsurePoint(store, name, x, y, optionsText = '', labelText = '') {
    const key = String(name || '').trim() || `anon_${store.nextAnonId++}`;
    const existing = store.nameToPoint.get(key);
    const color = importerReadColor(optionsText);
    const style = importerReadStyle(optionsText);
    const label = importerCleanLabel(labelText);
    const radius = importerReadRadiusFromOptions(optionsText, 5);

    if (existing) {
        const point = store.points.find(p => p.id === existing);
        if (point) {
            point.x = x;
            point.y = y;
            if (label) point.label = label;
            point.color = color;
            point.style = style;
            if (radius > 0) point.radius = radius;
        }
        return existing;
    }

    const id = window.pointIdCounter++;
    const point = { id, x, y, color, style, label: label || String(store.points.length + 1), radius };
    store.points.push(point);
    store.nameToPoint.set(key, id);
    return id;
}

function importerUpsertText(store, x, y, text, color = 'black', boxed = false) {
    if (!text) return;
    const id = window.textIdCounter++;
    store.texts.push({ id, x, y, text, color, boxed });
}

function importerAddLine(store, sourceId, targetId, optionsText = '', label = '', labelPos = 'above', labelT = 0.5) {
    store.edges.push({
        id: window.edgeIdCounter++,
        type: 'line',
        sourceId,
        targetId,
        color: importerReadColor(optionsText),
        style: importerReadStyle(optionsText),
        arrow: /<->/.test(optionsText) ? 'both' : /<-/.test(optionsText) ? 'start' : /->/.test(optionsText) ? 'end' : 'none',
        label: importerCleanLabel(label),
        labelPos,
        labelT,
    });
}

function importerAddCurve(store, sourceId, targetId, optionsText = '', label = '', labelPos = 'above', labelT = 0.5) {
    const bendLeft = /bend\s+left\s*=\s*([\d.]+)/i.exec(optionsText);
    const bendRight = /bend\s+right\s*=\s*([\d.]+)/i.exec(optionsText);
    const arcangle = /arcangle\s*=\s*([\d.\-]+)/i.exec(optionsText);
    let offset = 1;
    if (bendLeft) offset = Number(bendLeft[1]) / 10;
    if (bendRight) offset = -Number(bendRight[1]) / 10;
    if (arcangle) offset = Math.tan(Number(arcangle[1]) * Math.PI / 360) * 2;

    store.edges.push({
        id: window.edgeIdCounter++,
        type: 'curve',
        sourceId,
        targetId,
        color: importerReadColor(optionsText),
        style: importerReadStyle(optionsText),
        arrow: /<->/.test(optionsText) ? 'both' : /<-/.test(optionsText) ? 'start' : /->/.test(optionsText) ? 'end' : 'none',
        label: importerCleanLabel(label),
        labelPos,
        labelT,
        offset,
    });
}

function importerAddLoop(store, sourceId, optionsText = '', label = '', labelPos = 'above', labelT = 0.5) {
    const loopAngle = /angleA\s*=\s*([\d.\-]+)/i.exec(optionsText);
    const loopSize = /loop(?:size)?\s*=\s*([\d.]+)/i.exec(optionsText);
    store.edges.push({
        id: window.edgeIdCounter++,
        type: 'loop',
        sourceId,
        targetId: sourceId,
        radius: loopSize ? Number(loopSize[1]) : 1,
        loopAngle: loopAngle ? Number(loopAngle[1]) + 30 : 90,
        color: importerReadColor(optionsText),
        style: importerReadStyle(optionsText),
        arrow: /<->/.test(optionsText) ? 'both' : /<-/.test(optionsText) ? 'start' : /->/.test(optionsText) ? 'end' : 'none',
        label: importerCleanLabel(label),
        labelPos,
        labelT,
    });
}

function importerAddCircle(store, sourceId, radius, optionsText = '') {
    store.edges.push({
        id: window.edgeIdCounter++,
        type: 'circle',
        sourceId,
        targetId: sourceId,
        radius,
        color: importerReadColor(optionsText),
        style: importerReadStyle(optionsText),
        arrow: 'none',
        label: '',
        labelPos: 'above',
    });
}

function importerAddArc(store, sourceId, radius, startAngle, endAngle, optionsText = '') {
    store.edges.push({
        id: window.edgeIdCounter++,
        type: 'arc',
        sourceId,
        targetId: sourceId,
        radius,
        startAngle,
        endAngle,
        color: importerReadColor(optionsText),
        style: importerReadStyle(optionsText),
        arrow: /<->/.test(optionsText) ? 'both' : /<-/.test(optionsText) ? 'start' : /->/.test(optionsText) ? 'end' : 'none',
        label: '',
        labelPos: 'above',
    });
}

function importerAddEllipticArc(store, sourceId, targetId, radius, startAngle, endAngle, optionsText = '') {
    store.edges.push({
        id: window.edgeIdCounter++,
        type: 'elliptic-arc',
        sourceId,
        targetId,
        radius,
        startAngle,
        endAngle,
        color: importerReadColor(optionsText),
        style: importerReadStyle(optionsText),
        arrow: /<->/.test(optionsText) ? 'both' : /<-/.test(optionsText) ? 'start' : /->/.test(optionsText) ? 'end' : 'none',
        label: '',
        labelPos: 'above',
    });
}

function importerFindEllipsePair(points, centerX, centerY, aValue, rotationDegrees) {
    const tolerance = 0.3;
    let best = null;
    points.forEach(first => {
        points.forEach(second => {
            if (first.id === second.id) return;
            const cx = (first.x + second.x) / 2;
            const cy = (first.y + second.y) / 2;
            const halfDistance = Math.hypot(second.x - first.x, second.y - first.y) / 2;
            const angle = Math.atan2(second.y - first.y, second.x - first.x) * 180 / Math.PI;
            const centerDelta = Math.hypot(cx - centerX, cy - centerY);
            const angleDelta = Math.min(
                Math.abs(angle - rotationDegrees),
                Math.abs(angle - rotationDegrees + 180),
                Math.abs(angle - rotationDegrees - 180),
            );
            const score = centerDelta + angleDelta / 45 + Math.abs(aValue - Math.max(aValue, halfDistance));
            if (centerDelta < tolerance && angleDelta < 20 && (!best || score < best.score)) {
                best = { first: first.id, second: second.id, score };
            }
        });
    });
    return best;
}

function parseTikzPstricksCode(text) {
    const source = importerNormalize(text);
    const lines = source.split('\n').map(line => line.trim()).filter(Boolean);
    const store = {
        points: [],
        texts: [],
        edges: [],
        regions: [],
        plots: [],
        nameToPoint: new Map(),
        nextAnonId: 0,
    };

    const nodePatterns = [
        { regex: /^\\node(?:\[([^\]]*)\])?\s*(?:\(([^)]+)\))?\s*at\s*\(([-\d.]+)\s*,\s*([-\d.]+)\)\s*\{(.*)\};?$/, kind: 'tikzNode' },
        { regex: /^\\coordinate(?:\[([^\]]*)\])?\s*(?:\(([^)]+)\))?\s*at\s*\(([-\d.]+)\s*,\s*([-\d.]+)\)\s*;?$/, kind: 'tikzCoordinate' },
        { regex: /^\\cnode(?:\[([^\]]*)\])?\s*\(([-\d.]+)\s*,\s*([-\d.]+)\)\s*\{([^}]*)\}\s*\{([^}]+)\}/, kind: 'pstricksCnode' },
        { regex: /^\\pnode\s*\(([-\d.]+)\s*,\s*([-\d.]+)\)\s*\{([^}]+)\}/, kind: 'pstricksPnode' },
        { regex: /^\\psdot(?:\[([^\]]*)\])?\s*\(([-\d.]+)\s*,\s*([-\d.]+)\)/, kind: 'pstricksDot' },
    ];

    lines.forEach(line => {
        nodePatterns.forEach(pattern => {
            const match = line.match(pattern.regex);
            if (!match) return;
            if (pattern.kind === 'tikzNode') {
                const options = match[1] || '';
                const name = match[2] || '';
                const x = Number(match[3]);
                const y = Number(match[4]);
                const body = match[5] || '';
                importerEnsurePoint(store, name, x, y, options, body);
            } else if (pattern.kind === 'tikzCoordinate') {
                const name = match[2] || '';
                const x = Number(match[3]);
                const y = Number(match[4]);
                importerEnsurePoint(store, name, x, y, match[1] || '');
            } else if (pattern.kind === 'pstricksCnode') {
                const options = match[1] || '';
                const x = Number(match[2]);
                const y = Number(match[3]);
                const size = Number(match[4]);
                const name = match[5] || '';
                importerEnsurePoint(store, name, x, y, `${options}, inner sep=${Math.max(1, size * 12)}pt`);
            } else if (pattern.kind === 'pstricksPnode') {
                const x = Number(match[1]);
                const y = Number(match[2]);
                const name = match[3] || '';
                importerEnsurePoint(store, name, x, y, '');
            } else if (pattern.kind === 'pstricksDot') {
                const options = match[1] || '';
                const x = Number(match[2]);
                const y = Number(match[3]);
                importerEnsurePoint(store, '', x, y, options);
            }
        });
    });

    const edgePatterns = [
        { regex: /^\\ncline(?:\[([^\]]*)\])?\s*(?:\{([^}]+)\})?\s*\{([^}]+)\}\s*\{([^}]+)\}(?:\s*\{([^}]*)\})?/, kind: 'ncline' },
        { regex: /^\\ncarc(?:\[([^\]]*)\])?\s*(?:\{([^}]+)\})?\s*\{([^}]+)\}\s*\{([^}]+)\}(?:\s*\{([^}]*)\})?/, kind: 'ncarc' },
        { regex: /^\\ncloop(?:\[([^\]]*)\])?\s*(?:\{([^}]+)\})?\s*\{([^}]+)\}\s*\{([^}]+)\}(?:\s*\{([^}]*)\})?/, kind: 'ncloop' },
        { regex: /^\\pscircle(?:\[([^\]]*)\])?\s*\(([-\d.]+)\s*,\s*([-\d.]+)\)\s*\{([-\d.]+)\}/, kind: 'pscircle' },
        { regex: /^\\psarc(?:\[([^\]]*)\])?(?:\s*\{([^}]+)\})?\s*\(([-\d.]+)\s*,\s*([-\d.]+)\)\s*\{([-\d.]+)\}\s*\{([-\d.]+)\}\s*\{([-\d.]+)\}/, kind: 'psarc' },
        { regex: /^\\psellipticarc(?:\[([^\]]*)\])?(?:\s*\{([^}]+)\})?\s*\(([-\d.]+)\s*,\s*([-\d.]+)\)\s*\(([-\d.]+)\s*,\s*([-\d.]+)\)\s*\{([-\d.]+)\}\s*\{([-\d.]+)\}/, kind: 'psellipticarc' },
        { regex: /^\\draw(?:\[([^\]]*)\])?\s*\(([^)]+)\)\s*--(?:\s*node\[[^\]]*\]\s*\{([^}]*)\})?\s*\(([^)]+)\)/, kind: 'tikzLine' },
        { regex: /^\\draw(?:\[([^\]]*)\])?\s*\(([^)]+)\)\s*to\[([^\]]*)\](?:\s*node\[[^\]]*\]\s*\{([^}]*)\})?\s*\(([^)]+)\)/, kind: 'tikzCurve' },
        { regex: /^\\draw(?:\[([^\]]*)\])?\s*\(([^)]+)\)\s*to\[([^\]]*loop[^\]]*)\](?:\s*node\[[^\]]*\]\s*\{([^}]*)\})?\s*\(([^)]+)\)/, kind: 'tikzLoop' },
        { regex: /^\\draw(?:\[([^\]]*)\])?\s*\(([^)]+)\)\s*circle\s*\(([-\d.]+)\)/, kind: 'tikzCircle' },
        { regex: /^\\draw(?:\[([^\]]*)\])?\s*\(([^)]+)\)\s*\+\(([-\d.]+):([-\d.]+)\)\s*arc\s*\[start angle=([-\d.]+),\s*end angle=([-\d.]+),\s*radius=([-\d.]+)\]/, kind: 'tikzArc' },
        { regex: /^\\rput(?:\{([-\d.]+)\})?\s*\(([-\d.]+)\s*,\s*([-\d.]+)\)\s*\{(?:\\psellipticarc(?:\[([^\]]*)\])?\s*\(([-\d.]+)\s*,\s*([-\d.]+)\)\s*\(([-\d.]+)\s*,\s*([-\d.]+)\)\s*\{([-\d.]+)\}\s*\{([-\d.]+)\})\s*\}/, kind: 'wrappedEllipse' },
    ];

    const edgesToDefer = [];

    function getPointIdByName(name) {
        return store.nameToPoint.get(String(name || '').trim());
    }

    lines.forEach(line => {
        edgePatterns.forEach(pattern => {
            const match = line.match(pattern.regex);
            if (!match) return;

            if (pattern.kind === 'ncline') {
                const options = match[1] || '';
                const source = getPointIdByName(match[3]);
                const target = getPointIdByName(match[4]);
                if (source !== undefined && target !== undefined) importerAddLine(store, source, target, options, match[5] || '');
            } else if (pattern.kind === 'ncarc') {
                const options = match[1] || '';
                const source = getPointIdByName(match[3]);
                const target = getPointIdByName(match[4]);
                if (source !== undefined && target !== undefined) importerAddCurve(store, source, target, options, match[5] || '');
            } else if (pattern.kind === 'ncloop') {
                const options = match[1] || '';
                const source = getPointIdByName(match[3]);
                if (source !== undefined) importerAddLoop(store, source, options, match[5] || '');
            } else if (pattern.kind === 'pscircle') {
                const options = match[1] || '';
                const x = Number(match[2]);
                const y = Number(match[3]);
                const radius = Number(match[4]);
                const pointId = importerEnsurePoint(store, '', x, y, options, '');
                importerAddCircle(store, pointId, radius, options);
            } else if (pattern.kind === 'psarc') {
                const options = match[1] || '';
                const x = Number(match[3]);
                const y = Number(match[4]);
                const radius = Number(match[5]);
                const startAngle = Number(match[6]);
                const endAngle = Number(match[7]);
                const pointId = importerEnsurePoint(store, '', x, y, options, '');
                importerAddArc(store, pointId, radius, startAngle, endAngle, options);
            } else if (pattern.kind === 'psellipticarc') {
                const options = match[1] || '';
                const centerX = Number(match[3]);
                const centerY = Number(match[4]);
                const aValue = Number(match[5]);
                const bValue = Number(match[6]);
                const startAngle = Number(match[7]);
                const endAngle = Number(match[8]);
                edgesToDefer.push({ options, centerX, centerY, aValue, bValue, startAngle, endAngle });
            } else if (pattern.kind === 'tikzLine') {
                const options = match[1] || '';
                const source = getPointIdByName(match[2]);
                const target = getPointIdByName(match[4]);
                if (source !== undefined && target !== undefined) importerAddLine(store, source, target, options, match[3] || '');
            } else if (pattern.kind === 'tikzCurve') {
                const options = match[1] || '';
                const source = getPointIdByName(match[2]);
                const target = getPointIdByName(match[5]);
                if (source !== undefined && target !== undefined) importerAddCurve(store, source, target, `${options}, ${match[3] || ''}`, match[4] || '');
            } else if (pattern.kind === 'tikzLoop') {
                const options = match[1] || '';
                const source = getPointIdByName(match[2]);
                if (source !== undefined) importerAddLoop(store, source, `${options}, ${match[3] || ''}`, match[4] || '');
            } else if (pattern.kind === 'tikzCircle') {
                const options = match[1] || '';
                const source = getPointIdByName(match[2]);
                if (source !== undefined) importerAddCircle(store, source, Number(match[3]), options);
            } else if (pattern.kind === 'tikzArc') {
                const options = match[1] || '';
                const source = getPointIdByName(match[2]);
                if (source !== undefined) importerAddArc(store, source, Number(match[7]), Number(match[5]), Number(match[6]), options);
            } else if (pattern.kind === 'wrappedEllipse') {
                const rotation = Number(match[1] || 0);
                const centerX = Number(match[2]);
                const centerY = Number(match[3]);
                const options = match[4] || '';
                const aValue = Number(match[7]);
                const bValue = Number(match[8]);
                const startAngle = Number(match[9]);
                const endAngle = Number(match[10]);
                edgesToDefer.push({ options: `${options}, rotate=${rotation}`, centerX, centerY, aValue, bValue, startAngle, endAngle });
            }
        });
    });

    edgesToDefer.forEach(item => {
        const pair = importerFindEllipsePair(store.points, item.centerX, item.centerY, item.aValue, 0);
        if (pair) importerAddEllipticArc(store, pair.first, pair.second, item.aValue, item.startAngle, item.endAngle, item.options);
    });

    if (store.points.length === 0 && store.edges.length === 0 && store.texts.length === 0) return null;
    return store;
}

function applyImportedGraph(store) {
    if (!store) return false;

    window.points = store.points || [];
    window.edges = store.edges || [];
    window.texts = store.texts || [];
    window.regions = store.regions || [];
    window.plots = store.plots || [];
    window.pointIdCounter = window.points.length ? Math.max(...window.points.map(point => Number(point.id))) + 1 : 0;
    window.edgeIdCounter = window.edges.length ? Math.max(...window.edges.map(edge => Number(edge.id))) + 1 : 0;
    window.textIdCounter = window.texts.length ? Math.max(...window.texts.map(text => Number(text.id))) + 1 : 0;
    window.regionIdCounter = window.regions.length ? Math.max(...window.regions.map(region => Number(region.id))) + 1 : 0;
    window.plotIdCounter = window.plots.length ? Math.max(...window.plots.map(plot => Number(plot.id) || 0)) + 1 : 0;
    window.selectedPointIds = [];
    window.selectedEdgeIds = [];
    window.selectedTextIds = [];
    window.selectedRegionIds = [];
    originX = canvasWidth / 2;
    originY = canvasHeight / 2;

    if (typeof saveState === 'function') saveState();
    if (window.updatePropertyPanel) window.updatePropertyPanel();
    if (typeof draw === 'function') draw();
    return true;
}

window.importCodeFromText = function(text) {
    const parsed = parseTikzPstricksCode(text);
    if (!parsed) {
        importerSetStatus('No TikZ/PSTricks diagram detected.', true);
        return false;
    }

    applyImportedGraph(parsed);
    importerSetStatus(`Imported ${parsed.points.length} point${parsed.points.length === 1 ? '' : 's'} and ${parsed.edges.length} edge${parsed.edges.length === 1 ? '' : 's'}.`);
    localStorage.setItem(PROGRAPH_IMPORT_STATUS_KEY, String(text || '').slice(0, 5000));
    return true;
};

window.clearImportedCode = function() {
    const input = document.getElementById('code-import-input');
    if (input) input.value = '';
    importerSetStatus('Paste code here and the figure will render automatically.');
};

function scheduleCodeImport(text) {
    window._importCodeTimer = window._importCodeTimer || null;
    if (window._importCodeTimer) clearTimeout(window._importCodeTimer);
    window._importCodeTimer = setTimeout(() => {
        if (String(text || '').trim()) window.importCodeFromText(text);
        window._importCodeTimer = null;
    }, 350);
}

window.scheduleCodeImport = scheduleCodeImport;

if (window.addEventListener) {
    window.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('code-import-input');
        if (!input) return;
        input.addEventListener('input', () => scheduleCodeImport(input.value));
        input.addEventListener('paste', () => setTimeout(() => scheduleCodeImport(input.value), 0));
    });
}