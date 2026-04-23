import { ITEMS, GRID_W, GRID_H, checkMechanic, getEffectiveStats } from './gameData.js';

// ═══════════════════════════════════════════════════════
//  BATTLE — with 2D animation (Multiplayer Version)
// ═══════════════════════════════════════════════════════
export function startMultiplayerBattle(
  placedItems,
  playerGrid,
  enemyItems,
  enemyGrid,
  onComplete,
  playerDisplayName = 'You',
  enemyDisplayName = 'Rival'
) {
  const playerName = (playerDisplayName || 'You').trim();
  const enemyName = (enemyDisplayName || 'Rival').trim();

  renderBattleGrid('battle-grid-player', playerGrid);
  renderBattleGrid('battle-grid-enemy', enemyGrid);

  const playerUnits = placedItems.map((pi, idx) => {
    const s = getEffectiveStats(pi, placedItems, playerGrid);
    const m = checkMechanic(pi, placedItems, playerGrid);
    return {
      id: `p-${idx}`, name: pi.item.name, emoji: pi.item.emoji, colorClass: pi.item.colorClass,
      itemId: pi.item.id,
      hp: s.hp, maxHp: s.hp, atk: s.atk, shield: s.shield, bonus: m.text,
      weakTo: s.weakTo || null,
      onKillHeal: s.onKillHeal || 0
    };
  });

  const enemyUnits = enemyItems.map((pi, idx) => {
    const s = getEffectiveStats(pi, enemyItems, enemyGrid);
    const m = checkMechanic(pi, enemyItems, enemyGrid);
    return {
      id: `e-${idx}`, name: pi.item.name, emoji: pi.item.emoji, colorClass: pi.item.colorClass,
      itemId: pi.item.id,
      hp: s.hp, maxHp: s.hp, atk: s.atk, shield: s.shield, bonus: m.text,
      weakTo: s.weakTo || null,
      onKillHeal: s.onKillHeal || 0
    };
  });

  renderTeamList('team-list-player', playerUnits);
  renderTeamList('team-list-enemy', enemyUnits);

  const playerHeader = document.querySelector('#team-list-player h4');
  if (playerHeader) playerHeader.textContent = playerName;

  const enemyHeader = document.querySelector('#team-list-enemy h4');
  if (enemyHeader) enemyHeader.textContent = enemyName;

  const playerBoxLabel = document.querySelector('.player-label');
  if (playerBoxLabel) playerBoxLabel.textContent = `${playerName} BOX`;

  const enemyBoxLabel = document.querySelector('.enemy-label');
  if (enemyBoxLabel) enemyBoxLabel.textContent = `${enemyName} BOX`;

  const pTotalAtk = playerUnits.reduce((s,u)=>s+u.atk, 0);
  const eTotalAtk = enemyUnits.reduce((s,u)=>s+u.atk, 0);
  
  document.getElementById('battle-atk-player').textContent = pTotalAtk;
  document.getElementById('battle-atk-enemy').textContent = eTotalAtk;

  runAnimatedBattle(playerUnits, enemyUnits, onComplete, playerName, enemyName);
}

function renderTeamList(containerId, units) {
  const container = document.querySelector(`#${containerId} .unit-list-container`);
  container.innerHTML = '';
  units.forEach((u, idx) => {
    const el = document.createElement('div');
    el.className = 'unit-list-item';
    el.dataset.id = u.id;
    const art = getBattleItemArt(u);
    el.innerHTML = `
      <span class="order-num">${idx + 1}</span>
      <span class="emoji">${art ? `<img src="${art}" alt="${u.name}" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;">` : u.emoji}</span>
      <span class="name">${u.name}</span>
    `;
    container.appendChild(el);
  });
}

function updateTeamListUI(playerUnits, enemyUnits) {
  playerUnits.forEach((u, idx) => {
    const el = document.querySelector(`[data-id="${u.id}"]`);
    if (!el) return;
    if (u.hp <= 0) {
      el.classList.add('defeated');
      el.querySelector('.order-num').textContent = '✕';
    } else {
      el.classList.remove('defeated');
    }
  });
  enemyUnits.forEach((u, idx) => {
    const el = document.querySelector(`[data-id="${u.id}"]`);
    if (!el) return;
    if (u.hp <= 0) {
      el.classList.add('defeated');
      el.querySelector('.order-num').textContent = '✕';
    } else {
      el.classList.remove('defeated');
    }
  });

  document.querySelectorAll('.unit-list-item').forEach(el => el.classList.remove('active'));
  const pa = playerUnits.find(u => u.hp > 0);
  const ea = enemyUnits.find(u => u.hp > 0);
  if (pa) document.querySelector(`[data-id="${pa.id}"]`)?.classList.add('active');
  if (ea) document.querySelector(`[data-id="${ea.id}"]`)?.classList.add('active');
}

function renderBattleGrid(containerId, grid) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  for (let gy = GRID_H - 1; gy >= 0; gy--) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const occupant = grid[gy][gx];
      if (occupant) {
        cell.classList.add('occupied', occupant.item.colorClass);
        const art = occupant.item.avatarImage || occupant.item.image;
        cell.innerHTML = art
          ? `<img src="${art}" alt="${occupant.item.name}" style="width:100%;height:100%;object-fit:contain;">`
          : occupant.item.emoji;
      }
      container.appendChild(cell);
    }
  }
}

// ── Animated battle ──
function createSprite(unit, side) {
  const el = document.createElement('div');
  el.className = `battle-sprite ${side}-sprite`;
  const art = getBattleItemArt(unit);
  el.innerHTML = `
    <div class="sprite-emoji">${art ? `<img src="${art}" alt="${unit.name}" style="width:100%;height:100%;object-fit:contain;">` : unit.emoji}</div>
    <div class="sprite-name">${unit.name}</div>
    <div class="hp-bar-bg"><div class="hp-bar" style="width:100%"></div></div>
  `;
  return el;
}

function getBattleItemArt(unit) {
  const item = ITEMS.find(candidate => candidate.id === unit.itemId);
  return item?.avatarImage || item?.image || null;
}

function updateSpriteHp(spriteEl, unit) {
  const hpPct = Math.max(0, unit.hp / unit.maxHp * 100);
  const bar = spriteEl.querySelector('.hp-bar');
  bar.style.width = hpPct + '%';
  bar.className = 'hp-bar' + (hpPct > 50 ? '' : hpPct > 25 ? ' mid' : ' low');
}

function showDmgNumber(stage, x, y, dmg, isPlayer) {
  const el = document.createElement('div');
  el.className = 'dmg-number' + (isPlayer ? '' : ' player-dmg');
  el.textContent = `-${dmg}`;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  stage.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function showHealNumber(stage, x, y, heal) {
  const el = document.createElement('div');
  el.className = 'dmg-number player-dmg';
  el.textContent = `+${heal}`;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.color = '#7fff7f';
  el.style.textShadow = '0 0 10px rgba(127,255,127,0.8)';
  stage.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function runAnimatedBattle(playerUnits, enemyUnits, onComplete, playerName, enemyName) {
  const stage = document.getElementById('battle-stage');
  const log = document.getElementById('battle-log');
  log.innerHTML = '';

  // Clear old sprites
  stage.querySelectorAll('.battle-sprite, .dmg-number').forEach(e => e.remove());

  // Log bonuses
  playerUnits.forEach(u => {
    if (u.bonus) addLog(log, 'bonus-line', `  ${u.emoji} ${u.name} gains ${u.bonus}`);
  });
  enemyUnits.forEach(u => {
    if (u.bonus) addLog(log, 'bonus-line', `  ${enemyName}'s ${u.emoji} ${u.name} gains ${u.bonus}`);
  });

  const pAlive = () => playerUnits.filter(u => u.hp > 0);
  const eAlive = () => enemyUnits.filter(u => u.hp > 0);

  let pSprite = null, eSprite = null;
  let roundNum = 0;

  function spawnSprites() {
    const pa = pAlive(), ea = eAlive();
    
    updateWaitingList(pa.length, ea.length);

    if (pa.length === 0 || ea.length === 0) return;
    
    if (pSprite) pSprite.remove();
    if (eSprite) eSprite.remove();
    
    pSprite = createSprite(pa[0], 'player');
    eSprite = createSprite(ea[0], 'enemy');
    stage.appendChild(pSprite);
    stage.appendChild(eSprite);

    // Keep HP bars in sync for units that survive into the next round.
    updateSpriteHp(pSprite, pa[0]);
    updateSpriteHp(eSprite, ea[0]);

    updateTeamListUI(playerUnits, enemyUnits);
  }

  function updateWaitingList(pCount, eCount) {
    document.getElementById('battle-atk-player').parentElement.querySelector('.label').textContent = `${playerName} ATK`;
    document.getElementById('battle-atk-enemy').parentElement.querySelector('.label').textContent = `${enemyName} ATK`;
  }

  spawnSprites();

  function doRound() {
    roundNum++;
    const pa = pAlive(), ea = eAlive();
    if (pa.length === 0 || ea.length === 0) {
      endBattle(pa.length, ea.length, onComplete);
      return;
    }

    addLog(log, 'round-header', `--- Round ${roundNum} ---`);
    const pUnit = pa[0], eUnit = ea[0];

    // Base damage
    let dmgToEnemy = Math.max(1, pUnit.atk);
    let dmgToPlayer = Math.max(1, eUnit.atk);

    // Pan type-weakness: takes 3x damage from shoes/jeans
    if (pUnit.weakTo && pUnit.weakTo.includes(eUnit.itemId)) {
      dmgToPlayer *= 3;
      addLog(log, 'bonus-line', `  ${pUnit.emoji} ${pUnit.name} is WEAK to ${eUnit.emoji} ${eUnit.name}! (3x damage)`);
    }
    if (eUnit.weakTo && eUnit.weakTo.includes(pUnit.itemId)) {
      dmgToEnemy *= 3;
      addLog(log, 'bonus-line', `  ${eUnit.emoji} ${eUnit.name} is WEAK to ${pUnit.emoji} ${pUnit.name}! (3x damage)`);
    }

    // Phase 1: both charge forward (attack animation)
    pSprite.classList.add('sprite-attacking-right');
    eSprite.classList.add('sprite-attacking-left');

    setTimeout(() => {
      // Phase 2: impact — apply damage, show numbers, shake
      eUnit.hp -= dmgToEnemy;
      pUnit.hp -= dmgToPlayer;

      // Damage numbers
      const pRect = pSprite.getBoundingClientRect();
      const eRect = eSprite.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      showDmgNumber(stage, eRect.left - stageRect.left + 30, eRect.top - stageRect.top - 10, dmgToEnemy, false);
      showDmgNumber(stage, pRect.left - stageRect.left + 30, pRect.top - stageRect.top - 10, dmgToPlayer, true);

      // Flash and shake
      pSprite.classList.add('sprite-hit', 'sprite-flash');
      eSprite.classList.add('sprite-hit', 'sprite-flash');

      updateSpriteHp(pSprite, pUnit);
      updateSpriteHp(eSprite, eUnit);
      updateTeamListUI(playerUnits, enemyUnits);

      addLog(log, 'hit-line', `  ${pUnit.emoji} ${pUnit.name} hits ${eUnit.emoji} ${eUnit.name} for ${dmgToEnemy} dmg [${Math.max(0,eUnit.hp)}/${eUnit.maxHp}]`);
      addLog(log, 'hit-line', `  ${eUnit.emoji} ${eUnit.name} hits ${pUnit.emoji} ${pUnit.name} for ${dmgToPlayer} dmg [${Math.max(0,pUnit.hp)}/${pUnit.maxHp}]`);

      // Update totals
      document.getElementById('battle-atk-player').textContent = Math.max(0, pAlive().reduce((s,u)=>s+u.atk,0));
      document.getElementById('battle-atk-enemy').textContent = Math.max(0, eAlive().reduce((s,u)=>s+u.atk,0));
      log.scrollTop = log.scrollHeight;
    }, 300);

    setTimeout(() => {
      // Phase 3: clean up animations
      pSprite.classList.remove('sprite-attacking-right', 'sprite-hit', 'sprite-flash');
      eSprite.classList.remove('sprite-attacking-left', 'sprite-hit', 'sprite-flash');

      let deathDelay = 0;

      // Check deaths and apply on-kill-heal
      if (eUnit.hp <= 0) {
        addLog(log, 'kill-line', `  ${eUnit.emoji} ${eUnit.name} (Rival) DESTROYED!`);
        eSprite.classList.add('sprite-dying');
        deathDelay = 600;

        // Pill Box on-kill-heal for player unit
        if (pUnit.hp > 0 && pUnit.onKillHeal > 0) {
          const healAmt = Math.floor(pUnit.maxHp * pUnit.onKillHeal);
          pUnit.hp = Math.min(pUnit.maxHp, pUnit.hp + healAmt);
          addLog(log, 'bonus-line', `  ${pUnit.emoji} ${pUnit.name} heals ${healAmt} HP! (On-kill heal)`);
          updateSpriteHp(pSprite, pUnit);
          // Show heal number
          const pRect = pSprite.getBoundingClientRect();
          const stageRect = stage.getBoundingClientRect();
          showHealNumber(stage, pRect.left - stageRect.left + 30, pRect.top - stageRect.top - 30, healAmt);
        }
      }
      if (pUnit.hp <= 0) {
        addLog(log, 'kill-line', `  ${pUnit.emoji} ${pUnit.name} (Yours) DESTROYED!`);
        pSprite.classList.add('sprite-dying');
        deathDelay = 600;

        // Pill Box on-kill-heal for enemy unit
        if (eUnit.hp > 0 && eUnit.onKillHeal > 0) {
          const healAmt = Math.floor(eUnit.maxHp * eUnit.onKillHeal);
          eUnit.hp = Math.min(eUnit.maxHp, eUnit.hp + healAmt);
          addLog(log, 'bonus-line', `  ${eUnit.emoji} ${eUnit.name} heals ${healAmt} HP! (On-kill heal)`);
          updateSpriteHp(eSprite, eUnit);
          const eRect = eSprite.getBoundingClientRect();
          const stageRect = stage.getBoundingClientRect();
          showHealNumber(stage, eRect.left - stageRect.left + 30, eRect.top - stageRect.top - 30, healAmt);
        }
      }

      setTimeout(() => {
        const pa2 = pAlive(), ea2 = eAlive();
        if (pa2.length === 0 || ea2.length === 0) {
          document.getElementById('battle-atk-player').textContent = Math.max(0, pa2.reduce((s,u)=>s+u.atk,0));
          document.getElementById('battle-atk-enemy').textContent = Math.max(0, ea2.reduce((s,u)=>s+u.atk,0));
          updateWaitingList(pa2.length, ea2.length);
          endBattle(pa2.length, ea2.length, onComplete);
          return;
        }
        // New sprites for new front-line units
        spawnSprites();
        setTimeout(doRound, 500);
      }, deathDelay);
    }, 800);
  }

  setTimeout(doRound, 600);
}

function addLog(container, cls, text) {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  container.appendChild(div);
}

function endBattle(pAlive, eAlive, onComplete) {
  const overlay = document.getElementById('result-overlay');
  const title = document.getElementById('result-title');
  const subtitle = document.getElementById('result-subtitle');
  let result = 'draw';
  
  if (pAlive > 0 && eAlive === 0) {
    title.textContent = 'VICTORY!';
    title.className = 'win';
    subtitle.textContent = `Your Balikbayan box was packed with love and power! ${pAlive} unit(s) survived.`;
    result = 'win';
  } else if (pAlive === 0 && eAlive > 0) {
    title.textContent = 'DEFEAT';
    title.className = 'lose';
    subtitle.textContent = `Your rival's box was stronger. Try a different packing strategy!`;
    result = 'loss';
  } else {
    title.textContent = 'DRAW';
    title.className = 'draw';
    subtitle.textContent = `Both boxes were evenly matched!`;
    result = 'draw';
  }
  
  overlay.classList.add('show');
  
  if (onComplete) {
    onComplete(result);
  }
}
