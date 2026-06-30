// Ephemeral presence data — never persisted, never versioned
interface PresenceData {
    cursor: { x: number; y: number };
    selection: string[];
    name: string;
}

export class PresenceManager {
    // clientId → their latest cursor/selection state
    private state = new Map<string, PresenceData>();

    // Store a client's latest cursor position and selection
    update(clientId: string, cursor: { x: number; y: number }, selection: string[], name: string): void {
        this.state.set(clientId, { cursor, selection, name });
    }

    // Remove a client's presence (on leave or disconnect)
    remove(clientId: string): void {
        this.state.delete(clientId);
    }

    // Get all presence data, optionally excluding one client (the requester)
    getAll(excludeClientId?: string): Map<string, PresenceData> {
        if (!excludeClientId) return new Map(this.state);

        const result = new Map<string, PresenceData>();
        for (const [clientId, data] of this.state) {
            if (clientId !== excludeClientId) {
                result.set(clientId, data);
            }
        }
        return result;
    }

    // Check if a client has presence data
    has(clientId: string): boolean {
        return this.state.has(clientId);
    }

    // Number of active clients with presence
    get size(): number {
        return this.state.size;
    }
}