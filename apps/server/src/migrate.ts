import pg from 'pg';
import dotenv from 'dotenv';
import console from 'node:console';

dotenv.config({ path: 'apps/server/.env', override: true });

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://concord:concord@localhost:5433/concord'
})

async function migrate() {
    console.log('[Migrate] Running database migrations...');

    await pool.query(`
        CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
        shapes JSONB NOT NULL,
        vclock JSONB NOT NULL,
        op_count INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_snapshots_room ON snapshots(
        room_id, created_at DESC
        );

        CREATE TABLE IF NOT EXISTS op_log (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            room_id     TEXT REFERENCES rooms(id) ON DELETE CASCADE,
            op          JSONB NOT NULL,
            applied_at  TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_oplog_room 
            ON op_log(room_id, applied_at);
        `);
    console.log('[Migrate] ✅ All tables created successfully!');
    await pool.end();
}

migrate().catch(console.error);