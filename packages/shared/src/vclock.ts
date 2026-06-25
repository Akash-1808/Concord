import { VectorClock } from "./types.js";

export function increment(clock: VectorClock, clientId: string): VectorClock {
    return {
        ...clock,
        [clientId]: (clock[clientId] ?? 0) + 1
    }
}

export function merge(a: VectorClock, b: VectorClock): VectorClock {
    const result: VectorClock = {
        ...a
    };
    for (const [clientId, count] of Object.entries(b)) {
        result[clientId] = Math.max(result[clientId] ?? 0, count);
    }
    return result;
}

export function compare(a: VectorClock, b: VectorClock): 'before' | 'after' | 'concurrent' {
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let aBeforeB = false;
    let bBeforeA = false;
    for (const key of allKeys) {
        const aVal = a[key] ?? 0;
        const bVal = b[key] ?? 0;

        if (aVal < bVal) aBeforeB = true;
        if (aVal > bVal) bBeforeA = true;
        if (aBeforeB && bBeforeA) return 'concurrent';
    }
    if (aBeforeB && !bBeforeA) return 'before';
    if (bBeforeA && !aBeforeB) return 'after';
    return 'before';
}