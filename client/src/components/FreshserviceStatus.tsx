import { cn, relativeTime } from '@/lib/utils';

export type FreshserviceStatusData = {
  configured: boolean;
  last_sync_at: string | null;
  sync_in_flight: boolean;
  auto_sync_seconds: number;
  last_sync_result: { at: string; ok: boolean; error?: string } | null;
};

export function FreshserviceStatus({ status }: { status?: FreshserviceStatusData }) {
  if (!status || !status.configured) return null;

  const inFlight = status.sync_in_flight;
  const lastFailed = status.last_sync_result && !status.last_sync_result.ok;
  const synced = status.last_sync_at ? relativeTime(status.last_sync_at) : 'never';
  const intervalLabel = status.auto_sync_seconds > 0
    ? `every ${formatInterval(status.auto_sync_seconds)}`
    : 'auto-sync off';

  const tone = inFlight
    ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30'
    : lastFailed
      ? 'bg-destructive/10 text-destructive border-destructive/30'
      : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';

  const dotTone = inFlight
    ? 'bg-blue-500 animate-pulse'
    : lastFailed
      ? 'bg-destructive'
      : 'bg-emerald-500';

  const label = inFlight
    ? 'Syncing from Freshservice…'
    : lastFailed
      ? `FS sync failed${status.last_sync_result?.error ? `: ${status.last_sync_result.error}` : ''}`
      : `FS synced ${synced} · ${intervalLabel}`;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium',
        tone,
      )}
      title={label}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotTone)} />
      {label}
    </div>
  );
}

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}
