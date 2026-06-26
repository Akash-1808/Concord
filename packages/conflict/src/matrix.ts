import type { Op, Shape } from "@concord/shared";

export type ConflictRule = "field-lww" | "no-conflict" | "delete-wins" | "tuple-lww" | "first-wins";

export function getConflictRule(opTypeA: Op['type'], opTypeB: Op['type']): ConflictRule {
    const pair = [opTypeA, opTypeB].sort().join('+');
    switch (pair) {
        // move + move → LWW on (x, y) fields
        case 'move+move':
            return 'field-lww';
        // resize + resize → LWW on entire (x,y,w,h) tuple 
        // (partial merge produces invalid geometry)
        case 'resize+resize':
            return 'tuple-lww';
        // move + resize → different fields, no conflict
        case 'move+resize':
            return 'no-conflict';
        // anything + delete → delete wins
        case 'delete+move':
        case 'delete+resize':
        case 'delete+update':
            return 'delete-wins';
        // create + create (same id, retry-induced) → first one wins
        case 'create+create':
            return 'first-wins';
        // update + update → LWW per field
        case 'update+update':
            return 'field-lww';
        // move + update, resize + update → different fields, no conflict
        case 'move+update':
        case 'resize+update':
            return 'no-conflict';
        // Default: field-level LWW as safest fallback
        default:
            return 'field-lww';
    }
}

export function getConflictFields(rule: ConflictRule, opType: Op['type']): (keyof Shape)[] {
    switch (rule) {
        case 'field-lww':
            // Return the fields this specific op type modifies
            return getFieldsForOpType(opType);
        case 'tuple-lww':
            // Resize conflicts treat position + size as one atomic unit
            return ['x', 'y', 'w', 'h'];
        case 'no-conflict':
            return [];
        case 'delete-wins':
            return [];
        case 'first-wins':
            return [];
    }
}

function getFieldsForOpType(opType: Op['type']): (keyof Shape)[] {
    switch (opType) {
        case 'move': return ['x', 'y'];
        case 'resize': return ['w', 'h'];
        case 'update': return ['fill', 'stroke', 'rotation', 'zIndex', 'text'];
        case 'create': return ['x', 'y', 'w', 'h', 'fill', 'stroke', 'rotation', 'zIndex'];
        case 'delete': return [];
    }
}