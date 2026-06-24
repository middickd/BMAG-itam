import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ChevronRight, MapPin, Calendar, ShieldCheck, DollarSign,
  UserPlus, Undo2, Wrench, Trash2, PackageX, NotebookPen,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/StatusBadge';
import { Avatar } from '@/components/Avatar';
import { formatCurrency, formatDate, formatDateTime, daysUntil } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { toast, fromError } from '@/lib/toast';

export function AssetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [maintOpen, setMaintOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const { data: asset } = useQuery({
    queryKey: ['asset', id],
    queryFn: () => api.get(`/assets/${id}`),
    enabled: !!id,
  });

  const checkin = useMutation({
    mutationFn: () => api.post(`/assets/${id}/checkin`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset', id] });
      toast.success('Checked in');
    },
    onError: (e) => fromError(e, 'Check-in failed'),
  });
  const retire = useMutation({
    mutationFn: () => api.post(`/assets/${id}/retire`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset', id] });
      toast.success('Asset retired');
    },
    onError: (e) => fromError(e, 'Retire failed'),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/assets/${id}`),
    onSuccess: () => {
      toast.success('Asset deleted');
      navigate('/assets');
    },
    onError: (e) => fromError(e, 'Delete failed'),
  });
  const checkWarranty = useMutation({
    mutationFn: () => api.post(`/dell/warranty/${id}`),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['asset', id] });
      toast.success(`Warranty updated to ${r.warranty_expires_at}`,
        r.fs_warning || 'Synced from Dell');
    },
    onError: (e) => fromError(e, 'Warranty lookup failed'),
  });

  if (!asset) return <div className="p-6">Loading…</div>;

  const warrantyDays = daysUntil(asset.warranty_expires_at);
  // Match Dell by manufacturer OR model, so blank-manufacturer imports (e.g. a
  // "Dell Pro"/"Precision" laptop) still get the warranty button. Mirrors the
  // server's isDellAsset()/DELL_SQL_MATCH in dell-warranty.js — keep in sync.
  const isDell = /dell|latitude|precision|optiplex|inspiron|vostro|poweredge|wyse|xps/i.test(
    `${asset.manufacturer || ''} ${asset.model || ''}`
  );

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link to="/assets" className="hover:text-foreground flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Assets</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-mono">{asset.asset_tag}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold tracking-tight">{asset.model}</h1>
            <StatusBadge status={asset.status} />
          </div>
          <div className="text-sm text-muted-foreground">
            {asset.manufacturer} · {asset.category} · S/N {asset.serial_number}
          </div>
        </div>
        <div className="flex gap-2">
          {asset.status !== 'retired' && (
            <>
              {asset.assigned_to ? (
                <Button variant="outline" onClick={() => checkin.mutate()}><Undo2 className="h-4 w-4" /> Check in</Button>
              ) : (
                <Button onClick={() => setAssignOpen(true)}><UserPlus className="h-4 w-4" /> Assign</Button>
              )}
              <Button variant="outline" onClick={() => setMaintOpen(true)}><Wrench className="h-4 w-4" /> Maintenance</Button>
              <Button variant="outline" onClick={() => retire.mutate()}><PackageX className="h-4 w-4" /> Retire</Button>
            </>
          )}
          <Button variant="outline" onClick={() => setNotesOpen(true)}><NotebookPen className="h-4 w-4" /> Notes</Button>
          {isDell && (
            <Button variant="outline" onClick={() => checkWarranty.mutate()} disabled={checkWarranty.isPending}>
              <ShieldCheck className="h-4 w-4" /> {checkWarranty.isPending ? 'Checking…' : 'Check warranty'}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => confirm('Delete this asset?') && remove.mutate()}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4 text-blue-600" /> Location & owner</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Location" value={asset.location?.name || '—'} />
            <Row label="Condition" value={asset.condition || '—'} />
            <Row label="Assigned to" value={asset.user ? (
              <Link to={`/users/${asset.user.id}`} className="hover:underline flex items-center gap-2">
                <Avatar name={asset.user.name} size={22} /> {asset.user.name}
              </Link>
            ) : '—'} />
            <Row label="Assigned since" value={formatDate(asset.assigned_at)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4 text-emerald-600" /> Lifecycle</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Purchased" value={formatDate(asset.purchase_date)} />
            <Row label="Depreciation" value={`${asset.depreciation_years || 3} years`} />
            <Row label="Warranty until" value={
              <span className="flex items-center gap-2">
                {formatDate(asset.warranty_expires_at)}
                {warrantyDays != null && warrantyDays >= 0 && warrantyDays <= 90 && (
                  <Badge variant={warrantyDays < 30 ? 'destructive' : 'warning'}>in {warrantyDays}d</Badge>
                )}
                {warrantyDays != null && warrantyDays < 0 && <Badge variant="muted">Expired</Badge>}
              </span>
            } />
            <Row label="Retired" value={formatDate(asset.retired_at)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4 text-violet-600" /> Cost</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Purchase cost" value={formatCurrency(asset.purchase_cost)} />
            <Row label="Current value" value={<span className="text-violet-600 font-medium">{formatCurrency(asset.depreciated_value)}</span>} />
            <Row label="Vendor" value={asset.vendor?.name || '—'} />
            <Row label="Asset tag" value={<span className="font-mono">{asset.asset_tag}</span>} />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">Assignment history ({asset.assignments.length})</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance ({asset.maintenance.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>
        <TabsContent value="history">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <tr>
                    <th className="text-left px-4 py-2.5">User</th>
                    <th className="text-left px-4 py-2.5">Assigned</th>
                    <th className="text-left px-4 py-2.5">Returned</th>
                    <th className="text-left px-4 py-2.5">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {asset.assignments.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No assignment history</td></tr>
                  )}
                  {asset.assignments.map((a: any) => (
                    <tr key={a.id} className="border-t">
                      <td className="px-4 py-3">{a.user_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDateTime(a.assigned_at)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.returned_at ? formatDateTime(a.returned_at) : <Badge variant="success">Current</Badge>}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="maintenance">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <tr>
                    <th className="text-left px-4 py-2.5">Type</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                    <th className="text-left px-4 py-2.5">Description</th>
                    <th className="text-left px-4 py-2.5">Opened</th>
                    <th className="text-right px-4 py-2.5">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {asset.maintenance.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No maintenance records</td></tr>
                  )}
                  {asset.maintenance.map((m: any) => (
                    <tr key={m.id} className="border-t">
                      <td className="px-4 py-3 font-medium">{m.type}</td>
                      <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{m.description}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(m.opened_at)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(m.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="notes">
          <Card>
            <CardContent className="p-6 text-sm">
              {asset.notes || <span className="text-muted-foreground">No notes</span>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} assetId={asset.id} />
      <MaintenanceDialog open={maintOpen} onOpenChange={setMaintOpen} assetId={asset.id} />
      <NotesDialog open={notesOpen} onOpenChange={setNotesOpen} assetId={asset.id} initialNotes={asset.notes || ''} fsLinked={!!asset.external_display_id} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function AssignDialog({ open, onOpenChange, assetId }: any) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const [note, setNote] = useState('');
  const { data: users } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => api.get<{ data: any[] }>('/users'),
    enabled: open,
  });
  const assign = useMutation({
    mutationFn: () => api.post(`/assets/${assetId}/assign`, { user_id: userId, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset', assetId] });
      onOpenChange(false);
      setUserId(''); setNote('');
      toast.success('Asset assigned');
    },
    onError: (e) => fromError(e, 'Assign failed'),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign asset</DialogTitle>
          <DialogDescription>Check out this asset to a user.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">User</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
              <SelectContent>
                {users?.data.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name} · {u.department}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="New hire onboarding" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => assign.mutate()} disabled={!userId || assign.isPending}>
            {assign.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotesDialog({ open, onOpenChange, assetId, initialNotes, fsLinked }: any) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState(initialNotes);
  // Refresh the editor with the latest saved notes each time the dialog opens.
  useEffect(() => { if (open) setNotes(initialNotes); }, [open, initialNotes]);
  const save = useMutation({
    mutationFn: () => api.post(`/assets/${assetId}/notes`, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset', assetId] });
      onOpenChange(false);
      toast.success('Notes saved', fsLinked ? 'Pushed to Freshservice' : undefined);
    },
    onError: (e) => fromError(e, 'Could not save notes'),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit notes</DialogTitle>
          <DialogDescription>
            {fsLinked
              ? 'Saved to this asset and written back to Freshservice.'
              : 'Saved to this asset.'}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            placeholder="Add notes about this asset…"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || notes === initialNotes}>
            {save.isPending ? 'Saving…' : 'Save notes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MaintenanceDialog({ open, onOpenChange, assetId }: any) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ type: '', description: '', cost: '' });
  const create = useMutation({
    mutationFn: () => api.post('/maintenance', {
      asset_id: assetId,
      type: form.type,
      description: form.description,
      cost: form.cost ? Number(form.cost) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset', assetId] });
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      onOpenChange(false);
      setForm({ type: '', description: '', cost: '' });
      toast.success('Ticket opened');
    },
    onError: (e) => fromError(e, 'Could not open ticket'),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open maintenance ticket</DialogTitle>
          <DialogDescription>Track a repair, replacement, or service event.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="Battery replacement" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Estimated cost</Label>
            <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!form.type || create.isPending}>
            {create.isPending ? 'Opening…' : 'Open ticket'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
