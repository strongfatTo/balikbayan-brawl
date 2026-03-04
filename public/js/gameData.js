// ═══════════════════════════════════════════════════════
//  ITEM DEFINITIONS
// ═══════════════════════════════════════════════════════
export const ITEMS = [
  {
    id: 'toothpaste', name: 'Toothpaste', emoji: '🦷',
    price: 1, hp: 10, atk: 5,
    shapes: [[[0,0]]],
    colorClass: 'color-toothpaste',
    desc: 'Synergizes with Shampoo for +5 ATK',
    mechanic: { type: 'synergy', partner: 'shampoo', bonus: { atk: 5 } }
  },
  {
    id: 'shoes', name: 'Running Shoes', emoji: '👟',
    price: 1, hp: 15, atk: 8,
    shapes: [[[0,0],[1,0]], [[0,0],[0,1]]],
    colorClass: 'color-shoes',
    desc: 'Pure filler. No special effects.',
    mechanic: null
  },
  {
    id: 'shampoo', name: 'Shampoo', emoji: '🧴',
    price: 1, hp: 25, atk: 5,
    shapes: [[[0,0],[1,0],[2,0]], [[0,0],[0,1],[0,2]]],
    colorClass: 'color-shampoo',
    desc: 'Synergy core for Toothpaste.',
    mechanic: { type: 'synergy-partner', partner: 'toothpaste' }
  },
  {
    id: 'spam', name: 'Luncheon Meat', emoji: '🥩',
    price: 1, hp: 80, atk: 10,
    shapes: [
      [[0,0],[1,0],[1,1]],
      [[0,0],[0,1],[1,1]],
      [[0,0],[1,0],[0,1]],
      [[1,0],[0,1],[1,1]]
    ],
    colorClass: 'color-spam',
    desc: '30% self-damage if NOT in rows 1-2',
    mechanic: { type: 'row-penalty', validRows: [0,1], penalty: { hp: 0.30 }, label: 'Y1-Y2 OK', badLabel: '30% DMG!' }
  },
  {
    id: 'jeans', name: 'Jeans', emoji: '👖',
    price: 2, hp: 50, atk: 5,
    shapes: [
      [[0,0],[1,0],[2,0],[2,1],[2,2]],
      [[0,0],[0,1],[0,2],[1,0],[2,0]],
      [[0,0],[0,1],[0,2],[1,2],[2,2]],
      [[0,0],[1,0],[2,0],[0,1],[0,2]]
    ],
    colorClass: 'color-jeans',
    desc: '+20 Shield HP if no weapons/shoes adjacent',
    mechanic: { type: 'adjacency', exclude: ['shoes', 'spam'], bonus: { shield: 20 }, label: '+20 Shield', badLabel: 'No Shield' }
  },
  {
    id: 'chocolate', name: 'Chocolate', emoji: '🍫',
    price: 3, hp: 30, atk: 35,
    shapes: [
      [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]],
      [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]]
    ],
    colorClass: 'color-chocolate',
    desc: '-50% ATK if NOT in rows 4-5',
    mechanic: { type: 'row-penalty', validRows: [3,4], penalty: { atk: 0.50 }, label: 'Y4-Y5 OK', badLabel: '-50% ATK!' }
  }
];

export const BONUS_RULES = [
  { itemId: 'toothpaste', emoji: '🦷', name: 'Toothpaste', desc: 'With Shampoo', effect: '+5 ATK', color: '#4ecca3' },
  { itemId: 'shampoo', emoji: '🧴', name: 'Shampoo', desc: 'With Toothpaste', effect: 'Enable +5 ATK', color: '#af7ac5' },
  { itemId: 'spam', emoji: '🥩', name: 'Luncheon Meat', desc: 'Place in Y1-Y2', effect: 'No penalty', color: '#4ecca3', badEffect: '-30% HP', badColor: '#e94560' },
  { itemId: 'jeans', emoji: '👖', name: 'Jeans', desc: 'No weapons/shoes adjacent', effect: '+20 Shield', color: '#4ecca3', badEffect: 'No Shield', badColor: '#e94560' },
  { itemId: 'chocolate', emoji: '🍫', name: 'Chocolate', desc: 'Place in Y4-Y5', effect: 'No penalty', color: '#f0c040', badEffect: '-50% ATK', badColor: '#e94560' }
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

  // Synergy: Toothpaste + Shampoo
  if (mech.type === 'synergy') {
    const partner = allPlacedItems.find(p => p.item.id === mech.partner);
    if (partner) {
      return { active: true, text: mech.bonus.atk + ' ATK', shieldBonus: 0, hpMult: 1, atkMult: 1, atkBonus: mech.bonus.atk };
    }
    return { active: false, text: '', shieldBonus: 0, hpMult: 1, atkMult: 1 };
  }

  // Synergy partner (Shampoo) - no direct effect, just enables toothpaste
  if (mech.type === 'synergy-partner') {
    return { active: false, text: '', shieldBonus: 0, hpMult: 1, atkMult: 1 };
  }

  // Row penalty (Spam: -30% HP outside Y1-Y2, Chocolate: -50% ATK outside Y4-Y5)
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

  return { active: false, text: '', shieldBonus: 0, hpMult: 1, atkMult: 1 };
}

export function getEffectiveStats(pi, placedItems, playerGrid) {
  const m = checkMechanic(pi, placedItems, playerGrid);
  const hp = Math.floor(pi.item.hp * m.hpMult);
  const atk = Math.floor(pi.item.atk * m.atkMult) + (m.atkBonus || 0);
  return { hp, atk, shield: m.shieldBonus || 0 };
}