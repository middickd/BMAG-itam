import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate, daysUntil } from '@/lib/utils';

export function Licenses() {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['licenses'], queryFn: () => api.get<{ data: any[] }>('/licenses') });

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <PageHeader
        title="Software licenses"
        description={`${data?.data.length ?? 0} active license pools`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <a href="/api/exports/licenses.csv" target="_blank"><Download className="h-4 w-4" /> Export</a>
          </Button>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data?.data.map((l) => {
          const days = daysUntil(l.expires_at);
          const pct = l.seats === 0 ? 0 : (l.seats_used / l.seats) * 100;
          return (
            <Card
              key={l.id}
              className="cursor-pointer hover:shadow-md transition"
              onClick={() => navigate(`/licenses/${l.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold leading-tight">{l.software_name}</div>
                      <div className="text-xs text-muted-foreground">{l.publisher} · {l.version}</div>
                    </div>
                  </div>
                  {days != null && days <= 90 && (
                    <Badge variant={days < 30 ? 'destructive' : 'warning'}>
                      {days < 0 ? 'Expired' : `${days}d`}
                    </Badge>
                  )}
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Seats</span>
                    <span className="font-medium">{l.seats_used} / {l.seats}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t">
                    <div>
                      <div className="text-muted-foreground">Cost / seat</div>
                      <div className="font-medium">{formatCurrency(l.cost_per_seat)} <span className="text-muted-foreground">/{l.billing_cycle === 'monthly' ? 'mo' : 'yr'}</span></div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Expires</div>
                      <div className="font-medium">{formatDate(l.expires_at)}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
