// Split-pane Resizer Logic
const resizer = document.getElementById('resizer');
const leftSide = document.getElementById('left-panel');
let isResizing = false;
let startX, startWidth;

resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = leftSide.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = startWidth + (e.clientX - startX);
    const parentWidth = resizer.parentNode.getBoundingClientRect().width;
    leftSide.style.flex = `0 0 ${(newWidth / parentWidth) * 100}%`;
});

document.addEventListener('mouseup', () => {
    isResizing = false;
    document.body.style.cursor = 'default';
});

// Color Palette
const x11Colors = [
    { name: "Black", hex: "#000000" }, { name: "Gray50", hex: "#7F7F7F" },
    { name: "White", hex: "#FFFFFF" }, { name: "Red1", hex: "#FF0000" },
    { name: "Firebrick1", hex: "#FF3030" }, { name: "DarkOrange1", hex: "#FF7F00" },
    { name: "Green1", hex: "#00FF00" }, { name: "ForestGreen", hex: "#228B22" },
    { name: "Blue1", hex: "#0000FF" }, { name: "DodgerBlue1", hex: "#1E90FF" },
    { name: "Purple1", hex: "#9B30FF" }, { name: "Magenta1", hex: "#FF00FF" }
];

let activeColor = x11Colors[0].name;
let zoom = 1.0;

function setupColorPicker() {
    const colorList = document.getElementById('color-list');
    x11Colors.forEach(c => {
        let item = document.createElement('div');
        item.className = 'select-item';
        item.innerHTML = `<span class="color-box" style="background: ${c.hex};"></span> ${c.name}`;
        item.addEventListener('click', () => {
            activeColor = c.name;
            document.getElementById('current-color').innerHTML = `<span class="color-box" style="background: ${c.hex};"></span> ${c.name}`;
            document.getElementById('color-list').classList.add('select-hide');
            if (typeof window.applyPropertyToSelection === 'function') window.applyPropertyToSelection('color', activeColor);
        });
        colorList.appendChild(item);
    });

    document.getElementById('current-color').addEventListener('click', () => {
        document.getElementById('color-list').classList.toggle('select-hide');
    });

    document.addEventListener('click', (e) => {
        if (!document.getElementById('color-picker').contains(e.target)) {
            document.getElementById('color-list').classList.add('select-hide');
        }
    });
}

function getHexFromName(name) {
    let match = x11Colors.find(c => c.name === name);
    return match ? match.hex : "#000000";
}

function zoomIn() { zoom += 0.2; if(typeof draw === 'function') draw(); }
function zoomOut() { if (zoom > 0.4) { zoom -= 0.2; if(typeof draw === 'function') draw(); } }

window.addEventListener('DOMContentLoaded', setupColorPicker);