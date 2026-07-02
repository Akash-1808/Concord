import type { Shape, VectorClock, ServerMessage, Op } from "@concord/shared";
import { merge } from "@concord/shared";
import { resolveOp } from "@concord/conflict";
import { WebSocket } from 'ws';
import {
    saveRoomToRedis,
    loadRoomFromRedis,
    appendOpToRedisLog,
    saveSnapshot,
    loadLatestSnapshot,
    saveOpToLog,
    getOpsSince,
    SnapshotManager
} from './persistence.js';

export class Room {
    id: string;
    clients: Map<string, WebSocket>;
    clientNames: Map<string, string>;
    state: Map<string, Shape>;         // current shape state
    clocks: Map<string, VectorClock>;  // last vclock per shapeId
    lastOpTypePerShape: Map<string, Op['type']>;
    lastClientIdPerShape: Map<string, string>;
    roomClock: VectorClock;            // merged clock for the room
    opCount: number = 0;
    private initPromise: Promise<void> | null = null;
    private snapshotManager: SnapshotManager;

    constructor(id: string) {
        this.id = id;
        this.clients = new Map();
        this.clientNames = new Map();
        this.state = new Map();
        this.clocks = new Map();
        this.lastOpTypePerShape = new Map();
        this.lastClientIdPerShape = new Map();
        this.roomClock = {};

        this.snapshotManager = new SnapshotManager(async (roomId) => {
            await saveSnapshot(
                roomId,
                Array.from(this.state.values()),
                this.roomClock,
                this.opCount
            );
        });
    }

    async init(): Promise<void> {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = (async () => {
            try {
                // 1. Check Redis first (hot state)
                const redisState = await loadRoomFromRedis(this.id);
                if (redisState) {
                    for (const shape of redisState.shapes) {
                        this.state.set(shape.id, shape);
                    }
                    this.roomClock = redisState.vclock;
                    console.log(`[Room ${this.id}] Hydrated from Redis (${this.state.size} shapes)`);
                    this.snapshotManager.startTracking(this.id, this.opCount);
                    return;
                }

                // 2. Check Postgres snapshot (cold state)
                const snapshot = await loadLatestSnapshot(this.id);
                if (snapshot) {
                    for (const shape of snapshot.shapes) {
                        this.state.set(shape.id, shape);
                    }
                    this.roomClock = snapshot.vclock;
                    this.opCount = snapshot.opCount;

                    // Replay any ops applied since the snapshot was taken
                    const opsSince = await getOpsSince(this.id, snapshot.timestamp);
                    for (const op of opsSince) {
                        this.applyResolvedOpQuietly(op);
                    }

                    // Warm up Redis so active ops are fast
                    await saveRoomToRedis(this.id, Array.from(this.state.values()), this.roomClock);
                    console.log(`[Room ${this.id}] Hydrated from Postgres (${this.state.size} shapes, ${opsSince.length} ops replayed)`);
                } else {
                    console.log(`[Room ${this.id}] Initialized new empty room`);
                }

                this.snapshotManager.startTracking(this.id, this.opCount);
            } catch (err) {
                console.error(`[Room ${this.id}] Hydration error:`, err);
                this.snapshotManager.startTracking(this.id, 0);
            }
        })();

        return this.initPromise;
    }

    private applyResolvedOpQuietly(resolvedOp: Op): void {
        if (resolvedOp.type === 'delete') {
            this.state.delete(resolvedOp.shapeId);
            this.clocks.delete(resolvedOp.shapeId);
            this.lastOpTypePerShape.delete(resolvedOp.shapeId);
            this.lastClientIdPerShape.delete(resolvedOp.shapeId);
        } else {
            const existingShape = this.state.get(resolvedOp.shapeId) || {} as Shape;
            this.state.set(resolvedOp.shapeId, {
                ...existingShape,
                ...resolvedOp.payload,
                id: resolvedOp.shapeId,
                type: (resolvedOp.payload.type || existingShape.type) as any,
                version: (existingShape.version || 0) + 1
            });

            this.clocks.set(resolvedOp.shapeId, resolvedOp.vclock);
            this.lastOpTypePerShape.set(resolvedOp.shapeId, resolvedOp.type);
            this.lastClientIdPerShape.set(resolvedOp.shapeId, resolvedOp.clientId);
        }
        this.roomClock = merge(this.roomClock, resolvedOp.vclock);
        this.opCount++;
    }

    join(clientId: string, name: string, ws: WebSocket): void {
        if (this.clients.has(clientId)) return;
        this.clients.set(clientId, ws);
        this.clientNames.set(clientId, name);

        // Send current room snapshot to the joining client
        ws.send(JSON.stringify({ type: 'snapshot', ...this.getSnapshot() }));

        // Broadcast to others that a client joined
        this.broadcast({ type: 'client-joined', clientId, name }, clientId);
    }

    leave(clientId: string): void {
        if (!this.clients.has(clientId)) return;
        this.clients.delete(clientId);

        // Broadcast to others that a client left
        this.broadcast({ type: 'client-left', clientId });
    }

    broadcast(message: ServerMessage, exclude?: string): void {
        const payload = JSON.stringify(message);
        for (const [clientId, ws] of this.clients.entries()) {
            if (clientId !== exclude && ws.readyState === WebSocket.OPEN) {
                ws.send(payload);
            }
        }
    }

    getSnapshot(): { shapes: Shape[]; vclock: VectorClock } {
        return { shapes: Array.from(this.state.values()), vclock: this.roomClock };
    }

    handleOp(op: Op): void {
        const resolution = resolveOp(
            this.state,
            this.clocks,
            this.lastOpTypePerShape,
            this.lastClientIdPerShape,
            op
        );

        if (!resolution.accepted) {
            return;
        }

        const resolvedOp = resolution.resolvedOp;
        this.applyResolvedOpQuietly(resolvedOp);

        // Persist to Redis & Postgres asynchronously without blocking WS broadcast
        saveRoomToRedis(this.id, Array.from(this.state.values()), this.roomClock).catch(console.error);
        appendOpToRedisLog(this.id, resolvedOp).catch(console.error);
        saveOpToLog(this.id, resolvedOp).catch(console.error);

        this.snapshotManager.recordOp(this.id);

        // Broadcast the fully resolved op to all clients
        this.broadcast({ type: 'op-resolved', op: resolvedOp, accepted: true });
    }

    destroy(): void {
        this.snapshotManager.stopTracking(this.id);
    }
}