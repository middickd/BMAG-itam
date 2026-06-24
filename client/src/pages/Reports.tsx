import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
import { Download } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { MonthlyRebillCard } from '@/components/MonthlyRebillCard';

const EXPIRING_WINDOWS = [
  { value: '30', label: 'Next 30 days' },
  { value: '60', label: 'Next 60 days' },
  { value: '90', label: 'Next 90 days' },
  { value: '180', label: 'Next 180 days' },
  { value: '365', label: 'Next 12 months' },
];

const ALL_LOCATIONS = '__all__';

export function Reports() {
  const { data: locations } = useQuery({
    queryKey: ['report-locations'],
    queryFn: () => api.get<{ data: any[] }>('/reports/by-location'),
  });
  const { data: departments } = useQuery({
    queryKey: ['report-departments'],
    queryFn: () => api.get<{ data: any[] }>('/reports/by-department'),
  });
  const { data: cost } = useQuery({
    queryKey: ['report-cost-over-time'],
    queryFn: () => api.get<{ data: any[] }>('/reports/cost-over-time'),
  });
  const { data: age } = useQuery({
    queryKey: ['report-age-distribution'],
    queryFn: () => api.get<{ data: any[] }>('/reports/age-distribution'),
  });
  const { data: licenseUtil } = useQuery({
    queryKey: ['report-license-utilization'],
    queryFn: () => api.get<{ data: any[] }>('/reports/license-utilization'),
  });

  const [expLocation, setExpLocation] = useState<string>(ALL_LOCATIONS);
  const [expWindow, setExpWindow] = useState<string>('90');
  const expParams = new URLSearchParams({ within_days: expWindow });
  if (expLocation !== ALL_LOCATIONS) expParams.set('location_id', expLocation);
  const { data: expiring } = useQuery({
    queryKey: ['report-expiring-assets', expLocation, expWindow],
    queryFn: () => api.get<{ data: any[]; count: number }>(`/reports/expiring-assets?${expParams.toString()}`),
  });

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <PageHeader
        title="Reports"
        description="Breakdowns by location and department"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/api/exports/assets.csv" target="_blank"><Download className="h-4 w-4" /> Assets CSV</a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/exports/licenses.csv" target="_blank"><Download className="h-4 w-4" /> Licenses CSV</a>
            </Button>
          </div>
        }
      />

      <div className="mb-4">
        <MonthlyRebillCard />
      </div>

      <Card className="mb-4">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Expiring assets by location</CardTitle>
              <CardDescription>
                Active assets with a warranty expiring in the selected window. Negative
                values mean the warranty has already lapsed.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={expLocation} onValueChange={setExpLocation}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_LOCATIONS}>All locations</SelectItem>
                  {(locations?.data || [])
                    .slice()
                    .sort((a: any, b: any) => a.name.localeCompare(b.name))
                    .map((l: any) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={expWindow} onValueChange={setExpWindow}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRING_WINDOWS.map((w) => (
                    <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/exports/expiring-assets.csv?${expParams.toString()}`} target="_blank">
                  <Download className="h-4 w-4" /> CSV
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2.5">Asset tag</th>
                <th className="text-left px-4 py-2.5">Category</th>
                <th className="text-left px-4 py-2.5">Model</th>
                <th className="text-left px-4 py-2.5">Location</th>
                <th className="text-left px-4 py-2.5">Assigned to</th>
                <th className="text-left px-4 py-2.5">Warranty expires</th>
                <th className="text-right px-4 py-2.5">Days left</th>
              </tr>
            </thead>
            <tbody>
              {(expiring?.data || []).map((a: any) => {
                const days = a.days_remaining;
                const badge =
                  days < 0 ? <Badge variant="destructive">Expired</Badge>
                    : days <= 30 ? <Badge variant="destructive">{days}d</Badge>
                    : days <= 60 ? <Badge variant="warning">{days}d</Badge>
                    : <Badge variant="muted">{days}d</Badge>;
                return (
                  <tr key={a.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{a.asset_tag}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.category}</td>
                    <td className="px-4 py-3">{[a.manufacturer, a.model].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-4 py-3">{a.location_name || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.assigned_to_name || '—'}</td>
                    <td className="px-4 py-3 tabular-nums">{a.warranty_expires_at}</td>
                    <td className="px-4 py-3 text-right">{badge}</td>
                  </tr>
                );
              })}
              {(!expiring?.data || expiring.data.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No assets expiring in this window
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Assets by location</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={locations?.data || []} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="asset_count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Assets by department</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={departments?.data || []} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="department" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="asset_count" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Hardware spend (last 24 months)</CardTitle>
          <CardDescription>Total purchase value of assets acquired each month</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={cost?.data || []} margin={{ left: 8, right: 8 }}>
                <defs>
                  <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
                <Tooltip
                  formatter={(v: any) => formatCurrency(Number(v))}
                  labelFormatter={(l) => l}
                  contentStyle={{ borderRadius: 8 }}
                />
                <Area type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={2} fill="url(#costFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Asset age distribution</CardTitle>
            <CardDescription>Active (non-retired) hardware by years since purchase</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={age?.data || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Department detail</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
                <tr>
                  <th className="text-left px-4 py-2.5">Department</th>
                  <th className="text-right px-4 py-2.5">Users</th>
                  <th className="text-right px-4 py-2.5">Assets</th>
                  <th className="text-right px-4 py-2.5">Per user</th>
                </tr>
              </thead>
              <tbody>
                {departments?.data.map((d: any) => (
                  <tr key={d.department} className="border-t">
                    <td className="px-4 py-3 font-medium">{d.department}</td>
                    <td className="px-4 py-3 text-right">{d.user_count}</td>
                    <td className="px-4 py-3 text-right">{d.asset_count}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {d.user_count > 0 ? (d.asset_count / d.user_count).toFixed(1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">License utilization</CardTitle>
          <CardDescription>Seats used vs purchased, by software pool</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2.5">Software</th>
                <th className="text-left px-4 py-2.5">Publisher</th>
                <th className="text-right px-4 py-2.5">Seats</th>
                <th className="px-4 py-2.5 w-[40%]">Utilization</th>
                <th className="text-right px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {licenseUtil?.data.map((l: any) => {
                const pct = Math.min(100, l.utilization_pct);
                const tone =
                  l.status === 'overage' || l.status === 'full' ? 'bg-red-500'
                    : l.status === 'high' ? 'bg-amber-500'
                    : l.status === 'underused' ? 'bg-slate-400'
                    : 'bg-emerald-500';
                const badge =
                  l.status === 'overage' ? <Badge variant="destructive">Overage</Badge>
                    : l.status === 'full' ? <Badge variant="destructive">Full</Badge>
                    : l.status === 'high' ? <Badge variant="warning">High</Badge>
                    : l.status === 'underused' ? <Badge variant="muted">Underused</Badge>
                    : <Badge variant="success">OK</Badge>;
                return (
                  <tr key={l.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{l.software_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.publisher || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{l.seats_used} / {l.seats}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden flex-1">
                          <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
                          {l.utilization_pct}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">{badge}</td>
                  </tr>
                );
              })}
              {(!licenseUtil?.data || licenseUtil.data.length === 0) && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No license data</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
