import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, MapPin, Server, ShieldCheck, Plus, Pencil, Trash2, RefreshCw, Cloud, Link2Off, Clock, DownloadCloud } from 'lucide-react';
import { api, getCurrentUser } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar } from '@/components/Avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast, fromError } from '@/lib/toast';
import { formatDateTime, relativeTime } from '@/lib/utils';

type Location = { id: string; name: string; address?: string | null; city?: string | null; country?: string | null };
type Vendor = { id: string; name: string; contact_email?: string | null; website?: string | null };

export function Settings() {
  const user = getCurrentUser();
  const { data: locations } = useQuery({ queryKey: ['locations'], queryFn: () => api.get<{ data: Location[] }>('/lookups/locations') });
  const { data: vendors } = useQuery({ queryKey: ['vendors'], queryFn: () => api.get<{ data: Vendor[] }>('/lookups/vendors') });
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: () => api.get('/health') });

  const [locDialog, setLocDialog] = useState<{ mode: 'create' | 'edit'; row?: Location } | null>(null);
  const [vendorDialog, setVendorDialog] = useState<{ mode: 'create' | 'edit'; row?: Vendor } | null>(null);

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <PageHeader title="Settings" description="Account, organization, and system" />

      <div className="mb-4">
        <FreshserviceCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-4">
              <Avatar name={user?.name || ''} color={user?.avatar_color} size={48} />
              <div>
                <div className="font-semibold">{user?.name}</div>
                <div className="text-sm text-muted-foreground">{user?.email}</div>
              </div>
              <Badge className="ml-auto">{user?.role}</Badge>
            </div>
            <dl className="text-sm space-y-2">
              <Row label="Department" value={user?.department} />
              <Row label="Title" value={user?.title} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Single sign-on</CardTitle>
            <CardDescription>SAML 2.0 / OIDC enterprise SSO configuration</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <Row label="Provider" value={<Badge variant="secondary">Mock (demo)</Badge>} />
            <Row label="Entity ID" value={<code className="text-xs">urn:bmag:itam:sp</code>} />
            <Row label="ACS URL" value={<code className="text-xs">/api/auth/saml/acs</code>} />
            <Row label="SCIM" value={<Badge variant="success">Enabled</Badge>} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600" /> Locations ({locations?.data.length || 0})
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setLocDialog({ mode: 'create' })}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {locations?.data.map((l) => (
                <div key={l.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0 group">
                  <div>
                    <div className="font-medium">{l.name}</div>
                    <div className="text-xs text-muted-foreground">{[l.city, l.country].filter(Boolean).join(', ')}</div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setLocDialog({ mode: 'edit', row: l })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <DeleteButton kind="location" id={l.id} name={l.name} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-violet-600" /> Vendors ({vendors?.data.length || 0})
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setVendorDialog({ mode: 'create' })}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {vendors?.data.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-sm py-1 px-1 group">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{v.name}</div>
                    {v.contact_email && <div className="text-xs text-muted-foreground truncate">{v.contact_email}</div>}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => setVendorDialog({ mode: 'edit', row: v })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <DeleteButton kind="vendor" id={v.id} name={v.name} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Server className="h-4 w-4" /> System</CardTitle></CardHeader>
          <CardContent className="text-sm grid grid-cols-3 gap-4">
            <Row label="API status" value={<Badge variant="success">{health?.ok ? 'Healthy' : 'Down'}</Badge>} />
            <Row label="Assets in DB" value={health?.assets ?? '—'} />
            <Row label="Build" value={<code className="text-xs">v1.0.0</code>} />
          </CardContent>
        </Card>
      </div>

      <LocationDialog state={locDialog} onClose={() => setLocDialog(null)} />
      <VendorDialog state={vendorDialog} onClose={() => setVendorDialog(null)} />
    </div>
  );
}

type FreshserviceStatus = {
  configured: boolean;
  domain: string | null;
  has_key: boolean;
  last_sync_at: string | null;
  asset_count: number;
  sync_in_flight: boolean;
  auto_sync_seconds: number;
};

function formatInterval(seconds: number): string {
  if (seconds <= 0) return 'Disabled';
  if (seconds < 60) return `Every ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Every ${minutes} min`;
  const hours = minutes / 60;
  if (hours < 24) {
    const h = Math.round(hours);
    return `Every ${h} hour${h === 1 ? '' : 's'}`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? 'Every 24 hours' : `Every ${days} days`;
}

function FreshserviceCard() {
  const qc = useQueryClient();
  const [configOpen, setConfigOpen] = useState(false);
  const [intervalOpen, setIntervalOpen] = useState(false);

  const { data: status } = useQuery({
    queryKey: ['freshservice-status'],
    queryFn: () => api.get<FreshserviceStatus>('/integrations/freshservice'),
    refetchInterval: 5000,
  });

  const sync = useMutation({
    mutationFn: () => api.post<{ counts: any; snapshot: { in_stock_count: number } }>('/integrations/freshservice/sync'),
    onSuccess: (r) => {
      const { counts, snapshot } = r;
      toast.success(
        'Freshservice sync complete',
        `${counts.assets} assets, ${counts.users} users, ${counts.locations} locations · ${snapshot.in_stock_count} in stock`,
      );
      // Invalidate every query that displays FS-sourced data
      qc.invalidateQueries({ queryKey: ['freshservice-status'] });
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['locations'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['monthly-rebill'] });
      qc.invalidateQueries({ queryKey: ['health'] });
      qc.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (e) => fromError(e, 'Sync failed'),
  });

  // Invalidate every query that displays FS-sourced data after any sync.
  const invalidateFsData = () => {
    qc.invalidateQueries({ queryKey: ['freshservice-status'] });
    qc.invalidateQueries({ queryKey: ['assets'] });
    qc.invalidateQueries({ queryKey: ['users'] });
    qc.invalidateQueries({ queryKey: ['locations'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['monthly-rebill'] });
    qc.invalidateQueries({ queryKey: ['health'] });
    qc.invalidateQueries({ queryKey: ['departments'] });
  };

  const softSync = useMutation({
    mutationFn: () => api.post<{ counts: { new_assets: number; new_users: number; new_locations: number; scanned: number } }>(
      '/integrations/freshservice/sync?mode=soft',
    ),
    onSuccess: (r) => {
      const { counts } = r;
      if (counts.new_assets === 0) {
        toast.success('Already up to date', `No new assets in Freshservice (scanned ${counts.scanned}).`);
      } else {
        toast.success(
          'Soft sync complete',
          `+${counts.new_assets} new asset${counts.new_assets === 1 ? '' : 's'}, +${counts.new_users} user${counts.new_users === 1 ? '' : 's'}, +${counts.new_locations} location${counts.new_locations === 1 ? '' : 's'}.`,
        );
      }
      invalidateFsData();
    },
    onError: (e) => fromError(e, 'Soft sync failed'),
  });

  const disconnect = useMutation({
    mutationFn: () => api.delete('/integrations/freshservice'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['freshservice-status'] });
      toast.success('Freshservice disconnected');
    },
    onError: (e) => fromError(e, 'Disconnect failed'),
  });

  const busy = sync.isPending || softSync.isPending || !!status?.sync_in_flight;

  const onSyncClick = () => {
    if (confirm('Full sync from Freshservice now? This will wipe and reload all assets, users, and locations.')) {
      sync.mutate();
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Cloud className="h-4 w-4 text-blue-600" /> Freshservice integration
              {status?.configured && <Badge variant="success">Connected</Badge>}
            </CardTitle>
            <CardDescription>
              {status?.configured
                ? <>Mirroring asset, user, and location data from <span className="font-mono">{status.domain}</span>.</>
                : 'Connect Freshservice to mirror your asset and user data into this app.'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {status?.configured ? (
              <>
                <Button
                  size="sm"
                  onClick={() => softSync.mutate()}
                  disabled={busy}
                  title="Pull only assets that are new since the last sync — leaves existing records, assignments, and edits untouched"
                >
                  <DownloadCloud className={`h-4 w-4 ${softSync.isPending ? 'animate-spin' : ''}`} />
                  {softSync.isPending ? 'Syncing…' : 'Soft sync'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onSyncClick}
                  disabled={busy}
                  title="Wipe and reload all assets, users, and locations from Freshservice"
                >
                  <RefreshCw className={`h-4 w-4 ${sync.isPending || status.sync_in_flight ? 'animate-spin' : ''}`} />
                  {sync.isPending || status.sync_in_flight ? 'Syncing…' : 'Full sync'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfigOpen(true)}>
                  <Pencil className="h-4 w-4" /> Update credentials
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => confirm('Disconnect Freshservice? Synced data will remain but no further syncs can run until reconnected.') && disconnect.mutate()}
                  disabled={disconnect.isPending}
                  title="Disconnect"
                >
                  <Link2Off className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setConfigOpen(true)}>
                <Plus className="h-4 w-4" /> Configure
              </Button>
            )}
          </div>
        </CardHeader>
        {status?.configured && (
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm pt-0">
            <Row label="Domain" value={<code className="text-xs">{status.domain}</code>} />
            <Row
              label="Last sync"
              value={status.last_sync_at
                ? <span title={formatDateTime(status.last_sync_at)}>{relativeTime(status.last_sync_at)}</span>
                : <span className="text-muted-foreground">Never</span>}
            />
            <Row label="Assets mirrored" value={status.asset_count} />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Auto-sync</span>
              <div className="flex items-center gap-1">
                <span className={`font-medium ${status.auto_sync_seconds <= 0 ? 'text-muted-foreground' : ''}`}>
                  {formatInterval(status.auto_sync_seconds)}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setIntervalOpen(true)}
                  title="Change auto-sync interval"
                  className="h-6 w-6"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <FreshserviceConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        initialDomain={status?.domain || ''}
        hasKey={!!status?.has_key}
      />
      <AutoSyncDialog
        open={intervalOpen}
        onOpenChange={setIntervalOpen}
        currentSeconds={status?.auto_sync_seconds ?? 300}
      />
    </>
  );
}

function FreshserviceConfigDialog({
  open, onOpenChange, initialDomain, hasKey,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialDomain: string;
  hasKey: boolean;
}) {
  const qc = useQueryClient();
  const [domain, setDomain] = useState(initialDomain);
  const [apiKey, setApiKey] = useState('');

  // Reset fields each time the dialog opens
  useStateSyncOnOpen({ open, initialDomain }, () => {
    if (open) { setDomain(initialDomain); setApiKey(''); }
  });

  const save = useMutation({
    mutationFn: () => api.put('/integrations/freshservice', { domain, api_key: apiKey || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['freshservice-status'] });
      toast.success('Freshservice credentials saved');
      onOpenChange(false);
    },
    onError: (e) => fromError(e, 'Save failed'),
  });

  const canSave = !!domain && (!!apiKey || hasKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{hasKey ? 'Update Freshservice credentials' : 'Connect Freshservice'}</DialogTitle>
          <DialogDescription>
            Saved to the local app database (server/data/itam.db). Rotate your API key in Freshservice after connecting if you want extra safety.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Freshservice domain</Label>
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="bobmoore.freshservice.com"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The actual product subdomain (not your <code>myfreshworks.com</code> or vanity portal URL).
            </p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              API key {hasKey && <span className="text-muted-foreground">(leave blank to keep current)</span>}
            </Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKey ? '•••• (unchanged)' : 'paste API key from Profile Settings'}
              autoComplete="new-password"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const AUTO_SYNC_PRESETS = [
  { value: '0',     label: 'Off (manual only)' },
  { value: '300',   label: 'Every 5 minutes' },
  { value: '900',   label: 'Every 15 minutes' },
  { value: '3600',  label: 'Every hour' },
  { value: '21600', label: 'Every 6 hours' },
  { value: '86400', label: 'Every 24 hours' },
];

function AutoSyncDialog({
  open, onOpenChange, currentSeconds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentSeconds: number;
}) {
  const qc = useQueryClient();
  const presetMatch = AUTO_SYNC_PRESETS.find((p) => Number(p.value) === currentSeconds);
  const [preset, setPreset] = useState(presetMatch ? presetMatch.value : 'custom');
  const [custom, setCustom] = useState(presetMatch ? '' : String(currentSeconds));

  useStateSyncOnOpen({ open, currentSeconds }, () => {
    if (open) {
      const m = AUTO_SYNC_PRESETS.find((p) => Number(p.value) === currentSeconds);
      setPreset(m ? m.value : 'custom');
      setCustom(m ? '' : String(currentSeconds));
    }
  });

  const save = useMutation({
    mutationFn: (seconds: number) => api.put('/integrations/freshservice/auto-sync', { seconds }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['freshservice-status'] });
      const applied = r?.auto_sync_seconds ?? 0;
      toast.success(
        'Auto-sync updated',
        applied === 0 ? 'Disabled — sync only runs when you click Sync now.' : `Now ${formatInterval(applied).toLowerCase()}.`,
      );
      onOpenChange(false);
    },
    onError: (e) => fromError(e, 'Could not update auto-sync'),
  });

  const customSeconds = Number(custom);
  const customInvalid = preset === 'custom' && (
    !custom || Number.isNaN(customSeconds) || customSeconds < 0 || (customSeconds > 0 && customSeconds < 60)
  );
  const submit = () => {
    const seconds = preset === 'custom' ? Math.floor(customSeconds) : Number(preset);
    save.mutate(seconds);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-600" /> Auto-sync interval
          </DialogTitle>
          <DialogDescription>
            How often the server pulls fresh data from Freshservice in the background. Each sync also writes a stock snapshot for the Monthly Rebill baseline.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Interval</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUTO_SYNC_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
                <SelectItem value="custom">Custom…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === 'custom' && (
            <div>
              <Label className="text-xs text-muted-foreground">Custom (seconds)</Label>
              <Input
                type="number"
                min={0}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="e.g. 1800 for 30 minutes"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Minimum 60 seconds (Freshservice rate limits). Enter 0 to disable.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending || customInvalid}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function DeleteButton({ kind, id, name }: { kind: 'location' | 'vendor'; id: string; name: string }) {
  const qc = useQueryClient();
  const path = kind === 'location' ? 'locations' : 'vendors';
  const queryKey = kind === 'location' ? 'locations' : 'vendors';
  const remove = useMutation({
    mutationFn: () => api.delete(`/lookups/${path}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      toast.success(`${kind === 'location' ? 'Location' : 'Vendor'} removed`);
    },
    onError: (e) => fromError(e, 'Could not remove'),
  });
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => confirm(`Remove "${name}"?`) && remove.mutate()}
    >
      <Trash2 className="h-3.5 w-3.5 text-destructive" />
    </Button>
  );
}

function LocationDialog({
  state, onClose,
}: { state: { mode: 'create' | 'edit'; row?: Location } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', address: '', city: '', country: '' });

  // Sync form with selected row whenever dialog opens
  useStateSyncOnOpen(state, () => {
    setForm({
      name: state?.row?.name ?? '',
      address: state?.row?.address ?? '',
      city: state?.row?.city ?? '',
      country: state?.row?.country ?? '',
    });
  });

  const save = useMutation({
    mutationFn: () => state?.mode === 'edit'
      ? api.patch(`/lookups/locations/${state.row!.id}`, form)
      : api.post('/lookups/locations', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] });
      toast.success(state?.mode === 'edit' ? 'Location updated' : 'Location added');
      onClose();
    },
    onError: (e) => fromError(e, 'Save failed'),
  });

  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state?.mode === 'edit' ? 'Edit location' : 'Add location'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="HQ - Austin" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">City</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Country</Label>
              <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VendorDialog({
  state, onClose,
}: { state: { mode: 'create' | 'edit'; row?: Vendor } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', contact_email: '', website: '' });

  useStateSyncOnOpen(state, () => {
    setForm({
      name: state?.row?.name ?? '',
      contact_email: state?.row?.contact_email ?? '',
      website: state?.row?.website ?? '',
    });
  });

  const save = useMutation({
    mutationFn: () => state?.mode === 'edit'
      ? api.patch(`/lookups/vendors/${state.row!.id}`, form)
      : api.post('/lookups/vendors', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] });
      toast.success(state?.mode === 'edit' ? 'Vendor updated' : 'Vendor added');
      onClose();
    },
    onError: (e) => fromError(e, 'Save failed'),
  });

  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state?.mode === 'edit' ? 'Edit vendor' : 'Add vendor'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Corp" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Contact email</Label>
            <Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Website</Label>
            <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Reset a dialog's form whenever its open state transitions from null → {…}.
// React hooks must be at top level, so this is a tiny effect helper.
import { useEffect } from 'react';
function useStateSyncOnOpen(state: any, sync: () => void) {
  useEffect(() => {
    if (state) sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}
