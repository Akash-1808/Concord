import type { ClientMessage, ServerMessage } from "@concord/shared";

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

type MessageListener = (msg: ServerMessage) => void;
type StateListener = (state: ConnectionState) => void

export class WebSocketClient {
    private url: string;
    private ws: WebSocket | null = null;
    private roomId: string | null = null;
    public readonly clientId: string;
    public readonly clientName: string;

    private state: ConnectionState = 'disconnected';
    private messageListeners = new Set<MessageListener>();
    private stateListeners = new Set<StateListener>();
    private reconnectAttempts = 0;
    private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
    private explicitDisconnect = false;

    constructor(url: string, clientId: string, clientName: string) {
        this.url = url;
        this.clientId = clientId;
        this.clientName = clientName;
    }

    private setState(newState: ConnectionState) {
        if (this.state !== newState) {
            this.state = newState;

            for (const listener of this.stateListeners) {
                listener(newState);
            }
        }
    }

    public connect(roomId: string) {
        this.roomId = roomId;

        this.setState('connecting');

        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => {
            console.log('[WS] connected to server');
            this.setState('connected');

            this.send({
                type: 'join',
                clientId: this.clientId,
                roomId: this.roomId!,
                name: this.clientName,
            });
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data) as ServerMessage;
                for (const listener of this.messageListeners) {
                    listener(message);
                }
            } catch (err) {
                console.error('[WS] failed to parse message:', err);
            }
        };

        this.ws.onclose = () => {
            if (this.explicitDisconnect) {
                console.log('[WS] disconnected by client');
                this.setState('disconnected');
            } else {
                console.warn('[Ws] Connection lost. Reconnecting...');
                this.scheduleReconnect();
            }
        }

        this.ws.onerror = (error) => {
            console.error('[WS] Websocket Error:', error);
            this.ws?.close();
        }
    }
    public disconnect() {
        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.send({
                    type: 'leave'
                });
            }
            this.ws.close();
            this.ws = null;
        }
        this.setState('disconnected');
    }

    public send(message: ClientMessage) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('[WS] cannot send message, not connected');
        }
    }

    private scheduleReconnect() {
        this.setState('reconnecting');
        if (this.ws) {
            this.ws.close();
            this.ws = null
        }
        if (this.reconnectTimeoutId) return;
        const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        const jitter = baseDelay * 0.2 * Math.random();

        const delay = baseDelay + jitter;
        this.reconnectAttempts++;
        console.log(`[WS] Reconnecting in ${Math.round(delay)}ms (Attempt ${this.reconnectAttempts})`);

        this.reconnectTimeoutId = setTimeout(() => {
            this.reconnectTimeoutId = null;
            if (this.roomId && !this.explicitDisconnect) {
                this.connect(this.roomId);
            }
        }, delay)

    }
    // ─── Listeners ───────────────────────────────────────────
    public onMessage(listener: MessageListener): () => void {
        this.messageListeners.add(listener);
        return () => this.messageListeners.delete(listener);
    }
    public onStateChange(listener: StateListener): () => void {
        this.stateListeners.add(listener);
        return () => this.stateListeners.delete(listener);
    }
}

export const wsClient = new WebSocketClient(
    import.meta.env.VITE_WS_URL ||
    'ws://localhost:3001',
    'client-' + Math.random().toString(36).substring(2, 9),
    'Anonymous'
)