import { z } from 'zod';

// Shape
export const shapeSchema = z.object({
    id: z.string(),
    type: z.enum(['rect', 'ellipse', 'path', 'line', 'text']),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    rotation: z.number(),
    stroke: z.string(),
    fill: z.string(),
    zIndex: z.number(),
    points: z.array(z.tuple([z.number(), z.number()])).optional(),
    text: z.string().optional(),
    version: z.number(),
});
export type Shape = z.infer<typeof shapeSchema>;

// Vector Clock
export const vclockSchema = z.record(z.string(), z.number());
export type VectorClock = z.infer<typeof vclockSchema>;

// Operation
export const opSchema = z.object({
    opId: z.string(),
    clientId: z.string(),
    roomId: z.string(),
    vclock: vclockSchema,
    type: z.enum(['create', 'update', 'delete', 'move', 'resize']),
    shapeId: z.string(),
    payload: shapeSchema.partial(),
    timestamp: z.number(),
});
export type Op = z.infer<typeof opSchema>;

// Client Message
export const clientMessageSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('op'), op: opSchema }),
    z.object({ type: z.literal('join'), roomId: z.string(), clientId: z.string(), name: z.string() }),
    z.object({ type: z.literal('leave') }),
    z.object({ type: z.literal('presence'), cursor: z.object({ x: z.number(), y: z.number() }), selection: z.array(z.string()) }),
    z.object({ type: z.literal('snapshot-request') }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// Server Message
export const serverMessageSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('snapshot'), shapes: z.array(shapeSchema), vclock: vclockSchema }),
    z.object({ type: z.literal('op-resolved'), op: opSchema, accepted: z.boolean() }),
    z.object({ type: z.literal('presence'), clientId: z.string(), cursor: z.object({ x: z.number(), y: z.number() }), selection: z.array(z.string()) }),
    z.object({ type: z.literal('client-joined'), clientId: z.string(), name: z.string() }),
    z.object({ type: z.literal('client-left'), clientId: z.string() }),
    z.object({ type: z.literal('error'), message: z.string(), opId: z.string().optional() }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;