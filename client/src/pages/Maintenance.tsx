import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, Column } from '@/components/DataTable';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { formatDate, formatCurrency } from '@/lib/utils';
import { toast, fromError } from '@/lib/toast';

export function Maintenance() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [status, setStatus] = useState('open');
  const [newOpen, setNewOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['maintenance', status],
    queryFn: () => api.get<{ data: any[] }>(`/maintenance?status=${status}`),
  });
  const resolve = useMutation({
    mutationFn: (id: string) => api.post(`/maintenance/${id}/resolve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      toast.success('Ticket resolved');
    },
    onError: (e) => fromError(e, 'Could not resolve'),
  });

  const columns: Column<any>[] = [
    { key: 'type', header: 'Type', render: (m) => <span className="font-medium">{m.type}</span> },
    {
      key: 'asset', header: 'Asset',
      render: (m) => (
        <div className="cursor-pointer" onClick={(e) => { e.stopPropagation(); navigate(`/assets/${m.asset_id}`); }}>
          <div className="font-medium hover:underline">{m.model}</div>
          <div className="text-xs text-muted-foreground font-mono">{m.asset_tag}</div>
        </div>
      ),
    },
    { key: 'description', header: 'Description', render: (m) => <span className="text-muted-foreground">{m.description}</span> },
    { key: 'tech', header: 'Tech', render: (m) => m.assigned_tech || '—' },
    { key: 'opened', header: 'Opened', render: (m) => <span className="text-muted-foreground">{formatDate(m.opened_at)}</span> },
    { key: 'cost', header: 'Cost', render: (m) => formatCurrency(m.cost), className: 'text-right' },
    { key: 'status', header: 'Status', render: (m) => <StatusBadge status={m.status} /> },
    {
      key: 'actions', header: '',
      render: (m) => m.status === 'open' && (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); resolve.mutate(m.id); }}
        >
          <CheckCircle2 className="h-4 w-4" /> Resolve
        </Button>
      ),
    },
  ];

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <PageHeader
        title="Maintenance"
        description="Repair tickets, replacements, and service history"
        actions={
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New ticket
          </Button>
        }
      />
      <Tabs value={status} onValueChange={setStatus} className="mb-4">
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
        </TabsList>
      </Tabs>
      <DataTable columns={columns} data={data?.data || []} empty="No tickets to show" />

      <NewTicketDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

function NewTicketDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [asset, setAsset] = useState<{ id: string; asset_tag: string; model: string } | null>(null);
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');

  const reset = () => {
    setAsset(null); setType(''); setDescription(''); setCost('');
  };

  const create = useMutation({
    mutationFn: () => api.post('/maintenance', {
      asset_id: asset!.id,
      type,
      description: description || null,
      cost: cost ? Number(cost) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      qc.invalidateQueries({ queryKey: ['asset', asset!.id] });
      onOpenChange(false);
      reset();
      toast.success('Ticket opened');
    },
    onError: (e) => fromError(e, 'Could not open ticket'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open maintenance ticket</DialogTitle>
          <DialogDescription>Track a repair, replacement, or service event.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Asset</Label>
            <AssetPicker value={asset} onChange={setAsset} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="Battery replacement" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Estimated cost</Label>
            <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!asset || !type || create.isPending}>
            {create.isPending ? 'Opening…' : 'Open ticket'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssetPicker({
  value, onChange,
}: {
  value: { id: string; asset_tag: string; model: string } | null;
  onChange: (a: { id: string; asset_tag: string; model: string } | null) => void;
}) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [openList, setOpenList] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpenList(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const { data } = useQuery({
    queryKey: ['asset-picker', debounced],
    queryFn: () => api.get<{ data: any[] }>(`/assets?limit=8${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`),
    enabled: openList,
  });
  const hits = useMemo(() => data?.data || [], [data]);

  if (value) {
    return (
      <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/30">
        <div>
          <div className="text-sm font-medium">{value.model}</div>
          <div className="text-xs font-mono text-muted-foreground">{value.asset_tag}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>Change</Button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpenList(true); }}
        onFocus={() => setOpenList(true)}
        placeholder="Search asset tag, model, or serial…"
        className="pl-9"
      />
      {openList && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-lg">
          {hits.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              {debounced ? `No assets matching "${debounced}"` : 'Type to search'}
            </div>
          )}
          {hits.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => { onChange({ id: a.id, asset_tag: a.asset_tag, model: a.model }); setOpenList(false); setQ(''); }}
              className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
            >
              <div className="font-medium truncate">{a.model}</div>
              <div className="text-xs text-muted-foreground font-mono">{a.asset_tag} · {a.status}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
