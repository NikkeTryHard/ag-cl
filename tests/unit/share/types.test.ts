// tests/unit/share/types.test.ts
import { describe, it, expect } from "vitest";
import type { ShareConfig, FriendKey, ShareVisibility, ShareLimits, AuthMode } from "../../../src/share/types.js";

describe("ShareConfig types", () => {
  it("should allow valid ShareConfig structure", () => {
    const config: ShareConfig = {
      auth: {
        enabled: true,
        mode: "single",
        masterKey: "test-key-123",
        friendKeys: [],
      },
      visibility: {
        showAccountEmails: false,
        showIndividualAccounts: true,
        showModelBreakdown: true,
        showBurnRate: false,
      },
      limits: {
        maxClients: 5,
        pollIntervalSeconds: 10,
      },
      persistence: {
        resumeOnRestart: false,
      },
    };

    expect(config.auth.mode).toBe("single");
    expect(config.limits.maxClients).toBe(5);
  });

  it("should allow per-friend auth mode", () => {
    const config: ShareConfig = {
      auth: {
        enabled: true,
        mode: "per-friend",
        masterKey: null,
        friendKeys: [{ key: "abc123", nickname: "bob", revoked: false, createdAt: Date.now() }],
      },
      visibility: {
        showAccountEmails: false,
        showIndividualAccounts: true,
        showModelBreakdown: true,
        showBurnRate: false,
      },
      limits: {
        maxClients: 5,
        pollIntervalSeconds: 10,
      },
      persistence: {
        resumeOnRestart: false,
      },
    };

    expect(config.auth.mode).toBe("per-friend");
    expect(config.auth.friendKeys[0].nickname).toBe("bob");
  });
});
