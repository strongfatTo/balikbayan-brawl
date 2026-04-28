# Balikbayan Brawl Rulebook

This document explains the current gameplay rules, systems, and implementation details for Balikbayan Brawl.

## 1. Game Overview

Balikbayan Brawl is a strategy packing game. You build a 5x5 box of items, manage your budget, choose item shapes and order, then watch the box fight automatically.

The game is round-based. You do not control combat directly. Your decisions happen during the preparation phase, where you buy, rotate, place, remove, or reorder items.

## 2. Game Modes

### 2.1 Single-Player Mode: Player vs AI

Single-player mode is the AI practice mode.

- You play alone.
- The game generates an AI opponent for each round.
- The AI may use human-style builds if cached builds are available, then falls back to archetype or random builds.
- The default single-player run is 5 rounds.
- After each battle, the game advances to the next round until the final round is complete.

There is also a tutorial variant that uses the same single-player path but with a fixed teaching sequence for the shop and guided onboarding.

### 2.2 Multiplayer Mode: Room-Based Play

Multiplayer mode is room-based and uses a Room ID.

- A player creates a room or joins an existing room.
- The first player in the room becomes the admin.
- The admin can start the game, change prep time, change round count, and kick players.
- The room supports up to 16 players.
- At least 2 players are required to start.
- If the player count is odd when the game starts, the system adds a hidden AI participant so pairings stay even.
- If a player disconnects during a tournament, that seat can be taken over by AI so the match can continue.

Multiplayer uses a round-robin tournament schedule, so opponents are arranged to avoid repeated pairings within the same cycle.

## 3. Player Setup and Game Flow

### 3.1 Starting Conditions

At the start of a game or after a reset:

- Starting budget: $10
- Starting items: none
- Starting grid: empty 5x5 box
- Starting battle order: empty

### 3.2 Budget and Progression

Money is persistent across rounds. You do not lose your wallet after a round ends.

Current budget rewards after a battle are:

- Win: +$3
- Draw: +$4
- Loss: +$5

Important: budget reward and tournament score are separate systems.

- Budget is used to buy items.
- Tournament score is used for the round leaderboard and final standings.

There is no permanent upgrade tree. Progression is mainly through smarter packing, stronger item synergies, and better battle order.

### 3.3 Round Structure

The game is round-based.

- Single-player default: 5 rounds
- Multiplayer configurable rounds: 3, 4, or 5 rounds

In multiplayer, the admin chooses the round count before the match begins.

The winning condition is the final leaderboard after the last round. This is not an elimination game. You can lose a battle and still win the tournament through later rounds.

### 3.4 Shop System

Each prep phase presents a shop with 3 items.

- Item count per shop refresh: 3
- Restock cost: $1
- Restock rule: draws 3 unique items from the current item pool
- Shop refresh timing: the shop restocks at the start of each round and can also be manually restocked during prep if you pay $1

In tutorial mode, the shop sequence is fixed rather than random so players can learn specific mechanics in a controlled order.

### 3.5 Typical Round Flow

1. A new round begins.
2. The shop refreshes.
3. You buy or select items.
4. You rotate and place them on the 5x5 grid.
5. You can reorder battle order before submitting.
6. When ready, you start the battle.
7. The game resolves combat automatically.
8. You receive the battle result and budget reward.
9. The next round begins, or the final leaderboard appears.

## 4. Grid, Placement, and Item Order

### 4.1 The Box Grid

The packing grid is 5x5, for a total of 25 cells.

- Rows are numbered top to bottom from Row 1 to Row 5.
- The layout matters for row-based bonuses and penalties.
- Items can occupy 1 or more cells depending on their shape.
- A placement is valid only if all occupied cells fit inside the 5x5 box and do not overlap another item.

### 4.2 Rotation and Shape Previews

Many items have multiple shapes.

- You can rotate the selected item with the `R` key.
- You can also open the rotation picker and choose from the available shapes.
- The preview shows the occupied cells in green inside a small 3x3 guide.

### 4.3 Battle Order

Battle order is determined by the order of items in your packed list.

- The first item in the list is the front-line unit.
- The next item becomes the next unit after the front-line dies.
- Reordering the list changes the fight sequence.

This matters because some items have order-based effects, such as Bread.

### 4.4 Moving Items Around

You can manage packed items in a few ways:

- Drag an item in the team list to reorder it.
- Drag a packed item out of the box to temporarily park it in the floor or blank-space tray.
- Drag a parked item back into the box to place it again.
- Right-click a placed item to sell it.
- Use Clear All to sell every placed item at once.

The floor tray is a staging area, not a new item source. Parked items are still yours and can be placed back into the box later.

## 5. Characters and Units

Every item is both a packing piece and a combat unit.

### 5.1 Full Item Reference

| Item | Cost | HP | ATK | Footprint | Special Rule |
| --- | ---: | ---: | ---: | --- | --- |
| Toothpaste | $0.5 | 8 | 6 | 1 cell | +5 ATK if Shampoo is also in your box |
| Running Shoes | $1 | 12 | 10 | 2 cells, 2 orientations | No special effect |
| Shampoo | $1 | 20 | 8 | 3 cells, 2 orientations | Synergy partner for Toothpaste |
| Luncheon Meat | $3.5 | 60 | 15 | 4 cells, 1 orientation | Loses 30% HP if not placed in the bottom section |
| Jeans | $2 | 45 | 8 | 7 cells, 4 orientations | Gains +20 Shield if Shoes are also in your box |
| Chocolate | $3 | 25 | 40 | 6 cells, 2 orientations | Loses 50% ATK if not placed in the top section |
| Bread | $2 | 18 | 12 | 2 cells, 2 orientations | 2x ATK if it is battle order #1 |
| Hot Sauce | $3 | 1 | 99 | 1 cell | Glass cannon unit |
| Pan | $2.5 | 30 | 24 | 5 cells, 4 orientations | 3x ATK, but takes 3x damage from Shoes and Jeans |
| Pill Box | $2.5 | 30 | 15 | 4 cells, 4 orientations | Heals 30% of max HP after it kills an enemy |
| Alcohol | $4.5 | 100 | 50 | 7 cells, 4 orientations | Premium high-stat unit with a 3x3 patterned footprint |

### 5.2 Placement Rules by Item

#### Toothpaste

- Cheap single-cell item.
- Best used with Shampoo in the same build.

#### Running Shoes

- Small 2-cell item.
- Its main purpose is to enable Jeans synergy.

#### Shampoo

- Synergy partner for Toothpaste.
- Does not need to be near Toothpaste for the bonus to work. It only needs to be in the same box.

#### Luncheon Meat

- Strong 2x2 item.
- Must be in the bottom section, rows 4-5, to avoid the HP penalty.
- If part of the item is outside the valid zone, the penalty applies.

#### Jeans

- Large 3x3-ish shaped item with 4 orientations.
- Gains a shield bonus when Shoes are also in the box.
- The current battle resolver records shield in the unit data, but there is no separate shield-absorption step in the live duel loop.

#### Chocolate

- High-ATK piece with a strong row requirement.
- Must be in the top section, rows 1-2, to avoid the ATK penalty.

#### Bread

- Small, flexible item with a big reward for being first in battle order.
- If Bread is the first unit in the packed list, it deals double ATK.

#### Hot Sauce

- Extremely aggressive glass cannon.
- Very high ATK, very low HP.

#### Pan

- Heavy damage dealer.
- Deals triple ATK.
- Takes triple damage from Shoes and Jeans.

#### Pill Box

- Sustain unit.
- If it kills an enemy, it heals itself for 30% of max HP.

#### Alcohol

- Expensive premium unit.
- Very large stat package and a 3x3 patterned footprint.

### 5.3 Example Item Synergies

- Toothpaste + Shampoo: Toothpaste gains +5 ATK.
- Shoes + Jeans: Jeans gains +20 Shield.
- Bread in slot #1: Bread attacks for 2x ATK.
- Pan against Shoes or Jeans: Pan takes triple damage.

## 6. Core Game Mechanics

### 6.1 Preparation Phase

During prep, you are building your box.

You can:

- Buy items from the shop.
- Select an item and place it on the grid.
- Rotate the item to a legal orientation.
- Reorder the packed list to change battle order.
- Remove items by right-clicking them.
- Park items on the floor tray if you want to take them out of the box temporarily.

The goal is to maximize your final battle strength while staying within budget and using the box space efficiently.

### 6.2 Combat Phase

Combat is fully automatic.

How a duel works:

1. The first living unit from each side enters the fight.
2. Both units attack in the same round.
3. Damage is based on ATK, with a minimum of 1.
4. Weakness rules are applied if relevant.
5. Damage numbers and HP bars update.
6. Dead units are removed from the front line.
7. The next living unit steps forward.
8. The fight continues until one side is out of units.

### 6.3 Combat Resolution Logic

- Damage is simultaneous inside each combat round.
- The current resolver applies weakness effects and on-kill healing.
- Pan takes 3x damage from Shoes and Jeans.
- Pill Box heals after a kill if it survives the exchange.
- A unit always deals at least 1 damage, even if its ATK is very low.

### 6.4 Strategy Layer

The main strategy comes from:

- Choosing items that fit your budget.
- Picking strong synergies.
- Solving shape placement efficiently.
- Avoiding row penalties.
- Ordering your team correctly.

Example:

- If you place Bread first, it gets its 2x ATK bonus.
- If you place Chocolate in the bottom rows, it loses half its ATK.
- If you pack Jeans without Shoes, you lose its synergy value.

## 7. Additional Systems

### 7.1 Randomization

Randomization exists in three main places:

- The normal shop restock, which chooses 3 unique random items from the item pool.
- AI opponent generation, which may use human-style builds, archetype builds, or random builds.
- Multiplayer pairing, which uses a round-robin schedule to vary opponents across rounds.

### 7.2 AI Behavior

Single-player AI is not a fixed script.

The AI build pipeline currently tries the following:

1. Human-style builds from cached build data, when available.
2. Archetype AI builds.
3. Random item placement fallback.

This makes the AI feel less repetitive than a pure random generator.

### 7.3 Multiplayer Interaction

Multiplayer uses realtime room state.

- Players join by Room ID.
- The admin controls room settings.
- Prep time can be set to 60, 90, or 120 seconds.
- Round count can be set to 3, 4, or 5.
- Rooms do not auto-close after a timer.
- Players can leave and rejoin without reloading the page.
- The room can continue even if a player disconnects, because the seat can be treated as AI-controlled.

### 7.4 Leaderboards and Tournament Scoring

Each round can show a leaderboard with movement animation.

- Win: 3 points
- Draw: 2 points
- Loss: 1 point

The leaderboard can also show rank changes from the previous round.

In multiplayer:

- Round results are tracked per participant.
- Hidden AI entries are excluded from the visible leaderboard.
- Final standings are sent at tournament end.

In single-player:

- The AI mode shows a final 2-player leaderboard after the configured number of rounds.

### 7.5 Room Limits and Defaults

- Maximum room size: 16 players
- Minimum players to start: 2
- Default prep time: 60 seconds
- Default round count: 5

## 8. Examples

### Example 1: A Simple Efficient Start

You start with $10. The shop offers three items. You buy a cheap item first, place it to reserve space, then use the remaining budget to add a synergy partner.

Result:

- You keep money for later rounds.
- You keep building around the same box.
- Your battle order becomes stronger each round.

### Example 2: Bread as First Unit

If Bread is the first item in your packed list, it deals double ATK.

That means Bread is often best placed intentionally as your opening unit, especially if you want a strong first trade in battle.

### Example 3: Avoiding a Row Penalty

Luncheon Meat must be in the bottom section. If you place it too high, it loses HP. Chocolate is the opposite: it wants the top section.

This means the box is not only about fitting shapes. It is also about placing the right item in the right area.

### Example 4: Parking an Item on the Floor

If you decide an item is in the wrong place, you can drag it out of the team list to the floor tray. This lets you take it out of the box without deleting it, then place it again later.

## 9. Current Implementation Notes

These notes are useful for developers or players who want the exact current behavior.

- Items stay on the grid between rounds. The wallet also persists.
- The shop is refreshed each round.
- In normal shop refreshes, the 3 items are unique within that refresh.
- In tutorial mode, the shop follows a scripted fixed sequence.
- Shield bonuses are tracked in unit stats, but the live battle loop currently resolves combat with HP and ATK plus special-case mechanics such as weakness and on-kill healing.
- The battle animation is cosmetic; the real result is determined by the underlying unit stats and ordering.
- Multiplayer room state is synchronized through realtime presence and broadcasts.
- The admin is the first visible player in the room and is the only one who can change room settings.

## 10. Quick Reference

- Starting budget: $10
- Grid size: 5x5
- Shop items per refresh: 3
- Manual restock cost: $1
- Single-player rounds: 5 by default
- Multiplayer rounds: 3, 4, or 5
- Room size: up to 16 players
- Minimum to start: 2 players
- Damage floor: 1 minimum damage per attack

## 11. Summary

Balikbayan Brawl is a round-based packing and battle game where the key decisions are:

- What to buy
- Where to place it
- How to rotate it
- How to order it
- When to fight

If you build efficient shapes, respect row restrictions, and optim ize battle order, you will usually outperform a build that only has high raw stats.