const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadImporter(windowState) {
  const filePath = path.join(__dirname, '..', 'js', 'codeImporter.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const localStorage = {
    store: new Map(),
    getItem(key) {
      return this.store.has(key) ? this.store.get(key) : null;
    },
    setItem(key, value) {
      this.store.set(key, String(value));
    },
  };
  const context = {
    window: windowState,
    localStorage,
    canvasWidth: 800,
    canvasHeight: 600,
    originX: 400,
    originY: 300,
    saveState: () => {},
    draw: () => {},
    updatePropertyPanel: () => {},
    console,
    setTimeout,
    clearTimeout,
    document: {
      getElementById() {
        return null;
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });
  return context.window;
}

test('imports common TikZ line graphs', () => {
  const win = loadImporter({ points: [], edges: [], texts: [], regions: [], plots: [], pointIdCounter: 0, edgeIdCounter: 0, textIdCounter: 0, regionIdCounter: 0, plotIdCounter: 0 });
  const text = String.raw`\begin{tikzpicture}
\node[circle, draw=black, fill=black, inner sep=2.5pt] (n0) at (0,0) {};
\node[circle, draw=black, fill=black, inner sep=2.5pt] (n1) at (2,0) {};
\draw[draw=black, thick] (n0) -- (n1);
\end{tikzpicture}`;

  const ok = win.importCodeFromText(text);
  assert.equal(ok, true);
  assert.equal(win.points.length, 2);
  assert.equal(win.edges.length, 1);
  assert.equal(win.edges[0].type, 'line');
});

test('imports common PSTricks node and edge graphs', () => {
  const win = loadImporter({ points: [], edges: [], texts: [], regions: [], plots: [], pointIdCounter: 0, edgeIdCounter: 0, textIdCounter: 0, regionIdCounter: 0, plotIdCounter: 0 });
  const text = String.raw`\begin{pspicture}(0,0)(4,4)
\pnode(0,0){n0}
\pnode(2,0){n1}
\ncline[linecolor=black]{n0}{n1}
\end{pspicture}`;

  const ok = win.importCodeFromText(text);
  assert.equal(ok, true);
  assert.equal(win.points.length, 2);
  assert.equal(win.edges.length, 1);
  assert.equal(win.edges[0].type, 'line');
});