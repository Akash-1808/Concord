import type { Shape } from "@concord/shared";
import type { Tool, ToolState } from "./Tool";
import { Camera } from "../canvas/Camera";

export class PathTool implements Tool {
    name = "path";
    cursor = "crosshair";

    private onCreateShape: (shape: Partial<Shape> & { id: string, type: 'path' }) => void;
    private onUpdateShape: (shapeId: string, updates: Partial<Shape>) => void;

    private isDrawing = false;
    private currentShapeId: string | null = null;

    constructor(onCreateShape: (shape: Partial<Shape> & { id: string, type: 'path' }) => void,
        onUpdateShape: (shapeId: string, updates: Partial<Shape>) => void) {
        this.onCreateShape = onCreateShape;
        this.onUpdateShape = onUpdateShape;
    }

    onPointerDown(e: PointerEvent, state: ToolState): void {
        const camera = new Camera();
        camera.x = state.camera.x;
        camera.y = state.camera.y;
        camera.zoom = state.camera.zoom;

        const worldCoords = camera.screenToWorld(e.clientX, e.clientY);
        this.isDrawing = true;
        this.currentShapeId = "path-" + Math.random().toString(36).substring(2, 9);
        this.onCreateShape({
            id: this.currentShapeId,
            type: 'path',
            x: worldCoords.x,
            y: worldCoords.y,
            points: [[worldCoords.x, worldCoords.y], [worldCoords.x, worldCoords.y]],
            stroke: "#fffffff"
        });
    }
    onPointerMove(e: PointerEvent, state: ToolState): void {
        if (!this.isDrawing || !this.currentShapeId) return;

        const camera = new Camera();
        camera.x = state.camera.x;
        camera.y = state.camera.y;
        camera.zoom = state.camera.zoom;

        const worldCoords = camera.screenToWorld(e.clientX, e.clientY);

        const currentShape = state.shapes.find(s => s.id === this.currentShapeId);
        if (currentShape && currentShape.type === 'path' && currentShape.points) {
            const newPoints = [...currentShape.points, [worldCoords.x, worldCoords.y]];
            this.onUpdateShape(this.currentShapeId, {
                points: newPoints as [number, number][]
            });
        }
    }
    onPointerUp(_e: PointerEvent, _state: ToolState): void {
        this.isDrawing = false;
        this.currentShapeId = null;
    }
}