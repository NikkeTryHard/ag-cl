/**
 * Share Router Tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { createShareRouter } from "../../../src/share/router.js";
import { getDefaultShareConfig } from "../../../src/share/config-storage.js";
import type { ShareConfig } from "../../../src/share/types.js";

describe("Share router", () => {
  let app: express.Application;
  let config: ShareConfig;

  const mockQuotaProvider = () => ({
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
  });

  beforeEach(() => {
    vi.useFakeTimers();
    config = getDefaultShareConfig();
    config.auth.enabled = false; // Disable auth for easier testing

    app = express();
    app.use(express.json());
    app.use(
      "/share",
      createShareRouter({
        getConfig: () => config,
        getQuotaData: mockQuotaProvider,
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("GET /share/status", () => {
    it("should return health status", async () => {
      const res = await request(app).get("/share/status");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.connectedClients).toBe(0);
      expect(res.body.maxClients).toBe(config.limits.maxClients);
    });
  });

  describe("GET /share/quota", () => {
    it("should return filtered quota data", async () => {
      const res = await request(app).get("/share/quota");

      expect(res.status).toBe(200);
      expect(res.body.claude).toBeDefined();
      expect(res.body.gemini).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });

    it("should record poll when clientId provided", async () => {
      // First register
      const regRes = await request(app).post("/share/register").send({ nickname: "test-user" });
      const { clientId } = regRes.body;

      // Then poll with client ID
      const pollRes = await request(app).get("/share/quota").set("x-client-id", clientId);

      expect(pollRes.status).toBe(200);
    });
  });

  describe("POST /share/register", () => {
    it("should register client and return clientId", async () => {
      const res = await request(app).post("/share/register").send({ nickname: "test-user" });

      expect(res.status).toBe(200);
      expect(res.body.clientId).toBeDefined();
      expect(res.body.pollInterval).toBe(config.limits.pollIntervalSeconds);
    });

    it("should register client without nickname", async () => {
      const res = await request(app).post("/share/register").send({});

      expect(res.status).toBe(200);
      expect(res.body.clientId).toBeDefined();
    });

    it("should reject when max clients reached", async () => {
      // Create a fresh app with maxClients = 1
      const limitedConfig = getDefaultShareConfig();
      limitedConfig.auth.enabled = false;
      limitedConfig.limits.maxClients = 1;

      const limitedApp = express();
      limitedApp.use(express.json());
      limitedApp.use(
        "/share",
        createShareRouter({
          getConfig: () => limitedConfig,
          getQuotaData: mockQuotaProvider,
        }),
      );

      // Register first client
      await request(limitedApp).post("/share/register").send({ nickname: "client-1" });

      // Try to register second client
      const res = await request(limitedApp).post("/share/register").send({ nickname: "client-2" });

      expect(res.status).toBe(503);
      expect(res.body.error).toContain("max clients");
    });
  });

  describe("POST /share/disconnect", () => {
    it("should disconnect registered client", async () => {
      // Register first
      const regRes = await request(app).post("/share/register").send({ nickname: "test-user" });
      const { clientId } = regRes.body;

      // Disconnect
      const disRes = await request(app).post("/share/disconnect").set("x-client-id", clientId);

      expect(disRes.status).toBe(200);
      expect(disRes.body.success).toBe(true);
    });

    it("should return 400 when no clientId provided", async () => {
      const res = await request(app).post("/share/disconnect");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("x-client-id");
    });

    it("should return 404 for unknown clientId", async () => {
      const res = await request(app).post("/share/disconnect").set("x-client-id", "unknown-id");

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("not found");
    });
  });

  describe("GET /share/clients", () => {
    it("should return list of connected clients", async () => {
      // Register a client first
      await request(app).post("/share/register").send({ nickname: "test-user" });

      const res = await request(app).get("/share/clients");

      expect(res.status).toBe(200);
      expect(res.body.clients).toHaveLength(1);
      expect(res.body.clients[0].nickname).toBe("test-user");
      expect(res.body.maxClients).toBe(config.limits.maxClients);
    });

    it("should return empty list when no clients connected", async () => {
      const res = await request(app).get("/share/clients");

      expect(res.status).toBe(200);
      expect(res.body.clients).toHaveLength(0);
    });
  });
});
