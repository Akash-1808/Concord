import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { Room } from '../src/room.js';
import { WebSocket } from 'ws';
import type { Op } from '@concord/shared';

// Helper: create a mock WebSocket
function createMockWs(): WebSocket {
    return {
        send: vi.fn(),
        readyState: WebSocket.OPEN,
    } as unknown as WebSocket;
}

// Helper: create a valid Op
function createOp(overrides: Partial<Op> = {}): Op {
    return {
        opId: 'op-1',
        clientId: 'client-1',
        roomId: 'room-1',
        vclock: { 'client-1': 1 },
        type: 'create',
        shapeId: 'shape-1',
        payload: {
            id: 'shape-1',
            type: 'rect',
            x: 10, y: 20, w: 100, h: 50,
            rotation: 0, stroke: '#000', fill: '#fff',
            zIndex: 1, version: 1,
        },
        timestamp: Date.now(),
        ...overrides,
    };
}

describe('Room', () => {
    let room: Room;

    beforeEach(() => {
        room = new Room('test-room');
    });

    // ─── Join / Leave Lifecycle ───────────────────────────────

    describe('join', () => {
        it('should add a client to the room', () => {
            const ws = createMockWs();
            room.join('client-1', 'Akash', ws);

            expect(room.clients.size).toBe(1);
            expect(room.clients.has('client-1')).toBe(true);
        });

        it('should store the client name', () => {
            const ws = createMockWs();
            room.join('client-1', 'Akash', ws);

            expect(room.clientNames.get('client-1')).toBe('Akash');
        });

        it('should send a snapshot to the joining client', () => {
            const ws = createMockWs();
            room.join('client-1', 'Akash', ws);

            expect(ws.send).toHaveBeenCalledTimes(1);
            const sentMessage = JSON.parse((ws.send as any).mock.calls[0][0]);
            expect(sentMessage.type).toBe('snapshot');
            expect(sentMessage.shapes).toEqual([]);
            expect(sentMessage.vclock).toEqual({});
        });

        it('should broadcast client-joined to existing clients', () => {
            const ws1 = createMockWs();
            const ws2 = createMockWs();

            room.join('client-1', 'Akash', ws1);
            room.join('client-2', 'Priya', ws2);

            // ws1 should have received: 1 snapshot + 1 client-joined broadcast
            expect(ws1.send).toHaveBeenCalledTimes(2);
            const broadcastMsg = JSON.parse((ws1.send as any).mock.calls[1][0]);
            expect(broadcastMsg.type).toBe('client-joined');
            expect(broadcastMsg.clientId).toBe('client-2');
            expect(broadcastMsg.name).toBe('Priya');
        });

        it('should not add the same client twice', () => {
            const ws = createMockWs();
            room.join('client-1', 'Akash', ws);
            room.join('client-1', 'Akash', ws);

            expect(room.clients.size).toBe(1);
        });
    });

    describe('leave', () => {
        it('should remove a client from the room', () => {
            const ws = createMockWs();
            room.join('client-1', 'Akash', ws);
            room.leave('client-1');

            expect(room.clients.size).toBe(0);
        });

        it('should broadcast client-left to remaining clients', () => {
            const ws1 = createMockWs();
            const ws2 = createMockWs();

            room.join('client-1', 'Akash', ws1);
            room.join('client-2', 'Priya', ws2);

            // Clear mock call history from join
            (ws2.send as any).mockClear();

            room.leave('client-1');

            expect(ws2.send).toHaveBeenCalledTimes(1);
            const msg = JSON.parse((ws2.send as any).mock.calls[0][0]);
            expect(msg.type).toBe('client-left');
            expect(msg.clientId).toBe('client-1');
        });

        it('should do nothing if client is not in the room', () => {
            room.leave('nonexistent-client');
            expect(room.clients.size).toBe(0);
        });
    });

    // ─── Broadcast ───────────────────────────────────────────

    describe('broadcast', () => {
        it('should send message to all clients', () => {
            const ws1 = createMockWs();
            const ws2 = createMockWs();
            room.join('client-1', 'A', ws1);
            room.join('client-2', 'B', ws2);

            (ws1.send as any).mockClear();
            (ws2.send as any).mockClear();

            room.broadcast({ type: 'client-left', clientId: 'someone' });

            expect(ws1.send).toHaveBeenCalledTimes(1);
            expect(ws2.send).toHaveBeenCalledTimes(1);
        });

        it('should exclude the specified client', () => {
            const ws1 = createMockWs();
            const ws2 = createMockWs();
            room.join('client-1', 'A', ws1);
            room.join('client-2', 'B', ws2);

            (ws1.send as any).mockClear();
            (ws2.send as any).mockClear();

            room.broadcast({ type: 'client-left', clientId: 'someone' }, 'client-1');

            expect(ws1.send).not.toHaveBeenCalled();
            expect(ws2.send).toHaveBeenCalledTimes(1);
        });

        it('should skip clients with closed WebSocket connections', () => {
            const ws1 = createMockWs();
            const ws2 = createMockWs();
            room.join('client-1', 'A', ws1);
            room.join('client-2', 'B', ws2);

            // Simulate ws1 closing
            (ws1 as any).readyState = WebSocket.CLOSED;

            (ws1.send as any).mockClear();
            (ws2.send as any).mockClear();

            room.broadcast({ type: 'client-left', clientId: 'someone' });

            expect(ws1.send).not.toHaveBeenCalled();
            expect(ws2.send).toHaveBeenCalledTimes(1);
        });
    });

    // ─── Snapshot ────────────────────────────────────────────

    describe('getSnapshot', () => {
        it('should return empty shapes and clock for a new room', () => {
            const snapshot = room.getSnapshot();
            expect(snapshot.shapes).toEqual([]);
            expect(snapshot.vclock).toEqual({});
        });

        it('should return current shapes after ops are applied', () => {
            const ws = createMockWs();
            room.join('client-1', 'Akash', ws);

            room.handleOp(createOp());

            const snapshot = room.getSnapshot();
            expect(snapshot.shapes.length).toBe(1);
            expect(snapshot.shapes[0].id).toBe('shape-1');
        });
    });

    // ─── Op Handling ─────────────────────────────────────────

    describe('handleOp', () => {
        it('should apply a create op and add the shape to state', () => {
            const ws = createMockWs();
            room.join('client-1', 'Akash', ws);

            room.handleOp(createOp());

            expect(room.state.size).toBe(1);
            expect(room.state.has('shape-1')).toBe(true);
        });

        it('should broadcast op-resolved to all clients', () => {
            const ws1 = createMockWs();
            const ws2 = createMockWs();
            room.join('client-1', 'A', ws1);
            room.join('client-2', 'B', ws2);

            (ws1.send as any).mockClear();
            (ws2.send as any).mockClear();

            room.handleOp(createOp());

            // Both clients should receive op-resolved
            expect(ws1.send).toHaveBeenCalled();
            expect(ws2.send).toHaveBeenCalled();

            const msg1 = JSON.parse((ws1.send as any).mock.calls[0][0]);
            expect(msg1.type).toBe('op-resolved');
            expect(msg1.accepted).toBe(true);
        });

        it('should apply a delete op and remove the shape from state', () => {
            const ws = createMockWs();
            room.join('client-1', 'Akash', ws);

            // First create the shape
            room.handleOp(createOp());
            expect(room.state.size).toBe(1);

            // Then delete it
            room.handleOp(createOp({
                opId: 'op-2',
                type: 'delete',
                vclock: { 'client-1': 2 },
                payload: {},
            }));

            expect(room.state.size).toBe(0);
        });

        it('should merge the op vclock into the room clock', () => {
            const ws = createMockWs();
            room.join('client-1', 'Akash', ws);

            room.handleOp(createOp({ vclock: { 'client-1': 5 } }));

            expect(room.roomClock['client-1']).toBe(5);
        });

        it('should bump shape version on each applied op', () => {
            const ws = createMockWs();
            room.join('client-1', 'Akash', ws);

            room.handleOp(createOp());
            const shape = room.state.get('shape-1')!;
            expect(shape.version).toBe(1);

            room.handleOp(createOp({
                opId: 'op-2',
                type: 'update',
                vclock: { 'client-1': 2 },
                payload: { fill: '#ff0000' },
            }));

            const updatedShape = room.state.get('shape-1')!;
            expect(updatedShape.version).toBe(2);
            expect(updatedShape.fill).toBe('#ff0000');
        });
    });
});
