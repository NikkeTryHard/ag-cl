/**
 * Share Mode Integration Tests
 *
 * Tests the full share mode lifecycle including host/client interaction,
 * authentication, visibility settings, and client limits.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { type Application, type Router } from "express";
import request from "supertest";
import { createShareRouter } from "../../src/share/router.js";
import { getDefaultShareConfig } from "../../src/share/config-storage.js";
import { generateApiKey } from "../../src/share/api-key.js";
import { ClientTracker } from "../../src/share/client-tracker.js";
import type { ShareConfig } from "../../src/share/types.js";
import type { AccountCapacityInfo, AggregatedCapacity } from "../../src/tui/types.js";

describe("Share mode integration", () => {
  let app: Application;
  let config: ShareConfig;
  let masterKey: string;
  let routerCleanup: () => void;
  let tracker: ClientTracker;

  const mockAccounts: AccountCapacityInfo[] = [
    {
      email: "test@example.com",
      tier: "pro",
      claudeModels: [{ name: "sonnet", percentage: 75, resetTime: null }],
      geminiProModels: [{ name: "pro", percentage: 60, resetTime: null }],
      geminiFlashModels: [],
      claudeReset: null,
      geminiProReset: null,
      geminiFlashReset: null,
      error: null,
    },
  ];

  const mockClaudeCapacity: AggregatedCapacity = {
    family: "claude",
    totalPercentage: 75,
    accountCount: 1,
    status: "stable",
    hoursToExhaustion: 5,
    ratePerHour: 5,
  };

  const mockGeminiCapacity: AggregatedCapacity = {
    family: "gemini",
    totalPercentage: 60,
    accountCount: 1,
    status: "stable",
    hoursToExhaustion: 8,
    ratePerHour: 3,
  };

  beforeAll(() => {
    masterKey = generateApiKey();
    config = getDefaultShareConfig();
    config.auth.enabled = true;
    config.auth.masterKey = masterKey;
    config.visibility.showAccountEmails = false;
    config.visibility.showBurnRate = true;

    app = express();
    app.use(express.json());

    const router = createShareRouter({
      getConfig: () => config,
      getQuotaData: () => ({
        accounts: mockAccounts,
        claudeCapacity: mockClaudeCapacity,
        geminiCapacity: mockGeminiCapacity,
      }),
    });

    // Store cleanup function for afterAll
    routerCleanup = (router as unknown as { _cleanup: () => void })._cleanup;

    // Store tracker reference for tests
    tracker = (router as unknown as { _tracker: ClientTracker })._tracker;

    app.use("/share", router);
  });

  afterAll(() => {
    // Clean up the interval from the router
    if (routerCleanup) {
      routerCleanup();
    }
  });

  describe("Full client lifecycle", () => {
    let clientId: string;

    it("should reject unauthenticated requests", async () => {
      const res = await request(app).get("/share/status");
      expect(res.status).toBe(401);
    });

    it("should accept authenticated requests", async () => {
      const res = await request(app).get("/share/status").set("x-api-key", masterKey);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });

    it("should register a new client", async () => {
      const res = await request(app).post("/share/register").set("x-api-key", masterKey).send({ nickname: "test-client" });

      expect(res.status).toBe(200);
      expect(res.body.clientId).toBeDefined();
      expect(res.body.pollInterval).toBe(10);

      clientId = res.body.clientId;
    });

    it("should show client in connected list", async () => {
      const res = await request(app).get("/share/clients").set("x-api-key", masterKey);

      expect(res.status).toBe(200);
      expect(res.body.clients).toHaveLength(1);
      expect(res.body.clients[0].nickname).toBe("test-client");
    });

    it("should return filtered quota data", async () => {
      const res = await request(app).get("/share/quota").set("x-api-key", masterKey).set("x-client-id", clientId);

      expect(res.status).toBe(200);

      // Check Claude data
      expect(res.body.claude.totalPercentage).toBe(75);
      expect(res.body.claude.status).toBe("stable");

      // Check burn rate is included (visibility enabled)
      expect(res.body.claude.hoursToExhaustion).toBe(5);

      // Check accounts are included but emails hidden
      expect(res.body.accounts).toBeDefined();
      expect(res.body.accounts[0].email).toBe("Account 1");

      // Check timestamp
      expect(res.body.timestamp).toBeDefined();
    });

    it("should record poll activity", async () => {
      // Make multiple polls
      await request(app).get("/share/quota").set("x-api-key", masterKey).set("x-client-id", clientId);

      await request(app).get("/share/quota").set("x-api-key", masterKey).set("x-client-id", clientId);

      const res = await request(app).get("/share/clients").set("x-api-key", masterKey);

      expect(res.body.clients[0].pollCount).toBeGreaterThan(0);
    });

    it("should disconnect client", async () => {
      const res = await request(app).post("/share/disconnect").set("x-api-key", masterKey).set("x-client-id", clientId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should show no clients after disconnect", async () => {
      const res = await request(app).get("/share/clients").set("x-api-key", masterKey);

      expect(res.body.clients).toHaveLength(0);
    });
  });

  describe("Visibility settings", () => {
    it("should hide burn rate when disabled", async () => {
      const originalValue = config.visibility.showBurnRate;
      config.visibility.showBurnRate = false;

      const res = await request(app).get("/share/quota").set("x-api-key", masterKey);

      expect(res.body.claude.ratePerHour).toBeNull();
      expect(res.body.claude.hoursToExhaustion).toBeNull();

      config.visibility.showBurnRate = originalValue;
    });

    it("should hide accounts when disabled", async () => {
      const originalValue = config.visibility.showIndividualAccounts;
      config.visibility.showIndividualAccounts = false;

      const res = await request(app).get("/share/quota").set("x-api-key", masterKey);

      expect(res.body.accounts).toBeUndefined();

      config.visibility.showIndividualAccounts = originalValue;
    });
  });

  describe("Max clients limit", () => {
    it("should reject when max clients reached", async () => {
      // Use tracker's setMaxClients method to properly set the limit
      tracker.setMaxClients(2);

      // Register max clients
      const client1 = await request(app).post("/share/register").set("x-api-key", masterKey).send({ nickname: "client1" });

      const client2 = await request(app).post("/share/register").set("x-api-key", masterKey).send({ nickname: "client2" });

      // Try to register one more
      const client3 = await request(app).post("/share/register").set("x-api-key", masterKey).send({ nickname: "client3" });

      expect(client1.status).toBe(200);
      expect(client2.status).toBe(200);
      expect(client3.status).toBe(503);
      expect(client3.body.error).toContain("max clients");

      // Cleanup
      await request(app).post("/share/disconnect").set("x-api-key", masterKey).set("x-client-id", client1.body.clientId);

      await request(app).post("/share/disconnect").set("x-api-key", masterKey).set("x-client-id", client2.body.clientId);

      // Restore original max clients
      tracker.setMaxClients(config.limits.maxClients);
    });
  });

  describe("API key validation", () => {
    it("should reject invalid API key", async () => {
      const res = await request(app).get("/share/status").set("x-api-key", "invalid-key");

      expect(res.status).toBe(401);
    });

    it("should accept API key in query param", async () => {
      const res = await request(app).get(`/share/status?key=${masterKey}`);

      expect(res.status).toBe(200);
    });
  });

  describe("Disconnect error handling", () => {
    it("should require client ID for disconnect", async () => {
      const res = await request(app).post("/share/disconnect").set("x-api-key", masterKey);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("x-client-id");
    });

    it("should return 404 for unknown client", async () => {
      const res = await request(app).post("/share/disconnect").set("x-api-key", masterKey).set("x-client-id", "unknown-client-id");

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("not found");
    });
  });

  describe("Status endpoint", () => {
    it("should return server status with client count", async () => {
      // Register a client first
      const registerRes = await request(app).post("/share/register").set("x-api-key", masterKey).send({ nickname: "status-test" });

      const statusRes = await request(app).get("/share/status").set("x-api-key", masterKey);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.status).toBe("ok");
      expect(statusRes.body.connectedClients).toBeGreaterThanOrEqual(1);
      expect(statusRes.body.maxClients).toBe(config.limits.maxClients);
      expect(statusRes.body.timestamp).toBeDefined();

      // Cleanup
      await request(app).post("/share/disconnect").set("x-api-key", masterKey).set("x-client-id", registerRes.body.clientId);
    });
  });

  describe("Gemini quota data", () => {
    it("should return gemini capacity in quota response", async () => {
      const res = await request(app).get("/share/quota").set("x-api-key", masterKey);

      expect(res.status).toBe(200);
      expect(res.body.gemini).toBeDefined();
      expect(res.body.gemini.totalPercentage).toBe(60);
      expect(res.body.gemini.status).toBe("stable");
    });
  });
});
