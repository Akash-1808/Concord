import http from 'http';
import { WebSocketServer } from 'ws';
import { setupWebSocket } from './ws.js';

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