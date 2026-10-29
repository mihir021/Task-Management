import { CornerWeb, SpiderMask } from '../../../src/workspace/SpiderArtwork';
import { RUNNER_TOKEN_KEY } from '../lib/scriptTransport';
import React, { createContext, useEffect, useState } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck, Layers3 } from 'lucide-react';

export const WorkspaceLockContext = createContext<(() => Promise<void>) | null>(null);

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        if (!response.ok) throw new Error('Workspace sign-in is unavailable. Please try again.');
        const session = await response.json();
        if (active) { setUnlocked(session.authenticated === true); if (!session.configured) setError('Workspace setup needs a session secret in Vercel.'); }
      } catch (problem: any) { if (active) setError(problem.message); }
      finally { if (active) setChecking(false); }
    };
    void check();
    const interval = window.setInterval(check, 60000);
    return () => { active = false; clearInterval(interval); };
  }, []);
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Unable to unlock workspace.');
      setPassword(''); setUnlocked(true);
    } catch (problem: any) { setError(problem.message); }
    finally { setBusy(false); }
  }
  async function lock() {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Unable to lock the workspace. Please try again.');
      sessionStorage.removeItem(RUNNER_TOKEN_KEY);
      setUnlocked(false); setPassword(''); setError('');
    } catch (problem: any) { window.alert(problem.message); }
  }
  if (unlocked) return <WorkspaceLockContext.Provider value={lock}>{children}</WorkspaceLockContext.Provider>;
  return <main className="thread-login min-h-screen bg-slate-950 text-white grid lg:grid-cols-2">
    <section className="hidden lg:flex flex-col justify-between p-14 bg-gradient-to-br from-indigo-600 via-indigo-800 to-slate-950"><CornerWeb className="login-corner-web" /><div className="login-hanging-mask" aria-hidden="true"><SpiderMask /></div>
      <div className="font-semibold flex items-center gap-3"><span className="login-brand-icon"><SpiderMask /></span>MIHIR Workspace</div>
      <div><span className="text-xs uppercase tracking-[0.24em] text-indigo-200">THE DAILY THREAD / PRIVATE EDITION</span><h1 className="text-5xl font-semibold leading-tight mt-5 max-w-lg">Behind every<br />great hero,<br /><em>a great plan.</em></h1><p className="text-indigo-200 mt-6 max-w-md leading-relaxed">Your friendly neighborhood engineering desk. Track the mission, untangle the code, and make your next move.</p></div>
      <div className="login-workflow" aria-hidden="true"><span>01 <b>Plan</b></span><i /><span>02 <b>Build</b></span><i /><span>03 <b>Ship</b></span></div><p className="text-sm text-indigo-200 flex gap-2 items-center"><ShieldCheck size={17} />Private workspace · Password protected</p>
    </section>
    <section className="flex items-center justify-center px-6 py-12"><div className="w-full max-w-sm">
      <div className="bg-indigo-500/10 border border-indigo-400/20 rounded-2xl w-14 h-14 grid place-items-center mb-8"><LockKeyhole className="text-indigo-300" /></div>
      <p className="text-indigo-300 text-xs font-medium uppercase tracking-widest mb-3">MIHIR Workspace</p><h2 className="text-3xl font-semibold">Welcome back, Mihir</h2><p className="text-slate-400 text-sm mt-3 mb-8">Enter your password to open your workspace.</p>
      <form onSubmit={login} className="space-y-5"><label className="block text-sm text-slate-300">Workspace password<input autoFocus required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="block mt-2 w-full bg-slate-900 border border-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 px-4 py-3 rounded-xl" placeholder="Enter your password" /></label>
      {error && <p role="alert" className="text-rose-300 bg-rose-950/40 rounded-xl p-3 text-sm">{error}</p>}
      <button disabled={busy || checking} className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 rounded-xl px-4 py-3 flex items-center justify-center gap-3 font-medium">{checking ? 'Checking session…' : busy ? 'Unlocking…' : 'Unlock workspace'}<ArrowRight size={18} /></button></form>
      <p className="text-xs text-slate-500 mt-6">Your session lasts up to 12 hours. Lock your workspace whenever you step away.</p>
    </div></section>
  </main>;
}
