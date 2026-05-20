import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, Mail, Building2, BadgeCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/utils';

export function PersonDetail() {
  const { id } = useParams();
  const { data: user } = useQuery({
    queryKey: ['user', id],
    queryFn: () => api.get(`/users/${id}`),
    enabled: !!id,
  });
  if (!user) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link to="/users" className="hover:text-foreground flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> People</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span>{user.name}</span>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <Avatar name={user.name} color={user.avatar_color} size={64} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
          <div className="text-sm text-muted-foreground flex items-center gap-4 mt-1">
            <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {user.email}</span>
            <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {user.department}</span>
            <span className="flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5" /> {user.title}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Assigned hardware ({user.assets.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {user.assets.length === 0 && (
                  <tr><td className="px-4 py-8 text-center text-muted-foreground">No assets assigned</td></tr>
                )}
                {user.assets.map((a: any) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-4 py-3">
                      <Link to={`/assets/${a.id}`} className="hover:underline">
                        <div className="font-medium">{a.model}</div>
                        <div className="text-xs text-muted-foreground font-mono">{a.asset_tag}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right"><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Software licenses ({user.licenses.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {user.licenses.length === 0 && (
                  <tr><td className="px-4 py-8 text-center text-muted-foreground">No licenses</td></tr>
                )}
                {user.licenses.map((l: any) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="font-medium">{l.software_name}</div>
                      <div className="text-xs text-muted-foreground">Assigned {formatDate(l.assigned_at)}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      {l.expires_at && `Expires ${formatDate(l.expires_at)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
