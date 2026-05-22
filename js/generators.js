function getBounds() {
    if (window.points.length === 0 && window.texts.length === 0 && window.regions.length === 0) {
        return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    }

    let minX = 0, maxX = 0, minY = 0, maxY = 0;

    window.points.forEach(p => {
        if (p.x < minX) minX = Math.floor(p.x);
        if (p.x > maxX) maxX = Math.ceil(p.x);
        if (p.y < minY) minY = Math.floor(p.y);
        if (p.y > maxY) maxY = Math.ceil(p.y);
    });

    window.texts.forEach(t => {
        if (t.x < minX) minX = Math.floor(t.x);
        if (t.x > maxX) maxX = Math.ceil(t.x);
        if (t.y < minY) minY = Math.floor(t.y);
        if (t.y > maxY) maxY = Math.ceil(t.y);
    });

    window.regions.forEach(r => {
        if (r.minX < minX) minX = Math.floor(r.minX);
        if (r.maxX > maxX) maxX = Math.ceil(r.maxX);
        if (r.minY < minY) minY = Math.floor(r.minY);
        if (r.maxY > maxY) maxY = Math.ceil(r.maxY);
    });

    window.edges.forEach(e => {
        const p1 = window.points.find(p => p.id === e.sourceId);
        if (!p1) return;
        if (e.type === 'circle' || e.type === 'arc') {
            const r = e.radius;
            if (p1.x - r < minX) minX = Math.floor(p1.x - r);
            if (p1.x + r > maxX) maxX = Math.ceil(p1.x + r);
            if (p1.y - r < minY) minY = Math.floor(p1.y - r);
            if (p1.y + r > maxY) maxY = Math.ceil(p1.y + r);
        } else if (e.type === 'curve') {
            const p2 = window.points.find(p => p.id === e.targetId);
            if (p2) {
                const r = Math.abs(e.offset);
                if (p1.x - r < minX) minX = Math.floor(p1.x - r);
                if (p1.x + r > maxX) maxX = Math.ceil(p1.x + r);
                if (p1.y - r < minY) minY = Math.floor(p1.y - r);
                if (p1.y + r > maxY) maxY = Math.ceil(p1.y + r);
            }
        } else if (e.type === 'loop') {
            const r = e.radius;
            const ang = e.loopAngle * Math.PI / 180;
            const cx = p1.x + r * Math.cos(ang);
            const cy = p1.y + r * Math.sin(ang);
            if (cx - r < minX) minX = Math.floor(cx - r);
            if (cx + r > maxX) maxX = Math.ceil(cx + r);
            if (cy - r < minY) minY = Math.floor(cy - r);
            if (cy + r > maxY) maxY = Math.ceil(cy + r);
        } else if (e.type === 'elliptic-arc') {
            const p2 = window.points.find(p => p.id === e.targetId);
            if (p2) {
                const cx = (p1.x + p2.x) / 2;
                const cy = (p1.y + p2.y) / 2;
                const a = e.radius;
                if (cx - a < minX) minX = Math.floor(cx - a);
                if (cx + a > maxX) maxX = Math.ceil(cx + a);
                if (cy - a < minY) minY = Math.floor(cy - a);
                if (cy + a > maxY) maxY = Math.ceil(cy + a);
            }
        }
    });

    return { minX: minX - 1, maxX: maxX + 1, minY: minY - 1, maxY: maxY + 1 };
}

function makeStyleRegistry(prefix) {
    const styles = new Map();
    const definitions = [];

    return {
        nameFor(key, options) {
            if (!styles.has(key)) {
                const safePrefix = prefix.replace(/[^a-zA-Z0-9]/g, '');
                const name = `${safePrefix}${styles.size}`;
                styles.set(key, name);
                definitions.push({ name, options });
            }
            return styles.get(key);
        },
        definitions,
    };
}

function renderTikzStyleDefinitions(definitions) {
    if (definitions.length === 0) return '';
    return `\\tikzset{\n${definitions.map(def => `    ${def.name}/.style={${def.options}}`).join(',\n')}\n}\n\n`;
}

function renderPstricksStyleDefinitions(definitions) {
    if (definitions.length === 0) return '';
    return definitions.map(def => `    \\newpsstyle{${def.name}}{${def.options}}`).join('\n') + '\n\n';
}

function collectIncidentCounts() {
    const incidentCount = new Map();
    window.points.forEach(p => incidentCount.set(p.id, 0));
    window.edges.forEach(e => {
        if (incidentCount.has(e.sourceId)) {
            incidentCount.set(e.sourceId, incidentCount.get(e.sourceId) + 1);
        }
        if (incidentCount.has(e.targetId) && e.targetId !== e.sourceId) {
            incidentCount.set(e.targetId, incidentCount.get(e.targetId) + 1);
        }
    });
    return incidentCount;
}

window.generateCode = function() {
    const format = document.getElementById('code-format').value;
    const out = document.getElementById('codeOutput');

    if (window.points.length === 0 && window.texts.length === 0 && window.regions.length === 0 && (!window.plots || window.plots.length === 0)) {
        out.value = '% Add points or plot data to generate code!';
        return;
    }

    if (format === 'matrix') {
        out.value = window.generateMatricesLaTeX();
        return;
    }

    if (format === 'matplotlib') {
        out.value = window.generateMatplotlibCode ? window.generateMatplotlibCode() : '# Add plot data and click Render Plot to generate Matplotlib code.';
        return;
    }

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

    if (format === 'matlab') {
        out.value = window.generateMATLAB();
        return;
    }

    const b = getBounds();
    let latex = '';
    const nodeStyleRegistry = makeStyleRegistry(`${format}node`);
    const edgeStyleRegistry = makeStyleRegistry(`${format}edge`);

    if (format === 'pstricks') {
        latex += `% Requires: \\usepackage{pstricks, pst-node, pst-plot}\n`;
        latex += `\\begin{pspicture}(${b.minX},${b.minY})(${b.maxX},${b.maxY})\n`;
        latex += `    \\def\\r{2pt}\n    \\psgrid[subgriddiv=1,griddots=10,gridlabels=7pt](${b.minX},${b.minY})(${b.maxX},${b.maxY})\n\n`;

        const incidentCount = collectIncidentCounts();

        window.points.forEach(p => {
            const r = p.radius !== undefined ? p.radius : 5;
            if (r <= 0) return;
            const key = `r:${r}|style:${p.style}|color:${p.color}`;
            const fill = p.style === 'solid' ? p.color : 'white';
            nodeStyleRegistry.nameFor(key, `linecolor=${p.color}, fillstyle=solid, fillcolor=${fill}`);
        });

        window.edges.forEach(e => {
            const edgeKey = `color:${e.color}|style:${e.style}`;
            let edgeOptions = `linecolor=${e.color}`;
            if (e.style === 'dashed') edgeOptions += ', linestyle=dashed';
            if (e.style === 'dotted') edgeOptions += ', linestyle=dotted';
            edgeStyleRegistry.nameFor(edgeKey, edgeOptions);
        });

        latex += renderPstricksStyleDefinitions(nodeStyleRegistry.definitions);
        latex += renderPstricksStyleDefinitions(edgeStyleRegistry.definitions);

        if (window.regions && window.regions.length > 0) {
            latex += '    % Clusters / Regions\n';
            window.regions.forEach(r => {
                latex += `    \\psframe[linestyle=none, fillstyle=solid, fillcolor=${r.color}, opacity=0.15, framearc=0.3](${r.minX},${r.minY})(${r.maxX},${r.maxY})\n`;
            });
            latex += '\n';
        }

        window.points.forEach(p => {
            const r = p.radius !== undefined ? p.radius : 5;
            const ang = p.labelAngle !== undefined ? p.labelAngle : 90;
            const lbl = p.label !== '' ? ` \\uput[${ang}](${p.x},${p.y}){ $${p.label}$}` : '';

            if (r > 0) {
                const isIsolated = (incidentCount.get(p.id) || 0) === 0;
                if (isIsolated && r <= 1.5) {
                    latex += `    \\psdot[linecolor=${p.color}, dotstyle=${p.style === 'solid' ? '*' : 'o'}, dotsize=${Math.max(2, r * 3).toFixed(2)}pt](${p.x},${p.y})${lbl}\n`;
                } else {
                    const key = `r:${r}|style:${p.style}|color:${p.color}`;
                    const fill = p.style === 'solid' ? p.color : 'white';
                    const styleName = nodeStyleRegistry.nameFor(key, `linecolor=${p.color}, fillstyle=solid, fillcolor=${fill}`);
                    latex += `    \\cnode[style=${styleName}](${p.x},${p.y}){${(r / 25).toFixed(2)}}{n${p.id}}${lbl}\n`;
                }
            } else {
                latex += `    \\pnode(${p.x},${p.y}){n${p.id}}${lbl}\n`;
            }
        });

        latex += '\n';

        window.edges.forEach(e => {
            const edgeKey = `color:${e.color}|style:${e.style}`;
            const edgeStyleName = edgeStyleRegistry.nameFor(edgeKey, `linecolor=${e.color}${e.style === 'dashed' ? ', linestyle=dashed' : e.style === 'dotted' ? ', linestyle=dotted' : ''}`);

            let lbl = '';
            if (e.label && e.label !== '') {
                if (e.labelPos === 'above') lbl = ` \\naput{ $${e.label}$}`;
                else if (e.labelPos === 'below') lbl = ` \\nbput{ $${e.label}$}`;
                else if (e.labelPos === 'left') lbl = ` \\ncput{\\uput[180](0,0){ $${e.label}$}}`;
                else if (e.labelPos === 'right') lbl = ` \\ncput{\\uput[0](0,0){ $${e.label}$}}`;
                else if (e.labelPos === 'on') lbl = ` \\ncput*{ $${e.label}$}`;
                else lbl = ` \\naput{ $${e.label}$}`;
            }

            const p1 = window.points.find(p => p.id === e.sourceId);
            if (!p1) return;
            let arrowCmd = '';
            if (e.arrow === 'end') arrowCmd = '{->}';
            else if (e.arrow === 'start') arrowCmd = '{<-}';
            else if (e.arrow === 'both') arrowCmd = '{<->}';

            if (e.type === 'line') {
                const p2 = window.points.find(p => p.id === e.targetId);
                if (!p2) return;
                latex += `    \\ncline[style=${edgeStyleName}]${arrowCmd}{n${e.sourceId}}{n${e.targetId}}${lbl}\n`;
            } else if (e.type === 'curve') {
                const p2 = window.points.find(p => p.id === e.targetId);
                if (!p2) return;
                const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                const angle = 2 * Math.atan2(e.offset, len / 2) * 180 / Math.PI;
                latex += `    \\ncarc[style=${edgeStyleName}, arcangle=${angle.toFixed(1)}]${arrowCmd}{n${e.sourceId}}{n${e.targetId}}${lbl}\n`;
            } else if (e.type === 'loop') {
                const outAng = e.loopAngle + 30;
                const inAng = e.loopAngle - 30;
                latex += `    \\ncloop[style=${edgeStyleName}, loopsize=${e.radius}, angleA=${inAng}, angleB=${outAng}]${arrowCmd}{n${e.sourceId}}{n${e.sourceId}}${lbl}\n`;
            } else if (e.type === 'circle') {
                latex += `    \\pscircle[style=${edgeStyleName}](${p1.x},${p1.y}){${e.radius}}\n`;
            } else if (e.type === 'arc') {
                latex += `    \\psarc[style=${edgeStyleName}]${arrowCmd}(${p1.x},${p1.y}){${e.radius}}{${e.startAngle}}{${e.endAngle}}\n`;
            } else if (e.type === 'elliptic-arc') {
                const p2 = window.points.find(p => p.id === e.targetId);
                if (!p2) return;
                const c = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2;
                const a = Math.max(e.radius, c + 0.001);
                const b2 = Math.sqrt(a * a - c * c).toFixed(2);
                const rot = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI).toFixed(2);
                const cx = ((p1.x + p2.x) / 2).toFixed(2);
                const cy = ((p1.y + p2.y) / 2).toFixed(2);
                latex += `    \\rput{${rot}}(${cx},${cy}){\\psellipticarc[style=${edgeStyleName}]${arrowCmd}(0,0)(${a},${b2}){${e.startAngle}}{${e.endAngle}}}\n`;
            }
        });

        if (window.texts.length > 0) latex += '\n';
        window.texts.forEach(t => {
            latex += `    \\rput(${t.x},${t.y}){${t.color === 'black' ? `$${t.text}$` : `\\textcolor{${t.color}}{$${t.text}$}`}}\n`;
        });
        latex += '\\end{pspicture}';
    } else {
        latex += `% Requires: \\usepackage{tikz}\n`;

        window.points.forEach(p => {
            const r = p.radius !== undefined ? p.radius : 5;
            if (r <= 0) return;
            const key = `r:${r}|style:${p.style}|color:${p.color}`;
            const fill = p.style === 'solid' ? p.color : 'white';
            nodeStyleRegistry.nameFor(key, `circle, draw=${p.color}, fill=${fill}, inner sep=${(r / 2).toFixed(2)}pt`);
        });

        window.edges.forEach(e => {
            const edgeKey = `color:${e.color}|style:${e.style}`;
            let edgeOptions = `draw=${e.color}, thick`;
            if (e.style === 'dashed') edgeOptions += ', dashed';
            if (e.style === 'dotted') edgeOptions += ', dotted';
            edgeStyleRegistry.nameFor(edgeKey, edgeOptions);
        });

        latex += `\\begin{tikzpicture}\n    \\draw[help lines, step=1.0] (${b.minX},${b.minY}) grid (${b.maxX},${b.maxY});\n\n`;
        latex += renderTikzStyleDefinitions(nodeStyleRegistry.definitions);
        latex += renderTikzStyleDefinitions(edgeStyleRegistry.definitions);

        if (window.regions && window.regions.length > 0) {
            latex += '    % Clusters / Regions\n';
            window.regions.forEach(r => {
                latex += `    \\draw [draw=none, fill=${r.color}, fill opacity=0.15, rounded corners=15pt] (${r.minX},${r.minY}) rectangle (${r.maxX},${r.maxY});\n`;
            });
            latex += '\n';
        }

        window.points.forEach(p => {
            const r = p.radius !== undefined ? p.radius : 5;
            const ang = p.labelAngle !== undefined ? p.labelAngle : 90;

            if (r > 0) {
                const lbl = p.label !== '' ? `, label={${ang}: $${p.label}$}` : '';
                const key = `r:${r}|style:${p.style}|color:${p.color}`;
                const styleName = nodeStyleRegistry.nameFor(key, `circle, draw=${p.color}, fill=${p.style === 'solid' ? p.color : 'white'}, inner sep=${(r / 2).toFixed(2)}pt`);
                latex += `    \\node[${styleName}${lbl}] (n${p.id}) at (${p.x},${p.y}) {};\n`;
            } else {
                const lbl = p.label !== '' ? `[label={${ang}: $${p.label}$}]` : '';
                latex += `    \\coordinate${lbl} (n${p.id}) at (${p.x},${p.y});\n`;
            }
        });

        latex += '\n';

        window.edges.forEach(e => {
            const edgeKey = `color:${e.color}|style:${e.style}`;
            const edgeStyleName = edgeStyleRegistry.nameFor(edgeKey, `draw=${e.color}, thick${e.style === 'dashed' ? ', dashed' : e.style === 'dotted' ? ', dotted' : ''}`);
            let lbl = '';
            if (e.label && e.label !== '') {
                let pos = '';
                if (e.labelPos === 'above') pos = 'above';
                else if (e.labelPos === 'below') pos = 'below';
                else if (e.labelPos === 'left') pos = 'left';
                else if (e.labelPos === 'right') pos = 'right';
                const fillOpts = e.labelPos === 'on' ? 'fill=white, inner sep=2pt' : `fill=white, inner sep=2pt, ${pos}`;
                lbl = ` node[${fillOpts}] { $${e.label}$}`;
            }

            const p1 = window.points.find(p => p.id === e.sourceId);
            if (!p1) return;
            let arrowCmd = '';
            if (e.arrow === 'end') arrowCmd = '->, ';
            else if (e.arrow === 'start') arrowCmd = '<-, ';
            else if (e.arrow === 'both') arrowCmd = '<->, ';

            if (e.type === 'line') {
                const p2 = window.points.find(p => p.id === e.targetId);
                if (!p2) return;
                latex += `    \\draw[${arrowCmd}${edgeStyleName}] (n${e.sourceId}) --${lbl} (n${e.targetId});\n`;
            } else if (e.type === 'curve') {
                const p2 = window.points.find(p => p.id === e.targetId);
                if (!p2) return;
                const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                const angle = 2 * Math.atan2(e.offset, len / 2) * 180 / Math.PI;
                const bend = angle > 0 ? `bend left=${Math.abs(angle).toFixed(1)}` : `bend right=${Math.abs(angle).toFixed(1)}`;
                latex += `    \\draw[${arrowCmd}${edgeStyleName}] (n${e.sourceId}) to[${bend}] ${lbl} (n${e.targetId});\n`;
            } else if (e.type === 'loop') {
                const outAng = e.loopAngle + 30;
                const inAng = e.loopAngle - 30;
                latex += `    \\draw[${arrowCmd}${edgeStyleName}] (n${e.sourceId}) to[out=${outAng}, in=${inAng}, loop, distance=${e.radius * 3}cm] ${lbl} (n${e.sourceId});\n`;
            } else if (e.type === 'circle') {
                latex += `    \\draw[${edgeStyleName}] (${p1.x},${p1.y}) circle (${e.radius});\n`;
            } else if (e.type === 'arc') {
                latex += `    \\draw[${arrowCmd}${edgeStyleName}] (${p1.x},${p1.y}) +(${e.startAngle}:${e.radius}) arc [start angle=${e.startAngle}, end angle=${e.endAngle}, radius=${e.radius}];\n`;
            } else if (e.type === 'elliptic-arc') {
                const p2 = window.points.find(p => p.id === e.targetId);
                if (!p2) return;
                const c = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2;
                const a = Math.max(e.radius, c + 0.001);
                const b2 = Math.sqrt(a * a - c * c).toFixed(2);
                const rot = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI).toFixed(2);
                const cx = ((p1.x + p2.x) / 2).toFixed(2);
                const cy = ((p1.y + p2.y) / 2).toFixed(2);
                latex += `    \\draw[${arrowCmd}${edgeStyleName}, rotate around={${rot}:(${cx},${cy})}] (${cx},${cy}) +(${e.startAngle}:${a} and ${b2}) arc [start angle=${e.startAngle}, end angle=${e.endAngle}, x radius=${a}, y radius=${b2}];\n`;
            }
        });

        if (window.texts.length > 0) latex += '\n';
        window.texts.forEach(t => {
            latex += `    \\node${t.color === 'black' ? '' : `[text=${t.color}]`} at (${t.x},${t.y}) {$${t.text}$};\n`;
        });
        latex += '\\end{tikzpicture}';
    }

    out.value = latex;
};
