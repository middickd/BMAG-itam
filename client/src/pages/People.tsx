import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { DataTable, Column } from '@/components/DataTable';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/ui/badge';

export function People() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { data } = useQuery({
    queryKey: ['users', q],
    queryFn: () => api.get<{ data: any[] }>(`/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  });

  const columns: Column<any>[] = [
    {
      key: 'name', header: 'Name',
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.name} color={u.avatar_color} size={32} />
          <div>
            <div className="font-medium">{u.name}</div>
            <div className="text-xs text-muted-foreground">{u.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'department', header: 'Department' },
    { key: 'title', header: 'Title', render: (u) => u.title || '—' },
    { key: 'role', header: 'Role', render: (u) => <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge> },
    {
      key: 'assets_count', header: 'Assets',
      render: (u) => <span className="font-medium">{u.assets_count}</span>,
      className: 'text-right', width: '90px',
    },
    {
      key: 'licenses_count', header: 'Licenses',
      render: (u) => <span className="font-medium">{u.licenses_count}</span>,
      className: 'text-right', width: '90px',
    },
  ];

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <PageHeader title="People" description={`${data?.data.length ?? 0} users`} />
      <div className="relative max-w-md mb-4">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name or email…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <DataTable columns={columns} data={data?.data || []} onRowClick={(u) => navigate(`/users/${u.id}`)} />
    </div>
  );
}
