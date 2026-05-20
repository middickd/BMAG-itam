import { initials } from '@/lib/utils';

export function Avatar({ name, color, size = 32 }: { name: string; color?: string | null; size?: number }) {
  return (
    <div
      className="inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0"
      style={{
        backgroundColor: color || '#475569',
        width: size,
        height: size,
        fontSize: size * 0.4,
      }}
    >
      {initials(name)}
    </div>
  );
}
