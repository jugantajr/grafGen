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
// THEMING: support 'light', 'dark', and 'auto' (follow system)
function applyThemeMode(mode) {
    const body = document.body;
    if (mode === 'dark') {
        body.classList.add('dark-mode');
    } else if (mode === 'light') {
        body.classList.remove('dark-mode');
    } else if (mode === 'auto') {
        // follow system
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        body.classList.toggle('dark-mode', prefersDark);
    }

    // Update icon label on button
    const icon = document.querySelector('#theme-btn .material-symbols-outlined');
    if (icon) {
        if (mode === 'dark') icon.innerText = 'light_mode';
        else if (mode === 'light') icon.innerText = 'dark_mode';
        else icon.innerText = 'monitor';
    }

    if (typeof draw === 'function') draw();
}

function setThemeMode(mode, persist = true) {
    if (!['light','dark','auto'].includes(mode)) mode = 'auto';
    applyThemeMode(mode);
    if (persist) localStorage.setItem('prograph_theme', mode);
}

// Toggle cycles light -> dark -> auto -> light
window.toggleTheme = function() {
    const cur = localStorage.getItem('prograph_theme') || 'light';
    const order = ['light','dark','auto'];
    let idx = order.indexOf(cur);
    idx = (idx + 1) % order.length;
    setThemeMode(order[idx]);
};

// Listen to system changes when in auto
if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener && mq.addEventListener('change', (e) => {
        if ((localStorage.getItem('prograph_theme') || 'light') === 'auto') applyThemeMode('auto');
    });
}

// initialize theme on load
window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('prograph_theme') || 'light';
    setThemeMode(saved, false);
});
window.copyCode = function() {
    const codeBox = document.getElementById('codeOutput');
    if (!codeBox.value || codeBox.value.startsWith("% Add points")) return;

    navigator.clipboard.writeText(codeBox.value).then(() => {
        const btn = document.getElementById('copy-btn');
        const originalHTML = btn.innerHTML;
        
        // Change to a checkmark temporarily
        btn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 16px;">check</span> Copied!`;
        btn.style.background = "#20c997"; // Slightly different green
        
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.background = "#28a745";
        }, 1500);
    });
};

// ==========================================
// COLLAPSIBLE TOOLBAR + CUSTOMIZER
// ==========================================
window.toggleToolbar = function() {
    const tb = document.getElementById('toolbar');
    tb.classList.toggle('collapsed');
    const collapsed = tb.classList.contains('collapsed');
    localStorage.setItem('prograph_toolbar_collapsed', collapsed ? '1' : '0');
    // update toggle icon
    const tbtn = document.getElementById('toolbar-toggle');
    if (tbtn) {
        const icon = tbtn.querySelector('.material-symbols-outlined');
        if (icon) icon.innerText = collapsed ? 'menu' : 'menu_open';
        tbtn.title = collapsed ? 'Expand toolbar' : 'Collapse toolbar';
    }
};

window.openToolbarCustomizer = function() {
    const panel = document.getElementById('toolbar-customizer');
    if (!panel) return;
    // Build list dynamically if empty
    const list = document.getElementById('toolbar-customizer-list');
    if (list && list.children.length === 0) buildCustomizerList();
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
};

function buildCustomizerList() {
    const list = document.getElementById('toolbar-customizer-list');
    if (!list) return;
    list.innerHTML = '';
    const items = document.querySelectorAll('[data-toolbar-id]');
    const config = JSON.parse(localStorage.getItem('prograph_toolbar_config') || '{}');
    items.forEach(el => {
        const id = el.getAttribute('data-toolbar-id');
        const label = el.title || el.getAttribute('aria-label') || id;
        const wrapper = document.createElement('label');
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = (id in config) ? config[id] : true;
        cb.addEventListener('change', () => {
            applyToolbarConfig({ [id]: cb.checked });
        });
        wrapper.appendChild(cb);
        const span = document.createElement('span'); span.textContent = ' ' + label;
        wrapper.appendChild(span);
        list.appendChild(wrapper);
    });
}

function applyToolbarConfig(delta) {
    const config = JSON.parse(localStorage.getItem('prograph_toolbar_config') || '{}');
    Object.assign(config, delta || {});
    Object.keys(config).forEach(id => {
        const el = document.querySelector(`[data-toolbar-id="${id}"]`);
        if (el) el.style.display = config[id] ? '' : 'none';
    });
}

window.saveToolbarConfig = function() {
    const items = document.querySelectorAll('[data-toolbar-id]');
    const cfg = {};
    items.forEach(el => cfg[el.getAttribute('data-toolbar-id')] = (el.style.display !== 'none'));
    localStorage.setItem('prograph_toolbar_config', JSON.stringify(cfg));
    const panel = document.getElementById('toolbar-customizer'); if (panel) panel.style.display = 'none';
};

window.resetToolbarConfig = function() {
    localStorage.removeItem('prograph_toolbar_config');
    // show all
    document.querySelectorAll('[data-toolbar-id]').forEach(el => el.style.display = '');
    const list = document.getElementById('toolbar-customizer-list'); if (list) list.innerHTML = '';
};

function loadToolbarState() {
    const tb = document.getElementById('toolbar');
    if (!tb) return;
    if (localStorage.getItem('prograph_toolbar_collapsed') === '1') tb.classList.add('collapsed');
    const cfg = JSON.parse(localStorage.getItem('prograph_toolbar_config') || '{}');
    if (Object.keys(cfg).length) {
        Object.keys(cfg).forEach(id => {
            const el = document.querySelector(`[data-toolbar-id="${id}"]`);
            if (el) el.style.display = cfg[id] ? '' : 'none';
        });
    }
}

// Drag-and-drop reordering for toolbar
function initToolbarDrag() {
    const container = document.getElementById('toolbar-actions');
    if (!container) return;

    let dragEl = null;

    container.querySelectorAll('[data-toolbar-id]').forEach(btn => {
        btn.setAttribute('draggable', 'true');

        btn.addEventListener('dragstart', (e) => {
            dragEl = btn;
            btn.classList.add('dragging');
            // show a nicer drag image (clone)
            try {
                const crt = btn.cloneNode(true);
                crt.style.position = 'absolute'; crt.style.top = '-9999px'; crt.style.left = '-9999px';
                document.body.appendChild(crt);
                e.dataTransfer.setDragImage(crt, 16, 16);
                setTimeout(() => document.body.removeChild(crt), 0);
            } catch (err) {}
            e.dataTransfer.effectAllowed = 'move';
        });

        btn.addEventListener('dragend', () => {
            if (dragEl) dragEl.classList.remove('dragging');
            dragEl = null;
            saveToolbarOrder();
        });
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const after = getDragAfterElement(container, e.clientX);
        const dragging = container.querySelector('.dragging');
        if (!dragging) return;
        if (after == null) container.appendChild(dragging);
        else container.insertBefore(dragging, after);
    });
}

function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('[data-toolbar-id]:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element || null;
}

function saveToolbarOrder() {
    const container = document.getElementById('toolbar-actions');
    if (!container) return;
    const ids = [...container.querySelectorAll('[data-toolbar-id]')].map(el => el.getAttribute('data-toolbar-id'));
    localStorage.setItem('prograph_toolbar_order', JSON.stringify(ids));
}

function loadToolbarOrder() {
    const order = JSON.parse(localStorage.getItem('prograph_toolbar_order') || '[]');
    if (!order.length) return;
    const container = document.getElementById('toolbar-actions');
    if (!container) return;
    order.forEach(id => {
        const el = container.querySelector(`[data-toolbar-id="${id}"]`);
        if (el) container.appendChild(el);
    });
}

// Wire drag init after DOM ready
window.addEventListener('DOMContentLoaded', () => {
    loadToolbarOrder();
    initToolbarDrag();
});

window.addEventListener('DOMContentLoaded', () => {
    // build color picker etc. already wired — load toolbar state after DOM ready
    loadToolbarState();
});