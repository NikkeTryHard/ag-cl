/**
 * Share Mode Middleware
 *
 * Express middleware for API key authentication on share endpoints.
 */

import type { Request, Response, NextFunction } from "express";
import { validateApiKey } from "./api-key.js";
import type { ShareConfig } from "./types.js";

/**
 * Extended request with share auth info
 */
export interface ShareAuthRequest extends Request {
  shareAuth?: {
    nickname: string | null;
    keyMasked: string | null;
  };
}

/**
 * Create share auth middleware
 * @param getConfig - Function to get current share config
 */
export function createShareAuthMiddleware(getConfig: () => ShareConfig): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const config = getConfig();

    // Get API key from header or query param
    const apiKey = (req.headers["x-api-key"] as string | undefined) || (req.query?.key as string | undefined);

    const result = validateApiKey(config, apiKey);

    if (!result.valid) {
      res.status(401).json({
        error: "Unauthorized",
        message: config.auth.enabled ? "Valid API key required" : "Authentication failed",
      });
      return;
    }

    // Attach auth info to request
    (req as ShareAuthRequest).shareAuth = {
      nickname: result.nickname,
      keyMasked: result.keyMasked,
    };

    next();
  };
}
