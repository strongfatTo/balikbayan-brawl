// ═══════════════════════════════════════════════════════
//  CONFIGURABLE CONSTANTS
// ═══════════════════════════════════════════════════════
export const TOOTHPASTE_BASE_PRICE = 0.50;
export const SELL_REFUND_RATE = 0.50;
export const RESTOCK_COST = 1;
export const STARTING_BUDGET = 10;
export const REWARD_WIN = 3;
export const REWARD_LOSS = 5;
export const REWARD_DRAW = 4;
export const SHOP_OFFERING_COUNT = 3;

// Fixed shop item sequence for Guide/Tutorial mode (predetermined rotation)
export const FIXED_SHOP_SEQUENCE = [
  'jeans',        // Step 1: Show rotatable synergy item
  'shampoo',      // Step 2: Synergy partner
  'bread',        // Step 3: Rotatable item for practicing rotation
  'shoes',        // Step 4: Simple filler
  'spam',         // Step 5: Row effect example
  'chocolate',   // Step 6: More row effects
  'pillbox',      // Step 7: On-kill heal
  'pan',          // Step 8: Type weakness
  'bleach',       // Step 9: Glass cannon
  'alcohol',     // Step 10: Premium unit
  'toothpaste'   // Step 11: Show synergy item
];

// ═══════════════════════════════════════════════════════
//  ITEM DEFINITIONS
// ═══════════════════════════════════════════════════════
export const ITEMS = [
  {
    id: 'toothpaste', name: 'Toothpaste', emoji: '🦷',
    price: TOOTHPASTE_BASE_PRICE, hp: 8, atk: 6,
    shapes: [[[0,0]]],
    colorClass: 'color-toothpaste',
    desc: 'Synergizes with Shampoo for +5 ATK',
    mechanic: { type: 'synergy', partner: 'shampoo', bonus: { atk: 5 } }
  },
  {
    id: 'shoes', name: 'Running Shoes', emoji: '👟',
    price: 1, hp: 12, atk: 10,
    shapes: [[[0,0],[1,0]], [[0,0],[0,1]]],
    colorClass: 'color-shoes',
    desc: 'Pure filler. No special effects.',
    mechanic: null
  },
  {
    id: 'shampoo', name: 'Shampoo', emoji: '🧴',
    price: 1, hp: 20, atk: 8,
    shapes: [[[0,0],[1,0],[2,0]], [[0,0],[0,1],[0,2]]],
    colorClass: 'color-shampoo',
    desc: 'Synergy core for Toothpaste.',
    mechanic: { type: 'synergy-partner', partner: 'toothpaste' }
  },
  {
    id: 'spam', name: 'Luncheon Meat', emoji: '🥩',
    price: 3.5, hp: 60, atk: 15,
    shapes: [
      [[0,0],[1,0],[0,1],[1,1]]
    ],
    colorClass: 'color-spam',
    desc: '30% self-HP if NOT in Bottom Section',
    mechanic: { type: 'row-penalty', validRows: [0,1], penalty: { hp: 0.30 }, label: 'Bottom Zone OK', badLabel: '30% self-HP!' }
  },
  {
    id: 'jeans', name: 'Jeans', emoji: '👖',
    price: 2, hp: 45, atk: 8,
    shapes: [
      [[0,0],[2,0],[0,1],[2,1],[0,2],[1,2],[2,2]], // ### / #x# / #x#
      [[0,0],[1,0],[2,0],[2,1],[0,2],[1,2],[2,2]], // ### / xx# / ###
      [[0,0],[1,0],[2,0],[0,1],[2,1],[0,2],[2,2]], // #x# / #x# / ###
      [[0,0],[1,0],[2,0],[0,1],[0,2],[1,2],[2,2]]  // ### / #xx / ###
    ],
    colorClass: 'color-jeans',
    desc: 'With Shoes &rarr; +20 Shield',
    mechanic: { type: 'synergy', partner: 'shoes', bonus: { shield: 20 }, label: '+20 Shield' }
  },
  {
    id: 'chocolate', name: 'Chocolate', emoji: '🍫',
    price: 3, hp: 25, atk: 40,
    shapes: [
      [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]],
      [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]]
    ],
    colorClass: 'color-chocolate',
    desc: '-50% self-ATK if NOT in Row 1 or 2',
    mechanic: { type: 'row-penalty', validRows: [3,4], penalty: { atk: 0.50 }, label: 'Top Zone OK', badLabel: '-50% self-ATK' }
  },
  // ── NEW ITEMS ──
  {
    id: 'bread', name: 'Bread', emoji: '🍞',
    price: 2, hp: 18, atk: 12,
    shapes: [
      [[0,0],[0,1]],   // vertical 1x2
      [[0,0],[1,0]]    // horizontal 2x1
    ],
    colorClass: 'color-bread',
    desc: '2x ATK when in fight position #1',
    mechanic: { type: 'first-position', label: '2x ATK (1st!)', badLabel: 'Not 1st' }
  },
  {
    id: 'bleach', name: 'Hot Sauce', emoji: '🌶️',
    price: 3, hp: 1, atk: 99,
    shapes: [[[0,0]]],
    colorClass: 'color-bleach',
    desc: 'Glass cannon burst, but dies after one hit (HP=1)',
    mechanic: { type: 'glass-cannon', label: 'Glass Cannon' }
  },
  {
    id: 'pan', name: 'Pan', emoji: '🍳',
    price: 2.5, hp: 30, atk: 24,
    shapes: [
      [[0,0],[1,0],[2,0],[0,1],[1,1]], // ##x / ###
      [[0,0],[0,1],[0,2],[1,1],[1,2]], // ## / ## / #x
      [[1,0],[2,0],[0,1],[1,1],[2,1]], // ### / x##
      [[0,0],[1,0],[0,1],[1,1],[1,2]]  // x# / ## / ##
    ],
    colorClass: 'color-pan',
    desc: '3x ATK, but takes 3x damage from Shoes/Jeans',
    mechanic: { type: 'type-weakness', weakTo: ['shoes', 'jeans'], label: '3x ATK', badLabel: 'Weak to Shoes/Jeans' }
  },
  {
    id: 'pillbox', name: 'Pill Box', emoji: '💊',
    price: 2.5, hp: 30, atk: 15,
    shapes: [
      [[0,0],[1,0],[2,0],[1,1]],     // T pointing down
      [[0,0],[0,1],[0,2],[1,1]],     // T pointing right
      [[1,0],[0,1],[1,1],[2,1]],     // T pointing up
      [[1,0],[1,1],[0,1],[1,2]]      // T pointing left  (fixed: was duplicate)
    ],
    colorClass: 'color-pillbox',
    desc: 'Heals 30% max HP after killing an enemy',
    mechanic: { type: 'on-kill-heal', healPct: 0.30, label: 'Heals 30% on kill' }
  },
  {
    id: 'alcohol', name: 'Alcohol', emoji: '🍺',
    price: 4.5, hp: 100, atk: 50,
    shapes: [
      [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[1,2]], // x#x / ### / ###
      [[0,1],[1,0],[1,1],[1,2],[0,0],[0,2],[2,1]], // ##x / ### / ##x
      [[0,1],[1,0],[1,1],[1,2],[2,1],[0,2],[2,2]], // ### / ### / x#x
      [[1,0],[2,0],[1,1],[1,2],[2,1],[0,1],[2,2]]  // x## / ### / x##
    ],
    colorClass: 'color-alcohol',
    desc: 'Very strong premium unit with a 3x3 patterned footprint.',
    mechanic: null
  }
];

export const BONUS_RULES = [
  { itemId: 'toothpaste', emoji: '🦷', name: 'Toothpaste', desc: 'With Shampoo', effect: '+5 ATK', color: '#4ecca3' },
  { itemId: 'shampoo', emoji: '🧴', name: 'Shampoo', desc: 'With Toothpaste', effect: 'Enable +5 ATK', color: '#af7ac5' },
  { itemId: 'spam', emoji: '🥩', name: 'Luncheon Meat', desc: 'Place in Row 4 or 5', effect: 'No penalty', color: '#4ecca3', badEffect: '-30% self-HP', badColor: '#e94560' },
  { itemId: 'jeans', emoji: '👖', name: 'Jeans', desc: 'With Shoes', effect: '+20 Shield', color: '#4ecca3', badEffect: 'No Shield', badColor: '#e94560' },
  { itemId: 'chocolate', emoji: '🍫', name: 'Chocolate', desc: 'Place in Row 1 or 2', effect: 'No penalty', color: '#f0c040', badEffect: '-50% self-ATK', badColor: '#e94560' },
  { itemId: 'bread', emoji: '🍞', name: 'Bread', desc: 'Fight position #1', effect: '2x ATK', color: '#d4a574', badEffect: 'Normal ATK', badColor: '#888' },
  { itemId: 'bleach', emoji: '🌶️', name: 'Hot Sauce', desc: 'Burst glass cannon', effect: 'ATK 99, HP 1', color: '#e8e8e8' },
  { itemId: 'pan', emoji: '🍳', name: 'Pan', desc: 'High damage dealer', effect: '3x ATK', color: '#7a7a7a', badEffect: '3x DMG from Shoes/Jeans', badColor: '#e94560' },
  { itemId: 'pillbox', emoji: '💊', name: 'Pill Box', desc: 'On enemy kill', effect: 'Heal 30% HP', color: '#e74c6f' },
  { itemId: 'alcohol', emoji: '🍺', name: 'Alcohol', desc: '3x3 premium unit', effect: 'Raw power', color: '#d4a017' }
];

export const GRID_W = 5;
export const GRID_H = 5;

// ═══════════════════════════════════════════════════════
//  MECHANICS SYSTEM
// ═══════════════════════════════════════════════════════
export function checkMechanic(placedItem, allPlacedItems, grid) {
  const mech = placedItem.item.mechanic;
  if (!mech) return { active: false, text: '', shieldBonus: 0, hpMult: 1, atkMult: 1 };

  const cells = placedItem.cells;
  const itemId = placedItem.item.id;

  // Synergy: Toothpaste + Shampoo, Jeans + Shoes
  if (mech.type === 'synergy') {
    const partner = allPlacedItems.find(p => p.item.id === mech.partner);
    if (partner) {
      return { 
        active: true, 
        text: mech.label || (mech.bonus.atk + ' ATK'), 
        shieldBonus: mech.bonus.shield || 0, 
        hpMult: 1, 
        atkMult: 1, 
        atkBonus: mech.bonus.atk || 0 
      };
    }
    return { active: false, text: '', shieldBonus: 0, hpMult: 1, atkMult: 1 };
  }

  // Synergy partner (Shampoo) - no direct effect, just enables toothpaste
  if (mech.type === 'synergy-partner') {
    return { active: false, text: '', shieldBonus: 0, hpMult: 1, atkMult: 1 };
  }

  // Row penalty (Spam: -30% HP outside Y1-Y2, Chocolate: -50% self-ATK outside Y4-Y5)
  if (mech.type === 'row-penalty') {
    const allInValidRows = cells.every(c => mech.validRows.includes(c.y));
    if (!allInValidRows) {
      return { 
        active: true, 
        text: mech.badLabel, 
        shieldBonus: 0, 
        hpMult: 1 - (mech.penalty.hp || 0), 
        atkMult: 1 - (mech.penalty.atk || 0) 
      };
    }
    return { active: true, text: mech.label, shieldBonus: 0, hpMult: 1, atkMult: 1 };
  }

  // Adjacency bonus (Jeans: +20 shield if no weapons/shoes adjacent)
  if (mech.type === 'adjacency') {
    const excludeIds = mech.exclude;
    let hasAdjacent = false;
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const c of cells) {
      for (const [dx, dy] of dirs) {
        const nx = c.x + dx, ny = c.y + dy;
        if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H) {
          const neighbor = grid[ny][nx];
          if (neighbor && excludeIds.includes(neighbor.item.id)) {
            hasAdjacent = true;
            break;
          }
        }
      }
      if (hasAdjacent) break;
    }
    if (!hasAdjacent) {
      return { active: true, text: mech.label, shieldBonus: mech.bonus.shield, hpMult: 1, atkMult: 1 };
    }
    return { active: true, text: mech.badLabel, shieldBonus: 0, hpMult: 1, atkMult: 1 };
  }

  // ── NEW MECHANIC TYPES ──

  // Bread: 2x ATK when in fight position #1
  if (mech.type === 'first-position') {
    const idx = allPlacedItems.indexOf(placedItem);
    if (idx === 0) {
      return { active: true, text: mech.label, shieldBonus: 0, hpMult: 1, atkMult: 2 };
    }
    return { active: true, text: mech.badLabel, shieldBonus: 0, hpMult: 1, atkMult: 1 };
  }

  // Bleach: glass cannon — informational label only, stats enforce behavior
  if (mech.type === 'glass-cannon') {
    return { active: true, text: mech.label, shieldBonus: 0, hpMult: 1, atkMult: 1 };
  }

  // Pan: 3x ATK, but takes 3x damage from shoes/jeans (weakness applied in battle.js)
  if (mech.type === 'type-weakness') {
    return { 
      active: true, 
      text: mech.label, 
      shieldBonus: 0, 
      hpMult: 1, 
      atkMult: 3, 
      weakTo: mech.weakTo 
    };
  }

  // Pill Box: heals 30% after killing enemy (heal applied in battle.js)
  if (mech.type === 'on-kill-heal') {
    return { 
      active: true, 
      text: mech.label, 
      shieldBonus: 0, 
      hpMult: 1, 
      atkMult: 1, 
      onKillHeal: mech.healPct 
    };
  }

  return { active: false, text: '', shieldBonus: 0, hpMult: 1, atkMult: 1 };
}

export function getEffectiveStats(pi, placedItems, playerGrid) {
  const m = checkMechanic(pi, placedItems, playerGrid);
  const hp = Math.floor(pi.item.hp * m.hpMult);
  const atk = Math.floor(pi.item.atk * m.atkMult) + (m.atkBonus || 0);
  return { 
    hp, 
    atk, 
    shield: m.shieldBonus || 0,
    weakTo: m.weakTo || null,
    onKillHeal: m.onKillHeal || 0
  };
}
