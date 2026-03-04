import { ITEMS, GRID_W, GRID_H, checkMechanic, getEffectiveStats } from './gameData.js';

// ═══════════════════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════════════════
let budget = 10;
let playerGrid = Array.from({length: GRID_H}, () => Array(GRID_W).fill(null));
let placedItems = [];
let selectedItem = null;
let selectedShapeIdx = 0;
let hoverCells = [];
let placedIdCounter = 0;
let gridCells = [];
let lastHoverGx = -1, lastHoverGy = -1;
let gridBuilt = false;

// Multiplayer state
let socket = null;
let currentRoomId = null;
let playerName = '';
let gameStatus = 'login'; // login, lobby, shopping, waiting, battling, results
let isAIGame = false;
let currentRound = 1;
let aiScores = { player: 0, ai: 0, record: { w: 0, d: 0, l: 0 } };

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
function init() {
  budget = 10;
  playerGrid = Array.from({length: GRID_H}, () => Array(GRID_W).fill(null));
  placedItems = [];
  selectedItem = null;
  selectedShapeIdx = 0;
  hoverCells = [];
  placedIdCounter = 0;
  lastHoverGx = -1;
  lastHoverGy = -1;
  isAIGame = false;
  currentRound = 1;
  aiScores = { player: 0, ai: 0, record: { w: 0, d: 0, l: 0 } };
  
  // UI Reset
  document.getElementById('login-phase').style.display = 'flex';
  document.getElementById('lobby-phase').style.display = 'none';
  document.getElementById('shop-phase').style.display = 'none';
  document.getElementById('battle-phase').style.display = 'none';
  document.getElementById('leaderboard-overlay').classList.remove('show');
  document.getElementById('result-overlay').classList.remove('show');

  if (!gridBuilt) { buildGrid(); gridBuilt = true; }
  renderShop();
  renderGrid();
  renderRules();
  updateStats();
  
  if (!socket) {
    initMultiplayer();
  }
}

function showOverlay(title, subtitle) {
  const overlay = document.getElementById('result-overlay');
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-title').className = '';
  document.getElementById('result-subtitle').textContent = subtitle;
  document.getElementById('btn-rematch').style.display = 'none';
  overlay.classList.add('show');
}

function hideOverlay() {
  document.getElementById('result-overlay').classList.remove('show');
}

// ═══════════════════════════════════════════════════════
//  MULTIPLAYER LOGIC
// ═══════════════════════════════════════════════════════
function initMultiplayer() {
  if (socket) return; // Already initialized
  socket = io();

  socket.on('connect', () => {
    console.log('Connected to server');
  });

  socket.on('room_update', (data) => {
    currentRoomId = data.roomId;
    updateLobbyUI(data.players);
    if (data.state === 'LOBBY') {
      switchPhase('lobby');
      gameStatus = 'lobby';
    }
  });

  socket.on('round_start', (data) => {
    gameStatus = 'shopping';
    document.getElementById('round-display').textContent = `Round ${data.round} / ${data.maxRounds}`;
    hideOverlay();
    switchPhase('shopping');
    resetForNewRound();
  });

  socket.on('waiting_for_opponent', () => {
    gameStatus = 'waiting';
    showOverlay('Waiting...', 'Your rival is still packing their box.');
  });

  socket.on('battle_start', (data) => {
    gameStatus = 'battling';
    hideOverlay();
    switchPhase('battle');
    
    import('./battle.js').then(module => {
       module.startMultiplayerBattle(placedItems, playerGrid, data.enemyItems, data.enemyGrid, (result) => {
         socket.emit('report_battle_result', { roomId: currentRoomId, result });
       });
    });
  });

  socket.on('battle_bye', (data) => {
    showOverlay('Bye Round', data.message);
    // After a short delay, server will start next round or end tournament
  });

  socket.on('tournament_results', (data) => {
    gameStatus = 'results';
    showLeaderboard(data.leaderboard);
  });

  socket.on('error', (data) => {
    alert(data.message);
  });
}

function switchPhase(phase) {
  document.getElementById('login-phase').style.display = phase === 'login' ? 'flex' : 'none';
  document.getElementById('lobby-phase').style.display = phase === 'lobby' ? 'flex' : 'none';
  document.getElementById('shop-phase').style.display = phase === 'shopping' ? 'grid' : 'none';
  document.getElementById('battle-phase').style.display = phase === 'battle' ? 'block' : 'none';
}

function updateLobbyUI(players) {
  const list = document.getElementById('player-list');
  const roomDisplay = document.getElementById('lobby-room-display');
  const startBtn = document.getElementById('btn-start-game');
  
  roomDisplay.textContent = `Room: ${currentRoomId}`;
  list.innerHTML = '';
  
  let isAdmin = false;
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name + (p.isAdmin ? ' (Admin)' : '');
    list.appendChild(li);
    if (p.id === socket.id && p.isAdmin) isAdmin = true;
  });

  startBtn.style.display = isAdmin ? 'inline-block' : 'none';
  document.getElementById('lobby-status').textContent = players.length < 2 ? 'Waiting for more players...' : 'Ready to start!';
}

function resetForNewRound() {
  budget = 10;
  playerGrid = Array.from({length: GRID_H}, () => Array(GRID_W).fill(null));
  placedItems = [];
  selectedItem = null;
  selectedShapeIdx = 0;
  lastHoverGx = -1;
  lastHoverGy = -1;
  renderShop();
  renderGrid();
  renderRules();
  updateStats();
}

function showLeaderboard(data) {
  const overlay = document.getElementById('leaderboard-overlay');
  const body = document.getElementById('leaderboard-body');
  body.innerHTML = '';
  
  data.forEach((entry, idx) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${idx + 1}</td>
      <td>${entry.name}</td>
      <td>${entry.score}</td>
      <td>${entry.record}</td>
    `;
    body.appendChild(row);
  });
  
  overlay.classList.add('show');
}

// ── Global Functions ──
window.joinRoom = function() {
  const nameInput = document.getElementById('player-name-input');
  const roomInput = document.getElementById('room-id-input');
  playerName = nameInput.value.trim();
  const roomId = roomInput.value.trim();
  
  if (!playerName || !roomId) {
    alert('Please enter both name and Room ID');
    return;
  }
  
  socket.emit('join_room', { roomId, playerName });
  gameStatus = 'lobby';
};

window.startAIGame = function() {
  const nameInput = document.getElementById('player-name-input');
  playerName = nameInput.value.trim() || 'You';
  isAIGame = true;
  gameStatus = 'shopping';
  currentRound = 1;
  aiScores = { player: 0, ai: 0, record: { w: 0, d: 0, l: 0 } };
  
  document.getElementById('round-display').textContent = `Round 1 / 5`;
  switchPhase('shopping');
  resetForNewRound();
};

window.requestStartGame = function() {
  socket.emit('request_start_game');
};

window.backToLobby = function() {
  document.getElementById('leaderboard-overlay').classList.remove('show');
  if (isAIGame) {
    switchPhase('login');
  } else {
    switchPhase('lobby');
  }
};

window.backToStartMenu = function() {
  if (confirm('Are you sure you want to leave the current game?')) {
    if (socket && socket.connected) {
      socket.disconnect();
      socket = null; // Forces re-init on next login
    }
    init();
  }
};

// ═══════════════════════════════════════════════════════
//  AI LOGIC
// ═══════════════════════════════════════════════════════
function generateAIGrid() {
  const aiGrid = Array.from({length: GRID_H}, () => Array(GRID_W).fill(null));
  const aiPlacedItems = [];
  let aiBudget = 10;
  let attempts = 0;
  
  // Simple AI: try to place random items until budget is low or too many attempts
  while (aiBudget > 0 && attempts < 50) {
    attempts++;
    const randomItem = ITEMS[Math.floor(Math.random() * ITEMS.length)];
    if (randomItem.price > aiBudget) continue;
    
    const shapeIdx = Math.floor(Math.random() * randomItem.shapes.length);
    const shape = randomItem.shapes[shapeIdx];
    
    // Try random positions
    const rx = Math.floor(Math.random() * GRID_W);
    const ry = Math.floor(Math.random() * GRID_H);
    
    const cells = shape.map(([dx, dy]) => ({ x: rx + dx, y: ry + dy }));
    const valid = cells.every(c => 
      c.x >= 0 && c.x < GRID_W && c.y >= 0 && c.y < GRID_H && !aiGrid[c.y][c.x]
    );
    
    if (valid) {
      const placed = { item: randomItem, cells, shapeIdx, placedId: aiPlacedItems.length + 1 };
      aiPlacedItems.push(placed);
      cells.forEach(c => { aiGrid[c.y][c.x] = placed; });
      aiBudget -= randomItem.price;
    }
  }
  
  return { items: aiPlacedItems, grid: aiGrid };
}

function handleAIResult(result) {
  if (result === 'win') {
    aiScores.player += 3;
    aiScores.record.w++;
  } else if (result === 'draw') {
    aiScores.player += 2;
    aiScores.ai += 2;
    aiScores.record.d++;
  } else {
    aiScores.ai += 3;
    aiScores.record.l++;
  }
  
  setTimeout(() => {
    if (currentRound >= 5) {
      const leaderboard = [
        { name: playerName, score: aiScores.player, record: `${aiScores.record.w}-${aiScores.record.d}-${aiScores.record.l}` },
        { name: 'AI Rival', score: aiScores.ai, record: `${aiScores.record.l}-${aiScores.record.d}-${aiScores.record.w}` }
      ].sort((a, b) => b.score - a.score);
      showLeaderboard(leaderboard);
    } else {
      currentRound++;
      document.getElementById('round-display').textContent = `Round ${currentRound} / 5`;
      hideOverlay();
      switchPhase('shopping');
      resetForNewRound();
    }
  }, 3000);
}

// ═══════════════════════════════════════════════════════
//  SHOP RENDERING
// ═══════════════════════════════════════════════════════
function renderShop() {
  const container = document.getElementById('shop-list');
  container.innerHTML = '';
  ITEMS.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';
    if (item.price > budget) card.classList.add('disabled');
    if (selectedItem && selectedItem.id === item.id) card.classList.add('selected');

    const shape = selectedItem && selectedItem.id === item.id
      ? item.shapes[selectedShapeIdx]
      : item.shapes[0];
    const maxX = Math.max(...shape.map(c=>c[0])) + 1;
    const maxY = Math.max(...shape.map(c=>c[1])) + 1;
    const previewSize = Math.max(maxX, maxY);
    const preview = document.createElement('div');
    preview.className = 'item-shape-preview';
    preview.style.gridTemplateColumns = `repeat(${previewSize}, 1fr)`;
    preview.style.gridTemplateRows = `repeat(${previewSize}, 1fr)`;
    for (let py = 0; py < previewSize; py++) {
      for (let px = 0; px < previewSize; px++) {
        const c = document.createElement('div');
        c.className = 'cell';
        if (shape.some(s => s[0]===px && s[1]===py)) {
          c.classList.add(item.colorClass);
        } else {
          c.style.background = 'transparent';
        }
        preview.appendChild(c);
      }
    }
    card.appendChild(preview);

    const info = document.createElement('div');
    info.className = 'item-info';
    info.innerHTML = `
      <div class="name">${item.emoji} ${item.name}</div>
      <div class="stats">
        <span style="color:#4ecca3">HP:${item.hp}</span>
        <span style="color:#e94560">ATK:${item.atk}</span>
        <span>${shape.length} cells</span>
      </div>
      ${item.desc ? `<div class="bonus">${item.desc}</div>` : ''}
    `;
    card.appendChild(info);

    const price = document.createElement('div');
    price.className = 'item-price';
    price.textContent = `$${item.price}`;
    card.appendChild(price);

    card.addEventListener('click', () => selectItem(item));
    container.appendChild(card);
  });
  document.getElementById('budget-display').textContent = `$${budget}`;
}

function selectItem(item) {
  if (item.price > budget) return;
  if (selectedItem && selectedItem.id === item.id) {
    selectedItem = null;
    selectedShapeIdx = 0;
  } else {
    selectedItem = item;
    selectedShapeIdx = 0;
  }
  renderShop();
}

// ═══════════════════════════════════════════════════════
//  RULES PANEL
// ═══════════════════════════════════════════════════════
function renderRules() {
  const container = document.getElementById('rules-list');
  container.innerHTML = '';
  import('./gameData.js').then(({ BONUS_RULES }) => {
    BONUS_RULES.forEach(rule => {
      const pi = placedItems.find(p => p.item.id === rule.itemId);
      const placed = !!pi;
      let isActive = false;
      let currentEffect = rule.effect;
      let currentColor = rule.color;
      
      if (placed) {
        const m = checkMechanic(pi, placedItems, playerGrid);
        isActive = m.active;
        if (m.text && m.text !== rule.label) {
          if (rule.badEffect && m.text === rule.badLabel) {
            currentEffect = rule.badEffect;
            currentColor = rule.badColor;
          } else if (m.text === rule.label) {
            currentEffect = rule.effect;
            currentColor = rule.color;
          } else {
            currentEffect = m.text;
            currentColor = m.active && m.text ? rule.color : '#888';
          }
        } else if (m.text === rule.label) {
          currentEffect = rule.effect;
          currentColor = rule.color;
        }
      }
      
      const row = document.createElement('div');
      row.className = 'rule-row';
      row.innerHTML = `
        <div class="rule-indicator ${isActive && placed ? 'active' : ''}" style="border-color: ${currentColor}"></div>
        <span style="font-size:20px">${rule.emoji}</span>
        <span class="rule-text ${isActive && placed ? 'active' : ''}">${rule.name}: ${rule.desc} &rarr; <strong style="color:${currentColor}">${currentEffect}</strong>
        ${placed ? (isActive ? ' <span style="color:#4ecca3">✓</span>' : '') : ''}
        </span>
      `;
      container.appendChild(row);
    });
  });
}

// ═══════════════════════════════════════════════════════
//  GRID — stable DOM
// ═══════════════════════════════════════════════════════
function buildGrid() {
  const grid = document.getElementById('player-grid');
  grid.innerHTML = '';
  gridCells = [];
  for (let gy = GRID_H - 1; gy >= 0; gy--) {
    if (!gridCells[gy]) gridCells[gy] = [];
    for (let gx = 0; gx < GRID_W; gx++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.x = gx;
      cell.dataset.y = gy;
      gridCells[gy][gx] = cell;
      grid.appendChild(cell);
    }
  }
  grid.addEventListener('mouseover', (e) => {
    const t = e.target.closest('.cell[data-x]');
    if (!t) return;
    const gx = parseInt(t.dataset.x), gy = parseInt(t.dataset.y);
    if (gx === lastHoverGx && gy === lastHoverGy) return;
    lastHoverGx = gx; lastHoverGy = gy;
    updateHoverPreview(gx, gy);
  });
  grid.addEventListener('mouseleave', () => {
    lastHoverGx = -1; lastHoverGy = -1;
    clearHoverPreview();
  });
  grid.addEventListener('click', (e) => {
    const t = e.target.closest('.cell[data-x]');
    if (!t) return;
    onCellClick(parseInt(t.dataset.x), parseInt(t.dataset.y));
  });
  grid.addEventListener('contextmenu', (e) => {
    const t = e.target.closest('.cell[data-x]');
    if (!t) return;
    const gx = parseInt(t.dataset.x), gy = parseInt(t.dataset.y);
    const occupant = playerGrid[gy][gx];
    if (occupant) { e.preventDefault(); removeItem(occupant.placedId); }
  });
}

function renderGrid() {
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const cell = gridCells[gy][gx];
      const occupant = playerGrid[gy][gx];
      cell.className = 'cell';
      cell.innerHTML = '';
      cell.title = '';
      if (occupant) {
        cell.classList.add('occupied', occupant.item.colorClass);
        cell.title = `${occupant.item.emoji} ${occupant.item.name}`;
        cell.textContent = occupant.item.emoji;
        // Check if this item has active mechanic
        const m = checkMechanic(occupant, placedItems, playerGrid);
        if (m.active && m.text && m.text !== occupant.item.mechanic?.badLabel) {
          cell.classList.add('bonus-glow');
        }
      }
    }
  }
  renderPlacedItemsList();
}

function renderPlacedItemsList() {
  const listEl = document.getElementById('placed-items-list');
  listEl.innerHTML = '';
  placedItems.forEach(pi => {
    const m = checkMechanic(pi, placedItems, playerGrid);
    const bonusText = m.text;
    const tag = document.createElement('span');
    tag.className = 'placed-item-tag';
    if (bonusText) tag.classList.add('has-bonus');
    const es = getEffectiveStats(pi, placedItems, playerGrid);
    const shieldStr = es.shield > 0 ? ` <span style="color:#5dade2;font-size:12px">🛡${es.shield}</span>` : '';
    tag.innerHTML = `${pi.item.emoji} ${pi.item.name} <span style="color:#4ecca3;font-size:12px">HP:${es.hp}</span> <span style="color:#e94560;font-size:12px">ATK:${es.atk}</span>${shieldStr} ${bonusText ? `<span style="color:#f0c040;font-size:12px">${bonusText}</span>` : ''} <span class="x">x</span>`;
    tag.addEventListener('click', () => removeItem(pi.placedId));
    listEl.appendChild(tag);
  });
}

// ── Hover preview ──
function clearHoverPreview() {
  for (let gy = 0; gy < GRID_H; gy++)
    for (let gx = 0; gx < GRID_W; gx++)
      gridCells[gy][gx].classList.remove('preview-valid', 'preview-invalid');
  hoverCells = [];
}

function updateHoverPreview(gx, gy) {
  clearHoverPreview();
  if (!selectedItem) return;
  const shape = selectedItem.shapes[selectedShapeIdx];
  hoverCells = shape.map(([dx, dy]) => ({ x: gx + dx, y: gy + dy }));
  const allValid = hoverCells.every(h =>
    h.x >= 0 && h.x < GRID_W && h.y >= 0 && h.y < GRID_H && !playerGrid[h.y][h.x]
  );
  const cls = allValid ? 'preview-valid' : 'preview-invalid';
  hoverCells.forEach(h => {
    if (h.x >= 0 && h.x < GRID_W && h.y >= 0 && h.y < GRID_H && !playerGrid[h.y][h.x])
      gridCells[h.y][h.x].classList.add(cls);
  });
}

function onCellClick(gx, gy) {
  if (!selectedItem) return;
  const shape = selectedItem.shapes[selectedShapeIdx];
  const cells = shape.map(([dx, dy]) => ({ x: gx + dx, y: gy + dy }));
  const valid = cells.every(c =>
    c.x >= 0 && c.x < GRID_W && c.y >= 0 && c.y < GRID_H && !playerGrid[c.y][c.x]
  );
  if (!valid || selectedItem.price > budget) return;
  const placedId = ++placedIdCounter;
  const placed = { item: selectedItem, cells, shapeIdx: selectedShapeIdx, placedId };
  placedItems.push(placed);
  cells.forEach(c => { playerGrid[c.y][c.x] = placed; });
  budget -= selectedItem.price;
  selectedItem = null;
  selectedShapeIdx = 0;
  clearHoverPreview();
  renderShop();
  renderGrid();
  renderRules();
  updateStats();
}

function removeItem(placedId) {
  const idx = placedItems.findIndex(p => p.placedId === placedId);
  if (idx === -1) return;
  const pi = placedItems[idx];
  pi.cells.forEach(c => { playerGrid[c.y][c.x] = null; });
  budget += pi.item.price;
  placedItems.splice(idx, 1);
  renderShop();
  renderGrid();
  renderRules();
  updateStats();
}

// Ensure functions are available globally if referenced by HTML onclick
window.clearAllItems = function() {
  placedItems.forEach(pi => {
    pi.cells.forEach(c => { playerGrid[c.y][c.x] = null; });
    budget += pi.item.price;
  });
  placedItems = [];
  selectedItem = null;
  renderShop();
  renderGrid();
  renderRules();
  updateStats();
};

window.startBattle = function() {
  if (placedItems.length === 0) return;
  
  if (isAIGame) {
    const aiData = generateAIGrid();
    gameStatus = 'battling';
    switchPhase('battle');
    import('./battle.js').then(module => {
      module.startMultiplayerBattle(placedItems, playerGrid, aiData.items, aiData.grid, (result) => {
        handleAIResult(result);
      });
    });
    return;
  }
  
  if (socket && gameStatus === 'shopping') {
    socket.emit('submit_grid', {
      roomId: currentRoomId,
      items: placedItems,
      grid: playerGrid
    });
  }
};

window.restartGame = function() {
  init();
};

// ── Rotation ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    if (!selectedItem) return;
    selectedShapeIdx = (selectedShapeIdx + 1) % selectedItem.shapes.length;
    renderShop();
    if (lastHoverGx >= 0 && lastHoverGy >= 0)
      updateHoverPreview(lastHoverGx, lastHoverGy);
  }
});

// ═══════════════════════════════════════════════════════
//  STATS
// ═══════════════════════════════════════════════════════
function updateStats() {
  let totalHp = 0, totalAtk = 0, totalShield = 0, cellsUsed = 0;
  placedItems.forEach(pi => {
    const s = getEffectiveStats(pi, placedItems, playerGrid);
    totalHp += s.hp;
    totalAtk += s.atk;
    totalShield += s.shield || 0;
    cellsUsed += pi.cells.length;
  });
  document.getElementById('stat-hp').textContent = totalHp + (totalShield > 0 ? `+${totalShield}🛡` : '');
  document.getElementById('stat-atk').textContent = totalAtk;
  document.getElementById('stat-items').textContent = placedItems.length;
  document.getElementById('stat-grid').textContent = `${cellsUsed}/25`;
}

// ═══════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════
init();
