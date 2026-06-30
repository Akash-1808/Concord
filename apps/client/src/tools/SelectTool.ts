import type { Tool, ToolState } from "./Tool";
import { hitTest } from "../canvas/HitTest";
import { Camera } from "../canvas/Camera";
import type { Shape } from "@concord/shared";

export class SelectTool implements Tool {
    name = "select";
    cursor = "default";

    private onSelect: (shapeIds: string[]) => void;

    private onCreateShape?: (shape: Partial<Shape> & { id: string, type: 'rect' }) => void;
    private onUpdateShape?: (shapeId: string, updates: Partial<Shape>) => void;
    private onDeleteShape?: (shapeId: string) => void;

    private isDragging = false;
    private isMarquee = false;
    private dragStartX = 0;
    private dragStartY = 0;
    
    // Store initial positions of all dragged shapes (including paths/lines points)
    private initialPositions = new Map<string, {x: number, y: number, points?: [number, number][]}>();

    constructor(
        onSelect: (shapeIds: string[]) => void, 
        onCreateShape?: (shape: Partial<Shape> & { id: string, type: 'rect' }) => void,
        onUpdateShape?: (shapeId: string, updates: Partial<Shape>) => void,
        onDeleteShape?: (shapeId: string) => void
    ) {
        this.onSelect = onSelect
        this.onCreateShape = onCreateShape
        this.onUpdateShape = onUpdateShape
        this.onDeleteShape = onDeleteShape
    }

    onPointerDown(e: PointerEvent, state: ToolState): void {
        const camera = new Camera();
        camera.x = state.camera.x;
        camera.y = state.camera.y;
        camera.zoom = state.camera.zoom;

        const worldCoords = camera.screenToWorld(e.clientX, e.clientY);

        let hitShape = null;
        for (let i = state.shapes.length - 1; i >= 0; i--) {
            const shape = state.shapes[i];
            if (shape.id === 'marquee-selection') continue; // Don't hit test the marquee box itself
            if (hitTest(shape, worldCoords.x, worldCoords.y)) {
                hitShape = shape
                break;
            }
        }

        if (hitShape) {
            this.isDragging = true;
            this.dragStartX = worldCoords.x;
            this.dragStartY = worldCoords.y;
            
            let idsToDrag = state.selectedShapeIds;
            // If clicking on an unselected shape, select only that shape
            if (!idsToDrag.includes(hitShape.id)) {
                idsToDrag = [hitShape.id];
                this.onSelect(idsToDrag);
            }
            
            // Record initial positions for multi-drag
            this.initialPositions.clear();
            for (const shape of state.shapes) {
                if (idsToDrag.includes(shape.id)) {
                    this.initialPositions.set(shape.id, {
                        x: shape.x, 
                        y: shape.y,
                        points: shape.points ? JSON.parse(JSON.stringify(shape.points)) : undefined
                    });
                }
            }
        }
        else {
            // Clicked on empty space: start marquee selection
            this.onSelect([]);
            this.isMarquee = true;
            this.dragStartX = worldCoords.x;
            this.dragStartY = worldCoords.y;
            
            if (this.onCreateShape) {
                this.onCreateShape({
                    id: 'marquee-selection',
                    type: 'rect',
                    x: worldCoords.x,
                    y: worldCoords.y,
                    w: 0,
                    h: 0,
                    fill: 'rgba(35, 131, 226, 0.1)',
                    stroke: '#2383e2'
                });
            }
        }
    }

    onPointerMove(e: PointerEvent, state: ToolState): void {
        const camera = new Camera();
        camera.x = state.camera.x;
        camera.y = state.camera.y;
        camera.zoom = state.camera.zoom;
        const worldCoords = camera.screenToWorld(e.clientX, e.clientY);

        if (this.isDragging) {
            const deltaX = worldCoords.x - this.dragStartX;
            const deltaY = worldCoords.y - this.dragStartY;
            
            for (const [id, pos] of this.initialPositions.entries()) {
                if (this.onUpdateShape) {
                    const updates: Partial<Shape> = {
                        x: pos.x + deltaX,
                        y: pos.y + deltaY
                    };
                    if (pos.points) {
                        updates.points = pos.points.map(p => [p[0] + deltaX, p[1] + deltaY]);
                    }
                    this.onUpdateShape(id, updates);
                }
            }
        } 
        else if (this.isMarquee) {
            const minX = Math.min(this.dragStartX, worldCoords.x);
            const maxX = Math.max(this.dragStartX, worldCoords.x);
            const minY = Math.min(this.dragStartY, worldCoords.y);
            const maxY = Math.max(this.dragStartY, worldCoords.y);
            
            if (this.onUpdateShape) {
                this.onUpdateShape('marquee-selection', {
                    x: minX,
                    y: minY,
                    w: maxX - minX,
                    h: maxY - minY
                });
            }

            // Find all shapes inside the marquee box
            const selectedIds = [];
            for (const shape of state.shapes) {
                if (shape.id === 'marquee-selection') continue;
                
                // Simple center point bounds check for now
                const centerX = shape.x + (shape.w || 0) / 2;
                const centerY = shape.y + (shape.h || 0) / 2;
                
                if (centerX >= minX && centerX <= maxX && centerY >= minY && centerY <= maxY) {
                    selectedIds.push(shape.id);
                }
            }
            this.onSelect(selectedIds);
        }
    }

    onPointerUp(_e: PointerEvent, _state: ToolState): void {
        this.isDragging = false;
        
        if (this.isMarquee) {
            this.isMarquee = false;
            if (this.onDeleteShape) {
                this.onDeleteShape('marquee-selection');
            }
        }
    }
}