import type { Shape } from "@concord/shared";

export function hitTest(shape: Shape, px: number, py: number): boolean {
    let testX = px;
    let testY = py;

    if (shape.rotation) {
        const centerX = shape.x + shape.w / 2;
        const centerY = shape.y + shape.h / 2;
        const dx = px - centerX;
        const dy = py - centerY;
        const cos = Math.cos(-shape.rotation);
        const sin = Math.sin(-shape.rotation);
        testX = (dx * cos - dy * sin) + centerX;
        testY = (dx * sin + dy * cos) + centerY;
    }
    switch (shape.type) {
        case 'rect':
            return hitTestRect(shape, testX, testY);
        case 'text':
            return hitTestText(shape, testX, testY);
        case 'ellipse':
            return hitTestEllipse(shape, testX, testY)
        case 'line':
        case 'path':
            return hitTestPath(shape, testX, testY);
        default:
            return false;
    }
}

function hitTestRect(shape: Shape, px: number, py: number): boolean {
    const minX = Math.min(shape.x, shape.x + shape.w);
    const maxX = Math.max(shape.x, shape.x + shape.w);
    const minY = Math.min(shape.y, shape.y + shape.h);
    const maxY = Math.max(shape.y, shape.y + shape.h);

    return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

function hitTestText(shape: Shape, px: number, py: number): boolean {
    // If the text box has width 0 (just a click), estimate based on text length
    const textWidth = shape.w > 0 ? shape.w : (shape.text || 'Double click to edit').length * 14;
    const textHeight = shape.h > 0 ? shape.h : 24; // 24px font

    return (
        px >= shape.x &&
        px <= shape.x + textWidth &&
        py >= shape.y &&
        py <= shape.y + textHeight
    );
}

function hitTestEllipse(shape: Shape, px: number, py: number): boolean {
    const centerX = shape.x + shape.w / 2;
    const centerY = shape.y + shape.h / 2;
    const radiusX = shape.w / 2;
    const radiusY = shape.h / 2;
    const dx = px - centerX;
    const dy = py - centerY;
    return (dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY) <= 1
}

function hitTestPath(shape: Shape, px: number, py: number): boolean {
    if (!shape.points || shape.points.length === 0) return false;

    // Calculate bounding box for the line/path
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of shape.points) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }

    // Add a 10px buffer so it's easy to click thin lines
    const buffer = 10;
    return (
        px >= minX - buffer &&
        px <= maxX + buffer &&
        py >= minY - buffer &&
        py <= maxY + buffer
    );
}