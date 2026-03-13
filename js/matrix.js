// js/matrix.js

window.generateMatricesLaTeX = function() {
    let pts = window.points;
    let n = pts.length;
    
    if (n === 0) return "% Add points to generate matrices!";

    // 1. Create a mapping to keep rows/cols ordered consistently
    let idToIndex = {};
    let labels = [];
    pts.forEach((p, i) => {
        idToIndex[p.id] = i;
        labels.push(p.label || `n${p.id}`); // Fallback to ID if no label
    });

    // 2. Initialize empty matrices with zeros
    let A = Array(n).fill(0).map(() => Array(n).fill(0));
    let D = Array(n).fill(0).map(() => Array(n).fill(0));
    let L = Array(n).fill(0).map(() => Array(n).fill(0));

    // 3. Populate Adjacency Matrix (A)
    window.edges.forEach(e => {
        // We only calculate matrices for edges connecting two valid nodes
        if (e.sourceId !== undefined && e.targetId !== undefined) {
            let u = idToIndex[e.sourceId];
            let v = idToIndex[e.targetId];
            
            if (u !== undefined && v !== undefined) {
                // Handle directed vs undirected edges
                if (e.arrow === 'end' || e.arrow === 'both' || e.arrow === 'none') {
                    A[u][v] += 1;
                }
                if (e.arrow === 'start' || e.arrow === 'both' || e.arrow === 'none') {
                    if (u !== v) A[v][u] += 1; // Prevent double-counting self-loops
                }
            }
        }
    });

    // 4. Populate Degree Matrix (D)
    for (let i = 0; i < n; i++) {
        let deg = 0;
        for (let j = 0; j < n; j++) {
            deg += A[i][j]; // Sums the row (Out-degree)
        }
        D[i][i] = deg;
    }

    // 5. Calculate Laplacian Matrix (L = D - A)
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            L[i][j] = D[i][j] - A[i][j];
        }
    }

    // 6. Formatting Helper Function
    function matrixToLaTeX(mat, name) {
        let tex = `${name} = \\begin{bmatrix}\n`;
        for (let i = 0; i < n; i++) {
            tex += "    " + mat[i].join(" & ") + (i < n - 1 ? " \\\\" : "") + "\n";
        }
        tex += `\\end{bmatrix}\n`;
        return tex;
    }

    // 7. Output Assembly
    let out = `% Node Mapping (Row/Col order):\n`;
    out += `% V = [ ${labels.map(l => l).join(', ')} ]\n\n`;
    
    out += `% Adjacency Matrix\n` + matrixToLaTeX(A, 'A') + '\n';
    out += `% Degree Matrix\n` + matrixToLaTeX(D, 'D') + '\n';
    out += `% Laplacian Matrix (L = D - A)\n` + matrixToLaTeX(L, 'L');

    return out;
};