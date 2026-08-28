'use client';

/**
 * EscrowComparePanel — side-by-side escrow comparison (Issue #1538).
 *
 * Renders a sticky-first-column comparison table for up to 4 selected escrows:
 *   - rows  = attributes (title, amount, currency, parties, milestone count,
 *             arbiter, status, created date, fee rate, dispute count)
 *   - columns = selected escrows
 * Diff highlighting marks cells whose value differs across the columns;
 * identical cells are muted. Milestone details are collapsed by default and
 * expand into a row per milestone. The whole view is URL-shareable (the
 * `compare` query param is the single source of truth, managed by the
 * parent via {@link useCompareParams}).
 *
 * Keyboard support: Tab reaches each column header; Arrow Left/Right moves
 * focus between columns; Delete removes the focused column.
 *
 * @param {object}   props
 * @param {Array}    props.escrows        — all escrows loaded in the list view
 * @param {string[]} props.compareIds     — selected escrow ids (from URL)
 * @param {Function} props.onToggleCompare — (id) => void, toggle selection
 * @param {Function} props.onRemoveCompare — (id) => void, deselect one
 * @param {Function} props.onClearCompare  — () => void, clear all selections
 */

import { useMemo, useRef, useState } from 'react';
import { exportToCSV } from '../../lib/csvExport';
import { useI18n } from '../../i18n/index.jsx';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';

const MAX = 4;

/** Short display helper for addresses. */
function shortAddr(addr, fallback = '—') {
  if (!addr) return fallback;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

/** Normalise a cell value so undefined/null and empty strings all read as '—'. */
function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

/**
 * Attribute descriptors — the rows of the comparison table.
 * `key` is stable across columns; `get` extracts the raw value from an escrow.
 */
const ATTRIBUTES = [
  { key: 'title', label: 'title', get: (e) => e.title },
  { key: 'status', label: 'status', get: (e) => e.status },
  { key: 'amount', label: 'amount', get: (e) => e.totalAmount },
  { key: 'currency', label: 'currency', get: (e) => e.currency },
  { key: 'parties', label: 'parties', get: (e) => e.counterparty || e.clientAddress },
  { key: 'milestones', label: 'milestones', get: (e) => e.milestoneProgress },
  { key: 'arbiter', label: 'arbiter', get: (e) => shortAddr(e.arbiterAddress) },
  { key: 'created', label: 'created', get: (e) => formatDate(e.createdAt) },
  { key: 'deadline', label: 'deadline', get: (e) => formatDate(e.deadline) },
  { key: 'feeRate', label: 'feeRate', get: () => '—' },
  { key: 'disputes', label: 'disputes', get: (e) => (e.disputeCount ? e.disputeCount : '0') },
];

export default function EscrowComparePanel({
  escrows = [],
  compareIds = [],
  onToggleCompare,
  onRemoveCompare,
  onClearCompare,
}) {
  const { t } = useI18n();
  const headerRefs = useRef({});

  const selected = useMemo(
    () => compareIds.map((id) => escrows.find((e) => String(e.id) === String(id))).filter(Boolean),
    [escrows, compareIds],
  );

  const atMax = selected.length >= MAX;

  // Expandable milestone section: build one sub-row per mega-milestone,
  // derived from milestoneProgress ("2 / 4" → 4 rows, first 2 "done").
  const hasMilestoneDetail = useMemo(
    () => selected.some((e) => e.milestoneProgress && /\d+\s*\/\s*\d+/.test(e.milestoneProgress)),
    [selected],
  );
  const [milestonesExpanded, setMilestonesExpanded] = useState(false);

  const milestoneRows = useMemo(() => {
    if (!milestonesExpanded || !hasMilestoneDetail) return [];
    const totalsByEscrow = new Map(
      selected.map((e) => {
        const m = /(\d+)\s*\/\s*(\d+)/.exec(e.milestoneProgress || '');
        const t = m ? { done: Number(m[1]), total: Number(m[2]) } : { done: 0, total: 0 };
        return [String(e.id), t];
      }),
    );
    const maxTotal = Math.max(0, ...[...totalsByEscrow.values()].map((x) => x.total));
    const rows = [];
    for (let i = 1; i <= maxTotal; i += 1) {
      rows.push({
        key: `milestone-${i}`,
        label: `milestone #${i}`,
        get: (e) => {
          const t = totalsByEscrow.get(String(e.id)) ?? { done: 0, total: 0 };
          return t.total >= i ? (i <= t.done ? '✓' : '•') : '—';
        },
      });
    }
    return rows;
  }, [milestonesExpanded, hasMilestoneDetail, selected]);

  const allRows = milestonesExpanded ? [...ATTRIBUTES, ...milestoneRows] : ATTRIBUTES;

  /** A cell is a "diff" when the row has differing values and this cell
   *  deviates from the first column's value (null/undefined → '—' is a diff). */
  const cellIsDiff = (attr, colIdx) => {
    const values = selected.map((e) => displayValue(attr.get(e)));
    if (new Set(values).size <= 1) return false;
    return displayValue(attr.get(selected[colIdx])) !== values[0];
  };

  const exportCsv = () => {
    if (selected.length === 0) return;
    const header = ['Attribute', ...selected.map((e) => e.title)];
    const rows = allRows.map((attr) => [
      attr.label,
      ...selected.map((e, i) => {
        const v = attr.get(e, i);
        return displayValue(v);
      }),
    ]);
    exportToCSV([header, ...rows], 'escrow-comparison');
  };

  const handleHeaderKeyDown = (e, id, colIdx) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? -1 : 1;
      const nextIdx = colIdx + delta;
      if (nextIdx >= 0 && nextIdx < selected.length) {
        headerRefs.current[selected[nextIdx].id]?.focus();
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onRemoveCompare?.(id);
    }
  };

  const toggleMilestones = () => setMilestonesExpanded((v) => !v);

  if (selected.length === 0) {
    return (
      <div className="card p-6" data-testid="compare-panel">
        <EmptyState title={t('compare.emptyTitle')} description={t('compare.emptyDescription')} />
      </div>
    );
  }

  return (
    <section
      className="card p-4 overflow-hidden"
      data-testid="compare-panel"
      aria-label={t('compare.title')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">{t('compare.title')}</h2>
          <span className="text-xs text-gray-400">
            {selected.length} / {MAX}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasMilestoneDetail && (
            <Button variant="secondary" size="sm" onClick={toggleMilestones}>
              {milestonesExpanded ? t('compare.collapseMilestones') : t('compare.expandMilestones')}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={exportCsv}>
            {t('compare.exportCsv')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearCompare}>
            {t('compare.clear')}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm border-collapse min-w-[560px]" data-testid="compare-table">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 bg-gray-900 text-left px-3 py-2 border-b border-gray-800 text-gray-400 font-medium">
                {t('compare.attributeColumn')}
              </th>
              {selected.map((escrow, colIdx) => (
                <th
                  key={escrow.id}
                  className="sticky top-0 z-10 bg-gray-900 text-left px-3 py-2 border-b border-gray-800"
                  data-testid={`compare-col-${escrow.id}`}
                >
                  <div
                    ref={(el) => {
                      headerRefs.current[escrow.id] = el;
                    }}
                    tabIndex={0}
                    data-testid={`compare-colheader-${escrow.id}`}
                    aria-label={`${escrow.title}, ${t('compare.removeColumnHint')}`}
                    onKeyDown={(e) => handleHeaderKeyDown(e, escrow.id, colIdx)}
                    className="flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
                  >
                    <span className="font-medium text-white truncate">{escrow.title}</span>
                    <button
                      type="button"
                      aria-label={`${t('compare.remove')} ${escrow.title}`}
                      onClick={() => onRemoveCompare?.(escrow.id)}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="min-h-touch min-w-touch flex items-center justify-center text-gray-500 hover:text-red-400"
                    >
                      ×
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allRows.map((attr) => {
              const rowValues = selected.map((e, i) => displayValue(attr.get(e, i)));
              const hasDiff = new Set(rowValues).size > 1;
              return (
                <tr key={attr.key} data-testid={`compare-row-${attr.key}`}>
                  <th className="sticky left-0 z-10 bg-gray-900 text-left px-3 py-2 border-b border-gray-800/60 text-gray-300 font-medium whitespace-nowrap">
                    {t(`compare.attributes.${attr.label}`)}
                  </th>
                  {selected.map((escrow, colIdx) => {
                    const diff = cellIsDiff(attr, colIdx);
                    return (
                      <td
                        key={escrow.id}
                        data-testid={`compare-cell-${attr.key}-${escrow.id}`}
                        className={`px-3 py-2 border-b border-gray-800/60 whitespace-nowrap ${
                          hasDiff ? (diff ? 'bg-amber-500/10' : 'opacity-45') : 'opacity-90'
                        }`}
                      >
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 ${
                            hasDiff && diff ? 'ring-1 ring-amber-400/70' : ''
                          }`}
                        >
                          {attr.label === 'status' ? (
                            <Badge
                              status={rowValues[colIdx] === '—' ? 'Cancelled' : rowValues[colIdx]}
                            />
                          ) : (
                            rowValues[colIdx]
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {atMax && (
        <p
          className="mt-3 text-xs text-amber-400 flex items-center gap-1.5"
          data-testid="compare-max-hint"
        >
          <span aria-hidden="true">⚠</span> {t('compare.maxHint')}
        </p>
      )}
    </section>
  );
}

/** Build all rows (attributes + expanded milestone rows) — exported for tests. */
export function buildCompareRows(selectedEscrows, attrs = ATTRIBUTES) {
  return attrs.map((attr) => ({
    key: attr.key,
    label: attr.label,
    values: selectedEscrows.map((e) => displayValue(attr.get(e))),
  }));
}
