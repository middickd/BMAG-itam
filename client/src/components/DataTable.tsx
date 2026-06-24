import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ColumnFilter =
  | { type: 'text'; placeholder?: string }
  | { type: 'select'; options: { label: string; value: string }[] };

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
  width?: string;
  filter?: ColumnFilter;
};

export function DataTable<T extends { id: string }>({
  columns,
  data,
  onRowClick,
  empty,
  selectable,
  selected,
  onSelectionChange,
  filterValues,
  onFilterChange,
}: {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectionChange?: (next: Set<string>) => void;
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
}) {
  const sel = selected ?? new Set<string>();
  const allChecked = selectable && data.length > 0 && data.every((r) => sel.has(r.id));
  const someChecked = selectable && !allChecked && data.some((r) => sel.has(r.id));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    const next = new Set(sel);
    if (allChecked) data.forEach((r) => next.delete(r.id));
    else data.forEach((r) => next.add(r.id));
    onSelectionChange(next);
  };

  const toggleRow = (id: string) => {
    if (!onSelectionChange) return;
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const totalCols = columns.length + (selectable ? 1 : 0);
  const hasFilters = columns.some((c) => !!c.filter) && !!onFilterChange;
  const filters = filterValues ?? {};

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              {selectable && (
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={!!allChecked}
                    ref={(el) => { if (el) el.indeterminate = !!someChecked; }}
                    onChange={toggleAll}
                    aria-label="Select all"
                    className="h-4 w-4 cursor-pointer accent-primary"
                  />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} className={cn('text-left font-medium px-4 py-2.5', c.className)} style={{ width: c.width }}>
                  {c.header}
                </th>
              ))}
            </tr>
            {hasFilters && (
              <tr className="border-t bg-background/40">
                {selectable && <th className="w-10 px-2 py-1.5" />}
                {columns.map((c) => (
                  <th key={c.key} className="px-2 py-1.5 align-top" style={{ width: c.width }}>
                    {c.filter?.type === 'text' && (
                      <input
                        type="text"
                        value={filters[c.key] || ''}
                        placeholder={c.filter.placeholder || 'Filter…'}
                        onChange={(e) => onFilterChange!(c.key, e.target.value)}
                        className="h-7 w-full rounded border border-input bg-background px-2 text-xs font-normal normal-case tracking-normal text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    )}
                    {c.filter?.type === 'select' && (
                      <select
                        value={filters[c.key] || ''}
                        onChange={(e) => onFilterChange!(c.key, e.target.value)}
                        className="h-7 w-full rounded border border-input bg-background px-1.5 text-xs font-normal normal-case tracking-normal text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">All</option>
                        {c.filter.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={totalCols} className="px-4 py-12 text-center text-muted-foreground">
                  {empty || 'No data'}
                </td>
              </tr>
            )}
            {data.map((row) => {
              const checked = sel.has(row.id);
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-t hover:bg-muted/30 transition-colors',
                    onRowClick && 'cursor-pointer',
                    checked && 'bg-primary/5'
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable && (
                    <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRow(row.id)}
                        aria-label={`Select ${row.id}`}
                        className="h-4 w-4 cursor-pointer accent-primary"
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3', c.className)}>
                      {c.render ? c.render(row) : (row as any)[c.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
