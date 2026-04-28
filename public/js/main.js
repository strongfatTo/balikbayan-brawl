import { ITEMS, GRID_W, GRID_H, checkMechanic, getEffectiveStats,
         TOOTHPASTE_BASE_PRICE, SELL_REFUND_RATE, RESTOCK_COST,
         STARTING_BUDGET, REWARD_WIN, REWARD_LOSS, REWARD_DRAW,
         SHOP_OFFERING_COUNT } from './gameData.js';

// ????????????????????????????????????????????????????????
//  GAME STATE
// ????????????????????????????????????????????????????????
let budget = STARTING_BUDGET;
let previousBudget = STARTING_BUDGET;
let playerGrid = Array.from({length: GRID_H}, () => Array(GRID_W).fill(null));
let placedItems = [];
let gridCells = [];
let selectedItem = null;
let selectedShapeIdx = 0;
let movingItemState = null;
let hoverCells = [];
let placedIdCounter = 0;
let lastHoverGx = -1;
let lastHoverGy = -1;
let shopOfferings = [];
let gameStatus = 'login';
let currentRound = 1;
let isAIGame = false;
let isAdmin = false;
let isAdvancingRound = false;
let hasSubmittedThisRound = false;
let currentPairing = null;
let roomConfig = { prepDurationSec: 60, maxRounds: 5, createdBy: null };
let currentRoomId = null;
let playerName = '';
let myPresenceId = null;
let presenceState = {};
let channel = null;
let tournamentState = null;
let tournamentScores = { player: 0, rival: 0, record: { w: 0, d: 0, l: 0 } };
let lastLeaderboardPositions = {};
let adminSubmissions = {};
let adminProcessed = {};
let lobbyTimer = null;
let prepCountdownTimer = null;
let leaderboardCountdownTimer = null;
let battleLeaveRecoveryTimer = null;
let prepDeadlineTs = 0;
let leaderboardCountdownDeadlineTs = 0;
let introFinished = false;
let a2HasPlayed = false;
let gridBuilt = false;
let supabase = null;
let matchedRound = null;
let activeBattleRound = null;
let reportedResultRound = null;
let isLeavingRoom = false;
let reconnectTimer = null;
let reconnectAttempt = 0;
let reconnectInProgress = false;
let lastAIBuildSignature = '';
let aiTakeoverSlots = {};
let lastPresenceSnapshot = {};
let pendingCreateConfig = null;
let tutorialMode = false;
let tutorialActive = false;
let tutorialStepIndex = 0;
let tutorialFocusedElements = [];
let tutorialStepBodyClass = '';
let tutorialRotateAttempts = 0;
let tutorialShopIndex = 0;
let opLog = [];
let gridDragState = null;
let suppressGridClickUntil = 0;
const ROOM_MAX_PLAYERS = 16;
const ROOM_MIN_PLAYERS_TO_START = 2;
const PREP_TIME_OPTIONS = [60, 90, 120];
const ROUND_COUNT_OPTIONS = [3, 4, 5];
const DEFAULT_PREP_TIME_SEC = 60;
const DEFAULT_MAX_ROUNDS = 5;
const ROUND_LEADERBOARD_MS = 10000;
const FIXED_SHOP_SEQUENCE = [
  'jeans',
  'shampoo',
  'bread',
  'shoes',
  'spam',
  'chocolate',
  'pillbox',
  'pan',
  'bleach',
  'alcohol',
  'toothpaste'
];

const GUIDE_KEY = 'bb_seen_guide_v1';
const HUMAN_AI_STORAGE_KEY = 'bb_human_builds_cache_v1';
const HUMAN_AI_TABLE = 'ai_human_builds';

async function sendBroadcast(event, payload, attempts = 2, delayMs = 250) {
  if (!channel) return;

  for (let i = 0; i < attempts; i++) {
    try {
      const message = { type: 'broadcast', event, payload };
      // Use REST only while the realtime channel is not fully joined yet.
      if (typeof channel.httpSend === 'function' && channel.state !== 'joined') {
        await channel.httpSend(event, payload);
      } else {
        await channel.send(message);
      }
    } catch (err) {
      console.error(`Broadcast failed: ${event}`, err);
    }

    if (i < attempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

function getMyPresenceState() {
  const existing = presenceState[myPresenceId]?.[0];
  const existingRecord = existing?.record || {};

  return {
    id: myPresenceId,
    name: existing?.name || playerName,
    joinedAt: existing?.joinedAt || new Date().toISOString(),
    score: existing?.score || 0,
    record: {
      w: existingRecord.w || 0,
      d: existingRecord.d || 0,
      l: existingRecord.l || 0
    },
    submitted: existing?.submitted || false,
    processedResult: existing?.processedResult || false,
    currentRound: existing?.currentRound || currentRound,
    prepDurationSec: existing?.prepDurationSec || roomConfig.prepDurationSec || DEFAULT_PREP_TIME_SEC,
    maxRounds: existing?.maxRounds || roomConfig.maxRounds || DEFAULT_MAX_ROUNDS,
    roomCreatedBy: existing?.roomCreatedBy || roomConfig.createdBy || myPresenceId
  };
}

function scheduleChannelReconnect() {
  if (!channel || !currentRoomId || isLeavingRoom || isAIGame) return;
  if (reconnectTimer) return;

  reconnectAttempt += 1;
  const delay = Math.min(1000 * reconnectAttempt, 3000);
  console.warn(`Realtime channel closed. Reconnecting in ${delay}ms...`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!channel || isLeavingRoom) return;

    try {
      reconnectRoomChannel();
    } catch (err) {
      console.error('Realtime reconnect failed to start:', err);
      scheduleChannelReconnect();
    }
  }, delay);
}

async function ensureChannelReady(timeoutMs = 2500) {
  if (!currentRoomId || isLeavingRoom) return false;
  if (channel && channel.state === 'joined') return true;

  if ((!channel || channel.state === 'closed') && !reconnectInProgress) {
    reconnectRoomChannel();
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!channel || isLeavingRoom) return false;
    if (channel.state === 'joined') return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return channel.state === 'joined';
}

async function safeTrackPresence(nextState, context = 'presence update') {
  const ready = await ensureChannelReady();
  if (!ready) {
    console.warn(`Presence track skipped during ${context}: channel not ready.`);
    return false;
  }

  try {
    await channel.track(nextState);
    presenceState[myPresenceId] = [nextState];
    return true;
  } catch (err) {
    console.warn(`Presence track failed during ${context}:`, err);
    return false;
  }
}

async function handleChannelStatus(status, err, expectedChannel = channel) {
  if (expectedChannel !== channel) return;

  console.log('Supabase Channel Status:', status);
  if (err) console.error('Subscription Error:', err);

  if (status === 'SUBSCRIBED') {
    reconnectInProgress = false;
    reconnectAttempt = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    console.log('Joined channel successfully');
    const myState = getMyPresenceState();
    await safeTrackPresence(myState, 'channel subscribe');

    if (pendingCreateConfig) {
      roomConfig = {
        prepDurationSec: pendingCreateConfig.prepDurationSec,
        maxRounds: pendingCreateConfig.maxRounds,
        createdBy: myPresenceId
      };
      await safeTrackPresence(getMyPresenceState(), 'room create config');
      await sendBroadcast('room_config', {
        prepDurationSec: roomConfig.prepDurationSec,
        maxRounds: roomConfig.maxRounds,
        createdBy: myPresenceId
      });
      pendingCreateConfig = null;
    }

    // After reconnection, delay admin checks to allow presence to sync
    if (isAdmin && (gameStatus === 'shopping' || gameStatus === 'waiting' || gameStatus === 'battling')) {
      console.log('[DEBUG] Channel reconnected, scheduling delayed sync check...');
      setTimeout(async () => {
        if (!isAdmin) return;
        // Ask non-admin players who submitted this round to resend their grid,
        // since broadcasts are not replayed after a reconnect and adminSubmissions
        // may be missing their entries.
        if (gameStatus === 'shopping' || gameStatus === 'waiting') {
          // If admin is in 'waiting' state, they already submitted before the channel dropped.
          // Re-store their own submission unconditionally since presence hasn't synced yet
          // at this point and the submitted flag cannot be trusted.
          if (gameStatus === 'waiting' && !adminSubmissions[myPresenceId] && placedItems.length > 0) {
            adminSubmissions[myPresenceId] = { items: placedItems, grid: playerGrid, round: currentRound };
            console.log('[DEBUG] Admin re-stored own submission after reconnect (waiting state)');
          }
          console.log('[DEBUG] Admin requesting resubmit from players (reconnect recovery)');
          await sendBroadcast('request_resubmit', { round: currentRound });
        }
        // Force check submissions and processed
        checkAndMatchPlayers();
        checkRoundCompletion();
      }, 2500); // Give presence time to sync after reconnection (other players need time to re-track)
    }

    if (gameStatus === 'login') {
      gameStatus = 'lobby';
      switchPhase('lobby');
    }
  } else if (status === 'CHANNEL_ERROR') {
    alert('Could not join room. Realtime might be disabled in Supabase project.');
  } else if (status === 'CLOSED') {
    scheduleChannelReconnect();
  }
}

function attachChannelListeners(targetChannel) {
  targetChannel
    .on('presence', { event: 'sync' }, () => {
      if (targetChannel !== channel) return;

      presenceState = targetChannel.presenceState();

      const players = getPresencePlayers();
      syncAiTakeoverSlotsFromPresence(players);
      refreshBattleTakeoverState();

      syncRoomConfigFromPresence(players);
      
      // Limit room size to configured maximum
      if (players.length > ROOM_MAX_PLAYERS && !players.find(p => p.id === myPresenceId)) {
        alert(`Room is full (Max ${ROOM_MAX_PLAYERS} players).`);
        supabase.removeChannel(targetChannel);
        if (targetChannel === channel) channel = null;
        init();
        return;
      }

      // Admin keeps tournament running even when players disconnect.
      if (isAdmin && tournamentState && !isAdvancingRound) {
        setTimeout(() => {
          checkAndMatchPlayers();          checkRoundCompletion();
        }, 250);
      }

      updateLobbyUIFromPresence();
    })
    .on('broadcast', { event: 'room_config' }, (envelope) => {
      if (targetChannel !== channel) return;
      const data = envelope.payload || {};
      if (!PREP_TIME_OPTIONS.includes(data.prepDurationSec)) return;
      roomConfig = {
        prepDurationSec: data.prepDurationSec,
        maxRounds: ROUND_COUNT_OPTIONS.includes(Number(data.maxRounds)) ? Number(data.maxRounds) : roomConfig.maxRounds,
        createdBy: data.createdBy || roomConfig.createdBy
      };
      updatePrepTimeDisplay();
    })
    .on('broadcast', { event: 'tournament_state' }, (envelope) => {
      if (targetChannel !== channel) return;
      const data = envelope.payload;
      if (!data) return;
      tournamentState = data;
    })
    .on('broadcast', { event: 'round_start' }, (envelope) => {
      if (targetChannel !== channel) return;
      const data = envelope.payload;
      console.log('Received round_start broadcast:', data);
      handleRoundStart(data.round, data.maxRounds, data.prepDurationSec);
    })
    .on('broadcast', { event: 'submit_grid' }, (envelope) => {
      if (targetChannel !== channel) return;
      const data = envelope.payload;
      console.log('Player submitted grid:', data.id);
      if (isAdmin && tournamentState && data.round === currentRound) {
        if (data.id !== myPresenceId) {
          adminSubmissions[data.id] = {
            items: data.items,
            grid: data.grid,
            round: data.round
          };
        }        if (presenceState[data.id] && presenceState[data.id][0]) {
            presenceState[data.id][0].submitted = true;
        }

        console.log('Admin checking matches after broadcast...');
        // Pass the round so we only check for current round
        setTimeout(() => checkAndMatchPlayers(), 500);
      }
    })
    .on('broadcast', { event: 'battle_start' }, (envelope) => {
      if (targetChannel !== channel) return;
      const data = envelope.payload;
      // Reject stale replayed battle_start from a previous round after reconnect
      if (data.round && data.round !== currentRound) return;
      if (data.targetId === myPresenceId) {
        console.log('Battle start received for me!');
        handleBattleStart(data);
      }
    })
    .on('broadcast', { event: 'battle_bye' }, (envelope) => {
      if (targetChannel !== channel) return;
      const data = envelope.payload;
      if (data.targetId === myPresenceId) {
        handleBattleBye(data.message);
      }
    })
    .on('broadcast', { event: 'processed_result' }, (envelope) => {
      if (targetChannel !== channel) return;
      const data = envelope.payload;
      console.log('Player processed result:', data.id);
      if (isAdmin && data.round === currentRound && tournamentState) {
        if (adminProcessed[data.id]) return;
        adminProcessed[data.id] = { result: data.result };
        applyRoundResultToTournament(data.id, data.result);
        if (data.opponentId && !isPlayerOnline(data.opponentId) && !adminProcessed[data.opponentId]) {
          const mirrored = data.result === 'win' ? 'loss' : data.result === 'loss' ? 'win' : 'draw';
          adminProcessed[data.opponentId] = { result: mirrored };
          applyRoundResultToTournament(data.opponentId, mirrored);
        }
        
        if (presenceState[data.id] && presenceState[data.id][0]) {
            presenceState[data.id][0].processedResult = true;
        }
    updatePrepTimeDisplay();
        console.log('Admin checking round completion after broadcast...');
        setTimeout(() => checkRoundCompletion(), 500);
      }
    })
    .on('broadcast', { event: 'round_leaderboard' }, (envelope) => {
      if (targetChannel !== channel) return;
      const data = envelope.payload || {};
      const headline = data.headline || `Round ${currentRound} Leaderboard`;
      showLeaderboard(data.leaderboard || [], { headline, includeMovement: true });
    })
    .on('broadcast', { event: 'tournament_results' }, (envelope) => {
      if (targetChannel !== channel) return;
      const data = envelope.payload;
      gameStatus = 'results';
      showLeaderboard(data.leaderboard, { headline: 'TOURNAMENT RESULTS', includeMovement: true });
    })
    .on('broadcast', { event: 'request_resubmit' }, async (envelope) => {
      if (targetChannel !== channel) return;
      const data = envelope.payload;
      // Only non-admin players respond. If we already submitted this round, resend our grid
      // so the admin can rebuild their adminSubmissions after a reconnect.
      if (!isAdmin && data.round === currentRound && (gameStatus === 'waiting' || gameStatus === 'shopping')) {
        const myState = presenceState[myPresenceId]?.[0];
        if (myState?.submitted) {
          console.log('[DEBUG] Resubmitting grid on admin request (reconnect recovery), round:', currentRound);
          await sendBroadcast('submit_grid', { id: myPresenceId, items: placedItems, grid: playerGrid, round: currentRound });
        }
      }
    })
    .on('broadcast', { event: 'kick' }, (envelope) => {
      if (targetChannel !== channel) return;
      const data = envelope.payload;
      if (data.targetId === myPresenceId) {
        alert(data.message || 'You have been kicked from the room.');
        backToStartMenu(true);
      }
    });
}

function createRoomChannel(roomId, preservePresenceId = false) {
  if (!preservePresenceId || !myPresenceId) {
    myPresenceId = Math.random().toString(36).substring(7);
  }

  const nextChannel = supabase.channel(`room:${roomId}`, {
    config: { presence: { key: myPresenceId } }
  });

  attachChannelListeners(nextChannel);
  nextChannel.subscribe((status, err) => handleChannelStatus(status, err, nextChannel));
  channel = nextChannel;
}

function reconnectRoomChannel() {
  if (!currentRoomId || isLeavingRoom || isAIGame || reconnectInProgress) return;
  reconnectInProgress = true;

  const oldChannel = channel;
  channel = null;
  if (oldChannel) {
    supabase.removeChannel(oldChannel);
  }

  createRoomChannel(currentRoomId, true);
}

const SUPABASE_URL = 'https://svjwcroknmzdkkjxclww.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2andjcm9rbm16ZGtranhjbHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NTI4ODgsImV4cCI6MjA4ODIyODg4OH0.P6E46tZ2oGUCHu7lE7BuzCbbNyuTOnIiRtMIM50L_OY';

// ????????????????????????????????????????????????????????
//  WALLET ANIMATION
// ????????????????????????????????????????????????????????
function updateBudgetDisplay() {
  const el = document.getElementById('budget-display');
  const newBudget = budget;
  el.textContent = `$${parseFloat(newBudget.toFixed(2))}`;

  // Animate if budget changed
  if (newBudget > previousBudget) {
    el.classList.remove('wallet-up', 'wallet-down');
    void el.offsetWidth; // Force reflow to restart animation
    el.classList.add('wallet-up');
    el.addEventListener('animationend', () => el.classList.remove('wallet-up'), { once: true });
  } else if (newBudget < previousBudget) {
    el.classList.remove('wallet-up', 'wallet-down');
    void el.offsetWidth;
    el.classList.add('wallet-down');
    el.addEventListener('animationend', () => el.classList.remove('wallet-down'), { once: true });
  }
  previousBudget = newBudget;
}

// ????????????????????????????????????????????????????????
//  SHOP RESTOCK SYSTEM
// ????????????????????????????????????????????????????????
function restockShop() {
  shopOfferings = [];

  if (tutorialMode) {
    for (let i = 0; i < SHOP_OFFERING_COUNT; i++) {
      const itemId = FIXED_SHOP_SEQUENCE[tutorialShopIndex % FIXED_SHOP_SEQUENCE.length];
      const item = ITEMS.find(it => it.id === itemId);
      if (item) shopOfferings.push(item);
      tutorialShopIndex++;
    }
    return;
  }

  const availableItems = [...ITEMS];
  for (let i = 0; i < SHOP_OFFERING_COUNT; i++) {
    if (availableItems.length === 0) break;
    const randomIdx = Math.floor(Math.random() * availableItems.length);
    shopOfferings.push(availableItems[randomIdx]);
    availableItems.splice(randomIdx, 1);
  }
}

window.restockShopBtn = function() {
  if (budget < RESTOCK_COST) return;
  budget -= RESTOCK_COST;
  restockShop();
  selectedItem = null;
  selectedShapeIdx = 0;
  renderShop();
  updateBudgetDisplay();
};

// ????????????????????????????????????????????????????????
//  INIT
// ????????????????????????????????????????????????????????
function init() {
  budget = STARTING_BUDGET;
  previousBudget = STARTING_BUDGET;
  playerGrid = Array.from({length: GRID_H}, () => Array(GRID_W).fill(null));
  placedItems = [];
  selectedItem = null;
  selectedShapeIdx = 0;
  movingItemState = null;
  hoverCells = [];
  placedIdCounter = 0;
  lastHoverGx = -1;
  lastHoverGy = -1;
  isAIGame = false;
  currentRound = 1;
  tournamentScores = { player: 0, rival: 0, record: { w: 0, d: 0, l: 0 } };
  isAdmin = false;
  isAdvancingRound = false;
  hasSubmittedThisRound = false;
  currentPairing = null;
  tournamentState = null;
  roomConfig = { prepDurationSec: DEFAULT_PREP_TIME_SEC, maxRounds: DEFAULT_MAX_ROUNDS, createdBy: null };
  pendingCreateConfig = null;
  lastLeaderboardPositions = {};
  matchedRound = null;
  activeBattleRound = null;
  reportedResultRound = null;
  isLeavingRoom = false;
  reconnectInProgress = false;
  reconnectAttempt = 0;
  tutorialActive = false;
  tutorialMode = false;
  tutorialStepIndex = 0;
  tutorialFocusedElements = [];
  tutorialStepBodyClass = '';
  tutorialRotateAttempts = 0;
  tutorialShopIndex = 0;
  opLog = [];
  presenceState = {};
  aiTakeoverSlots = {};
  lastPresenceSnapshot = {};
  myPresenceId = null;
  adminSubmissions = {};
  adminProcessed = {};
  const roundDisplay = document.getElementById('round-display');
  if (roundDisplay) roundDisplay.textContent = `Round 1 / ${roomConfig.maxRounds || DEFAULT_MAX_ROUNDS}`;

  // Mobile toolbar setup
  initMobileToolbar();

  if (prepCountdownTimer) {
    clearInterval(prepCountdownTimer);
    prepCountdownTimer = null;
  }
  prepDeadlineTs = 0;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (lobbyTimer) { clearTimeout(lobbyTimer); lobbyTimer = null; }
  
  // UI Reset ??hide login/header until intro finishes
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
  document.getElementById('tutorial-overlay').style.display = 'none';
  document.body.classList.remove('tutorial-active');

  // Reset grid background state
  resetGridBackground();

  if (!gridBuilt) { buildGrid(); gridBuilt = true; }

  restockShop();
  renderShop();
  renderGrid();
  renderRules();
  updateStats();
  
  if (!supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
}

function recordOperation(type, payload = {}) {
  opLog.push({
    type,
    payload,
    at: new Date().toISOString(),
    round: currentRound
  });

  if (opLog.length > 300) {
    opLog = opLog.slice(opLog.length - 300);
  }
}

function cloneCells(cells = []) {
  return cells.map(c => ({ x: c.x, y: c.y }));
}

function serializePlacedItems(items) {
  return items.map((pi, idx) => ({
    order: idx + 1,
    itemId: pi.item.id,
    shapeIdx: pi.shapeIdx || 0,
    cells: cloneCells(pi.cells)
  }));
}

function buildFromSerializedItems(serializedItems = []) {
  const aiGrid = Array.from({length: GRID_H}, () => Array(GRID_W).fill(null));
  const aiPlacedItems = [];

  for (const s of serializedItems) {
    const item = ITEMS.find(i => i.id === s.itemId);
    if (!item) continue;
    const cells = cloneCells(s.cells || []);
    if (cells.length === 0) continue;

    const valid = cells.every(c =>
      c.x >= 0 && c.x < GRID_W && c.y >= 0 && c.y < GRID_H && !aiGrid[c.y][c.x]
    );
    if (!valid) continue;

    const placed = {
      item,
      cells,
      shapeIdx: s.shapeIdx || 0,
      placedId: aiPlacedItems.length + 1
    };
    aiPlacedItems.push(placed);
    cells.forEach(c => { aiGrid[c.y][c.x] = placed; });
  }

  return { items: aiPlacedItems, grid: aiGrid };
}

function getCachedHumanBuilds() {
  try {
    const raw = localStorage.getItem(HUMAN_AI_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCachedHumanBuild(build) {
  const cached = getCachedHumanBuilds();
  cached.unshift(build);
  localStorage.setItem(HUMAN_AI_STORAGE_KEY, JSON.stringify(cached.slice(0, 120)));
}

async function persistHumanBuild(resultTag, modeTag) {
  if (!placedItems.length) return;

  const buildData = {
    playerName: playerName || 'Anonymous',
    mode: modeTag,
    round: currentRound,
    result: resultTag,
    budgetRemaining: Number(budget.toFixed(2)),
    items: serializePlacedItems(placedItems),
    operations: opLog.slice(-80)
  };

  saveCachedHumanBuild(buildData);

  if (!supabase) return;

  try {
    const { error } = await supabase.from(HUMAN_AI_TABLE).insert({
      player_name: buildData.playerName,
      mode_tag: buildData.mode,
      result_tag: buildData.result,
      round_num: buildData.round,
      build_data: buildData
    });

    if (error) {
      console.warn('Human AI DB insert skipped:', error.message);
    }
  } catch (err) {
    console.warn('Human AI DB unavailable, using local cache only.', err);
  }
}

async function fetchHumanBuildsForAI() {
  const cached = getCachedHumanBuilds();
  if (!supabase) return cached;

  try {
    const { data, error } = await supabase
      .from(HUMAN_AI_TABLE)
      .select('build_data, result_tag, mode_tag, created_at')
      .order('created_at', { ascending: false })
      .limit(80);

    if (error) {
      console.warn('Human AI DB read skipped:', error.message);
      return cached;
    }

    const normalized = (data || []).map(row => row.build_data).filter(Boolean);
    return [...normalized, ...cached].slice(0, 120);
  } catch (err) {
    console.warn('Human AI DB read failed, fallback to local cache.', err);
    return cached;
  }
}

function pickHumanStyleBuild(builds) {
  if (!builds.length) return null;

  const scored = builds
    .filter(b => Array.isArray(b.items) && b.items.length > 0)
    .map(b => {
      const resultScore = b.result === 'win' ? 3 : b.result === 'draw' ? 2 : 1;
      const itemScore = Math.min(4, b.items.length * 0.4);
      const roundScore = Math.min(2, (b.round || 1) * 0.25);
      return { build: b, score: resultScore + itemScore + roundScore + Math.random() };
    })
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  const topPool = scored.slice(0, Math.min(12, scored.length));
  return topPool[Math.floor(Math.random() * topPool.length)].build;
}

function getBuildSignature(build) {
  if (!build || !Array.isArray(build.items)) return 'empty';
  return build.items
    .map(item => `${item.itemId}:${(item.cells || []).map(c => `${c.x},${c.y}`).join('|')}`)
    .join(';');
}

function placeItemOnAIGrid(aiGrid, aiPlacedItems, aiState, itemId, gx, gy, shapeIdx = 0) {
  const item = ITEMS.find(i => i.id === itemId);
  if (!item) return false;
  if (item.price > aiState.budget) return false;

  const actualShapeIdx = shapeIdx % item.shapes.length;
  const shape = item.shapes[actualShapeIdx];
  const cells = shape.map(([dx, dy]) => ({ x: gx + dx, y: gy + dy }));
  const valid = cells.every(c => c.x >= 0 && c.x < GRID_W && c.y >= 0 && c.y < GRID_H && !aiGrid[c.y][c.x]);
  if (!valid) return false;

  const placed = { item, cells, shapeIdx: actualShapeIdx, placedId: aiPlacedItems.length + 1 };
  aiPlacedItems.push(placed);
  cells.forEach(c => { aiGrid[c.y][c.x] = placed; });
  aiState.budget -= item.price;
  return true;
}

function generateArchetypeAIGrid() {
  const styleLibrary = {
    burst: [
      ['bread', 0, 4, 1],
      ['chocolate', 3, 3, 1],
      ['bleach', 2, 2, 0],
      ['toothpaste', 4, 0, 0],
      ['shampoo', 0, 1, 1],
      ['shoes', 2, 0, 0]
    ],
    sustain: [
      ['pillbox', 1, 3, 0],
      ['spam', 0, 0, 0],
      ['jeans', 2, 0, 0],
      ['shoes', 0, 3, 1],
      ['shampoo', 4, 1, 1],
      ['toothpaste', 4, 4, 0],
      ['bleach', 3, 3, 0]
    ],
    premium: [
      ['alcohol', 1, 1, 0],
      ['pan', 0, 0, 0],
      ['bread', 4, 4, 0],
      ['shoes', 3, 0, 1],
      ['toothpaste', 0, 4, 0],
      ['shampoo', 0, 2, 1]
    ]
  };

  const styleNames = Object.keys(styleLibrary);
  const pickedStyle = styleNames[Math.floor(Math.random() * styleNames.length)];
  const aiGrid = Array.from({length: GRID_H}, () => Array(GRID_W).fill(null));
  const aiPlacedItems = [];
  const aiState = { budget: STARTING_BUDGET };

  styleLibrary[pickedStyle].forEach(([id, gx, gy, shapeIdx]) => {
    placeItemOnAIGrid(aiGrid, aiPlacedItems, aiState, id, gx, gy, shapeIdx);
  });

  if (!aiPlacedItems.length) return null;
  return { items: aiPlacedItems, grid: aiGrid, style: pickedStyle };
}

function getItemGuideDefinition(item, bonusText = '') {
  const blank = ['', '', '', '', '', '', '', '', ''];

  const defs = {
    toothpaste: {
      title: 'Synergy Setup',
      subtitle: bonusText || 'Pair with Shampoo for +5 ATK.',
      cells: ['S', '', '', '', 'P', '', '', '', ''],
      marks: { S: 'good' }
    },
    shampoo: {
      title: 'Synergy Core',
      subtitle: bonusText || 'Enable Toothpaste bonus.',
      cells: ['T', '', '', '', 'S', '', '', '', ''],
      marks: { T: 'good' }
    },
    spam: {
      title: 'Placement Zone',
      subtitle: bonusText || 'Keep in bottom rows (4-5).',
      cells: ['', '', '', '', '', '', 'B', 'B', 'B'],
      marks: { B: 'good' }
    },
    chocolate: {
      title: 'Placement Zone',
      subtitle: bonusText || 'Keep in top rows (1-2).',
      cells: ['T', 'T', 'T', '', '', '', '', '', ''],
      marks: { T: 'good' }
    },
    bread: {
      title: 'Order Priority',
      subtitle: bonusText || 'Put Bread in position #1.',
      cells: ['#1', '', '', '', 'B', '', '', '', ''],
      marks: { '#1': 'good' }
    },
    bleach: {
      title: 'Glass Cannon',
      subtitle: bonusText || 'Huge ATK, very fragile HP.',
      cells: ['', '', '', '', '!', '', '', '', ''],
      marks: { '!': 'warn' }
    },
    pan: {
      title: 'Matchup Alert',
      subtitle: bonusText || 'Strong damage but weak vs Shoes/Jeans.',
      cells: ['W', '', 'J', '', 'P', '', '', '', ''],
      marks: { W: 'warn', J: 'warn' }
    },
    pillbox: {
      title: 'Sustain Pattern',
      subtitle: bonusText || 'Kills restore 30% max HP.',
      cells: ['', '+', '', '+', 'P', '+', '', '+', ''],
      marks: { '+': 'good' }
    },
    alcohol: {
      title: 'Space Control',
      subtitle: bonusText || 'Large 3x3 premium unit.',
      cells: ['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X'],
      marks: { X: 'good' }
    },
    jeans: {
      title: 'Synergy Setup',
      subtitle: bonusText || 'Pair with Running Shoes for shield.',
      cells: ['J', '', '', '', 'S', '', '', '', ''],
      marks: { J: 'good' }
    },
    shoes: {
      title: 'Flexible Unit',
      subtitle: bonusText || 'Great cheap filler and Jeans partner.',
      cells: blank,
      marks: {}
    }
  };

  return defs[item.id] || {
    title: 'Placement Hint',
    subtitle: bonusText || item.desc || 'No special setup needed.',
    cells: blank,
    marks: {}
  };
}

function renderItemPopover(item, bonusText = '', isActive = false) {
  const popover = document.getElementById('item-popover');
  const def = getItemGuideDefinition(item, bonusText || item.desc || '');
  const guideCells = def.cells.map(symbol => {
    const level = def.marks[symbol] || 'neutral';
    return `<div class="guide-cell ${level}">${symbol || ''}</div>`;
  }).join('');

  popover.innerHTML = `
    <div class="popover-title">${item.emoji} ${item.name}</div>
    <div class="popover-desc">${def.subtitle}</div>
    <div class="guide-3x3">${guideCells}</div>
    <div class="guide-caption">${def.title}${isActive ? ' - Active' : ''}</div>
  `;
}

const tutorialSteps = [
  {
    id: 'guide_start',
    title: 'Step 1/7 - Guide Flow',
    text: 'This guide has two phases: Shop Flow (pick, rotate, place) then Battle Flow (read rules, fight).',
    target: '.selection-tip',
    validate: () => true
  },
  {
    id: 'pick_rotatable_item',
    title: 'Step 2/7 - Pick A Rotatable Item',
    text: 'Select an item card that shows an R button. Items with R can be rotated.',
    target: '.shop-panel',
    validate: () => !!selectedItem && selectedItem.shapes.length > 1
  },
  {
    id: 'rotate_shape',
    title: 'Step 3/7 - Rotate Shape',
    text: 'Items can be rotated. Press R or click the highlighted R icon 3 times to practice.',
    target: '#shop-list .item-card.selected .rotate-btn',
    extraTargets: ['#shop-list .item-card.selected'],
    validate: () => tutorialRotateAttempts >= 3,
    stepClass: 'tutorial-step-rotate'
  },
  {
    id: 'place_on_grid',
    title: 'Step 4/7 - Place On Grid',
    text: 'Now drag an item from the shop and drop it on the grid.',
    target: '.grid-bg-wrapper',
    validate: () => placedItems.length > 0
  },
  {
    id: 'row_effects',
    title: 'Step 5/7 - Row Effects',
    text: 'Row effects matter. Row 1-2 (top) and Row 4-5 (bottom) can change bonuses and penalties.',
    target: '.row-indicators',
    extraTargets: [
      '.row-indicators .ri:nth-child(1)',
      '.row-indicators .ri:nth-child(2)',
      '.row-indicators .ri:nth-child(3)',
      '.row-indicators .ri:nth-child(4)',
      '.row-indicators .ri:nth-child(5)'
    ],
    validate: () => true,
    stepClass: 'tutorial-step-row-effects'
  },
  {
    id: 'read_rules',
    title: 'Step 6/7 - Read Rules',
    text: 'Check Item Rules here before fighting. They explain row effects and synergies.',
    target: '#shop-list .info-btn',
    validate: () => true,
    stepClass: 'tutorial-step-read-rules'
  },
  {
    id: 'fight',
    title: 'Step 7/7 - Fight',
    text: 'Press FIGHT to start combat. Tutorial ends after battle starts.',
    target: '#btn-fight',
    validate: () => false,
    finalAction: 'start_battle',
    stepClass: 'tutorial-step-fight'
  }
];

function clearTutorialFocus() {
  tutorialFocusedElements.forEach(el => {
    el.classList.remove('tutorial-focus');
    el.style.position = '';
  });
  tutorialFocusedElements = [];
  const spotlight = document.getElementById('tutorial-spotlight');
  if (spotlight) spotlight.style.display = 'none';
  const overlay = document.querySelector('.tutorial-overlay');
  if (overlay) overlay.style.clipPath = 'none';
}

function clearTutorialStepClass() {
  if (tutorialStepBodyClass) {
    document.body.classList.remove(tutorialStepBodyClass);
    tutorialStepBodyClass = '';
  }
}

function setTutorialFocus(step) {
  clearTutorialFocus();
  if (!step) return;

  const selectors = [];
  if (step.target) selectors.push(step.target);
  if (Array.isArray(step.extraTargets)) selectors.push(...step.extraTargets);

  let primaryEl = null;
  selectors.forEach((selector) => {
    if (!selector) return;
    const el = document.querySelector(selector);
    if (!el) return;

    const computed = window.getComputedStyle(el);
    if (computed.position === 'absolute') {
      el.style.position = 'absolute';
    } else {
      el.classList.add('tutorial-focus');
    }
    tutorialFocusedElements.push(el);
    if (!primaryEl) primaryEl = el;
  });

  updateSpotlight();

  const arrow = document.getElementById('tutorial-arrow');
  if (!primaryEl) {
    arrow.style.display = 'none';
    return;
  }

  arrow.style.display = 'block';
  const rect = primaryEl.getBoundingClientRect();
  arrow.style.left = `${Math.max(12, rect.left - 38)}px`;
  arrow.style.top = `${Math.max(16, rect.top + rect.height / 2 - 16)}px`;
}

function updateSpotlight() {
  const spotlight = document.getElementById('tutorial-spotlight');
  const overlay = document.querySelector('.tutorial-overlay');
  if (!spotlight || tutorialFocusedElements.length === 0) {
    if (spotlight) spotlight.style.display = 'none';
    if (overlay) overlay.style.clipPath = 'none';
    return;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  tutorialFocusedElements.forEach(el => {
    const rect = el.getBoundingClientRect();
    minX = Math.min(minX, rect.left);
    minY = Math.min(minY, rect.top);
    maxX = Math.max(maxX, rect.right);
    maxY = Math.max(maxY, rect.bottom);
  });

  const padding = 8;
  const left = minX - padding;
  const top = minY - padding;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;

  spotlight.style.display = 'block';
  spotlight.style.left = `${left}px`;
  spotlight.style.top = `${top}px`;
  spotlight.style.width = `${width}px`;
  spotlight.style.height = `${height}px`;

  if (overlay) {
    overlay.style.clipPath = `polygon(
      0% 0%,
      0% 100%,
      ${left}px 100%,
      ${left}px ${top}px,
      ${left + width}px ${top}px,
      ${left + width}px ${top + height}px,
      ${left}px ${top + height}px,
      ${left}px 100%,
      100% 100%,
      100% 0%
    )`;
  }
}

function renderTutorialStep() {
  const step = tutorialSteps[tutorialStepIndex];
  if (!step) return;

  document.getElementById('tutorial-title').textContent = step.title;
  document.getElementById('tutorial-text').textContent = step.text;
  document.getElementById('tutorial-next-btn').style.display = step.finalAction ? 'none' : 'inline-flex';
  clearTutorialStepClass();
  if (step.stepClass) {
    document.body.classList.add(step.stepClass);
    tutorialStepBodyClass = step.stepClass;
  }
  
  // Selection tip is controlled by CSS based on tutorial-active class
  setTutorialFocus(step);
}

function startTutorialFlow() {
  tutorialActive = true;
  tutorialStepIndex = 0;
  tutorialRotateAttempts = 0;
  clearTutorialStepClass();
  document.body.classList.add('tutorial-active');
  document.getElementById('tutorial-overlay').style.display = 'flex';
  renderTutorialStep();
}

function endTutorialFlow() {
  tutorialActive = false;
  tutorialStepIndex = 0;
  tutorialRotateAttempts = 0;
  clearTutorialFocus();
  clearTutorialStepClass();
  document.body.classList.remove('tutorial-active');
  document.getElementById('tutorial-overlay').style.display = 'none';
}

function advanceTutorialByAction(actionName) {
  if (!tutorialActive) return;
  const step = tutorialSteps[tutorialStepIndex];
  if (!step) return;

  if (step.finalAction && step.finalAction === actionName) {
    endTutorialFlow();
    showOverlay('Guide Complete', 'Nice! You finished the tutorial. Keep battling to improve.');
    setTimeout(() => hideOverlay(), 1800);
    return;
  }

  if (step.validate && step.validate()) {
    tutorialStepIndex = Math.min(tutorialStepIndex + 1, tutorialSteps.length - 1);
    renderTutorialStep();
  }
}

window.nextTutorialStep = function() {
  if (!tutorialActive) return;
  const step = tutorialSteps[tutorialStepIndex];
  if (!step) return;
  
  // Check if step requirement is met - if not, show hint
  if (step.validate && !step.validate()) {
    const hint = document.getElementById('tutorial-hint');
    if (hint) {
      let hintText = '';
      if (step.id === 'pick_rotatable_item') {
        hintText = 'Select an item that can be rotated';
      } else if (step.id === 'rotate_shape') {
        hintText = 'Press R or click rotate 3 times';
      } else if (step.id === 'place_on_grid') {
        hintText = 'Drag an item onto the grid first';
      } else if (step.id === 'pack_box') {
        hintText = 'Fill more cells to prepare';
      } else {
        hintText = 'Follow the step above first';
      }
      hint.textContent = hintText;
      hint.classList.add('show');
      
      // Auto hide after 2.5 seconds
      setTimeout(() => {
        hint.classList.remove('show');
      }, 2500);
    }
    return;
  }
  
  tutorialStepIndex = Math.min(tutorialStepIndex + 1, tutorialSteps.length - 1);
  renderTutorialStep();
};

window.skipTutorial = function() {
  endTutorialFlow();
};

// ????????????????????????????????????????????????????????
//  SCENE FLOW ??A1 Intro, A2 Grid BG, P1 Static BG
// ????????????????????????????????????????????????????????

/** End the A1 intro overlay and reveal the main UI */
function finishIntro() {
  if (introFinished) return;
  introFinished = true;

  const overlay = document.getElementById('intro-overlay');
  const introVideo = document.getElementById('intro-video');

  overlay.classList.add('hidden');
  if (introVideo) introVideo.pause();

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
  fetch('assets/videos/A2GIF_transparent.mp4')
    .then(r => r.blob())
    .then(blob => {
      a2VideoBlob = URL.createObjectURL(blob);
      console.log('[DEBUG] A2 video preloaded:', a2VideoBlob);
    })
    .catch(err => console.error('[DEBUG] A2 preload failed:', err));
}

/** Play A2 video behind the grid; when it ends, switch to the shop background image and fade in UI */
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
        console.log('[DEBUG] end timer: calling showShopBackground and revealShopUI');
        showShopBackground();
        revealShopUI();
        console.log('[DEBUG] end timer done');
      }, videoDuration);
    }).catch((err) => {
      console.error('[DEBUG] video play() rejected:', err);
      showShopBackground();
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
    showShopBackground();
    revealShopUI();
    if (gridWrapper) gridWrapper.classList.add('grid-visible');
  };
}

/** Show the shop's static background and hide A2 video */
function showShopBackground() {
  const video = document.getElementById('grid-bg-video');
  const img = document.getElementById('grid-bg-image');
  if (!video || !img) return;

  console.log('[DEBUG] showShopBackground: hiding video, showing img');
  video.style.display = 'none';
  img.style.display = '';
}

/** Fade in all surrounding UI after the box is shown */
function revealShopUI() {
  const shopPhase = document.getElementById('shop-phase');
  const header = document.getElementById('main-header');
  console.log('[DEBUG] revealShopUI: removing a2-playing class');
  shopPhase.classList.remove('a2-playing');
  header.classList.remove('header-hidden');
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
  if (!introVideo) {
    introFinished = true;
    return;
  }

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

function clearLeaderboardCountdown() {
  if (leaderboardCountdownTimer) {
    clearInterval(leaderboardCountdownTimer);
    leaderboardCountdownTimer = null;
  }
  leaderboardCountdownDeadlineTs = 0;
}

function clearBattleLeaveRecovery() {
  if (battleLeaveRecoveryTimer) {
    clearTimeout(battleLeaveRecoveryTimer);
    battleLeaveRecoveryTimer = null;
  }
}

function scheduleBattleLeaveRecovery() {
  clearBattleLeaveRecovery();
  if (gameStatus !== 'battling' || activeBattleRound !== currentRound || !currentPairing) return;
  if (isPlayerOnline(currentPairing.opponentId)) return;

  battleLeaveRecoveryTimer = setTimeout(() => {
    battleLeaveRecoveryTimer = null;
    if (gameStatus === 'battling' && activeBattleRound === currentRound && currentPairing && !isPlayerOnline(currentPairing.opponentId) && reportedResultRound !== currentRound) {
      reportBattleResult('win');
    }
  }, 6000);
}

function cleanupRoomOnUnload() {
  isLeavingRoom = true;
  clearPrepCountdown();
  clearLeaderboardCountdown();
  clearBattleLeaveRecovery();

  if (channel) {
    try {
      supabase.removeChannel(channel);
    } catch (err) {
      console.warn('Failed to remove realtime channel during unload:', err);
    }
    channel = null;
  }
}

function startLeaderboardCountdown(summaryEl, baseText, totalMs) {
  clearLeaderboardCountdown();
  if (!summaryEl || totalMs <= 0) return;

  leaderboardCountdownDeadlineTs = Date.now() + totalMs;

  const updateCountdown = () => {
    const remainingSec = Math.max(0, Math.ceil((leaderboardCountdownDeadlineTs - Date.now()) / 1000));
    summaryEl.textContent = `${baseText ? `${baseText} ` : ''}Next round in ${remainingSec}s.`;

    if (remainingSec <= 0) {
      clearLeaderboardCountdown();
    }
  };

  updateCountdown();
  leaderboardCountdownTimer = setInterval(updateCountdown, 250);
}

function hideItemPopover() {
  const popover = document.getElementById('item-popover');
  if (!popover) return;
  popover.classList.remove('show');
}

function getPresencePlayers() {
  const players = [];
  for (const key in presenceState) {
    const player = presenceState[key]?.[0];
    if (player) players.push(player);
  }
  return players;
}

function clonePresencePlayer(player) {
  if (!player) return null;

  return {
    ...player,
    record: {
      w: player.record?.w || 0,
      d: player.record?.d || 0,
      l: player.record?.l || 0
    }
  };
}

function getLobbyPlayers() {
  const onlinePlayers = getPresencePlayers().map(clonePresencePlayer).filter(Boolean);
  const takeoverPlayers = Object.values(aiTakeoverSlots)
    .map(clonePresencePlayer)
    .filter(player => player && (!presenceState[player.id] || presenceState[player.id].length === 0));

  return [...onlinePlayers, ...takeoverPlayers].sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
}

function getLobbyDisplayName(player) {
  if (!player) return 'Rival';
  return player.aiControlled ? `AI ${player.name}` : player.name;
}

function isPlayerOnline(playerId) {
  return Array.isArray(presenceState[playerId]) && presenceState[playerId].length > 0;
}

function syncAiTakeoverSlotsFromPresence(players = getPresencePlayers()) {
  const nextSnapshot = {};
  players.forEach(player => {
    nextSnapshot[player.id] = clonePresencePlayer(player);
  });

  for (const previousId of Object.keys(lastPresenceSnapshot)) {
    if (!nextSnapshot[previousId] && lastPresenceSnapshot[previousId]) {
      aiTakeoverSlots[previousId] = {
        ...lastPresenceSnapshot[previousId],
        aiControlled: true
      };
      if (gameStatus === 'battling' && activeBattleRound === currentRound && currentPairing && currentPairing.opponentId === previousId) {
        refreshBattleTakeoverState();
        scheduleBattleLeaveRecovery();
      }
    }
  }

  for (const currentId of Object.keys(nextSnapshot)) {
    if (aiTakeoverSlots[currentId]) {
      delete aiTakeoverSlots[currentId];
    }
  }

  lastPresenceSnapshot = nextSnapshot;
}

function refreshBattleTakeoverState() {
  if (gameStatus !== 'battling' || activeBattleRound !== currentRound || !currentPairing) return;

  const takeoverPlayer = aiTakeoverSlots[currentPairing.opponentId];
  if (!takeoverPlayer) return;

  const takeoverName = getLobbyDisplayName(takeoverPlayer);
  currentPairing.opponentName = takeoverName;

  const participant = tournamentState?.participants?.find(p => p.id === takeoverPlayer.id);
  if (participant) {
    participant.aiControlled = true;
  }

  if (playerName) {
    setBattleParticipantNames(playerName, takeoverName);
  }
}

function syncRoomConfigFromPresence(players = getPresencePlayers()) {
  if (!players.length) return;

  const sorted = [...players].sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
  const adminPresence = sorted[0];
  if (!adminPresence) return;

  const prepDurationSec = PREP_TIME_OPTIONS.includes(adminPresence.prepDurationSec)
    ? adminPresence.prepDurationSec
    : DEFAULT_PREP_TIME_SEC;
  const maxRounds = ROUND_COUNT_OPTIONS.includes(Number(adminPresence.maxRounds))
    ? Number(adminPresence.maxRounds)
    : DEFAULT_MAX_ROUNDS;

  roomConfig = {
    prepDurationSec,
    maxRounds,
    createdBy: adminPresence.roomCreatedBy || adminPresence.id
  };

  updatePrepTimeDisplay();
}

function formatPrepTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function updatePrepTimeDisplay(remainingSec = null) {
  const el = document.getElementById('prep-timer-display');
  if (!el) return;

  if (remainingSec === null) {
    el.textContent = `Prep: ${formatPrepTime(roomConfig.prepDurationSec || DEFAULT_PREP_TIME_SEC)}`;
    return;
  }

  el.textContent = `Prep: ${formatPrepTime(Math.max(0, remainingSec))}`;
}

function setBattleParticipantNames(playerDisplayName, enemyDisplayName) {
  const playerName = (playerDisplayName || 'You').trim();
  const enemyName = (enemyDisplayName || 'Rival').trim();

  const playerHeader = document.querySelector('#team-list-player h4');
  if (playerHeader) playerHeader.textContent = playerName;

  const enemyHeader = document.querySelector('#team-list-enemy h4');
  if (enemyHeader) enemyHeader.textContent = enemyName;

  const playerBoxLabel = document.querySelector('.player-label');
  if (playerBoxLabel) playerBoxLabel.textContent = `${playerName} BOX`;

  const enemyBoxLabel = document.querySelector('.enemy-label');
  if (enemyBoxLabel) enemyBoxLabel.textContent = `${enemyName} BOX`;
}

function clearPrepCountdown() {
  if (prepCountdownTimer) {
    clearInterval(prepCountdownTimer);
    prepCountdownTimer = null;
  }
  clearLeaderboardCountdown();
  prepDeadlineTs = 0;
}

function startPrepCountdown(totalSec) {
  clearPrepCountdown();
  prepDeadlineTs = Date.now() + totalSec * 1000;
  updatePrepTimeDisplay(totalSec);

  prepCountdownTimer = setInterval(() => {
    const remainingSec = Math.max(0, Math.ceil((prepDeadlineTs - Date.now()) / 1000));
    updatePrepTimeDisplay(remainingSec);

    if (remainingSec <= 0) {
      clearPrepCountdown();
      if (!isAIGame && (gameStatus === 'shopping' || gameStatus === 'waiting') && !hasSubmittedThisRound) {
        if (typeof window.startBattle === 'function') {
          window.startBattle();
        }
      }
    }
  }, 250);
}

function buildRoundRobinSchedule(participantIds = [], desiredRounds = null) {
  if (participantIds.length < 2) return [];
  const ids = [...participantIds];
  const cycle = [];
  const roundsCount = ids.length - 1;
  const half = ids.length / 2;

  for (let round = 0; round < roundsCount; round++) {
    const pairings = [];
    for (let i = 0; i < half; i++) {
      const p1 = ids[i];
      const p2 = ids[ids.length - 1 - i];
      pairings.push([p1, p2]);
    }
    cycle.push(pairings);

    const fixed = ids[0];
    const rotating = ids.slice(1);
    rotating.unshift(rotating.pop());
    ids.splice(0, ids.length, fixed, ...rotating);
  }

  if (!desiredRounds || desiredRounds <= cycle.length) {
    return cycle.slice(0, desiredRounds || cycle.length);
  }

  const rounds = [];
  while (rounds.length < desiredRounds) {
    for (const pairings of cycle) {
      rounds.push(pairings.map(match => [...match]));
      if (rounds.length >= desiredRounds) break;
    }
  }

  return rounds;
}

function buildLeaderboardRows() {
  if (!tournamentState?.participants) return [];

  return tournamentState.participants
    .filter(p => !p.hidden)
    .map(p => ({
      id: p.id,
      name: p.aiControlled ? `AI ${p.name}` : p.name,
      score: p.score,
      record: `${p.record.w}-${p.record.d}-${p.record.l}`
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function applyRoundResultToTournament(participantId, result) {
  if (!tournamentState?.participants || !participantId || !result) return;
  const participant = tournamentState.participants.find(p => p.id === participantId);
  if (!participant) return;

  if (result === 'win') {
    participant.score += 3;
    participant.record.w += 1;
  } else if (result === 'draw') {
    participant.score += 2;
    participant.record.d += 1;
  } else {
    participant.score += 1;
    participant.record.l += 1;
  }
}

async function applyAIAutoResult(match) {
  const [p1Id, p2Id] = match;
  const p1Online = isPlayerOnline(p1Id);
  const p2Online = isPlayerOnline(p2Id);

  if (p1Online && p2Online) return;
  if (p1Online !== p2Online) return;

  if (!adminProcessed[p1Id]) {
    const p1Result = 'draw';
    adminProcessed[p1Id] = { result: p1Result };
    applyRoundResultToTournament(p1Id, p1Result);
  }

  if (!adminProcessed[p2Id]) {
    const p2Result = 'draw';
    adminProcessed[p2Id] = { result: p2Result };
    applyRoundResultToTournament(p2Id, p2Result);
  }

  await sendBroadcast('tournament_state', tournamentState);
}

// ????????????????????????????????????????????????????????
//  MULTIPLAYER LOGIC (Supabase Realtime)
// ????????????????????????????????????????????????????????
async function initMultiplayer(roomId) {
  isLeavingRoom = false;
  reconnectInProgress = false;
  reconnectAttempt = 0;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  clearPrepCountdown();

  currentRound = 1;
  gameStatus = 'lobby';
  lastLeaderboardPositions = {};
  matchedRound = null;
  activeBattleRound = null;
  reportedResultRound = null;
  currentPairing = null;

  presenceState = {};
  aiTakeoverSlots = {};
  lastPresenceSnapshot = {};
  adminSubmissions = {};
  adminProcessed = {};
  tournamentState = null;
  hasSubmittedThisRound = false;
  currentPairing = null;

  if (channel) {
    const oldChannel = channel;
    channel = null;
    supabase.removeChannel(oldChannel);
  }

  currentRoomId = roomId;
  switchPhase('lobby');
  updateLobbyUIFromPresence();
  const roundDisplay = document.getElementById('round-display');
  if (roundDisplay) roundDisplay.textContent = `Round 1 / ${roomConfig.maxRounds || DEFAULT_MAX_ROUNDS}`;
  createRoomChannel(roomId, false);
}

function updateLobbyUIFromPresence() {
  const list = document.getElementById('player-list');
  const listTitle = document.getElementById('player-list-title');
  const roomDisplay = document.getElementById('lobby-room-display');
  const startBtn = document.getElementById('btn-start-game');
  
  roomDisplay.textContent = `Room: ${currentRoomId}`;
  list.innerHTML = '';

  const onlinePlayers = getPresencePlayers().sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
  const players = getLobbyPlayers();

  if (listTitle) listTitle.textContent = `Players (${players.length}/${ROOM_MAX_PLAYERS})`;
  list.classList.toggle('compact-grid', players.length > 8);

  if (onlinePlayers.length > 0) {
    isAdmin = onlinePlayers[0].id === myPresenceId;
    players.forEach(p => {
      const li = document.createElement('li');
      li.className = 'player-list-item';
      const isOnline = isPlayerOnline(p.id);
      const displayName = getLobbyDisplayName(p);
      li.innerHTML = `
        <span class="player-name">${displayName} ${isOnline && p.id === onlinePlayers[0].id ? '<span class="admin-badge">(Admin)</span>' : ''}</span>
        ${isOnline && (isAdmin || p.id === myPresenceId) ? `<button class="btn-kick-mini" onclick="kickPlayer('${p.id}')">${p.id === myPresenceId ? 'Leave' : 'Kick'}</button>` : ''}
      `;
      list.appendChild(li);
    });

    const prepSelect = document.getElementById('prep-time-select');
    if (prepSelect) {
      prepSelect.disabled = !isAdmin;
      prepSelect.value = String(roomConfig.prepDurationSec || DEFAULT_PREP_TIME_SEC);
    }

    const roundSelect = document.getElementById('round-count-select');
    if (roundSelect) {
      roundSelect.disabled = !isAdmin;
      roundSelect.value = String(roomConfig.maxRounds || DEFAULT_MAX_ROUNDS);
    }

    startBtn.style.display = isAdmin ? 'inline-block' : 'none';
    startBtn.disabled = players.length < ROOM_MIN_PLAYERS_TO_START;
    document.getElementById('lobby-status').textContent =
      players.length < ROOM_MIN_PLAYERS_TO_START
        ? `Need at least ${ROOM_MIN_PLAYERS_TO_START} players to start (${players.length}/${ROOM_MAX_PLAYERS}).`
        : `Ready to start (${players.length}/${ROOM_MAX_PLAYERS}). Admin can launch now.`;
  } else {
    isAdmin = false;
    startBtn.style.display = 'none';
    startBtn.disabled = true;
    document.getElementById('lobby-status').textContent = 'Waiting for players...';
  }
}

window.kickPlayer = function(targetId) {
  if (targetId === myPresenceId) {
    backToStartMenu();
    return;
  }
  
  if (isAdmin && channel) {
    sendBroadcast('kick', { targetId, message: 'The Admin kicked you from the room.' });
  }
};

async function handleRoundStart(round, maxRounds, prepDurationSec = roomConfig.prepDurationSec) {
  console.log('Starting Round:', round, '/', maxRounds);
  const r = round || 1;
  const m = maxRounds || 5;

  if (r === currentRound && gameStatus !== 'shopping' && gameStatus !== 'lobby') {
    console.log('[DEBUG] Ignoring duplicate round_start for round', r, '(already in gameStatus:', gameStatus + ')');
    return;
  }

  gameStatus = 'shopping';
  currentRound = r;
  hasSubmittedThisRound = false;
  isAdvancingRound = false;
  matchedRound = null;
  activeBattleRound = null;
  reportedResultRound = null;
  currentPairing = null;
  clearBattleLeaveRecovery();

  if (PREP_TIME_OPTIONS.includes(prepDurationSec)) {
    roomConfig.prepDurationSec = prepDurationSec;
  }

  if (isAdmin) {
    adminSubmissions = {};
    adminProcessed = {};
  }

  if (channel && myPresenceId && presenceState[myPresenceId]) {
    const myState = getMyPresenceState();
    myState.submitted = false;
    myState.processedResult = false;
    myState.currentRound = r;

    setTimeout(async () => {
      await safeTrackPresence(myState, 'round start');
    }, 100);
  }

  const display = document.getElementById('round-display');
  if (display) {
    display.textContent = `Round ${r} / ${m}`;
  }

  clearLeaderboardCountdown();
  document.getElementById('leaderboard-overlay').classList.remove('show');
  hideOverlay();
  switchPhase('shopping');
  resetForNewRound();
  startPrepCountdown(roomConfig.prepDurationSec || DEFAULT_PREP_TIME_SEC);
}

function handleBattleStart(data) {
  if (activeBattleRound === currentRound) return;

  // Guard: reject if enemy grid is missing or empty (stale replayed broadcast)
  if (!data.enemyGrid || !Array.isArray(data.enemyGrid) || data.enemyGrid.length === 0) {
    console.warn('[DEBUG] handleBattleStart: rejecting battle_start with empty/missing enemyGrid (stale replay?)');
    return;
  }

  activeBattleRound = currentRound;
  clearBattleLeaveRecovery();
  currentPairing = {
    me: myPresenceId,
    opponentId: data.opponentId || null,
    opponentName: data.enemyName || 'Rival'
  };
  clearPrepCountdown();
  gameStatus = 'battling';
  hideOverlay();
  switchPhase('battle');
  setBattleParticipantNames(playerName, data.enemyName || currentPairing?.opponentName || 'Rival');
  
  import('./battle.js').then(module => {
     module.startMultiplayerBattle(
       placedItems,
       playerGrid,
       data.enemyItems,
       data.enemyGrid,
       async (result) => {
       await reportBattleResult(result);
       },
       playerName,
       data.enemyName || currentPairing?.opponentName || 'Rival'
     );
  });
}

async function reportBattleResult(result) {
  if (reportedResultRound === currentRound) return;

  reportedResultRound = currentRound;
  clearBattleLeaveRecovery();
  console.log('Reporting battle result:', result);
  
  if (isAIGame) {
    handleAIResult(result);
    return;
  }

  await persistHumanBuild(result, 'multiplayer');

  // Multiplayer logic
  const myState = getMyPresenceState();
  myState.processedResult = true;
  myState.submitted = true;

  // Post-round money reward (persistent wallet)
  if (result === 'win') {
    budget += REWARD_WIN;
  } else if (result === 'loss') {
    budget += REWARD_LOSS;
  } else {
    budget += REWARD_DRAW;
  }
  
  console.log('Updating presence result flag');
  await safeTrackPresence(myState, 'battle result');
  
  // Broadcast result to admin so the shared leaderboard stays authoritative.
  await sendBroadcast('processed_result', {
    id: myPresenceId,
    round: currentRound,
    result,
    opponentId: currentPairing?.opponentId || null
  });

  if (isAdmin && currentPairing?.opponentId && !isPlayerOnline(currentPairing.opponentId)) {
    const mirrored = result === 'win' ? 'loss' : result === 'loss' ? 'win' : 'draw';
    if (!adminProcessed[currentPairing.opponentId]) {
      adminProcessed[currentPairing.opponentId] = { result: mirrored };
      applyRoundResultToTournament(currentPairing.opponentId, mirrored);
    }
  }
  
  // IMMEDIATELY mark self as processed if admin (no waiting for broadcast)
  if (isAdmin) {
    adminProcessed[myPresenceId] = true;
    console.log('[DEBUG] Admin marked self as processed immediately');
  }

  // Show a message to wait for other players
  setTimeout(() => {
    // Only show if we are still in the same round and haven't moved to next phase
    if (gameStatus === 'battling' && currentRound === myState.currentRound) {
      gameStatus = 'waiting';
      showOverlay('Round Finished', 'Waiting for your rival to finish their battle...');
    }
  }, 1500); 
  
  // Check locally after a short delay to ensure presence state syncs
  setTimeout(() => {
    if (isAdmin) {
      console.log('[DEBUG] Admin checking round completion after timeout, adminProcessed:', Object.keys(adminProcessed));
    }
    checkRoundCompletion();
  }, 500);
}

function handleBattleBye(message) {
  if (activeBattleRound === currentRound) return;

  activeBattleRound = currentRound;
  showOverlay('Bye Round', message);
  // Auto-win for bye
  reportBattleResult('win');
}

// ????????????????????????????????????????????????????????
//  ADMIN COORDINATION LOGIC
// ????????????????????????????????????????????????????????
async function checkAndMatchPlayers() {
  if (!isAdmin || gameStatus === 'battling' || matchedRound === currentRound || !tournamentState) return;

  const roundMatches = tournamentState.schedule?.[currentRound - 1] || [];
  if (!roundMatches.length) return;

  const everyoneReady = roundMatches.every(([p1Id, p2Id]) => {
    const p1Online = isPlayerOnline(p1Id);
    const p2Online = isPlayerOnline(p2Id);

    const p1Ready = !p1Online || !!adminSubmissions[p1Id];
    const p2Ready = !p2Online || !!adminSubmissions[p2Id];
    return p1Ready && p2Ready;
  });

  if (!everyoneReady) return;

  matchedRound = currentRound;
  gameStatus = 'battling';
  clearPrepCountdown();
  console.log('All round participants are ready (or AI fallback), generating matches...');

  for (const match of roundMatches) {
    const [p1Id, p2Id] = match;
    const p1 = tournamentState.participants.find(p => p.id === p1Id);
    const p2 = tournamentState.participants.find(p => p.id === p2Id);
    if (!p1 || !p2) continue;

    const p1Online = isPlayerOnline(p1Id);
    const p2Online = isPlayerOnline(p2Id);

    if (!p1Online || !p2Online) {
      await applyAIAutoResult(match);
    }

    if (p1Online) {
      const p2Data = adminSubmissions[p2Id] || await generateAIOpponentGrid();
      const b1 = {
        targetId: p1Id,
        opponentId: p2Id,
        enemyName: getLobbyDisplayName(p2),
        enemyItems: p2Data.items || [],
        enemyGrid: p2Data.grid || Array.from({ length: GRID_H }, () => Array(GRID_W).fill(null))
      };
      await sendBroadcast('battle_start', b1);
      if (p1Id === myPresenceId) handleBattleStart(b1);
    }

    if (p2Online) {
      const p1Data = adminSubmissions[p1Id] || await generateAIOpponentGrid();
      const b2 = {
        targetId: p2Id,
        opponentId: p1Id,
        enemyName: getLobbyDisplayName(p1),
        enemyItems: p1Data.items || [],
        enemyGrid: p1Data.grid || Array.from({ length: GRID_H }, () => Array(GRID_W).fill(null))
      };
      await sendBroadcast('battle_start', b2);
      if (p2Id === myPresenceId) handleBattleStart(b2);
    }
  }
}

async function checkRoundCompletion() {
  if (!isAdmin || isAdvancingRound || !tournamentState) return;

  const expectedIds = tournamentState.participants.map(p => p.id);
  const allProcessed = expectedIds.every(id => !!adminProcessed[id]);
  if (allProcessed && expectedIds.length >= 2) {
    isAdvancingRound = true; // Lock to prevent multiple triggers

    const leaderboard = buildLeaderboardRows();
    await sendBroadcast('round_leaderboard', {
      round: currentRound,
      headline: `Round ${currentRound} Leaderboard`,
      leaderboard
    });
    showLeaderboard(leaderboard, { headline: `Round ${currentRound} Leaderboard`, includeMovement: true });

    if (currentRound >= tournamentState.maxRounds) {
      console.log('Tournament over, sending results:', leaderboard);
      await sendBroadcast('tournament_results', { leaderboard });

      // Trigger locally for admin
      gameStatus = 'results';
      showLeaderboard(leaderboard, { headline: 'TOURNAMENT RESULTS', includeMovement: true });

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
      const payload = {
        round: nextR,
        maxRounds: tournamentState.maxRounds,
        prepDurationSec: roomConfig.prepDurationSec
      };

      setTimeout(async () => {
        adminSubmissions = {};
        adminProcessed = {};
        await sendBroadcast('round_start', payload);
        handleRoundStart(payload.round, payload.maxRounds, payload.prepDurationSec);
        setTimeout(() => { isAdvancingRound = false; }, 1200);
      }, ROUND_LEADERBOARD_MS);

      return;
    }

    isAdvancingRound = false;
  }
}

function switchPhase(phase) {
  // Always hide shop popover when leaving/entering phases to avoid UI leaking into battle.
  hideItemPopover();

  document.getElementById('login-phase').style.display = phase === 'login' ? 'flex' : 'none';
  document.getElementById('lobby-phase').style.display = phase === 'lobby' ? 'flex' : 'none';
  document.getElementById('shop-phase').style.display = phase === 'shopping' ? 'grid' : 'none';
  document.getElementById('battle-phase').style.display = phase === 'battle' ? 'block' : 'none';

  if (phase === 'battle') {
    window.scrollTo(0, 0);
  }

  // Scene flow: when entering the shop phase, play A2 behind the grid
  if (phase === 'shopping') {
    const gridWrapper = document.querySelector('.grid-bg-wrapper');
    if (!a2HasPlayed) {
      playGridOpeningVideo();
    } else {
      // Already played A2 before (e.g. round 2+), show P1 directly and UI immediately
      showShopBackground();
      if (gridWrapper) gridWrapper.classList.add('grid-visible');
      document.getElementById('shop-phase').classList.remove('a2-playing');
      document.getElementById('main-header').classList.remove('header-hidden');
    }
  }
}

function updateLobbyUI(players) {
  const list = document.getElementById('player-list');
  const listTitle = document.getElementById('player-list-title');
  const roomDisplay = document.getElementById('lobby-room-display');
  const startBtn = document.getElementById('btn-start-game');
  
  roomDisplay.textContent = `Room: ${currentRoomId}`;
  list.innerHTML = '';
  if (listTitle) listTitle.textContent = `Players (${players.length}/${ROOM_MAX_PLAYERS})`;
  list.classList.toggle('compact-grid', players.length > 8);
  
  let isAdminLocal = false;
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name + (p.isAdmin ? ' (Admin)' : '');
    list.appendChild(li);
    if (p.id === myPresenceId && p.isAdmin) isAdminLocal = true;
  });

  startBtn.style.display = isAdminLocal ? 'inline-block' : 'none';
  startBtn.disabled = players.length < ROOM_MIN_PLAYERS_TO_START;
  document.getElementById('lobby-status').textContent =
    players.length < ROOM_MIN_PLAYERS_TO_START
      ? `Need at least ${ROOM_MIN_PLAYERS_TO_START} players to start (${players.length}/${ROOM_MAX_PLAYERS}).`
      : `Ready to start (${players.length}/${ROOM_MAX_PLAYERS}).`;
}

// ????????????????????????????????????????????????????????
//  ROUND RESET ??Items stay on grid, wallet persists
// ????????????????????????????????????????????????????????
function resetForNewRound() {
  // Items stay on grid between rounds
  // Budget persists ??NOT reset here
  
  // Restock shop with new random offerings
  restockShop();

  selectedItem = null;
  selectedShapeIdx = 0;
  lastHoverGx = -1;
  lastHoverGy = -1;

  renderShop();
  renderGrid();
  renderRules();
  updateStats();
  updateBudgetDisplay();

  // Update restock button state
  const restockBtn = document.getElementById('btn-restock');
  if (restockBtn) restockBtn.disabled = budget < RESTOCK_COST;
}

function showLeaderboard(data, options = {}) {
  hideOverlay();
  const overlay = document.getElementById('leaderboard-overlay');
  const title = document.getElementById('leaderboard-title');
  const summary = document.getElementById('leaderboard-summary');
  const body = document.getElementById('leaderboard-body');
  const headline = options.headline || 'TOURNAMENT RESULTS';
  const includeMovement = !!options.includeMovement;
  const autoAdvanceMs = Number(options.autoAdvanceMs || 0);

  if (title) title.textContent = headline;
  body.innerHTML = '';

  const playerIndex = data.findIndex(entry => entry.name === playerName);
  const baseSummary = playerIndex >= 0
    ? `You are #${playerIndex + 1} with ${data[playerIndex].score} points.`
    : '';
  if (summary) {
    summary.textContent = baseSummary;
  }

  if (autoAdvanceMs > 0) {
    startLeaderboardCountdown(summary, baseSummary, autoAdvanceMs);
  } else {
    clearLeaderboardCountdown();
  }
  
  data.forEach((entry, idx) => {
    const previousPos = lastLeaderboardPositions[entry.name];
    let movementClass = '';

    if (includeMovement && typeof previousPos === 'number') {
      if (idx < previousPos) movementClass = 'rank-up';
      else if (idx > previousPos) movementClass = 'rank-down';
    }

    lastLeaderboardPositions[entry.name] = idx;

    const row = document.createElement('tr');
    row.className = movementClass;
    if (entry.name === playerName) row.classList.add('self-row');

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

// ?? Global Functions ??
window.joinRoom = function() {
  const nameInput = document.getElementById('player-name-input');
  const roomInput = document.getElementById('room-id-input');
  playerName = nameInput.value.trim();
  const nextRoomId = roomInput.value.trim().toUpperCase();
  
  if (!playerName || !nextRoomId) {
    alert('Please enter both name and Room ID');
    return;
  }

  pendingCreateConfig = null;
  roomConfig = {
    prepDurationSec: DEFAULT_PREP_TIME_SEC,
    maxRounds: DEFAULT_MAX_ROUNDS,
    createdBy: null
  };
  
  initMultiplayer(nextRoomId);
};

window.createRoom = function() {
  const nameInput = document.getElementById('player-name-input');
  const roomInput = document.getElementById('room-id-input');

  playerName = nameInput.value.trim();
  if (!playerName) {
    alert('Please enter your name first.');
    return;
  }

  const generated = roomInput.value.trim().toUpperCase() || Math.random().toString(36).slice(2, 8).toUpperCase();
  roomInput.value = generated;

  const prepDurationSec = DEFAULT_PREP_TIME_SEC;
  const maxRounds = DEFAULT_MAX_ROUNDS;

  pendingCreateConfig = { prepDurationSec, maxRounds };
  roomConfig = { prepDurationSec, maxRounds, createdBy: null };
  initMultiplayer(generated);
};

window.changePrepTime = async function() {
  if (!isAdmin || !channel) return;
  const prepSelect = document.getElementById('prep-time-select');
  const selected = Number(prepSelect?.value || DEFAULT_PREP_TIME_SEC);
  if (!PREP_TIME_OPTIONS.includes(selected)) return;

  roomConfig = {
    prepDurationSec: selected,
    maxRounds: roomConfig.maxRounds || DEFAULT_MAX_ROUNDS,
    createdBy: roomConfig.createdBy || myPresenceId
  };

  const state = getMyPresenceState();
  state.prepDurationSec = selected;
  await safeTrackPresence(state, 'update prep time');

  await sendBroadcast('room_config', {
    prepDurationSec: selected,
    maxRounds: roomConfig.maxRounds || DEFAULT_MAX_ROUNDS,
    createdBy: roomConfig.createdBy || myPresenceId
  });
  updatePrepTimeDisplay();
};

window.changeRoundCount = async function() {
  if (!isAdmin || !channel) return;
  const roundSelect = document.getElementById('round-count-select');
  const selected = Number(roundSelect?.value || DEFAULT_MAX_ROUNDS);
  if (!ROUND_COUNT_OPTIONS.includes(selected)) return;

  roomConfig = {
    prepDurationSec: roomConfig.prepDurationSec || DEFAULT_PREP_TIME_SEC,
    maxRounds: selected,
    createdBy: roomConfig.createdBy || myPresenceId
  };

  const state = getMyPresenceState();
  state.maxRounds = selected;
  await safeTrackPresence(state, 'update round count');

  await sendBroadcast('room_config', {
    prepDurationSec: roomConfig.prepDurationSec || DEFAULT_PREP_TIME_SEC,
    maxRounds: selected,
    createdBy: roomConfig.createdBy || myPresenceId
  });
};

function beginAIGame({ tutorial = false } = {}) {
  const nameInput = document.getElementById('player-name-input');
  playerName = nameInput.value.trim() || 'You';
  isAIGame = true;
  tutorialMode = tutorial;
  gameStatus = 'shopping';
  currentRound = 1;
  budget = STARTING_BUDGET;
  previousBudget = STARTING_BUDGET;
  tournamentScores = { player: 0, rival: 0, record: { w: 0, d: 0, l: 0 } };
  opLog = [];
  
  document.getElementById('round-display').textContent = `Round 1 / 5`;
  switchPhase('shopping');
  resetForNewRound();

  if (tutorialMode) {
    localStorage.setItem(GUIDE_KEY, '1');
    setTimeout(() => startTutorialFlow(), 900);
  }
}

window.startAIGame = function() {
  const seenGuide = localStorage.getItem(GUIDE_KEY) === '1';
  beginAIGame({ tutorial: !seenGuide });
};

window.startTutorialMode = function() {
  beginAIGame({ tutorial: true });
};

window.requestStartGame = async function() {
  if (isAdmin && channel) {
    const players = getLobbyPlayers();
    if (players.length < ROOM_MIN_PLAYERS_TO_START) {
      alert(`Need at least ${ROOM_MIN_PLAYERS_TO_START} players to start.`);
      return;
    }

    const participants = players.map(p => ({
      id: p.id,
      name: p.name,
      score: 0,
      record: { w: 0, d: 0, l: 0 },
      hidden: false,
      aiControlled: !!p.aiControlled,
      joinedAt: p.joinedAt
    }));

    if (participants.length % 2 === 1) {
      participants.push({
        id: `ai-hidden-${Date.now()}`,
        name: 'Hidden AI',
        score: 0,
        record: { w: 0, d: 0, l: 0 },
        hidden: true,
        aiControlled: true,
        joinedAt: new Date().toISOString()
      });
    }

    const selectedMaxRounds = ROUND_COUNT_OPTIONS.includes(Number(roomConfig.maxRounds))
      ? Number(roomConfig.maxRounds)
      : DEFAULT_MAX_ROUNDS;
    const schedule = buildRoundRobinSchedule(participants.map(p => p.id), selectedMaxRounds);
    tournamentState = {
      roomId: currentRoomId,
      participants,
      schedule,
      maxRounds: selectedMaxRounds
    };

    await sendBroadcast('tournament_state', tournamentState);

    const payload = {
      round: 1,
      maxRounds: tournamentState.maxRounds,
      prepDurationSec: roomConfig.prepDurationSec || DEFAULT_PREP_TIME_SEC
    };
    // Broadcast to others
    await sendBroadcast('round_start', payload);
    // Trigger locally for the admin
    handleRoundStart(payload.round, payload.maxRounds, payload.prepDurationSec);
  }
};

window.backToLobby = function() {
  clearLeaderboardCountdown();
  clearBattleLeaveRecovery();
  document.getElementById('leaderboard-overlay').classList.remove('show');
  hideOverlay();
  if (isAIGame) {
    switchPhase('login');
  } else {
    switchPhase('lobby');
  }
};

window.backToStartMenu = function(force = false) {
  if (force || confirm('Are you sure you want to leave the current game?')) {
    isLeavingRoom = true;
    reconnectInProgress = false;
    clearPrepCountdown();
    clearLeaderboardCountdown();
    clearBattleLeaveRecovery();
    hasSubmittedThisRound = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
    presenceState = {};
    adminSubmissions = {};
    adminProcessed = {};
    tournamentState = null;
    currentPairing = null;
    currentRoomId = null;
    init();
  }
};

// ????????????????????????????????????????????????????????
//  AI LOGIC
// ????????????????????????????????????????????????????????
function generateAIGrid() {
  const aiGrid = Array.from({length: GRID_H}, () => Array(GRID_W).fill(null));
  const aiPlacedItems = [];
  let aiBudget = STARTING_BUDGET;
  let attempts = 0;
  
  // Simple AI: try to place random items until budget is low or too many attempts
  while (aiBudget > 0 && attempts < 80) {
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

async function generateHumanStyleAIGrid() {
  const pool = await fetchHumanBuildsForAI();
  const picked = pickHumanStyleBuild(pool);
  if (!picked) return null;

  const built = buildFromSerializedItems(picked.items);
  if (!built.items.length) return null;
  return { ...built, source: 'human' };
}

async function generateAIOpponentGrid() {
  const humanPool = await fetchHumanBuildsForAI();

  for (let tries = 0; tries < 5; tries++) {
    let candidate = null;
    const roll = Math.random();

    if (humanPool.length >= 3 && roll < 0.5) {
      const picked = pickHumanStyleBuild(humanPool);
      if (picked) {
        const built = buildFromSerializedItems(picked.items);
        if (built.items.length) candidate = { ...built, source: 'human' };
      }
    } else if (roll < 0.85) {
      candidate = generateArchetypeAIGrid();
    } else {
      candidate = { ...generateAIGrid(), source: 'random' };
    }

    if (!candidate || !candidate.items.length) continue;

    const signature = getBuildSignature(serializePlacedItems(candidate.items));
    if (signature === lastAIBuildSignature && tries < 4) continue;

    lastAIBuildSignature = signature;
    return { items: candidate.items, grid: candidate.grid };
  }

  const fallback = generateAIGrid();
  lastAIBuildSignature = getBuildSignature(serializePlacedItems(fallback.items));
  return fallback;
}

function handleAIResult(result) {
  persistHumanBuild(result, 'ai');

  if (result === 'win') {
    tournamentScores.player += 3;
    tournamentScores.record.w++;
    budget += REWARD_WIN;
  } else if (result === 'draw') {
    tournamentScores.player += 2;
    tournamentScores.rival += 2;
    tournamentScores.record.d++;
    budget += REWARD_DRAW;
  } else {
    tournamentScores.rival += 3;
    tournamentScores.record.l++;
    budget += REWARD_LOSS;
  }
  
  setTimeout(() => {
    if (currentRound >= 5) {
      const leaderboard = [
        { name: playerName, score: tournamentScores.player, record: `${tournamentScores.record.w}-${tournamentScores.record.d}-${tournamentScores.record.l}` },
        { name: 'AI Rival', score: tournamentScores.rival, record: `${tournamentScores.record.l}-${tournamentScores.record.d}-${tournamentScores.record.w}` }
      ].sort((a, b) => b.score - a.score);
      hideOverlay();
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

// ????????????????????????????????????????????????????????
//  SHOP RENDERING
// ????????????????????????????????????????????????????????
function renderShop() {
  const container = document.getElementById('shop-list');
  container.innerHTML = '';
  shopOfferings.forEach(item => {
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
      renderItemPopover(item, item.desc || 'No special effects.', false);
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

    // Rotate button (only for items with >1 shape)
    if (item.shapes.length > 1) {
      const rotateBtn = document.createElement('button');
      rotateBtn.className = 'rotate-btn';
      rotateBtn.textContent = 'R';
      rotateBtn.title = 'Rotate shape';
      rotateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectedItem && selectedItem.id === item.id) {
          selectedShapeIdx = (selectedShapeIdx + 1) % selectedItem.shapes.length;
          if (tutorialActive) {
            const step = tutorialSteps[tutorialStepIndex];
            if (step && step.id === 'rotate_shape') {
              tutorialRotateAttempts += 1;
            }
          }
          renderShop();
          if (lastHoverGx >= 0 && lastHoverGy >= 0) updateHoverPreview(lastHoverGx, lastHoverGy);
          advanceTutorialByAction('rotate_item');
          if (tutorialActive) {
            const currentStep = tutorialSteps[tutorialStepIndex];
            if (currentStep) setTutorialFocus(currentStep);
          }
        }
      });
      card.appendChild(rotateBtn);
    }

    card.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.info-btn') || e.target.closest('.rotate-btn')) return;
      beginShopItemDrag(e, item);
    });
    container.appendChild(card);
  });

  // Update budget display with animation
  updateBudgetDisplay();

  // Update restock button state
  const restockBtn = document.getElementById('btn-restock');
  if (restockBtn) restockBtn.disabled = budget < RESTOCK_COST;
}

function selectItem(item) {
  if (movingItemState) {
    cancelMovingPlacement(true);
  }
  if (item.price > budget) return;
  if (selectedItem && selectedItem.id === item.id) {
    selectedItem = null;
    selectedShapeIdx = 0;
  } else {
    selectedItem = item;
    selectedShapeIdx = 0;
    recordOperation('select_item', { itemId: item.id });
  }
  renderShop();
  advanceTutorialByAction('select_item');
}

function clearGridDragListeners() {
  window.removeEventListener('pointermove', onGridDragMove);
  window.removeEventListener('pointerup', onGridDragEnd);
  window.removeEventListener('pointercancel', onGridDragEnd);
}

function resetGridDragState() {
  clearGridDragListeners();
  if (gridDragState?.ghostEl?.parentNode) {
    gridDragState.ghostEl.parentNode.removeChild(gridDragState.ghostEl);
  }
  gridDragState = null;
}

function createGridDragGhost(item) {
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.innerHTML = item.image
    ? `<img src="${item.image}" alt="${item.name}">`
    : `<span>${item.emoji}</span>`;
  document.body.appendChild(ghost);
  return ghost;
}

function updateGridDragHoverFromPoint(clientX, clientY) {
  if (!gridDragState || !selectedItem) return;

  const target = document.elementFromPoint(clientX, clientY)?.closest('#player-grid .cell[data-x]');
  if (!target) {
    gridDragState.dropTarget = null;
    lastHoverGx = -1;
    lastHoverGy = -1;
    clearHoverPreview();
    return;
  }

  const gx = Number(target.dataset.x);
  const gy = Number(target.dataset.y);
  if (Number.isNaN(gx) || Number.isNaN(gy)) {
    gridDragState.dropTarget = null;
    clearHoverPreview();
    return;
  }

  const shape = selectedItem.shapes[selectedShapeIdx];
  const cells = shape.map(([dx, dy]) => ({ x: gx + dx, y: gy + dy }));
  const valid = cells.every(c =>
    c.x >= 0 && c.x < GRID_W && c.y >= 0 && c.y < GRID_H && !playerGrid[c.y][c.x]
  );

  gridDragState.dropTarget = { gx, gy, valid };
  if (gx !== lastHoverGx || gy !== lastHoverGy) {
    lastHoverGx = gx;
    lastHoverGy = gy;
    updateHoverPreview(gx, gy);
  }
}

function onGridDragMove(e) {
  if (!gridDragState) return;

  const dx = e.clientX - gridDragState.startX;
  const dy = e.clientY - gridDragState.startY;
  const dragDistance = Math.hypot(dx, dy);

  if (!gridDragState.active) {
    if (dragDistance < 8) return;

    gridDragState.active = true;

    if (gridDragState.source === 'shop') {
      const sameItemSelected = selectedItem && selectedItem.id === gridDragState.item.id;
      gridDragState.previousSelection = {
        item: selectedItem,
        shapeIdx: selectedShapeIdx
      };
      selectedItem = gridDragState.item;
      selectedShapeIdx = sameItemSelected ? selectedShapeIdx : 0;
      renderShop();
    } else if (gridDragState.source === 'grid') {
      if (!movingItemState) {
        startMovingPlacedItem(gridDragState.occupant);
      }
    }

    gridDragState.ghostEl = createGridDragGhost(gridDragState.item);
  }

  if (gridDragState.ghostEl) {
    // Touch-friendly offset: raise ghost above finger to prevent occlusion
    const isTouch = e.pointerType === 'touch';
    const touchOffsetY = isTouch ? -80 : 14; // Raise ghost 80px above finger on touch
    gridDragState.ghostEl.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + touchOffsetY}px)`;
  }

  updateGridDragHoverFromPoint(e.clientX, e.clientY);
}

function onGridDragEnd() {
  if (!gridDragState) return;

  const state = gridDragState;
  const wasActive = state.active;
  const dropTarget = state.dropTarget;
  resetGridDragState();

  if (!wasActive) {
    if (state.source === 'shop' && state.item.price <= budget) {
      selectItem(state.item);
    }
    return;
  }

  clearHoverPreview();
  lastHoverGx = -1;
  lastHoverGy = -1;

  if (dropTarget?.valid) {
    suppressGridClickUntil = Date.now() + 200;
    onCellClick(dropTarget.gx, dropTarget.gy);
    return;
  }

  if (state.source === 'grid') {
    cancelMovingPlacement(true);
    return;
  }

  if (state.source === 'shop') {
    selectedItem = state.previousSelection?.item || null;
    selectedShapeIdx = state.previousSelection?.shapeIdx || 0;
    renderShop();
  }
}

function beginShopItemDrag(e, item) {
  if (dndState.draggingEl || gridDragState || e.button !== 0) return;
  if (item.price > budget) return;

  e.preventDefault();

  gridDragState = {
    source: 'shop',
    item,
    occupant: null,
    startX: e.clientX,
    startY: e.clientY,
    active: false,
    dropTarget: null,
    ghostEl: null,
    previousSelection: null
  };

  window.addEventListener('pointermove', onGridDragMove);
  window.addEventListener('pointerup', onGridDragEnd);
  window.addEventListener('pointercancel', onGridDragEnd);
}

function beginGridItemDrag(e, occupant) {
  if (dndState.draggingEl || gridDragState || e.button !== 0) return;
  if (selectedItem || movingItemState) return;

  e.preventDefault();

  gridDragState = {
    source: 'grid',
    item: occupant.item,
    occupant,
    startX: e.clientX,
    startY: e.clientY,
    active: false,
    dropTarget: null,
    ghostEl: null,
    previousSelection: null
  };

  window.addEventListener('pointermove', onGridDragMove);
  window.addEventListener('pointerup', onGridDragEnd);
  window.addEventListener('pointercancel', onGridDragEnd);
}

// ????????????????????????????????????????????????????????
//  SHIP STORAGE RENDERING
// ????????????????????????????????????????????????????????
//  RULES PANEL
// ????????????????????????????????????????????????????????
//  RULES PANEL
// ????????????????????????????????????????????????????????
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
        ${placed ? (isActive ? ' <span style="color:#4ecca3">??/span>' : '') : ''}
        </span>
      `;
      container.appendChild(row);
    });
  });
}

// ????????????????????????????????????????????????????????
//  GRID ??stable DOM
// ????????????????????????????????????????????????????????
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
  grid.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.cell[data-x]');
    if (!t) return;
    const gx = parseInt(t.dataset.x, 10);
    const gy = parseInt(t.dataset.y, 10);
    const occupant = playerGrid[gy][gx];
    if (!occupant) return;
    beginGridItemDrag(e, occupant);
  });
  grid.addEventListener('click', (e) => {
    if (Date.now() < suppressGridClickUntil) return;
    const t = e.target.closest('.cell[data-x]');
    if (!t) return;
    onCellClick(parseInt(t.dataset.x), parseInt(t.dataset.y));
  });
  grid.addEventListener('contextmenu', (e) => {
    const t = e.target.closest('.cell[data-x]');
    if (!t) return;
    const gx = parseInt(t.dataset.x), gy = parseInt(t.dataset.y);
    const occupant = playerGrid[gy][gx];
    if (occupant) { e.preventDefault(); removeItemFromGrid(occupant.placedId); }
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

// ????????????????????????????????????????????????????????
//  DRAG AND DROP ??Extended for storage + sell box
// ????????????????????????????????????????????????????????
let dndState = {
  draggingEl: null,
  ghostEl: null,
  placeholder: null,
  dragOffset: { x: 0, y: 0 },
  dragSource: null,    // 'placed'
  dragItemData: null   // the placed item data
};

function handlePointerMove(e) {
  if (!dndState.draggingEl || !dndState.ghostEl) return;
  
  const x = e.clientX - dndState.dragOffset.x;
  const y = e.clientY - dndState.dragOffset.y;
  dndState.ghostEl.style.transform = `translate(${x}px, ${y}px) scale(0.95)`;

  // Check drop targets for visual feedback
  const sellBox = document.getElementById('sell-box');
  const sellRect = sellBox.getBoundingClientRect();

  const overSellBox = e.clientX >= sellRect.left && e.clientX <= sellRect.right &&
                      e.clientY >= sellRect.top && e.clientY <= sellRect.bottom;

  // Update sell box visual feedback  
  if (overSellBox && dndState.dragSource === 'placed') {
    sellBox.classList.add('drop-hover');
  } else {
    sellBox.classList.remove('drop-hover');
  }

  // If dragging within placed items list, do reorder logic
  if (dndState.dragSource === 'placed' && !overSellBox) {
    const listEl = document.getElementById('placed-items-list');
    const siblings = Array.from(listEl.querySelectorAll('.placed-item-tag:not(.placeholder)'))
      .filter(el => el !== dndState.draggingEl && el.style.display !== 'none');

    if (siblings.length === 0) return;

    let closestSibling = null;
    let minDistance = Infinity;

    siblings.forEach(sibling => {
      const rect = sibling.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const midY = rect.top + rect.height / 2;
      
      const dx = e.clientX - midX;
      const dy = e.clientY - midY;
      
      const distance = dx * dx + (dy * dy * 4);
      
      if (distance < minDistance) {
        minDistance = distance;
        closestSibling = sibling;
      }
    });

    if (closestSibling && dndState.placeholder) {
      const rect = closestSibling.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      
      if (e.clientX > midX) {
        if (dndState.placeholder !== closestSibling.nextSibling) {
          listEl.insertBefore(dndState.placeholder, closestSibling.nextSibling);
        }
      } else {
        if (dndState.placeholder !== closestSibling) {
          listEl.insertBefore(dndState.placeholder, closestSibling);
        }
      }
    }
  }
}

function handlePointerUp(e) {
  if (!dndState.draggingEl) return;
  
  const sellBox = document.getElementById('sell-box');
  const sellRect = sellBox.getBoundingClientRect();

  const overSellBox = e.clientX >= sellRect.left && e.clientX <= sellRect.right &&
                      e.clientY >= sellRect.top && e.clientY <= sellRect.bottom;

  // Clean up visual feedback
  sellBox.classList.remove('drop-hover');

  if (dndState.ghostEl && dndState.ghostEl.parentNode) {
    dndState.ghostEl.parentNode.removeChild(dndState.ghostEl);
  }

  if (dndState.dragSource === 'placed') {
    const listEl = document.getElementById('placed-items-list');
    const piData = dndState.dragItemData;

    if (overSellBox && piData) {
      // SELL: 50% refund
      recordOperation('sell_item_drag', { itemId: piData.item.id, placedId: piData.placedId });
      const refund = piData.item.price * SELL_REFUND_RATE;
      piData.cells.forEach(c => { playerGrid[c.y][c.x] = null; });
      budget += refund;
      const idx = placedItems.findIndex(p => p.placedId === piData.placedId);
      if (idx !== -1) placedItems.splice(idx, 1);

      // Clean up drag elements
      if (dndState.placeholder && dndState.placeholder.parentNode) {
        dndState.placeholder.remove();
      }
      if (dndState.draggingEl && dndState.draggingEl.parentNode) {
        dndState.draggingEl.remove();
      }

      renderShop();
      renderGrid();
      renderRules();
      updateStats();
      updateBudgetDisplay();
    } else {
      // REORDER: default behavior
      if (dndState.placeholder && dndState.placeholder.parentNode === listEl) {
        listEl.insertBefore(dndState.draggingEl, dndState.placeholder);
        dndState.placeholder.parentNode.removeChild(dndState.placeholder);
      }
      
      dndState.draggingEl.style.display = '';
      dndState.draggingEl.classList.remove('dragging');
      
      const newOrderIds = Array.from(listEl.querySelectorAll('.placed-item-tag:not(.placeholder)'))
        .map(el => parseInt(el.dataset.id));
      placedItems = newOrderIds.map(id => placedItems.find(p => p.placedId === id)).filter(Boolean);
      recordOperation('reorder_items', { order: placedItems.map(p => p.item.id) });
      
      renderPlacedItemsList();
      renderGrid();
    }
  } else if (dndState.dragSource === 'storage') {
    // Storage no longer exists, just re-render (shouldn't happen now)
  }

  dndState = { draggingEl: null, ghostEl: null, placeholder: null, dragOffset: { x: 0, y: 0 }, dragSource: null, dragItemData: null };
  
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('pointerup', handlePointerUp);
}

function startStorageDrag(e, tag, storageIdx) {
  tag.setPointerCapture(e.pointerId);
  const rect = tag.getBoundingClientRect();
  dndState.dragOffset = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
  dndState.draggingEl = tag;
  dndState.dragSource = 'storage';
  dndState.dragItemData = storageIdx;

  dndState.ghostEl = tag.cloneNode(true);
  dndState.ghostEl.style.position = 'fixed';
  dndState.ghostEl.style.top = '0px';
  dndState.ghostEl.style.left = '0px';
  dndState.ghostEl.style.width = `${rect.width}px`;
  dndState.ghostEl.style.height = `${rect.height}px`;
  dndState.ghostEl.style.margin = '0';
  dndState.ghostEl.style.pointerEvents = 'none';
  dndState.ghostEl.style.zIndex = '9999';
  dndState.ghostEl.style.opacity = '0.85';
  dndState.ghostEl.style.boxShadow = '0 12px 24px rgba(0,0,0,0.3)';
  dndState.ghostEl.style.transition = 'none';
  dndState.ghostEl.style.transformOrigin = 'top left';

  const initX = e.clientX - dndState.dragOffset.x;
  const initY = e.clientY - dndState.dragOffset.y;
  dndState.ghostEl.style.transform = `translate(${initX}px, ${initY}px) scale(0.95)`;

  document.body.appendChild(dndState.ghostEl);

  tag.style.opacity = '0.3';

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', (e2) => {
    tag.style.opacity = '';
    handlePointerUp(e2);
  }, { once: true });
}

function renderPlacedItemsList() {
  const listEl = document.getElementById('placed-items-list');
  listEl.innerHTML = '';

  placedItems.forEach((pi, idx) => {
    const m = checkMechanic(pi, placedItems, playerGrid);
    const bonusText = m.text;
    const tag = document.createElement('div');
    tag.className = 'placed-item-tag';
    tag.dataset.id = pi.placedId;
    tag.dataset.idx = idx;

    if (m.active && bonusText && bonusText !== pi.item.mechanic?.badLabel) {
      tag.classList.add('has-bonus');
    }

    if (bonusText) {
      tag.title = bonusText;
    }

    // No X button ??drag to storage/sell instead
    tag.innerHTML = `
      <span class="order-badge">${idx + 1}</span>
      <span class="item-emoji">
        ${pi.item.image ? `<img src="${pi.item.image}" alt="${pi.item.name}" style="height:24px; width:24px; object-fit:contain;" draggable="false">` : pi.item.emoji}
      </span>
      <div class="info-btn">i</div>
    `;

    tag.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.info-btn')) return;
      
      e.preventDefault();
      tag.setPointerCapture(e.pointerId);

      const rect = tag.getBoundingClientRect();
      dndState.dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };

      dndState.draggingEl = tag;
      dndState.dragSource = 'placed';
      dndState.dragItemData = pi;
      tag.classList.add('dragging');
      
      dndState.ghostEl = tag.cloneNode(true);
      dndState.ghostEl.style.position = 'fixed';
      dndState.ghostEl.style.top = '0px';
      dndState.ghostEl.style.left = '0px';
      dndState.ghostEl.style.width = `${rect.width}px`;
      dndState.ghostEl.style.height = `${rect.height}px`;
      dndState.ghostEl.style.margin = '0';
      dndState.ghostEl.style.pointerEvents = 'none';
      dndState.ghostEl.style.zIndex = '9999';
      dndState.ghostEl.style.opacity = '0.85';
      dndState.ghostEl.style.boxShadow = '0 12px 24px rgba(0,0,0,0.3)';
      dndState.ghostEl.style.transition = 'none';
      dndState.ghostEl.style.transformOrigin = 'top left';
      dndState.ghostEl.classList.remove('dragging');
      
      const initX = e.clientX - dndState.dragOffset.x;
      const initY = e.clientY - dndState.dragOffset.y;
      dndState.ghostEl.style.transform = `translate(${initX}px, ${initY}px) scale(0.95)`;
      
      document.body.appendChild(dndState.ghostEl);

      dndState.placeholder = document.createElement('div');
      dndState.placeholder.className = 'placed-item-tag placeholder';
      dndState.placeholder.style.width = `${rect.width}px`;
      dndState.placeholder.style.height = `${rect.height}px`;
      dndState.placeholder.style.border = '2px dashed #aaa';
      dndState.placeholder.style.background = 'transparent';
      dndState.placeholder.style.opacity = '0.3';
      
      tag.style.display = 'none';
      listEl.insertBefore(dndState.placeholder, tag);

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    });

    listEl.appendChild(tag);
  });

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
    renderItemPopover(pi.item, bonusText || 'No active bonus.', !!m.active);
    const rect = infoBtn.getBoundingClientRect();
    popover.style.left = (rect.left - 210) + 'px';
    popover.style.top = (rect.top - 40) + 'px';
    popover.classList.add('show');
  };

  listEl.onmouseout = (e) => {
    const infoBtn = e.target.closest('.info-btn');
    if (infoBtn) document.getElementById('item-popover').classList.remove('show');
  };
}

// ????????????????????????????????????????????????????????
//  ITEM MANAGEMENT ??Remove / Store / Sell
// ????????????????????????????????????????????????????????

/** Remove item from grid and sell for 50% refund */
function removeItemFromGrid(placedId) {
  const idx = placedItems.findIndex(p => p.placedId === placedId);
  if (idx === -1) return;
  const pi = placedItems[idx];
  recordOperation('remove_item', { itemId: pi.item.id, placedId });
  pi.cells.forEach(c => { playerGrid[c.y][c.x] = null; });
  budget += pi.item.price * SELL_REFUND_RATE;
  placedItems.splice(idx, 1);
  renderShop();
  renderGrid();
  renderRules();
  updateStats();
  updateBudgetDisplay();
}

/** Sell item ??50% refund */
function sellItem(placedId) {
  const idx = placedItems.findIndex(p => p.placedId === placedId);
  if (idx === -1) return;
  const pi = placedItems[idx];
  recordOperation('sell_item', { itemId: pi.item.id, placedId });
  pi.cells.forEach(c => { playerGrid[c.y][c.x] = null; });
  budget += pi.item.price * SELL_REFUND_RATE;
  placedItems.splice(idx, 1);
  renderShop();
  renderGrid();
  renderRules();
  updateStats();
  updateBudgetDisplay();
}

// Clear All ??remove all items and sell for 50% refund
window.clearAllItems = function() {
  let totalRefund = 0;
  movingItemState = null;
  if (placedItems.length) {
    recordOperation('clear_all_items', { count: placedItems.length });
  }
  placedItems.forEach(pi => {
    pi.cells.forEach(c => { playerGrid[c.y][c.x] = null; });
    totalRefund += pi.item.price * SELL_REFUND_RATE;
  });
  budget += totalRefund;
  placedItems = [];
  selectedItem = null;
  renderShop();
  renderGrid();
  renderRules();
  updateStats();
  updateBudgetDisplay();
};

window.startBattle = async function() {
  if (movingItemState) {
    alert('Place the picked-up item first (or press Esc to cancel move) before fighting.');
    return;
  }
  if (placedItems.length === 0 && isAIGame) return;
  recordOperation('start_battle', { mode: isAIGame ? 'ai' : 'multiplayer', round: currentRound });
  advanceTutorialByAction('start_battle');
  
  if (isAIGame) {
    clearPrepCountdown();
    const aiData = await generateAIOpponentGrid();
    gameStatus = 'battling';
    switchPhase('battle');
    setBattleParticipantNames(playerName, 'AI Rival');
    import('./battle.js').then(module => {
      module.startMultiplayerBattle(
        placedItems,
        playerGrid,
        aiData.items,
        aiData.grid,
        (result) => {
        handleAIResult(result);
        },
        playerName,
        'AI Rival'
      );
    });
    return;
  }
  
  if (channel && gameStatus === 'shopping') {
    if (hasSubmittedThisRound) return;
    hasSubmittedThisRound = true;
    gameStatus = 'waiting';
    showOverlay('Waiting...', 'Sending your box to the rival...');
    
    // Update our presence state with the submitted flag
    const myState = getMyPresenceState();
    myState.submitted = true;
    
    console.log('Submitting grid, updating presence...');
    await safeTrackPresence(myState, 'battle submit');
    
    // Keep the admin's own submission locally because the broadcast handler
    // ignores echo traffic for the sender.
    if (isAdmin) {
      adminSubmissions[myPresenceId] = { 
        items: placedItems, 
        grid: playerGrid,
        round: currentRound 
      };
    }
    
    // Tell the channel we submitted.
    await sendBroadcast('submit_grid', {
      id: myPresenceId,
      round: currentRound,
      items: placedItems,
      grid: playerGrid
    });
    
    // Check locally after a short delay to ensure presence state syncs
    setTimeout(() => {
      if (isAdmin) {
        console.log('[DEBUG] Admin checking matches after timeout, adminSubmissions:', Object.keys(adminSubmissions));
      }
      checkAndMatchPlayers(); 
    }, 500);
  }
};

window.restartGame = function() {
  init();
};

// ?? Placement Logic ??
function clearHoverPreview() {
  for (let gy = 0; gy < GRID_H; gy++)
    for (let gx = 0; gx < GRID_W; gx++)
      gridCells[gy][gx].classList.remove('preview-valid', 'preview-invalid');
  hoverCells = [];
}

function startMovingPlacedItem(occupant) {
  if (!occupant) return;

  movingItemState = {
    placedId: occupant.placedId,
    originalCells: cloneCells(occupant.cells),
    shapeIdx: occupant.shapeIdx || 0
  };

  occupant.cells.forEach(c => {
    playerGrid[c.y][c.x] = null;
  });

  selectedItem = occupant.item;
  selectedShapeIdx = occupant.shapeIdx || 0;
  recordOperation('pickup_move_item', { itemId: occupant.item.id, placedId: occupant.placedId });

  clearHoverPreview();
  renderShop();
  renderGrid();
  renderRules();
  updateStats();

  if (lastHoverGx >= 0 && lastHoverGy >= 0) {
    updateHoverPreview(lastHoverGx, lastHoverGy);
  }
}

function cancelMovingPlacement(restore = true) {
  if (!movingItemState) return;

  const movedItem = placedItems.find(p => p.placedId === movingItemState.placedId);
  if (restore && movedItem) {
    movedItem.cells = cloneCells(movingItemState.originalCells);
    movedItem.shapeIdx = movingItemState.shapeIdx;
    movedItem.cells.forEach(c => {
      playerGrid[c.y][c.x] = movedItem;
    });
  }

  movingItemState = null;
  selectedItem = null;
  selectedShapeIdx = 0;
  clearHoverPreview();
  renderShop();
  renderGrid();
  renderRules();
  updateStats();
}

function commitMovingPlacement(cells) {
  if (!movingItemState) return;

  const movedItem = placedItems.find(p => p.placedId === movingItemState.placedId);
  if (!movedItem) {
    movingItemState = null;
    selectedItem = null;
    selectedShapeIdx = 0;
    return;
  }

  movedItem.cells = cloneCells(cells);
  movedItem.shapeIdx = selectedShapeIdx;
  cells.forEach(c => {
    playerGrid[c.y][c.x] = movedItem;
  });

  recordOperation('move_item', {
    itemId: movedItem.item.id,
    placedId: movedItem.placedId,
    from: cloneCells(movingItemState.originalCells),
    to: cloneCells(cells)
  });

  movingItemState = null;
  selectedItem = null;
  selectedShapeIdx = 0;
  clearHoverPreview();
  renderShop();
  renderGrid();
  renderRules();
  updateStats();
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
  if (!selectedItem) {
    return;
  }

  const shape = selectedItem.shapes[selectedShapeIdx];
  const cells = shape.map(([dx, dy]) => ({ x: gx + dx, y: gy + dy }));
  const valid = cells.every(c =>
    c.x >= 0 && c.x < GRID_W && c.y >= 0 && c.y < GRID_H && !playerGrid[c.y][c.x]
  );
  if (!valid) return;

  if (movingItemState) {
    commitMovingPlacement(cells);
    advanceTutorialByAction('place_item');
    return;
  }

  if (selectedItem.price > budget) return;

  const placedId = ++placedIdCounter;
  const placed = { item: selectedItem, cells, shapeIdx: selectedShapeIdx, placedId };
  recordOperation('place_item', { itemId: selectedItem.id, cells: cloneCells(cells), shapeIdx: selectedShapeIdx });
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
  updateBudgetDisplay();
  advanceTutorialByAction('place_item');
  // Ensure hover preview is updated for the now-empty selection
  if (lastHoverGx >= 0 && lastHoverGy >= 0) updateHoverPreview(lastHoverGx, lastHoverGy);
}

// ?? Rotation ??
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && movingItemState) {
    e.preventDefault();
    cancelMovingPlacement(true);
    return;
  }

  if (e.key === 'r' || e.key === 'R') {
    if (!selectedItem) return;
    e.preventDefault(); // Prevent accidental scroll or other browser defaults
    selectedShapeIdx = (selectedShapeIdx + 1) % selectedItem.shapes.length;
    recordOperation('rotate_item', { itemId: selectedItem.id, shapeIdx: selectedShapeIdx });
    if (tutorialActive) {
      const step = tutorialSteps[tutorialStepIndex];
      if (step && step.id === 'rotate_shape') {
        tutorialRotateAttempts += 1;
      }
    }
    renderShop();
    if (lastHoverGx >= 0 && lastHoverGy >= 0)
      updateHoverPreview(lastHoverGx, lastHoverGy);
    advanceTutorialByAction('rotate_item');
    if (tutorialActive) {
      const currentStep = tutorialSteps[tutorialStepIndex];
      if (currentStep) setTutorialFocus(currentStep);
    }
  }
});

// ????????????????????????????????????????????????????????
//  INIT MOBILE TOOLBAR
function initMobileToolbar() {
  const rotateBtn = document.getElementById('btn-rotate-mobile');
  const sellBtn = document.getElementById('btn-sell-mobile');
  
  if (rotateBtn) {
    rotateBtn.addEventListener('click', (e) => {
      e.preventDefault();
      rotateSelectedItem();
    });
  }
  
  if (sellBtn) {
    sellBtn.addEventListener('click', (e) => {
      e.preventDefault();
      sellSelectedItem();
    });
  }
  
  updateMobileToolbar();
}

function rotateSelectedItem() {
  if (!selectedItem) return;
  selectedShapeIdx = (selectedShapeIdx + 1) % selectedItem.shapes.length;
  recordOperation('rotate_item', { itemId: selectedItem.id, shapeIdx: selectedShapeIdx });
  renderShop();
  if (lastHoverGx >= 0 && lastHoverGy >= 0) {
    updateHoverPreview(lastHoverGx, lastHoverGy);
  }
}

function sellSelectedItem() {
  // Find the first placed item and sell it
  if (placedItems.length === 0) return;
  const itemToSell = placedItems[0];
  sellItem(itemToSell.placedId);
}

function updateMobileToolbar() {
  const rotateBtn = document.getElementById('btn-rotate-mobile');
  const sellBtn = document.getElementById('btn-sell-mobile');
  
  if (rotateBtn) {
    rotateBtn.disabled = !selectedItem;
  }
  
  if (sellBtn) {
    sellBtn.disabled = placedItems.length === 0;
  }
}

//  STATS
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
  
  // Update mobile toolbar
  updateMobileToolbar();
}

//  BOOT
setupIntroVideo();
init();
preloadA2Video();

window.addEventListener('pagehide', cleanupRoomOnUnload);
window.addEventListener('beforeunload', cleanupRoomOnUnload);
