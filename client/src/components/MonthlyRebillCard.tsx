import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download, FileText, AlertTriangle, Info, Layers, Ban, Undo2, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { toast, fromError } from '@/lib/toast';
import { SnapshotManager } from './SnapshotManager';

type Row = {
  location_id: string | null;
  location_name: string;
  deployed: number;
  gross_total: number;
  credit_total: number;
  rebill_total: number;
};

type Totals = { deployed: number; gross_total: number; credit_total: number; rebill_total: number };

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
      totals: Totals;
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

  const hasCredits = (data?.totals.credit_total ?? 0) > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" /> Monthly rebill
          </CardTitle>
          <CardDescription>
            Devices deployed to each location in {monthLabel(month)}, with cost to rebill (net of credits).
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
              Based on In Stock snapshot from {formatDateTime(data.baseline)} — only assets that were in stock at that time count as "from-stock" deployments. Expand a location to exempt warranty swaps or add credits.
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
                <th className="text-right px-4 py-2.5">Gross</th>
                <th className="text-right px-4 py-2.5">Credits</th>
                <th className="text-right px-4 py-2.5">Net rebill</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
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
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(data.totals.gross_total)}</td>
                  <td className={cn('px-4 py-3 text-right tabular-nums', hasCredits && 'text-emerald-600 dark:text-emerald-400')}>
                    {hasCredits ? `−${formatCurrency(data.totals.credit_total)}` : formatCurrency(0)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(data.totals.rebill_total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {!isLoading && data?.baseline && <ExemptionsPanel month={month} />}
      </CardContent>
      <SnapshotManager open={snapshotsOpen} onOpenChange={setSnapshotsOpen} />
    </Card>
  );
}

type Detail = {
  data: any[];
  exempt: any[];
  credits: any[];
};

function RebillRow({
  row, month, isOpen, onToggle,
}: {
  row: Row;
  month: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const qc = useQueryClient();
  const canExpand = row.deployed > 0 || row.credit_total > 0;
  const params = new URLSearchParams({ month });
  if (row.location_id) params.set('location_id', row.location_id);
  const detailKey = ['monthly-rebill-detail', month, row.location_id];
  const { data, isFetching } = useQuery({
    queryKey: detailKey,
    queryFn: () => api.get<Detail>(`/reports/monthly-rebill/detail?${params.toString()}`),
    enabled: isOpen,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: detailKey });
    qc.invalidateQueries({ queryKey: ['monthly-rebill', month] });
    qc.invalidateQueries({ queryKey: ['monthly-rebill-exemptions', month] });
  };

  const setExempt = useMutation({
    mutationFn: (v: { assignment_id: string; exempt: boolean; reason?: string }) =>
      api.post(`/reports/monthly-rebill/assignments/${v.assignment_id}/exempt`, { exempt: v.exempt, reason: v.reason }),
    onSuccess: (_r, v) => { refresh(); toast.success(v.exempt ? 'Marked as non-billable' : 'Restored to billable'); },
    onError: (e) => fromError(e, 'Update failed'),
  });

  const addCredit = useMutation({
    mutationFn: (v: { amount: number; reason: string }) =>
      api.post('/reports/rebill-credits', { month, location_id: row.location_id, amount: v.amount, reason: v.reason || null }),
    onSuccess: () => { refresh(); toast.success('Credit added'); },
    onError: (e) => fromError(e, 'Add credit failed'),
  });

  const removeCredit = useMutation({
    mutationFn: (id: string) => api.delete(`/reports/rebill-credits/${id}`),
    onSuccess: () => { refresh(); toast.success('Credit removed'); },
    onError: (e) => fromError(e, 'Remove failed'),
  });

  const exemptDeployment = (assignment_id: string) => {
    const reason = window.prompt('Why is this deployment non-billable? (e.g. warranty RMA swap for tag …)');
    if (reason === null) return; // cancelled
    setExempt.mutate({ assignment_id, exempt: true, reason: reason.trim() });
  };

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
        <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(row.gross_total)}</td>
        <td className={cn('px-4 py-3 text-right tabular-nums', row.credit_total > 0 && 'text-emerald-600 dark:text-emerald-400')}>
          {row.credit_total > 0 ? `−${formatCurrency(row.credit_total)}` : '—'}
        </td>
        <td className="px-4 py-3 text-right tabular-nums font-medium">{formatCurrency(row.rebill_total)}</td>
      </tr>
      {isOpen && (
        <tr className="bg-muted/30">
          <td></td>
          <td colSpan={5} className="px-4 py-3 space-y-4">
            {/* Billable line items */}
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Itemized charges</div>
              {isFetching && !data && <div className="text-xs text-muted-foreground">Loading line items…</div>}
              {data && data.data.length === 0 && (
                <div className="text-xs text-muted-foreground">No billable deployments this month.</div>
              )}
              {data && data.data.length > 0 && (
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left py-1 font-medium">Tag</th>
                      <th className="text-left py-1 font-medium">Item</th>
                      <th className="text-left py-1 font-medium">Serial</th>
                      <th className="text-left py-1 font-medium">Assigned to</th>
                      <th className="text-left py-1 font-medium">Deployed</th>
                      <th className="text-right py-1 font-medium">Cost</th>
                      <th className="w-20 py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((a: any) => (
                      <tr key={a.assignment_id} className="border-t border-border/50">
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
                        <td className="py-1.5 text-right">
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => exemptDeployment(a.assignment_id)}
                            disabled={setExempt.isPending}
                            title="Don't bill this deployment (e.g. warranty RMA swap)"
                          >
                            <Ban className="h-3.5 w-3.5" /> Exempt
                          </Button>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-border/50 font-medium">
                      <td colSpan={5} className="py-1.5 text-right">Gross subtotal</td>
                      <td className="py-1.5 text-right tabular-nums">{formatCurrency(row.gross_total)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            {/* Exempt (warranty swaps / non-billable) */}
            {data && data.exempt.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Warranty replacements / exemptions</div>
                <table className="w-full text-xs">
                  <tbody>
                    {data.exempt.map((a: any) => (
                      <tr key={a.assignment_id} className="border-t border-border/50 text-muted-foreground">
                        <td className="py-1.5 font-mono line-through">{a.asset_tag}</td>
                        <td className="py-1.5">
                          <Link to={`/assets/${a.id}`} className="hover:underline line-through">{a.model}</Link>
                          {a.rebill_exempt_reason && <span className="italic"> — {a.rebill_exempt_reason}</span>}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{formatCurrency(0)}</td>
                        <td className="py-1.5 text-right w-20">
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setExempt.mutate({ assignment_id: a.assignment_id, exempt: false })}
                            disabled={setExempt.isPending}
                            title="Restore to billable"
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Restore
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Manual credits */}
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Credits &amp; adjustments</div>
              {data && data.credits.length > 0 && (
                <table className="w-full text-xs mb-2">
                  <tbody>
                    {data.credits.map((c: any) => (
                      <tr key={c.id} className="border-t border-border/50">
                        <td className="py-1.5">
                          {c.reason || <span className="text-muted-foreground italic">No reason given</span>}
                          {c.asset_tag && <span className="text-muted-foreground font-mono"> · {c.asset_tag}</span>}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">−{formatCurrency(c.amount)}</td>
                        <td className="py-1.5 text-right w-10">
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => removeCredit.mutate(c.id)}
                            disabled={removeCredit.isPending}
                            title="Remove credit"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <CreditForm onAdd={(amount, reason) => addCredit.mutate({ amount, reason })} pending={addCredit.isPending} />
            </div>

            {/* Net */}
            <div className="flex justify-end gap-8 border-t pt-2 text-xs">
              <span className="text-muted-foreground">Net rebill for {row.location_name}</span>
              <span className="font-semibold tabular-nums">{formatCurrency(row.rebill_total)}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Month-level view of every exempted deployment, regardless of location — the place
// to find and undo exemptions, including for locations that dropped out of the summary
// because they had nothing left to bill. These never appear in the CSV exports.
function ExemptionsPanel({ month }: { month: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['monthly-rebill-exemptions', month],
    queryFn: () => api.get<{ data: any[]; baseline: string | null }>(`/reports/monthly-rebill/exemptions?month=${month}`),
  });

  const restore = useMutation({
    mutationFn: (assignment_id: string) =>
      api.post(`/reports/monthly-rebill/assignments/${assignment_id}/exempt`, { exempt: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monthly-rebill-exemptions', month] });
      qc.invalidateQueries({ queryKey: ['monthly-rebill', month] });
      qc.invalidateQueries({ queryKey: ['monthly-rebill-detail'] });
      toast.success('Restored to billable');
    },
    onError: (e) => fromError(e, 'Restore failed'),
  });

  const items = data?.data || [];
  if (items.length === 0) return null;

  return (
    <div className="border-t">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs hover:bg-muted/40"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <Ban className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        <span className="font-medium uppercase tracking-wider text-muted-foreground">
          Exempted from this month's rebill ({items.length})
        </span>
        <span className="text-muted-foreground normal-case tracking-normal">— excluded from totals and CSV exports</span>
      </button>
      {open && (
        <div className="px-4 pb-3">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left py-1 font-medium">Tag</th>
                <th className="text-left py-1 font-medium">Item</th>
                <th className="text-left py-1 font-medium">Location</th>
                <th className="text-left py-1 font-medium">Reason</th>
                <th className="w-20 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a: any) => (
                <tr key={a.assignment_id} className="border-t border-border/50">
                  <td className="py-1.5 font-mono">{a.asset_tag}</td>
                  <td className="py-1.5">
                    <Link to={`/assets/${a.id}`} className="hover:underline">{a.model}</Link>
                    {a.manufacturer && <span className="text-muted-foreground"> · {a.manufacturer}</span>}
                  </td>
                  <td className="py-1.5 text-muted-foreground">{a.location_name}</td>
                  <td className="py-1.5 text-muted-foreground italic">{a.rebill_exempt_reason || '—'}</td>
                  <td className="py-1.5 text-right">
                    <Button
                      size="sm" variant="ghost" className="h-7 px-2 text-xs"
                      onClick={() => restore.mutate(a.assignment_id)}
                      disabled={restore.isPending}
                      title="Restore to billable"
                    >
                      <Undo2 className="h-3.5 w-3.5" /> Restore
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreditForm({ onAdd, pending }: { onAdd: (amount: number, reason: string) => void; pending: boolean }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const amt = Number(amount);
  const valid = Number.isFinite(amt) && amt > 0;

  const submit = () => {
    if (!valid) return;
    onAdd(Math.round(amt * 100) / 100, reason.trim());
    setAmount('');
    setReason('');
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">$</span>
        <Input
          type="number" min="0" step="0.01" inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="Amount"
          className="h-8 w-28 pl-5 text-sm"
        />
      </div>
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="Reason (e.g. goodwill credit, billing dispute)"
        className="h-8 flex-1 text-sm"
      />
      <Button size="sm" onClick={submit} disabled={!valid || pending}>
        <Plus className="h-4 w-4" /> Add credit
      </Button>
    </div>
  );
}
