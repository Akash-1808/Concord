import http from 'http';
import { WebSocketServer } from 'ws';
import { activeRooms, setupWebSocket } from './ws.js';
import { pool, redis, saveSnapshot, clearRoomFromRedis } from './persistence.js';

const PORT = process.env.WS_PORT || process.env.PORT || 3001;

// Create a plain Node HTTP server
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
    }
    res.writeHead(404);
    res.end();
});

// Attach WebSocket server to the HTTP server
const wss = new WebSocketServer({ server });
setupWebSocket(wss);

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

async function shutdown(signal: string) {
    console.log(`\n[Server] Recieved ${signal}. Shutting down gracefully...`);
    server.close()
    wss.close();

    for (const [roomId, room] of activeRooms.entries()) {
        console.log(`[Shutdown] Persisting room ${roomId}...`);
        try {
            const snapshot = room.getSnapshot();
            await saveSnapshot(roomId, snapshot.shapes, snapshot.vclock, room.opCount);
            await clearRoomFromRedis(roomId);
            room.destroy();
        } catch (err) {
            console.error(`[Shutdown] Failed to save room ${roomId}:`, err);
        }
    }

    console.log(`[Shutdown] Closing Redis and Postgres pools...`);
    await redis.quit();
    await pool.end();
    console.log(`[Shutdown] ✅ Graceful shutdown complete`);
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));