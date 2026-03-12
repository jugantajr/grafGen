function getBounds() {
    if(points.length === 0 && (typeof texts === 'undefined' || texts.length === 0)) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    points.forEach(p => {
        if (p.x < minX) minX = Math.floor(p.x); if (p.x > maxX) maxX = Math.ceil(p.x);
        if (p.y < minY) minY = Math.floor(p.y); if (p.y > maxY) maxY = Math.ceil(p.y);
    });
    if (typeof texts !== 'undefined') {
        texts.forEach(t => {
            if (t.x < minX) minX = Math.floor(t.x); if (t.x > maxX) maxX = Math.ceil(t.x);
            if (t.y < minY) minY = Math.floor(t.y); if (t.y > maxY) maxY = Math.ceil(t.y);
        });
    }
    edges.forEach(e => {
        if(e.type === 'circle' || e.type === 'arc') {
            let p1 = points.find(p => p.id === e.sourceId); let p2 = points.find(p => p.id === e.targetId);
            if(p1 && p2) {
                let r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                if(p1.x - r < minX) minX = Math.floor(p1.x - r); if(p1.x + r > maxX) maxX = Math.ceil(p1.x + r);
                if(p1.y - r < minY) minY = Math.floor(p1.y - r); if(p1.y + r > maxY) maxY = Math.ceil(p1.y + r);
            }
        }
    });
    return { minX: minX - 1, maxX: maxX + 1, minY: minY - 1, maxY: maxY + 1 };
}

window.generateCode = function() {
    const format = document.getElementById('code-format').value;
    const out = document.getElementById('codeOutput');
    if (points.length === 0 && texts.length === 0) { out.value = "% Add points to generate code!"; return; }
    
    let b = getBounds();
    let latex = `% Requires: \\usepackage[x11names]{xcolor}\n`;
    
    if (format === 'pstricks') {
        latex += `\\begin{pspicture}(${b.minX},${b.minY})(${b.maxX},${b.maxY})\n`;
        latex += `    \\def\\r{2pt}\n    \\psgrid[subgriddiv=1,griddots=10,gridlabels=7pt](${b.minX},${b.minY})(${b.maxX},${b.maxY})\n\n`;

        points.forEach((p) => {
            let fill = p.style === 'solid' ? `fillstyle=solid, fillcolor=${p.color}` : `fillstyle=solid, fillcolor=white`;
            let lbl = p.label !== "" ? ` \\uput[${p.angle}](${p.x},${p.y}){ $${p.label}$}` : "";
            latex += `    \\cnode[${fill}, linecolor=${p.color}](${p.x},${p.y}){\\r}{n${p.id}}${lbl}\n`;
        });
        latex += `\n`;
        
        edges.forEach((e) => {
            let st = `linecolor=${e.color}`;
            if (e.style === 'dashed') st += ", linestyle=dashed";
            if (e.style === 'dotted') st += ", linestyle=dotted";
            
            let lbl = "";
            if (e.label && e.label !== "") {
                let posMap = { "above": "npos=0.5", "below": "npos=0.5", "sloped": "nrot=:U" };
                lbl = ` \\ncput*[${posMap[e.labelPos] || ""}]{ $${e.label}$}`;
            }

            let p1 = points.find(p => p.id === e.sourceId); let p2 = points.find(p => p.id === e.targetId);
            if (!p1 || !p2) return;

            let arrowCmd = e.type === 'arrow' ? '{->}' : '{}';

            if (e.type === 'line' || e.type === 'arrow') {
                latex += `    \\ncline[${st}]${arrowCmd}{n${e.sourceId}}{n${e.targetId}}${lbl}\n`;
            } else if (e.type === 'circle') {
                let r = Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(2);
                latex += `    \\pscircle[${st}](${p1.x},${p1.y}){${r}}\n`;
            } else if (e.type === 'parabola') {
                latex += `    \\parabola[${st}](${p1.x},${p1.y})(${p2.x},${p2.y})\n`;
            } else if (e.type === 'arc') {
                let p3 = points.find(p => p.id === e.thirdId);
                if (p3) {
                    let r = Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(2);
                    let a1 = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI);
                    let a2 = (Math.atan2(p3.y - p1.y, p3.x - p1.x) * 180 / Math.PI);
                    if (a1 < 0) a1 += 360; if (a2 < 0) a2 += 360;
                    latex += `    \\psarc[${st}](${p1.x},${p1.y}){${r}}{${a1.toFixed(1)}}{${a2.toFixed(1)}}\n`;
                }
            }
        });
        
        if (texts.length > 0) latex += `\n`;
        texts.forEach(t => {
            latex += `    \\rput(${t.x},${t.y}){\\textcolor{${t.color}}{$${t.text}$}}\n`;
        });

        latex += `\\end{pspicture}`;
        
    } else { // TikZ
        latex += `\\begin{tikzpicture}\n    \\draw[help lines, step=1.0] (${b.minX},${b.minY}) grid (${b.maxX},${b.maxY});\n\n`;
        points.forEach((p) => {
            let fill = p.style === 'solid' ? p.color : 'white';
            let lbl = p.label !== "" ? `, label={${p.angle}: $${p.label}$}` : '';
            latex += `    \\node[circle, draw=${p.color}, fill=${fill}, inner sep=1.5pt${lbl}] (n${p.id}) at (${p.x},${p.y}) {};\n`;
        });
        latex += `\n`;
        edges.forEach((e) => {
            let st = e.style === 'dashed' ? ', dashed' : e.style === 'dotted' ? ', dotted' : '';
            let lbl = "";
            if (e.label && e.label !== "") {
                let pos = e.labelPos === "sloped" ? "sloped, above" : e.labelPos;
                lbl = ` node[fill=white, inner sep=1pt, ${pos}] { $${e.label}$}`;
            }

            let p1 = points.find(p => p.id === e.sourceId); let p2 = points.find(p => p.id === e.targetId);
            if (!p1 || !p2) return;

            let arrowCmd = e.type === 'arrow' ? '->, ' : '';

            if (e.type === 'line' || e.type === 'arrow') {
                latex += `    \\draw[${arrowCmd}${e.color}${st}, thick] (n${e.sourceId}) --${lbl} (n${e.targetId});\n`;
            } else if (e.type === 'circle') {
                let r = Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(2);
                latex += `    \\draw[${e.color}${st}, thick] (${p1.x},${p1.y}) circle (${r});\n`;
            } else if (e.type === 'parabola') {
                latex += `    \\draw[${e.color}${st}, thick] (${p1.x},${p1.y}) parabola (${p2.x},${p2.y});\n`;
            } else if (e.type === 'arc') {
                let p3 = points.find(p => p.id === e.thirdId);
                if (p3) {
                    let r = Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(2);
                    let a1 = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI);
                    let a2 = (Math.atan2(p3.y - p1.y, p3.x - p1.x) * 180 / Math.PI);
                    if (a1 < 0) a1 += 360; if (a2 < 0) a2 += 360;
                    latex += `    \\draw[${e.color}${st}, thick] (${p2.x},${p2.y}) arc [start angle=${a1.toFixed(1)}, end angle=${a2.toFixed(1)}, radius=${r}];\n`;
                }
            }
        });
        
        if (texts.length > 0) latex += `\n`;
        texts.forEach(t => {
            latex += `    \\node[text=${t.color}] at (${t.x},${t.y}) {$${t.text}$};\n`;
        });

        latex += `\\end{tikzpicture}`;
    }
    out.value = latex;
};