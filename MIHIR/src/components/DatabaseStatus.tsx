import React, { useEffect, useState } from 'react';
import { Database, RefreshCw } from 'lucide-react';

export function DatabaseStatus() {
  const [status, setStatus] = useState<{ connected: boolean; persistent: boolean; provider: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    try {
      const response = await fetch('/api/health/database', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      const value = await response.json();
      setStatus({ connected: response.ok && value.connected === true, persistent: value.persistent === true, provider: value.provider || 'unknown', message: value.message || value.error || 'Database unavailable' });
    } catch { setStatus({ connected: false, persistent: false, provider: 'unknown', message: 'Unable to reach the database status endpoint.' }); }
    finally { setBusy(false); }
  }
  useEffect(() => { void check(); }, []);
  return <div className={`rounded-xl border p-4 text-sm ${status?.connected ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900' : 'border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900'}`}>
    <div className="flex items-center justify-between gap-3"><h3 className="font-medium flex gap-2 items-center"><Database size={16} />{busy ? 'Checking database…' : status?.message}</h3><button aria-label="Check database connection" disabled={busy} onClick={check} className="p-2 rounded-lg hover:bg-black/5"><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /></button></div>
    {status && <p className="text-xs mt-2 opacity-75">Storage: {status.provider} · {status.connected && status.persistent ? 'Persistent storage verified' : 'Connection not verified'}</p>}
    {status && !status.connected && <p className="text-xs mt-3">Cloud setup: create a Turso database, add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to your Vercel environment, then redeploy. Keep these values in server settings.</p>}
  </div>;
}
