import { describe, it, expect } from "vitest";
import type { ModalState } from "../../../src/tui/types.js";

describe("ModalState type", () => {
  it("accepts change-port as valid modal type", () => {
    const modal: ModalState = { type: "change-port" };
    expect(modal.type).toBe("change-port");
  });
});
