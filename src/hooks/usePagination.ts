'use client';

import { useCallback, useMemo, useState } from 'react';

export interface PaginationState<T> {
  page: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  paginatedItems: T[];
  setPage: (nextPage: number) => void;
  nextPage: () => void;
  prevPage: () => void;
}

/**
 * Pagina arreglos en memoria ajustando automáticamente la página activa cuando cambia el total.
 */
export function usePagination<T>(items: T[], pageSize: number = 50): PaginationState<T> {
  const [requestedPage, setRequestedPage] = useState(1);

  const safePageSize = Math.max(1, pageSize);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const startIndex = (page - 1) * safePageSize;
  const endIndex = Math.min(totalItems, startIndex + safePageSize);

  const paginatedItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  );

  const setPage = useCallback(
    (nextPage: number) => {
      setRequestedPage(Math.min(Math.max(1, nextPage), totalPages));
    },
    [totalPages]
  );

  const nextPage = useCallback(() => {
    setRequestedPage((prev) => Math.min(totalPages, prev + 1));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setRequestedPage((prev) => Math.max(1, prev - 1));
  }, []);

  return {
    page,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
    paginatedItems,
    setPage,
    nextPage,
    prevPage,
  };
}
