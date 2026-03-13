const resizer = document.getElementById('resizer');
const leftSide = document.getElementById('left-panel');
const workspace = document.getElementById('workspace');

let isResizing = false; 
let startX, startY, startWidth, startHeight;
let isVertical = false;

// NEW: Toggle UI Layout
window.toggleLayout = function() {
    workspace.classList.toggle('vertical-layout');
    isVertical = workspace.classList.contains('vertical-layout');
    // Force canvas to recalculate its dimensions instantly
    window.dispatchEvent(new Event('resize'));
};

// Start Resizing (Handles both Mouse and Mobile Touch)
function initResize(e) {
    isResizing = true; 
    let clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let clientY = e.touches ? e.touches[0].clientY : e.clientY;

    if (isVertical) {
        startY = clientY; 
        startHeight = leftSide.getBoundingClientRect().height;
        document.body.style.cursor = 'row-resize';
    } else {
        startX = clientX; 
        startWidth = leftSide.getBoundingClientRect().width;
        document.body.style.cursor = 'col-resize';
    }
}

// Drag Resizing (Handles both Mouse and Mobile Touch)
function doResize(e) {
    if (!isResizing) return;
    let clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let clientY = e.touches ? e.touches[0].clientY : e.clientY;

    if (isVertical) {
        const newHeight = startHeight + (clientY - startY);
        const parentHeight = resizer.parentNode.getBoundingClientRect().height;
        leftSide.style.flex = `0 0 ${(newHeight / parentHeight) * 100}%`;
    } else {
        const newWidth = startWidth + (clientX - startX);
        const parentWidth = resizer.parentNode.getBoundingClientRect().width;
        leftSide.style.flex = `0 0 ${(newWidth / parentWidth) * 100}%`;
    }
}

// Stop Resizing
function stopResize() {
    isResizing = false; 
    document.body.style.cursor = 'default';
}

// Attach Resizer Events
resizer.addEventListener('mousedown', initResize);
resizer.addEventListener('touchstart', initResize, {passive: true});

document.addEventListener('mousemove', doResize);
document.addEventListener('touchmove', doResize, {passive: true});

document.addEventListener('mouseup', stopResize);
document.addEventListener('touchend', stopResize);

// Standard LaTeX Default Colors
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

window.openInstructions = function() {
    document.getElementById('instructions-modal').style.display = 'flex';
};
window.closeInstructions = function() {
    document.getElementById('instructions-modal').style.display = 'none';
};

window.openAbout = function() {
    document.getElementById('about-modal').style.display = 'flex';
};
window.closeAbout = function() {
    document.getElementById('about-modal').style.display = 'none';
};

// Close modals if the user clicks anywhere outside of the content boxes
window.addEventListener('click', function(event) {
    let helpModal = document.getElementById('instructions-modal');
    let aboutModal = document.getElementById('about-modal');
    
    if (event.target === helpModal) {
        helpModal.style.display = "none";
    }
    if (event.target === aboutModal) {
        aboutModal.style.display = "none";
    }
});

// ==========================================
// THEME TOGGLE (Light / Dark Mode)
// ==========================================
window.toggleTheme = function() {
    document.body.classList.toggle('dark-mode');
    let isDark = document.body.classList.contains('dark-mode');
    
    // Save preference to browser storage
    localStorage.setItem('prograph_theme', isDark ? 'dark' : 'light');
    
    // Swap the icon
    let icon = document.querySelector('#theme-btn .material-symbols-outlined');
    if (icon) {
        icon.innerText = isDark ? 'light_mode' : 'dark_mode';
    }

    if (typeof draw === 'function') draw();
};

// Check for saved theme on load
window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('prograph_theme') === 'dark') {
        document.body.classList.add('dark-mode');
        let icon = document.querySelector('#theme-btn .material-symbols-outlined');
        if (icon) icon.innerText = 'light_mode';
    }
});