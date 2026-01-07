/**
 * useServerState Hook Tests
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useServerState } from "../../../../src/tui/hooks/useServerState.js";

describe("useServerState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns stopped state by default", () => {
    const { result } = renderHook(() => useServerState(8080));
    expect(result.current.running).toBe(false);
    expect(result.current.port).toBe(8080);
  });

  it("provides start function", () => {
    const { result } = renderHook(() => useServerState(8080));
    expect(typeof result.current.start).toBe("function");
  });

  it("provides stop function", () => {
    const { result } = renderHook(() => useServerState(8080));
    expect(typeof result.current.stop).toBe("function");
  });

  it("provides restart function", () => {
    const { result } = renderHook(() => useServerState(8080));
    expect(typeof result.current.restart).toBe("function");
  });

  it("uses provided initial port", () => {
    const { result } = renderHook(() => useServerState(3000));
    expect(result.current.port).toBe(3000);
  });
});
