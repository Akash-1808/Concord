import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { setupWebSocket } from '../src/ws.js';
import { redis, pool } from '../src/persistence.js';

// ─── Test Helpers ────────────────────────────────────────────

let server: http.Server;
let wss: WebSocketServer;
let port: number;

// Spin up a real HTTP + WS server on a random port before each test
function startServer(): Promise<void> {
    return new Promise((resolve) => {
        server = http.createServer();
        wss = new WebSocketServer({ server });
        setupWebSocket(wss);
        server.listen(0, () => {
            port = (server.address() as any).port;
            resolve();
        });
    });
}

function stopServer(): Promise<void> {
    return new Promise((resolve) => {
        // Close all WebSocket connections first
        wss.clients.forEach((ws) => ws.terminate());
        wss.close(() => {
            server.close(() => resolve());
        });
    });
}

// Connect a real WebSocket client to the test server
function connectClient(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
    });
}

// Send a message and wait for a specific response type
function sendAndWaitFor(ws: WebSocket, message: object, expectedType: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timed out waiting for "${expectedType}"`)), 2000);

        const handler = (data: Buffer) => {
            const parsed = JSON.parse(data.toString());
            if (parsed.type === expectedType) {
                clearTimeout(timeout);
                ws.off('message', handler);
                resolve(parsed);
            }
        };

        ws.on('message', handler);
        ws.send(JSON.stringify(message));
    });
}

// Collect all messages received within a time window
function collectMessages(ws: WebSocket, durationMs: number): Promise<any[]> {
    return new Promise((resolve) => {
        const messages: any[] = [];
        const handler = (data: Buffer) => {
            messages.push(JSON.parse(data.toString()));
        };
        ws.on('message', handler);
        setTimeout(() => {
            ws.off('message', handler);
            resolve(messages);
        }, durationMs);
    });
}

// Send a join message
function joinRoom(ws: WebSocket, roomId: string, clientId: string, name: string): Promise<any> {
    return sendAndWaitFor(ws, { type: 'join', roomId, clientId, name }, 'snapshot');
}

// ─── Tests ───────────────────────────────────────────────────

describe('WebSocket Handler (ws.ts)', () => {
    beforeEach(async () => {
        await redis.flushdb();
        await pool.query("DELETE FROM op_log WHERE room_id LIKE 'room-%' AND room_id NOT LIKE 'room-persist-%'; DELETE FROM snapshots WHERE room_id LIKE 'room-%' AND room_id NOT LIKE 'room-persist-%'; DELETE FROM rooms WHERE id LIKE 'room-%' AND id NOT LIKE 'room-persist-%';");
        await startServer();
    });

    afterEach(async () => {
        await stopServer();
    });

    afterAll(async () => {
        await redis.quit();
        await pool.end();
    });

    // ─── Join Flow ───────────────────────────────────────────

    describe('join', () => {
        it('should receive a snapshot on join', async () => {
            const ws = await connectClient();

            const snapshot = await joinRoom(ws, 'room-1', 'client-1', 'Akash');

            expect(snapshot.type).toBe('snapshot');
            expect(snapshot.shapes).toEqual([]);
            expect(snapshot.vclock).toEqual({});

            ws.close();
        });

        it('should notify existing clients when a new client joins', async () => {
            const ws1 = await connectClient();
            const ws2 = await connectClient();

            await joinRoom(ws1, 'room-1', 'client-1', 'Akash');

            // Start listening on ws1 for the join broadcast
            const joinNotification = new Promise<any>((resolve) => {
                ws1.on('message', (data: Buffer) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'client-joined') resolve(msg);
                });
            });

            await joinRoom(ws2, 'room-1', 'client-2', 'Priya');

            const msg = await joinNotification;
            expect(msg.clientId).toBe('client-2');
            expect(msg.name).toBe('Priya');

            ws1.close();
            ws2.close();
        });
    });

    // ─── Leave Flow ──────────────────────────────────────────

    describe('leave', () => {
        it('should broadcast client-left when a client leaves', async () => {
            const ws1 = await connectClient();
            const ws2 = await connectClient();

            await joinRoom(ws1, 'room-1', 'client-1', 'Akash');
            await joinRoom(ws2, 'room-1', 'client-2', 'Priya');

            // Listen for client-left on ws1
            const leaveNotification = new Promise<any>((resolve) => {
                ws1.on('message', (data: Buffer) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'client-left') resolve(msg);
                });
            });

            ws2.send(JSON.stringify({ type: 'leave' }));

            const msg = await leaveNotification;
            expect(msg.type).toBe('client-left');
            expect(msg.clientId).toBe('client-2');

            ws1.close();
            ws2.close();
        });
    });

    // ─── Op Flow ─────────────────────────────────────────────

    describe('op', () => {
        it('should broadcast op-resolved to all clients in the room', async () => {
            const ws1 = await connectClient();
            const ws2 = await connectClient();

            await joinRoom(ws1, 'room-1', 'client-1', 'Akash');
            await joinRoom(ws2, 'room-1', 'client-2', 'Priya');

            // Listen for op-resolved on ws2
            const opResolved = new Promise<any>((resolve) => {
                ws2.on('message', (data: Buffer) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'op-resolved') resolve(msg);
                });
            });

            // ws1 sends a create op
            ws1.send(JSON.stringify({
                type: 'op',
                op: {
                    opId: 'op-1',
                    clientId: 'client-1',
                    roomId: 'room-1',
                    vclock: { 'client-1': 1 },
                    type: 'create',
                    shapeId: 'shape-1',
                    payload: {
                        id: 'shape-1', type: 'rect',
                        x: 10, y: 20, w: 100, h: 50,
                        rotation: 0, stroke: '#000', fill: '#fff',
                        zIndex: 1, version: 1,
                    },
                    timestamp: Date.now(),
                },
            }));

            const msg = await opResolved;
            expect(msg.type).toBe('op-resolved');
            expect(msg.accepted).toBe(true);
            expect(msg.op.shapeId).toBe('shape-1');

            ws1.close();
            ws2.close();
        });

        it('should include the new shape in subsequent snapshots', async () => {
            const ws1 = await connectClient();
            await joinRoom(ws1, 'room-1', 'client-1', 'Akash');

            // Send a create op and wait for it to be resolved
            await sendAndWaitFor(ws1, {
                type: 'op',
                op: {
                    opId: 'op-1',
                    clientId: 'client-1',
                    roomId: 'room-1',
                    vclock: { 'client-1': 1 },
                    type: 'create',
                    shapeId: 'shape-1',
                    payload: {
                        id: 'shape-1', type: 'rect',
                        x: 10, y: 20, w: 100, h: 50,
                        rotation: 0, stroke: '#000', fill: '#fff',
                        zIndex: 1, version: 1,
                    },
                    timestamp: Date.now(),
                },
            }, 'op-resolved');

            // Now a second client joins and should receive the shape in their snapshot
            const ws2 = await connectClient();
            const snapshot = await joinRoom(ws2, 'room-1', 'client-2', 'Priya');

            expect(snapshot.shapes.length).toBe(1);
            expect(snapshot.shapes[0].id).toBe('shape-1');

            ws1.close();
            ws2.close();
        });
    });

    // ─── Error Handling ──────────────────────────────────────

    describe('error handling', () => {
        it('should return error for malformed JSON', async () => {
            const ws = await connectClient();

            const errorMsg = new Promise<any>((resolve) => {
                ws.on('message', (data: Buffer) => {
                    resolve(JSON.parse(data.toString()));
                });
            });

            ws.send('this is not valid json!!!');

            const msg = await errorMsg;
            expect(msg.type).toBe('error');
            expect(msg.message).toBe('Invalid JSON');

            ws.close();
        });

        it('should return error for malformed message structure', async () => {
            const ws = await connectClient();

            const errorMsg = new Promise<any>((resolve) => {
                ws.on('message', (data: Buffer) => {
                    resolve(JSON.parse(data.toString()));
                });
            });

            // Valid JSON, but missing required fields
            ws.send(JSON.stringify({ type: 'join' }));

            const msg = await errorMsg;
            expect(msg.type).toBe('error');
            expect(msg.message).toBe('Malformed message');

            ws.close();
        });

        it('should return error when sending op before joining', async () => {
            const ws = await connectClient();

            const error = await sendAndWaitFor(ws, {
                type: 'op',
                op: {
                    opId: 'op-1',
                    clientId: 'client-1',
                    roomId: 'room-1',
                    vclock: { 'client-1': 1 },
                    type: 'create',
                    shapeId: 'shape-1',
                    payload: {
                        id: 'shape-1', type: 'rect',
                        x: 0, y: 0, w: 10, h: 10,
                        rotation: 0, stroke: '#000', fill: '#fff',
                        zIndex: 1, version: 1,
                    },
                    timestamp: Date.now(),
                },
            }, 'error');

            expect(error.message).toBe('Must join a room first');

            ws.close();
        });

        it('should return error when sending leave before joining', async () => {
            const ws = await connectClient();

            const error = await sendAndWaitFor(ws, { type: 'leave' }, 'error');
            expect(error.message).toBe('Must join a room first');

            ws.close();
        });
    });

    // ─── Disconnect Cleanup ──────────────────────────────────

    describe('disconnect cleanup', () => {
        it('should broadcast client-left when a client disconnects abruptly', async () => {
            const ws1 = await connectClient();
            const ws2 = await connectClient();

            await joinRoom(ws1, 'room-1', 'client-1', 'Akash');
            await joinRoom(ws2, 'room-1', 'client-2', 'Priya');

            // Listen for client-left on ws1
            const leaveNotification = new Promise<any>((resolve) => {
                ws1.on('message', (data: Buffer) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'client-left') resolve(msg);
                });
            });

            // Simulate abrupt disconnect (no leave message sent)
            ws2.terminate();

            const msg = await leaveNotification;
            expect(msg.type).toBe('client-left');
            expect(msg.clientId).toBe('client-2');

            ws1.close();
        });

        it('should destroy the room when all clients leave', async () => {
            const ws1 = await connectClient();
            await joinRoom(ws1, 'room-1', 'client-1', 'Akash');

            // Create a shape so room has state
            await sendAndWaitFor(ws1, {
                type: 'op',
                op: {
                    opId: 'op-1',
                    clientId: 'client-1',
                    roomId: 'room-1',
                    vclock: { 'client-1': 1 },
                    type: 'create',
                    shapeId: 'shape-1',
                    payload: {
                        id: 'shape-1', type: 'rect',
                        x: 10, y: 20, w: 100, h: 50,
                        rotation: 0, stroke: '#000', fill: '#fff',
                        zIndex: 1, version: 1,
                    },
                    timestamp: Date.now(),
                },
            }, 'op-resolved');

            // Last client leaves — room should be destroyed
            ws1.send(JSON.stringify({ type: 'leave' }));

            // Wait a moment for the cleanup to process
            await new Promise((r) => setTimeout(r, 100));
            ws1.close();

            // A new client joins the same roomId — with persistence (Week 6), 
            // the room should be restored from Postgres snapshot
            const ws2 = await connectClient();
            const snapshot = await joinRoom(ws2, 'room-1', 'client-2', 'Priya');

            expect(snapshot.shapes).toHaveLength(1);
            expect(snapshot.shapes[0].id).toBe('shape-1');

            ws2.close();
        });

        it('should destroy the room when the last client disconnects abruptly', async () => {
            const ws1 = await connectClient();
            await joinRoom(ws1, 'room-1', 'client-1', 'Akash');

            // Create a shape
            await sendAndWaitFor(ws1, {
                type: 'op',
                op: {
                    opId: 'op-1',
                    clientId: 'client-1',
                    roomId: 'room-1',
                    vclock: { 'client-1': 1 },
                    type: 'create',
                    shapeId: 'shape-1',
                    payload: {
                        id: 'shape-1', type: 'rect',
                        x: 10, y: 20, w: 100, h: 50,
                        rotation: 0, stroke: '#000', fill: '#fff',
                        zIndex: 1, version: 1,
                    },
                    timestamp: Date.now(),
                },
            }, 'op-resolved');

            // Simulate abrupt disconnect (no leave message)
            ws1.terminate();
            await new Promise((r) => setTimeout(r, 100));

            // New client joins same room — should hydrate from persistence
            const ws2 = await connectClient();
            const snapshot = await joinRoom(ws2, 'room-1', 'client-2', 'Priya');

            expect(snapshot.shapes).toHaveLength(1);
            expect(snapshot.shapes[0].id).toBe('shape-1');

            ws2.close();
        });
    });

    // ─── Presence ────────────────────────────────────────────

    describe('presence', () => {
        it('should forward presence to other clients in the room', async () => {
            const ws1 = await connectClient();
            const ws2 = await connectClient();

            await joinRoom(ws1, 'room-1', 'client-1', 'Akash');
            await joinRoom(ws2, 'room-1', 'client-2', 'Priya');

            // Listen for presence on ws2
            const presenceMsg = new Promise<any>((resolve) => {
                ws2.on('message', (data: Buffer) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'presence') resolve(msg);
                });
            });

            ws1.send(JSON.stringify({
                type: 'presence',
                cursor: { x: 100, y: 200 },
                selection: ['shape-1'],
            }));

            const msg = await presenceMsg;
            expect(msg.type).toBe('presence');
            expect(msg.clientId).toBe('client-1');
            expect(msg.cursor).toEqual({ x: 100, y: 200 });
            expect(msg.selection).toEqual(['shape-1']);

            ws1.close();
            ws2.close();
        });
    });
});
