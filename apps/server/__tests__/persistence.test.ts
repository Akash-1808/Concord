import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Room } from '../src/room.js';
import {
    pool,
    redis,
    saveSnapshot,
    loadLatestSnapshot,
    saveOpToLog,
    saveRoomToRedis,
    loadRoomFromRedis,
    clearRoomFromRedis
} from '../src/persistence.js';
import type { Shape, Op } from '@concord/shared';

const mockShape1: Shape = {
    id: 'shape-101',
    type: 'rect',
    x: 0, y: 0, w: 50, h: 50,
    rotation: 0, fill: '#ff0000', stroke: '#000000',
    zIndex: 1, version: 1
};

const mockShape2: Shape = {
    id: 'shape-102',
    type: 'ellipse',
    x: 100, y: 100, w: 80, h: 80,
    rotation: 0, fill: '#00ff00', stroke: '#000000',
    zIndex: 2, version: 1
};

const mockOp: Op = {
    opId: 'op-102',
    clientId: 'client-1',
    roomId: 'room-persist-2',
    vclock: { 'client-1': 2 },
    type: 'create',
    shapeId: 'shape-102',
    payload: mockShape2,
    timestamp: Date.now()
};

describe('Persistence Layer (Week 6.5)', () => {
    beforeEach(async () => {
        await redis.flushdb();
        await pool.query("DELETE FROM op_log WHERE room_id LIKE 'room-persist-%'; DELETE FROM snapshots WHERE room_id LIKE 'room-persist-%'; DELETE FROM rooms WHERE id LIKE 'room-persist-%';");
    });

    afterAll(async () => {
        await redis.quit();
        await pool.end();
    });

    it('should save and load snapshot round-trip in Postgres', async () => {
        const roomId = 'room-persist-1';
        const vclock = { 'client-1': 5 };
        const opCount = 15;

        await saveSnapshot(roomId, [mockShape1], vclock, opCount);

        const loaded = await loadLatestSnapshot(roomId);
        expect(loaded).toBeDefined();
        expect(loaded?.shapes).toEqual([mockShape1]);
        expect(loaded?.vclock).toEqual(vclock);
        expect(loaded?.opCount).toBe(opCount);
    });

    it('should hydrate room from Postgres snapshot + replay newer ops from op_log', async () => {
        const roomId = 'room-persist-2';
        const vclock = { 'client-1': 1 };
        const opCount = 1;

        // Save initial snapshot
        await saveSnapshot(roomId, [mockShape1], vclock, opCount);

        // Save a newer op that happened after the snapshot
        await new Promise(r => setTimeout(r, 50)); // ensure timestamp is strictly after
        await saveOpToLog(roomId, mockOp);

        const room = new Room(roomId);
        await room.init();

        expect(room.state.size).toBe(2);
        expect(room.state.get('shape-101')).toEqual(mockShape1);
        expect(room.state.get('shape-102')).toEqual(mockShape2);
        expect(room.opCount).toBe(2); // 1 from snapshot + 1 replayed op
    });

    it('should clean up room state from Redis on clearRoomFromRedis', async () => {
        const roomId = 'room-persist-3';
        const vclock = { 'client-1': 1 };

        await saveRoomToRedis(roomId, [mockShape1], vclock);
        const beforeClear = await loadRoomFromRedis(roomId);
        expect(beforeClear?.shapes).toEqual([mockShape1]);

        await clearRoomFromRedis(roomId);
        const afterClear = await loadRoomFromRedis(roomId);
        expect(afterClear).toBeNull();
    });
});
