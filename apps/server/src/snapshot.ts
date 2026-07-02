import { pool } from './persistence.js';
import type { Shape, VectorClock, Op } from "@concord/shared";

export async function saveSnapshot(
    roomId: string,
    shapes: Shape[],
    vclock: VectorClock,
    opCount: number
): Promise<void> {
    await pool.query(`
        WITH upsert_room AS (
            INSERT INTO rooms (id, name) VALUES ($1, $1)
            ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
            RETURNING id
        )
        INSERT INTO snapshots (room_id, shapes, vclock, op_count)
        VALUES ((SELECT id FROM upsert_room), $2, $3, $4)`,
        [roomId, JSON.stringify(shapes), JSON.stringify(vclock), opCount]
    );
    console.log(`[Postgres] Snapshot saved for room ${roomId} (${opCount} ops)`);
}

export async function loadLatestSnapshot(roomId: string): Promise<{ shapes: Shape[]; vclock: VectorClock; opCount: number; timestamp: number } | null> {
    const result = await pool.query(`
        SELECT shapes, vclock, op_count, EXTRACT(EPOCH FROM created_at) * 1000 AS timestamp
        FROM snapshots
        WHERE room_id = $1
        ORDER BY created_at DESC
        LIMIT 1`, [roomId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
        shapes: row.shapes,
        vclock: row.vclock,
        opCount: row.op_count,
        timestamp: Number(row.timestamp)
    };
}

export async function saveOpToLog(roomId: string, op: Op): Promise<void> {
    await pool.query(`
        WITH upsert_room AS (
            INSERT INTO rooms (id, name) VALUES ($1, $1)
            ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
            RETURNING id
        )
        INSERT INTO op_log (room_id, op, applied_at)
        VALUES ((SELECT id FROM upsert_room), $2, NOW())`,
        [roomId, JSON.stringify(op)]
    );
}

export async function getOpsSince(roomId: string, snapshotTimestamp?: number): Promise<Op[]> {
    let result;
    if (snapshotTimestamp && snapshotTimestamp > 0) {
        result = await pool.query(`
            SELECT op FROM op_log
            WHERE room_id = $1 AND EXTRACT(EPOCH FROM applied_at) * 1000 > $2
            ORDER BY applied_at ASC`,
            [roomId, snapshotTimestamp]
        );
    } else {
        result = await pool.query(`
            SELECT op FROM op_log
            WHERE room_id = $1
            ORDER BY applied_at ASC`,
            [roomId]
        );
    }
    return result.rows.map(row => row.op as Op);
}

// Helper for snapshot triggering (every N ops or M seconds)
export class SnapshotManager {
    private opCounts = new Map<string, number>();
    private timers = new Map<string, NodeJS.Timeout>();
    private readonly OP_THRESHOLD = 50; // N ops
    private readonly TIME_THRESHOLD_MS = 60000; // M seconds (60s)

    constructor(private onSnapshotRequired: (roomId: string) => Promise<void>) { }

    startTracking(roomId: string, initialOpCount: number = 0): void {
        this.opCounts.set(roomId, initialOpCount);
        if (!this.timers.has(roomId)) {
            const timer = setInterval(() => {
                this.triggerSnapshot(roomId);
            }, this.TIME_THRESHOLD_MS);
            this.timers.set(roomId, timer);
        }
    }

    async recordOp(roomId: string): Promise<void> {
        const count = (this.opCounts.get(roomId) || 0) + 1;
        this.opCounts.set(roomId, count);
        if (count >= this.OP_THRESHOLD) {
            await this.triggerSnapshot(roomId);
        }
    }

    async triggerSnapshot(roomId: string): Promise<void> {
        this.opCounts.set(roomId, 0);
        try {
            await this.onSnapshotRequired(roomId);
        } catch (err) {
            console.error(`[SnapshotManager] Failed to save snapshot for ${roomId}:`, err);
        }
    }

    stopTracking(roomId: string): void {
        const timer = this.timers.get(roomId);
        if (timer) {
            clearInterval(timer);
            this.timers.delete(roomId);
        }
        this.opCounts.delete(roomId);
    }
}
