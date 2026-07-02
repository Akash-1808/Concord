import type { Op, Shape } from "@concord/shared";
import { opQueue } from "./OpQueue";
import { wsClient } from "../net/WebSocketClient";

type Listener = () => void;

class ShapeStore {

    private shapes = new Map<string, Shape>()
    private listeners = new Set<Listener>();

    subscribe(listener: Listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        }
    }

    private emit() {
        for (const listener of this.listeners) {
            listener();
        }
    }
    get(shapeId: string) {
        return this.shapes.get(shapeId);
    }
    getShape(): Shape[] {
        return Array.from(this.shapes.values());
    }

    add(shape: Shape, isRemote = false) {
        if (!isRemote) {
            const op: Op = {
                opId: 'op-' + Math.random().toString(36).substring(2, 9),
                clientId: wsClient.clientId,
                roomId: 'default-room',
                type: 'create',
                shapeId: shape.id,
                payload: shape,
                timestamp: Date.now(),
                vclock: {}
            };
            opQueue.enqueue(op)
        }
        this.shapes.set(shape.id, shape);
        this.emit();
    }
    update(shapeId: string, updates: Partial<Shape>, isRemote = false) {
        if (!this.shapes.has(shapeId)) return;
        this.shapes.set(shapeId, { ...this.shapes.get(shapeId)!, ...updates });
        this.emit();
        if (!isRemote) {
            const op: Op = {
                opId: 'op-' + Math.random().toString(36).substring(2, 9),
                clientId: wsClient.clientId,
                roomId: 'default-room',
                type: 'update',
                shapeId: shapeId,
                payload: updates,
                timestamp: Date.now(),
                vclock: {}
            };
            opQueue.enqueue(op);
        }
    }
    remove(id: string, isRemote = false) {
        if (!this.shapes.has(id)) return;
        this.shapes.delete(id);
        this.emit();
        if (!isRemote) {
            const op: Op = {
                opId: 'op-' + Math.random().toString(36).substring(2, 9),
                clientId: wsClient.clientId,
                roomId: 'default-room',
                type: 'delete',
                shapeId: id,
                payload: {},
                timestamp: Date.now(),
                vclock: {}
            };
            opQueue.enqueue(op);
        }
    }
    clear() {
        this.shapes.clear();
        this.emit();
    }
}

export const shapeStore = new ShapeStore();
