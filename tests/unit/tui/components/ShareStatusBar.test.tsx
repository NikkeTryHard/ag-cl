// tests/unit/tui/components/ShareStatusBar.test.tsx
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { ShareStatusBar } from "../../../../src/tui/components/ShareStatusBar.js";

describe("ShareStatusBar", () => {
  it("should show nothing in normal mode", () => {
    const { lastFrame } = render(<ShareStatusBar mode="normal" tunnelUrl={null} clientCount={0} />);

    expect(lastFrame()).toBe("");
  });

  it("should show sharing indicator in host mode", () => {
    const { lastFrame } = render(<ShareStatusBar mode="host" tunnelUrl="https://test.trycloudflare.com" clientCount={2} />);

    expect(lastFrame()).toContain("SHARING");
    expect(lastFrame()).toContain("test.trycloudflare.com");
    expect(lastFrame()).toContain("2");
  });

  it("should show connected indicator in client mode", () => {
    const { lastFrame } = render(<ShareStatusBar mode="client" remoteUrl="https://host.trycloudflare.com" hostNickname="bob" />);

    expect(lastFrame()).toContain("CONNECTED");
    expect(lastFrame()).toContain("bob");
  });

  it("should show copy hint in host mode", () => {
    const { lastFrame } = render(<ShareStatusBar mode="host" tunnelUrl="https://test.trycloudflare.com" clientCount={0} />);

    expect(lastFrame()).toContain("[Y] Copy");
  });
});
