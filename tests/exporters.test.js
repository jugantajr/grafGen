const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadScript(fileName, windowState) {
  const filePath = path.join(__dirname, '..', 'js', fileName);
  const code = fs.readFileSync(filePath, 'utf8');
  const context = {
    window: windowState,
    console,
    alert: () => {},
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });
  return context.window;
}

test('Python exporter escapes labels safely', () => {
  const win = {
    points: [
      { id: 1, label: 'a"b', x: 1, y: 2 },
      { id: 2, label: 'c\\d', x: 3, y: 4 },
    ],
    edges: [{ sourceId: 1, targetId: 2, arrow: 'none' }],
  };

  loadScript('python.js', win);
  const out = win.generatePythonNetworkX();

  assert.match(out, /G\.add_node\("a\\"b", pos=\(1\.00, 2\.00\)\)/);
  assert.match(out, /G\.add_node\("c\\\\d", pos=\(3\.00, 4\.00\)\)/);
  assert.match(out, /G\.add_edges_from\(\[/);
});

test('Sage exporter escapes edge labels', () => {
  const win = {
    points: [{ id: 1 }, { id: 2 }],
    edges: [
      { type: 'line', sourceId: 1, targetId: 2, arrow: 'end', label: 'w"1\\x' },
    ],
  };

  loadScript('sage.js', win);
  const out = win.generateSageMath();

  assert.match(out, /\(1, 2, "w\\"1\\\\x"\)/);
});

test('Mathematica exporter escapes edge labels', () => {
  const win = {
    points: [{ id: 1 }, { id: 2 }],
    edges: [
      { type: 'line', sourceId: 1, targetId: 2, arrow: 'end', label: 'x"y\\z' },
    ],
  };

  loadScript('mathematica.js', win);
  const out = win.generateMathematica();

  assert.match(out, /EdgeLabels -> "x\\"y\\\\z"/);
});

test('MATLAB exporter ignores non-finite labels as weights', () => {
  const win = {
    points: [{ id: 1 }, { id: 2 }],
    edges: [
      { type: 'line', sourceId: 1, targetId: 2, arrow: 'end', label: 'Infinity' },
    ],
  };

  loadScript('matlab.js', win);
  const out = win.generateMATLAB();

  assert.doesNotMatch(out, /weights =/);
  assert.match(out, /G = digraph\(s, t\);|G = graph\(s, t\);/);
});

test('TikZ exporter includes label anchor t via pos=', () => {
  const win = {
    points: [
      { id: 1, x: 0, y: 0, radius: 5, style: 'solid', color: 'black', label: '' },
      { id: 2, x: 2, y: 0, radius: 5, style: 'solid', color: 'black', label: '' },
    ],
    edges: [
      {
        id: 1,
        type: 'line',
        sourceId: 1,
        targetId: 2,
        color: 'black',
        style: 'solid',
        arrow: 'none',
        label: 'w',
        labelPos: 'above',
        labelT: 0.25,
      },
    ],
    texts: [],
    regions: [],
    plots: [],
    generateMatricesLaTeX: () => '',
    generatePythonNetworkX: () => '',
    generateSageMath: () => '',
    generateMathematica: () => '',
    generateMATLAB: () => '',
  };

  const codeOutput = { value: '' };
  const codeFormat = { value: 'tikz' };
  const documentStub = {
    getElementById(id) {
      if (id === 'codeOutput') return codeOutput;
      if (id === 'code-format') return codeFormat;
      return { value: '' };
    },
  };

  const filePath = path.join(__dirname, '..', 'js', 'generators.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const context = { window: win, document: documentStub, console };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });

  win.generateCode();
  assert.match(codeOutput.value, /pos=0\.25/);
});

test('PSTricks exporter includes label anchor t via npos=', () => {
  const win = {
    points: [
      { id: 1, x: 0, y: 0, radius: 5, style: 'solid', color: 'black', label: '' },
      { id: 2, x: 2, y: 0, radius: 5, style: 'solid', color: 'black', label: '' },
    ],
    edges: [
      {
        id: 1,
        type: 'line',
        sourceId: 1,
        targetId: 2,
        color: 'black',
        style: 'solid',
        arrow: 'none',
        label: 'w',
        labelPos: 'above',
        labelT: 0.75,
      },
    ],
    texts: [],
    regions: [],
    plots: [],
    generateMatricesLaTeX: () => '',
    generatePythonNetworkX: () => '',
    generateSageMath: () => '',
    generateMathematica: () => '',
    generateMATLAB: () => '',
  };

  const codeOutput = { value: '' };
  const codeFormat = { value: 'pstricks' };
  const documentStub = {
    getElementById(id) {
      if (id === 'codeOutput') return codeOutput;
      if (id === 'code-format') return codeFormat;
      return { value: '' };
    },
  };

  const filePath = path.join(__dirname, '..', 'js', 'generators.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const context = { window: win, document: documentStub, console };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });

  win.generateCode();
  assert.match(codeOutput.value, /\\naput\[npos=0\.75\]/);
});
