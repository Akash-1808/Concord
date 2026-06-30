import type { Shape, VectorClock, ServerMessage, Op } from "@concord/shared";
import { merge } from "@concord/shared";
import { resolveOp } from "@concord/conflict";
import { WebSocket } from 'ws';

export class Room {
    id: string;
    clients: Map<string, WebSocket>;
    clientNames: Map<string, string>;
    state: Map<string, Shape>;         // current shape state
    clocks: Map<string, VectorClock>;  // last vclock per shapeId
    lastOpTypePerShape: Map<string, Op['type']>;
    lastClientIdPerShape: Map<string, string>;
    roomClock: VectorClock;            // merged clock for the room

    constructor(id: string) {
        this.id = id;
        this.clients = new Map();
        this.clientNames = new Map();
        this.state = new Map();
        this.clocks = new Map();
        this.lastOpTypePerShape = new Map();
        this.lastClientIdPerShape = new Map();
        this.roomClock = {};
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
        // TODO: implementation
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
            // Op was rejected (e.g., edit on deleted shape or duplicate create)
            return;
        }

        const resolvedOp = resolution.resolvedOp;

        // Apply to state
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

        // Merge op's vclock into the room's master clock
        this.roomClock = merge(this.roomClock, resolvedOp.vclock);

        // Broadcast the fully resolved op to all clients
        this.broadcast({ type: 'op-resolved', op: resolvedOp, accepted: true });
    }
}