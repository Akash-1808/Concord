# Concord — Real-Time Collaborative Whiteboard

> **claude.md** — the single source of truth for architecture, conventions, and
> development guidelines. Every contributor (human or AI) should read this
> before touching the codebase.

---

## 1. Project Identity

| Field | Value |
|-------|-------|
| **Name** | Concord |
| **Tagline** | Figma-style collaborative whiteboard with hand-rolled conflict resolution |
| **License** | See `LICENSE` |
| **Language** | TypeScript (strict mode, no `any`) |
| **Runtime** | Node 20+ (server), modern browsers (client) |

---

## 2. Architecture Overview

Concord follows a **client-optimistic, server-authoritative** model. The client
never blocks on the network — every local edit applies instantly and is
reconciled in the background. The server is intentionally "dumb": it does no
rendering, only ordering and conflict resolution.

```
┌─────────────────────────────────────────────┐
│                   CLIENT                     │
│  ┌────────────┐  ┌────────────┐  ┌─────────┐ │
│  │  Renderer   │  │ Local state │  │ Op log  │ │
│  │ (Canvas)    │  │ (shapes,    │  │(pending,│ │
│  │             │  │  undo stack)│  │ applied)│ │
│  └─────┬──────┘  └─────┬───────┘  └────┬────┘ │
│        └───────────────┴───────────────┘      │
│                  WebSocket client             │
│              Presence (cursors, sel.)         │
└────────────────────┬──────────────────────────┘
                      │ ops + presence over WS
┌────────────────────▼──────────────────────────┐
│                   SERVER                       │
│  ┌────────────┐ ┌─────────────────┐ ┌────────┐ │
│  │   Room      │ │ Conflict        │ │Broadcast│ │
│  │  manager    │ │ resolver        │ │        │ │
│  │             │ │ (vector clocks) │ │        │ │
│  └────────────┘ └─────────────────┘ └────────┘ │
│              Persistence layer                  │
│     Postgres (snapshots) + Redis (active log)   │
└──────────────────────────────────────────────────┘
```

### Core Design Principles

1. **Client never blocks on network** — optimistic updates, background reconciliation.
2. **Server is dumb** — no rendering, no canvas logic. Only ordering + conflict resolution.
3. **Field-level conflict resolution** — concurrent `move` (x, y) and `recolor` (fill) on the same shape don't clobber each other.
4. **No CRDT library** — vector clocks + per-field LWW implemented from scratch. Domain-specific resolver, not a general-purpose CRDT.
5. **Causal ordering via vector clocks** — not wall-clock timestamps. Timestamps are kept for UX/tiebreak only.

---

## 3. Repository Structure

```
concord/
├── claude.md                  # This file — project guide
├── package.json               # Root workspace config
├── turbo.json                 # Turborepo pipeline config
│
├── packages/
│   ├── shared/                # Shared types, constants, utilities
│   │   ├── src/
│   │   │   ├── types.ts       # Shape, Op, VectorClock interfaces
│   │   │   ├── constants.ts   # Magic numbers, config defaults
│   │   │   └── vclock.ts      # Vector clock operations (increment, merge, compare)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── conflict/              # Conflict resolution engine (pure functions)
│       ├── src/
│       │   ├── resolver.ts    # Core resolution algorithm
│       │   ├── matrix.ts      # Conflict matrix rules
│       │   └── apply.ts       # applyOp(state, op) → newState
│       ├── __tests__/
│       │   ├── resolver.test.ts
│       │   ├── matrix.test.ts
│       │   └── apply.test.ts
│       ├── package.json
│       └── tsconfig.json
│
├── apps/
│   ├── server/                # WebSocket server + persistence
│   │   ├── src/
│   │   │   ├── index.ts       # Entry point, HTTP + WS server setup
│   │   │   ├── room.ts        # Room manager — join/leave/broadcast
│   │   │   ├── ws.ts          # WebSocket handler — message routing
│   │   │   ├── persistence.ts # Redis (active) + Postgres (snapshots)
│   │   │   ├── snapshot.ts    # Snapshot creation & loading
│   │   │   └── presence.ts    # Cursor/selection ephemeral state
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── client/                # Canvas-based frontend (Vite + React)
│       ├── src/
│       │   ├── main.tsx       # App entry
│       │   ├── App.tsx        # Root component, room routing
│       │   ├── canvas/
│       │   │   ├── Renderer.ts       # Canvas 2D drawing loop (rAF)
│       │   │   ├── SpatialIndex.ts   # Quadtree for hit-testing
│       │   │   ├── Camera.ts         # Pan/zoom transform
│       │   │   └── HitTest.ts        # Point-in-shape, selection
│       │   ├── state/
│       │   │   ├── ShapeStore.ts      # Local shape state + op log
│       │   │   ├── UndoManager.ts     # Command pattern undo/redo
│       │   │   ├── OpQueue.ts         # Pending ops queue + throttle
│       │   │   └── Reconciler.ts      # Patch local state from server responses
│       │   ├── net/
│       │   │   ├── WebSocketClient.ts # Connection, reconnect, queue drain
│       │   │   └── Presence.ts        # Cursor broadcast (20 Hz throttle)
│       │   ├── tools/
│       │   │   ├── SelectTool.ts
│       │   │   ├── RectTool.ts
│       │   │   ├── EllipseTool.ts
│       │   │   ├── LineTool.ts
│       │   │   ├── PathTool.ts
│       │   │   └── TextTool.ts
│       │   ├── ui/
│       │   │   ├── Toolbar.tsx
│       │   │   ├── PropertyPanel.tsx
│       │   │   ├── CursorOverlay.tsx
│       │   │   └── ConnectionStatus.tsx
│       │   └── styles/
│       │       └── index.css
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
│
├── infra/                     # Docker, deployment configs
│   ├── docker-compose.yml     # Local dev: Postgres + Redis
│   └── Dockerfile.server
│
└── k6/                        # Load testing
    ├── concurrent-ops.js
    └── convergence-check.js
```

---

## 4. Data Model

### 4.1 Shape

```ts
interface Shape {
  id: string;                         // UUID v4
  type: 'rect' | 'ellipse' | 'line' | 'path' | 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;                   // degrees, 0–360
  fill: string;                       // hex color, e.g. "#3b82f6"
  stroke: string;                     // hex color
  zIndex: number;
  points?: [number, number][];        // for path/line types only
  text?: string;                      // for text type only
  version: number;                    // bumped on every applied op
}
```

### 4.2 Operation (the unit of sync)

```ts
interface Op {
  opId: string;                       // UUID v4, globally unique
  clientId: string;
  roomId: string;
  vclock: Record<string, number>;     // vector clock at creation time
  type: 'create' | 'update' | 'delete' | 'move' | 'resize';
  shapeId: string;
  payload: Partial<Shape>;            // only the changed fields
  timestamp: number;                  // wall clock — tiebreak/UX only, NEVER authoritative
}
```

> **Critical invariant:** `payload` carries only changed fields. This is what
> makes field-level conflict resolution possible.

### 4.3 Vector Clock

```ts
type VectorClock = Record<string, number>;

// Operations (implemented in packages/shared/src/vclock.ts):
function increment(clock: VectorClock, clientId: string): VectorClock;
function merge(a: VectorClock, b: VectorClock): VectorClock;
function compare(a: VectorClock, b: VectorClock): 'before' | 'after' | 'concurrent';
```

- On every **local op**: increment own counter, attach full clock.
- On receiving a **remote op**: `merge()` clocks, then increment own.
- `compare()` determines if ops are causally ordered or concurrent.

---

## 5. Conflict Resolution

### 5.1 Why Not a Generic CRDT

This project **deliberately avoids** CRDT libraries (Yjs, Automerge). Building
conflict resolution by hand means:

- Implementing exactly the conflict cases that matter for shapes.
- Being able to explain every line of the resolver.
- Not paying the memory/complexity cost of a general-purpose algorithm.

> **What to claim:** "Designed and implemented a causality-aware conflict
> resolution scheme using vector clocks and field-level LWW." \
> **What NOT to claim:** "Built a CRDT." This is a domain-specific resolver.

### 5.2 Conflict Matrix

| Concurrent ops on same shape | Resolution rule |
|-------------------------------|----------------|
| `move` + `move` | Field-level LWW on `(x, y)` using vclock; tie → lower `clientId` wins |
| `move` + `resize` | No conflict — different fields `(x,y)` vs `(w,h)` — both apply |
| `edit` (color/text) + `delete` | **Delete wins**; edit is dropped; originator notified shape is gone |
| `resize` from opposite corners | LWW on `(x, y, w, h)` as one unit — partial merge produces invalid geometry |
| `create` with same id (retry) | First-seen-by-server wins; duplicate `create` → no-op |

### 5.3 Resolution Algorithm (Server-Side)

```
1. Receive Op from client.
2. Compare Op.vclock against server's last-known clock for Op.shapeId.
3. If causally AFTER → apply directly, no conflict.
4. If CONCURRENT → look up conflict matrix rule for (existingOp.type, newOp.type).
   a. Apply field-level resolution per the matrix.
   b. The resolved op MAY differ from what the client sent.
5. Bump shape.version.
6. Broadcast resolved op to ALL clients in room (including originator).
7. Client reconciliation: if resolved op ≠ optimistic guess, patch local state.
   NEVER replay the entire op log — only patch the affected shape.
```

---

## 6. Networking

| Aspect | Detail |
|--------|--------|
| **Transport** | WebSocket, one connection per client, joined to a room channel |
| **Client → Server** | Ops + throttled presence (cursor/selection at ~20 Hz) |
| **Server → Client** | Resolved ops + presence broadcasts + snapshot on join |
| **Presence** | Never persisted, never versioned — purely ephemeral |
| **Reconnect** | Queue local ops while offline. On reconnect: send queued ops with pre-disconnect vclock, then request fresh snapshot (not full op-log replay) |

### Message Protocol (WebSocket)

```ts
// Client → Server
type ClientMessage =
  | { type: 'op'; op: Op }
  | { type: 'join'; roomId: string; clientId: string }
  | { type: 'leave' }
  | { type: 'presence'; cursor: { x: number; y: number }; selection: string[] }
  | { type: 'snapshot-request' };

// Server → Client
type ServerMessage =
  | { type: 'op-resolved'; op: Op; accepted: boolean }
  | { type: 'presence'; clientId: string; cursor: { x: number; y: number }; selection: string[] }
  | { type: 'snapshot'; shapes: Shape[]; vclock: VectorClock }
  | { type: 'client-joined'; clientId: string }
  | { type: 'client-left'; clientId: string }
  | { type: 'error'; message: string; opId?: string };
```

---

## 7. Persistence

| Store | Purpose | Lifecycle |
|-------|---------|-----------|
| **Redis** | Active room state — current op log tail + shape state for rooms with connected clients | Ephemeral — cleared when last client disconnects (after snapshotting) |
| **Postgres** | Durable snapshots, taken every N ops or M seconds, and on last-client-disconnect | Permanent — new clients get latest snapshot + ops since |

### Schema (Postgres)

```sql
CREATE TABLE rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES rooms(id) ON DELETE CASCADE,
  shapes      JSONB NOT NULL,            -- full shape state at snapshot time
  vclock      JSONB NOT NULL,            -- vector clock at snapshot time
  op_count    INTEGER NOT NULL,          -- ops applied since room creation
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_snapshots_room ON snapshots(room_id, created_at DESC);

CREATE TABLE op_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES rooms(id) ON DELETE CASCADE,
  op          JSONB NOT NULL,
  applied_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_oplog_room ON op_log(room_id, applied_at);
```

---

## 8. Rendering & Performance

| Concern | Approach |
|---------|----------|
| **Rendering** | Canvas 2D (not SVG/DOM) — DOM nodes don't scale past hundreds of shapes |
| **Spatial index** | Quadtree for hit-testing and viewport culling |
| **Render loop** | `requestAnimationFrame` — decoupled from input. Input handlers mutate state, never draw directly |
| **Undo/redo** | Command pattern (`{ execute(), undo() }`) — snapshots don't compose with remote ops mid-stack |
| **Draw optimization** | Only redraw dirty regions when possible; full redraw on pan/zoom |

---

## 9. Coding Conventions

### General

- **TypeScript strict mode** — no `any`, no `ts-ignore` without a comment explaining why.
- **Pure functions** for all conflict resolution logic — no side effects, fully testable.
- **Explicit error handling** — no swallowed promises, no empty catch blocks.
- **Named exports** — no default exports except for React components.

### Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | `PascalCase.ts` for classes/components, `camelCase.ts` for utils | `ShapeStore.ts`, `vclock.ts` |
| Interfaces | `PascalCase`, no `I` prefix | `Shape`, `Op`, `VectorClock` |
| Functions | `camelCase` | `applyOp`, `resolveConflict` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_SHAPES_PER_ROOM` |
| Test files | `*.test.ts` co-located in `__tests__/` | `resolver.test.ts` |

### Git

- **Conventional commits**: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- **Branch naming**: `feat/conflict-resolver`, `fix/reconnect-queue`
- **PR scope**: one logical change per PR — don't bundle unrelated changes.

### Testing

- **Unit tests**: All conflict resolution logic must be tested as pure functions.
  - `applyOp(state, op) → newState` — no browser, no network.
  - Every row in the conflict matrix must have at least one test.
- **Integration tests**: WebSocket message flow — op → resolve → broadcast.
- **Load tests**: k6 scripts simulating N concurrent clients; assert convergence.
- **Test runner**: Vitest.
- **Coverage target**: ≥ 90% on `packages/conflict/`.

---

## 10. Development Setup

```bash
# Prerequisites: Node 20+, Docker (for Postgres + Redis)

# Clone and install
git clone <repo-url> && cd concord
npm install

# Start infrastructure
docker compose -f infra/docker-compose.yml up -d

# Run all packages in dev mode
npm run dev

# Run tests
npm run test

# Run specific package tests
npm run test --workspace=packages/conflict
```

### Environment Variables

```env
# Server
PORT=3001
WS_PORT=3001
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://concord:concord@localhost:5432/concord

# Client
VITE_WS_URL=ws://localhost:3001
```

---

## 11. Deployment

| Component | Target | Why |
|-----------|--------|-----|
| Frontend (canvas app) | Vercel | Static/SSR hosting, fast CDN |
| WebSocket server | Fly.io or Railway | Persistent connections; Vercel doesn't support long-lived WS |
| Postgres | Railway / Supabase | Managed, low setup cost |
| Redis | Upstash | Managed, serverless-friendly pricing |

---

## 12. Non-Goals (Explicitly Out of Scope)

- **Rich text editing** — shapes have a `text` field, but no inline formatting.
- **Image/video embedding** — shapes are geometric primitives only.
- **Version history / time travel** — snapshots exist for recovery, not user-facing history.
- **Authentication / authorization** — rooms are open by link for now.
- **Mobile-native clients** — browser-only.

---

## 13. Key Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Vector clock size grows with unique clients | Garbage-collect entries for clients disconnected > 1 hour |
| Redis data loss on crash | Periodic Postgres snapshots; accept ≤ M seconds of op loss |
| Canvas performance with 1000+ shapes | Quadtree viewport culling; offscreen canvas for static layers |
| WebSocket reconnect storms | Exponential backoff with jitter; max 30s delay |

---

## 14. Glossary

| Term | Definition |
|------|-----------|
| **Op** | A single atomic edit (create, update, delete, move, resize) — the unit of sync |
| **Vector clock** | A map of `{clientId: counter}` tracking causal ordering across clients |
| **LWW** | Last-Write-Wins — conflict tiebreaker using vector clock comparison |
| **Optimistic update** | Applying an edit locally before server confirmation |
| **Reconciliation** | Patching local state when server's resolved op differs from optimistic guess |
| **Snapshot** | Full serialization of all shapes + vclock at a point in time |
| **Presence** | Ephemeral cursor/selection state — never persisted, never versioned |
