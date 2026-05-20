import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Download, Upload, Filter, Search } from 'lucide-react';
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

export function Assets() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<{ q: string; status: string; category: string }>({
    q: '', status: 'all', category: 'all',
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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

      <DataTable
        columns={columns}
        data={assetsData?.data || []}
        onRowClick={(r) => navigate(`/assets/${r.id}`)}
      />

      <CreateAssetDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

function CreateAssetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    asset_tag: '', category: 'Laptop', model: '', manufacturer: '', serial_number: '',
    purchase_cost: '', purchase_date: '',
  });
  const create = useMutation({
    mutationFn: () => api.post('/assets', { ...form, purchase_cost: form.purchase_cost ? Number(form.purchase_cost) : null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      onOpenChange(false);
      setForm({ asset_tag: '', category: 'Laptop', model: '', manufacturer: '', serial_number: '', purchase_cost: '', purchase_date: '' });
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add new asset</DialogTitle>
          <DialogDescription>Create a new hardware record.</DialogDescription>
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
    },
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
