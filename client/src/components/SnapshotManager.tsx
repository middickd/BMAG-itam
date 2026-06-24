import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X, Search, Copy } from 'lucide-react';
import { api } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatDateTime, relativeTime } from '@/lib/utils';
import { toast, fromError } from '@/lib/toast';
import { cn } from '@/lib/utils';

type Snapshot = { snapshot_at: string; count: number };
type Member = {
  asset_key: string;
  asset_id: string | null;
  asset_tag: string | null;
  model: string | null;
  manufacturer: string | null;
  category: string | null;
  current_status: string | null;
  location_name: string | null;
  assigned_to_name: string | null;
};

export function SnapshotManager({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const { data: snapshots } = useQuery({
    queryKey: ['snapshots'],
    queryFn: () => api.get<{ data: Snapshot[] }>('/reports/snapshots'),
    enabled: open,
  });

  // Auto-select the most recent snapshot when the dialog opens or list changes.
  useEffect(() => {
    if (open && snapshots?.data.length && !selected) {
      setSelected(snapshots.data[0].snapshot_at);
    }
  }, [open, snapshots, selected]);

  // Reset selection when the dialog closes
  useEffect(() => { if (!open) setSelected(null); }, [open]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['snapshots'] });
    qc.invalidateQueries({ queryKey: ['snapshot-members'] });
    qc.invalidateQueries({ queryKey: ['monthly-rebill'] });
    qc.invalidateQueries({ queryKey: ['monthly-rebill-detail'] });
  };

  const remove = useMutation({
    mutationFn: (at: string) => api.delete(`/reports/snapshots/${encodeURIComponent(at)}`),
    onSuccess: (_r, at) => {
      invalidateAll();
      if (selected === at) setSelected(null);
      toast.success('Snapshot deleted');
    },
    onError: (e) => fromError(e, 'Delete failed'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Stock snapshots</DialogTitle>
          <DialogDescription>
            Each snapshot is a frozen list of which assets were In Stock at a point in time.
            The Monthly Rebill report uses the most recent snapshot taken at or before the start of the
            selected month as its baseline. Edit a snapshot to correct what bills.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[280px_1fr] gap-4 h-[60vh]">
          {/* Left: snapshot list */}
          <div className="border rounded-md flex flex-col overflow-hidden">
            <div className="p-2 border-b">
              <Button size="sm" className="w-full" onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" /> New snapshot
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {snapshots?.data.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground text-center">No snapshots yet.</div>
              )}
              {snapshots?.data.map((s) => (
                <button
                  key={s.snapshot_at}
                  type="button"
                  onClick={() => setSelected(s.snapshot_at)}
                  className={cn(
                    'w-full text-left px-3 py-2 border-b text-sm hover:bg-accent flex items-center justify-between gap-2',
                    selected === s.snapshot_at && 'bg-accent',
                  )}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{formatDateTime(s.snapshot_at)}</div>
                    <div className="text-xs text-muted-foreground">{relativeTime(s.snapshot_at)}</div>
                  </div>
                  <Badge variant="secondary">{s.count}</Badge>
                </button>
              ))}
            </div>
          </div>

          {/* Right: selected snapshot detail */}
          <div className="border rounded-md flex flex-col overflow-hidden">
            {selected ? (
              <SnapshotDetail
                at={selected}
                onDelete={() => {
                  if (confirm(`Delete snapshot ${formatDateTime(selected)}? This will change any rebill that relied on it as a baseline.`)) {
                    remove.mutate(selected);
                  }
                }}
                onChanged={invalidateAll}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Select a snapshot on the left.
              </div>
            )}
          </div>
        </div>

        <NewSnapshotDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          existing={snapshots?.data || []}
          onCreated={(at) => {
            invalidateAll();
            setSelected(at);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function SnapshotDetail({
  at, onDelete, onChanged,
}: {
  at: string;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['snapshot-members', at],
    queryFn: () => api.get<{ snapshot_at: string; count: number; data: Member[] }>(
      `/reports/snapshots/${encodeURIComponent(at)}`,
    ),
  });

  const removeMember = useMutation({
    mutationFn: (key: string) => api.delete(
      `/reports/snapshots/${encodeURIComponent(at)}/members/${encodeURIComponent(key)}`,
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['snapshot-members', at] });
      qc.invalidateQueries({ queryKey: ['snapshots'] });
      onChanged();
    },
    onError: (e) => fromError(e, 'Remove failed'),
  });

  const addMember = useMutation({
    mutationFn: (asset_id: string) => api.post(
      `/reports/snapshots/${encodeURIComponent(at)}/members`,
      { asset_id },
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['snapshot-members', at] });
      qc.invalidateQueries({ queryKey: ['snapshots'] });
      onChanged();
      toast.success('Asset added to snapshot');
    },
    onError: (e) => fromError(e, 'Add failed'),
  });

  const existingKeys = useMemo(
    () => new Set((data?.data || []).map((m) => m.asset_key)),
    [data],
  );

  return (
    <>
      <div className="p-3 border-b flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{formatDateTime(at)}</div>
          <div className="text-xs text-muted-foreground">
            {data?.count ?? 0} {(data?.count ?? 0) === 1 ? 'asset' : 'assets'} in this snapshot
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AssetAdder existing={existingKeys} onAdd={(id) => addMember.mutate(id)} disabled={addMember.isPending} />
          <Button size="sm" variant="outline" onClick={onDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" /> Delete snapshot
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
        {data && data.data.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground text-center">No assets in this snapshot. Add one with the search above.</div>
        )}
        {data && data.data.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/40 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Tag</th>
                <th className="text-left px-3 py-2">Model</th>
                <th className="text-left px-3 py-2">Location</th>
                <th className="text-left px-3 py-2">Currently</th>
                <th className="w-10 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((m) => (
                <tr key={m.asset_key} className="border-t">
                  <td className="px-3 py-1.5 font-mono text-xs">{m.asset_tag || <span className="text-muted-foreground italic">deleted</span>}</td>
                  <td className="px-3 py-1.5">
                    {m.model}
                    {m.manufacturer && <span className="text-muted-foreground"> · {m.manufacturer}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{m.location_name || '—'}</td>
                  <td className="px-3 py-1.5">
                    {m.current_status === 'in_stock' && <Badge variant="secondary">In Stock</Badge>}
                    {m.current_status === 'deployed' && <Badge variant="success">Deployed{m.assigned_to_name ? ` · ${m.assigned_to_name}` : ''}</Badge>}
                    {m.current_status === 'retired' && <Badge variant="muted">Retired</Badge>}
                    {m.current_status && !['in_stock','deployed','retired'].includes(m.current_status) && <Badge>{m.current_status}</Badge>}
                    {!m.current_status && <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeMember.mutate(m.asset_key)}
                      disabled={removeMember.isPending}
                      title="Remove from snapshot"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function AssetAdder({
  existing, onAdd, disabled,
}: {
  existing: Set<string>;
  onAdd: (asset_id: string) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const { data } = useQuery({
    queryKey: ['asset-picker-snapshot', debounced],
    queryFn: () => api.get<{ data: any[] }>(`/assets?limit=10${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`),
    enabled: open,
  });

  const hits = (data?.data || []).map((a) => ({
    ...a,
    key: a.external_id || a.id,
    alreadyIn: existing.has(a.external_id || a.id),
  }));

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Add asset by tag, model, serial…"
          className="pl-8 h-8 w-72 text-sm"
        />
      </div>
      {open && debounced && (
        <div className="absolute right-0 top-full mt-1 z-50 w-96 max-h-72 overflow-y-auto rounded-md border bg-popover shadow-lg">
          {hits.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              No matches for "{debounced}"
            </div>
          )}
          {hits.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={a.alreadyIn || disabled}
              onClick={() => { onAdd(a.id); setQ(''); setOpen(false); }}
              className={cn(
                'w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2',
                a.alreadyIn ? 'opacity-50 cursor-default' : 'hover:bg-accent',
              )}
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{a.model}</div>
                <div className="text-xs text-muted-foreground font-mono">{a.asset_tag} · {a.status}</div>
              </div>
              {a.alreadyIn && <Badge variant="muted">already in</Badge>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NewSnapshotDialog({
  open, onOpenChange, existing, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: Snapshot[];
  onCreated: (at: string) => void;
}) {
  // Default "now minus 1 minute" so the input always has a valid value;
  // user can edit to any past or future ISO timestamp.
  const [snapshotAt, setSnapshotAt] = useState(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16); // for datetime-local
  });
  const [mode, setMode] = useState<'current' | 'duplicate'>('current');
  const [sourceAt, setSourceAt] = useState<string>('');

  useEffect(() => {
    if (open && existing.length > 0 && !sourceAt) setSourceAt(existing[0].snapshot_at);
  }, [open, existing, sourceAt]);

  const create = useMutation({
    mutationFn: () => {
      const iso = new Date(snapshotAt).toISOString();
      return api.post<{ snapshot_at: string; count: number }>('/reports/snapshots', {
        snapshot_at: iso,
        mode,
        source_snapshot_at: mode === 'duplicate' ? sourceAt : undefined,
      });
    },
    onSuccess: (r) => {
      toast.success('Snapshot created', `${r.count} assets at ${formatDateTime(r.snapshot_at)}`);
      onCreated(r.snapshot_at);
      onOpenChange(false);
    },
    onError: (e) => fromError(e, 'Create failed'),
  });

  const canCreate = !!snapshotAt && (mode === 'current' || (mode === 'duplicate' && !!sourceAt));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New snapshot</DialogTitle>
          <DialogDescription>
            Backdate a snapshot to use as a baseline for a rebill month that doesn't have one yet.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Snapshot timestamp</label>
            <Input
              type="datetime-local"
              value={snapshotAt}
              onChange={(e) => setSnapshotAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              The rebill for month M uses the most recent snapshot dated on or before {`${'<'}month start${'>'}`}, so backdate this to the day you want as a baseline.
            </p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Seed with</label>
            <div className="flex flex-col gap-1 mt-1">
              <label className="text-sm flex items-center gap-2">
                <input type="radio" checked={mode === 'current'} onChange={() => setMode('current')} />
                Current In Stock assets ({existing.length === 0 ? 'first snapshot' : 'snapshot of right now'})
              </label>
              <label className="text-sm flex items-center gap-2">
                <input
                  type="radio"
                  checked={mode === 'duplicate'}
                  onChange={() => setMode('duplicate')}
                  disabled={existing.length === 0}
                />
                Duplicate of an existing snapshot
              </label>
              {mode === 'duplicate' && (
                <select
                  value={sourceAt}
                  onChange={(e) => setSourceAt(e.target.value)}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm ml-6 max-w-md"
                >
                  {existing.map((s) => (
                    <option key={s.snapshot_at} value={s.snapshot_at}>
                      {formatDateTime(s.snapshot_at)} ({s.count} assets)
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!canCreate || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create snapshot'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
