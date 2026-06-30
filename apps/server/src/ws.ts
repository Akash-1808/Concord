import { WebSocketServer, WebSocket } from 'ws';
import { Room } from './room.js';
import { PresenceManager } from './presence.js';
import { clientMessageSchema } from '@concord/shared';

// Global room registry
const activeRooms = new Map<string, Room>();
const roomPresence = new Map<string, PresenceManager>();

export function setupWebSocket(wss: WebSocketServer) {
    wss.on('connection', (ws: WebSocket) => {
        // Track the current client's room and ID so we can clean up on unexpected disconnects
        let currentRoomId: string | null = null;
        let currentClientId: string | null = null;

        // Rate limiting: max 50 messages per second per connection
        let messageCount = 0;
        const rateLimitInterval = setInterval(() => { messageCount = 0; }, 1000);

        ws.on('message', (data: Buffer) => {
            // 1. Rate Limiting Check
            messageCount++;
            if (messageCount > 50) {
                ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded' }));
                return;
            }

            try {
                const rawData = JSON.parse(data.toString());

                // 2. Zod Validation Check
                const result = clientMessageSchema.safeParse(rawData);
                if (!result.success) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Malformed message' }));
                    return;
                }

                const message = result.data;

                switch (message.type) {
                    case 'join': {
                        const { roomId, clientId, name } = message;
                        currentRoomId = roomId;
                        currentClientId = clientId;

                        // Get or create room
                        let room = activeRooms.get(roomId);
                        if (!room) {
                            room = new Room(roomId);
                            activeRooms.set(roomId, room);
                            roomPresence.set(roomId, new PresenceManager());
                        }

                        // Join the room (which handles sending the initial snapshot and broadcasting join)
                        room.join(clientId, name, ws);

                        // Send existing users' cursor positions to the new joiner
                        const pm = roomPresence.get(roomId)!;
                        for (const [existingClientId, data] of pm.getAll(clientId)) {
                            ws.send(JSON.stringify({
                                type: 'presence',
                                clientId: existingClientId,
                                cursor: data.cursor,
                                selection: data.selection
                            }));
                        }
                        break;
                    }
                    case 'leave': {
                        // 3. Unknown/Unjoined Room Check
                        if (!currentRoomId || !currentClientId) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Must join a room first' }));
                            return;
                        }
                        const room = activeRooms.get(currentRoomId);
                        if (room) {
                            // Clean up presence for leaving client
                            roomPresence.get(currentRoomId)?.remove(currentClientId);
                            room.leave(currentClientId);
                            checkRoomEmpty(currentRoomId, room);
                        }
                        currentRoomId = null;
                        break;
                    }
                    case 'op': {
                        if (!currentRoomId) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Must join a room first' }));
                            return;
                        }
                        const room = activeRooms.get(currentRoomId);
                        if (room) {
                            room.handleOp(message.op);
                        }
                        break;
                    }
                    case 'presence': {
                        if (!currentRoomId || !currentClientId) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Must join a room first' }));
                            return;
                        }
                        const room = activeRooms.get(currentRoomId);
                        if (room) {
                            // Store latest presence so new joiners can see existing cursors
                            const clientName = room.clientNames.get(currentClientId) || currentClientId;
                            roomPresence.get(currentRoomId)?.update(
                                currentClientId, message.cursor, message.selection, clientName
                            );

                            room.broadcast({
                                type: 'presence',
                                clientId: currentClientId,
                                cursor: message.cursor,
                                selection: message.selection
                            }, currentClientId); // Exclude the sender
                        }
                        break;
                    }
                    case 'snapshot-request': {
                        if (!currentRoomId) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Must join a room first' }));
                            return;
                        }
                        const room = activeRooms.get(currentRoomId);
                        if (room) {
                            ws.send(JSON.stringify({ type: 'snapshot', ...room.getSnapshot() }));
                        }
                        break;
                    }
                }
            } catch (err) {
                console.error('Failed to parse message:', err);
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
            }
        });

        ws.on('close', () => {
            clearInterval(rateLimitInterval); // Stop memory leaks from the timer!

            // If the socket drops abruptly, clean up the client from the room
            if (currentRoomId && currentClientId) {
                // Clean up presence for disconnected client
                roomPresence.get(currentRoomId)?.remove(currentClientId);

                const room = activeRooms.get(currentRoomId);
                if (room) {
                    room.leave(currentClientId);
                    checkRoomEmpty(currentRoomId, room);
                }
            }
        });
    });
}

// Handles cleaning up empty rooms and triggering the persistence layer
function checkRoomEmpty(roomId: string, room: Room) {
    if (room.clients.size === 0) {
        console.log(`Room ${roomId} is empty. Preparing to save snapshot...`);
        const snapshot = room.getSnapshot();

        // TODO: Call persistence.ts to save snapshot to Postgres

        activeRooms.delete(roomId);
        roomPresence.delete(roomId); // Clean up presence data for the room
        console.log(`Room ${roomId} destroyed from memory.`);
    }
}
