import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Webhook, Plus, Trash2, Zap, Send, ChevronDown, ChevronUp, Check, X, ShieldCheck, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/PageHeader';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDateTime, relativeTime } from '@/lib/utils';
import { toast, fromError } from '@/lib/toast';

const PROVIDERS = [
  { name: 'Okta', desc: 'Sync users & groups from your SSO directory', tag: 'SCIM', color: '#007DC1' },
  { name: 'Microsoft Intune', desc: 'Auto-import managed devices and compliance signals', tag: 'MDM', color: '#0078D4' },
  { name: 'Jamf Pro', desc: 'macOS & iOS device sync', tag: 'MDM', color: '#1D7DBF' },
  { name: 'Jira Service Mgmt', desc: 'Open & sync maintenance tickets', tag: 'ITSM', color: '#2563EB' },
  { name: 'Slack', desc: 'Notify owners on assignment, warranty expiry, license overruns', tag: 'Comms', color: '#4A154B' },
  { name: 'Workday', desc: 'Trigger off-boarding when employees leave', tag: 'HRIS', color: '#F38B00' },
];

export function Integrations() {
  const qc = useQueryClient();
  const { data: hooks } = useQuery({ queryKey: ['webhooks'], queryFn: () => api.get<{ data: any[] }>('/webhooks') });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ url: '', events: '*', secret: '' });

  const create = useMutation({
    mutationFn: () => api.post('/webhooks', { url: form.url, events: form.events.split(',').map((s) => s.trim()), secret: form.secret }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhooks'] });
      setOpen(false);
      setForm({ url: '', events: '*', secret: '' });
      toast.success('Webhook registered');
    },
    onError: (e) => fromError(e, 'Could not register webhook'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook removed');
    },
    onError: (e) => fromError(e, 'Could not remove webhook'),
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <PageHeader title="Integrations" description="Connect BMAG ITAM with the rest of your stack" />

      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Providers</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {PROVIDERS.map((p) => (
          <Card key={p.name}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md text-white font-bold flex items-center justify-center text-sm"
                       style={{ background: p.color }}>
                    {p.name[0]}
                  </div>
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <Badge variant="muted">{p.tag}</Badge>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.info(`${p.name} connector`, 'Contact IT to enable this integration.')}
                >
                  Connect
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{p.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Hardware warranty</h2>
      <DellCard />

      <div className="flex items-center justify-between mb-3 mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Webhooks</h2>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add webhook</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Webhook className="h-4 w-4 text-blue-600" /> Outbound webhooks</CardTitle>
          <CardDescription>
            Fired on events like <code className="text-xs">asset.assigned</code>, <code className="text-xs">license.expiring</code>, <code className="text-xs">maintenance.opened</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!hooks?.data.length && (
            <div className="px-4 py-12 text-center text-muted-foreground">No webhooks configured</div>
          )}
          {hooks?.data.map((h) => <WebhookRow key={h.id} hook={h} onDelete={() => remove.mutate(h.id)} />)}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4 text-amber-600" /> REST API</CardTitle>
          <CardDescription>Programmatic access. Token-authenticated, JSON-only.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto">
{`curl -H "Authorization: Bearer <token>" \\
  http://localhost:4000/api/assets?status=deployed

curl -X POST -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <token>" \\
  -d '{"user_id":"usr_..."}' \\
  http://localhost:4000/api/assets/<asset_id>/assign`}
          </pre>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Add webhook</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">URL</Label>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://hooks.example.com/itam" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Events (comma separated, * for all)</Label>
              <Input value={form.events} onChange={(e) => setForm({ ...form, events: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Signing secret (optional)</Label>
              <Input value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} type="password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={!form.url || create.isPending}>
              {create.isPending ? 'Saving…' : 'Add webhook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WebhookRow({ hook, onDelete }: { hook: any; onDelete: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const test = useMutation({
    mutationFn: () => api.post(`/webhooks/${hook.id}/test`),
    onSuccess: () => {
      toast.success('Test event dispatched', 'Open Deliveries to see the result');
      qc.invalidateQueries({ queryKey: ['webhook-deliveries', hook.id] });
      qc.invalidateQueries({ queryKey: ['webhooks'] });
    },
    onError: (e) => fromError(e, 'Test failed'),
  });

  const { data: deliveries, isFetching } = useQuery({
    queryKey: ['webhook-deliveries', hook.id],
    queryFn: () => api.get<{ data: any[] }>(`/webhooks/${hook.id}/deliveries`),
    enabled: open,
    refetchInterval: open ? 3000 : false,
  });

  const status = hook.last_status;
  const statusBadge = status == null
    ? <Badge variant="muted">No deliveries</Badge>
    : status >= 200 && status < 300
      ? <Badge variant="success">{status}</Badge>
      : <Badge variant="destructive">{status || 'error'}</Badge>;

  return (
    <div className="border-t">
      <div className="flex items-center gap-3 px-4 py-3 text-sm">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs truncate">{hook.url}</div>
          <div className="flex gap-1 flex-wrap mt-1">
            {hook.events.map((e: string) => <Badge key={e} variant="secondary">{e}</Badge>)}
          </div>
        </div>
        <div className="hidden md:block text-xs text-muted-foreground w-28 text-right">
          {hook.last_delivery_at ? relativeTime(hook.last_delivery_at) : formatDateTime(hook.created_at)}
        </div>
        <div className="w-28 text-right">{statusBadge}</div>
        <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
          <Send className="h-3.5 w-3.5" /> Test
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span className="hidden sm:inline ml-1">Deliveries</span>
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      {open && (
        <div className="bg-muted/30 px-4 py-3 border-t">
          {isFetching && !deliveries && <div className="text-xs text-muted-foreground">Loading deliveries…</div>}
          {deliveries?.data.length === 0 && (
            <div className="text-xs text-muted-foreground">No deliveries yet. Click <span className="font-medium">Test</span> to fire one.</div>
          )}
          <div className="space-y-1.5">
            {deliveries?.data.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-xs">
                {d.ok
                  ? <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  : <X className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                <span className="font-mono">{d.status_code ?? '—'}</span>
                <span className="text-muted-foreground">{d.event_kind}</span>
                <span className="text-muted-foreground tabular-nums">{d.latency_ms}ms</span>
                <span className="text-muted-foreground flex-1 truncate" title={d.error || d.response_snippet || ''}>
                  {d.error ? `error: ${d.error}` : d.response_snippet ? `body: ${d.response_snippet}` : ''}
                </span>
                <span className="text-muted-foreground">{relativeTime(d.attempted_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DellCard() {
  const qc = useQueryClient();
  const { data: status } = useQuery({ queryKey: ['dell-status'], queryFn: () => api.get('/dell/status') });
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [mock, setMock] = useState(false);

  const save = useMutation({
    mutationFn: () => api.put('/dell', {
      client_id: clientId || undefined,
      client_secret: clientSecret || undefined,
      mock,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dell-status'] });
      setClientSecret('');
      toast.success('Dell settings saved');
    },
    onError: (e) => fromError(e, 'Could not save Dell settings'),
  });

  const refresh = useMutation({
    mutationFn: (onlyMissing: boolean) =>
      api.post('/dell/warranty/refresh', { only_missing: onlyMissing }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['dell-status'] });
      const errs = r.errors?.length ? `, ${r.errors.length} error(s)` : '';
      const nf = r.not_found?.length ? `, ${r.not_found.length} not found` : '';
      toast.success('Warranty refresh complete',
        `${r.updated} updated, ${r.unchanged} unchanged${nf}${errs} (of ${r.checked} checked)`);
    },
    onError: (e) => fromError(e, 'Warranty refresh failed'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-blue-600" /> Dell warranty lookup
          {status?.available
            ? <Badge variant="success">{status.effective_mock ? 'Mock mode' : 'Connected'}</Badge>
            : <Badge variant="muted">Not configured</Badge>}
        </CardTitle>
        <CardDescription>
          Populate warranty end dates from Dell by service tag (serial number).
          Credentials come from the Dell TechDirect portal → APIs → Asset Entitlement.
          {status != null && (
            <> {status.dell_asset_count} Dell asset(s), {status.missing_warranty_count} missing a warranty date.</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Client ID (API Key)</Label>
            <Input value={clientId} onChange={(e) => setClientId(e.target.value)}
                   placeholder={status?.configured ? '•••• saved ••••' : 'l7xx…'} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Client Secret</Label>
            <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
                   placeholder={status?.configured ? 'leave blank to keep current' : ''} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="h-4 w-4" checked={mock}
                 onChange={(e) => setMock(e.target.checked)} />
          <span>Mock mode — return synthetic warranty dates for testing without TechDirect API access</span>
        </label>
        {status?.configured && status?.mock && (
          <p className="text-xs text-amber-600">
            Real credentials are configured, so live Dell data is used — the mock toggle is ignored.
          </p>
        )}
        <div className="flex gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save settings'}
          </Button>
          <Button variant="outline" onClick={() => refresh.mutate(true)}
                  disabled={refresh.isPending || !status?.available}>
            <RefreshCw className={`h-4 w-4 ${refresh.isPending && refresh.variables === true ? 'animate-spin' : ''}`} />
            {refresh.isPending && refresh.variables === true ? 'Refreshing…' : 'Refresh missing warranties'}
          </Button>
          <Button variant="outline" onClick={() => {
                    const n = status?.dell_asset_count ?? 0;
                    if (confirm(`Re-check warranties for all ${n} Dell asset(s) and push any changes to Freshservice?`)) {
                      refresh.mutate(false);
                    }
                  }}
                  disabled={refresh.isPending || !status?.available}>
            <RefreshCw className={`h-4 w-4 ${refresh.isPending && refresh.variables === false ? 'animate-spin' : ''}`} />
            {refresh.isPending && refresh.variables === false ? 'Checking all…' : 'Re-check all warranties'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
