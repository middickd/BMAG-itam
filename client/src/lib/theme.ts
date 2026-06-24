import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
const KEY = 'bmag-itam-theme';

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolved(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (resolved(theme) === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function getStoredTheme(): Theme {
  return (localStorage.getItem(KEY) as Theme) || 'system';
}

export function initTheme() {
  apply(getStoredTheme());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'system') apply('system');
  });
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState<Theme>(getStoredTheme);
  const update = (t: Theme) => {
    localStorage.setItem(KEY, t);
    apply(t);
    set(t);
  };
  return [theme, update];
}

export function nextTheme(t: Theme): Theme {
  return t === 'light' ? 'dark' : t === 'dark' ? 'system' : 'light';
}

// Listen to storage events from other tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) apply((e.newValue as Theme) || 'system');
  });
}
