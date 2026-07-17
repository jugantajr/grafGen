const PROGRAPH_ACCOUNT_STORAGE_KEY = 'prograph_accounts';

function prographClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function prographTimestamp() {
    return new Date().toISOString();
}

function prographGenerateId() {
    return `graph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function prographDefaultStore() {
    return {
        activeAccount: 'Guest',
        accounts: {
            Guest: { graphs: [] },
        },
    };
}

function prographNormalizeStore(store) {
    const safeStore = store && typeof store === 'object' ? store : prographDefaultStore();
    if (!safeStore.accounts || typeof safeStore.accounts !== 'object') safeStore.accounts = {};

    const activeAccount = typeof safeStore.activeAccount === 'string' && safeStore.activeAccount.trim()
        ? safeStore.activeAccount.trim()
        : 'Guest';

    if (!safeStore.accounts[activeAccount]) safeStore.accounts[activeAccount] = { graphs: [] };
    Object.keys(safeStore.accounts).forEach(accountName => {
        const account = safeStore.accounts[accountName];
        if (!account || typeof account !== 'object') {
            safeStore.accounts[accountName] = { graphs: [] };
            return;
        }
        if (!Array.isArray(account.graphs)) account.graphs = [];
    });

    safeStore.activeAccount = activeAccount;
    return safeStore;
}

function prographReadStore() {
    try {
        return prographNormalizeStore(JSON.parse(localStorage.getItem(PROGRAPH_ACCOUNT_STORAGE_KEY) || 'null'));
    } catch (err) {
        return prographDefaultStore();
    }
}

function prographWriteStore(store) {
    localStorage.setItem(PROGRAPH_ACCOUNT_STORAGE_KEY, JSON.stringify(prographNormalizeStore(store)));
}

function prographSetActiveAccount(accountName) {
    const trimmed = String(accountName || '').trim();
    const store = prographReadStore();
    const name = trimmed || 'Guest';

    if (!store.accounts[name]) store.accounts[name] = { graphs: [] };
    store.activeAccount = name;
    prographWriteStore(store);
    return name;
}

function prographGetActiveAccount() {
    return prographReadStore().activeAccount;
}

function prographListAccounts() {
    const store = prographReadStore();
    return Object.keys(store.accounts).sort((left, right) => left.localeCompare(right));
}

function prographGetActiveGraphs() {
    const store = prographReadStore();
    const account = store.accounts[store.activeAccount] || { graphs: [] };
    return account.graphs.slice().sort((left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime());
}

function prographBuildGraphSnapshot(graphName) {
    return {
        version: 1,
        id: prographGenerateId(),
        name: String(graphName || 'Untitled Graph').trim() || 'Untitled Graph',
        savedAt: prographTimestamp(),
        points: prographClone(window.points || []),
        edges: prographClone(window.edges || []),
        texts: prographClone(window.texts || []),
        regions: prographClone(window.regions || []),
        plots: prographClone(window.plots || []),
        originX,
        originY,
        zoom: window.zoom,
    };
}

function prographApplyGraphSnapshot(snapshot) {
    const obj = snapshot && typeof snapshot === 'object' ? snapshot : null;
    if (!obj) throw new Error('Invalid graph snapshot.');

    const toArray = (value) => Array.isArray(value) ? value : [];

    const safePoints = toArray(obj.points)
        .filter(point => point && typeof point === 'object' && Number.isFinite(Number(point.id)) && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)))
        .map(point => ({ ...point, id: Number(point.id), x: Number(point.x), y: Number(point.y) }));
    const pointIds = new Set(safePoints.map(point => point.id));
    const safeEdges = toArray(obj.edges)
        .filter(edge => {
            if (!edge || typeof edge !== 'object') return false;
            if (!Number.isFinite(Number(edge.id))) return false;
            if (edge.sourceId === undefined || edge.targetId === undefined) return false;
            return pointIds.has(Number(edge.sourceId)) && pointIds.has(Number(edge.targetId));
        })
        .map(edge => ({ ...edge, id: Number(edge.id), sourceId: Number(edge.sourceId), targetId: Number(edge.targetId) }));
    const safeTexts = toArray(obj.texts)
        .filter(text => text && typeof text === 'object' && Number.isFinite(Number(text.id)) && Number.isFinite(Number(text.x)) && Number.isFinite(Number(text.y)))
        .map(text => ({ ...text, id: Number(text.id), x: Number(text.x), y: Number(text.y) }));
    const safeRegions = toArray(obj.regions)
        .filter(region => region && typeof region === 'object' && Number.isFinite(Number(region.id)) && Number.isFinite(Number(region.minX)) && Number.isFinite(Number(region.minY)) && Number.isFinite(Number(region.maxX)) && Number.isFinite(Number(region.maxY)))
        .map(region => ({ ...region, id: Number(region.id), minX: Number(region.minX), minY: Number(region.minY), maxX: Number(region.maxX), maxY: Number(region.maxY) }));
    const safePlots = toArray(obj.plots).filter(plot => plot && typeof plot === 'object');

    window.points = safePoints;
    window.edges = safeEdges;
    window.texts = safeTexts;
    window.regions = safeRegions;
    window.plots = safePlots;

    if (Number.isFinite(Number(obj.originX))) originX = Number(obj.originX);
    if (Number.isFinite(Number(obj.originY))) originY = Number(obj.originY);
    if (Number.isFinite(Number(obj.zoom)) && Number(obj.zoom) > 0) window.zoom = Number(obj.zoom);

    window.pointIdCounter = window.points.length ? Math.max(...window.points.map(point => Number(point.id))) + 1 : 0;
    window.edgeIdCounter = window.edges.length ? Math.max(...window.edges.map(edge => Number(edge.id))) + 1 : 0;
    window.textIdCounter = window.texts.length ? Math.max(...window.texts.map(text => Number(text.id))) + 1 : 0;
    window.regionIdCounter = window.regions.length ? Math.max(...window.regions.map(region => Number(region.id))) + 1 : 0;
    window.plotIdCounter = window.plots.length ? Math.max(...window.plots.map(plot => Number(plot.id) || 0)) + 1 : 0;

    if (typeof renderPlotCanvas === 'function') renderPlotCanvas();
    if (typeof saveState === 'function') saveState();
    if (typeof draw === 'function') draw();
}

function prographSaveGraphToAccount(graphName) {
    const store = prographReadStore();
    const accountName = store.activeAccount;
    const account = store.accounts[accountName] || { graphs: [] };
    const snapshot = prographBuildGraphSnapshot(graphName);
    const existingIndex = account.graphs.findIndex(graph => graph.name.toLowerCase() === snapshot.name.toLowerCase());
    if (existingIndex >= 0) {
        account.graphs[existingIndex] = snapshot;
    } else {
        account.graphs.unshift(snapshot);
    }
    store.accounts[accountName] = account;
    prographWriteStore(store);
    return snapshot;
}

function prographDeleteGraphFromAccount(graphId) {
    const store = prographReadStore();
    const accountName = store.activeAccount;
    const account = store.accounts[accountName];
    if (!account) return false;

    const nextGraphs = account.graphs.filter(graph => graph.id !== graphId);
    if (nextGraphs.length === account.graphs.length) return false;

    account.graphs = nextGraphs;
    store.accounts[accountName] = account;
    prographWriteStore(store);
    return true;
}

function prographLoadGraphFromAccount(graphId) {
    const store = prographReadStore();
    const account = store.accounts[store.activeAccount];
    if (!account) throw new Error('No active account found.');

    const graph = account.graphs.find(entry => entry.id === graphId);
    if (!graph) throw new Error('Saved graph not found.');

    prographApplyGraphSnapshot(graph);
    return graph;
}

window.prographReadStore = prographReadStore;
window.prographWriteStore = prographWriteStore;
window.prographSetActiveAccount = prographSetActiveAccount;
window.prographGetActiveAccount = prographGetActiveAccount;
window.prographListAccounts = prographListAccounts;
window.prographGetActiveGraphs = prographGetActiveGraphs;
window.prographBuildGraphSnapshot = prographBuildGraphSnapshot;
window.prographApplyGraphSnapshot = prographApplyGraphSnapshot;
window.prographSaveGraphToAccount = prographSaveGraphToAccount;
window.prographDeleteGraphFromAccount = prographDeleteGraphFromAccount;
window.prographLoadGraphFromAccount = prographLoadGraphFromAccount;