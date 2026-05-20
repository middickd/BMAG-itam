import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, Column } from '@/components/DataTable';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatDate, formatCurrency } from '@/lib/utils';

export function Maintenance() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [status, setStatus] = useState('open');
  const { data } = useQuery({
    queryKey: ['maintenance', status],
    queryFn: () => api.get<{ data: any[] }>(`/maintenance?status=${status}`),
  });
  const resolve = useMutation({
    mutationFn: (id: string) => api.post(`/maintenance/${id}/resolve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
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
      <PageHeader title="Maintenance" description="Repair tickets, replacements, and service history" />
      <Tabs value={status} onValueChange={setStatus} className="mb-4">
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
        </TabsList>
      </Tabs>
      <DataTable columns={columns} data={data?.data || []} empty="No tickets to show" />
    </div>
  );
}
