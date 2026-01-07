/**
 * Port Validation Tests
 */
import { describe, it, expect } from "vitest";
import { validatePort } from "../../../../src/tui/utils/portValidation.js";

describe("validatePort", () => {
  it("returns null for valid port", () => {
    expect(validatePort("8080")).toBeNull();
    expect(validatePort("3000")).toBeNull();
    expect(validatePort("1")).toBeNull();
    expect(validatePort("65535")).toBeNull();
  });

  it("returns error for empty input", () => {
    expect(validatePort("")).toBe("Port required");
  });

  it("returns error for non-numeric input", () => {
    expect(validatePort("abc")).toBe("Must be a number");
    expect(validatePort("80a")).toBe("Must be a number");
  });

  it("returns error for out of range port", () => {
    expect(validatePort("0")).toBe("Port must be 1-65535");
    expect(validatePort("-1")).toBe("Must be a number");
    expect(validatePort("65536")).toBe("Port must be 1-65535");
    expect(validatePort("99999")).toBe("Port must be 1-65535");
  });

  it("returns error for decimal numbers", () => {
    expect(validatePort("80.5")).toBe("Must be a number");
  });
});
