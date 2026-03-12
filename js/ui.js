const resizer = document.getElementById('resizer');
const leftSide = document.getElementById('left-panel');
let isResizing = false; let startX, startWidth;

resizer.addEventListener('mousedown', (e) => {
    isResizing = true; startX = e.clientX; startWidth = leftSide.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = startWidth + (e.clientX - startX);
    const parentWidth = resizer.parentNode.getBoundingClientRect().width;
    leftSide.style.flex = `0 0 ${(newWidth / parentWidth) * 100}%`;
});
document.addEventListener('mouseup', () => { isResizing = false; document.body.style.cursor = 'default'; });

const basicColors = [
    { name: "black", hex: "#000000" }, { name: "gray", hex: "#808080" },
    { name: "white", hex: "#FFFFFF" }, { name: "red", hex: "#FF0000" },
    { name: "green", hex: "#00FF00" }, { name: "blue", hex: "#0000FF" }, 
    { name: "cyan", hex: "#00FFFF" }, { name: "magenta", hex: "#FF00FF" }, 
    { name: "yellow", hex: "#FFFF00" }
];

window.activeColor = basicColors[0].name;

function setupColorPicker() {
    const colorList = document.getElementById('color-list');
    colorList.innerHTML = ''; 
    
    basicColors.forEach(c => {
        let item = document.createElement('div'); item.className = 'select-item';
        let displayName = c.name.charAt(0).toUpperCase() + c.name.slice(1);
        item.innerHTML = `<span class="color-box" style="background: ${c.hex};"></span> ${displayName}`;
        
        item.addEventListener('click', () => {
            window.activeColor = c.name;
            document.getElementById('current-color').innerHTML = `<span class="color-box" style="background: ${c.hex};"></span> ${displayName}`;
            document.getElementById('color-list').classList.add('select-hide');
            if (typeof window.applyPropertyToSelection === 'function') window.applyPropertyToSelection('color', window.activeColor);
        });
        colorList.appendChild(item);
    });

    document.getElementById('current-color').addEventListener('click', () => document.getElementById('color-list').classList.toggle('select-hide'));
    document.addEventListener('click', (e) => {
        if (!document.getElementById('color-picker').contains(e.target)) document.getElementById('color-list').classList.add('select-hide');
    });
}
window.addEventListener('DOMContentLoaded', setupColorPicker);
window.getHexFromName = function(name) {
    let match = basicColors.find(c => c.name === name); return match ? match.hex : "#000000";
};