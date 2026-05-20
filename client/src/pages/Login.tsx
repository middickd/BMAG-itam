import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Loader2 } from 'lucide-react';
import { api, getToken, setSession } from '@/lib/api';
import { Button } from '@/components/ui/button';

type Provider = { id: string; name: string; color: string };

export function Login() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    if (getToken()) {
      navigate('/');
      return;
    }
    api.get<{ providers: Provider[] }>('/auth/providers').then((d) => setProviders(d.providers));
  }, [navigate]);

  const signIn = async (providerId: string) => {
    setLoading(providerId);
    try {
      await new Promise((r) => setTimeout(r, 500));
      const data = await api.post<{ token: string; user: any }>(`/auth/sso/${providerId}`);
      setSession(data.token, data.user);
      navigate('/');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="hidden lg:flex flex-1 bg-slate-900 text-white flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
            <span className="text-cyan-400 font-bold tracking-tight">BM</span>
          </div>
          <div>
            <div className="font-semibold">BMAG</div>
            <div className="text-xs uppercase tracking-wider text-slate-400">IT Asset Management</div>
          </div>
        </div>
        <div className="space-y-6 max-w-md">
          <h1 className="text-4xl font-bold leading-tight">
            Every laptop, license, and lifecycle &mdash; in one place.
          </h1>
          <p className="text-slate-300">
            Track hardware, manage software entitlements, run check-out workflows, and
            stay ahead of warranties &mdash; all from a single source of truth.
          </p>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <div><div className="text-2xl font-semibold text-white">140+</div>devices tracked</div>
            <div><div className="text-2xl font-semibold text-white">12</div>software stacks</div>
            <div><div className="text-2xl font-semibold text-white">99.9%</div>compliance</div>
          </div>
        </div>
        <p className="text-xs text-slate-500">© BMAG. Demo build.</p>
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center">
              <span className="text-cyan-400 font-bold">BM</span>
            </div>
            <div className="font-semibold">BMAG ITAM</div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Shield className="h-4 w-4" /> Single sign-on
          </div>
          <h2 className="text-2xl font-semibold tracking-tight mb-1">Sign in to BMAG ITAM</h2>
          <p className="text-sm text-muted-foreground mb-8">Continue with your enterprise identity provider.</p>
          <div className="space-y-2">
            {providers.map((p) => (
              <Button
                key={p.id}
                variant="outline"
                size="lg"
                className="w-full justify-start gap-3 h-12"
                disabled={!!loading}
                onClick={() => signIn(p.id)}
              >
                {loading === p.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span
                    className="w-5 h-5 rounded-sm flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name[0]}
                  </span>
                )}
                <span>Continue with {p.name}</span>
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-8">
            This is a mock SSO/SAML flow for demonstration. In production, the button would
            redirect to your IdP&apos;s authorization endpoint and consume the SAMLResponse on return.
          </p>
        </div>
      </div>
    </div>
  );
}
