import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Download } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function Reports() {
  const { data: locations } = useQuery({
    queryKey: ['report-locations'],
    queryFn: () => api.get<{ data: any[] }>('/reports/by-location'),
  });
  const { data: departments } = useQuery({
    queryKey: ['report-departments'],
    queryFn: () => api.get<{ data: any[] }>('/reports/by-department'),
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
        <CardHeader><CardTitle className="text-base">Department detail</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2.5">Department</th>
                <th className="text-right px-4 py-2.5">Users</th>
                <th className="text-right px-4 py-2.5">Assets</th>
                <th className="text-right px-4 py-2.5">Assets / user</th>
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
  );
}
