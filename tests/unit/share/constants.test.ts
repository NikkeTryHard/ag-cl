import { describe, it, expect } from "vitest";
import { SHARE_CONFIG_PATH, SHARE_SESSION_LOG_PATH } from "../../../src/constants.js";
import { homedir } from "os";

describe("Share constants", () => {
  it("should have share config path in user config dir", () => {
    expect(SHARE_CONFIG_PATH).toContain(homedir());
    expect(SHARE_CONFIG_PATH).toContain("share-config.json");
  });

  it("should have session log path in user config dir", () => {
    expect(SHARE_SESSION_LOG_PATH).toContain(homedir());
    expect(SHARE_SESSION_LOG_PATH).toContain("share-sessions.log");
  });
});
