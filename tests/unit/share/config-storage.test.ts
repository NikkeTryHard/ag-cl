// tests/unit/share/config-storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { loadShareConfig, saveShareConfig, getDefaultShareConfig } from "../../../src/share/config-storage.js";

describe("ShareConfig storage", () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "share-config-test-"));
    configPath = join(tempDir, "share-config.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should return default config when file does not exist", async () => {
    const config = await loadShareConfig(configPath);
    expect(config.auth.enabled).toBe(true);
    expect(config.auth.mode).toBe("single");
    expect(config.limits.maxClients).toBe(5);
  });

  it("should save and load config", async () => {
    const config = getDefaultShareConfig();
    config.limits.maxClients = 10;
    config.auth.masterKey = "test-key";

    await saveShareConfig(configPath, config);
    const loaded = await loadShareConfig(configPath);

    expect(loaded.limits.maxClients).toBe(10);
    expect(loaded.auth.masterKey).toBe("test-key");
  });

  it("should generate masterKey if null on first save", async () => {
    const config = getDefaultShareConfig();
    expect(config.auth.masterKey).toBeNull();

    await saveShareConfig(configPath, config);
    const loaded = await loadShareConfig(configPath);

    expect(loaded.auth.masterKey).not.toBeNull();
    expect(loaded.auth.masterKey).toHaveLength(36); // UUID length
  });
});
