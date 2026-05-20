import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Assets } from './pages/Assets';
import { AssetDetail } from './pages/AssetDetail';
import { Licenses } from './pages/Licenses';
import { LicenseDetail } from './pages/LicenseDetail';
import { People } from './pages/People';
import { PersonDetail } from './pages/PersonDetail';
import { Maintenance } from './pages/Maintenance';
import { Reports } from './pages/Reports';
import { Integrations } from './pages/Integrations';
import { Settings } from './pages/Settings';
import { getCurrentUser, getToken, setSession } from './lib/api';

const AUTH_MODE = (import.meta.env.VITE_AUTH_MODE as string) || 'sso';

function RequireAuth({ children }: { children: JSX.Element }) {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (AUTH_MODE === 'bypass' && !getToken()) {
      // Auto-login: fetch admin via SSO mock provider
      fetch('/api/auth/sso/okta', { method: 'POST' })
        .then((r) => r.json())
        .then((data) => {
          setSession(data.token, data.user);
          setReady(true);
        });
    } else {
      setReady(true);
    }
  }, []);
  if (!ready) return null;
  const token = getToken();
  const user = getCurrentUser();
  if (!token || !user) {
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
