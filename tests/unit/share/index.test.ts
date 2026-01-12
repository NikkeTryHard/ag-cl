import { describe, it, expect } from "vitest";
import * as ShareModule from "../../../src/share/index.js";

describe("Share module exports", () => {
  it("should export types", () => {
    // Types are compile-time only, but we verify the module loads
    expect(ShareModule).toBeDefined();
  });

  it("should export config storage functions", () => {
    expect(ShareModule.loadShareConfig).toBeDefined();
    expect(ShareModule.saveShareConfig).toBeDefined();
    expect(ShareModule.getDefaultShareConfig).toBeDefined();
  });

  it("should export API key functions", () => {
    expect(ShareModule.generateApiKey).toBeDefined();
    expect(ShareModule.validateApiKey).toBeDefined();
    expect(ShareModule.maskApiKey).toBeDefined();
    expect(ShareModule.generateFriendKey).toBeDefined();
  });

  it("should export middleware", () => {
    expect(ShareModule.createShareAuthMiddleware).toBeDefined();
  });

  it("should export quota filter", () => {
    expect(ShareModule.filterQuotaData).toBeDefined();
  });

  it("should export ClientTracker", () => {
    expect(ShareModule.ClientTracker).toBeDefined();
  });

  it("should export router", () => {
    expect(ShareModule.createShareRouter).toBeDefined();
  });

  it("should export tunnel utilities", () => {
    expect(ShareModule.TunnelManager).toBeDefined();
    expect(ShareModule.checkCloudflaredInstalled).toBeDefined();
    expect(ShareModule.getInstallInstructions).toBeDefined();
  });
});
