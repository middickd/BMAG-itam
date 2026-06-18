import { StatusBadge } from '@bmag-itam/client';

const wrap = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };

export const AssetStatuses = () => (
  <div style={wrap}>
    <StatusBadge status="in_stock" />
    <StatusBadge status="reserved" />
    <StatusBadge status="deployed" />
    <StatusBadge status="maintenance" />
    <StatusBadge status="retired" />
    <StatusBadge status="lost" />
  </div>
);

export const TicketStatuses = () => (
  <div style={wrap}>
    <StatusBadge status="open" />
    <StatusBadge status="resolved" />
  </div>
);
