import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Loader2 } from 'lucide-react';
import { fetchMe } from '@/lib/api';
import { Button } from '@/components/ui/button';

export function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err) setError(err);
    // Already signed in? (also covers bypass dev mode, where the server returns a dev admin.)
    fetchMe().then(() => navigate('/')).catch(() => { /* stay on login */ });
  }, [navigate]);

  const signIn = () => {
    setLoading(true);
    // Full navigation: the server 302-redirects to Entra's authorize endpoint.
    window.location.href = '/api/auth/login?returnTo=/';
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
          <p className="text-sm text-muted-foreground mb-8">Continue with your Bob Moore work account.</p>
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
          <Button
            variant="outline"
            size="lg"
            className="w-full justify-start gap-3 h-12"
            disabled={loading}
            onClick={signIn}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span
                className="w-5 h-5 rounded-sm flex items-center justify-center text-white text-[10px] font-bold"
                style={{ backgroundColor: '#0078D4' }}
              >
                M
              </span>
            )}
            <span>Continue with Microsoft</span>
          </Button>
          <p className="text-xs text-muted-foreground mt-8">
            You&apos;ll be redirected to Microsoft Entra ID to authenticate with your
            Bob Moore credentials, then returned here.
          </p>
        </div>
      </div>
    </div>
  );
}
