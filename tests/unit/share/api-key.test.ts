import { describe, it, expect } from "vitest";
import { generateApiKey, maskApiKey, validateApiKey, generateFriendKey } from "../../../src/share/api-key.js";
import { getDefaultShareConfig } from "../../../src/share/config-storage.js";

describe("API key utilities", () => {
  it("should generate valid UUID key", () => {
    const key = generateApiKey();
    expect(key).toHaveLength(36);
    expect(key).toMatch(/^[a-f0-9-]+$/);
  });

  it("should mask key correctly", () => {
    const masked = maskApiKey("abc123def456");
    expect(masked).toBe("abc***");
  });

  it("should mask short keys", () => {
    const masked = maskApiKey("ab");
    expect(masked).toBe("ab***");
  });

  describe("validateApiKey", () => {
    it("should return true when auth disabled", () => {
      const config = getDefaultShareConfig();
      config.auth.enabled = false;

      const result = validateApiKey(config, "any-key");
      expect(result.valid).toBe(true);
    });

    it("should validate master key in single mode", () => {
      const config = getDefaultShareConfig();
      config.auth.mode = "single";
      config.auth.masterKey = "correct-key";

      expect(validateApiKey(config, "correct-key").valid).toBe(true);
      expect(validateApiKey(config, "wrong-key").valid).toBe(false);
    });

    it("should validate friend keys in per-friend mode", () => {
      const config = getDefaultShareConfig();
      config.auth.mode = "per-friend";
      config.auth.friendKeys = [
        { key: "friend-key-1", nickname: "bob", revoked: false, createdAt: Date.now() },
        { key: "friend-key-2", nickname: "alice", revoked: true, createdAt: Date.now() },
      ];

      const bobResult = validateApiKey(config, "friend-key-1");
      expect(bobResult.valid).toBe(true);
      expect(bobResult.nickname).toBe("bob");

      // Revoked key should fail
      expect(validateApiKey(config, "friend-key-2").valid).toBe(false);

      // Unknown key should fail
      expect(validateApiKey(config, "unknown-key").valid).toBe(false);
    });
  });

  it("should generate friend key entry", () => {
    const entry = generateFriendKey("charlie");
    expect(entry.key).toHaveLength(36);
    expect(entry.nickname).toBe("charlie");
    expect(entry.revoked).toBe(false);
    expect(entry.createdAt).toBeGreaterThan(0);
  });
});
