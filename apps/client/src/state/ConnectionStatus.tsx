import { useState, useEffect } from "react";
import { type ConnectionState, wsClient } from "../net/WebSocketClient";

export function ConnectionStatus() {
    const [state, setState] = useState<ConnectionState>('disconnected');

    useEffect(() => {
        const unsubscribe = wsClient.onStateChange((newState) => {
            setState(newState);
        });
        return unsubscribe;
    }, []);

    const getConfig = () => {
        switch (state) {
            case 'connected':
                return { color: '#22c55e', text: 'Connected', bg: 'rgba(34, 197, 94, 0.1)', }
            case 'connecting':
                return { color: '#eab308', text: 'Connecting', bg: 'rgba(234, 179, 8, 0.1)', }
            case 'reconnecting':
                return { color: '#f97316', text: 'Reconnecting...', bg: 'rgba(249, 115, 22, 0.1)' }
            case 'disconnected':
                return { color: '#ef4444', text: 'Disconnected', bg: 'rgba(239, 68, 68, 0.1)', }
            default:
                return { color: '#ef4444', text: 'Offline', bg: 'rgba(239, 68, 68, 0.1)' };

        }
    }
    const config = getConfig();

    return (
        <div style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            borderRadius: '20px',
            backgroundColor: config.bg,
            border: `1px solid ${config.color}`,
            color: config.color,
            fontSize: '12px',
            fontFamily: 'sans-serif',
            fontWeight: 500,
            zIndex: 1000,
            backdropFilter: 'blur(4px)',
            transition: 'all 0.3s ease'
        }}>
            <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: config.color,
                boxShadow: `0 0 8px ${config.color}`
            }} />
            <span>{config.text}</span>
        </div>
    )
}