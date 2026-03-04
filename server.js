import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════════════════
//  CONSTANTS & STATE
// ═══════════════════════════════════════════════════════
const MAX_ROUNDS = 5;
const POINTS = { WIN: 3, DRAW: 2, LOSS: 1 };

const rooms = new Map(); // roomId -> { players, round, state, matches }
// Player: { id, name, socket, score, record: {w, d, l}, submitted: {items, grid}, opponentId }

io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join_room', async (data) => {
        const { roomId, playerName } = data;
        if (!roomId || !playerName) return;

        await socket.join(roomId);
        
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                id: roomId,
                players: new Map(),
                round: 0,
                state: 'LOBBY',
                adminId: socket.id
            });
        }

        const room = rooms.get(roomId);
        if (room.state !== 'LOBBY') {
            socket.emit('error', { message: 'Game already in progress' });
            return;
        }

        room.players.set(socket.id, {
            id: socket.id,
            name: playerName,
            score: 0,
            record: { w: 0, d: 0, l: 0 },
            submitted: null,
            opponentId: null
        });

        console.log(`Player ${playerName} joined room ${roomId}`);
        broadcastRoomUpdate(roomId);
    });

    socket.on('request_start_game', () => {
        const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
        const room = rooms.get(roomId);
        if (!room || room.adminId !== socket.id) return;

        if (room.players.size < 2) {
            socket.emit('error', { message: 'Need at least 2 players to start' });
            return;
        }

        startNewRound(roomId);
    });

    socket.on('submit_grid', (data) => {
        const { roomId, items, grid } = data;
        const room = rooms.get(roomId);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (!player) return;

        player.submitted = { items, grid };
        console.log(`Player ${player.name} submitted grid for round ${room.round}`);

        // Check if all players submitted
        const allSubmitted = Array.from(room.players.values()).every(p => p.submitted);
        if (allSubmitted) {
            generateMatches(roomId);
        } else {
            socket.emit('waiting_for_opponent');
        }
    });

    socket.on('report_battle_result', (data) => {
        // data: { roomId, result: 'win' | 'loss' | 'draw' }
        const { roomId, result } = data;
        const room = rooms.get(roomId);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (!player || player.processedResult) return;

        player.processedResult = true; // Prevent double reporting
        if (result === 'win') {
            player.score += POINTS.WIN;
            player.record.w++;
        } else if (result === 'draw') {
            player.score += POINTS.DRAW;
            player.record.d++;
        } else {
            player.score += POINTS.LOSS;
            player.record.l++;
        }

        checkRoundCompletion(roomId);
    });

    socket.on('disconnecting', () => {
        for (const roomId of socket.rooms) {
            const room = rooms.get(roomId);
            if (room) {
                room.players.delete(socket.id);
                if (room.players.size === 0) {
                    rooms.delete(roomId);
                } else {
                    if (room.adminId === socket.id) {
                        room.adminId = room.players.keys().next().value;
                    }
                    broadcastRoomUpdate(roomId);
                }
            }
        }
    });
});

function broadcastRoomUpdate(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const playersInfo = Array.from(room.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        isAdmin: p.id === room.adminId
    }));

    io.to(roomId).emit('room_update', {
        roomId,
        players: playersInfo,
        state: room.state
    });
}

function startNewRound(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.round++;
    room.state = 'SHOPPING';
    
    // Reset player submissions and results for the new round
    for (const player of room.players.values()) {
        player.submitted = null;
        player.processedResult = false;
        player.opponentId = null;
    }

    io.to(roomId).emit('round_start', {
        round: room.round,
        maxRounds: MAX_ROUNDS
    });
}

function generateMatches(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.state = 'BATTLE';
    const playerIds = Array.from(room.players.keys());
    shuffleArray(playerIds);

    // Pair them up
    for (let i = 0; i < playerIds.length; i += 2) {
        if (i + 1 < playerIds.length) {
            const p1Id = playerIds[i];
            const p2Id = playerIds[i+1];
            const p1 = room.players.get(p1Id);
            const p2 = room.players.get(p2Id);

            p1.opponentId = p2Id;
            p2.opponentId = p1Id;

            // Send specific battle start to each player in the pair
            io.to(p1Id).emit('battle_start', {
                enemyName: p2.name,
                enemyItems: p2.submitted.items,
                enemyGrid: p2.submitted.grid
            });

            io.to(p2Id).emit('battle_start', {
                enemyName: p1.name,
                enemyItems: p1.submitted.items,
                enemyGrid: p1.submitted.grid
            });
        } else {
            // Odd player gets a "bye"
            const pId = playerIds[i];
            const p = room.players.get(pId);
            p.processedResult = true;
            p.score += POINTS.WIN; // Bye counts as win? Or draw? User didn't specify, let's say win.
            p.record.w++;
            io.to(pId).emit('battle_bye', { message: "No opponent this round. You get a bye!" });
            
            // If everyone else is already done (rare case), check for next round
            checkRoundCompletion(roomId);
        }
    }
}

function checkRoundCompletion(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    const allProcessed = Array.from(room.players.values()).every(p => p.processedResult);
    if (allProcessed) {
        if (room.round >= MAX_ROUNDS) {
            endTournament(roomId);
        } else {
            setTimeout(() => startNewRound(roomId), 3000);
        }
    }
}

function endTournament(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.state = 'TOURNAMENT_OVER';
    const leaderboard = Array.from(room.players.values())
        .map(p => ({
            name: p.name,
            score: p.score,
            record: `${p.record.w}-${p.record.d}-${p.record.l}`
        }))
        .sort((a, b) => b.score - a.score);

    io.to(roomId).emit('tournament_results', { leaderboard });
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
