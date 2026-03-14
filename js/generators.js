function getBounds() {
    if(window.points.length === 0 && window.texts.length === 0 && window.regions.length === 0) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    
    window.points.forEach(p => {
        if (p.x < minX) minX = Math.floor(p.x); if (p.x > maxX) maxX = Math.ceil(p.x);
        if (p.y < minY) minY = Math.floor(p.y); if (p.y > maxY) maxY = Math.ceil(p.y);
    });
    window.texts.forEach(t => {
        if (t.x < minX) minX = Math.floor(t.x); if (t.x > maxX) maxX = Math.ceil(t.x);
        if (t.y < minY) minY = Math.floor(t.y); if (t.y > maxY) maxY = Math.ceil(t.y);
    });
    window.regions.forEach(r => {
        if (r.minX < minX) minX = Math.floor(r.minX); if (r.maxX > maxX) maxX = Math.ceil(r.maxX);
        if (r.minY < minY) minY = Math.floor(r.minY); if (r.maxY > maxY) maxY = Math.ceil(r.maxY);
    });
    window.edges.forEach(e => {
        let p1 = window.points.find(p => p.id === e.sourceId); if (!p1) return;
        if (e.type === 'circle' || e.type === 'arc') {
            let r = e.radius;
            if(p1.x - r < minX) minX = Math.floor(p1.x - r); if(p1.x + r > maxX) maxX = Math.ceil(p1.x + r);
            if(p1.y - r < minY) minY = Math.floor(p1.y - r); if(p1.y + r > maxY) maxY = Math.ceil(p1.y + r);
        } else if (e.type === 'curve') {
            let p2 = window.points.find(p => p.id === e.targetId);
            if (p2) {
                let r = Math.abs(e.offset); 
                if(p1.x - r < minX) minX = Math.floor(p1.x - r); if(p1.x + r > maxX) maxX = Math.ceil(p1.x + r);
                if(p1.y - r < minY) minY = Math.floor(p1.y - r); if(p1.y + r > maxY) maxY = Math.ceil(p1.y + r);
            }
        } else if (e.type === 'loop') {
            let r = e.radius; let ang = e.loopAngle * Math.PI / 180;
            let cx = p1.x + r * Math.cos(ang); let cy = p1.y + r * Math.sin(ang);
            if(cx - r < minX) minX = Math.floor(cx - r); if(cx + r > maxX) maxX = Math.ceil(cx + r);
            if(cy - r < minY) minY = Math.floor(cy - r); if(cy + r > maxY) maxY = Math.ceil(cy + r);
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
    if (window.points.length === 0 && window.texts.length === 0 && window.regions.length === 0) { out.value = "% Add points to generate code!"; return; }
    
    if (format === 'matrix') { 
        out.value = window.generateMatricesLaTeX(); 
        return; 
    }

    // NEW: Python Intercept
    if (format === 'python') {
        out.value = window.generatePythonNetworkX();
        return;
    }

    if (format === 'sage') {
        out.value = window.generateSageMath();
        return;
    }
    
    if (format === 'mathematica') {
        out.value = window.generateMathematica();
        return;
    }

    // NEW: Intercept MATLAB
    if (format === 'matlab') {
        out.value = window.generateMATLAB();
        return;
    }

    let b = getBounds(); let latex = "";
    
    if (format === 'pstricks') {
        latex += `% Requires: \\usepackage{pstricks, pst-node, pst-plot}\n`;
        latex += `\\begin{pspicture}(${b.minX},${b.minY})(${b.maxX},${b.maxY})\n`;
        latex += `    \\def\\r{2pt}\n    \\psgrid[subgriddiv=1,griddots=10,gridlabels=7pt](${b.minX},${b.minY})(${b.maxX},${b.maxY})\n\n`;

        if (window.regions && window.regions.length > 0) {
            latex += `    % Clusters / Regions\n`;
            window.regions.forEach(r => { latex += `    \\psframe[linestyle=none, fillstyle=solid, fillcolor=${r.color}, opacity=0.15, framearc=0.3](${r.minX},${r.minY})(${r.maxX},${r.maxY})\n`; });
            latex += `\n`;
        }

        window.points.forEach((p) => {
            let r = p.radius !== undefined ? p.radius : 5;
            let ang = p.labelAngle !== undefined ? p.labelAngle : 90;
            let lbl = p.label !== "" ? ` \\uput[${ang}](${p.x},${p.y}){ $${p.label}$}` : "";
            
            if (r > 0) {
                // Dynamically scale the radius size for PSTricks
                let fill = p.style === 'solid' ? `fillstyle=solid, fillcolor=${p.color}` : `fillstyle=solid, fillcolor=white`;
                latex += `    \\cnode[${fill}, linecolor=${p.color}](${p.x},${p.y}){${(r/25).toFixed(2)}}{n${p.id}}${lbl}\n`;
            } else {
                // Invisible Node
                latex += `    \\pnode(${p.x},${p.y}){n${p.id}}${lbl}\n`;
            }
        });
        latex += `\n`;
        
        window.edges.forEach((e) => {
            let st = `linecolor=${e.color}`;
            if (e.style === 'dashed') st += ", linestyle=dashed"; if (e.style === 'dotted') st += ", linestyle=dotted";
            
            let lbl = "";
            if (e.label && e.label !== "") {
                if (e.labelPos === 'above') lbl = ` \\naput{ $${e.label}$}`; 
                else if (e.labelPos === 'below') lbl = ` \\nbput{ $${e.label}$}`; 
                else if (e.labelPos === 'left') lbl = ` \\ncput{\\uput[180](0,0){ $${e.label}$}}`; 
                else if (e.labelPos === 'right') lbl = ` \\ncput{\\uput[0](0,0){ $${e.label}$}}`; 
                else if (e.labelPos === 'on') lbl = ` \\ncput*{ $${e.label}$}`; 
                else lbl = ` \\naput{ $${e.label}$}`; 
            }

            let p1 = window.points.find(p => p.id === e.sourceId); if (!p1) return;
            let arrowCmd = '';
            if (e.arrow === 'end') arrowCmd = '{->}'; else if (e.arrow === 'start') arrowCmd = '{<-}'; else if (e.arrow === 'both') arrowCmd = '{<->}';

            if (e.type === 'line') {
                let p2 = window.points.find(p => p.id === e.targetId); if (!p2) return;
                latex += `    \\ncline[${st}]${arrowCmd}{n${e.sourceId}}{n${e.targetId}}${lbl}\n`;
            } else if (e.type === 'curve') {
                let p2 = window.points.find(p => p.id === e.targetId); if (!p2) return;
                let len = Math.hypot(p2.x - p1.x, p2.y - p1.y); let angle = 2 * Math.atan2(e.offset, len / 2) * 180 / Math.PI; 
                latex += `    \\ncarc[${st}, arcangle=${angle.toFixed(1)}]${arrowCmd}{n${e.sourceId}}{n${e.targetId}}${lbl}\n`;
            } else if (e.type === 'loop') {
                let outAng = e.loopAngle + 30; let inAng = e.loopAngle - 30;
                latex += `    \\ncloop[${st}, loopsize=${e.radius}, angleA=${inAng}, angleB=${outAng}]${arrowCmd}{n${e.sourceId}}{n${e.sourceId}}${lbl}\n`;
            } else if (e.type === 'circle') {
                latex += `    \\pscircle[${st}](${p1.x},${p1.y}){${e.radius}}\n`;
            } else if (e.type === 'arc') {
                latex += `    \\psarc[${st}]${arrowCmd}(${p1.x},${p1.y}){${e.radius}}{${e.startAngle}}{${e.endAngle}}\n`;
            } else if (e.type === 'elliptic-arc') {
                let p2 = window.points.find(p => p.id === e.targetId); if (!p2) return;
                let c = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2; let a = Math.max(e.radius, c + 0.001); let b = Math.sqrt(a*a - c*c).toFixed(2);
                let rot = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI).toFixed(2); let cx = ((p1.x + p2.x)/2).toFixed(2); let cy = ((p1.y + p2.y)/2).toFixed(2);
                latex += `    \\rput{${rot}}(${cx},${cy}){\\psellipticarc[${st}]${arrowCmd}(0,0)(${a},${b}){${e.startAngle}}{${e.endAngle}}}\n`;
            }
        });
        
        if (window.texts.length > 0) latex += `\n`;
        window.texts.forEach(t => { latex += `    \\rput(${t.x},${t.y}){${t.color === 'black' ? `$${t.text}$` : `\\textcolor{${t.color}}{$${t.text}$}`}}\n`; });
        latex += `\\end{pspicture}`;
        
    } else { // TikZ
        latex += `% Requires: \\usepackage{tikz}\n`;
        latex += `\\begin{tikzpicture}\n    \\draw[help lines, step=1.0] (${b.minX},${b.minY}) grid (${b.maxX},${b.maxY});\n\n`;
        
        if (window.regions && window.regions.length > 0) {
            latex += `    % Clusters / Regions\n`;
            window.regions.forEach(r => { latex += `    \\draw [draw=none, fill=${r.color}, fill opacity=0.15, rounded corners=15pt] (${r.minX},${r.minY}) rectangle (${r.maxX},${r.maxY});\n`; });
            latex += `\n`;
        }

        window.points.forEach((p) => {
            let r = p.radius !== undefined ? p.radius : 5;
            let ang = p.labelAngle !== undefined ? p.labelAngle : 90;
            
            if (r > 0) {
                // Dynamically scale the inner sep for TikZ
                let fill = p.style === 'solid' ? p.color : 'white'; 
                let lbl = p.label !== "" ? `, label={${ang}: $${p.label}$}` : '';
                latex += `    \\node[circle, draw=${p.color}, fill=${fill}, inner sep=${r/2}pt${lbl}] (n${p.id}) at (${p.x},${p.y}) {};\n`;
            } else {
                // Invisible Coordinate
                let lbl = p.label !== "" ? `[label={${ang}: $${p.label}$}]` : '';
                latex += `    \\coordinate${lbl} (n${p.id}) at (${p.x},${p.y});\n`;
            }
        });
        latex += `\n`;
        
        window.edges.forEach((e) => {
            let st = e.style === 'dashed' ? ', dashed' : e.style === 'dotted' ? ', dotted' : '';
            let lbl = "";
            if (e.label && e.label !== "") {
                let pos = "";
                if (e.labelPos === 'above') pos = "above"; else if (e.labelPos === 'below') pos = "below"; else if (e.labelPos === 'left') pos = "left"; else if (e.labelPos === 'right') pos = "right";
                let fillOpts = e.labelPos === 'on' ? "fill=white, inner sep=2pt" : `fill=white, inner sep=2pt, ${pos}`;
                lbl = ` node[${fillOpts}] { $${e.label}$}`;
            }

            let p1 = window.points.find(p => p.id === e.sourceId); if (!p1) return;
            let arrowCmd = '';
            if (e.arrow === 'end') arrowCmd = '->, '; else if (e.arrow === 'start') arrowCmd = '<-, '; else if (e.arrow === 'both') arrowCmd = '<->, ';

            if (e.type === 'line') {
                let p2 = window.points.find(p => p.id === e.targetId); if (!p2) return;
                latex += `    \\draw[${arrowCmd}${e.color}${st}, thick] (n${e.sourceId}) --${lbl} (n${e.targetId});\n`;
            } else if (e.type === 'curve') {
                let p2 = window.points.find(p => p.id === e.targetId); if (!p2) return;
                let len = Math.hypot(p2.x - p1.x, p2.y - p1.y); let angle = 2 * Math.atan2(e.offset, len / 2) * 180 / Math.PI; 
                let bend = angle > 0 ? `bend left=${Math.abs(angle).toFixed(1)}` : `bend right=${Math.abs(angle).toFixed(1)}`;
                latex += `    \\draw[${arrowCmd}${e.color}${st}, thick] (n${e.sourceId}) to[${bend}] ${lbl} (n${e.targetId});\n`;
            } else if (e.type === 'loop') {
                let outAng = e.loopAngle + 30; let inAng = e.loopAngle - 30;
                latex += `    \\draw[${arrowCmd}${e.color}${st}, thick] (n${e.sourceId}) to[out=${outAng}, in=${inAng}, loop, distance=${e.radius*3}cm] ${lbl} (n${e.sourceId});\n`;
            } else if (e.type === 'circle') {
                latex += `    \\draw[${e.color}${st}, thick] (${p1.x},${p1.y}) circle (${e.radius});\n`;
            } else if (e.type === 'arc') {
                latex += `    \\draw[${arrowCmd}${e.color}${st}, thick] (${p1.x},${p1.y}) +(${e.startAngle}:${e.radius}) arc [start angle=${e.startAngle}, end angle=${e.endAngle}, radius=${e.radius}];\n`;
            } else if (e.type === 'elliptic-arc') {
                let p2 = window.points.find(p => p.id === e.targetId); if (!p2) return;
                let c = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2; let a = Math.max(e.radius, c + 0.001); let b = Math.sqrt(a*a - c*c).toFixed(2);
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