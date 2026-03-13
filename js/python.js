// js/python.js

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
    pts.forEach(p => {
        let lbl = p.label || `n${p.id}`;
        // Use raw strings (r"") so LaTeX characters like \n or \t don't break Python
        py += `G.add_node(r"${lbl}", pos=(${p.x.toFixed(2)}, ${p.y.toFixed(2)}))\n`;
    });
    py += `\n`;

    py += `# Add edges\n`;
    let edgeList = [];
    edges.forEach(e => {
        if (e.sourceId !== undefined && e.targetId !== undefined) {
            let p1 = pts.find(p => p.id === e.sourceId);
            let p2 = pts.find(p => p.id === e.targetId);
            
            if (p1 && p2) {
                let u = p1.label || `n${p1.id}`;
                let v = p2.label || `n${p2.id}`;
                
                if (isDirected) {
                    if (e.arrow === 'end') edgeList.push(`(r"${u}", r"${v}")`);
                    else if (e.arrow === 'start') edgeList.push(`(r"${v}", r"${u}")`);
                    else if (e.arrow === 'both') { 
                        edgeList.push(`(r"${u}", r"${v}")`); 
                        edgeList.push(`(r"${v}", r"${u}")`); 
                    }
                    // If directed graph but edge has no arrow, assume bidirectional
                    else { 
                        edgeList.push(`(r"${u}", r"${v}")`); 
                        edgeList.push(`(r"${v}", r"${u}")`); 
                    }
                } else {
                    edgeList.push(`(r"${u}", r"${v}")`);
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