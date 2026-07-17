const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPersistence(windowState) {
  const filePath = path.join(__dirname, '..', 'js', 'persistence.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const storage = new Map();
  const localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    },
  };
  const context = {
    window: windowState,
    localStorage,
    originX: 12,
    originY: 34,
    renderPlotCanvas: () => {},
    saveState: () => {},
    draw: () => {},
    console,
    Math,
    Date,
  };
  context.window.localStorage = localStorage;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });
  return { window: context.window, localStorage };
}

test('graph snapshots round-trip through account storage', () => {
  const win = {
    points: [{ id: 1, x: 2, y: 3 }],
    edges: [],
    texts: [],
    regions: [],
    plots: [],
    zoom: 1.25,
  };

  const { window } = loadPersistence(win);

  window.prographSetActiveAccount('Lab');
  const saved = window.prographSaveGraphToAccount('My graph');

  assert.equal(saved.name, 'My graph');
  assert.equal(window.prographGetActiveAccount(), 'Lab');
  assert.equal(window.prographListAccounts().includes('Lab'), true);
  assert.equal(window.prographGetActiveGraphs().length, 1);

  window.points = [];
  window.edges = [];
  window.texts = [];
  window.regions = [];
  window.plots = [];

  const loaded = window.prographLoadGraphFromAccount(saved.id);
  assert.equal(loaded.id, saved.id);
  assert.equal(JSON.stringify(window.points), JSON.stringify([{ id: 1, x: 2, y: 3 }]));
  assert.equal(window.zoom, 1.25);
});

test('accounts keep graph lists isolated', () => {
  const win = {
    points: [{ id: 1, x: 1, y: 1 }],
    edges: [],
    texts: [],
    regions: [],
    plots: [],
    zoom: 1,
  };

  const { window } = loadPersistence(win);

  window.prographSetActiveAccount('A');
  window.prographSaveGraphToAccount('First');
  window.prographSetActiveAccount('B');
  window.prographSaveGraphToAccount('Second');

  assert.equal(window.prographListAccounts().sort().join(','), 'A,B,Guest');
  assert.equal(window.prographGetActiveGraphs().length, 1);
  assert.equal(window.prographGetActiveGraphs()[0].name, 'Second');
});