import type { Shape, Op } from "@concord/shared";

export function applyOp(state: Map<string, Shape>, op: Op): Map<string, Shape> {
    const newState = new Map(state);
    switch (op.type) {
        case 'create': {
            const shape: Shape = {
                id: op.shapeId,
                type: op.payload.type ?? 'rect',
                x: op.payload.x ?? 0,
                y: op.payload.y ?? 0,
                w: op.payload.w ?? 100,
                h: op.payload.h ?? 100,
                rotation: op.payload.rotation ?? 0,
                fill: op.payload.fill ?? '#ffffff',
                stroke: op.payload.stroke ?? '#000000',
                zIndex: op.payload.zIndex ?? 0,
                points: op.payload.points,
                text: op.payload.text,
                version: 1,
            };
            newState.set(op.shapeId, shape);
            break;
        }
        case 'update':
        case 'move':
        case 'resize': {
            const existing = newState.get(op.shapeId);
            if (!existing) return state;
            newState.set(op.shapeId, {
                ...existing,
                ...op.payload,
                version: existing.version + 1,
            });
            break;
        }
        case 'delete': {
            if (!newState.has(op.shapeId)) return state;
            newState.delete(op.shapeId);
            break;
        }
    }
    return newState;
}