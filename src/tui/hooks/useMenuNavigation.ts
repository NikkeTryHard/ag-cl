// src/tui/hooks/useMenuNavigation.ts

/**
 * Menu Navigation Hook
 *
 * Handles keyboard navigation through a list of menu items,
 * automatically skipping headers and disabled items.
 */

export type MenuItemType = "selectable" | "header" | "disabled";

export interface MenuItem {
  id: string;
  type: MenuItemType;
  label: string;
  value?: string;
  description?: string;
}

export interface UseMenuNavigationOptions {
  items: MenuItem[];
  initialIndex?: number;
  onSelect?: (item: MenuItem, index: number) => void;
  wrap?: boolean;
}

export interface UseMenuNavigationResult {
  selectedIndex: number;
  selectedItem: MenuItem | null;
  handleUp: () => void;
  handleDown: () => void;
  handleSelect: () => void;
  setSelectedIndex: (index: number) => void;
}

/**
 * Find next selectable index in a direction
 */
function findNextSelectable(items: MenuItem[], currentIndex: number, direction: 1 | -1, wrap: boolean): number {
  const len = items.length;
  let nextIndex = currentIndex + direction;

  // Try to find next selectable item
  for (let i = 0; i < len; i++) {
    if (wrap) {
      nextIndex = ((nextIndex % len) + len) % len;
    } else {
      if (nextIndex < 0 || nextIndex >= len) {
        return currentIndex; // Stay at current if out of bounds
      }
    }

    if (items[nextIndex].type === "selectable") {
      return nextIndex;
    }

    nextIndex += direction;
  }

  return currentIndex; // No selectable found, stay at current
}

/**
 * Find first selectable index
 */
function findFirstSelectable(items: MenuItem[]): number {
  for (let i = 0; i < items.length; i++) {
    if (items[i].type === "selectable") {
      return i;
    }
  }
  return 0;
}

import { useState, useCallback } from "react";

export function useMenuNavigation({ items, initialIndex, onSelect, wrap = false }: UseMenuNavigationOptions): UseMenuNavigationResult {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (initialIndex !== undefined && items[initialIndex]?.type === "selectable") {
      return initialIndex;
    }
    return findFirstSelectable(items);
  });

  const selectedItem = items[selectedIndex] ?? null;

  const handleUp = useCallback(() => {
    setSelectedIndex((current) => findNextSelectable(items, current, -1, wrap));
  }, [items, wrap]);

  const handleDown = useCallback(() => {
    setSelectedIndex((current) => findNextSelectable(items, current, 1, wrap));
  }, [items, wrap]);

  const handleSelect = useCallback(() => {
    const item = items[selectedIndex];
    if (item?.type === "selectable" && onSelect) {
      onSelect(item, selectedIndex);
    }
  }, [items, selectedIndex, onSelect]);

  return {
    selectedIndex,
    selectedItem,
    handleUp,
    handleDown,
    handleSelect,
    setSelectedIndex,
  };
}
