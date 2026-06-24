import { Badge } from '@/components/ui/badge';

const map: Record<string, { variant: any; label: string }> = {
  in_stock: { variant: 'secondary', label: 'In stock' },
  reserved: { variant: 'default', label: 'Reserved' },
  deployed: { variant: 'success', label: 'Deployed' },
  maintenance: { variant: 'warning', label: 'Maintenance' },
  retired: { variant: 'muted', label: 'Retired' },
  lost: { variant: 'destructive', label: 'Lost' },
  open: { variant: 'warning', label: 'Open' },
  resolved: { variant: 'success', label: 'Resolved' },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = map[status] || { variant: 'outline', label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
