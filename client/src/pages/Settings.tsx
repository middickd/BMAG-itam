import { useQuery } from '@tanstack/react-query';
import { Building2, MapPin, Server, ShieldCheck } from 'lucide-react';
import { api, getCurrentUser } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/Avatar';

export function Settings() {
  const user = getCurrentUser();
  const { data: locations } = useQuery({ queryKey: ['locations'], queryFn: () => api.get<{ data: any[] }>('/lookups/locations') });
  const { data: vendors } = useQuery({ queryKey: ['vendors'], queryFn: () => api.get<{ data: any[] }>('/lookups/vendors') });
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: () => api.get('/health') });

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <PageHeader title="Settings" description="Account, organization, and system" />

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
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-blue-600" /> Locations ({locations?.data.length || 0})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {locations?.data.map((l) => (
                <div key={l.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <div>
                    <div className="font-medium">{l.name}</div>
                    <div className="text-xs text-muted-foreground">{[l.city, l.country].filter(Boolean).join(', ')}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-violet-600" /> Vendors ({vendors?.data.length || 0})</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-1.5">
              {vendors?.data.map((v) => (
                <div key={v.id} className="text-sm py-1 px-2 rounded hover:bg-muted/50">
                  {v.name}
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
    </div>
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
