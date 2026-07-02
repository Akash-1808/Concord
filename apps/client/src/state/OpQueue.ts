import { wsClient } from "../net/WebSocketClient";
import type { Op } from "@concord/shared";


export class OpQueue {
    private pendingQueue: Op[] = [];
    private isConnected = false;

    constructor() {
        wsClient.onStateChange(state => {
            this.isConnected = (state === 'connected');
            if (this.isConnected) {
                console.log('[OpQueue] Connecction restored Draining queue...');
                this.flush();
            }
        })
    }
    public enqueue(op: Op) {
        this.pendingQueue.push(op);
        this.flush();

    }
    private flush() {
        if (!this.isConnected) return;

        while (this.pendingQueue.length > 0) {
            const op = this.pendingQueue.shift()!;
            wsClient.send({
                type: 'op',
                op: op
            })
        }
    }
}

export const opQueue = new OpQueue();