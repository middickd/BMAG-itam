import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable, Column } from '@/components/DataTable';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/ui/badge';
import { toast, fromError } from '@/lib/toast';

export function People() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [department, setDepartment] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);

  const { data: depts } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<{ data: string[] }>('/lookups/departments'),
  });
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (department !== 'all') params.set('department', department);
  const qs = params.toString();
  const { data } = useQuery({
    queryKey: ['users', qs],
    queryFn: () => api.get<{ data: any[] }>(`/users${qs ? `?${qs}` : ''}`),
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
      <PageHeader
        title="People"
        description={`${data?.data.length ?? 0} users`}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New user
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name or email…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {depts?.data.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <DataTable columns={columns} data={data?.data || []} onRowClick={(u) => navigate(`/users/${u.id}`)} />

      <NewUserDialog open={createOpen} onOpenChange={setCreateOpen} departments={depts?.data || []} />
    </div>
  );
}

function NewUserDialog({
  open, onOpenChange, departments,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; departments: string[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', email: '', department: '', title: '', role: 'user',
  });

  const create = useMutation({
    mutationFn: () => api.post('/users', {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      department: form.department || null,
      title: form.title || null,
      role: form.role,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['departments'] });
      onOpenChange(false);
      setForm({ name: '', email: '', department: '', title: '', role: 'user' });
      toast.success('User added');
    },
    onError: (e) => fromError(e, 'Could not add user'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>Create a new person who can be assigned assets and license seats.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name" className="col-span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
          </Field>
          <Field label="Email" className="col-span-2">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@bmag.example" />
          </Field>
          <Field label="Department">
            <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Title">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Role" className="col-span-2">
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!form.name || !form.email || create.isPending}>
            {create.isPending ? 'Adding…' : 'Add user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className = '' }: any) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
