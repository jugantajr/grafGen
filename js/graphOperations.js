(function () {
  function edgeKey(sourceId, targetId) {
    return sourceId < targetId
      ? `${sourceId}:${targetId}`
      : `${targetId}:${sourceId}`;
  }

  function addEdge(edges, sourceId, targetId) {
    if (sourceId === targetId) return;
    const key = edgeKey(sourceId, targetId);
    if (edges.some((edge) => edgeKey(edge.sourceId, edge.targetId) === key)) return;
    edges.push({ sourceId, targetId });
  }

  function adjacency(graph) {
    const result = new Map();
    graph.points.forEach((point) => result.set(point.id, new Set()));
    graph.edges.forEach((edge) => {
      if (!result.has(edge.sourceId) || !result.has(edge.targetId)) return;
      result.get(edge.sourceId).add(edge.targetId);
      result.get(edge.targetId).add(edge.sourceId);
    });
    return result;
  }

  function combineGraphs(graphA, graphB, operation) {
    const aPoints = graphA.points || [];
    const bPoints = graphB.points || [];
    const aAdjacency = adjacency(graphA);
    const bAdjacency = adjacency(graphB);
    const points = [];
    const edges = [];
    const pointByPair = new Map();
    const pointBySource = new Map();
    let nextId = 0;

    const addPoint = (x, y, pair) => {
      const id = nextId++;
      points.push({ id, x, y, color: 'black', style: 'solid', label: String(id + 1), labelAngle: 90 });
      if (pair) pointByPair.set(pair, id);
      return id;
    };

    const addProductPoints = () => {
      const columns = Math.max(1, Math.ceil(Math.sqrt(aPoints.length * bPoints.length)));
      const spacing = 2.2;
      aPoints.forEach((aPoint, aIndex) => {
        bPoints.forEach((bPoint, bIndex) => {
          const index = aIndex * bPoints.length + bIndex;
          addPoint(
            (index % columns) * spacing,
            -Math.floor(index / columns) * spacing,
            `${aPoint.id}|${bPoint.id}`,
          );
        });
      });
    };

    const addDisjointPoints = () => {
      aPoints.forEach((aPoint, index) => {
        pointBySource.set(`a:${aPoint.id}`, addPoint(aPoint.x * 2, aPoint.y * 2));
      });
      bPoints.forEach((bPoint) => {
        pointBySource.set(`b:${bPoint.id}`, addPoint(bPoint.x * 2 + 5, bPoint.y * 2));
      });
      graphA.edges.forEach((edge) => addEdge(edges, pointBySource.get(`a:${edge.sourceId}`), pointBySource.get(`a:${edge.targetId}`)));
      graphB.edges.forEach((edge) => addEdge(edges, pointBySource.get(`b:${edge.sourceId}`), pointBySource.get(`b:${edge.targetId}`)));
    };

    if (operation === 'union' || operation === 'join') {
      addDisjointPoints();
      if (operation === 'join') {
        aPoints.forEach((aPoint) => bPoints.forEach((bPoint) => {
          addEdge(edges, pointBySource.get(`a:${aPoint.id}`), pointBySource.get(`b:${bPoint.id}`));
        }));
      }
    } else if (operation === 'corona') {
      const centers = new Map();
      aPoints.forEach((aPoint) => centers.set(aPoint.id, addPoint(aPoint.x * 2, aPoint.y * 2)));
      graphA.edges.forEach((edge) => addEdge(edges, centers.get(edge.sourceId), centers.get(edge.targetId)));
      aPoints.forEach((aPoint) => {
        const copies = new Map();
        bPoints.forEach((bPoint, index) => {
          const copyId = addPoint(aPoint.x * 2 + (index + 1) * 1.4, aPoint.y * 2 - 1.4);
          copies.set(bPoint.id, copyId);
          addEdge(edges, centers.get(aPoint.id), copyId);
        });
        graphB.edges.forEach((edge) => addEdge(edges, copies.get(edge.sourceId), copies.get(edge.targetId)));
      });
    } else {
      addProductPoints();
      const sameA = (left, right) => left === right;
      const hasA = (left, right) => aAdjacency.get(left)?.has(right) || false;
      const hasB = (left, right) => bAdjacency.get(left)?.has(right) || false;

      aPoints.forEach((a1) => bPoints.forEach((b1) => {
        aPoints.forEach((a2) => bPoints.forEach((b2) => {
          if (a1.id === a2.id && b1.id === b2.id) return;
          const aEdge = hasA(a1.id, a2.id);
          const bEdge = hasB(b1.id, b2.id);
          let include = false;
          if (operation === 'union') include = sameA(a1.id, a2.id) && bEdge || sameA(b1.id, b2.id) && aEdge;
          if (operation === 'join') include = sameA(a1.id, a2.id) && sameA(b1.id, b2.id) ? false : a1.id !== a2.id || b1.id !== b2.id;
          if (operation === 'cartesian') include = sameA(a1.id, a2.id) && bEdge || sameA(b1.id, b2.id) && aEdge;
          if (operation === 'tensor') include = aEdge && bEdge;
          if (operation === 'strong') include = sameA(a1.id, a2.id) && bEdge || sameA(b1.id, b2.id) && aEdge || aEdge && bEdge;
          if (operation === 'lexicographic') include = aEdge || sameA(a1.id, a2.id) && bEdge;
          if (include) {
            const source = pointByPair.get(`${a1.id}|${b1.id}`);
            const target = pointByPair.get(`${a2.id}|${b2.id}`);
            addEdge(edges, source, target);
          }
        }));
      }));
    }

    return { points, edges };
  }

  window.combineGraphOperations = combineGraphs;

  const singleMacro = window.insertMacro;
  const originalToggleInputs = window.toggleMacroInputs;
  const operationTypes = new Set(['union', 'join', 'cartesian', 'tensor', 'strong', 'lexicographic', 'corona']);

  function readMacro(prefix) {
    return {
      type: document.getElementById(`${prefix}-type`).value,
      n: document.getElementById(`${prefix}-n`).value,
      m: document.getElementById(`${prefix}-m`).value,
    };
  }

  function buildMacro(config) {
    const type = document.getElementById('macro-type');
    const n = document.getElementById('macro-n');
    const m = document.getElementById('macro-m');
    const saved = {
      type: type.value,
      n: n.value,
      m: m.value,
      points: window.points,
      edges: window.edges,
      texts: window.texts,
      regions: window.regions,
      plots: window.plots,
      pointIdCounter: window.pointIdCounter,
      edgeIdCounter: window.edgeIdCounter,
    };
    window.points = [];
    window.edges = [];
    window.texts = [];
    window.regions = [];
    window.plots = [];
    window.pointIdCounter = 0;
    window.edgeIdCounter = 0;
    type.value = config.type;
    n.value = config.n;
    m.value = config.m;
    singleMacro();
    const result = { points: window.points.slice(), edges: window.edges.slice() };
    Object.assign(window, saved);
    return result;
  }

  window.toggleMacroInputs = function () {
    originalToggleInputs();
    const operation = document.getElementById('macro-operation');
    const second = document.getElementById('macro-second-controls');
    const enabled = operation && operation.value !== 'single';
    if (second) second.style.display = enabled ? 'inline-flex' : 'none';
  };

  window.insertMacro = function () {
    const operation = document.getElementById('macro-operation')?.value || 'single';
    if (!operationTypes.has(operation)) return singleMacro();
    const first = readMacro('macro');
    const second = readMacro('macro-second');
    const result = combineGraphs(buildMacro(first), buildMacro(second), operation);
    const offsetX = (canvasWidth / 2 - originX) / getUnitSize();
    const offsetY = (originY - canvasHeight / 2) / getUnitSize();
    const idMap = new Map();
    result.points.forEach((point) => {
      const id = window.pointIdCounter++;
      idMap.set(point.id, id);
      window.points.push({
        ...point,
        id,
        x: point.x + offsetX,
        y: point.y + offsetY,
        color: window.activeColor,
      });
    });
    result.edges.forEach((edge) => window.edges.push({
      id: window.edgeIdCounter++,
      type: 'line',
      sourceId: idMap.get(edge.sourceId),
      targetId: idMap.get(edge.targetId),
      color: window.activeColor,
      style: 'solid',
      arrow: 'none',
      label: '',
      labelPos: 'above',
    }));
    saveState();
    window.setMode('select');
  };
})();

if (typeof module !== 'undefined') module.exports = { combineGraphOperations: window.combineGraphOperations };
