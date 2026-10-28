const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadOperations() {
  const window = {};
  const context = { window, document: {}, console };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'graphOperations.js'), 'utf8'),
    context,
  );
  return window.combineGraphOperations;
}

const edge = (sourceId, targetId) => ({ sourceId, targetId });
const graph = (count, edges) => ({
  points: Array.from({ length: count }, (_, id) => ({ id, x: id, y: 0 })),
  edges,
});

test('join creates all cross-partition edges', () => {
  const combine = loadOperations();
  const result = combine(graph(2, [edge(0, 1)]), graph(3, [edge(0, 1), edge(1, 2)]), 'join');

  assert.equal(result.points.length, 5);
  assert.equal(result.edges.length, 1 + 2 + 2 * 3);
});

test('Cartesian product uses one edge for each factor edge at a fixed coordinate', () => {
  const combine = loadOperations();
  const result = combine(graph(2, [edge(0, 1)]), graph(3, [edge(0, 1), edge(1, 2)]), 'cartesian');

  assert.equal(result.points.length, 6);
  assert.equal(result.edges.length, 3 + 4);
});

test('corona product attaches one copy of the second graph to every first vertex', () => {
  const combine = loadOperations();
  const result = combine(graph(2, [edge(0, 1)]), graph(2, [edge(0, 1)]), 'corona');

  assert.equal(result.points.length, 6);
  assert.equal(result.edges.length, 1 + 2 * 1 + 2 * 2);
});
