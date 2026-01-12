// tests/unit/share/session-logger.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { SessionLogger } from "../../../src/share/session-logger.js";
import type { SessionLogEntry } from "../../../src/share/types.js";

describe("SessionLogger", () => {
  let tempDir: string;
  let logPath: string;
  let logger: SessionLogger;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "session-log-test-"));
    logPath = join(tempDir, "sessions.log");
    logger = new SessionLogger(logPath);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should log session entry to file", async () => {
    const entry: SessionLogEntry = {
      clientId: "test-client",
      keyMasked: "abc***",
      nickname: "bob",
      connectedAt: Date.now() - 60000,
      disconnectedAt: Date.now(),
      pollCount: 10,
    };

    await logger.log(entry);

    const content = await readFile(logPath, "utf-8");
    expect(content).toContain("bob");
    expect(content).toContain("abc***");
    expect(content).toContain("10");
  });

  it("should append multiple entries", async () => {
    const entry1: SessionLogEntry = {
      clientId: "client-1",
      keyMasked: "abc***",
      nickname: "bob",
      connectedAt: Date.now() - 120000,
      disconnectedAt: Date.now() - 60000,
      pollCount: 5,
    };

    const entry2: SessionLogEntry = {
      clientId: "client-2",
      keyMasked: "def***",
      nickname: "alice",
      connectedAt: Date.now() - 60000,
      disconnectedAt: Date.now(),
      pollCount: 3,
    };

    await logger.log(entry1);
    await logger.log(entry2);

    const content = await readFile(logPath, "utf-8");
    expect(content).toContain("bob");
    expect(content).toContain("alice");
  });

  it("should include session duration", async () => {
    const entry: SessionLogEntry = {
      clientId: "test-client",
      keyMasked: "abc***",
      nickname: null,
      connectedAt: Date.now() - 300000, // 5 minutes ago
      disconnectedAt: Date.now(),
      pollCount: 30,
    };

    await logger.log(entry);

    const content = await readFile(logPath, "utf-8");
    expect(content).toContain("5m"); // Duration should be ~5 minutes
  });

  it("should create directory if not exists", async () => {
    const nestedPath = join(tempDir, "nested", "dir", "sessions.log");
    const nestedLogger = new SessionLogger(nestedPath);

    const entry: SessionLogEntry = {
      clientId: "test-client",
      keyMasked: "abc***",
      nickname: "test",
      connectedAt: Date.now() - 1000,
      disconnectedAt: Date.now(),
      pollCount: 1,
    };

    await nestedLogger.log(entry);

    const content = await readFile(nestedPath, "utf-8");
    expect(content).toContain("test");
  });

  it("batches multiple entries into single write", async () => {
    const entries: SessionLogEntry[] = [
      { clientId: "1", keyMasked: "key1", nickname: null, connectedAt: 1000, disconnectedAt: 2000, pollCount: 5 },
      { clientId: "2", keyMasked: "key2", nickname: "user", connectedAt: 3000, disconnectedAt: 4000, pollCount: 10 },
    ];

    await logger.logAll(entries);

    const content = await readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
  });
});
