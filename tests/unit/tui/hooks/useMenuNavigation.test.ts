/**
 * useMenuNavigation Hook Tests
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMenuNavigation, type MenuItem } from "../../../../src/tui/hooks/useMenuNavigation.js";

describe("useMenuNavigation", () => {
  const createItems = (): MenuItem[] => [
    { id: "header1", type: "header", label: "General Settings" },
    { id: "item1", type: "selectable", label: "Option 1", value: "value1" },
    { id: "item2", type: "selectable", label: "Option 2", value: "value2" },
    { id: "disabled1", type: "disabled", label: "Read Only" },
    { id: "header2", type: "header", label: "Share Settings" },
    { id: "item3", type: "selectable", label: "Option 3", value: "value3" },
  ];

  it("starts at first selectable item", () => {
    const items = createItems();
    const { result } = renderHook(() => useMenuNavigation({ items }));

    expect(result.current.selectedIndex).toBe(1); // Skips header at 0
    expect(result.current.selectedItem?.id).toBe("item1");
  });

  it("navigates down skipping headers and disabled items", () => {
    const items = createItems();
    const { result } = renderHook(() => useMenuNavigation({ items }));

    act(() => result.current.handleDown());
    expect(result.current.selectedIndex).toBe(2); // item2

    act(() => result.current.handleDown());
    expect(result.current.selectedIndex).toBe(5); // item3, skipped disabled and header
  });

  it("navigates up skipping non-selectable items", () => {
    const items = createItems();
    const { result } = renderHook(() => useMenuNavigation({ items, initialIndex: 5 }));

    expect(result.current.selectedIndex).toBe(5); // item3

    act(() => result.current.handleUp());
    expect(result.current.selectedIndex).toBe(2); // item2, skipped header and disabled
  });

  it("stays at bounds without wrap", () => {
    const items = createItems();
    const { result } = renderHook(() => useMenuNavigation({ items }));

    // At first selectable, try to go up
    act(() => result.current.handleUp());
    expect(result.current.selectedIndex).toBe(1); // Stays at first selectable
  });

  it("wraps around with wrap option", () => {
    const items = createItems();
    const { result } = renderHook(() => useMenuNavigation({ items, wrap: true }));

    // At first selectable, go up should wrap to last selectable
    act(() => result.current.handleUp());
    expect(result.current.selectedIndex).toBe(5); // item3
  });

  it("calls onSelect with correct item", () => {
    const items = createItems();
    const onSelect = vi.fn();
    const { result } = renderHook(() => useMenuNavigation({ items, onSelect }));

    act(() => result.current.handleSelect());

    expect(onSelect).toHaveBeenCalledWith(items[1], 1);
  });

  it("does not call onSelect for non-selectable items", () => {
    const items: MenuItem[] = [{ id: "header", type: "header", label: "Header" }];
    const onSelect = vi.fn();
    const { result } = renderHook(() => useMenuNavigation({ items, onSelect }));

    act(() => result.current.handleSelect());

    expect(onSelect).not.toHaveBeenCalled();
  });
});
