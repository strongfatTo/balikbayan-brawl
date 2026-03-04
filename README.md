# 📦 Balikbayan Brawl

**Balikbayan Brawl** is a 1v1 strategy puzzle game where you pack a Balikbayan box with Filipino goods and battle a rival. In Filipino culture, Balikbayan boxes are care packages sent by overseas workers to their families. In this game, space is more precious than money!

## 🎮 Game Overview

Two players (or you vs. AI) each have **$10** and a **5x5 grid** (25 cells) to fill with items. Each item becomes a combat unit. Once packing is done, the boxes fight automatically in an animated 2D battle!

### **Key Features**
- **Multiplayer Rooms**: Join a room with a friend using a Room ID.
- **AI Mode**: Practice your packing skills against a randomly generated AI opponent.
- **Tournament System**: Play a **5-round tournament** where you must re-pack your box each round.
- **Scoring & Leaderboard**: Earn points (**Win: 3, Draw: 2, Loss: 1**) and see your rank at the end of the tournament.
- **Positioning Strategy**: Items gain bonuses or penalties based on where you place them in the grid.
- **Animated Battles**: Watch your items fight it out with HP bars, damage numbers, and a detailed battle log.

## 🛠️ Tech Stack
- **Backend**: Node.js, Express, Socket.io
- **Frontend**: Vanilla JavaScript (ES Modules), CSS Grid, HTML5
- **Communication**: Real-time bidirectional events via WebSockets

## 🚀 How to Run Locally

1.  **Clone the repository** (or download the files).
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Start the server**:
    ```bash
    npm start
    ```
4.  **Open the game**:
    Navigate to `http://localhost:3000` in your browser.
    *To test multiplayer, open the same link in a second tab or window.*

## 📖 How to Play

1.  **Login**: Enter your name and either a **Room ID** (to play with others) or click **FIGHT AI**.
2.  **Lobby**: In multiplayer, wait for others to join. The first player is the Admin and can click **START GAME**.
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
| **Toothpaste** | 🦷 | $1 | 10 | 5 | +5 ATK if **Shampoo** is also in the box. |
| **Shoes** | 👟 | $1 | 15 | 8 | Simple filler, no special effects. |
| **Shampoo** | 🧴 | $1 | 25 | 5 | Enables the Toothpaste synergy bonus. |
| **Spam** | 🥩 | $1 | 80 | 10 | **30% HP Penalty** if not placed in rows Y1-Y2. |
| **Jeans** | 👖 | $2 | 50 | 5 | **+20 Shield** if no weapons/shoes are adjacent. |
| **Chocolate** | 🍫 | $3 | 30 | 35 | **50% ATK Penalty** if not placed in rows Y4-Y5. |

## ☁️ Deployment

You can deploy this app easily to platforms like **Render** or **Heroku**:
1.  Push your code to a GitHub repository.
2.  Connect the repository to Render (Web Service).
3.  Set **Build Command** to `npm install` and **Start Command** to `npm start`.
4.  Render will provide a public URL for your game.

---
*Pack with love. Fight with power. Send it home!* 🇵🇭
