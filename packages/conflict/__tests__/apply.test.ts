import { describe, it, expect } from 'vitest';
import type { Op, Shape } from '@concord/shared';
import { applyOp } from '../src/apply';

// Helper to create a minimal op
function makeOp(overrides: Partial<Op>): Op {
    return {
        opId: 'op-1',
        clientId: 'alice',
        roomId: 'room-1',
        vclock: { alice: 1 },
        type: 'create',
        shapeId: 'shape-1',
        payload: {},
        timestamp: Date.now(),
        ...overrides,
    };
}

// Helper to create a shape already in state
function makeShape(overrides: Partial<Shape> = {}): Shape {
    return {
        id: 'shape-1',
        type: 'rect',
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        rotation: 0,
        fill: '#ffffff',
        stroke: '#000000',
        zIndex: 0,
        version: 1,
        ...overrides,
    };
}

describe('applyOp', () => {
    describe('create', () => {
        it('adds a shape to empty state', () => {
            const state = new Map<string, Shape>();
            const op = makeOp({
                type: 'create',
                shapeId: 'shape-1',
                payload: { type: 'rect', x: 10, y: 20, w: 200, h: 150, fill: '#ff0000' },
            });

            const result = applyOp(state, op);

            expect(result.size).toBe(1);
            const shape = result.get('shape-1')!;
            expect(shape.x).toBe(10);
            expect(shape.y).toBe(20);
            expect(shape.w).toBe(200);
            expect(shape.h).toBe(150);
            expect(shape.fill).toBe('#ff0000');
            expect(shape.version).toBe(1);
        });

        it('uses defaults for missing fields', () => {
            const state = new Map<string, Shape>();
            const op = makeOp({
                type: 'create',
                shapeId: 'shape-1',
                payload: {},  // no fields provided
            });

            const result = applyOp(state, op);
            const shape = result.get('shape-1')!;

            expect(shape.type).toBe('rect');
            expect(shape.x).toBe(0);
            expect(shape.y).toBe(0);
            expect(shape.w).toBe(100);
            expect(shape.h).toBe(100);
            expect(shape.fill).toBe('#ffffff');
            expect(shape.stroke).toBe('#000000');
        });
    });

    describe('update', () => {
        it('merges partial fields into existing shape', () => {
            const shape = makeShape({ fill: '#ffffff' });
            const state = new Map([['shape-1', shape]]);
            const op = makeOp({
                type: 'update',
                shapeId: 'shape-1',
                payload: { fill: '#00ff00', stroke: '#333333' },
            });

            const result = applyOp(state, op);
            const updated = result.get('shape-1')!;

            expect(updated.fill).toBe('#00ff00');
            expect(updated.stroke).toBe('#333333');
            expect(updated.x).toBe(0);  // unchanged
        });

        it('bumps version on update', () => {
            const shape = makeShape({ version: 3 });
            const state = new Map([['shape-1', shape]]);
            const op = makeOp({
                type: 'update',
                shapeId: 'shape-1',
                payload: { fill: '#ff0000' },
            });

            const result = applyOp(state, op);
            expect(result.get('shape-1')!.version).toBe(4);
        });

        it('returns original state if shape does not exist', () => {
            const state = new Map<string, Shape>();
            const op = makeOp({
                type: 'update',
                shapeId: 'nonexistent',
                payload: { fill: '#ff0000' },
            });

            const result = applyOp(state, op);
            expect(result).toBe(state); // same reference — no-op
        });
    });

    describe('move', () => {
        it('updates only x and y', () => {
            const shape = makeShape({ x: 0, y: 0, fill: '#fff' });
            const state = new Map([['shape-1', shape]]);
            const op = makeOp({
                type: 'move',
                shapeId: 'shape-1',
                payload: { x: 150, y: 200 },
            });

            const result = applyOp(state, op);
            const moved = result.get('shape-1')!;

            expect(moved.x).toBe(150);
            expect(moved.y).toBe(200);
            expect(moved.fill).toBe('#fff'); // unchanged
            expect(moved.w).toBe(100);       // unchanged
        });
    });

    describe('resize', () => {
        it('updates only w and h', () => {
            const shape = makeShape({ w: 100, h: 100, x: 50 });
            const state = new Map([['shape-1', shape]]);
            const op = makeOp({
                type: 'resize',
                shapeId: 'shape-1',
                payload: { w: 300, h: 200 },
            });

            const result = applyOp(state, op);
            const resized = result.get('shape-1')!;

            expect(resized.w).toBe(300);
            expect(resized.h).toBe(200);
            expect(resized.x).toBe(50); // unchanged
        });
    });

    describe('delete', () => {
        it('removes shape from state', () => {
            const shape = makeShape();
            const state = new Map([['shape-1', shape]]);
            const op = makeOp({
                type: 'delete',
                shapeId: 'shape-1',
                payload: {},
            });

            const result = applyOp(state, op);
            expect(result.size).toBe(0);
            expect(result.has('shape-1')).toBe(false);
        });

        it('returns original state if shape does not exist', () => {
            const state = new Map<string, Shape>();
            const op = makeOp({
                type: 'delete',
                shapeId: 'nonexistent',
                payload: {},
            });

            const result = applyOp(state, op);
            expect(result).toBe(state);
        });
    });

    describe('immutability', () => {
        it('does not mutate the original state', () => {
            const shape = makeShape();
            const state = new Map([['shape-1', shape]]);
            const op = makeOp({
                type: 'move',
                shapeId: 'shape-1',
                payload: { x: 999, y: 999 },
            });

            applyOp(state, op);

            // Original state unchanged
            expect(state.get('shape-1')!.x).toBe(0);
            expect(state.get('shape-1')!.y).toBe(0);
        });
    });
});
