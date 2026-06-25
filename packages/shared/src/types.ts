// Shape
export interface Shape {
    id: string;
    type: 'rect' | 'ellipse' | 'path' | 'line' | 'text';
    x: number;
    y: number;
    w: number;
    h: number;
    rotation: number;
    stroke: string;
    fill: string;
    zIndex: number;
    points?: [number, number][];
    text?: string;
    version: number;
}
// Operation
export interface Op {
    opId: string;
    clientId: string;
    roomId: string;
    vclock: Record<string, number>;
    type: 'create' | 'update' | 'delete' | 'move' | 'resize';
    shapeId: string;
    payload: Partial<Shape>;
    timestamp: number;
}
// Vector Clock
export type VectorClock = Record<string, number>;
// Client Message
export type ClientMessage =
    | { type: 'op'; op: Op }
    | { type: 'join'; roomId: string; clientId: string }
    | { type: 'leave' }
    | { type: 'presence'; cursor: { x: number; y: number }; selection: string[] }
    | { type: 'snapshot-request' };

// Server Message
export type ServerMessage =
    | { type: 'snapshot'; shapes: Shape[]; vclock: VectorClock }
    | { type: 'op-resolved'; op: Op; accepted: boolean; }
    | { type: 'presence'; clientId: string; cursor: { x: number; y: number }; selection: string[] }
    | { type: 'client-joined'; clientId: string; name: string }
    | { type: 'client-left'; clientId: string }
    | { type: 'error'; message: string; opId?: string }