import { wsClient } from "../net/WebSocketClient";
import { shapeStore } from "./ShapeStore";
import type { ServerMessage, Shape } from "@concord/shared";

export class Reconciler {
    constructor() {
        wsClient.onMessage((msg: ServerMessage) => {
            this.handleServerMessage(msg);
        });
    }

    private handleServerMessage(msg: ServerMessage) {
        switch (msg.type) {
            case 'snapshot':
                shapeStore.clear()
                for (const s of msg.shapes) {
                    shapeStore.add(s, true)
                }
                break;
            case 'op-resolved': {
                const { op, accepted } = msg;
                if (!accepted) {
                    console.warn(`[Reconciler] Server rejected operation: `, op);
                    if (op.type === 'create') {
                        shapeStore.remove(op.shapeId, true)
                    }
                    return;
                }
                switch (op.type) {
                    case 'create':
                        if (!shapeStore.get(op.shapeId) && op.payload) {
                            shapeStore.add(op.payload as Shape, true)
                        }
                        break;
                    case 'update':
                    case 'move':
                    case 'resize':
                        if (op.payload) {
                            shapeStore.update(op.shapeId, op.payload, true)
                        }
                        break;

                    case 'delete':
                        shapeStore.remove(op.shapeId);
                        break;
                }
                break;
            }
        }
    }
}

export const reconciler = new Reconciler();