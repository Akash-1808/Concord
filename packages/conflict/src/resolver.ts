import { compare, type Op, type Shape, type VectorClock } from "@concord/shared";
import { getConflictFields, getConflictRule } from "./matrix.js";

export interface ResolveResult {
    resolvedOp: Op;          // may differ from input
    accepted: boolean;       // false if op was dropped (e.g., edit on deleted shape)
    shapePatch: Partial<Shape> | null;
}
export function resolveOp(
    currentState: Map<string, Shape>,
    lastClockPerShape: Map<string, VectorClock>,
    lastOpTypePerShape: Map<string, Op['type']>,
    lastClientIdPerShape: Map<string, string>,
    incomingOp: Op
): ResolveResult {
    if (incomingOp.type === 'create') {
        if (currentState.has(incomingOp.shapeId)) {
            return {
                resolvedOp: incomingOp,
                accepted: false,
                shapePatch: null,
            };
        }
        return {
            resolvedOp: incomingOp,
            accepted: true,
            shapePatch: incomingOp.payload,
        };
    }
    // --- Step 2: Shape must exist for non-create ops ---
    const existingShape = currentState.get(incomingOp.shapeId);
    if (!existingShape) {
        // Shape was already deleted → reject
        return {
            resolvedOp: incomingOp,
            accepted: false,
            shapePatch: null,
        };
    }
    // --- Step 3: Compare vector clocks ---
    const lastClock = lastClockPerShape.get(incomingOp.shapeId) ?? {};
    const ordering = compare(incomingOp.vclock, lastClock);
    // --- Step 4: If causal (after) → apply directly, no conflict ---
    if (ordering === 'after' || ordering === 'before') {
        // 'before' means stale op (already superseded) → still apply 
        // but in practice the server bumps version so it's fine
        return {
            resolvedOp: incomingOp,
            accepted: true,
            shapePatch: incomingOp.payload,
        };
    }
    // --- Step 5: CONCURRENT → conflict resolution ---
    // We need to know what the "last op type" was for this shape
    // For simplicity, we resolve based on the incoming op type
    // vs the most common conflict scenarios
    const lastOpType = lastOpTypePerShape.get(incomingOp.shapeId) ?? 'create';
    const rule = getConflictRule(incomingOp.type, lastOpType);
    // Note: in a full implementation, you'd track the last op type per shape
    // For now, the rule is determined by the incoming op type
    switch (rule) {
        case 'delete-wins': {
            if (incomingOp.type === 'delete') {
                // Incoming is the delete → accept
                return {
                    resolvedOp: incomingOp,
                    accepted: true,
                    shapePatch: null,
                };
            }
            // Incoming is the edit, shape was deleted → reject
            return {
                resolvedOp: incomingOp,
                accepted: false,
                shapePatch: null,
            };
        }
        case 'no-conflict': {
            // Different fields → both apply, no resolution needed
            return {
                resolvedOp: incomingOp,
                accepted: true,
                shapePatch: incomingOp.payload,
            };
        }
        case 'field-lww':
        case 'tuple-lww': {
            // LWW tiebreaker: lower clientId wins on concurrent ops
            const fields = getConflictFields(rule, incomingOp.type);
            const resolvedPayload: Partial<Shape> = {};
            const lastClientId = lastClientIdPerShape.get(incomingOp.shapeId) ?? '';
            const incomingWins = incomingOp.clientId < lastClientId;
            for (const field of fields) {
                const incomingVal = incomingOp.payload[field];
                if (incomingVal !== undefined) {
                    if (incomingWins) {
                        // Incoming client has lower ID → incoming value wins
                        resolvedPayload[field] = incomingVal as any;
                    } else {
                        // Keep existing shape's value → existing client won
                        resolvedPayload[field] = existingShape[field] as any;
                    }
                }
            }
            return {
                resolvedOp: {
                    ...incomingOp,
                    payload: resolvedPayload
                },
                accepted: true,
                shapePatch: resolvedPayload
            };
        }
        case 'first-wins': {
            return {
                resolvedOp: incomingOp,
                accepted: false,
                shapePatch: null,
            };
        }
    }
};