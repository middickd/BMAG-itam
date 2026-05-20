import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, KeyRound, UserPlus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatDate, daysUntil } from '@/lib/utils';

export function LicenseDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const { data: lic } = useQuery({
    queryKey: ['license', id],
    queryFn: () => api.get(`/licenses/${id}`),
    enabled: !!id,
  });

  const revoke = useMutation({
    mutationFn: (userId: string) => api.post(`/licenses/${id}/revoke`, { user_id: userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['license', id] }),
  });

  if (!lic) return <div className="p-6">Loading…</div>;
  const days = daysUntil(lic.expires_at);
  const utilization = lic.seats === 0 ? 0 : (lic.seats_used / lic.seats) * 100;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link to="/licenses" className="hover:text-foreground flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Licenses</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span>{lic.software_name}</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{lic.software_name}</h1>
            <div className="text-sm text-muted-foreground">{lic.publisher} · {lic.version}</div>
          </div>
        </div>
        <Button onClick={() => setAssignOpen(true)} disabled={lic.seats_used >= lic.seats}>
          <UserPlus className="h-4 w-4" /> Assign seat
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground mb-1">Seats used</div>
            <div className="text-2xl font-semibold">{lic.seats_used} / {lic.seats}</div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-3">
              <div
                className={`h-full ${utilization >= 90 ? 'bg-red-500' : utilization >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, utilization)}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground mb-1">Cost per seat</div>
            <div className="text-2xl font-semibold">{formatCurrency(lic.cost_per_seat)}</div>
            <div className="text-xs text-muted-foreground mt-2">Billed {lic.billing_cycle}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground mb-1">Total commitment</div>
            <div className="text-2xl font-semibold">{formatCurrency((lic.cost_per_seat || 0) * lic.seats * (lic.billing_cycle === 'monthly' ? 12 : 1))}</div>
            <div className="text-xs text-muted-foreground mt-2">Annualized</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground mb-1">Expires</div>
            <div className="text-2xl font-semibold">{formatDate(lic.expires_at)}</div>
            {days != null && (
              <div className="mt-2">
                {days < 0 ? <Badge variant="muted">Expired</Badge>
                  : days < 30 ? <Badge variant="destructive">in {days}d</Badge>
                  : days < 90 ? <Badge variant="warning">in {days}d</Badge>
                  : <span className="text-xs text-muted-foreground">in {days}d</span>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assigned seats ({lic.assignments.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2.5">User</th>
                <th className="text-left px-4 py-2.5">Department</th>
                <th className="text-left px-4 py-2.5">Assigned</th>
                <th className="text-right px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lic.assignments.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No assigned seats yet</td></tr>
              )}
              {lic.assignments.map((a: any) => (
                <tr key={a.id} className="border-t">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={a.user_name} size={26} />
                      <div>
                        <div className="font-medium">{a.user_name}</div>
                        <div className="text-xs text-muted-foreground">{a.user_email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{a.department}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(a.assigned_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => confirm(`Revoke ${a.user_name}'s seat?`) && revoke.mutate(a.user_id)}>
                      <X className="h-4 w-4" /> Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <AssignSeatDialog open={assignOpen} onOpenChange={setAssignOpen} licenseId={lic.id} />
    </div>
  );
}

function AssignSeatDialog({ open, onOpenChange, licenseId }: any) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const { data: users } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => api.get<{ data: any[] }>('/users'),
    enabled: open,
  });
  const assign = useMutation({
    mutationFn: () => api.post(`/licenses/${licenseId}/assign`, { user_id: userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['license', licenseId] });
      onOpenChange(false);
      setUserId('');
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Assign license seat</DialogTitle></DialogHeader>
        <Label className="text-xs text-muted-foreground">User</Label>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
          <SelectContent>
            {users?.data.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.department}</SelectItem>)}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => assign.mutate()} disabled={!userId || assign.isPending}>
            {assign.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
