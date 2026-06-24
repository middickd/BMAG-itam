import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Assets } from './pages/Assets';
import { AssetDetail } from './pages/AssetDetail';
import { Inventory } from './pages/Inventory';
import { Loaners } from './pages/Loaners';
import { Licenses } from './pages/Licenses';
import { LicenseDetail } from './pages/LicenseDetail';
import { People } from './pages/People';
import { PersonDetail } from './pages/PersonDetail';
import { Maintenance } from './pages/Maintenance';
import { Reports } from './pages/Reports';
import { Integrations } from './pages/Integrations';
import { Settings } from './pages/Settings';
import { fetchMe } from './lib/api';

function RequireAuth({ children }: { children: JSX.Element }) {
  const location = useLocation();
  const [state, setState] = useState<'loading' | 'authed' | 'anon'>('loading');
  useEffect(() => {
    // The session cookie is the source of truth; confirm it with the server. In bypass
    // (dev) mode the server returns a dev admin, so this resolves without any SSO round-trip.
    fetchMe().then(() => setState('authed')).catch(() => setState('anon'));
  }, []);
  if (state === 'loading') return null;
  if (state === 'anon') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/assets/:id" element={<AssetDetail />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/loaners" element={<Loaners />} />
        <Route path="/licenses" element={<Licenses />} />
        <Route path="/licenses/:id" element={<LicenseDetail />} />
        <Route path="/users" element={<People />} />
        <Route path="/users/:id" element={<PersonDetail />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
