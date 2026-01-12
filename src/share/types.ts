/**
 * Share Mode Type Definitions
 */

/** Authentication mode for share access */
export type AuthMode = "single" | "per-friend";

/** Friend API key entry */
export interface FriendKey {
  key: string;
  nickname: string | null;
  revoked: boolean;
  createdAt: number;
}

/** Authentication configuration */
export interface ShareAuth {
  enabled: boolean;
  mode: AuthMode;
  masterKey: string | null;
  friendKeys: FriendKey[];
}

/** Visibility configuration - what clients can see */
export interface ShareVisibility {
  showAccountEmails: boolean;
  showIndividualAccounts: boolean;
  showModelBreakdown: boolean;
  showBurnRate: boolean;
}

/** Connection limits */
export interface ShareLimits {
  maxClients: number;
  pollIntervalSeconds: number;
}

/** Persistence settings */
export interface SharePersistence {
  resumeOnRestart: boolean;
}

/** Complete share configuration */
export interface ShareConfig {
  auth: ShareAuth;
  visibility: ShareVisibility;
  limits: ShareLimits;
  persistence: SharePersistence;
}

/** Connected client info */
export interface ConnectedClient {
  id: string;
  key: string; // masked key like "abc***"
  nickname: string | null;
  connectedAt: number;
  lastPollAt: number;
  pollCount: number;
}

/** Session log entry */
export interface SessionLogEntry {
  clientId: string;
  keyMasked: string;
  nickname: string | null;
  connectedAt: number;
  disconnectedAt: number | null;
  pollCount: number;
}

/** Share mode state */
export type ShareMode = "normal" | "host" | "client";

/** Host state for TUI */
export interface ShareHostState {
  active: boolean;
  tunnelUrl: string | null;
  connectedClients: ConnectedClient[];
  error: string | null;
}

/** Client state for TUI */
export interface ShareClientState {
  connected: boolean;
  remoteUrl: string | null;
  hostNickname: string | null;
  error: string | null;
  reconnecting: boolean;
  lastPollAt: number | null;
}
