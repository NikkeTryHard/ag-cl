/**
 * Unit tests for Pino-based Logger
 *
 * Tests the logger utility functions: getLogger(), initLogger(), setLogLevel()
 * Note: These tests verify the API behavior, not Pino's internal implementation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Unmock the logger module for this test file since we want to test the real implementation
vi.unmock("../../../src/utils/logger.js");

// Import after unmocking
import { getLogger, initLogger, setLogLevel, type LogLevel } from "../../../src/utils/logger.js";

describe("Pino Logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getLogger", () => {
    it("returns a logger instance", () => {
      const logger = getLogger();
      expect(logger).toBeDefined();
    });

    it("has standard log methods", () => {
      const logger = getLogger();
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.trace).toBe("function");
    });

    it("returns the same instance on multiple calls (singleton)", () => {
      const logger1 = getLogger();
      const logger2 = getLogger();
      expect(logger1).toBe(logger2);
    });
  });

  describe("initLogger", () => {
    it("accepts level option without throwing", () => {
      expect(() => initLogger({ level: "debug" })).not.toThrow();
    });

    it("accepts empty options without throwing", () => {
      expect(() => initLogger()).not.toThrow();
      expect(() => initLogger({})).not.toThrow();
    });

    it("can be called multiple times", () => {
      expect(() => {
        initLogger({ level: "debug" });
        initLogger({ level: "info" });
        initLogger({ level: "warn" });
      }).not.toThrow();
    });
  });

  describe("setLogLevel", () => {
    it("changes the log level dynamically", () => {
      const logger = getLogger();
      setLogLevel("debug");
      expect(logger.level).toBe("debug");
    });

    it("can set level to error", () => {
      setLogLevel("error");
      const logger = getLogger();
      expect(logger.level).toBe("error");
    });

    it("can set level to warn", () => {
      setLogLevel("warn");
      const logger = getLogger();
      expect(logger.level).toBe("warn");
    });

    it("can set level to info", () => {
      setLogLevel("info");
      const logger = getLogger();
      expect(logger.level).toBe("info");
    });

    it("can set level to silent", () => {
      setLogLevel("silent");
      const logger = getLogger();
      expect(logger.level).toBe("silent");
    });

    it("can set level to trace", () => {
      setLogLevel("trace");
      const logger = getLogger();
      expect(logger.level).toBe("trace");
    });
  });

  describe("logger level property", () => {
    it("reflects the current log level", () => {
      const logger = getLogger();
      const originalLevel = logger.level;

      setLogLevel("debug");
      expect(logger.level).toBe("debug");

      // Restore original level
      setLogLevel(originalLevel as LogLevel);
    });
  });

  describe("log method calls", () => {
    it("info method does not throw", () => {
      const logger = getLogger();
      expect(() => logger.info("test message")).not.toThrow();
    });

    it("warn method does not throw", () => {
      const logger = getLogger();
      expect(() => logger.warn("warning message")).not.toThrow();
    });

    it("error method does not throw", () => {
      const logger = getLogger();
      expect(() => logger.error("error message")).not.toThrow();
    });

    it("debug method does not throw", () => {
      const logger = getLogger();
      setLogLevel("debug"); // Enable debug level
      expect(() => logger.debug("debug message")).not.toThrow();
    });

    it("trace method does not throw", () => {
      const logger = getLogger();
      setLogLevel("trace"); // Enable trace level
      expect(() => logger.trace("trace message")).not.toThrow();
    });

    it("supports object logging", () => {
      const logger = getLogger();
      const obj = { key: "value", count: 42 };
      expect(() => logger.info(obj, "log with object")).not.toThrow();
    });
  });

  describe("log level types", () => {
    it("supports all standard log levels", () => {
      const levels: LogLevel[] = ["silent", "error", "warn", "info", "debug", "trace"];
      for (const level of levels) {
        expect(() => setLogLevel(level)).not.toThrow();
        const logger = getLogger();
        expect(logger.level).toBe(level);
      }
    });
  });
});
