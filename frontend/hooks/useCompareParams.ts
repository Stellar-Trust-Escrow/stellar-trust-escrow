import { useCallback, useMemo } from 'react';
import { useQueryState, parseAsArrayOf, parseAsString } from 'nuqs';

export const MAX_COMPARE_ESCOWS = 4;

/**
 * URL-backed comparison selection for the Escrow Explorer.
 *
 * The `?compare=id1,id2,id3` query param is the single source of truth for
 * which escrows appear in the side-by-side comparison panel, so comparison
 * state is shareable and survives page reloads (Issue #1538).
 */
export function useCompareParams() {
  const [compareIds, setCompareIds] = useQueryState(
    'compare',
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  const toggleCompare = useCallback(
    (id: string | number) => {
      const strId = String(id);
      setCompareIds((prev) => {
        const current = prev ?? [];
        if (current.includes(strId)) {
          return current.filter((x) => x !== strId);
        }
        if (current.length >= MAX_COMPARE_ESCOWS) {
          // Reject adding a 5th escrow — the panel handles the inline error.
          return current;
        }
        return [...current, strId];
      });
    },
    [setCompareIds],
  );

  const removeCompare = useCallback(
    (id: string | number) => {
      const strId = String(id);
      setCompareIds((prev) => (prev ?? []).filter((x) => x !== strId));
    },
    [setCompareIds],
  );

  const clearCompare = useCallback(() => {
    setCompareIds(null);
  }, [setCompareIds]);

  const isCompareSelected = useCallback(
    (id: string | number) => (compareIds ?? []).includes(String(id)),
    [compareIds],
  );

  const compareIdsMemo = useMemo(() => compareIds ?? [], [compareIds]);

  return {
    compareIds: compareIdsMemo,
    toggleCompare,
    removeCompare,
    clearCompare,
    isCompareSelected,
  };
}
