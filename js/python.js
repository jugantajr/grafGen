// js/python.js

function escapePythonString(value) {
    // JSON string escaping is compatible with Python double-quoted strings.
    return JSON.stringify(String(value));
}

window.generatePythonNetworkX = function() {
    let pts = window.points;
    let edges = window.edges;
    
    if (pts.length === 0) return "# Add points to generate Python code!";

    // Detect if the graph is directed (if any edge has an arrow)
    let isDirected = edges.some(e => ['end', 'start', 'both'].includes(e.arrow));
    let graphType = isDirected ? 'nx.DiGraph()' : 'nx.Graph()';

    let py = `import networkx as nx\n`;
    py += `import matplotlib.pyplot as plt\n\n`;
    
    py += `# Initialize graph\n`;
    py += `G = ${graphType}\n\n`;

    py += `# Add nodes with positions matching your visual layout\n`;
    const pointById = new Map(pts.map(p => [p.id, p]));
    pts.forEach(p => {
        let lbl = p.label || `n${p.id}`;
        py += `G.add_node(${escapePythonString(lbl)}, pos=(${p.x.toFixed(2)}, ${p.y.toFixed(2)}))\n`;
    });
    py += `\n`;

    py += `# Add edges\n`;
    let edgeList = [];
    edges.forEach(e => {
        if (e.sourceId !== undefined && e.targetId !== undefined) {
            let p1 = pointById.get(e.sourceId);
            let p2 = pointById.get(e.targetId);
            
            if (p1 && p2) {
                let u = p1.label || `n${p1.id}`;
                let v = p2.label || `n${p2.id}`;
                const uEsc = escapePythonString(u);
                const vEsc = escapePythonString(v);
                
                if (isDirected) {
                    if (e.arrow === 'end') edgeList.push(`(${uEsc}, ${vEsc})`);
                    else if (e.arrow === 'start') edgeList.push(`(${vEsc}, ${uEsc})`);
                    else if (e.arrow === 'both') { 
                        edgeList.push(`(${uEsc}, ${vEsc})`); 
                        edgeList.push(`(${vEsc}, ${uEsc})`); 
                    }
                    // If directed graph but edge has no arrow, assume bidirectional
                    else { 
                        edgeList.push(`(${uEsc}, ${vEsc})`); 
                        edgeList.push(`(${vEsc}, ${uEsc})`); 
                    }
                } else {
                    edgeList.push(`(${uEsc}, ${vEsc})`);
                }
            }
        }
    });

    if (edgeList.length > 0) {
        py += `G.add_edges_from([\n    ${edgeList.join(', ')}\n])\n\n`;
    }

    py += `# --- Optional: Plot the graph ---\n`;
    py += `pos = nx.get_node_attributes(G, 'pos')\n`;
    py += `nx.draw(G, pos, with_labels=True, node_color='lightblue', edge_color='gray', font_weight='bold', node_size=700)\n`;
    py += `plt.show()\n`;

    return py;
};