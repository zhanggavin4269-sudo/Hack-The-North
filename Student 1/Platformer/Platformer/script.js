const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false, Space: false };

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;
    else if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
    if (e.code === 'Space') keys.Space = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();

    if (e.key === 'Escape') {
        if (gameState === 'PLAYING') switchState('PAUSED');
        else if (gameState === 'PAUSED') { lastTime = Date.now(); switchState('PLAYING'); }
    }
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = false;
    else if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
    if (e.code === 'Space') keys.Space = false;
});

const player = { x: 50, y: 50, width: 30, height: 30, color: '#00f7ff', vx: 0, vy: 0, speed: 6, jumpStrength: -12.5, gravity: 0.6, grounded: false, coyoteTimer: 0, coyoteTime: 8 };

let currentLevelIndex = 0;
let isCustomLevel = false;
let platforms = [];
let lavaZones = [];
let movingPlatforms = [];
let movingLavaZones = [];
let levelKeys = [];
let portal = { x: 0, y: 0, width: 40, height: 60 };
let gameWon = false;

function getPathPoint(bounds, shape, progress, reverse) {
    let p = progress;
    if (reverse) p = 1 - p;
    let x = 0, y = 0;

    let rx = Math.min(bounds.x, bounds.x + bounds.w);
    let ry = Math.min(bounds.y, bounds.y + bounds.h);
    let rw = Math.abs(bounds.w);
    let rh = Math.abs(bounds.h);

    if (shape === 'line') {
        let pingPong = p < 0.5 ? p * 2 : 2 - (p * 2);
        x = bounds.x + bounds.w * pingPong;
        y = bounds.y + bounds.h * pingPong;
    } else if (shape === 'circle') {
        let angle = p * 2 * Math.PI;
        x = rx + rw / 2 + Math.cos(angle) * (rw / 2);
        y = ry + rh / 2 + Math.sin(angle) * (rh / 2);
    } else if (shape === 'square') {
        let L = 2 * rw + 2 * rh;
        let dist = p * L;
        if (dist < rw) { x = rx + dist; y = ry; }
        else if (dist < rw + rh) { x = rx + rw; y = ry + (dist - rw); }
        else if (dist < 2 * rw + rh) { x = rx + rw - (dist - rw - rh); y = ry + rh; }
        else { x = rx; y = ry + rh - (dist - 2 * rw - rh); }
    } else if (shape === 'triangle') {
        let L1 = Math.hypot(rw / 2, rh); let L2 = rw; let L = 2 * L1 + L2;
        let dist = p * L;
        if (dist < L1) { let f = dist / L1; x = (rx + rw / 2) + f * (rw / 2); y = ry + f * rh; }
        else if (dist < L1 + L2) { let f = (dist - L1) / L2; x = (rx + rw) - f * rw; y = ry + rh; }
        else { let f = (dist - L1 - L2) / L1; x = rx + f * (rw / 2); y = (ry + rh) - f * rh; }
    } else { x = bounds.x; y = bounds.y; }
    return { x, y };
}

function drawPathDots(obj) {
    if (!obj.pathShape) return;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    for (let i = 0; i < 1; i += 0.05) {
        let pt = getPathPoint(obj.pathBounds, obj.pathShape, i, obj.pathReverse);
        ctx.beginPath();
        let w = obj.width || 40; let h = obj.height || 20;
        ctx.arc(pt.x + w / 2, pt.y + h / 2, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}
let gameStarted = false;
let startTime = 0;
let finalTime = 0;
let lastTime = 0;

let maxUnlockedLevel = parseInt(localStorage.getItem('platformerMaxLevel')) || 0;
let customLevels = JSON.parse(localStorage.getItem('platformerCustomLevels')) || [];

let gameState = 'MENU';

const screens = {
    MENU: document.getElementById('main-menu'),
    LEVEL_SELECT: document.getElementById('level-select'),
    PAUSED: document.getElementById('pause-menu'),
    EDITOR_MENU: document.getElementById('editor-menu'),
    EDITOR_UI: document.getElementById('editor-ui'),
    HUD: document.getElementById('hud')
};

function switchState(newState) {
    gameState = newState;
    Object.values(screens).forEach(s => { if (s) s.classList.add('hidden'); });

    if (newState === 'MENU') screens.MENU.classList.remove('hidden');
    else if (newState === 'LEVEL_SELECT') { buildLevelGrid(); screens.LEVEL_SELECT.classList.remove('hidden'); }
    else if (newState === 'EDITOR_MENU') { buildCustomList(); screens.EDITOR_MENU.classList.remove('hidden'); }
    else if (newState === 'PAUSED') screens.PAUSED.classList.remove('hidden');
    else if (newState === 'EDITING') screens.EDITOR_UI.classList.remove('hidden');
    else if (newState === 'PLAYING') {
        screens.HUD.classList.remove('hidden');
        screens.HUD.style.display = 'block';
        lastTime = Date.now();
    }

    if (newState !== 'PLAYING') screens.HUD.style.display = 'none';
}

function buildLevelGrid() {
    const grid = document.getElementById('level-grid');
    grid.innerHTML = '';
    levels.forEach((lvl, i) => {
        const btn = document.createElement('button');
        btn.className = 'lvl-btn';
        btn.innerText = i + 1;
        if (i > maxUnlockedLevel) btn.disabled = true;
        btn.onclick = () => { isCustomLevel = false; loadLevel(i); switchState('PLAYING'); };
        grid.appendChild(btn);
    });
}

function buildCustomList() {
    const list = document.getElementById('custom-level-list');
    list.innerHTML = '';
    customLevels.forEach((lvl, i) => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `<span>${lvl.name || 'Custom Level ' + (i + 1)}</span>
            <div>
                <button class="btn secondary play-cust" data-idx="${i}" style="padding: 5px 10px; font-size: 0.9rem;">Play</button>
                <button class="btn primary edit-cust" data-idx="${i}" style="padding: 5px 10px; font-size: 0.9rem;">Edit</button>
                <button class="btn delete-cust" data-idx="${i}" style="padding: 5px 10px; font-size: 0.9rem; border: 1px solid #ef4444; color: #ef4444; background: transparent;">Delete</button>
            </div>`;
        list.appendChild(item);
    });

    document.querySelectorAll('.play-cust').forEach(btn => {
        btn.onclick = (e) => {
            const idx = parseInt(e.target.dataset.idx);
            isCustomLevel = true; currentLevelIndex = idx;
            loadLevelData(customLevels[idx]); switchState('PLAYING');
        };
    });
    document.querySelectorAll('.edit-cust').forEach(btn => {
        btn.onclick = (e) => {
            const idx = parseInt(e.target.dataset.idx);
            currentEditIndex = idx; editLevelData = JSON.parse(JSON.stringify(customLevels[idx]));
            document.getElementById('level-name-input').value = editLevelData.name || ('Custom Level ' + (idx + 1));
            switchState('EDITING');
        };
    });
    document.querySelectorAll('.delete-cust').forEach(btn => {
        btn.onclick = (e) => {
            const idx = parseInt(e.target.dataset.idx);
            if (confirm('Are you sure you want to delete this custom level?')) {
                customLevels.splice(idx, 1);
                localStorage.setItem('platformerCustomLevels', JSON.stringify(customLevels));
                buildCustomList();
            }
        };
    });
}

document.getElementById('btn-play').onclick = () => switchState('LEVEL_SELECT');
document.getElementById('btn-editor').onclick = () => switchState('EDITOR_MENU');
document.getElementById('btn-sel-back').onclick = () => switchState('MENU');
document.getElementById('btn-edit-back').onclick = () => switchState('MENU');
document.getElementById('btn-resume').onclick = () => { lastTime = Date.now(); switchState('PLAYING'); };
document.getElementById('btn-exit').onclick = () => switchState('MENU');

let currentEditIndex = -1;
let editLevelData = null;
let editorTool = 'platform';

document.getElementById('btn-new-level').onclick = () => {
    currentEditIndex = customLevels.length;
    editLevelData = {
        name: 'Custom Level ' + (currentEditIndex + 1),
        startPos: { x: 50, y: 500 },
        portal: { x: 700, y: 500 },
        platforms: [{ x: 0, y: 550, width: 800, height: 50, color: '#1e293b' }],
        lava: [], movingPlatforms: [], movingLavaZones: [], levelKeys: []
    };
    document.getElementById('level-name-input').value = editLevelData.name;
    switchState('EDITING');
};

document.getElementById('btn-save-level').onclick = () => {
    editLevelData.name = document.getElementById('level-name-input').value || editLevelData.name;
    if (currentEditIndex >= customLevels.length) customLevels.push(editLevelData);
    else customLevels[currentEditIndex] = editLevelData;
    localStorage.setItem('platformerCustomLevels', JSON.stringify(customLevels));
    switchState('EDITOR_MENU');
};

// Removed test button logic

const toolBtns = document.querySelectorAll('.tool-btn');
toolBtns.forEach(btn => {
    btn.onclick = () => {
        toolBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        editorTool = btn.dataset.tool;
    };
});

let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let dragCurrentX = 0, dragCurrentY = 0;

canvas.addEventListener('mousedown', e => {
    if (gameState !== 'EDITING') return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / 10) * 10;
    const y = Math.floor((e.clientY - rect.top) / 10) * 10;

    if (editorTool === 'eraser') {
        editLevelData.platforms = editLevelData.platforms.filter(p => !(x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height));
        editLevelData.lava = editLevelData.lava.filter(p => !(x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height));
        editLevelData.movingPlatforms = editLevelData.movingPlatforms.filter(p => {
            return !(x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height);
        });
        if (editLevelData.movingLavaZones) editLevelData.movingLavaZones = editLevelData.movingLavaZones.filter(p => !(x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height));
        editLevelData.levelKeys = editLevelData.levelKeys.filter(p => !(x >= p.x && x <= p.x + 20 && y >= p.y && y <= p.y + 20));
        return;
    }
    if (editorTool === 'start') { editLevelData.startPos = { x, y }; return; }
    if (editorTool === 'key') { editLevelData.levelKeys.push({ x, y }); return; }
    if (editorTool === 'portal') { editLevelData.portal = { x, y, width: 40, height: 60 }; return; }

    isDragging = true;
    dragStartX = x; dragStartY = y;
    dragCurrentX = x; dragCurrentY = y;
});

canvas.addEventListener('mousemove', e => {
    if (!isDragging || gameState !== 'EDITING') return;
    const rect = canvas.getBoundingClientRect();
    dragCurrentX = Math.floor((e.clientX - rect.left) / 10) * 10;
    dragCurrentY = Math.floor((e.clientY - rect.top) / 10) * 10;
});

canvas.addEventListener('mouseup', e => {
    if (!isDragging || gameState !== 'EDITING') return;
    isDragging = false;
    let w = dragCurrentX - dragStartX;
    let h = dragCurrentY - dragStartY;

    if (editorTool === 'moving' || editorTool === 'movingLava') {
        let shape = document.getElementById('path-shape').value;
        let rev = document.getElementById('path-reverse').checked;
        let lapSecs = parseFloat(document.getElementById('lap-time').value) || 3;
        let bounds = { x: dragStartX, y: dragStartY, w: w, h: h };
        if (editorTool === 'moving') editLevelData.movingPlatforms.push({ x: dragStartX, y: dragStartY, startX: dragStartX, startY: dragStartY, width: 60, height: 20, color: '#334155', pathShape: shape, pathBounds: bounds, pathReverse: rev, lapTime: lapSecs });
        else {
            if (!editLevelData.movingLavaZones) editLevelData.movingLavaZones = [];
            editLevelData.movingLavaZones.push({ x: dragStartX, y: dragStartY, startX: dragStartX, startY: dragStartY, width: 40, height: 40, pathShape: shape, pathBounds: bounds, pathReverse: rev, lapTime: lapSecs });
        }
        return;
    }

    let px = dragStartX; let py = dragStartY;
    if (w < 0) { px = dragCurrentX; w = -w; }
    if (h < 0) { py = dragCurrentY; h = -h; }
    if (w < 20) w = 20; if (h < 20) h = 20;

    if (editorTool === 'platform') editLevelData.platforms.push({ x: px, y: py, width: w, height: h, color: '#1e293b' });
    if (editorTool === 'lava') editLevelData.lava.push({ x: px, y: py, width: w, height: h });
});

function formatTime(ms) {
    let m = Math.floor(ms / 60000).toString().padStart(2, '0');
    let s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
    let c = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
    return `${m}:${s}.${c}`;
}

const levels = [
    { startPos: { x: 50, y: 500 }, portal: { x: 700, y: 490 }, platforms: [{ x: 0, y: 550, width: 800, height: 50, color: '#1e293b' }, { x: 300, y: 450, width: 200, height: 20, color: '#334155' }] },
    { startPos: { x: 50, y: 400 }, portal: { x: 700, y: 490 }, platforms: [{ x: 0, y: 550, width: 200, height: 50, color: '#1e293b' }, { x: 320, y: 550, width: 150, height: 50, color: '#1e293b' }, { x: 570, y: 550, width: 230, height: 50, color: '#1e293b' }] },
    { startPos: { x: 50, y: 500 }, portal: { x: 50, y: 130 }, platforms: [{ x: 0, y: 550, width: 200, height: 50, color: '#1e293b' }, { x: 280, y: 470, width: 100, height: 20, color: '#334155' }, { x: 440, y: 380, width: 100, height: 20, color: '#334155' }, { x: 280, y: 290, width: 100, height: 20, color: '#334155' }, { x: 120, y: 200, width: 100, height: 20, color: '#334155' }, { x: 0, y: 190, width: 100, height: 20, color: '#334155' }] },
    { startPos: { x: 50, y: 480 }, portal: { x: 700, y: 140 }, platforms: [{ x: 0, y: 550, width: 150, height: 50, color: '#1e293b' }, { x: 150, y: 450, width: 400, height: 20, color: '#334155' }, { x: 150, y: 550, width: 450, height: 50, color: '#1e293b' }, { x: 650, y: 450, width: 80, height: 20, color: '#334155' }, { x: 480, y: 350, width: 80, height: 20, color: '#334155' }, { x: 300, y: 250, width: 80, height: 20, color: '#334155' }, { x: 600, y: 200, width: 150, height: 20, color: '#1e293b' }] },
    { startPos: { x: 50, y: 500 }, portal: { x: 740, y: 240 }, platforms: [{ x: 0, y: 550, width: 100, height: 50, color: '#1e293b' }, { x: 180, y: 480, width: 40, height: 20, color: '#334155' }, { x: 330, y: 400, width: 40, height: 20, color: '#334155' }, { x: 480, y: 320, width: 40, height: 20, color: '#334155' }, { x: 670, y: 300, width: 130, height: 20, color: '#1e293b' }] },
    { startPos: { x: 700, y: 500 }, portal: { x: 700, y: 20 }, platforms: [{ x: 650, y: 550, width: 150, height: 50, color: '#1e293b' }, { x: 450, y: 480, width: 80, height: 20, color: '#334155' }, { x: 200, y: 410, width: 80, height: 20, color: '#334155' }, { x: 0, y: 340, width: 80, height: 20, color: '#334155' }, { x: 220, y: 250, width: 60, height: 20, color: '#334155' }, { x: 450, y: 160, width: 60, height: 20, color: '#334155' }, { x: 650, y: 80, width: 150, height: 20, color: '#1e293b' }] },
    { startPos: { x: 50, y: 450 }, portal: { x: 740, y: 440 }, platforms: [{ x: 0, y: 550, width: 150, height: 50, color: '#1e293b' }, { x: 300, y: 500, width: 80, height: 20, color: '#334155' }, { x: 500, y: 500, width: 80, height: 20, color: '#334155' }, { x: 700, y: 500, width: 100, height: 100, color: '#1e293b' }], lava: [{ x: 150, y: 570, width: 550, height: 30 }] },
    { startPos: { x: 50, y: 500 }, portal: { x: 700, y: 440 }, platforms: [{ x: 0, y: 550, width: 100, height: 50, color: '#1e293b' }, { x: 650, y: 500, width: 150, height: 100, color: '#1e293b' }], lava: [{ x: 100, y: 570, width: 550, height: 30 }], movingPlatforms: [{ startX: 200, startY: 550, width: 80, height: 20, color: '#334155', rangeX: 100, rangeY: 0, speed: 0.002, useCos: false }, { startX: 450, startY: 550, width: 80, height: 20, color: '#334155', rangeX: 100, rangeY: 0, speed: 0.002, offset: Math.PI }] },
    { startPos: { x: 50, y: 500 }, portal: { x: 380, y: 80 }, platforms: [{ x: 0, y: 550, width: 150, height: 50, color: '#1e293b' }, { x: 650, y: 550, width: 150, height: 50, color: '#1e293b' }, { x: 350, y: 140, width: 100, height: 20, color: '#1e293b' }], lava: [{ x: 150, y: 570, width: 500, height: 30 }], movingPlatforms: [{ startX: 200, startY: 400, width: 60, height: 20, color: '#334155', rangeX: 0, rangeY: 150, speed: 0.0015 }, { startX: 550, startY: 400, width: 60, height: 20, color: '#334155', rangeX: 0, rangeY: 150, speed: 0.0015, offset: Math.PI }, { startX: 370, startY: 350, width: 60, height: 20, color: '#334155', rangeX: 0, rangeY: 100, speed: 0.002 }] },
    { startPos: { x: 50, y: 500 }, portal: { x: 740, y: 80 }, platforms: [{ x: 0, y: 550, width: 80, height: 50, color: '#1e293b' }, { x: 360, y: 300, width: 80, height: 20, color: '#1e293b' }, { x: 700, y: 140, width: 100, height: 20, color: '#1e293b' }], lava: [{ x: 80, y: 570, width: 720, height: 30 }], movingPlatforms: [{ startX: 150, startY: 450, width: 60, height: 20, color: '#334155', rangeX: 0, rangeY: 100, speed: 0.002 }, { startX: 250, startY: 400, width: 60, height: 20, color: '#334155', rangeX: 80, rangeY: 0, speed: 0.0025, useCos: true }, { startX: 470, startY: 250, width: 60, height: 20, color: '#334155', rangeX: 0, rangeY: 120, speed: 0.002 }, { startX: 580, startY: 170, width: 50, height: 20, color: '#334155', rangeX: 60, rangeY: 0, speed: 0.003 }] },
    // L10: Micro Platforms
    { startPos: { x: 50, y: 500 }, portal: { x: 730, y: 340 }, platforms: [{ x: 0, y: 550, width: 80, height: 50, color: '#1e293b' }, { x: 180, y: 500, width: 20, height: 20, color: '#334155' }, { x: 360, y: 450, width: 20, height: 20, color: '#334155' }, { x: 540, y: 400, width: 20, height: 20, color: '#334155' }, { x: 720, y: 400, width: 60, height: 20, color: '#1e293b' }], lava: [{ x: 80, y: 570, width: 720, height: 30 }] },
    // L11: Lava Fall
    { startPos: { x: 50, y: 50 }, portal: { x: 700, y: 490 }, platforms: [{ x: 0, y: 100, width: 100, height: 20, color: '#1e293b' }, { x: 220, y: 200, width: 50, height: 20, color: '#334155' }, { x: 50, y: 350, width: 50, height: 20, color: '#334155' }, { x: 280, y: 480, width: 50, height: 20, color: '#334155' }, { x: 500, y: 300, width: 50, height: 20, color: '#334155' }, { x: 650, y: 550, width: 150, height: 50, color: '#1e293b' }, { x: 0, y: -50, width: 800, height: 50, color: '#1e293b' }], lava: [{ x: 0, y: 580, width: 650, height: 20 }, { x: 150, y: 0, width: 20, height: 60 }, { x: 400, y: 200, width: 30, height: 400 }] },
    // L12: Ferry of Doom
    { startPos: { x: 50, y: 500 }, portal: { x: 740, y: 340 }, platforms: [{ x: 0, y: 550, width: 80, height: 50, color: '#1e293b' }, { x: 720, y: 400, width: 80, height: 50, color: '#1e293b' }], lava: [{ x: 80, y: 570, width: 720, height: 30 }], movingPlatforms: [{ startX: 200, startY: 550, width: 30, height: 20, color: '#334155', rangeX: 120, rangeY: -50, speed: 0.003 }, { startX: 520, startY: 450, width: 30, height: 20, color: '#334155', rangeX: 150, rangeY: -50, speed: 0.003, offset: Math.PI }] },
    // L13: Hopscotch
    { startPos: { x: 20, y: 500 }, portal: { x: 760, y: 50 }, platforms: [{ x: 0, y: 550, width: 60, height: 50, color: '#1e293b' }, { x: 240, y: 450, width: 40, height: 20, color: '#334155' }, { x: 500, y: 350, width: 40, height: 20, color: '#334155' }, { x: 240, y: 250, width: 40, height: 20, color: '#334155' }, { x: 500, y: 150, width: 40, height: 20, color: '#334155' }, { x: 730, y: 110, width: 70, height: 20, color: '#1e293b' }], lava: [{ x: 60, y: 570, width: 740, height: 30 }] },
    // L14: Lava Rings
    { startPos: { x: 20, y: 500 }, portal: { x: 740, y: 440 }, platforms: [{ x: 0, y: 550, width: 60, height: 50, color: '#1e293b' }, { x: 740, y: 500, width: 60, height: 50, color: '#1e293b' }], lava: [{ x: 60, y: 570, width: 680, height: 30 }], movingPlatforms: [{ startX: 350, startY: 350, width: 40, height: 20, color: '#334155', rangeX: 150, rangeY: 150, speed: 0.002 }, { startX: 350, startY: 350, width: 40, height: 20, color: '#334155', rangeX: 150, rangeY: 150, speed: 0.002, offset: Math.PI }] },
    // L15: Key Intro
    { startPos: { x: 50, y: 500 }, portal: { x: 740, y: 490 }, platforms: [{ x: 0, y: 550, width: 200, height: 50, color: '#1e293b' }, { x: 300, y: 450, width: 200, height: 20, color: '#334155' }, { x: 600, y: 550, width: 200, height: 50, color: '#1e293b' }], lava: [{ x: 200, y: 570, width: 400, height: 30 }], levelKeys: [{ x: 390, y: 390 }] },
    // L16: Twin Paths
    { startPos: { x: 360, y: 500 }, portal: { x: 360, y: 140 }, platforms: [{ x: 320, y: 550, width: 120, height: 50, color: '#1e293b' }, { x: 50, y: 350, width: 100, height: 20, color: '#334155' }, { x: 650, y: 350, width: 100, height: 20, color: '#334155' }, { x: 340, y: 200, width: 100, height: 20, color: '#1e293b' }], lava: [{ x: 0, y: 580, width: 800, height: 20 }], movingPlatforms: [{ startX: 200, startY: 450, width: 40, height: 20, color: '#334155', rangeX: 0, rangeY: 80, speed: 0.002 }, { startX: 560, startY: 450, width: 40, height: 20, color: '#334155', rangeX: 0, rangeY: 80, speed: 0.002 }, { startX: 200, startY: 280, width: 40, height: 20, color: '#334155', rangeX: 80, rangeY: 0, speed: 0.002 }, { startX: 560, startY: 280, width: 40, height: 20, color: '#334155', rangeX: -80, rangeY: 0, speed: 0.002 }], levelKeys: [{ x: 80, y: 300 }, { x: 680, y: 300 }] },
    // L17: Heat Grasp
    { startPos: { x: 50, y: 500 }, portal: { x: 50, y: 140 }, platforms: [{ x: 0, y: 550, width: 120, height: 50, color: '#1e293b' }, { x: 0, y: 200, width: 150, height: 20, color: '#1e293b' }, { x: 400, y: 350, width: 80, height: 20, color: '#334155' }], lava: [{ x: 120, y: 570, width: 680, height: 30 }], movingPlatforms: [{ startX: 210, startY: 450, width: 40, height: 20, color: '#334155', rangeX: 0, rangeY: -200, speed: 0.002 }, { startX: 650, startY: 350, width: 60, height: 20, color: '#334155', rangeX: 0, rangeY: 200, speed: 0.0015 }], levelKeys: [{ x: 670, y: 510 }] },
    // L18: Elevator Keys
    { startPos: { x: 50, y: 500 }, portal: { x: 740, y: 490 }, platforms: [{ x: 0, y: 550, width: 100, height: 50, color: '#1e293b' }, { x: 700, y: 550, width: 100, height: 50, color: '#1e293b' }], lava: [{ x: 100, y: 570, width: 600, height: 30 }], movingPlatforms: [{ startX: 200, startY: 400, width: 40, height: 20, color: '#334155', rangeX: 0, rangeY: 150, speed: 0.002 }, { startX: 380, startY: 250, width: 40, height: 20, color: '#334155', rangeX: 0, rangeY: 150, speed: 0.0025, offset: Math.PI }, { startX: 560, startY: 400, width: 40, height: 20, color: '#334155', rangeX: 0, rangeY: 150, speed: 0.002 }], levelKeys: [{ x: 205, y: 200 }, { x: 385, y: 50 }, { x: 565, y: 200 }] },
    // L19: Ultimate Final Squeeze
    { startPos: { x: 50, y: 290 }, portal: { x: 50, y: 140 }, platforms: [{ x: 0, y: 350, width: 100, height: 20, color: '#1e293b' }, { x: 0, y: 200, width: 100, height: 20, color: '#1e293b' }, { x: 370, y: 450, width: 60, height: 20, color: '#334155' }], lava: [{ x: 0, y: 570, width: 800, height: 30 }], movingPlatforms: [{ startX: 220, startY: 250, width: 30, height: 20, color: '#334155', rangeX: 0, rangeY: 100, speed: 0.002 }, { startX: 550, startY: 250, width: 30, height: 20, color: '#334155', rangeX: 0, rangeY: 100, speed: 0.002, offset: Math.PI }, { startX: 385, startY: 150, width: 30, height: 20, color: '#334155', rangeX: 180, rangeY: 0, speed: 0.003 }], levelKeys: [{ x: 220, y: 100 }, { x: 550, y: 100 }, { x: 385, y: 400 }] },
    // L20: Headhitter Intro
    { startPos: { x: 50, y: 500 }, portal: { x: 700, y: 490 }, platforms: [{ x: 0, y: 550, width: 200, height: 50, color: '#1e293b' }, { x: 200, y: 400, width: 100, height: 50, color: '#1e293b' }, { x: 300, y: 550, width: 500, height: 50, color: '#1e293b' }], lava: [{ x: 200, y: 580, width: 100, height: 20 }] },
    { startPos: { x: 50, y: 500 }, portal: { x: 740, y: 200 }, platforms: [{ x: 0, y: 550, width: 100, height: 50, color: '#1e293b' }, { x: 350, y: 350, width: 50, height: 20, color: '#334155' }, { x: 700, y: 260, width: 100, height: 20, color: '#1e293b' }, { x: 100, y: 400, width: 250, height: 50, color: '#1e293b' }, { x: 400, y: 250, width: 300, height: 50, color: '#1e293b' }], lava: [{ x: 100, y: 580, width: 700, height: 20 }], movingPlatforms: [{ startX: 150, startY: 550, width: 60, height: 20, color: '#334155', rangeX: 150, rangeY: -150, speed: 0.002 }, { startX: 450, startY: 400, width: 60, height: 20, color: '#334155', rangeX: 150, rangeY: 0, speed: 0.002 }], levelKeys: [{ x: 375, y: 320 }] },
    { startPos: { x: 50, y: 500 }, portal: { x: 50, y: 80 }, platforms: [{ x: 0, y: 550, width: 100, height: 50, color: '#1e293b' }, { x: 350, y: 550, width: 100, height: 50, color: '#1e293b' }, { x: 700, y: 550, width: 100, height: 50, color: '#1e293b' }, { x: 700, y: 140, width: 100, height: 20, color: '#1e293b' }, { x: 0, y: 140, width: 100, height: 20, color: '#1e293b' }], lava: [{ x: 100, y: 580, width: 250, height: 20 }, { x: 450, y: 580, width: 250, height: 20 }, { x: 350, y: 530, width: 100, height: 20 }], movingPlatforms: [{ startX: 150, startY: 450, width: 50, height: 100, color: '#334155', rangeX: 0, rangeY: 80, speed: 0.003 }, { startX: 500, startY: 450, width: 50, height: 100, color: '#334155', rangeX: 0, rangeY: 80, speed: 0.003, offset: Math.PI }, { startX: 650, startY: 350, width: 40, height: 20, color: '#334155', rangeX: 0, rangeY: 150, speed: 0.002 }, { startX: 200, startY: 250, width: 60, height: 20, color: '#334155', rangeX: 350, rangeY: 0, speed: 0.002 }], levelKeys: [{ x: 740, y: 510 }, { x: 740, y: 100 }] },
    { startPos: { x: 20, y: 500 }, portal: { x: 740, y: 490 }, platforms: [{ x: 0, y: 550, width: 60, height: 50, color: '#1e293b' }, { x: 100, y: 450, width: 600, height: 40, color: '#1e293b' }, { x: 740, y: 550, width: 60, height: 50, color: '#1e293b' }], lava: [{ x: 60, y: 580, width: 680, height: 20 }, { x: 250, y: 490, width: 20, height: 30 }, { x: 450, y: 490, width: 20, height: 30 }], movingPlatforms: [{ startX: 100, startY: 550, width: 50, height: 20, color: '#334155', rangeX: 550, rangeY: 0, speed: 0.0025 }], levelKeys: [{ x: 375, y: 510 }] },
    { startPos: { x: 20, y: 500 }, portal: { x: 360, y: 300 }, platforms: [{ x: 0, y: 550, width: 60, height: 50, color: '#1e293b' }, { x: 120, y: 400, width: 80, height: 20, color: '#1e293b' }, { x: 350, y: 200, width: 100, height: 20, color: '#1e293b' }, { x: 740, y: 100, width: 60, height: 20, color: '#1e293b' }, { x: 740, y: 550, width: 60, height: 50, color: '#1e293b' }], lava: [{ x: 60, y: 580, width: 680, height: 20 }, { x: 400, y: 0, width: 20, height: 150 }], movingPlatforms: [{ startX: 80, startY: 550, width: 40, height: 20, color: '#334155', rangeX: 0, rangeY: -100, speed: 0.0025 }, { startX: 250, startY: 450, width: 40, height: 20, color: '#334155', rangeX: 80, rangeY: 0, speed: 0.003 }, { startX: 500, startY: 450, width: 40, height: 20, color: '#334155', rangeX: 80, rangeY: -150, speed: 0.002, useCos: true }, { startX: 700, startY: 300, width: 40, height: 20, color: '#334155', rangeX: 0, rangeY: -150, speed: 0.002 }], levelKeys: [{ x: 760, y: 70 }, { x: 760, y: 520 }, { x: 150, y: 370 }] },
    { startPos: {x:50,y:500}, portal: {x:700,y:490}, platforms: [{x:0,y:550,width:200,height:50,color:'#1e293b'},{x:250,y:480,width:60,height:20,color:'#334155'},{x:415,y:380,width:30,height:20,color:'#334155'},{x:530,y:480,width:60,height:20,color:'#334155'},{x:600,y:550,width:200,height:50,color:'#1e293b'}], movingLavaZones: [{startX:350,startY:550,width:60,height:60,rangeX:0,rangeY:-200,speed:0.003},{startX:450,startY:350,width:60,height:60,rangeX:0,rangeY:200,speed:0.003}] },
    { startPos: { x: 50, y: 500 }, portal: { x: 50, y: 80 }, platforms: [{ x: 0, y: 550, width: 150, height: 50, color: '#1e293b' }, { x: 250, y: 450, width: 100, height: 20, color: '#1e293b' }, { x: 500, y: 350, width: 100, height: 20, color: '#1e293b' }, { x: 250, y: 250, width: 100, height: 20, color: '#1e293b' }, { x: 0, y: 140, width: 100, height: 20, color: '#1e293b' }], movingLavaZones: [{ startX: 180, startY: 300, width: 120, height: 20, rangeX: 0, rangeY: 250, speed: 0.0015 }, { startX: 360, startY: 300, width: 120, height: 20, rangeX: 0, rangeY: 250, speed: 0.0015 }, { startX: 540, startY: 300, width: 120, height: 20, rangeX: 0, rangeY: 250, speed: 0.0015 }, { startX: 720, startY: 300, width: 80, height: 20, rangeX: 0, rangeY: 250, speed: 0.0015 }] },
    { startPos: { x: 50, y: 500 }, portal: { x: 740, y: 100 }, platforms: [{ x: 0, y: 550, width: 100, height: 50, color: '#1e293b' }, { x: 700, y: 160, width: 100, height: 20, color: '#1e293b' }], movingPlatforms: [{ startX: 150, startY: 500, width: 60, height: 20, color: '#334155', rangeX: 200, rangeY: -150, speed: 0.002 }, { startX: 450, startY: 350, width: 60, height: 20, color: '#334155', rangeX: 150, rangeY: -150, speed: 0.002 }], movingLavaZones: [{ startX: 300, startY: 100, width: 40, height: 40, rangeX: 0, rangeY: 400, speed: 0.004 }, { startX: 650, startY: 100, width: 40, height: 40, rangeX: 0, rangeY: 400, speed: 0.004 }] },
    { startPos: { x: 50, y: 500 }, portal: { x: 740, y: 500 }, platforms: [{ x: 0, y: 550, width: 100, height: 50, color: '#1e293b' }, { x: 700, y: 550, width: 100, height: 50, color: '#1e293b' }], movingLavaZones: [{ startX: 200, startY: 550, width: 40, height: 40, rangeX: 0, rangeY: -250, speed: 0.003 }, { startX: 350, startY: 300, width: 40, height: 40, rangeX: 0, rangeY: 250, speed: 0.003 }, { startX: 500, startY: 550, width: 40, height: 40, rangeX: 0, rangeY: -250, speed: 0.003 }], movingPlatforms: [{ startX: 100, startY: 450, width: 60, height: 20, color: '#334155', rangeX: 600, rangeY: 0, speed: 0.002 }], levelKeys: [{ x: 205, y: 300 }, { x: 355, y: 300 }, { x: 505, y: 300 }] }
];

function loadLevelData(data) {
    platforms = JSON.parse(JSON.stringify(data.platforms || []));
    lavaZones = JSON.parse(JSON.stringify(data.lava || []));
    movingPlatforms = JSON.parse(JSON.stringify(data.movingPlatforms || []));
    movingLavaZones = JSON.parse(JSON.stringify(data.movingLavaZones || []));
    levelKeys = JSON.parse(JSON.stringify(data.levelKeys || []));

    levelKeys.forEach(k => k.collected = false);

    movingPlatforms.forEach(mp => { mp.x = mp.startX; mp.y = mp.startY; mp.vx = 0; mp.vy = 0; });
    movingLavaZones.forEach(ml => { ml.x = ml.startX; ml.y = ml.startY; ml.vx = 0; ml.vy = 0; });

    player.x = data.startPos.x;
    player.y = data.startPos.y;
    player.vx = 0; player.vy = 0;
    player.grounded = false; player.coyoteTimer = 0;

    portal.x = data.portal.x;
    portal.y = data.portal.y;
    portal.width = 40; portal.height = 60;
    startTime = Date.now();
    lastTime = Date.now();
    gameStarted = true;
    gameWon = false;
}

function loadLevel(index) {
    if (index >= levels.length) {
        if (!gameWon) { gameWon = true; finalTime = Date.now() - startTime; }
        return;
    }
    currentLevelIndex = index;
    loadLevelData(levels[index]);
}

function update() {
    if (gameWon) return;

    if (!gameStarted && (keys.a || keys.d || keys.w || keys.ArrowUp || keys.ArrowLeft || keys.ArrowRight || keys.Space)) {
        gameStarted = true;
        startTime = Date.now();
    }

    const time = Date.now();
    const dt = time - lastTime;
    lastTime = time;

    movingPlatforms.forEach(mp => {
        const oldX = mp.x; const oldY = mp.y;
        if (mp.pathShape) {
            let progress = (time % (mp.lapTime * 1000)) / (mp.lapTime * 1000);
            let pt = getPathPoint(mp.pathBounds, mp.pathShape, progress, mp.pathReverse);
            mp.x = pt.x; mp.y = pt.y;
        } else {
            mp.x = mp.startX + (mp.useCos ? Math.cos(time * mp.speed + (mp.offset || 0)) : Math.sin(time * mp.speed + (mp.offset || 0))) * mp.rangeX;
            mp.y = mp.startY + (mp.useCos ? Math.sin(time * mp.speed + (mp.offset || 0)) : Math.cos(time * mp.speed + (mp.offset || 0))) * mp.rangeY;
        }
        mp.vx = mp.x - oldX; mp.vy = mp.y - oldY;
    });

    movingLavaZones.forEach(ml => {
        const oldX = ml.x; const oldY = ml.y;
        if (ml.pathShape) {
            let progress = (time % (ml.lapTime * 1000)) / (ml.lapTime * 1000);
            let pt = getPathPoint(ml.pathBounds, ml.pathShape, progress, ml.pathReverse);
            ml.x = pt.x; ml.y = pt.y;
        } else {
            ml.x = ml.startX + (ml.useCos ? Math.cos(time * ml.speed + (ml.offset || 0)) : Math.sin(time * ml.speed + (ml.offset || 0))) * ml.rangeX;
            ml.y = ml.startY + (ml.useCos ? Math.sin(time * ml.speed + (ml.offset || 0)) : Math.cos(time * ml.speed + (ml.offset || 0))) * ml.rangeY;
        }
        ml.vx = ml.x - oldX; ml.vy = ml.y - oldY;
    });

    if (keys.a || keys.ArrowLeft) player.vx -= 1.5;
    else if (keys.d || keys.ArrowRight) player.vx += 1.5;
    player.vx *= 0.8;

    if (player.vx > player.speed) player.vx = player.speed;
    if (player.vx < -player.speed) player.vx = -player.speed;

    if (player.grounded) player.coyoteTimer = player.coyoteTime;
    else player.coyoteTimer--;

    if ((keys.w || keys.ArrowUp || keys.Space) && player.coyoteTimer > 0) {
        player.vy = player.jumpStrength;
        player.coyoteTimer = 0;
        player.grounded = false;
        keys.w = false; keys.ArrowUp = false; keys.Space = false;
    }

    player.vy += player.gravity;
    player.x += player.vx;
    player.y += player.vy;
    player.grounded = false;

    if (player.x < 0) { player.x = 0; player.vx = 0; }
    else if (player.x + player.width > canvas.width) { player.x = canvas.width - player.width; player.vx = 0; }

    const allColliders = [...platforms, ...movingPlatforms];

    for (let platform of allColliders) {
        if (player.x < platform.x + platform.width && player.x + player.width > platform.x && player.y < platform.y + platform.height && player.y + player.height > platform.y) {
            let prevX = player.x - player.vx; let prevY = player.y - player.vy;
            let platVX = platform.vx || 0; let platVY = platform.vy || 0;

            let fromTop = prevY + player.height <= platform.y - platVY;
            let fromBottom = prevY >= platform.y + platform.height - platVY;
            let fromLeft = prevX + player.width <= platform.x - platVX;
            let fromRight = prevX >= platform.x + platform.width - platVX;

            if (fromTop) { player.y = platform.y - player.height; player.vy = 0; player.grounded = true; if (platVX !== 0) player.x += platVX; }
            else if (fromBottom) { player.y = platform.y + platform.height; player.vy = 0; }
            else if (fromLeft) { player.x = platform.x - player.width; player.vx = 0; }
            else if (fromRight) { player.x = platform.x + platform.width; player.vx = 0; }
            else {
                let overlapX = Math.min(player.x + player.width - platform.x, platform.x + platform.width - player.x);
                let overlapY = Math.min(player.y + player.height - platform.y, platform.y + platform.height - player.y);
                if (overlapX < overlapY) { player.x = player.x < platform.x ? platform.x - player.width : platform.x + platform.width; player.vx = 0; }
                else { if (player.y < platform.y) { player.y = platform.y - player.height; player.grounded = true; if (platVX !== 0) player.x += platVX; } else { player.y = platform.y + platform.height; } player.vy = 0; }
            }
        }
    }

    const allLava = [...lavaZones, ...movingLavaZones];
    for (let l of allLava) {
        let shrink = 3;
        if (player.x + player.width - shrink > l.x && player.x + shrink < l.x + l.width && player.y + player.height - shrink > l.y && player.y + shrink < l.y + l.height) {
            if (isCustomLevel) loadLevelData(customLevels[currentLevelIndex]);
            else loadLevel(currentLevelIndex);
            return;
        }
    }

    for (let k of levelKeys) {
        if (!k.collected) {
            let kw = 20, kh = 20;
            if (player.x < k.x + kw && player.x + player.width > k.x && player.y < k.y + kh && player.y + player.height > k.y) {
                k.collected = true;
            }
        }
    }

    if (player.x < portal.x + portal.width && player.x + player.width > portal.x && player.y < portal.y + portal.height && player.y + player.height > portal.y) {
        let locked = levelKeys.some(k => !k.collected);
        if (!locked) {
            if (isCustomLevel) {
                switchState('EDITOR_MENU');
            } else {
                if (currentLevelIndex + 1 > maxUnlockedLevel) {
                    maxUnlockedLevel = currentLevelIndex + 1;
                    localStorage.setItem('platformerMaxLevel', maxUnlockedLevel);
                }
                loadLevel(currentLevelIndex + 1);
            }
        }
    }

    if (player.y > canvas.height + 100) {
        if (isCustomLevel) loadLevelData(customLevels[currentLevelIndex]);
        else loadLevel(currentLevelIndex);
    }
}

function drawPlatform(platform) {
    ctx.fillStyle = platform.color;
    ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    ctx.fillStyle = 'rgba(99, 102, 241, 0.4)';
    ctx.fillRect(platform.x, platform.y, platform.width, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(platform.x, platform.y + platform.height - 5, platform.width, 5);
}

function drawLava(l) {
    ctx.shadowBlur = 15; ctx.shadowColor = '#dc2626'; ctx.fillStyle = '#ea580c';
    ctx.fillRect(l.x, l.y, l.width, l.height);
    ctx.shadowBlur = 0; ctx.fillStyle = '#fef08a';

    const time = Date.now() / 200;
    ctx.beginPath(); ctx.moveTo(l.x, l.y);
    for (let i = 0; i <= l.width; i += 10) {
        let wave = Math.sin(time + (i * 0.05)) * 4;
        ctx.lineTo(l.x + i, l.y + Math.max(0, wave));
    }
    ctx.lineTo(l.x + l.width, l.y + l.height); ctx.lineTo(l.x, l.y + l.height); ctx.fill();
}

function drawKeys(keysToDraw) {
    const time = Date.now() / 200;
    keysToDraw.forEach(k => {
        if (!k.collected) {
            let bob = Math.sin(time) * 5;
            ctx.shadowBlur = 15; ctx.shadowColor = '#facc15';
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(k.x, k.y + bob, 20, 20);
            ctx.fillStyle = '#ca8a04';
            ctx.fillRect(k.x + 5, k.y + 5 + bob, 10, 10);
            ctx.shadowBlur = 0;
        }
    });
}

function drawPortal(portalObj, keysArr) {
    let locked = keysArr && keysArr.some(k => !k.collected);
    const time = Date.now() / 200;
    const pulse = Math.abs(Math.sin(time)) * 8;

    if (locked) {
        ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(100, 116, 139, 0.8)';
        ctx.fillRect(portalObj.x, portalObj.y, portalObj.width, portalObj.height);
        ctx.fillStyle = '#cbd5e1'; ctx.fillRect(portalObj.x + 5, portalObj.y + 5, portalObj.width - 10, portalObj.height - 10);
        ctx.fillStyle = '#ef4444'; ctx.font = '700 12px Outfit'; ctx.textAlign = 'center';
        ctx.fillText('LOCKED', portalObj.x + portalObj.width / 2, portalObj.y - 12);
    } else {
        ctx.shadowBlur = 20 + pulse; ctx.shadowColor = '#d946ef';
        ctx.fillStyle = `rgba(217, 70, 239, 0.5)`;
        ctx.fillRect(portalObj.x - pulse / 2, portalObj.y - pulse / 2, portalObj.width + pulse, portalObj.height + pulse);
        ctx.fillStyle = '#fdf4ff'; ctx.shadowBlur = 0;
        ctx.fillRect(portalObj.x + 5, portalObj.y + 5, portalObj.width - 10, portalObj.height - 10);
        ctx.fillStyle = 'white'; ctx.font = '700 12px Outfit'; ctx.textAlign = 'center';
        ctx.fillText('NEXT', portalObj.x + portalObj.width / 2, portalObj.y - 12);
    }
}

function drawPlayer() {
    ctx.shadowBlur = 15; ctx.shadowColor = player.color; ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(player.x + 5, player.y + 5, player.width - 10, player.height - 10);
    ctx.fillStyle = 'white'; let eyeShift = player.vx > 1 ? 5 : player.vx < -1 ? -5 : 0;
    ctx.fillRect(player.x + player.width / 2 - 3 + eyeShift, player.y + 8, 6, 6);
}

function drawHUD() {
    if (!gameWon) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.font = 'bold 150px Outfit';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(isCustomLevel ? 'CUSTOM' : `${currentLevelIndex + 1}`, canvas.width / 2, canvas.height / 2);
    }
}

function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'; ctx.lineWidth = 1;
    let offsetX = (player.x * 0.1) % 40; let offsetY = (player.y * 0.1) % 40;
    if (gameState === 'EDITING') { offsetX = 0; offsetY = 0; }
    ctx.beginPath();
    for (let i = -40; i <= canvas.width + 40; i += 40) { ctx.moveTo(i - offsetX, 0); ctx.lineTo(i - offsetX, canvas.height); }
    for (let i = -40; i <= canvas.height + 40; i += 40) { ctx.moveTo(0, i - offsetY); ctx.lineTo(canvas.width, i - offsetY); }
    ctx.stroke();
}

function drawEditor() {
    drawGrid();
    editLevelData.platforms.forEach(p => drawPlatform(p));
    editLevelData.lava.forEach(l => drawLava(l));
    editLevelData.movingPlatforms.forEach(p => {
        drawPathDots(p); drawPlatform(p);
    });
    if (editLevelData.movingLavaZones) {
        editLevelData.movingLavaZones.forEach(ml => {
            drawPathDots(ml); drawLava(ml);
        });
    }
    drawKeys(editLevelData.levelKeys);
    drawPortal(editLevelData.portal, editLevelData.levelKeys);

    // Draw Start Pos
    ctx.fillStyle = '#00f7ff';
    ctx.fillRect(editLevelData.startPos.x, editLevelData.startPos.y, 30, 30);
    ctx.fillStyle = 'white'; ctx.font = '10px Outfit'; ctx.textAlign = 'center';
    ctx.fillText('START', editLevelData.startPos.x + 15, editLevelData.startPos.y - 5);

    if (isDragging) {
        let w = dragCurrentX - dragStartX; let h = dragCurrentY - dragStartY;
        if (editorTool === 'moving' || editorTool === 'movingLava') {
            let shape = document.getElementById('path-shape').value;
            let rev = document.getElementById('path-reverse').checked;
            ctx.strokeStyle = editorTool === 'movingLava' ? '#ea580c' : '#818cf8';
            ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
            ctx.strokeRect(Math.min(dragStartX, dragCurrentX), Math.min(dragStartY, dragCurrentY), Math.abs(w), Math.abs(h));
            ctx.setLineDash([]);

            const bounds = { x: dragStartX, y: dragStartY, w: w, h: h };
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            const pw = editorTool === 'moving' ? 60 : 40;
            const ph = editorTool === 'moving' ? 20 : 40;
            for (let i = 0; i < 1; i += 0.05) {
                let pt = getPathPoint(bounds, shape, i, rev);
                ctx.beginPath(); ctx.arc(pt.x + pw / 2, pt.y + ph / 2, 2, 0, Math.PI * 2); ctx.fill();
            }
        } else {
            let px = dragStartX; let py = dragStartY;
            if (w < 0) { px = dragCurrentX; w = -w; } if (h < 0) { py = dragCurrentY; h = -h; }
            if (w < 20) w = 20; if (h < 20) h = 20;

            ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
            ctx.strokeRect(px, py, w, h);
            ctx.setLineDash([]);
        }
    }
}

function gameLoop() {
    if (gameState === 'PLAYING') {
        if (!gameWon) {
            update(); drawGrid(); drawHUD();
            platforms.forEach(p => drawPlatform(p)); movingPlatforms.forEach(p => { drawPathDots(p); drawPlatform(p); }); lavaZones.forEach(l => drawLava(l)); movingLavaZones.forEach(l => { drawPathDots(l); drawLava(l); });
            drawKeys(levelKeys); drawPortal(portal, levelKeys); drawPlayer();
        } else {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#818cf8'; ctx.font = 'bold 64px Outfit'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('YOU WON THE CAMPAIGN!', canvas.width / 2, canvas.height / 2 - 50);
            ctx.fillStyle = 'white'; ctx.font = '32px Outfit';
            ctx.fillText(`Final Speedrun Time: ${formatTime(finalTime)}`, canvas.width / 2, canvas.height / 2 + 10);
        }
    } else if (gameState === 'EDITING') {
        drawEditor();
    } else if (gameState === 'PAUSED' || gameState === 'MENU' || gameState === 'LEVEL_SELECT' || gameState === 'EDITOR_MENU') {
        // Just draw a static background
        ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawGrid();
    }

    requestAnimationFrame(gameLoop);
}

// Initializing
switchState('MENU');
window.onload = () => { requestAnimationFrame(gameLoop); canvas.focus(); };
