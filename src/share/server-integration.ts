/**
 * Share Server Integration
 *
 * Helper to mount share router on an Express app.
 */

import type { Application } from "express";
import { createShareRouter, type ShareRouterOptions } from "./router.js";

export interface MountShareRouterOptions extends ShareRouterOptions {
  app: Application;
  basePath?: string;
}

/**
 * Mount the share router on an Express application
 */
export function mountShareRouter(options: MountShareRouterOptions): void {
  const { app, basePath = "/share", ...routerOptions } = options;
  const router = createShareRouter(routerOptions);
  app.use(basePath, router);
}

/**
 * Check if share mode should be enabled based on CLI args or env
 */
export function isShareModeEnabled(): boolean {
  // Check for --share flag or SHARE_MODE env
  const args = process.argv;
  if (args.includes("--share")) return true;
  if (process.env.SHARE_MODE === "true") return true;
  return false;
}
