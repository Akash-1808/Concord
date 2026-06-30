import type { Shape } from "@concord/shared";

export interface ToolState {
    camera: { x: number, y: number, zoom: number };
    shapes: Shape[];
    selectedShapeIds: string[];
}

export interface Tool {
    name: string;
    cursor: string;
    onPointerDown(e: PointerEvent, state: ToolState): void;
    onPointerMove(e: PointerEvent, state: ToolState): void;
    onPointerUp(e: PointerEvent, state: ToolState): void;
}