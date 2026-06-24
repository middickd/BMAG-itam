import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Download, Upload, Filter, Search, UserPlus, Undo2, PackageX, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DataTable, Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Avatar } from '@/components/Avatar';
import { formatCurrency, formatDate, daysUntil } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { toast, fromError } from '@/lib/toast';

export function Assets() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<{ q: string; status: string; category: string }>({
    q: searchParams.get('q') || '',
    status: searchParams.get('status') || 'all',
    category: searchParams.get('category') || 'all',
  });

  // Keep the URL in sync with the filter state so links from the dashboard land correctly
  // and the back button restores prior filter selections.
  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.q) next.set('q', filters.q);
    if (filters.status !== 'all') next.set('status', filters.status);
    if (filters.category !== 'all') next.set('category', filters.category);
    setSearchParams(next, { replace: true });
  }, [filters.q, filters.status, filters.category, setSearchParams]);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.q) p.set('q', filters.q);
    if (filters.status && filters.status !== 'all') p.set('status', filters.status);
    if (filters.category && filters.category !== 'all') p.set('category', filters.category);
    return p.toString();
  }, [filters]);

  const { data: assetsData } = useQuery({
    queryKey: ['assets', queryParams],
    queryFn: () => api.get<{ data: any[] }>(`/assets?${queryParams}`),
  });
  const { data: cats } = useQuery({ queryKey: ['cats'], queryFn: () => api.get<{ data: string[] }>('/lookups/categories') });
  const { data: statuses } = useQuery({ queryKey: ['statuses'], queryFn: () => api.get<{ data: string[] }>('/lookups/statuses') });

  const bulk = useMutation({
    mutationFn: (body: { action: string; user_id?: string }) =>
      api.post('/assets/bulk', { ids: Array.from(selected), ...body }),
    onSuccess: (r: any, vars) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      setSelected(new Set());
      const verbs: Record<string, string> = {
        assign: 'assigned', checkin: 'checked in', retire: 'retired', delete: 'deleted',
      };
      const notes: string[] = [];
      if (r.failed?.length) notes.push(`${r.failed.length} failed in Freshservice (left unchanged)`);
      if (r.skipped?.length) notes.push(`${r.skipped.length} skipped (retired)`);
      const msg = `${r.affected} ${r.affected === 1 ? 'asset' : 'assets'} ${verbs[vars.action]}`;
      if (r.failed?.length) toast.error(msg, notes.join(' · '));
      else toast.success(msg, notes.join(' · ') || undefined);
    },
    onError: (e) => fromError(e, 'Bulk action failed'),
  });

  const columns: Column<any>[] = [
    {
      key: 'asset_tag', header: 'Asset tag', width: '140px',
      render: (r) => <span className="font-mono text-xs font-medium">{r.asset_tag}</span>,
    },
    {
      key: 'serial_number', header: 'Serial #', width: '150px',
      render: (r) => r.serial_number
        ? <span className="font-mono text-xs text-muted-foreground">{r.serial_number}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'model', header: 'Asset',
      render: (r) => (
        <div>
          <div className="font-medium">{r.model}</div>
          <div className="text-xs text-muted-foreground">{r.manufacturer} · {r.category}</div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', width: '110px', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'assigned_to', header: 'Assigned to',
      render: (r) => r.user
        ? <div className="flex items-center gap-2">
            <Avatar name={r.user.name} size={26} color="#475569" />
            <div>
              <div className="text-sm">{r.user.name}</div>
              <div className="text-xs text-muted-foreground">{r.user.department}</div>
            </div>
          </div>
        : <span className="text-muted-foreground">—</span>,
    },
    { key: 'location', header: 'Location', render: (r) => r.location?.name || '—' },
    {
      key: 'warranty', header: 'Warranty',
      render: (r) => {
        const d = daysUntil(r.warranty_expires_at);
        if (d == null) return <span className="text-muted-foreground">—</span>;
        if (d < 0) return <Badge variant="muted">Expired</Badge>;
        if (d <= 30) return <Badge variant="destructive">{d}d</Badge>;
        if (d <= 90) return <Badge variant="warning">{d}d</Badge>;
        return <span className="text-sm text-muted-foreground">{formatDate(r.warranty_expires_at)}</span>;
      },
    },
    { key: 'value', header: 'Value', render: (r) => formatCurrency(r.depreciated_value), className: 'text-right' },
  ];

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <PageHeader
        title="Hardware assets"
        description={`${assetsData?.data.length ?? 0} devices in your fleet.`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/exports/assets.csv" target="_blank"><Download className="h-4 w-4" /> Export</a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New asset
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tag, model, manufacturer, serial…"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            className="pl-9"
          />
        </div>
        <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
          <SelectTrigger className="w-44">
            <Filter className="h-3.5 w-3.5 opacity-50 mr-1" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses?.data.map((s) => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.category} onValueChange={(v) => setFilters({ ...filters, category: v })}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {cats?.data.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg border bg-primary/5 px-3 py-2">
          <div className="text-sm font-medium">
            {selected.size} selected
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setBulkAssignOpen(true)} disabled={bulk.isPending}>
              <UserPlus className="h-4 w-4" /> Assign
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate({ action: 'checkin' })} disabled={bulk.isPending}>
              <Undo2 className="h-4 w-4" /> Check in
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate({ action: 'retire' })} disabled={bulk.isPending}>
              <PackageX className="h-4 w-4" /> Retire
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => confirm(`Delete ${selected.size} assets?`) && bulk.mutate({ action: 'delete' })}
              disabled={bulk.isPending}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={assetsData?.data || []}
        onRowClick={(r) => navigate(`/assets/${r.id}`)}
        selectable
        selected={selected}
        onSelectionChange={setSelected}
      />

      <CreateAssetDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <BulkAssignDialog
        open={bulkAssignOpen}
        onOpenChange={setBulkAssignOpen}
        onAssign={(user_id) => bulk.mutate({ action: 'assign', user_id })}
        count={selected.size}
        pending={bulk.isPending}
      />
    </div>
  );
}

function BulkAssignDialog({
  open, onOpenChange, onAssign, count, pending,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  onAssign: (user_id: string) => void; count: number; pending: boolean;
}) {
  const [userId, setUserId] = useState('');
  const { data: users } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => api.get<{ data: any[] }>('/users'),
    enabled: open,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk assign {count} assets</DialogTitle>
          <DialogDescription>All selected assets will be checked out to this user.</DialogDescription>
        </DialogHeader>
        <Label className="text-xs text-muted-foreground">User</Label>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
          <SelectContent>
            {users?.data.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.department}</SelectItem>)}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => { onAssign(userId); onOpenChange(false); setUserId(''); }}
            disabled={!userId || pending}
          >
            {pending ? 'Assigning…' : `Assign ${count}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateAssetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    asset_tag: '', category: 'Laptop', model: '', manufacturer: '', serial_number: '',
    purchase_cost: '', purchase_date: '',
  });
  const { data: fsStatus } = useQuery({
    queryKey: ['integrations', 'freshservice'],
    queryFn: () => api.get<{ configured: boolean }>('/integrations/freshservice'),
    enabled: open,
  });
  const fsConnected = !!fsStatus?.configured;

  const create = useMutation({
    mutationFn: () => api.post<any>('/assets', { ...form, purchase_cost: form.purchase_cost ? Number(form.purchase_cost) : null }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      onOpenChange(false);
      setForm({ asset_tag: '', category: 'Laptop', model: '', manufacturer: '', serial_number: '', purchase_cost: '', purchase_date: '' });
      const fsr = r?.freshservice;
      if (fsr) {
        const notes: string[] = [];
        if (!fsr.typeMatched) notes.push(`mapped to FS type "${fsr.usedTypeName}"`);
        if (fsr.product?.action === 'created') notes.push(`new product "${fsr.product.name}" created`);
        else if (fsr.product?.action === 'linked') notes.push(`linked to product "${fsr.product.name}"`);
        if (fsr.warnings?.length) notes.push(...fsr.warnings);
        toast.success('Asset created in Freshservice', notes.length ? notes.join('; ') : undefined);
      } else {
        toast.success('Asset created', 'Saved locally — Freshservice is not connected');
      }
    },
    onError: (e) => fromError(e, 'Could not create asset'),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add new asset</DialogTitle>
          <DialogDescription>
            {fsConnected
              ? 'Creates the record in Freshservice (system of record), then mirrors it here.'
              : 'Create a new hardware record. Freshservice is not connected, so this is saved locally only.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Asset tag"><Input value={form.asset_tag} onChange={(e) => setForm({ ...form, asset_tag: e.target.value })} placeholder="BMAG-01200" /></Field>
          <Field label="Category">
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['Laptop','Desktop','Monitor','Phone','Tablet','Peripheral','Headset','Dock','Server','Networking'].map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Model" className="col-span-2"><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="MacBook Pro 14&quot; M3" /></Field>
          <Field label="Manufacturer"><Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></Field>
          <Field label="Serial #"><Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></Field>
          <Field label="Purchase date"><Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></Field>
          <Field label="Purchase cost"><Input type="number" value={form.purchase_cost} onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !form.asset_tag || !form.model}>
            {create.isPending ? 'Creating…' : 'Create asset'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className = '' }: any) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const upload = useMutation({
    mutationFn: () => api.upload('/imports/assets', file!),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['assets'] });
      toast.success(`Imported ${r.inserted} assets`, r.errors?.length ? `${r.errors.length} rows skipped` : undefined);
    },
    onError: (e) => fromError(e, 'Upload failed'),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setFile(null); setResult(null); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk import assets</DialogTitle>
          <DialogDescription>
            Upload a CSV with columns: <code className="text-xs">asset_tag, category, model, manufacturer, serial_number, status, purchase_date, purchase_cost, warranty_expires_at</code>
          </DialogDescription>
        </DialogHeader>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm border rounded-md p-2"
        />
        {result && (
          <div className="text-sm bg-muted/50 rounded p-3">
            <div className="font-medium text-emerald-700">Imported {result.inserted} assets</div>
            {result.errors.length > 0 && (
              <div className="text-amber-700 mt-1">{result.errors.length} rows skipped</div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => upload.mutate()} disabled={!file || upload.isPending}>
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
