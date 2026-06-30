export class Camera {
    x: number = 0;
    y: number = 0;
    zoom: number = 1;

    // Convert a point from screen coordinates (e.g. mouse event) to world coordinates
    screenToWorld(screenX: number, screenY: number) {
        return {
            x: (screenX - this.x) / this.zoom,
            y: (screenY - this.y) / this.zoom
        };
    }

    // Convert a point from world coordinates to screen coordinates
    worldToScreen(worldX: number, worldY: number) {
        return {
            x: (worldX * this.zoom) + this.x,
            y: (worldY * this.zoom) + this.y
        };
    }

    // Apply pan delta (movement in screen space)
    pan(dx: number, dy: number) {
        this.x += dx;
        this.y += dy;
    }

    // Zoom centered on a specific screen point (usually the mouse cursor)
    zoomToPoint(screenX: number, screenY: number, deltaY: number) {
        // Adjust zoom factor (deltaY is usually from a wheel event)
        const zoomSensitivity = 0.001;
        const newZoom = Math.max(0.1, Math.min(5, this.zoom * (1 - deltaY * zoomSensitivity)));
        
        // Calculate world point under the cursor *before* zoom
        const worldPoint = this.screenToWorld(screenX, screenY);
        
        this.zoom = newZoom;
        
        // Calculate where that same world point is *after* zoom
        const newScreenPoint = this.worldToScreen(worldPoint.x, worldPoint.y);
        
        // Adjust camera x/y so the world point stays exactly under the mouse cursor
        this.x += (screenX - newScreenPoint.x);
        this.y += (screenY - newScreenPoint.y);
    }
}
