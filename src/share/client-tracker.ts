/**
 * Client Tracker
 *
 * Tracks connected share clients and their activity.
 */

import { randomUUID } from "crypto";
import type { ConnectedClient, SessionLogEntry } from "./types.js";

export interface RegisterResult {
  success: boolean;
  clientId?: string;
  error?: string;
}

export class ClientTracker {
  private clients = new Map<string, ConnectedClient>();
  private maxClients: number;
  private timeoutMs: number;
  private sessionLog: SessionLogEntry[] = [];

  constructor(maxClients: number, timeoutMs: number) {
    this.maxClients = maxClients;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Register a new client connection
   */
  registerClient(keyMasked: string, nickname: string | null): RegisterResult {
    if (this.clients.size >= this.maxClients) {
      return {
        success: false,
        error: `Connection rejected: max clients (${this.maxClients}) reached`,
      };
    }

    const clientId = randomUUID();
    const now = Date.now();

    this.clients.set(clientId, {
      id: clientId,
      key: keyMasked,
      nickname,
      connectedAt: now,
      lastPollAt: now,
      pollCount: 0,
    });

    return { success: true, clientId };
  }

  /**
   * Record a poll from a client
   */
  recordPoll(clientId: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    client.lastPollAt = Date.now();
    client.pollCount++;
    return true;
  }

  /**
   * Get all connected clients
   */
  getConnectedClients(): ConnectedClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Disconnect a client and return session log entry
   */
  disconnectClient(clientId: string): SessionLogEntry | null {
    const client = this.clients.get(clientId);
    if (!client) return null;

    this.clients.delete(clientId);

    const entry: SessionLogEntry = {
      clientId: client.id,
      keyMasked: client.key,
      nickname: client.nickname,
      connectedAt: client.connectedAt,
      disconnectedAt: Date.now(),
      pollCount: client.pollCount,
    };

    this.sessionLog.push(entry);
    return entry;
  }

  /**
   * Clean up clients that haven't polled within timeout
   */
  cleanupStaleClients(): SessionLogEntry[] {
    const now = Date.now();
    const stale: string[] = [];

    for (const [id, client] of this.clients) {
      if (now - client.lastPollAt > this.timeoutMs) {
        stale.push(id);
      }
    }

    return stale.map((id) => this.disconnectClient(id)!);
  }

  /**
   * Get session log
   */
  getSessionLog(): SessionLogEntry[] {
    return [...this.sessionLog];
  }

  /**
   * Update max clients limit
   */
  setMaxClients(max: number): void {
    this.maxClients = max;
  }

  /**
   * Disconnect all clients
   */
  disconnectAll(): SessionLogEntry[] {
    const entries: SessionLogEntry[] = [];
    for (const id of this.clients.keys()) {
      const entry = this.disconnectClient(id);
      if (entry) entries.push(entry);
    }
    return entries;
  }
}
