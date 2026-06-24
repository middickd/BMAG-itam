import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Search, Handshake, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { FreshserviceStatus, FreshserviceStatusData } from '@/components/FreshserviceStatus';
import { Avatar } from '@/components/Avatar';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate, daysUntil, relativeTime } from '@/lib/utils';

type ColumnFilters = {
  asset_tag: string;
  serial_number: string;
  model: string;
  category: string;
  location: string;
  assigned_to: string;
  warranty: string;
  value: string;
};

const EMPTY_FILTERS: ColumnFilters = {
  asset_tag: '',
  serial_number: '',
  model: '',
  category: '',
  location: '',
  assigned_to: '',
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

export function Loaners() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCategory = searchParams.get('category') || '';
  const [q, setQ] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(() => ({
    ...EMPTY_FILTERS,
    category: urlCategory,
  }));

  useEffect(() => {
    setColumnFilters((prev) => (prev.category === urlCategory ? prev : { ...prev, category: urlCategory }));
  }, [urlCategory]);

  const { data, dataUpdatedAt, isFetching, refetch } = useQuery({
    queryKey: ['loaners', 'reserved'],
    queryFn: () => api.get<{ data: any[] }>('/assets?status=reserved&limit=1000'),
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
        const hay = [a.asset_tag, a.model, a.manufacturer, a.serial_number, a.category, a.location?.name, a.user?.name]
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
      if (columnFilters.assigned_to) {
        const term = columnFilters.assigned_to.trim().toLowerCase();
        // Typing "available" filters to truly-available loaners (no current borrower);
        // otherwise substring-match against the borrower's name.
        if (term === 'available') {
          if (a.user) return false;
        } else {
          const name = (a.user?.name || '').toLowerCase();
          if (!name.includes(term)) return false;
        }
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
    let outCount = 0;
    for (const a of all) {
      byCategory.set(a.category, (byCategory.get(a.category) || 0) + 1);
      const loc = a.location?.name || 'Unassigned';
      byLocation.set(loc, (byLocation.get(loc) || 0) + 1);
      value += Number(a.depreciated_value || 0);
      if (a.user) outCount++;
    }
    const top = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]);
    return {
      total: all.length,
      out: outCount,
      available: all.length - outCount,
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
      key: 'asset_tag', header: 'Asset tag', width: '140px',
      filter: { type: 'text', placeholder: 'Tag…' },
      render: (r) => <span className="font-mono text-xs font-medium">{r.asset_tag}</span>,
    },
    {
      key: 'serial_number', header: 'Serial #', width: '150px',
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
      key: 'category', header: 'Category', width: '140px',
      filter: { type: 'select', options: categoryOptions },
      render: (r) => <span className="text-sm">{r.category}</span>,
    },
    {
      key: 'location', header: 'Location', width: '160px',
      filter: { type: 'select', options: locationOptions },
      render: (r) => r.location?.name || <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'assigned_to', header: 'Currently with',
      filter: { type: 'text', placeholder: 'Name or "Available"' },
      render: (r) => r.user
        ? <div className="flex items-center gap-2">
            <Avatar name={r.user.name} size={26} color="#475569" />
            <div>
              <div className="text-sm">{r.user.name}</div>
              <div className="text-xs text-muted-foreground">{r.user.department}</div>
            </div>
          </div>
        : <Badge variant="success">Available</Badge>,
    },
    {
      key: 'warranty', header: 'Warranty', width: '130px',
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
      key: 'value', header: 'Value', width: '110px',
      filter: { type: 'text', placeholder: '≥ $' },
      render: (r) => formatCurrency(r.depreciated_value), className: 'text-right',
    },
  ];

  const updated = dataUpdatedAt ? relativeTime(new Date(dataUpdatedAt).toISOString()) : '';

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <PageHeader
        title="Loaners"
        description={`Live snapshot of devices reserved as loaners${updated ? ` · refreshed ${updated}` : ''}.`}
        actions={
          <>
            <FreshserviceStatus status={fsStatus} />
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/exports/assets.csv?status=reserved" target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" /> Export
              </a>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Loaner devices</div>
                <div className="text-3xl font-semibold tracking-tight">{summary.total}</div>
              </div>
              <Handshake className="h-5 w-5 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground mb-1">Currently out</div>
            <div className="text-3xl font-semibold tracking-tight">{summary.out}</div>
            <div className="text-xs text-muted-foreground mt-1">{summary.available} available</div>
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
              <div className="text-sm text-muted-foreground">No loaners on hand.</div>
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
            placeholder="Search tag, model, manufacturer, serial, location, borrower…"
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
        empty={
          <div className="p-8 text-center text-sm text-muted-foreground">
            {all.length === 0
              ? 'No devices currently designated as loaners.'
              : 'No loaners match the current filters.'}
          </div>
        }
      />
    </div>
  );
}
