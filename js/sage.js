// js/sage.js

window.generateSageMath = function() {
    if (window.points.length === 0) return "# Add points to generate SageMath code!";

    // 1. Determine if the graph is directed
    let isDirected = window.edges.some(e => ['start', 'end', 'both'].includes(e.arrow));
    
    let sage = isDirected ? "G = DiGraph()\n" : "G = Graph()\n";

    // 2. Build the edge list
    let edgeList = [];
    window.edges.forEach(e => {
        if (['line', 'curve', 'loop', 'arc', 'elliptic-arc'].includes(e.type)) {
            let u = e.sourceId;
            let v = e.targetId;
            
            // If the user added a custom text label to the edge, include it in the tuple
            let lbl = (e.label && e.label !== "") ? `"${e.label}"` : null;

            if (e.arrow === 'start') {
                edgeList.push(lbl ? `(${v}, ${u}, ${lbl})` : `(${v}, ${u})`);
            } else if (e.arrow === 'both') {
                edgeList.push(lbl ? `(${u}, ${v}, ${lbl})` : `(${u}, ${v})`);
                edgeList.push(lbl ? `(${v}, ${u}, ${lbl})` : `(${v}, ${u})`);
            } else {
                // 'end' or 'none' (Undirected defaults to u -> v)
                edgeList.push(lbl ? `(${u}, ${v}, ${lbl})` : `(${u}, ${v})`);
            }
        }
    });

    // 3. Output the exact minimal format
    if (edgeList.length > 0) {
        sage += `G.add_edges([${edgeList.join(', ')}])\n`;
    } else {
        // Fallback: If the user just drew disconnected dots with no edges
        let vList = window.points.map(p => p.id).join(', ');
        sage += `G.add_vertices([${vList}])\n`;
    }

    sage += "show(G)\n";

    return sage;
};