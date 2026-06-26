import { describe, it, expect } from 'vitest';
import { getConflictRule, getConflictFields } from '../src/matrix.js';

describe('getConflictRule', () => {
    it('returns "field-lww" for move + move', () => {
        expect(getConflictRule('move', 'move')).toBe('field-lww');
    });

    it('returns "tuple-lww" for resize + resize', () => {
        expect(getConflictRule('resize', 'resize')).toBe('tuple-lww');
    });

    it('returns "no-conflict" for disjoint visual vs spatial ops', () => {
        expect(getConflictRule('move', 'resize')).toBe('no-conflict');
        expect(getConflictRule('move', 'update')).toBe('no-conflict');
        expect(getConflictRule('resize', 'update')).toBe('no-conflict');
    });

    it('returns "delete-wins" when delete is involved', () => {
        expect(getConflictRule('delete', 'update')).toBe('delete-wins');
        expect(getConflictRule('move', 'delete')).toBe('delete-wins');
        expect(getConflictRule('delete', 'resize')).toBe('delete-wins');
    });

    it('returns "first-wins" for create + create', () => {
        expect(getConflictRule('create', 'create')).toBe('first-wins');
    });
});

describe('getConflictFields', () => {
    it('returns fields for specific op types under field-lww', () => {
        expect(getConflictFields('field-lww', 'move')).toEqual(['x', 'y']);
        expect(getConflictFields('field-lww', 'resize')).toEqual(['w', 'h']);
        expect(getConflictFields('field-lww', 'update')).toEqual(['fill', 'stroke', 'rotation', 'zIndex', 'text']);
    });

    it('returns tuple fields for tuple-lww', () => {
        expect(getConflictFields('tuple-lww', 'resize')).toEqual(['x', 'y', 'w', 'h']);
    });

    it('returns empty array for non-merging rules', () => {
        expect(getConflictFields('no-conflict', 'move')).toEqual([]);
        expect(getConflictFields('delete-wins', 'delete')).toEqual([]);
        expect(getConflictFields('first-wins', 'create')).toEqual([]);
    });
});
