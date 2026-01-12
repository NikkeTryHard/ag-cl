/**
 * Share CLI Flags Unit Tests
 *
 * Tests for share-related command line flag parsing.
 */

import { describe, it, expect } from "vitest";

describe("Share CLI flags", () => {
  describe("parseShareFlags", () => {
    it("should parse --share flag", async () => {
      const { parseShareFlags } = await import("../../../src/cli/share-flags.js");
      const flags = parseShareFlags(["node", "ag-cl", "--share"]);

      expect(flags.share).toBe(true);
    });

    it("should parse --connect flag with URL", async () => {
      const { parseShareFlags } = await import("../../../src/cli/share-flags.js");
      const flags = parseShareFlags(["node", "ag-cl", "--connect", "https://test.trycloudflare.com"]);

      expect(flags.connect).toBe("https://test.trycloudflare.com");
    });

    it("should parse --api-key flag", async () => {
      const { parseShareFlags } = await import("../../../src/cli/share-flags.js");
      const flags = parseShareFlags(["node", "ag-cl", "--api-key", "my-secret-key"]);

      expect(flags.apiKey).toBe("my-secret-key");
    });

    it("should parse --no-auth flag", async () => {
      const { parseShareFlags } = await import("../../../src/cli/share-flags.js");
      const flags = parseShareFlags(["node", "ag-cl", "--no-auth"]);

      expect(flags.noAuth).toBe(true);
    });

    it("should parse --nickname flag", async () => {
      const { parseShareFlags } = await import("../../../src/cli/share-flags.js");
      const flags = parseShareFlags(["node", "ag-cl", "--nickname", "bob"]);

      expect(flags.nickname).toBe("bob");
    });

    it("should parse combined flags", async () => {
      const { parseShareFlags } = await import("../../../src/cli/share-flags.js");
      const flags = parseShareFlags(["node", "ag-cl", "--connect", "https://test.trycloudflare.com", "--api-key", "secret", "--nickname", "bob"]);

      expect(flags.connect).toBe("https://test.trycloudflare.com");
      expect(flags.apiKey).toBe("secret");
      expect(flags.nickname).toBe("bob");
    });

    it("should return defaults when no share flags provided", async () => {
      const { parseShareFlags } = await import("../../../src/cli/share-flags.js");
      const flags = parseShareFlags(["node", "ag-cl", "--port", "3000"]);

      expect(flags.share).toBe(false);
      expect(flags.connect).toBeNull();
      expect(flags.apiKey).toBeNull();
      expect(flags.nickname).toBeNull();
      expect(flags.noAuth).toBe(false);
    });
  });

  describe("validateShareFlags", () => {
    it("should reject --share and --connect used together", async () => {
      const { parseShareFlags, validateShareFlags } = await import("../../../src/cli/share-flags.js");
      const flags = parseShareFlags(["node", "ag-cl", "--share", "--connect", "https://example.com"]);
      const result = validateShareFlags(flags);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot use --share and --connect together");
    });

    it("should reject --api-key without --connect or --share", async () => {
      const { parseShareFlags, validateShareFlags } = await import("../../../src/cli/share-flags.js");
      const flags = parseShareFlags(["node", "ag-cl", "--api-key", "secret"]);
      const result = validateShareFlags(flags);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("--api-key requires --connect or --share");
    });

    it("should reject --nickname without --connect", async () => {
      const { parseShareFlags, validateShareFlags } = await import("../../../src/cli/share-flags.js");
      const flags = parseShareFlags(["node", "ag-cl", "--nickname", "bob"]);
      const result = validateShareFlags(flags);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("--nickname requires --connect");
    });

    it("should accept valid --share with --api-key", async () => {
      const { parseShareFlags, validateShareFlags } = await import("../../../src/cli/share-flags.js");
      const flags = parseShareFlags(["node", "ag-cl", "--share", "--api-key", "secret"]);
      const result = validateShareFlags(flags);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept valid --connect with --api-key and --nickname", async () => {
      const { parseShareFlags, validateShareFlags } = await import("../../../src/cli/share-flags.js");
      const flags = parseShareFlags(["node", "ag-cl", "--connect", "https://example.com", "--api-key", "secret", "--nickname", "bob"]);
      const result = validateShareFlags(flags);

      expect(result.valid).toBe(true);
    });

    it("should accept --share with --no-auth", async () => {
      const { parseShareFlags, validateShareFlags } = await import("../../../src/cli/share-flags.js");
      const flags = parseShareFlags(["node", "ag-cl", "--share", "--no-auth"]);
      const result = validateShareFlags(flags);

      expect(result.valid).toBe(true);
    });
  });

  describe("getShareFlags", () => {
    it("should export getShareFlags function", async () => {
      const { getShareFlags } = await import("../../../src/cli/share-flags.js");
      expect(typeof getShareFlags).toBe("function");
    });
  });
});
