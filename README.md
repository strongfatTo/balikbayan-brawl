# 📦 Balikbayan Brawl

**Balikbayan Brawl** is a 1v1 strategy puzzle game where you pack a Balikbayan box with Filipino goods and battle a rival. In Filipino culture, Balikbayan boxes are care packages sent by overseas workers to their families. In this game, space is more precious than money!

## 🎮 Game Overview

Two players (or you vs. AI) each have **$10** and a **5x5 grid** (25 cells) to fill with items. Each item becomes a combat unit. Once packing is done, the boxes fight automatically in an animated 2D battle!

### **Key Features**
- **Cinematic Experience**: Enjoy animated video intros and background scenes while you pack.
- **Multiplayer Rooms**: Join a room with a friend using a Room ID.
- **AI Mode**: Practice your packing skills against a randomly generated AI opponent.
- **Tournament System**: Play a **5-round tournament** where you must re-pack your box each round.
- **Scoring & Leaderboard**: Earn points (**Win: 3, Draw: 2, Loss: 1**) and see your rank at the end of the tournament.
- **Positioning Strategy**: Items gain bonuses or penalties based on where you place them in the grid.
- **Animated Battles**: Watch your items fight it out with HP bars, damage numbers, and a detailed battle log.

## 🛠️ Tech Stack
- **Backend**: Supabase (Database & Realtime Channels), Node.js (Express server)
- **Frontend**: Vanilla JavaScript (ES Modules), CSS Grid, HTML5
- **Media**: MP4 Videos & static overlays for scene transitions

## 🚀 How to Run Locally

1.  **Clone the repository** (or download the files).
2.  **Install dependencies**:
    `npm install`
3.  **Run the local server**:
    `npm start`
    (This will start a Node server on port 3000 by default)
4.  Navigate to the local URL (e.g., `http://localhost:3000`).

## 📖 How to Play

1.  **Login**: Enter your name and either a **Room ID** (to play with others) or click **FIGHT AI**.
2.  **Lobby**: In multiplayer, wait for others to join. The first player to join is the **Admin** and can click **START GAME**.
3.  **Shopping Phase**:
    - Click an item in the shop to select it.
    - **Press R** to rotate the item.
    - **Click the grid** to place the item.
    - **Right-click** a placed item to remove it and get a refund.
    - Watch the **Item Rules** panel to optimize for bonuses.
4.  **Battle Phase**:
    - Click **FIGHT!** when your box is ready.
    - Once all players are ready, the battle begins automatically.
    - Watch the animated battle and check the **Team List** to see your remaining units.
5.  **Tournament**: Complete 5 rounds of packing and fighting to see the final **Leaderboard**.

## 🧠 Item Mechanics & Rules

| Item | Emoji | Price | HP | ATK | Special Mechanic |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Toothpaste** | 🦷 | $1 | 8 | 6 | +5 ATK if **Shampoo** is also in the box. |
| **Running Shoes** | 👟 | $1 | 12 | 10 | Pure filler, no special effects. |
| **Shampoo** | 🧴 | $1 | 20 | 8 | Synergy core for Toothpaste. |
| **Luncheon Meat** | 🥩 | $2 | 60 | 15 | **30% HP Penalty** if not placed in Bottom Section (Rows 4-5). |
| **Jeans** | 👖 | $2 | 45 | 8 | **+20 Shield** if **Running Shoes** are also in the box. |
| **Chocolate** | 🍫 | $3 | 25 | 40 | **50% ATK Penalty** if not placed in Top Section (Rows 1-2). |

## ☁️ Deployment

You can deploy this app as a **Static Site** (no Node.js server required if only using Supabase) or as a **Node.js App**:
1.  Push your code to a GitHub repository.
2.  Connect to **Vercel**, **Netlify**, **Render**, or **GitHub Pages** (for static).
3.  The app connects directly to Supabase for all multiplayer and database logic. Note: The experimental `server.js` is included for local serving and potential backend transitions.

---
*Pack with love. Fight with power. Send it home!* 🇵🇭
