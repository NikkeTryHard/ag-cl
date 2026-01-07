/**
 * useCommands Hook Tests
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCommands } from "../../../../src/tui/hooks/useCommands.js";

describe("useCommands", () => {
  it("returns array of commands", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    expect(Array.isArray(result.current)).toBe(true);
    expect(result.current.length).toBeGreaterThan(0);
  });

  it("includes server commands", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    const serverCommands = result.current.filter((c) => c.category === "server");
    expect(serverCommands.length).toBeGreaterThan(0);
  });

  it("includes account commands", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    const accountCommands = result.current.filter((c) => c.category === "accounts");
    expect(accountCommands.length).toBeGreaterThan(0);
  });

  it("includes view commands", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    const viewCommands = result.current.filter((c) => c.category === "view");
    expect(viewCommands.length).toBeGreaterThan(0);
  });

  it("includes settings commands", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    const settingsCommands = result.current.filter((c) => c.category === "settings");
    expect(settingsCommands.length).toBeGreaterThan(0);
  });

  it("calls serverControls.start when start-server command is executed", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    const startCommand = result.current.find((c) => c.id === "start-server");
    expect(startCommand).toBeDefined();
    startCommand!.action();
    expect(mockServerControls.start).toHaveBeenCalled();
  });

  it("calls serverControls.stop when stop-server command is executed", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    const stopCommand = result.current.find((c) => c.id === "stop-server");
    expect(stopCommand).toBeDefined();
    stopCommand!.action();
    expect(mockServerControls.stop).toHaveBeenCalled();
  });

  it("calls serverControls.restart when restart-server command is executed", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    const restartCommand = result.current.find((c) => c.id === "restart-server");
    expect(restartCommand).toBeDefined();
    restartCommand!.action();
    expect(mockServerControls.restart).toHaveBeenCalled();
  });

  it("calls modalControls.open with add-account when add-account-oauth command is executed", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    const addAccountCommand = result.current.find((c) => c.id === "add-account-oauth");
    expect(addAccountCommand).toBeDefined();
    addAccountCommand!.action();
    expect(mockModalControls.open).toHaveBeenCalledWith("add-account");
  });

  it("calls refreshCapacity when refresh-capacity command is executed", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    const refreshCommand = result.current.find((c) => c.id === "refresh-capacity");
    expect(refreshCommand).toBeDefined();
    refreshCommand!.action();
    expect(mockRefreshCapacity).toHaveBeenCalled();
  });

  it("calls modalControls.open with remove-account when remove-account command is executed", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    const removeAccountCommand = result.current.find((c) => c.id === "remove-account");
    expect(removeAccountCommand).toBeDefined();
    removeAccountCommand!.action();
    expect(mockModalControls.open).toHaveBeenCalledWith("remove-account");
  });

  it("calls modalControls.open with logs when view-logs command is executed", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    const viewLogsCommand = result.current.find((c) => c.id === "view-logs");
    expect(viewLogsCommand).toBeDefined();
    viewLogsCommand!.action();
    expect(mockModalControls.open).toHaveBeenCalledWith("logs");
  });

  it("calls modalControls.open with settings when settings command is executed", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    const settingsCommand = result.current.find((c) => c.id === "settings");
    expect(settingsCommand).toBeDefined();
    settingsCommand!.action();
    expect(mockModalControls.open).toHaveBeenCalledWith("settings");
  });

  it("returns memoized commands array", () => {
    const mockServerControls = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const mockModalControls = { open: vi.fn(), close: vi.fn() };
    const mockRefreshCapacity = vi.fn();

    const { result, rerender } = renderHook(() =>
      useCommands({
        serverControls: mockServerControls,
        modalControls: mockModalControls,
        refreshCapacity: mockRefreshCapacity,
      }),
    );

    const firstResult = result.current;
    rerender();
    const secondResult = result.current;

    // Same reference due to useMemo
    expect(firstResult).toBe(secondResult);
  });
});
