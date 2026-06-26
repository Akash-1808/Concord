import { describe, it, expect, beforeEach } from 'vitest';
import type { Op, Shape, VectorClock } from '@concord/shared';
import { resolveOp } from '../src/resolver.js';

// Helper to create a valid Op with defaults
function makeOp(overrides: Partial<Op>): Op {
    return {
        opId: 'op-1',
        clientId: 'bob',
        roomId: 'room-1',
        vclock: { bob: 1 },
        type: 'update',
        shapeId: 'shape-1',
        payload: {},
        timestamp: Date.now(),
        ...overrides,
    };
}

describe('resolveOp', () => {
    let state: Map<string, Shape>;
    let clocks: Map<string, VectorClock>;
    let opTypes: Map<string, Op['type']>;
    let clients: Map<string, string>;

    beforeEach(() => {
        state = new Map([
            ['shape-1', { id: 'shape-1', type: 'rect', x: 0, y: 0, w: 100, h: 100, version: 1 } as Shape]
        ]);
        clocks = new Map([['shape-1', { alice: 1 }]]);
        opTypes = new Map([['shape-1', 'move']]);
        clients = new Map([['shape-1', 'alice']]);
    });

    it('accepts causal ops directly', () => {
        // Bob's clock {alice: 1, bob: 1} is "after" the shape's clock {alice: 1}
        const op = makeOp({ vclock: { alice: 1, bob: 1 }, payload: { x: 50 } });
        const result = resolveOp(state, clocks, opTypes, clients, op);
        
        expect(result.accepted).toBe(true);
        expect(result.shapePatch).toEqual({ x: 50 });
    });

    it('rejects duplicate create ops', () => {
        const op = makeOp({ type: 'create', shapeId: 'shape-1' }); // shape-1 already exists
        const result = resolveOp(state, clocks, opTypes, clients, op);
        expect(result.accepted).toBe(false);
    });

    it('rejects ops for non-existent shapes', () => {
        const op = makeOp({ shapeId: 'does-not-exist' });
        const result = resolveOp(state, clocks, opTypes, clients, op);
        expect(result.accepted).toBe(false);
    });

    describe('concurrent resolution', () => {
        it('resolves no-conflict (move vs resize)', () => {
            // Shape was moved, incoming is resize
            opTypes.set('shape-1', 'move');
            const op = makeOp({ 
                type: 'resize', 
                vclock: { bob: 1 }, // Concurrent with {alice: 1}
                payload: { w: 200, h: 200 } 
            });
            
            const result = resolveOp(state, clocks, opTypes, clients, op);
            expect(result.accepted).toBe(true);
            expect(result.shapePatch).toEqual({ w: 200, h: 200 }); // Both apply
        });

        it('resolves delete-wins (incoming is edit, shape was deleted)', () => {
            opTypes.set('shape-1', 'delete');
            const op = makeOp({ type: 'update', vclock: { bob: 1 } });
            
            const result = resolveOp(state, clocks, opTypes, clients, op);
            expect(result.accepted).toBe(false); // Edit dropped
        });

        it('resolves delete-wins (incoming is delete, shape was edited)', () => {
            opTypes.set('shape-1', 'update');
            const op = makeOp({ type: 'delete', vclock: { bob: 1 } });
            
            const result = resolveOp(state, clocks, opTypes, clients, op);
            expect(result.accepted).toBe(true); // Delete accepted
        });

        it('resolves field-lww with tiebreaker (incoming client is LOWER)', () => {
            // Existing client is "charlie"
            clients.set('shape-1', 'charlie');
            opTypes.set('shape-1', 'move');
            
            // Incoming is "bob". "bob" < "charlie", so bob wins
            const op = makeOp({ 
                clientId: 'bob',
                type: 'move', 
                vclock: { bob: 1 },
                payload: { x: 50, y: 50 } 
            });
            
            const result = resolveOp(state, clocks, opTypes, clients, op);
            expect(result.accepted).toBe(true);
            expect(result.shapePatch).toEqual({ x: 50, y: 50 }); // Bob wins
        });

        it('resolves field-lww with tiebreaker (incoming client is HIGHER)', () => {
            // Existing client is "alice"
            clients.set('shape-1', 'alice');
            opTypes.set('shape-1', 'move');
            
            // Incoming is "bob". "bob" > "alice", so alice's value is kept
            const op = makeOp({ 
                clientId: 'bob',
                type: 'move', 
                vclock: { bob: 1 },
                payload: { x: 50, y: 50 } 
            });
            
            const result = resolveOp(state, clocks, opTypes, clients, op);
            expect(result.accepted).toBe(true);
            expect(result.shapePatch).toEqual({ x: 0, y: 0 }); // Alice's values (from initial state) are preserved
        });
    });
});