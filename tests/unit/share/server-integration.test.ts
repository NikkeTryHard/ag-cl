/**
 * Share Server Integration Tests
 *
 * Tests for mounting share router on Express app.
 */

import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { mountShareRouter, isShareModeEnabled } from "../../../src/share/server-integration.js";
import { getDefaultShareConfig } from "../../../src/share/config-storage.js";

describe("Share server integration", () => {
  describe("mountShareRouter", () => {
    it("should mount router at /share by default", async () => {
      const app = express();
      app.use(express.json());

      const config = getDefaultShareConfig();
      config.auth.enabled = false;

      mountShareRouter({
        app,
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

      const res = await request(app).get("/share/status");
      expect(res.status).toBe(200);
    });

    it("should mount router at custom path", async () => {
      const app = express();
      app.use(express.json());

      const config = getDefaultShareConfig();
      config.auth.enabled = false;

      mountShareRouter({
        app,
        basePath: "/api/share",
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

      const res = await request(app).get("/api/share/status");
      expect(res.status).toBe(200);
    });
  });

  describe("isShareModeEnabled", () => {
    const originalArgv = process.argv;
    const originalEnv = process.env.SHARE_MODE;

    afterEach(() => {
      process.argv = originalArgv;
      if (originalEnv === undefined) {
        delete process.env.SHARE_MODE;
      } else {
        process.env.SHARE_MODE = originalEnv;
      }
    });

    it("should return false by default", () => {
      process.argv = ["node", "script.js"];
      delete process.env.SHARE_MODE;
      expect(isShareModeEnabled()).toBe(false);
    });

    it("should return true when --share flag present", () => {
      process.argv = ["node", "script.js", "--share"];
      expect(isShareModeEnabled()).toBe(true);
    });

    it("should return true when SHARE_MODE env is true", () => {
      process.argv = ["node", "script.js"];
      process.env.SHARE_MODE = "true";
      expect(isShareModeEnabled()).toBe(true);
    });
  });
});
