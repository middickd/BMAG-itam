import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Laptop, Users, KeyRound, Wrench, Boxes, AlertTriangle, Activity } from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/PageHeader';
import { formatCurrency, daysUntil, relativeTime } from '@/lib/utils';

const CATEGORY_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16'];

const STATUS_LABELS: Record<string, string> = {
  in_stock: 'In stock',
  reserved: 'Reserved',
  deployed: 'Deployed',
  maintenance: 'Maintenance',
  retired: 'Retired',
  lost: 'Lost',
};

export function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/reports/dashboard'),
  });

  if (isLoading || !data) {
    return <div className="p-6 text-muted-foreground">Loading dashboard…</div>;
  }

  const statusData = data.by_status.map((s: any) => ({ ...s, label: STATUS_LABELS[s.status] || s.status }));
  const categoryData = data.by_category.slice(0, 8);

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <PageHeader title="Dashboard" description="An overview of your IT asset estate." />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat to="/assets" icon={Laptop} label="Total assets" value={data.totals.assets} accent="text-blue-600" />
        <Stat to="/users" icon={Users} label="People" value={data.totals.users} accent="text-emerald-600" />
        <Stat to="/licenses" icon={KeyRound} label="License pools" value={data.totals.licenses} accent="text-violet-600" />
        <Stat to="/maintenance" icon={Wrench} label="Open tickets" value={data.totals.open_tickets} accent="text-amber-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Boxes className="h-4 w-4 text-cyan-600" /> Inventory on hand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link to="/inventory" className="block group">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-3xl font-semibold tracking-tight group-hover:text-primary transition-colors">
                  {data.in_stock?.count ?? 0}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatCurrency(data.in_stock?.value ?? 0)} value
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Devices currently in stock and ready to deploy.</p>
            </Link>

            <div className="text-xs uppercase tracking-wider text-muted-foreground mt-4 mb-2">By category</div>
            {(!data.in_stock?.by_category || data.in_stock.by_category.length === 0) ? (
              <p className="text-sm text-muted-foreground">No stock on hand.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.in_stock.by_category.map((c: { category: string; count: number }) => (
                  <Link
                    key={c.category}
                    to={`/inventory?category=${encodeURIComponent(c.category)}`}
                    className="group/cat inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    {c.category}
                    <span className="ml-1 text-muted-foreground group-hover/cat:text-primary-foreground/80">{c.count}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Assets by status</CardTitle></CardHeader>
          <CardContent>
            <div className="h-44">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={42}
                    outerRadius={70}
                    onClick={(d: any) => d?.status && navigate(`/assets?status=${d.status}`)}
                    cursor="pointer"
                  >
                    {statusData.map((_: any, i: number) => (
                      <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {statusData.map((s: any, i: number) => (
                <button
                  key={s.status}
                  type="button"
                  onClick={() => navigate(`/assets?status=${s.status}`)}
                  className="flex items-center gap-1.5 text-xs rounded px-1.5 py-0.5 hover:bg-accent transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                  {s.label} <span className="text-muted-foreground">{s.count}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Assets by category</CardTitle></CardHeader>
          <CardContent>
            <div className="h-44">
              <ResponsiveContainer>
                <BarChart data={categoryData} layout="vertical" margin={{ left: 4, right: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="category" width={90} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Upcoming expirations (next 90 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Warranties</div>
              {data.expiring.warranties.length === 0 && <p className="text-sm text-muted-foreground">Nothing expiring soon.</p>}
              <div className="space-y-1.5">
                {data.expiring.warranties.slice(0, 5).map((w: any) => {
                  const days = daysUntil(w.warranty_expires_at);
                  return (
                    <Link to={`/assets/${w.id}`} key={w.id} className="flex items-center justify-between text-sm py-1.5 px-2 -mx-2 rounded hover:bg-muted/50">
                      <div>
                        <span className="font-medium">{w.asset_tag}</span>
                        <span className="text-muted-foreground ml-2">{w.model}</span>
                      </div>
                      <Badge variant={days! < 30 ? 'destructive' : 'warning'}>in {days}d</Badge>
                    </Link>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Licenses</div>
              {data.expiring.licenses.length === 0 && <p className="text-sm text-muted-foreground">Nothing expiring soon.</p>}
              <div className="space-y-1.5">
                {data.expiring.licenses.slice(0, 5).map((l: any) => {
                  const days = daysUntil(l.expires_at);
                  return (
                    <Link to={`/licenses/${l.id}`} key={l.id} className="flex items-center justify-between text-sm py-1.5 px-2 -mx-2 rounded hover:bg-muted/50">
                      <div>
                        <span className="font-medium">{l.software_name}</span>
                        <span className="text-muted-foreground ml-2">{l.seats_used}/{l.seats} seats</span>
                      </div>
                      <Badge variant={days! < 30 ? 'destructive' : 'warning'}>in {days}d</Badge>
                    </Link>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-600" /> Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {data.recent_activity.map((a: any) => (
                <div key={a.id} className="flex gap-3 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="leading-snug">{a.summary}</div>
                    <div className="text-xs text-muted-foreground">{relativeTime(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ to, icon: Icon, label, value, accent }: any) {
  return (
    <Link
      to={to}
      className="block rounded-lg transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="hover:border-foreground/20 transition-colors">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-muted-foreground mb-1">{label}</div>
              <div className="text-3xl font-semibold tracking-tight">{value}</div>
            </div>
            <Icon className={`h-5 w-5 ${accent}`} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

