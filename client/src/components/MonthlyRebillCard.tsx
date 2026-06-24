import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download, FileText, AlertTriangle, Info, Layers } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { SnapshotManager } from './SnapshotManager';

type Row = {
  location_id: string | null;
  location_name: string;
  deployed: number;
  rebill_total: number;
};

function priorMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function MonthlyRebillCard() {
  const [month, setMonth] = useState(priorMonth());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['monthly-rebill', month],
    queryFn: () => api.get<{
      month: string;
      baseline: string | null;
      earliest_billable_month?: string | null;
      data: Row[];
      totals: { deployed: number; rebill_total: number };
    }>(`/reports/monthly-rebill?month=${month}`),
  });

  const summaryHref  = `/api/exports/monthly-rebill.csv?month=${month}`;
  const detailedHref = `/api/exports/monthly-rebill-detail.csv?month=${month}`;

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" /> Monthly rebill
          </CardTitle>
          <CardDescription>
            Devices deployed to each location in {monthLabel(month)}, with cost to rebill.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || priorMonth())}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button variant="outline" size="sm" onClick={() => setSnapshotsOpen(true)} title="Review and edit baseline snapshots">
            <Layers className="h-4 w-4" /> Snapshots
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={summaryHref}><Download className="h-4 w-4" /> Summary CSV</a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={detailedHref}><Download className="h-4 w-4" /> Itemized CSV</a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && data && (
          data.baseline ? (
            <div className="px-4 py-2 text-xs text-muted-foreground border-b flex items-center gap-2">
              <Info className="h-3.5 w-3.5 text-blue-600" />
              Based on In Stock snapshot from {formatDateTime(data.baseline)} — only assets that were in stock at that time count as "from-stock" deployments.
            </div>
          ) : (
            <div className="px-4 py-3 text-sm border-b bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                No In Stock snapshot exists for {monthLabel(month)} yet, so we can't tell which assignments came from stock vs. were created directly in In Use.
                {data.earliest_billable_month && (
                  <> The earliest month with a baseline is <span className="font-semibold">{monthLabel(data.earliest_billable_month)}</span>. Pick that or later.</>
                )}
                {!data.earliest_billable_month && (
                  <> Run a Freshservice sync (or POST <code className="text-xs">/api/reports/take-snapshot</code>) to capture today's baseline; from next month onward this report will be accurate.</>
                )}
              </div>
            </div>
          )
        )}
        {!isLoading && (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
              <tr>
                <th className="w-8 px-2 py-2.5"></th>
                <th className="text-left px-4 py-2.5">Location</th>
                <th className="text-right px-4 py-2.5">Deployed</th>
                <th className="text-right px-4 py-2.5">Rebill total</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No deployments in {monthLabel(month)}.
                </td></tr>
              )}
              {data?.data.map((row) => {
                const key = row.location_id ?? 'unassigned';
                const isOpen = expanded.has(key);
                return (
                  <RebillRow
                    key={key}
                    row={row}
                    month={month}
                    isOpen={isOpen}
                    onToggle={() => toggle(key)}
                  />
                );
              })}
              {data && data.data.length > 0 && (
                <tr className="border-t bg-muted/40 font-semibold">
                  <td className="px-2 py-3"></td>
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{data.totals.deployed}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(data.totals.rebill_total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </CardContent>
      <SnapshotManager open={snapshotsOpen} onOpenChange={setSnapshotsOpen} />
    </Card>
  );
}

function RebillRow({
  row, month, isOpen, onToggle,
}: {
  row: Row;
  month: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const canExpand = row.deployed > 0;
  const params = new URLSearchParams({ month });
  if (row.location_id) params.set('location_id', row.location_id);
  const { data, isFetching } = useQuery({
    queryKey: ['monthly-rebill-detail', month, row.location_id],
    queryFn: () => api.get<{ data: any[] }>(`/reports/monthly-rebill/detail?${params.toString()}`),
    enabled: isOpen,
  });

  return (
    <>
      <tr className="border-t">
        <td className="px-2 py-3">
          <button
            type="button"
            onClick={onToggle}
            disabled={!canExpand}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded',
              canExpand ? 'hover:bg-accent text-foreground' : 'text-muted-foreground/40 cursor-default',
            )}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="px-4 py-3 font-medium">{row.location_name}</td>
        <td className="px-4 py-3 text-right tabular-nums">{row.deployed}</td>
        <td className="px-4 py-3 text-right tabular-nums font-medium">{formatCurrency(row.rebill_total)}</td>
      </tr>
      {isOpen && (
        <tr className="bg-muted/30">
          <td></td>
          <td colSpan={3} className="px-4 py-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Itemized charges
            </div>
            {isFetching && !data && <div className="text-xs text-muted-foreground">Loading line items…</div>}
            {data && (
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left py-1 font-medium">Tag</th>
                    <th className="text-left py-1 font-medium">Item</th>
                    <th className="text-left py-1 font-medium">Serial</th>
                    <th className="text-left py-1 font-medium">Assigned to</th>
                    <th className="text-left py-1 font-medium">Deployed</th>
                    <th className="text-right py-1 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((a: any) => (
                    <tr key={`${a.id}-${a.event_at}`} className="border-t border-border/50">
                      <td className="py-1.5 font-mono">{a.asset_tag}</td>
                      <td className="py-1.5">
                        <Link to={`/assets/${a.id}`} className="hover:underline">{a.model}</Link>
                        {a.manufacturer && <span className="text-muted-foreground"> · {a.manufacturer}</span>}
                      </td>
                      <td className="py-1.5 font-mono text-muted-foreground">{a.serial_number || '—'}</td>
                      <td className="py-1.5">
                        <div>{a.user_name || '—'}</div>
                        {a.user_email && <div className="text-muted-foreground">{a.user_email}</div>}
                      </td>
                      <td className="py-1.5 text-muted-foreground">{formatDate(a.event_at)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatCurrency(a.cost)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border/50 font-medium">
                    <td colSpan={5} className="py-1.5 text-right">Subtotal</td>
                    <td className="py-1.5 text-right tabular-nums">{formatCurrency(row.rebill_total)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
