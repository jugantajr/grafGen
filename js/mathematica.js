// js/mathematica.js

window.generateMathematica = function() {
    if (window.points.length === 0) return "(* Add points to generate Mathematica code! *)";

    let edgeList = [];
    window.edges.forEach(e => {
        if (['line', 'curve', 'loop', 'arc', 'elliptic-arc'].includes(e.type)) {
            let u = e.sourceId;
            let v = e.targetId;
            let lbl = (e.label && e.label !== "") ? e.label : null;

            let edgeStr = "";
            if (e.arrow === 'start') {
                edgeStr = `${v} -> ${u}`;
            } else if (e.arrow === 'both') {
                edgeStr = `${u} <-> ${v}`; // Mathematica handles bidirectional as undirected or explicit two-way
                edgeList.push(`${v} -> ${u}`); 
                edgeStr = `${u} -> ${v}`;
            } else if (e.arrow === 'end') {
                edgeStr = `${u} -> ${v}`;
            } else {
                edgeStr = `${u} <-> ${v}`;
            }
            
            // If the user added a label/weight, attach it as a Property
            if (lbl) {
                edgeList.push(`Property[${edgeStr}, EdgeLabels -> "${lbl}"]`);
            } else {
                edgeList.push(edgeStr);
            }
        }
    });

    let mathCode = "";
    if (edgeList.length > 0) {
        mathCode += `edges = {${edgeList.join(', ')}};\n`;
        mathCode += `Graph[edges, VertexLabels -> Automatic]\n`;
    } else {
        let vList = window.points.map(p => p.id).join(', ');
        mathCode += `Graph[{${vList}}, {}]\n`;
    }

    return mathCode;
};