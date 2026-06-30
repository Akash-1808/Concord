import type { Shape } from "@concord/shared";

import type { Camera } from "./Camera";



export class Renderer {

    private canvas: HTMLCanvasElement;

    private ctx: CanvasRenderingContext2D;

    private camera: Camera;

    private animationFrameId: number | null = null;



    private shapes: Shape[] = [];

    private selectedShapeIds: string[] = [];


    constructor(canvas: HTMLCanvasElement, camera: Camera) {

        this.canvas = canvas;

        const ctx = canvas.getContext('2d');

        if (!ctx) throw new Error("Could not get 2D context");

        this.ctx = ctx;

        this.camera = camera;

        this.resize();

        window.addEventListener('resize', () => this.resize());



    }

    private resize() {

        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = window.innerWidth * dpr;

        this.canvas.height = window.innerHeight * dpr;

        this.ctx.scale(dpr, dpr);

    }

    public start() {

        const loop = () => {

            this.draw();

            this.animationFrameId = requestAnimationFrame(loop);

        };

        loop();

    }

    public stop() {

        if (this.animationFrameId) {

            cancelAnimationFrame(this.animationFrameId);

        }

    }

    public updateShapes(shapes: Shape[], selectedShapeIds: string[] = []) {

        this.shapes = shapes;
        this.selectedShapeIds = selectedShapeIds;

    }

    private draw() {

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();

        this.ctx.translate(this.camera.x, this.camera.y);

        this.ctx.scale(this.camera.zoom, this.camera.zoom);



        for (const shape of this.shapes) {

            this.drawShape(shape);

        }

        this.ctx.restore();

    }



    private drawShape(shape: Shape) {

        this.ctx.save();

        this.ctx.fillStyle = shape.fill || 'transparent';
        this.ctx.strokeStyle = shape.stroke || '#37352f'; // Matches --text-primary
        this.ctx.lineWidth = 2;

        const isSelected = this.selectedShapeIds.includes(shape.id);


        if (shape.rotation) {

            const centerX = shape.x + (shape.w || 0) / 2;

            const centerY = shape.y + (shape.h || 0) / 2;

            this.ctx.translate(centerX, centerY);

            this.ctx.rotate(shape.rotation);

            this.ctx.translate(-centerX, -centerY);

        }

        switch (shape.type) {

            case 'rect':

                this.ctx.beginPath();
                // 8px border radius to match your new CSS!

                this.ctx.roundRect(shape.x, shape.y, shape.w, shape.h, 8);
                this.ctx.fill();
                this.ctx.stroke();

                break;

            case 'ellipse':

                this.ctx.beginPath();

                this.ctx.ellipse(

                    shape.x + shape.w / 2,

                    shape.y + shape.h / 2,

                    shape.w / 2,

                    shape.h / 2,

                    0, 0, Math.PI * 2

                );

                this.ctx.fill();

                this.ctx.stroke();



                break;

            case 'line':

            case 'path':

                if (shape.points && shape.points.length > 0) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(shape.points[0][0], shape.points[0][1]);
                    for (let i = 1; i < shape.points.length; i++) {
                        this.ctx.lineTo(shape.points[i][0], shape.points[i][1]);
                    }
                    this.ctx.stroke();
                }
                break;
            case 'text':
                this.ctx.textBaseline = 'top';
                // Match the exact font-family from your index.css
                this.ctx.font = "24px 'Inter', system-ui, -apple-system, sans-serif";
                this.ctx.fillStyle = shape.stroke || '#37352f';
                this.ctx.fillText(shape.text || 'Double click to edit', shape.x, shape.y);
                break;
        }

        // Draw selection bounding box if selected
        if (isSelected && shape.id !== 'marquee-selection') {
            this.ctx.strokeStyle = '#2383e2';
            this.ctx.lineWidth = 1.5;
            this.ctx.shadowColor = 'transparent';

            let minX = shape.x;
            let maxX = shape.x + (shape.w || 0);
            let minY = shape.y;
            let maxY = shape.y + (shape.h || 0);

            if (minX > maxX) { const temp = minX; minX = maxX; maxX = temp; }
            if (minY > maxY) { const temp = minY; minY = maxY; maxY = temp; }

            if (shape.type === 'line' || shape.type === 'path') {
                if (shape.points && shape.points.length > 0) {
                    minX = Math.min(...shape.points.map(p => p[0]));
                    minY = Math.min(...shape.points.map(p => p[1]));
                    maxX = Math.max(...shape.points.map(p => p[0]));
                    maxY = Math.max(...shape.points.map(p => p[1]));
                }
            } else if (shape.type === 'text') {
                maxX = minX + (shape.w > 0 ? shape.w : (shape.text || 'Double click to edit').length * 14);
                maxY = minY + (shape.h > 0 ? shape.h : 24);
            }

            const padding = 4;
            const width = maxX - minX;
            const height = maxY - minY;
            this.ctx.strokeRect(minX - padding, minY - padding, width + padding * 2, height + padding * 2);
        }


        this.ctx.restore();

    }

}