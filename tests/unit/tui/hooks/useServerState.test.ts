/**
 * useServerState Hook Tests
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
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

  it("exposes setPort function", () => {
    const { result } = renderHook(() => useServerState(8080));
    expect(typeof result.current.setPort).toBe("function");
  });

  it("updates port when setPort is called", () => {
    const { result } = renderHook(() => useServerState(8080));
    expect(result.current.port).toBe(8080);

    act(() => {
      result.current.setPort(3000);
    });

    expect(result.current.port).toBe(3000);
  });
});
