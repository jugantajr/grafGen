function getBounds() {
    if(window.points.length === 0 && window.texts.length === 0) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    window.points.forEach(p => {
        if (p.x < minX) minX = Math.floor(p.x); if (p.x > maxX) maxX = Math.ceil(p.x);
        if (p.y < minY) minY = Math.floor(p.y); if (p.y > maxY) maxY = Math.ceil(p.y);
    });
    window.texts.forEach(t => {
        if (t.x < minX) minX = Math.floor(t.x); if (t.x > maxX) maxX = Math.ceil(t.x);
        if (t.y < minY) minY = Math.floor(t.y); if (t.y > maxY) maxY = Math.ceil(t.y);
    });
    window.edges.forEach(e => {
        let p1 = window.points.find(p => p.id === e.sourceId); if (!p1) return;
        if(e.type === 'circle') {
            let p2 = window.points.find(p => p.id === e.targetId);
            if(p2) {
                let r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                if(p1.x - r < minX) minX = Math.floor(p1.x - r); if(p1.x + r > maxX) maxX = Math.ceil(p1.x + r);
                if(p1.y - r < minY) minY = Math.floor(p1.y - r); if(p1.y + r > maxY) maxY = Math.ceil(p1.y + r);
            }
        } else if (e.type === 'arc') {
            let r = e.radius;
            if(p1.x - r < minX) minX = Math.floor(p1.x - r); if(p1.x + r > maxX) maxX = Math.ceil(p1.x + r);
            if(p1.y - r < minY) minY = Math.floor(p1.y - r); if(p1.y + r > maxY) maxY = Math.ceil(p1.y + r);
        } else if (e.type === 'elliptic-arc') {
            let p2 = window.points.find(p => p.id === e.targetId);
            if (p2) {
                let cx = (p1.x + p2.x)/2; let cy = (p1.y + p2.y)/2; let a = e.radius; 
                if(cx - a < minX) minX = Math.floor(cx - a); if(cx + a > maxX) maxX = Math.ceil(cx + a);
                if(cy - a < minY) minY = Math.floor(cy - a); if(cy + a > maxY) maxY = Math.ceil(cy + a);
            }
        }
    });
    return { minX: minX - 1, maxX: maxX + 1, minY: minY - 1, maxY: maxY + 1 };
}

window.generateCode = function() {
    const format = document.getElementById('code-format').value;
    const out = document.getElementById('codeOutput');
    if (window.points.length === 0 && window.texts.length === 0) { out.value = "% Add points to generate code!"; return; }
    
    let b = getBounds(); let latex = "";
    
    if (format === 'pstricks') {
        latex += `% Requires: \\usepackage{pstricks, pst-node, pst-plot}\n`;
        latex += `\\begin{pspicture}(${b.minX},${b.minY})(${b.maxX},${b.maxY})\n`;
        latex += `    \\def\\r{2pt}\n    \\psgrid[subgriddiv=1,griddots=10,gridlabels=7pt](${b.minX},${b.minY})(${b.maxX},${b.maxY})\n\n`;

        window.points.forEach((p) => {
            let fill = p.style === 'solid' ? `fillstyle=solid, fillcolor=${p.color}` : `fillstyle=solid, fillcolor=white`;
            let ang = p.labelAngle !== undefined ? p.labelAngle : 90;
            let lbl = p.label !== "" ? ` \\uput[${ang}](${p.x},${p.y}){ $${p.label}$}` : "";
            latex += `    \\cnode[${fill}, linecolor=${p.color}](${p.x},${p.y}){\\r}{n${p.id}}${lbl}\n`;
        });
        latex += `\n`;
        
        window.edges.forEach((e) => {
            let st = `linecolor=${e.color}`;
            if (e.style === 'dashed') st += ", linestyle=dashed";
            if (e.style === 'dotted') st += ", linestyle=dotted";
            
            let lbl = "";
            if (e.label && e.label !== "") {
                if (e.labelPos === 'above') lbl = ` \\naput{ $${e.label}$}`; else if (e.labelPos === 'below') lbl = ` \\nbput{ $${e.label}$}`; else lbl = ` \\ncput*[npos=0.5]{ $${e.label}$}`;
            }

            let p1 = window.points.find(p => p.id === e.sourceId); let p2 = window.points.find(p => p.id === e.targetId);
            if (!p1) return;

            // FIX: If no arrow is selected, output empty string, NOT brackets
            let arrowCmd = '';
            if (e.arrow === 'end') arrowCmd = '{->}'; else if (e.arrow === 'start') arrowCmd = '{<-}'; else if (e.arrow === 'both') arrowCmd = '{<->}';

            if (e.type === 'line') {
                if (!p2) return; latex += `    \\ncline[${st}]${arrowCmd}{n${e.sourceId}}{n${e.targetId}}${lbl}\n`;
            } else if (e.type === 'circle') {
                if (!p2) return; let r = Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(2); latex += `    \\pscircle[${st}](${p1.x},${p1.y}){${r}}\n`;
            } else if (e.type === 'arc') {
                latex += `    \\psarc[${st}]${arrowCmd}(${p1.x},${p1.y}){${e.radius}}{${e.startAngle}}{${e.endAngle}}\n`;
            } else if (e.type === 'elliptic-arc') {
                if (!p2) return; let c = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2; let a = Math.max(e.radius, c + 0.001); let b = Math.sqrt(a*a - c*c).toFixed(2);
                let rot = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI).toFixed(2);
                let cx = ((p1.x + p2.x)/2).toFixed(2); let cy = ((p1.y + p2.y)/2).toFixed(2);
                latex += `    \\rput{${rot}}(${cx},${cy}){\\psellipticarc[${st}]${arrowCmd}(0,0)(${a},${b}){${e.startAngle}}{${e.endAngle}}}\n`;
            }
        });
        
        if (window.texts.length > 0) latex += `\n`;
        window.texts.forEach(t => { latex += `    \\rput(${t.x},${t.y}){${t.color === 'black' ? `$${t.text}$` : `\\textcolor{${t.color}}{$${t.text}$}`}}\n`; });

        latex += `\\end{pspicture}`;
        
    } else { // TikZ
        latex += `% Requires: \\usepackage{tikz}\n`;
        latex += `\\begin{tikzpicture}\n    \\draw[help lines, step=1.0] (${b.minX},${b.minY}) grid (${b.maxX},${b.maxY});\n\n`;
        
        window.points.forEach((p) => {
            let fill = p.style === 'solid' ? p.color : 'white'; let ang = p.labelAngle !== undefined ? p.labelAngle : 90;
            let lbl = p.label !== "" ? `, label={${ang}: $${p.label}$}` : '';
            latex += `    \\node[circle, draw=${p.color}, fill=${fill}, inner sep=1.5pt${lbl}] (n${p.id}) at (${p.x},${p.y}) {};\n`;
        });
        latex += `\n`;
        
        window.edges.forEach((e) => {
            let st = e.style === 'dashed' ? ', dashed' : e.style === 'dotted' ? ', dotted' : '';
            let lbl = "";
            if (e.label && e.label !== "") {
                let pos = e.labelPos === 'sloped' ? 'sloped, above' : e.labelPos;
                lbl = ` node[fill=white, inner sep=1pt, ${pos}] { $${e.label}$}`;
            }

            let p1 = window.points.find(p => p.id === e.sourceId); let p2 = window.points.find(p => p.id === e.targetId);
            if (!p1) return;

            let arrowCmd = '';
            if (e.arrow === 'end') arrowCmd = '->, '; else if (e.arrow === 'start') arrowCmd = '<-, '; else if (e.arrow === 'both') arrowCmd = '<->, ';

            if (e.type === 'line') {
                if (!p2) return; latex += `    \\draw[${arrowCmd}${e.color}${st}, thick] (n${e.sourceId}) --${lbl} (n${e.targetId});\n`;
            } else if (e.type === 'circle') {
                if (!p2) return; let r = Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(2); latex += `    \\draw[${e.color}${st}, thick] (${p1.x},${p1.y}) circle (${r});\n`;
            } else if (e.type === 'arc') {
                latex += `    \\draw[${arrowCmd}${e.color}${st}, thick] (${p1.x},${p1.y}) +(${e.startAngle}:${e.radius}) arc [start angle=${e.startAngle}, end angle=${e.endAngle}, radius=${e.radius}];\n`;
            } else if (e.type === 'elliptic-arc') {
                if (!p2) return; let c = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2; let a = Math.max(e.radius, c + 0.001); let b = Math.sqrt(a*a - c*c).toFixed(2);
                let rot = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI).toFixed(2); let cx = ((p1.x + p2.x)/2).toFixed(2); let cy = ((p1.y + p2.y)/2).toFixed(2);
                latex += `    \\draw[${arrowCmd}${e.color}${st}, thick, rotate around={${rot}:(${cx},${cy})}] (${cx},${cy}) +(${e.startAngle}:${a} and ${b}) arc [start angle=${e.startAngle}, end angle=${e.endAngle}, x radius=${a}, y radius=${b}];\n`;
            }
        });
        
        if (window.texts.length > 0) latex += `\n`;
        window.texts.forEach(t => { latex += `    \\node${t.color === 'black' ? '' : `[text=${t.color}]`} at (${t.x},${t.y}) {$${t.text}$};\n`; });
        latex += `\\end{tikzpicture}`;
    }
    out.value = latex;
};