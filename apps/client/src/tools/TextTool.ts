import type { Shape } from "@concord/shared";
import type { Tool, ToolState } from "./Tool";
import { Camera } from "../canvas/Camera";

export class TextTool implements Tool {
    name = "text";
    cursor = "crosshair";

    private onCreateShape: (shape: Partial<Shape> & { id: string, type: 'text' }) => void;
    private onUpdateShape: (shapeId: string, updates: Partial<Shape>) => void;

    private isDragging = false;
    private startX = 0;
    private startY = 0;
    private currentShapeId: string | null = null;

    constructor(onCreateShape: (shape: Partial<Shape> & { id: string, type: 'text' }) => void,
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

        this.currentShapeId = "text-" + Math.random().toString(36).substring(2, 9);
        this.onCreateShape({
            id: this.currentShapeId,
            type: 'text',
            x: this.startX,
            y: this.startY,
            w: 0,
            h: 0,
            text: "",
            fill: "#fffffff"
        });
    }
    onPointerMove(e: PointerEvent, state: ToolState): void {
        if (!this.isDragging || !this.currentShapeId) return;

        const camera = new Camera();
        camera.x = state.camera.x;
        camera.y = state.camera.y;
        camera.zoom = state.camera.zoom;

        const worldCoords = camera.screenToWorld(e.clientX, e.clientY);

        const newX = Math.min(this.startX, worldCoords.x);
        const newY = Math.min(this.startY, worldCoords.y);
        const newW = Math.abs(this.startX - worldCoords.x);
        const newH = Math.abs(this.startY - worldCoords.y);

        this.onUpdateShape(this.currentShapeId, {
            x: newX,
            y: newY,
            w: newW,
            h: newH
        });
    }
    onPointerUp(_e: PointerEvent, _state: ToolState): void {
        this.isDragging = false;
        this.currentShapeId = null;
    }
}