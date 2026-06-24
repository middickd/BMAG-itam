import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { dismiss, useToasts, type Toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
} as const;

const TONES = {
  success: 'border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 [&_svg]:text-emerald-600 dark:[&_svg]:text-emerald-400',
  error: 'border-red-500/30 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-100 [&_svg]:text-red-600 dark:[&_svg]:text-red-400',
  info: 'border-blue-500/30 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 [&_svg]:text-blue-600 dark:[&_svg]:text-blue-400',
} as const;

export function Toaster() {
  const toasts = useToasts();
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)] pointer-events-none">
      {toasts.map((t) => (
        <Item key={t.id} toast={t} />
      ))}
    </div>
  );
}

function Item({ toast }: { toast: Toast }) {
  const Icon = ICONS[toast.kind];
  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-lg border p-3 shadow-lg',
        'animate-in slide-in-from-right-5 fade-in duration-200',
        TONES[toast.kind]
      )}
      role="status"
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{toast.title}</div>
        {toast.description && (
          <div className="text-xs opacity-80 mt-0.5 break-words">{toast.description}</div>
        )}
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        className="opacity-60 hover:opacity-100 shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
