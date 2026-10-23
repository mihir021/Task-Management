import React, { useEffect, useRef, useState } from 'react';
import { Network, RefreshCw } from 'lucide-react';
import { DatabaseStatus } from './DatabaseStatus';
import { KubernetesInventoryView } from './KubernetesInventoryView';
import { isLocalWorkspace, LOCAL_RUNNER_URL, RUNNER_TOKEN_KEY, scriptRequest } from '../lib/scriptTransport';
import type { ScriptDefinition, KubernetesLogSettings } from '../types/scripts';

type Runner = { token: string; home: string; scripts: ScriptDefinition[]; capabilities?: string[] };
export function PortsMonitoringView() {
  const hosted = !isLocalWorkspace(window.location.hostname);
  const apiBase = hosted ? LOCAL_RUNNER_URL : '';
  const token = useRef(hosted ? sessionStorage.getItem(RUNNER_TOKEN_KEY) || '' : '');
  const [runner, setRunner] = useState<Runner | null>(null);
  const [settings, setSettings] = useState<KubernetesLogSettings | null>(null);
  const [pairing, setPairing] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function connect(event?: React.FormEvent) {
    event?.preventDefault();
    const candidate = event ? pairing.trim() : token.current;
    if (hosted && !candidate) return;
    if (hosted && !/^[a-f0-9]{64}$/.test(candidate)) { setError('Paste the full pairing token printed by your runner.'); return; }
    setBusy(true); setError('');
    try {
      const data = await scriptRequest<Runner>(apiBase, candidate, '');
      token.current = data.token;
      if (hosted) sessionStorage.setItem(RUNNER_TOKEN_KEY, data.token);
      const preset = data.scripts.find(item => item.kubernetes)?.kubernetes;
      setSettings({ ...preset, action: 'inspect', kubeconfig: preset?.kubeconfig || `${data.home}/TEMP/k8s-readonly-user-raylife`, namespace: preset?.namespace || 'default', podPrefix: 'ray-', container: '', filter: 'all', pattern: '', since: '10m', tail: 200, follow: false, reconnect: false });
      setRunner(data); setPairing('');
    } catch (problem: any) { setError(problem.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { void connect(); }, []);
  return <div className="space-y-5">
    <header className="rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white p-6 sm:p-8">
      <p className="text-[10px] uppercase tracking-[0.22em] text-indigo-300 mb-3">Ray operations</p>
      <h1 className="text-3xl font-semibold flex items-center gap-3"><Network className="text-indigo-400" />Ports Monitoring</h1>
      <p className="text-sm text-slate-300 mt-3">Follow your apps from Kubernetes services to ports and pods. Updates automatically every 30 seconds.</p>
      <p className="mt-5 text-xs text-slate-300">Ray app → Controller · Job app → Job service · Gateway → Gateway service · Hub app → Hub service</p>
    </header>
    <DatabaseStatus />
    <section aria-label="Ports runner connection" className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">{runner ? 'Local runner connected' : 'Connect your local runner'}</h2><p className="text-xs text-slate-500 mt-1">Read-only cluster access. Your kubeconfig stays on this computer.</p></div>{runner && <div className="flex gap-4"><button onClick={() => connect()} disabled={busy} className="text-xs text-indigo-500 flex items-center gap-2"><RefreshCw size={14} />Check connection</button><button className="text-xs text-slate-500 underline" onClick={() => { token.current = ''; sessionStorage.removeItem(RUNNER_TOKEN_KEY); setRunner(null); setSettings(null); }}>Disconnect</button></div>}</div>
      {!runner && hosted && <><pre className="bg-slate-950 text-slate-200 p-3 rounded-lg text-xs overflow-x-auto">{'cd /home/mihir-rathod/antigravity/MIHIR-Workspace\n./scripts/start-terminal-runner.sh'}</pre><form onSubmit={connect} className="flex flex-wrap items-end gap-3"><label className="flex-1 text-xs">Pairing token<input type="password" aria-label="Local runner pairing token" autoComplete="off" value={pairing} onChange={event => setPairing(event.target.value)} className="block w-full mt-1 border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent px-3 py-2" /></label><button disabled={busy} className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm">{busy ? 'Connecting…' : 'Connect local runner'}</button></form><p className="text-xs text-slate-500">Uses the same pairing as Scripts in this tab. Keep the runner terminal open.</p></>}
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    </section>
    {settings && runner && <KubernetesInventoryView apiBase={apiBase} token={token} initialSettings={settings} connected supported={Boolean(runner.capabilities?.includes('kubernetes-inventory-v1'))} mapped />}
  </div>;
}
