/**
 * Unit Tests: AccountSettings Types
 *
 * Verifies that AccountSettings and related type aliases are correctly shaped.
 */

import { describe, it, expect, expectTypeOf } from "vitest";
import type { AccountSettings, LogLevel, IdentityMode, SchedulingMode } from "../../../src/account-manager/types.js";

describe("AccountSettings types", () => {
  describe("LogLevel type", () => {
    it("accepts all valid log levels", () => {
      const levels: LogLevel[] = ["silent", "error", "warn", "info", "debug", "trace"];
      expect(levels).toHaveLength(6);
    });

    it("has correct type shape", () => {
      expectTypeOf<LogLevel>().toEqualTypeOf<"silent" | "error" | "warn" | "info" | "debug" | "trace">();
    });
  });

  describe("IdentityMode type", () => {
    it("accepts all valid identity modes", () => {
      const modes: IdentityMode[] = ["full", "short", "none"];
      expect(modes).toHaveLength(3);
    });

    it("has correct type shape", () => {
      expectTypeOf<IdentityMode>().toEqualTypeOf<"full" | "short" | "none">();
    });
  });

  describe("SchedulingMode type", () => {
    it("accepts all valid scheduling modes", () => {
      const modes: SchedulingMode[] = ["sticky", "refresh-priority", "drain-highest", "round-robin"];
      expect(modes).toHaveLength(4);
    });

    it("has correct type shape", () => {
      expectTypeOf<SchedulingMode>().toEqualTypeOf<"sticky" | "refresh-priority" | "drain-highest" | "round-robin">();
    });
  });

  describe("AccountSettings interface", () => {
    it("has cooldownDurationMs as optional number", () => {
      expectTypeOf<AccountSettings>().toHaveProperty("cooldownDurationMs");
      const settings: AccountSettings = { cooldownDurationMs: 5000 };
      expect(settings.cooldownDurationMs).toBe(5000);
    });

    it("has identityMode as optional IdentityMode", () => {
      expectTypeOf<AccountSettings>().toHaveProperty("identityMode");
      const settings: AccountSettings = { identityMode: "full" };
      expect(settings.identityMode).toBe("full");
    });

    it("has defaultPort as optional number", () => {
      expectTypeOf<AccountSettings>().toHaveProperty("defaultPort");
      const settings: AccountSettings = { defaultPort: 8080 };
      expect(settings.defaultPort).toBe(8080);
    });

    it("has logLevel as optional LogLevel", () => {
      expectTypeOf<AccountSettings>().toHaveProperty("logLevel");
      const settings: AccountSettings = { logLevel: "debug" };
      expect(settings.logLevel).toBe("debug");
    });

    it("has fallbackEnabled as optional boolean", () => {
      expectTypeOf<AccountSettings>().toHaveProperty("fallbackEnabled");
      const settings: AccountSettings = { fallbackEnabled: true };
      expect(settings.fallbackEnabled).toBe(true);
    });

    it("has schedulingMode as optional SchedulingMode", () => {
      expectTypeOf<AccountSettings>().toHaveProperty("schedulingMode");
      const settings: AccountSettings = { schedulingMode: "sticky" };
      expect(settings.schedulingMode).toBe("sticky");
    });

    it("allows empty settings object", () => {
      const settings: AccountSettings = {};
      expect(settings).toEqual({});
    });

    it("allows all settings to be set together", () => {
      const settings: AccountSettings = {
        cooldownDurationMs: 10000,
        identityMode: "short",
        defaultPort: 3000,
        logLevel: "info",
        fallbackEnabled: false,
        schedulingMode: "round-robin",
      };
      expect(settings.cooldownDurationMs).toBe(10000);
      expect(settings.identityMode).toBe("short");
      expect(settings.defaultPort).toBe(3000);
      expect(settings.logLevel).toBe("info");
      expect(settings.fallbackEnabled).toBe(false);
      expect(settings.schedulingMode).toBe("round-robin");
    });

    it("allows unknown properties via index signature", () => {
      const settings: AccountSettings = {
        cooldownDurationMs: 5000,
        customSetting: "value",
      };
      expect(settings.customSetting).toBe("value");
    });

    it("accepts undefined values for optional fields", () => {
      const settings: AccountSettings = {
        cooldownDurationMs: undefined,
        identityMode: undefined,
        defaultPort: undefined,
        logLevel: undefined,
        fallbackEnabled: undefined,
        schedulingMode: undefined,
      };
      expect(settings.cooldownDurationMs).toBeUndefined();
      expect(settings.identityMode).toBeUndefined();
      expect(settings.defaultPort).toBeUndefined();
      expect(settings.logLevel).toBeUndefined();
      expect(settings.fallbackEnabled).toBeUndefined();
      expect(settings.schedulingMode).toBeUndefined();
    });
  });

  describe("type assignment validation", () => {
    it("enforces correct IdentityMode values at compile time", () => {
      // These should compile without error
      const full: IdentityMode = "full";
      const short: IdentityMode = "short";
      const none: IdentityMode = "none";
      expect([full, short, none]).toEqual(["full", "short", "none"]);
    });

    it("enforces correct LogLevel values at compile time", () => {
      // These should compile without error
      const silent: LogLevel = "silent";
      const error: LogLevel = "error";
      const warn: LogLevel = "warn";
      const info: LogLevel = "info";
      const debug: LogLevel = "debug";
      const trace: LogLevel = "trace";
      expect([silent, error, warn, info, debug, trace]).toEqual(["silent", "error", "warn", "info", "debug", "trace"]);
    });

    it("enforces correct SchedulingMode values at compile time", () => {
      // These should compile without error
      const sticky: SchedulingMode = "sticky";
      const refreshPriority: SchedulingMode = "refresh-priority";
      const drainHighest: SchedulingMode = "drain-highest";
      const roundRobin: SchedulingMode = "round-robin";
      expect([sticky, refreshPriority, drainHighest, roundRobin]).toEqual(["sticky", "refresh-priority", "drain-highest", "round-robin"]);
    });
  });
});
