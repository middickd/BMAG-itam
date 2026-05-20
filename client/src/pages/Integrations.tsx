import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Webhook, Plus, Trash2, Zap, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/PageHeader';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/utils';

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
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
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
                <Button variant="outline" size="sm">Connect</Button>
              </div>
              <p className="text-sm text-muted-foreground">{p.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
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
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2.5">Endpoint</th>
                <th className="text-left px-4 py-2.5">Events</th>
                <th className="text-left px-4 py-2.5">Created</th>
                <th className="text-right px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!hooks?.data.length && (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">No webhooks configured</td></tr>
              )}
              {hooks?.data.map((h) => (
                <tr key={h.id} className="border-t">
                  <td className="px-4 py-3 font-mono text-xs flex items-center gap-1">
                    {h.url} <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {h.events.map((e: string) => <Badge key={e} variant="secondary">{e}</Badge>)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(h.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(h.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <DialogContent>
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
