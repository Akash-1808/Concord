import IoRedis from 'ioredis';
import dotenv from 'dotenv';
import type { Shape, VectorClock, Op } from "@concord/shared";
import pg from 'pg';

dotenv.config({
    override: true
});

// ─── Redis Connection ────────────────────────────────────
const Redis = IoRedis.default ?? IoRedis;

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('error', (err) => console.error('[Redis Error]', err));

// ─── Redis Operations ────────────────────────────────────
// Key schema: room:{roomId}:shapes, room:{roomId}:vclock, room:{roomId}:ops

function roomKey(roomId: string, suffix: string): string {
    return `room:${roomId}:${suffix}`;
}

export async function saveRoomToRedis(roomId: string, shapes: Shape[], vclock: VectorClock): Promise<void> {
    const pipeline = redis.pipeline();
    pipeline.set(roomKey(roomId, 'shapes'), JSON.stringify(shapes));
    pipeline.set(roomKey(roomId, 'vclock'), JSON.stringify(vclock));
    await pipeline.exec();
}

export async function loadRoomFromRedis(roomId: string): Promise<{ shapes: Shape[]; vclock: VectorClock } | null> {
    const [shapesJson, vclockJson] = await redis.mget(roomKey(roomId, 'shapes'), roomKey(roomId, 'vclock'))
    if (!shapesJson || !vclockJson) return null;

    return {
        shapes: JSON.parse(shapesJson),
        vclock: JSON.parse(vclockJson)
    };
}

export async function appendOpToRedisLog(roomId: string, op: Op): Promise<void> {
    await redis.rpush(roomKey(roomId, 'ops'), JSON.stringify(op));
}

export async function getOpsFromRedisLog(roomId: string): Promise<Op[]> {
    const opsJson = await redis.lrange(roomKey(roomId, 'ops'), 0, -1);
    return opsJson.map(json => JSON.parse(json) as Op);
}

export async function clearRoomFromRedis(roomId: string): Promise<void> {
    await redis.del(roomKey(roomId, 'shapes'), roomKey(roomId, 'vclock'), roomKey(roomId, 'ops'));
}

// ─── Postgres Connection ─────────────────────────────────

const { Pool } = pg;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://concord:concord@localhost:5433/concord'
});

pool.on('connect', () => console.log('[Postgres] Connected'));
pool.on('error', (err) => console.error('[Postgres Error]', err));

// Re-export snapshot functions from snapshot.ts for convenience
export * from './snapshot.js';