import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Laptop, Users, KeyRound, Wrench, BarChart3, Settings,
  LogOut, Search, Bell, Webhook,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { Button } from './ui/button';
import { clearSession, getCurrentUser } from '@/lib/api';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/assets', label: 'Assets', icon: Laptop },
  { to: '/licenses', label: 'Licenses', icon: KeyRound },
  { to: '/users', label: 'People', icon: Users },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/integrations', label: 'Integrations', icon: Webhook },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Layout() {
  const navigate = useNavigate();
  const user = getCurrentUser();

  const logout = () => {
    clearSession();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-muted/30">
      <aside className="w-60 shrink-0 border-r bg-background flex flex-col">
        <div className="h-14 flex items-center gap-2 px-5 border-b">
          <div className="w-7 h-7 rounded-md bg-slate-900 flex items-center justify-center">
            <span className="text-cyan-400 font-bold text-xs tracking-tight">BM</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-semibold text-sm">BMAG</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">ITAM</span>
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t">
          {user && (
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <Avatar name={user.name} color={user.avatar_color} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{user.name}</div>
                <div className="text-xs text-muted-foreground truncate">{user.title || user.role}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={logout} title="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center justify-between px-6 border-b bg-background">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Search assets, people, or licenses…</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon"><Bell className="h-4 w-4" /></Button>
          </div>
        </header>
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
