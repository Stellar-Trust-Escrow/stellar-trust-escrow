import { useState, useCallback } from 'react';

/**
 * useEscrowSelection Hook
 *
 * Manages the multi-select state for the escrow tables/lists.
 * Tracks the selected escrow IDs, selection mode state, and provides helpers
 * for selecting/deselecting individual items or toggling all items on a page.
 */
export function useEscrowSelection(initialIds: string[] = []) {
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);

  const toggleSelectMode = useCallback(() => {
    setIsSelectMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedIds([]); // Clear selection when exiting select mode
      }
      return next;
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      } else {
        return [...prev, id];
      }
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(ids);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  return {
    selectedIds,
    isSelectMode,
    setIsSelectMode,
    toggleSelectMode,
    toggleSelect,
    selectAll,
    clearSelection,
  };
}
