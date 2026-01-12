/**
 * Share Router
 *
 * Express router for share mode endpoints.
 */

import { Router, type Request, type Response } from "express";
import { createShareAuthMiddleware, type ShareAuthRequest } from "./middleware.js";
import { filterQuotaData } from "./quota-filter.js";
import { ClientTracker } from "./client-tracker.js";
import type { ShareConfig } from "./types.js";
import type { AccountCapacityInfo, AggregatedCapacity } from "../tui/types.js";
import { SHARE_CLIENT_TIMEOUT_MS } from "../constants.js";

export interface ShareRouterOptions {
  getConfig: () => ShareConfig;
  getQuotaData: () => {
    accounts: AccountCapacityInfo[];
    claudeCapacity: AggregatedCapacity;
    geminiCapacity: AggregatedCapacity;
  };
}

export interface ShareRouterHandle {
  router: Router;
  tracker: ClientTracker;
  cleanup: () => void;
}

/**
 * Create share router with endpoints for quota sharing
 */
export function createShareRouter(options: ShareRouterOptions): ShareRouterHandle {
  const router = Router();
  const { getConfig, getQuotaData } = options;

  // Initialize client tracker
  const tracker = new ClientTracker(getConfig().limits.maxClients, SHARE_CLIENT_TIMEOUT_MS);

  // Cleanup stale clients periodically
  const cleanupInterval = setInterval(() => {
    tracker.cleanupStaleClients();
  }, 30000);

  const cleanup = (): void => {
    clearInterval(cleanupInterval);
  };

  // Auth middleware for all routes
  router.use(createShareAuthMiddleware(getConfig));

  /**
   * GET /status - Health check
   */
  router.get("/status", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      connectedClients: tracker.getConnectedClients().length,
      maxClients: getConfig().limits.maxClients,
    });
  });

  /**
   * POST /register - Register as a client
   */
  router.post("/register", (req: ShareAuthRequest, res: Response) => {
    const { nickname } = req.body as { nickname?: string };
    const keyMasked = req.shareAuth?.keyMasked ?? "anon";

    const result = tracker.registerClient(keyMasked, nickname ?? null);

    if (!result.success) {
      res.status(503).json({ error: result.error });
      return;
    }

    res.json({
      clientId: result.clientId,
      pollInterval: getConfig().limits.pollIntervalSeconds,
    });
  });

  /**
   * GET /quota - Get filtered quota data
   */
  router.get("/quota", (req: Request, res: Response) => {
    const config = getConfig();
    const { accounts, claudeCapacity, geminiCapacity } = getQuotaData();

    // Record poll if client ID provided
    const clientId = req.headers["x-client-id"] as string | undefined;
    if (clientId) {
      tracker.recordPoll(clientId);
    }

    const filtered = filterQuotaData(accounts, claudeCapacity, geminiCapacity, config.visibility);

    res.json(filtered);
  });

  /**
   * POST /disconnect - Disconnect client
   */
  router.post("/disconnect", (req: Request, res: Response) => {
    const clientId = req.headers["x-client-id"] as string | undefined;

    if (!clientId) {
      res.status(400).json({ error: "x-client-id header required" });
      return;
    }

    const session = tracker.disconnectClient(clientId);
    if (!session) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    res.json({ success: true });
  });

  /**
   * GET /clients - Get connected clients (host only)
   */
  router.get("/clients", (_req: Request, res: Response) => {
    res.json({
      clients: tracker.getConnectedClients(),
      maxClients: getConfig().limits.maxClients,
    });
  });

  return { router, tracker, cleanup };
}
