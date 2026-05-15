"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Selection state for a list table. Only tracks rows that are currently
 * visible (i.e. on the current page) — `isAllSelected` and `toggleAll`
 * operate on `rows`, not on a global universe.
 *
 * Identity-based reset: when the `rows` array reference changes (the
 * parent component swaps in a new page/filter result), we drop the
 * existing selection. We compare by *reference* on purpose — TanStack
 * Query returns a fresh array on each fetch and `keepPreviousData`
 * holds the same reference between settled queries, so this gives us
 * exactly the "reset on real change" behaviour the spec asks for.
 */
export function useTableSelection<T extends { id: string }>(rows: T[]): {
  selectedIds: Set<string>;
  isAllSelected: boolean;
  toggleOne: (id: string) => void;
  toggleAll: () => void;
  clear: () => void;
  selectedRows: T[];
} {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const previousRowsRef = useRef<T[] | null>(null);

  useEffect(() => {
    if (previousRowsRef.current === rows) return;
    if (previousRowsRef.current !== null) {
      setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
    }
    previousRowsRef.current = rows;
  }, [rows]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isAllSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selectedIds.has(r.id)),
    [rows, selectedIds],
  );

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      // "Select all" applies to the current page only.
      const allSelected =
        rows.length > 0 && rows.every((r) => prev.has(r.id));
      if (allSelected) {
        const next = new Set(prev);
        for (const r of rows) next.delete(r.id);
        return next;
      }
      const next = new Set(prev);
      for (const r of rows) next.add(r.id);
      return next;
    });
  }, [rows]);

  const clear = useCallback(() => {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.id)),
    [rows, selectedIds],
  );

  return {
    selectedIds,
    isAllSelected,
    toggleOne,
    toggleAll,
    clear,
    selectedRows,
  };
}
