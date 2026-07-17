// js/matlab.js

window.generateMATLAB = function() {
    if (window.points.length === 0) return "% Add points to generate MATLAB code!";

    let isDirected = window.edges.some(e => ['start', 'end', 'both'].includes(e.arrow));
    
    let s = [];
    let t = [];
    let weights = [];
    let hasWeights = false;

    window.edges.forEach(e => {
        if (['line', 'curve', 'loop', 'arc', 'elliptic-arc'].includes(e.type)) {
            let u = `"${e.sourceId}"`;
            let v = `"${e.targetId}"`;
            
            // MATLAB weights must be finite numbers. If label is not finite, default to 1.
            const numericLabel = Number(e.label);
            let w = Number.isFinite(numericLabel) ? numericLabel : 1;
            if (Number.isFinite(numericLabel)) hasWeights = true;

            if (e.arrow === 'start') {
                s.push(v); t.push(u); weights.push(w);
            } else if (e.arrow === 'both') {
                s.push(u); t.push(v); weights.push(w);
                s.push(v); t.push(u); weights.push(w);
            } else {
                s.push(u); t.push(v); weights.push(w);
            }
        }
    });

    let matlab = "";
    if (s.length > 0) {
        matlab += `s = [${s.join(', ')}];\n`;
        matlab += `t = [${t.join(', ')}];\n`;
        if (hasWeights) {
            matlab += `weights = [${weights.join(', ')}];\n`;
            matlab += isDirected ? `G = digraph(s, t, weights);\n` : `G = graph(s, t, weights);\n`;
            matlab += `plot(G, 'EdgeLabel', G.Edges.Weight);\n`;
        } else {
            matlab += isDirected ? `G = digraph(s, t);\n` : `G = graph(s, t);\n`;
            matlab += `plot(G);\n`;
        }
    } else {
        let vList = window.points.map(p => `"${p.id}"`).join(', ');
        matlab += `G = graph([], [], [], [${vList}]);\n`;
        matlab += `plot(G);\n`;
    }

    return matlab;
};