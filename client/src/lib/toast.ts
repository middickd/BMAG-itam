import { useEffect, useState } from 'react';

export type ToastKind = 'success' | 'error' | 'info';
export type Toast = {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
};

type Listener = (toasts: Toast[]) => void;

let nextId = 1;
let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const fn of listeners) fn(toasts);
}

function push(kind: ToastKind, title: string, description?: string) {
  const id = nextId++;
  toasts = [...toasts, { id, kind, title, description }];
  emit();
  setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500);
  return id;
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (title: string, description?: string) => push('success', title, description),
  error: (title: string, description?: string) => push('error', title, description),
  info: (title: string, description?: string) => push('info', title, description),
};

export function fromError(err: unknown, fallback = 'Something went wrong') {
  const msg = err instanceof Error ? err.message : String(err);
  return toast.error(fallback, msg);
}

export function useToasts() {
  const [list, setList] = useState<Toast[]>(toasts);
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return list;
}
