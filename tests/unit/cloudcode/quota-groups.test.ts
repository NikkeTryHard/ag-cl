import { describe, it, expect } from "vitest";
import { QUOTA_GROUPS, getQuotaGroup, getAllQuotaGroups } from "../../../src/cloudcode/quota-groups.js";

describe("Quota Groups", () => {
  describe("QUOTA_GROUPS constant", () => {
    it("should define Claude group", () => {
      expect(QUOTA_GROUPS.claude).toBeDefined();
      expect(QUOTA_GROUPS.claude.name).toBe("Claude");
      expect(QUOTA_GROUPS.claude.models).toContain("claude-sonnet-4-5");
      expect(QUOTA_GROUPS.claude.models).toContain("claude-opus-4-5-thinking");
    });

    it("should define Gemini Pro group", () => {
      expect(QUOTA_GROUPS.geminiPro).toBeDefined();
      expect(QUOTA_GROUPS.geminiPro.name).toBe("Gemini Pro");
      expect(QUOTA_GROUPS.geminiPro.models).toContain("gemini-3-pro-high");
      expect(QUOTA_GROUPS.geminiPro.models).toContain("gemini-3-pro-low");
    });

    it("should define Gemini Flash group", () => {
      expect(QUOTA_GROUPS.geminiFlash).toBeDefined();
      expect(QUOTA_GROUPS.geminiFlash.name).toBe("Gemini Flash");
      expect(QUOTA_GROUPS.geminiFlash.models).toContain("gemini-3-flash");
    });
  });

  describe("getQuotaGroup", () => {
    it("should return claude group for Claude models", () => {
      expect(getQuotaGroup("claude-sonnet-4-5")).toBe("claude");
      expect(getQuotaGroup("claude-opus-4-5-thinking")).toBe("claude");
    });

    it("should return geminiPro group for Gemini Pro models", () => {
      expect(getQuotaGroup("gemini-3-pro-high")).toBe("geminiPro");
      expect(getQuotaGroup("gemini-3-pro-low")).toBe("geminiPro");
    });

    it("should return geminiFlash group for Gemini Flash models", () => {
      expect(getQuotaGroup("gemini-3-flash")).toBe("geminiFlash");
    });

    it("should return null for unknown models", () => {
      expect(getQuotaGroup("unknown-model")).toBeNull();
    });
  });

  describe("getAllQuotaGroups", () => {
    it("should return all quota group keys", () => {
      const groups = getAllQuotaGroups();
      expect(groups).toContain("claude");
      expect(groups).toContain("geminiPro");
      expect(groups).toContain("geminiFlash");
      expect(groups.length).toBe(3);
    });
  });
});
