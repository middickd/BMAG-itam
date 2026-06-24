import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Laptop, User, KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Hit = {
  kind: 'asset' | 'user' | 'license';
  id: string;
  title: string;
  subtitle: string;
  to: string;
};

const ICONS = { asset: Laptop, user: User, license: KeyRound };

export function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<{ assets: any[]; users: any[]; licenses: any[] }>(
      `/search?q=${encodeURIComponent(debounced)}`,
    ),
    enabled: debounced.length > 0,
    staleTime: 10_000,
  });

  const hits = useMemo<Hit[]>(() => {
    if (!data) return [];
    return [
      ...data.assets.map((a) => ({
        kind: 'asset' as const,
        id: a.id,
        title: `${a.asset_tag} — ${a.model}`,
        subtitle: [a.manufacturer, a.category, a.status].filter(Boolean).join(' · '),
        to: `/assets/${a.id}`,
      })),
      ...data.users.map((u) => ({
        kind: 'user' as const,
        id: u.id,
        title: u.name,
        subtitle: [u.title, u.department, u.email].filter(Boolean).join(' · '),
        to: `/users/${u.id}`,
      })),
      ...data.licenses.map((l) => ({
        kind: 'license' as const,
        id: l.id,
        title: l.software_name,
        subtitle: `${l.publisher || ''} · ${l.seats_used}/${l.seats} seats`,
        to: `/licenses/${l.id}`,
      })),
    ];
  }, [data]);

  useEffect(() => setActive(0), [debounced]);

  const choose = (h: Hit) => {
    navigate(h.to);
    setOpen(false);
    setQ('');
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (hits[active]) choose(hits[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative flex-1 max-w-xl">
      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Search assets, people, or licenses…"
        className="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-12 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
      />
      <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground border rounded px-1.5 py-0.5 pointer-events-none">
        Ctrl K
      </kbd>

      {open && debounced && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border bg-popover text-popover-foreground shadow-lg overflow-hidden max-h-[70vh] overflow-y-auto">
          {isFetching && !data && (
            <div className="px-3 py-6 text-sm text-muted-foreground text-center">Searching…</div>
          )}
          {data && hits.length === 0 && (
            <div className="px-3 py-6 text-sm text-muted-foreground text-center">
              No matches for <span className="font-medium">"{debounced}"</span>
            </div>
          )}
          {hits.length > 0 && (
            <Group title="Assets" hits={hits.filter((h) => h.kind === 'asset')} all={hits} active={active} setActive={setActive} choose={choose} />
          )}
          {hits.length > 0 && (
            <Group title="People" hits={hits.filter((h) => h.kind === 'user')} all={hits} active={active} setActive={setActive} choose={choose} />
          )}
          {hits.length > 0 && (
            <Group title="Licenses" hits={hits.filter((h) => h.kind === 'license')} all={hits} active={active} setActive={setActive} choose={choose} />
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  title, hits, all, active, setActive, choose,
}: {
  title: string; hits: Hit[]; all: Hit[]; active: number;
  setActive: (i: number) => void; choose: (h: Hit) => void;
}) {
  if (hits.length === 0) return null;
  return (
    <div>
      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      {hits.map((h) => {
        const Icon = ICONS[h.kind];
        const idx = all.indexOf(h);
        return (
          <button
            key={`${h.kind}-${h.id}`}
            onMouseEnter={() => setActive(idx)}
            onClick={() => choose(h)}
            className={cn(
              'w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm',
              idx === active ? 'bg-accent' : 'hover:bg-accent/60'
            )}
          >
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="truncate">{h.title}</div>
              <div className="text-xs text-muted-foreground truncate">{h.subtitle}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
