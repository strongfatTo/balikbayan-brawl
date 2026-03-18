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
let supabase = null;
let channel = null;
let currentRoomId = null;
let playerName = '';
let gameStatus = 'login'; // login, lobby, shopping, waiting, battling, results
let isAIGame = false;
let currentRound = 1;
let tournamentScores = { player: 0, rival: 0, record: { w: 0, d: 0, l: 0 } };
let isAdmin = false;
let presenceState = {};
let myPresenceId = null;
let lobbyTimer = null;
let isAdvancingRound = false;
let introFinished = false;
let a2HasPlayed = false;

const SUPABASE_URL = 'https://svjwcroknmzdkkjxclww.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2andjcm9rbm16ZGtranhjbHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NTI4ODgsImV4cCI6MjA4ODIyODg4OH0.P6E46tZ2oGUCHu7lE7BuzCbbNyuTOnIiRtMIM50L_OY';

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
  tournamentScores = { player: 0, rival: 0, record: { w: 0, d: 0, l: 0 } };
  isAdmin = false;
  isAdvancingRound = false;
  if (lobbyTimer) { clearTimeout(lobbyTimer); lobbyTimer = null; }
  
  // UI Reset — hide login/header until intro finishes
  if (introFinished) {
    document.getElementById('main-header').style.display = '';
    document.getElementById('login-phase').style.display = 'flex';
  } else {
    document.getElementById('main-header').style.display = 'none';
    document.getElementById('login-phase').style.display = 'none';
  }
  document.getElementById('lobby-phase').style.display = 'none';
  document.getElementById('shop-phase').style.display = 'none';
  document.getElementById('battle-phase').style.display = 'none';
  document.getElementById('leaderboard-overlay').classList.remove('show');
  document.getElementById('result-overlay').classList.remove('show');

  // Reset grid background state
  resetGridBackground();

  if (!gridBuilt) { buildGrid(); gridBuilt = true; }
  renderShop();
  renderGrid();
  renderRules();
  updateStats();
  
  if (!supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
}

// ═══════════════════════════════════════════════════════
//  SCENE FLOW — A1 Intro, A2 Grid BG, P1 Static BG
// ═══════════════════════════════════════════════════════

/** End the A1 intro overlay and reveal the main UI */
function finishIntro() {
  if (introFinished) return;
  introFinished = true;

  const overlay = document.getElementById('intro-overlay');
  const introVideo = document.getElementById('intro-video');

  overlay.classList.add('hidden');
  introVideo.pause();

  // After the fade transition, remove it from layout entirely
  setTimeout(() => {
    overlay.classList.add('removed');
  }, 650);

  // Show the main header and login
  document.getElementById('main-header').style.display = '';
  document.getElementById('login-phase').style.display = 'flex';
}

/** Skip button handler */
window.skipIntro = function() {
  finishIntro();
};

/** Preload the A2 video blob at startup so it's ready when entering the game */
let a2VideoBlob = null;
function preloadA2Video() {
  fetch('assets/videos/A2 .mp4')
    .then(r => r.blob())
    .then(blob => {
      a2VideoBlob = URL.createObjectURL(blob);
      console.log('[DEBUG] A2 video preloaded:', a2VideoBlob);
    })
    .catch(err => console.error('[DEBUG] A2 preload failed:', err));
}

/** Play A2 video behind the grid; when it ends, switch to P1 static image and fade in UI */
function playGridOpeningVideo() {
  const video = document.getElementById('grid-bg-video');
  const img = document.getElementById('grid-bg-image');
  const shopPhase = document.getElementById('shop-phase');
  const header = document.getElementById('main-header');
  const gridWrapper = document.querySelector('.grid-bg-wrapper');
  if (!video || !img) { console.error('video or img not found'); return; }

  shopPhase.classList.add('a2-playing');
  header.classList.add('header-hidden');
  if (gridWrapper) gridWrapper.classList.remove('grid-visible');

  // Use the preloaded blob URL if available, otherwise fall back to original src
  if (a2VideoBlob) {
    video.src = a2VideoBlob;
  } else {
    video.load();
  }
  video.style.display = '';
  img.style.display = 'none';
  video.currentTime = 0;

  let playStarted = false;
  const attemptPlay = () => {
    if (playStarted) return;
    playStarted = true;
    a2HasPlayed = true;
    video.play().then(() => {
      console.log('[DEBUG] video playing! duration:', video.duration);
      setTimeout(() => {
        console.log('[DEBUG] setTimeout: adding grid-visible');
        if (gridWrapper) gridWrapper.classList.add('grid-visible');
        console.log('[DEBUG] grid-wrapper classes:', gridWrapper ? gridWrapper.className : 'n/a');
      }, 2000);
      const videoDuration = (video.duration && isFinite(video.duration) && video.duration > 0)
        ? video.duration * 1000
        : 2000;
      console.log('[DEBUG] setting end timer for', videoDuration, 'ms');
      setTimeout(() => {
        console.log('[DEBUG] end timer: calling showP1Background and revealShopUI');
        showP1Background();
        revealShopUI();
        console.log('[DEBUG] end timer done');
      }, videoDuration);
    }).catch((err) => {
      console.error('[DEBUG] video play() rejected:', err);
      showP1Background();
      revealShopUI();
      if (gridWrapper) gridWrapper.classList.add('grid-visible');
    });
  };

  if (video.readyState >= 3) {
    attemptPlay();
  } else {
    video.oncanplay = () => {
      video.oncanplay = null;
      attemptPlay();
    };
  }

  video.onerror = () => {
    console.error('[DEBUG] video onerror:', video.error);
    showP1Background();
    revealShopUI();
    if (gridWrapper) gridWrapper.classList.add('grid-visible');
  };
}

/** Show P1 static background and hide A2 video */
function showP1Background() {
  const video = document.getElementById('grid-bg-video');
  const img = document.getElementById('grid-bg-image');
  if (!video || !img) return;

  console.log('[DEBUG] showP1Background: hiding video, showing img');
  video.style.display = 'none';
  img.style.display = '';
}

/** Fade in all surrounding UI after the box is shown */
function revealShopUI() {
  const shopPhase = document.getElementById('shop-phase');
  const header = document.getElementById('main-header');
  console.log('[DEBUG] revealShopUI: removing a2-playing class, shopPhase:', shopPhase, 'header:', header);
  shopPhase.classList.remove('a2-playing');
  header.classList.remove('header-hidden');
  console.log('[DEBUG] revealShopUI done, classes:', {
    shopPhase: shopPhase.className,
    header: header ? header.className : 'n/a'
  });
}

/** Reset grid background (hide both A2 and P1) */
function resetGridBackground() {
  a2HasPlayed = false;
  const video = document.getElementById('grid-bg-video');
  const img = document.getElementById('grid-bg-image');
  if (video) { video.pause(); video.currentTime = 0; video.style.display = 'none'; }
  if (img) { img.style.display = 'none'; }
}

/** Set up the A1 intro video listeners (called once at boot) */
function setupIntroVideo() {
  const introVideo = document.getElementById('intro-video');
  if (!introVideo) { introFinished = true; return; }

  // When A1 finishes naturally, reveal the main UI
  introVideo.addEventListener('ended', () => {
    finishIntro();
  });

  // Fallback: if video fails to load, skip intro
  introVideo.addEventListener('error', () => {
    finishIntro();
  });
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
//  MULTIPLAYER LOGIC (Supabase Realtime)
// ═══════════════════════════════════════════════════════
async function initMultiplayer(roomId) {
  if (channel) {
    supabase.removeChannel(channel);
  }

  myPresenceId = Math.random().toString(36).substring(7);
  channel = supabase.channel(`room:${roomId}`, {
    config: { presence: { key: myPresenceId } }
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      presenceState = channel.presenceState();
      
      const players = [];
      for (const key in presenceState) {
        players.push(presenceState[key][0]);
      }
      
      // Limit room size to 2
      if (players.length > 2 && !players.find(p => p.id === myPresenceId)) {
        alert('Room is full (Max 2 players).');
        supabase.removeChannel(channel);
        channel = null;
        init();
        return;
      }

      // Admin checks for game progress triggers
      if (isAdmin && !isAdvancingRound) {
        const allSubmitted = players.every(p => p.submitted);
        const allProcessed = players.every(p => p.processedResult);
        const allOnSameRound = players.every(p => p.currentRound === currentRound);
        
        if ((gameStatus === 'shopping' || gameStatus === 'waiting') && allSubmitted && players.length >= 2) {
          console.log('Sync check: All submitted via presence');
          checkAndMatchPlayers();
        } else if (gameStatus === 'battling' && allProcessed && allOnSameRound && players.length >= 2) {
          console.log('Sync check: All results processed via presence');
          checkRoundCompletion();
        }
      }

      updateLobbyUIFromPresence();
    })
    .on('broadcast', { event: 'round_start' }, (envelope) => {
      const data = envelope.payload;
      console.log('Received round_start broadcast:', data);
      handleRoundStart(data.round, data.maxRounds);
    })
    .on('broadcast', { event: 'submit_grid' }, (envelope) => {
      const data = envelope.payload;
      console.log('Player submitted grid:', data.id);
      // Logic for admin to match players
      if (isAdmin) {
        console.log('Admin checking matches after broadcast...');
        setTimeout(() => checkAndMatchPlayers(), 500);
      }
    })
    .on('broadcast', { event: 'battle_start' }, (envelope) => {
      const data = envelope.payload;
      if (data.targetId === myPresenceId) {
        console.log('Battle start received for me!');
        handleBattleStart(data);
      }
    })
    .on('broadcast', { event: 'battle_bye' }, (envelope) => {
      const data = envelope.payload;
      if (data.targetId === myPresenceId) {
        handleBattleBye(data.message);
      }
    })
    .on('broadcast', { event: 'tournament_results' }, (envelope) => {
      const data = envelope.payload;
      gameStatus = 'results';
      showLeaderboard(data.leaderboard);
    })
    .on('broadcast', { event: 'kick' }, (envelope) => {
      const data = envelope.payload;
      if (data.targetId === myPresenceId) {
        alert(data.message || 'You have been kicked from the room.');
        backToStartMenu(true);
      }
    })
    .subscribe(async (status, err) => {
      console.log('Supabase Channel Status:', status);
      if (err) console.error('Subscription Error:', err);
      
      if (status === 'SUBSCRIBED') {
        console.log('Joined channel successfully');
        await channel.track({
          id: myPresenceId,
          name: playerName,
          joinedAt: new Date().toISOString(),
          score: 0,
          record: { w: 0, d: 0, l: 0 },
          submitted: null,
          processedResult: false
        });
        gameStatus = 'lobby';
        switchPhase('lobby');
      } else if (status === 'CHANNEL_ERROR') {
        alert('Could not join room. Realtime might be disabled in Supabase project.');
      }
    });
}

function updateLobbyUIFromPresence() {
  const list = document.getElementById('player-list');
  const roomDisplay = document.getElementById('lobby-room-display');
  const startBtn = document.getElementById('btn-start-game');
  
  roomDisplay.textContent = `Room: ${currentRoomId}`;
  list.innerHTML = '';
  
  const players = [];
  for (const key in presenceState) {
    players.push(presenceState[key][0]);
  }
  
  // Sort by join time to determine admin (first one)
  players.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
  
  if (players.length > 0) {
    isAdmin = players[0].id === myPresenceId;
    
    // Auto-clean lobby if no game starts in 30s
    if (isAdmin && players.length >= 1 && !lobbyTimer) {
      console.log('Lobby timer started (30s)');
      lobbyTimer = setTimeout(() => {
        if (gameStatus === 'lobby') {
          alert('Lobby closed due to inactivity (30s).');
          backToStartMenu(true);
        }
      }, 30000);
    }
    
    players.forEach(p => {
      const li = document.createElement('li');
      li.className = 'player-list-item';
      li.innerHTML = `
        <span class="player-name">${p.name} ${p.id === players[0].id ? '<span class="admin-badge">(Admin)</span>' : ''}</span>
        ${isAdmin || p.id === myPresenceId ? `<button class="btn-kick-mini" onclick="kickPlayer('${p.id}')">${p.id === myPresenceId ? 'Leave' : 'Kick'}</button>` : ''}
      `;
      list.appendChild(li);
    });

    startBtn.style.display = isAdmin ? 'inline-block' : 'none';
    document.getElementById('lobby-status').textContent = players.length < 2 ? 'Waiting for more players...' : 'Ready to start!';
  }
}

window.kickPlayer = function(targetId) {
  if (targetId === myPresenceId) {
    backToStartMenu();
    return;
  }
  
  if (isAdmin && channel) {
    channel.send({
      type: 'broadcast',
      event: 'kick',
      payload: { targetId, message: 'The Admin kicked you from the room.' }
    });
  }
};

async function handleRoundStart(round, maxRounds) {
  console.log('Starting Round:', round, '/', maxRounds);
  
  // Hardening: Fallback if values are missing
  const r = round || 1;
  const m = maxRounds || 5;
  
  gameStatus = 'shopping';
  currentRound = r;
  
  // Reset presence status for the new round
  if (channel && myPresenceId && presenceState[myPresenceId]) {
    const myState = presenceState[myPresenceId][0];
    myState.submitted = null;
    myState.processedResult = false;
    myState.currentRound = r; // Track current round in presence
    await channel.track(myState);
  }

  const display = document.getElementById('round-display');
  if (display) {
    display.textContent = `Round ${r} / ${m}`;
  }
  
  hideOverlay();
  switchPhase('shopping');
  resetForNewRound();
}

function handleBattleStart(data) {
  gameStatus = 'battling';
  hideOverlay();
  switchPhase('battle');
  
  import('./battle.js').then(module => {
     module.startMultiplayerBattle(placedItems, playerGrid, data.enemyItems, data.enemyGrid, async (result) => {
       await reportBattleResult(result);
     });
  });
}

async function reportBattleResult(result) {
  console.log('Reporting battle result:', result);
  
  if (isAIGame) {
    handleAIResult(result);
    return;
  }

  // Multiplayer logic
  const myState = presenceState[myPresenceId][0];
  if (result === 'win') {
    myState.score += 3;
    myState.record.w++;
  } else if (result === 'draw') {
    myState.score += 2;
    myState.record.d++;
  } else {
    myState.score += 1;
    myState.record.l++;
  }
  myState.processedResult = true;
  
  console.log('Updating presence with score:', myState.score);
  await channel.track(myState);

  // Show a message to wait for other players
  setTimeout(() => {
    // Only show if we are still in the same round and haven't moved to next phase
    if (gameStatus === 'battling' && currentRound === myState.currentRound) {
      showOverlay('Round Finished', 'Waiting for your rival to finish their battle...');
    }
  }, 1500); 
  
  if (isAdmin) {
    // Admin checks if all results are in
    console.log('Admin reported result, checking round completion...');
    checkRoundCompletion();
  }
}

function handleBattleBye(message) {
  showOverlay('Bye Round', message);
  // Auto-win for bye
  reportBattleResult('win');
}

// ═══════════════════════════════════════════════════════
//  ADMIN COORDINATION LOGIC
// ═══════════════════════════════════════════════════════
async function checkAndMatchPlayers() {
  if (!isAdmin || gameStatus === 'battling') return; // Prevent double trigger
  
  const players = [];
  for (const key in presenceState) {
    players.push(presenceState[key][0]);
  }
  
  console.log('Checking for matches. Players submitted:', players.filter(p => p.submitted).length, '/', players.length);
  const allSubmitted = players.every(p => p.submitted);
  if (allSubmitted && players.length >= 2) {
    console.log('All players submitted, generating matches...');
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        const p1 = shuffled[i];
        const p2 = shuffled[i+1];
        
        const b1 = { targetId: p1.id, enemyName: p2.name, enemyItems: p2.submitted.items, enemyGrid: p2.submitted.grid };
        const b2 = { targetId: p2.id, enemyName: p1.name, enemyItems: p1.submitted.items, enemyGrid: p1.submitted.grid };

        console.log(`Matching ${p1.name} vs ${p2.name}`);
        channel.send({ type: 'broadcast', event: 'battle_start', payload: b1 });
        channel.send({ type: 'broadcast', event: 'battle_start', payload: b2 });

        // Trigger locally for admin if admin is one of the players
        if (p1.id === myPresenceId) handleBattleStart(b1);
        if (p2.id === myPresenceId) handleBattleStart(b2);
      } else {
        // Bye
        const byePayload = { targetId: shuffled[i].id, message: "No opponent this round. You get a bye!" };
        console.log(`Bye for ${shuffled[i].name}`);
        channel.send({ type: 'broadcast', event: 'battle_bye', payload: byePayload });
        if (shuffled[i].id === myPresenceId) handleBattleBye(byePayload.message);
      }
    }
  }
}

async function checkRoundCompletion() {
  if (!isAdmin || isAdvancingRound) return;
  
  const players = [];
  for (const key in presenceState) {
    players.push(presenceState[key][0]);
  }
  
  console.log('Checking round completion. Players processed:', players.filter(p => p.processedResult).length, '/', players.length);
  const allProcessed = players.every(p => p.processedResult);
  const allOnSameRound = players.every(p => p.currentRound === currentRound);

  if (allProcessed && allOnSameRound && players.length >= 2) {
    isAdvancingRound = true; // Lock to prevent multiple triggers
    
    if (currentRound >= 5) {
      const leaderboard = players.map(p => ({
        name: p.name,
        score: p.score,
        record: `${p.record.w}-${p.record.d}-${p.record.l}`
      })).sort((a, b) => b.score - a.score);
      
      console.log('Tournament over, sending results:', leaderboard);
      channel.send({ type: 'broadcast', event: 'tournament_results', payload: { leaderboard } });
      
      // Trigger locally for admin
      gameStatus = 'results';
      showLeaderboard(leaderboard);
      
      // Save winner to DB
      await supabase.from('leaderboard').insert(leaderboard.map(entry => ({
        player_name: entry.name,
        score: entry.score,
        wins: parseInt(entry.record.split('-')[0]),
        draws: parseInt(entry.record.split('-')[1]),
        losses: parseInt(entry.record.split('-')[2])
      })));
    } else {
      console.log('All players done with battle, moving to next round...');
      const nextR = currentRound + 1;
      const payload = { round: nextR, maxRounds: 5 };
      channel.send({ type: 'broadcast', event: 'round_start', payload: payload });
      // Trigger locally for admin
      await handleRoundStart(nextR, 5);
      
      // Release lock after a short delay to allow presence to sync the new round state
      setTimeout(() => { isAdvancingRound = false; }, 2000);
    }
  }
}

function switchPhase(phase) {
  document.getElementById('login-phase').style.display = phase === 'login' ? 'flex' : 'none';
  document.getElementById('lobby-phase').style.display = phase === 'lobby' ? 'flex' : 'none';
  document.getElementById('shop-phase').style.display = phase === 'shopping' ? 'grid' : 'none';
  document.getElementById('battle-phase').style.display = phase === 'battle' ? 'block' : 'none';

  // Scene flow: when entering the shop phase, play A2 behind the grid
  if (phase === 'shopping') {
    const gridWrapper = document.querySelector('.grid-bg-wrapper');
    if (!a2HasPlayed) {
      playGridOpeningVideo();
    } else {
      // Already played A2 before (e.g. round 2+), show P1 directly and UI immediately
      showP1Background();
      if (gridWrapper) gridWrapper.classList.add('grid-visible');
      document.getElementById('shop-phase').classList.remove('a2-playing');
      document.getElementById('main-header').classList.remove('header-hidden');
    }
  }
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
  currentRoomId = roomInput.value.trim();
  
  if (!playerName || !currentRoomId) {
    alert('Please enter both name and Room ID');
    return;
  }
  
  initMultiplayer(currentRoomId);
};

window.startAIGame = function() {
  const nameInput = document.getElementById('player-name-input');
  playerName = nameInput.value.trim() || 'You';
  isAIGame = true;
  gameStatus = 'shopping';
  currentRound = 1;
  tournamentScores = { player: 0, rival: 0, record: { w: 0, d: 0, l: 0 } };
  
  document.getElementById('round-display').textContent = `Round 1 / 5`;
  switchPhase('shopping');
  resetForNewRound();
};

window.requestStartGame = function() {
  if (isAdmin && channel) {
    const payload = { round: 1, maxRounds: 5 };
    // Broadcast to others
    channel.send({
      type: 'broadcast',
      event: 'round_start',
      payload: payload
    });
    // Trigger locally for the admin
    handleRoundStart(payload.round, payload.maxRounds);
  }
};

window.backToLobby = function() {
  document.getElementById('leaderboard-overlay').classList.remove('show');
  if (isAIGame) {
    switchPhase('login');
  } else {
    switchPhase('lobby');
  }
};

window.backToStartMenu = function(force = false) {
  if (force || confirm('Are you sure you want to leave the current game?')) {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
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
    tournamentScores.player += 3;
    tournamentScores.record.w++;
  } else if (result === 'draw') {
    tournamentScores.player += 2;
    tournamentScores.rival += 2;
    tournamentScores.record.d++;
  } else {
    tournamentScores.rival += 3;
    tournamentScores.record.l++;
  }
  
  setTimeout(() => {
    if (currentRound >= 5) {
      const leaderboard = [
        { name: playerName, score: tournamentScores.player, record: `${tournamentScores.record.w}-${tournamentScores.record.d}-${tournamentScores.record.l}` },
        { name: 'AI Rival', score: tournamentScores.rival, record: `${tournamentScores.record.l}-${tournamentScores.record.d}-${tournamentScores.record.w}` }
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

    // Add info button to shop card
    const shopInfoBtn = document.createElement('div');
    shopInfoBtn.className = 'info-btn';
    shopInfoBtn.style.opacity = '1';
    shopInfoBtn.style.position = 'absolute';
    shopInfoBtn.style.top = '4px';
    shopInfoBtn.style.right = '4px';
    shopInfoBtn.textContent = 'i';
    card.appendChild(shopInfoBtn);

    shopInfoBtn.addEventListener('mouseenter', (e) => {
      e.stopPropagation();
      const popover = document.getElementById('item-popover');
      popover.innerHTML = `<div class="popover-desc">${item.desc || 'No special effects.'}</div>`;
      const rect = shopInfoBtn.getBoundingClientRect();
      popover.style.left = (rect.right + 10) + 'px';
      popover.style.top = (rect.top - 10) + 'px';
      popover.classList.add('show');
    });

    shopInfoBtn.addEventListener('mouseleave', () => {
      document.getElementById('item-popover').classList.remove('show');
    });

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
    
    // Fix: Draw preview from top row to bottom row to match grid coordinates (y=max at top)
    for (let py = previewSize - 1; py >= 0; py--) {
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
      <div class="name">
        ${item.image ? `<img src="${item.image}" alt="${item.name}" style="height:24px; width:24px; object-fit:contain; vertical-align:middle; margin-right:5px;">` : item.emoji} 
        ${item.name}
      </div>
      <div class="stats">
        <span class="atk-badge">ATK: ${item.atk}</span>
      </div>
    `;
    card.title = item.desc || ''; // Use native hover tooltip for special effect
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
      const item = ITEMS.find(i => i.id === rule.itemId);
      const iconHtml = item && item.image 
        ? `<img src="${item.image}" alt="${rule.name}" style="height:24px; width:24px; object-fit:contain; vertical-align:middle; margin-right:5px;">` 
        : `<span style="font-size:20px">${rule.emoji}</span>`;

      row.innerHTML = `
        <div class="rule-indicator ${isActive && placed ? 'active' : ''}" style="border-color: ${currentColor}"></div>
        ${iconHtml}
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
        
        // Find order index
        const orderIdx = placedItems.findIndex(p => p.placedId === occupant.placedId) + 1;
        cell.innerHTML = `
          <div class="grid-cell-emoji">
            ${occupant.item.image ? `<img src="${occupant.item.image}" alt="${occupant.item.name}">` : occupant.item.emoji}
          </div>
          <div class="grid-cell-badge">${orderIdx}</div>
        `;

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

  placedItems.forEach((pi, idx) => {
    const m = checkMechanic(pi, placedItems, playerGrid);
    const bonusText = m.text;
    const tag = document.createElement('div');
    tag.className = 'placed-item-tag';
    tag.draggable = true;
    tag.dataset.id = pi.placedId;
    tag.dataset.idx = idx;

    if (m.active && bonusText && bonusText !== pi.item.mechanic?.badLabel) {
      tag.classList.add('has-bonus');
    }

    if (bonusText) {
      tag.title = bonusText;
    }

    tag.innerHTML = `
      <span class="order-badge">${idx + 1}</span>
      <span class="item-emoji">
        ${pi.item.image ? `<img src="${pi.item.image}" alt="${pi.item.name}" style="height:24px; width:24px; object-fit:contain;">` : pi.item.emoji}
      </span>
      <div class="info-btn">i</div>
      <span class="x" title="Remove">✕</span>
    `;

    listEl.appendChild(tag);
  });

  // Attach drag-drop listeners ONCE to the container (event delegation)
  // This avoids innerHTML replacing child-element listeners
  listEl.ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const draggingEl = listEl.querySelector('.dragging');
    const target = e.target.closest('.placed-item-tag');
    if (!draggingEl || !target || draggingEl === target) return;
    const rect = target.getBoundingClientRect();
    const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
    listEl.insertBefore(draggingEl, next ? target.nextSibling : target);
  };

  listEl.ondrop = (e) => {
    e.preventDefault();
    const newOrderIds = Array.from(listEl.querySelectorAll('.placed-item-tag'))
      .map(el => parseInt(el.dataset.id));
    placedItems = newOrderIds.map(id => placedItems.find(p => p.placedId === id));
    renderPlacedItemsList();
    renderGrid();
  };

  listEl.ondragstart = (e) => {
    const tag = e.target.closest('.placed-item-tag');
    if (!tag) return;
    tag.classList.add('dragging');
    e.dataTransfer.setData('text/plain', tag.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  listEl.ondragend = (e) => {
    const tag = e.target.closest('.placed-item-tag');
    if (tag) tag.classList.remove('dragging');
  };

  // Info button popover (delegated)
  listEl.onmouseover = (e) => {
    const infoBtn = e.target.closest('.info-btn');
    if (!infoBtn) return;
    const tag = infoBtn.closest('.placed-item-tag');
    if (!tag) return;
    const pi = placedItems.find(p => p.placedId === parseInt(tag.dataset.id));
    if (!pi) return;
    const m = checkMechanic(pi, placedItems, playerGrid);
    const bonusText = m.text;
    const popover = document.getElementById('item-popover');
    popover.innerHTML = `<div class="popover-desc">${bonusText || 'No active bonus.'}</div>`;
    const rect = infoBtn.getBoundingClientRect();
    popover.style.left = (rect.left - 210) + 'px';
    popover.style.top = (rect.top - 40) + 'px';
    popover.classList.add('show');
  };

  listEl.onmouseout = (e) => {
    const infoBtn = e.target.closest('.info-btn');
    if (infoBtn) document.getElementById('item-popover').classList.remove('show');
  };

  // Remove button
  listEl.onclick = (e) => {
    const xBtn = e.target.closest('.x');
    if (!xBtn) return;
    const tag = xBtn.closest('.placed-item-tag');
    if (!tag) return;
    document.getElementById('item-popover').classList.remove('show');
    removeItem(parseInt(tag.dataset.id));
  };
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

window.startBattle = async function() {
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
  
  if (channel && gameStatus === 'shopping') {
    gameStatus = 'waiting';
    showOverlay('Waiting...', 'Sending your box to the rival...');
    
    // Update our presence state with the submitted items
    const myState = presenceState[myPresenceId][0];
    myState.submitted = { items: placedItems, grid: playerGrid };
    
    console.log('Submitting grid, updating presence...');
    await channel.track(myState);
    
    // Tell the channel we submitted
    channel.send({
      type: 'broadcast',
      event: 'submit_grid',
      payload: { id: myPresenceId }
    });
    
    // Admin needs to check locally because broadcast doesn't self-receive
    if (isAdmin) {
      console.log('Admin submitted, checking for matches locally...');
      setTimeout(() => checkAndMatchPlayers(), 500); // Small delay to ensure presence sync
    }
  }
};

window.restartGame = function() {
  init();
};

// ── Placement Logic ──
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
  // Ensure hover preview is updated for the now-empty selection
  if (lastHoverGx >= 0 && lastHoverGy >= 0) updateHoverPreview(lastHoverGx, lastHoverGy);
}

// ── Rotation ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    if (!selectedItem) return;
    e.preventDefault(); // Prevent accidental scroll or other browser defaults
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
  let totalAtk = 0, cellsUsed = 0;
  placedItems.forEach(pi => {
    const s = getEffectiveStats(pi, placedItems, playerGrid);
    totalAtk += s.atk;
    cellsUsed += pi.cells.length;
  });
  document.getElementById('stat-atk').textContent = totalAtk;
  document.getElementById('stat-items').textContent = placedItems.length;
  document.getElementById('stat-grid').textContent = `${cellsUsed}/25`;
}

// ═══════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════
setupIntroVideo();
init();
preloadA2Video();
