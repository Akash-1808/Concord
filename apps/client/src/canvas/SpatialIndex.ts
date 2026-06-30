import type { Shape } from "@concord/shared";

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export class SpatialIndex {
    private bounds: Rect;
    private capacity: number;
    private shapes: Shape[] = [];
    // The 4 child quadrants (null if this node hasn't split yet)
    private northwest: SpatialIndex | null = null;
    private northeast: SpatialIndex | null = null;
    private southwest: SpatialIndex | null = null;
    private southeast: SpatialIndex | null = null;

    constructor(bounds: Rect, capacity: number = 4) {
        this.bounds = bounds;
        this.capacity = capacity;
    }

    public insert(shape: Shape): boolean {

        const shapeBounds = this.getShapeBounds(shape);
        if (!this.intersects(this.bounds, shapeBounds)) {
            return false;
        }
        if (this.shapes.length < this.capacity && this.northwest === null) {
            this.shapes.push(shape);
            return true;
        }
        if (this.northwest === null) {
            this.subdivide();
        }

        let inserted = false;
        if (this.northwest?.insert(shape))
            inserted = true;
        if (this.northeast?.insert(shape))
            inserted = true;
        if (this.southwest?.insert(shape)) inserted = true;
        if (this.southeast?.insert(shape)) inserted = true;
        return inserted;
    }

    private getShapeBounds(shape: Shape): Rect {
        if (shape.rotation) {
            // @ts-ignore
        }
        return { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
    }

    private intersects(a: Rect, b: Rect): boolean {
        return (
            a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y
        );
    }

    private subdivide() {
        const x = this.bounds.x;
        const y = this.bounds.y;
        const halfW = this.bounds.w / 2;
        const halfH = this.bounds.h / 2;

        this.northwest = new SpatialIndex({
            x: x,
            y: y,
            w: halfW,
            h: halfH
        });

        this.northeast = new SpatialIndex({
            x: x + halfW,
            y: y,
            w: halfW,
            h: halfH
        })
        this.southwest = new SpatialIndex({
            x: x,
            y: y + halfH,
            w: halfW,
            h: halfH
        })
        this.southeast = new SpatialIndex({
            x: x + halfW,
            y: y + halfH,
            w: halfW,
            h: halfH
        })
    }

    public query(range: Rect, found: Shape[] = []): Shape[] {
        if (!this.intersects(this.bounds, range)) {
            return found;
        }
        for (const shape of this.shapes) {
            if (this.intersects(this.getShapeBounds(shape), range)) {
                found.push(shape);
            }
        }
        if (this.northwest) {
            this.northwest.query(range, found);
            this.northeast?.query(range, found);
            this.southwest?.query(range, found);
            this.southeast?.query(range, found);
        }
        return found;
    }

    public update(shape: Shape) {
        this.remove(shape.id);
        this.insert(shape);
    }
    public remove(shapeId: string): boolean {
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            if (this.shapes[i].id === shapeId) {
                this.shapes.splice(i, 1);
                return true;
            }
        }
        if (this.northwest) {
            return this.northwest.remove(shapeId) ||
                !!this.northeast?.remove(shapeId) ||
                !!this.southwest?.remove(shapeId) ||
                !!this.southeast?.remove(shapeId);
        }
        return false;
    }
} 