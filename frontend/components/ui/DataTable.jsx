'use client';

import { useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Spinner from './Spinner';

/**
 * DataTable
 *
 * Responsive, sortable table with server-side cursor pagination.
 *
 * @param {object}   props
 * @param {Array<{key:string, label:string, sortable?:boolean, render?:Function}>} props.columns
 * @param {Array<object>} props.data          — row objects; each must have a unique `id`
 * @param {string}   [props.nextCursor]       — cursor for the next page; null when on last page
 * @param {boolean}  [props.loadingMore]      — true while fetching the next page
 * @param {Function} [props.onLoadMore]       — called when the user clicks "Load more"
 * @param {string}   [props.emptyMessage]
 */
export default function DataTable({
  columns,
  data,
  nextCursor,
  loadingMore = false,
  onLoadMore,
  emptyMessage = 'No results found.',
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sortKey = searchParams.get('sortKey') || '';
  const sortDir = searchParams.get('sortDir') || 'asc';

  const handleSort = useCallback(
    (key) => {
      const params = new URLSearchParams(searchParams.toString());
      if (sortKey === key) {
        params.set('sortDir', sortDir === 'asc' ? 'desc' : 'asc');
      } else {
        params.set('sortKey', key);
        params.set('sortDir', 'asc');
      }
      // Reset cursor when sort changes
      params.delete('cursor');
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, sortKey, sortDir],
  );

  const SortIcon = ({ colKey }) => {
    if (sortKey !== colKey)
      return (
        <span aria-hidden="true" className="ml-1 opacity-30 text-xs">
          ↕
        </span>
      );
    return (
      <span aria-hidden="true" className="ml-1 text-xs text-indigo-400">
        {sortDir === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  return (
    <div className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/5 dark:bg-gray-900/50">
      {/* Desktop table — hidden below sm */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full table-fixed min-w-full text-sm">
          <thead className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-white/10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className="px-4 py-3 text-left font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap"
                  style={{ width: `${Math.floor(100 / columns.length)}%` }}
                >
                  {col.sortable ? (
                    <button
                      onClick={() => handleSort(col.key)}
                      aria-label={`Sort by ${col.label}${sortKey === col.key ? `, currently ${sortDir}ending` : ''}`}
                      className="inline-flex items-center gap-0.5 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      {col.label}
                      <SortIcon colKey={col.key} />
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-white/5 dark:hover:bg-white/[0.03] transition-colors"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="px-4 py-3 text-gray-800 dark:text-gray-200 truncate"
                    >
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list — visible below sm */}
      <ul className="sm:hidden divide-y divide-white/5" aria-label="Data rows">
        {data.length === 0 ? (
          <li className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
            {emptyMessage}
          </li>
        ) : (
          data.map((row) => (
            <li key={row.id} className="p-4 space-y-2">
              {columns.map((col) => (
                <div key={col.key} className="flex justify-between gap-2 text-sm">
                  <span className="font-medium text-gray-500 dark:text-gray-400 shrink-0">
                    {col.label}
                  </span>
                  <span className="text-gray-800 dark:text-gray-200 text-right truncate">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </span>
                </div>
              ))}
            </li>
          ))
        )}
      </ul>

      {/* Pagination footer */}
      {(nextCursor || loadingMore) && (
        <div className="flex justify-center py-4 border-t border-white/10">
          {loadingMore ? (
            <Spinner size="sm" label="Loading more…" />
          ) : (
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
