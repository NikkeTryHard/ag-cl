/**
 * Share Module
 *
 * Re-exports all share mode functionality.
 */

// Types
export type { AuthMode, FriendKey, ShareAuth, ShareVisibility, ShareLimits, SharePersistence, ShareConfig, ConnectedClient, SessionLogEntry, ShareMode, ShareHostState, ShareClientState } from "./types.js";

// Config storage
export { getDefaultShareConfig, loadShareConfig, saveShareConfig } from "./config-storage.js";

// API key utilities
export { generateApiKey, maskApiKey, validateApiKey, generateFriendKey } from "./api-key.js";
export type { ValidationResult } from "./api-key.js";

// Middleware
export { createShareAuthMiddleware } from "./middleware.js";
export type { ShareAuthRequest } from "./middleware.js";

// Quota filter
export { filterQuotaData } from "./quota-filter.js";
export type { FilteredQuotaData } from "./quota-filter.js";

// Client tracker
export { ClientTracker } from "./client-tracker.js";
export type { RegisterResult } from "./client-tracker.js";

// Router
export { createShareRouter, createShareRouterWithHandle } from "./router.js";
export type { ShareRouterOptions, ShareRouterHandle } from "./router.js";

// Tunnel
export { TunnelManager, checkCloudflaredInstalled, getInstallInstructions } from "./tunnel.js";
export type { TunnelEvents } from "./tunnel.js";

// Session logger
export { SessionLogger } from "./session-logger.js";

// Server integration
export { mountShareRouter, isShareModeEnabled } from "./server-integration.js";
export type { MountShareRouterOptions } from "./server-integration.js";
