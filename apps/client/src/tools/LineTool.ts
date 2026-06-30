import type { Tool, ToolState } from "./Tool";
import type { Shape } from "@concord/shared";
import { Camera } from "../canvas/Camera";

export class LineTool implements Tool {
    name = "line";
    cursor = "crosshair";

    private onCreateShape: (shape: Partial<Shape> & { id: string, type: 'line' }) => void;
    private onUpdateShape: (shapeId: string, updates: Partial<Shape>) => void;

    private isDragging = false;
    private startX = 0;
    private startY = 0;
    private currentShapeId: string | null = null;

    constructor(onCreateShape: (shape: Partial<Shape> & { id: string, type: 'line' }) => void,
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
        this.isDragging = true;
        this.startX = worldCoords.x;
        this.startY = worldCoords.y;

        this.currentShapeId = "line-" + Math.random().toString(36).substring(2, 9);
        this.onCreateShape({
            id: this.currentShapeId,
            type: 'line',
            x: this.startX,
            y: this.startY,
            points: [[this.startX, this.startY], [this.startX, this.startY]],
            stroke: "#fffffff"
        });
    }
    onPointerMove(e: PointerEvent, state: ToolState): void {
        if (!this.isDragging || !this.currentShapeId) return;

        const camera = new Camera();
        camera.x = state.camera.x;
        camera.y = state.camera.y;
        camera.zoom = state.camera.zoom;

        const worldCoords = camera.screenToWorld(e.clientX, e.clientY);

        this.onUpdateShape(this.currentShapeId, {
            points: [[this.startX, this.startY], [worldCoords.x, worldCoords.y]]
        });
    }
    onPointerUp(_e: PointerEvent, _state: ToolState): void {
        this.isDragging = false;
        this.currentShapeId = null;
    }
}