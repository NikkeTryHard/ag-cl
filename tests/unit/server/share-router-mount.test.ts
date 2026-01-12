/**
 * Share Router Mounting Tests
 *
 * Tests the router mounting logic for share mode.
 */

import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";

describe("Share router mounting", () => {
  it("should not expose /share endpoints when share mode disabled", async () => {
    const app = express();
    // No share router mounted

    const res = await request(app).get("/share/status");
    expect(res.status).toBe(404);
  });

  it("should expose /share endpoints when share mode enabled", async () => {
    const app = express();

    // Import and mount the share router
    const { createShareRouter } = await import("../../../src/share/router.js");
    const { getDefaultShareConfig } = await import("../../../src/share/config-storage.js");

    const config = getDefaultShareConfig();
    config.auth.enabled = false; // Disable auth for test

    app.use(express.json());
    const handle = createShareRouter({
      getConfig: () => config,
      getQuotaData: () => ({
        accounts: [],
        claudeCapacity: {
          family: "claude" as const,
          totalPercentage: 80,
          accountCount: 1,
          status: "stable" as const,
          hoursToExhaustion: null,
          ratePerHour: null,
        },
        geminiCapacity: {
          family: "gemini" as const,
          totalPercentage: 60,
          accountCount: 1,
          status: "stable" as const,
          hoursToExhaustion: null,
          ratePerHour: null,
        },
      }),
    });
    app.use("/share", handle.router);

    const res = await request(app).get("/share/status");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");

    // Cleanup interval
    handle.cleanup();
  });
});
