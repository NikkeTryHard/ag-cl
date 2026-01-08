/**
 * Unit tests for settings/defaults.ts
 *
 * Tests getter functions that check settings, then fall back to env vars,
 * then fall back to hardcoded defaults.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DEFAULTS, getIdentityMode, getDefaultPort, getLogLevel, getFallbackEnabled, getCooldownDurationMs } from "../../../src/settings/defaults.js";
import { DEFAULT_PORT, DEFAULT_COOLDOWN_MS } from "../../../src/constants.js";
import type { AccountSettings } from "../../../src/account-manager/types.js";

describe("settings/defaults", () => {
  describe("DEFAULTS constant", () => {
    it("has correct default values", () => {
      expect(DEFAULTS.identityMode).toBe("full");
      expect(DEFAULTS.defaultPort).toBe(DEFAULT_PORT);
      expect(DEFAULTS.logLevel).toBe("info");
      expect(DEFAULTS.fallbackEnabled).toBe(false);
      expect(DEFAULTS.cooldownDurationMs).toBe(DEFAULT_COOLDOWN_MS);
    });

    it("uses DEFAULT_PORT from constants.ts", () => {
      expect(DEFAULTS.defaultPort).toBe(8080);
    });

    it("uses DEFAULT_COOLDOWN_MS from constants.ts", () => {
      expect(DEFAULTS.cooldownDurationMs).toBe(10000);
    });
  });

  describe("getIdentityMode", () => {
    const originalEnv = process.env.AG_INJECT_IDENTITY;

    beforeEach(() => {
      delete process.env.AG_INJECT_IDENTITY;
    });

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.AG_INJECT_IDENTITY = originalEnv;
      } else {
        delete process.env.AG_INJECT_IDENTITY;
      }
    });

    describe("priority: settings object first", () => {
      it("returns settings.identityMode when provided", () => {
        const settings: AccountSettings = { identityMode: "short" };
        expect(getIdentityMode(settings)).toBe("short");
      });

      it("returns 'none' from settings when set", () => {
        const settings: AccountSettings = { identityMode: "none" };
        expect(getIdentityMode(settings)).toBe("none");
      });

      it("returns 'full' from settings when set", () => {
        const settings: AccountSettings = { identityMode: "full" };
        expect(getIdentityMode(settings)).toBe("full");
      });

      it("settings take precedence over env var", () => {
        process.env.AG_INJECT_IDENTITY = "none";
        const settings: AccountSettings = { identityMode: "short" };
        expect(getIdentityMode(settings)).toBe("short");
      });
    });

    describe("priority: env var second", () => {
      it("returns 'none' when AG_INJECT_IDENTITY=none", () => {
        process.env.AG_INJECT_IDENTITY = "none";
        expect(getIdentityMode()).toBe("none");
      });

      it("returns 'short' when AG_INJECT_IDENTITY=short", () => {
        process.env.AG_INJECT_IDENTITY = "short";
        expect(getIdentityMode()).toBe("short");
      });

      it("returns 'full' when AG_INJECT_IDENTITY=full", () => {
        process.env.AG_INJECT_IDENTITY = "full";
        expect(getIdentityMode()).toBe("full");
      });

      it("handles case-insensitive env var", () => {
        process.env.AG_INJECT_IDENTITY = "SHORT";
        expect(getIdentityMode()).toBe("short");

        process.env.AG_INJECT_IDENTITY = "None";
        expect(getIdentityMode()).toBe("none");

        process.env.AG_INJECT_IDENTITY = "FULL";
        expect(getIdentityMode()).toBe("full");
      });

      it("returns default for invalid env var value", () => {
        process.env.AG_INJECT_IDENTITY = "invalid";
        expect(getIdentityMode()).toBe("full");
      });

      it("returns default for empty env var", () => {
        process.env.AG_INJECT_IDENTITY = "";
        expect(getIdentityMode()).toBe("full");
      });
    });

    describe("priority: default last", () => {
      it("returns 'full' as default when no settings and no env var", () => {
        expect(getIdentityMode()).toBe("full");
      });

      it("returns 'full' when settings is undefined", () => {
        expect(getIdentityMode(undefined)).toBe("full");
      });

      it("returns 'full' when settings has no identityMode", () => {
        const settings: AccountSettings = {};
        expect(getIdentityMode(settings)).toBe("full");
      });

      it("falls back to env var when settings.identityMode is undefined", () => {
        process.env.AG_INJECT_IDENTITY = "short";
        const settings: AccountSettings = { defaultPort: 3000 };
        expect(getIdentityMode(settings)).toBe("short");
      });
    });
  });

  describe("getDefaultPort", () => {
    describe("priority: settings object first", () => {
      it("returns settings.defaultPort when provided", () => {
        const settings: AccountSettings = { defaultPort: 3000 };
        expect(getDefaultPort(settings)).toBe(3000);
      });

      it("returns custom port from settings", () => {
        const settings: AccountSettings = { defaultPort: 9999 };
        expect(getDefaultPort(settings)).toBe(9999);
      });

      it("returns port 0 from settings (valid edge case)", () => {
        const settings: AccountSettings = { defaultPort: 0 };
        expect(getDefaultPort(settings)).toBe(0);
      });
    });

    describe("priority: default last", () => {
      it("returns DEFAULT_PORT when no settings provided", () => {
        expect(getDefaultPort()).toBe(DEFAULT_PORT);
      });

      it("returns DEFAULT_PORT when settings is undefined", () => {
        expect(getDefaultPort(undefined)).toBe(DEFAULT_PORT);
      });

      it("returns DEFAULT_PORT when settings has no defaultPort", () => {
        const settings: AccountSettings = { logLevel: "debug" };
        expect(getDefaultPort(settings)).toBe(DEFAULT_PORT);
      });

      it("returns 8080 as the default port", () => {
        expect(getDefaultPort()).toBe(8080);
      });
    });
  });

  describe("getLogLevel", () => {
    describe("priority: settings object first", () => {
      it("returns settings.logLevel when provided", () => {
        const settings: AccountSettings = { logLevel: "debug" };
        expect(getLogLevel(settings)).toBe("debug");
      });

      it("returns all valid log levels from settings", () => {
        expect(getLogLevel({ logLevel: "silent" })).toBe("silent");
        expect(getLogLevel({ logLevel: "error" })).toBe("error");
        expect(getLogLevel({ logLevel: "warn" })).toBe("warn");
        expect(getLogLevel({ logLevel: "info" })).toBe("info");
        expect(getLogLevel({ logLevel: "debug" })).toBe("debug");
        expect(getLogLevel({ logLevel: "trace" })).toBe("trace");
      });
    });

    describe("priority: default last", () => {
      it("returns 'info' when no settings provided", () => {
        expect(getLogLevel()).toBe("info");
      });

      it("returns 'info' when settings is undefined", () => {
        expect(getLogLevel(undefined)).toBe("info");
      });

      it("returns 'info' when settings has no logLevel", () => {
        const settings: AccountSettings = { defaultPort: 3000 };
        expect(getLogLevel(settings)).toBe("info");
      });
    });
  });

  describe("getFallbackEnabled", () => {
    describe("priority: settings object first", () => {
      it("returns settings.fallbackEnabled when true", () => {
        const settings: AccountSettings = { fallbackEnabled: true };
        expect(getFallbackEnabled(settings)).toBe(true);
      });

      it("returns settings.fallbackEnabled when false", () => {
        const settings: AccountSettings = { fallbackEnabled: false };
        expect(getFallbackEnabled(settings)).toBe(false);
      });
    });

    describe("priority: default last", () => {
      it("returns false when no settings provided", () => {
        expect(getFallbackEnabled()).toBe(false);
      });

      it("returns false when settings is undefined", () => {
        expect(getFallbackEnabled(undefined)).toBe(false);
      });

      it("returns false when settings has no fallbackEnabled", () => {
        const settings: AccountSettings = { logLevel: "debug" };
        expect(getFallbackEnabled(settings)).toBe(false);
      });
    });
  });

  describe("getCooldownDurationMs", () => {
    describe("priority: settings object first", () => {
      it("returns settings.cooldownDurationMs when provided", () => {
        const settings: AccountSettings = { cooldownDurationMs: 5000 };
        expect(getCooldownDurationMs(settings)).toBe(5000);
      });

      it("returns 0 from settings (valid edge case)", () => {
        const settings: AccountSettings = { cooldownDurationMs: 0 };
        expect(getCooldownDurationMs(settings)).toBe(0);
      });

      it("returns large values from settings", () => {
        const settings: AccountSettings = { cooldownDurationMs: 60000 };
        expect(getCooldownDurationMs(settings)).toBe(60000);
      });
    });

    describe("priority: default last", () => {
      it("returns DEFAULT_COOLDOWN_MS when no settings provided", () => {
        expect(getCooldownDurationMs()).toBe(DEFAULT_COOLDOWN_MS);
      });

      it("returns DEFAULT_COOLDOWN_MS when settings is undefined", () => {
        expect(getCooldownDurationMs(undefined)).toBe(DEFAULT_COOLDOWN_MS);
      });

      it("returns DEFAULT_COOLDOWN_MS when settings has no cooldownDurationMs", () => {
        const settings: AccountSettings = { logLevel: "debug" };
        expect(getCooldownDurationMs(settings)).toBe(DEFAULT_COOLDOWN_MS);
      });

      it("returns 10000 (10 seconds) as the default", () => {
        expect(getCooldownDurationMs()).toBe(10000);
      });
    });
  });

  describe("integration: multiple settings", () => {
    it("reads correct values from settings with multiple properties", () => {
      const settings: AccountSettings = {
        identityMode: "short",
        defaultPort: 3000,
        logLevel: "debug",
        fallbackEnabled: true,
        cooldownDurationMs: 5000,
      };

      expect(getIdentityMode(settings)).toBe("short");
      expect(getDefaultPort(settings)).toBe(3000);
      expect(getLogLevel(settings)).toBe("debug");
      expect(getFallbackEnabled(settings)).toBe(true);
      expect(getCooldownDurationMs(settings)).toBe(5000);
    });

    it("mixes settings and defaults correctly", () => {
      const settings: AccountSettings = {
        identityMode: "none",
        // defaultPort not set - should use default
        logLevel: "error",
        // fallbackEnabled not set - should use default
        // cooldownDurationMs not set - should use default
      };

      expect(getIdentityMode(settings)).toBe("none");
      expect(getDefaultPort(settings)).toBe(8080);
      expect(getLogLevel(settings)).toBe("error");
      expect(getFallbackEnabled(settings)).toBe(false);
      expect(getCooldownDurationMs(settings)).toBe(10000);
    });
  });
});
