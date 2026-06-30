import type { Shape } from "@concord/shared";

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
    getShape(): Shape[] {
        return Array.from(this.shapes.values());
    }

    add(shape: Shape) {
        this.shapes.set(shape.id, shape);
        this.emit();
    }
    update(shapeId: string, updates: Partial<Shape>) {
        if (!this.shapes.has(shapeId)) return;
        this.shapes.set(shapeId, { ...this.shapes.get(shapeId)!, ...updates });
        this.emit();
    }
    remove(id: string) {
        if (!this.shapes.has(id)) return;
        this.shapes.delete(id);
        this.emit();
    }
    clear() {
        this.shapes.clear();
        this.emit();
    }
}

export const shapeStore = new ShapeStore();
