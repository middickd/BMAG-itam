import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Search, Boxes, X, CalendarClock } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { FreshserviceStatus, FreshserviceStatusData } from '@/components/FreshserviceStatus';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate, formatDateTime, daysUntil, relativeTime } from '@/lib/utils';

type ColumnFilters = {
  asset_tag: string;
  serial_number: string;
  model: string;
  category: string;
  location: string;
  warranty: string;
  value: string;
};

const EMPTY_FILTERS: ColumnFilters = {
  asset_tag: '',
  serial_number: '',
  model: '',
  category: '',
  location: '',
  warranty: '',
  value: '',
};

function matchWarranty(asset: any, mode: string) {
  if (!mode) return true;
  const d = daysUntil(asset.warranty_expires_at);
  if (mode === 'none') return d == null;
  if (d == null) return false;
  if (mode === 'expired') return d < 0;
  if (mode === 'lt30') return d >= 0 && d <= 30;
  if (mode === 'lt90') return d >= 0 && d <= 90;
  if (mode === 'valid') return d > 90;
  return true;
}

export function Inventory() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCategory = searchParams.get('category') || '';
  const [q, setQ] = useState('');
  const [asOfOpen, setAsOfOpen] = useState(false);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(() => ({
    ...EMPTY_FILTERS,
    category: urlCategory,
  }));

  // Keep state in sync with URL changes (e.g., navigating from one dashboard
  // category link to another while already on the page).
  useEffect(() => {
    setColumnFilters((prev) => (prev.category === urlCategory ? prev : { ...prev, category: urlCategory }));
  }, [urlCategory]);

  const { data, dataUpdatedAt, isFetching, refetch } = useQuery({
    queryKey: ['inventory', 'in_stock'],
    queryFn: () => api.get<{ data: any[] }>('/assets?status=in_stock&limit=1000'),
    refetchInterval: 10_000,
  });

  const { data: fsStatus } = useQuery({
    queryKey: ['integrations', 'freshservice'],
    queryFn: () => api.get<FreshserviceStatusData>('/integrations/freshservice'),
    refetchInterval: 10_000,
  });

  const all = data?.data ?? [];

  const setFilter = (key: string, value: string) => {
    if (key === 'category') {
      const next = new URLSearchParams(searchParams);
      if (value) next.set('category', value);
      else next.delete('category');
      setSearchParams(next, { replace: true });
      return;
    }
    setColumnFilters((prev) => ({ ...prev, [key as keyof ColumnFilters]: value }));
  };

  const clearFilters = () => {
    setColumnFilters(EMPTY_FILTERS);
    setQ('');
    const next = new URLSearchParams(searchParams);
    next.delete('category');
    setSearchParams(next, { replace: true });
  };

  const anyFilterActive = q.trim() !== '' || Object.values(columnFilters).some((v) => v !== '');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const minValue = columnFilters.value ? Number(columnFilters.value) : null;
    return all.filter((a) => {
      if (needle) {
        const hay = [a.asset_tag, a.model, a.manufacturer, a.serial_number, a.category, a.location?.name]
          .filter(Boolean)
          .map((s: string) => String(s).toLowerCase())
          .join(' ');
        if (!hay.includes(needle)) return false;
      }
      if (columnFilters.asset_tag && !String(a.asset_tag || '').toLowerCase().includes(columnFilters.asset_tag.toLowerCase())) return false;
      if (columnFilters.serial_number && !String(a.serial_number || '').toLowerCase().includes(columnFilters.serial_number.toLowerCase())) return false;
      if (columnFilters.model) {
        const term = columnFilters.model.toLowerCase();
        const blob = `${a.model || ''} ${a.manufacturer || ''}`.toLowerCase();
        if (!blob.includes(term)) return false;
      }
      if (columnFilters.category && a.category !== columnFilters.category) return false;
      if (columnFilters.location) {
        const loc = a.location?.name || '';
        if (columnFilters.location === '__unassigned__') {
          if (loc) return false;
        } else if (loc !== columnFilters.location) return false;
      }
      if (!matchWarranty(a, columnFilters.warranty)) return false;
      if (minValue != null && !Number.isNaN(minValue)) {
        if (Number(a.depreciated_value || 0) < minValue) return false;
      }
      return true;
    });
  }, [all, q, columnFilters]);

  const summary = useMemo(() => {
    const byCategory = new Map<string, number>();
    const byLocation = new Map<string, number>();
    let value = 0;
    for (const a of all) {
      byCategory.set(a.category, (byCategory.get(a.category) || 0) + 1);
      const loc = a.location?.name || 'Unassigned';
      byLocation.set(loc, (byLocation.get(loc) || 0) + 1);
      value += Number(a.depreciated_value || 0);
    }
    const top = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]);
    return {
      total: all.length,
      value,
      categories: top(byCategory),
      locations: top(byLocation),
    };
  }, [all]);

  const categoryOptions = useMemo(
    () => summary.categories.map(([c]) => ({ label: c, value: c })),
    [summary.categories],
  );
  const locationOptions = useMemo(() => {
    const opts = summary.locations
      .filter(([name]) => name !== 'Unassigned')
      .map(([name]) => ({ label: name, value: name }));
    if (summary.locations.some(([name]) => name === 'Unassigned')) {
      opts.push({ label: '(Unassigned)', value: '__unassigned__' });
    }
    return opts;
  }, [summary.locations]);

  const toggleCategory = (cat: string) =>
    setFilter('category', columnFilters.category === cat ? '' : cat);

  const columns: Column<any>[] = [
    {
      key: 'asset_tag', header: 'Asset tag', width: '160px',
      filter: { type: 'text', placeholder: 'Tag…' },
      render: (r) => <span className="font-mono text-xs font-medium">{r.asset_tag}</span>,
    },
    {
      key: 'serial_number', header: 'Serial #', width: '170px',
      filter: { type: 'text', placeholder: 'Serial…' },
      render: (r) => r.serial_number
        ? <span className="font-mono text-xs text-muted-foreground">{r.serial_number}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'model', header: 'Asset',
      filter: { type: 'text', placeholder: 'Model or maker…' },
      render: (r) => (
        <div>
          <div className="font-medium">{r.model}</div>
          <div className="text-xs text-muted-foreground">{r.manufacturer}</div>
        </div>
      ),
    },
    {
      key: 'category', header: 'Category', width: '160px',
      filter: { type: 'select', options: categoryOptions },
      render: (r) => <span className="text-sm">{r.category}</span>,
    },
    {
      key: 'location', header: 'Location', width: '180px',
      filter: { type: 'select', options: locationOptions },
      render: (r) => r.location?.name || <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'warranty', header: 'Warranty', width: '150px',
      filter: {
        type: 'select',
        options: [
          { label: 'Valid (> 90d)', value: 'valid' },
          { label: 'Within 90d', value: 'lt90' },
          { label: 'Within 30d', value: 'lt30' },
          { label: 'Expired', value: 'expired' },
          { label: 'No warranty', value: 'none' },
        ],
      },
      render: (r) => {
        const d = daysUntil(r.warranty_expires_at);
        if (d == null) return <span className="text-muted-foreground">—</span>;
        if (d < 0) return <Badge variant="muted">Expired</Badge>;
        if (d <= 30) return <Badge variant="destructive">{d}d</Badge>;
        if (d <= 90) return <Badge variant="warning">{d}d</Badge>;
        return <span className="text-sm text-muted-foreground">{formatDate(r.warranty_expires_at)}</span>;
      },
    },
    {
      key: 'value', header: 'Value', width: '130px',
      filter: { type: 'text', placeholder: '≥ $' },
      render: (r) => formatCurrency(r.depreciated_value), className: 'text-right',
    },
  ];

  const updated = dataUpdatedAt ? relativeTime(new Date(dataUpdatedAt).toISOString()) : '';

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <PageHeader
        title="Inventory"
        description={`Live snapshot of devices in stock${updated ? ` · refreshed ${updated}` : ''}.`}
        actions={
          <>
            <FreshserviceStatus status={fsStatus} />
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAsOfOpen(true)}>
              <CalendarClock className="h-4 w-4" /> Export as of date…
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/exports/assets.csv?status=in_stock" target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" /> Export
              </a>
            </Button>
          </>
        }
      />

      <AsOfExportDialog open={asOfOpen} onOpenChange={setAsOfOpen} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Devices in stock</div>
                <div className="text-3xl font-semibold tracking-tight">{summary.total}</div>
              </div>
              <Boxes className="h-5 w-5 text-cyan-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground mb-1">Estimated value</div>
            <div className="text-3xl font-semibold tracking-tight">{formatCurrency(summary.value)}</div>
            <div className="text-xs text-muted-foreground mt-1">Sum of current book value</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-muted-foreground">By category</div>
              {columnFilters.category && (
                <button
                  type="button"
                  onClick={() => setFilter('category', '')}
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  title="Clear category filter"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
            {summary.categories.length === 0 ? (
              <div className="text-sm text-muted-foreground">No stock on hand.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {summary.categories.slice(0, 6).map(([cat, count]) => {
                  const active = columnFilters.category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      aria-pressed={active}
                      className={cn(
                        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
                      )}
                    >
                      {cat} <span className={cn('ml-1', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {summary.locations.length > 1 && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">By location</div>
            <div className="flex flex-wrap gap-1.5">
              {summary.locations.map(([loc, count]) => (
                <Badge key={loc} variant="outline">
                  {loc} <span className="ml-1 text-muted-foreground">{count}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tag, model, manufacturer, serial, location…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        {anyFilterActive && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4" /> Clear filters
          </Button>
        )}
        <div className="text-xs text-muted-foreground">
          {filtered.length} of {summary.total}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        onRowClick={(r) => navigate(`/assets/${r.id}`)}
        filterValues={columnFilters}
        onFilterChange={setFilter}
        empty={<div className="p-8 text-center text-sm text-muted-foreground">No devices match the current filters.</div>}
      />
    </div>
  );
}

type Snapshot = { snapshot_at: string; count: number };

function todayLocalISODate() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Lets the user pull the In Stock inventory as it stood on a chosen date. Because
// snapshots are captured periodically (not daily), we show which snapshot the
// server will actually use as the baseline before they download.
function AsOfExportDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [date, setDate] = useState(todayLocalISODate);

  useEffect(() => { if (open) setDate(todayLocalISODate()); }, [open]);

  const { data: snapshots } = useQuery({
    queryKey: ['snapshots'],
    queryFn: () => api.get<{ data: Snapshot[] }>('/reports/snapshots'),
    enabled: open,
  });

  // Snapshots come back sorted newest-first; the baseline is the first one taken
  // at or before the end of the selected day — mirrors the server's rule.
  const baseline = useMemo(() => {
    if (!date) return null;
    const cutoff = `${date}T23:59:59.999Z`;
    return (snapshots?.data ?? []).find((s) => s.snapshot_at <= cutoff) ?? null;
  }, [snapshots, date]);

  const exactMatch = baseline && baseline.snapshot_at.slice(0, 10) === date;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export inventory as of a date</DialogTitle>
          <DialogDescription>
            Downloads the devices that were In Stock on the chosen date, reconstructed from the
            nearest stock snapshot taken on or before it. Asset details (location, value, etc.)
            reflect each device's current record.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">As of date</label>
            <Input
              type="date"
              value={date}
              max={todayLocalISODate()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {!date ? null : baseline ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="text-muted-foreground text-xs mb-1">Baseline snapshot</div>
              <div className="font-medium">{formatDateTime(baseline.snapshot_at)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {baseline.count} {baseline.count === 1 ? 'device' : 'devices'} in stock
                {exactMatch ? '' : ' · nearest snapshot on or before the selected date'}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800/60">
              No stock snapshot exists on or before {formatDate(date)}. The export would be empty —
              capture a snapshot for an earlier point in time from the Reports page first.
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {date && baseline ? (
            <Button asChild>
              <a
                href={`/api/exports/inventory.csv?asOf=${date}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => onOpenChange(false)}
              >
                <Download className="h-4 w-4" /> Download CSV
              </a>
            </Button>
          ) : (
            <Button disabled>
              <Download className="h-4 w-4" /> Download CSV
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

