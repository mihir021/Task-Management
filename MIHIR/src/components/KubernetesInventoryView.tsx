import React, { useEffect, useRef, useState } from 'react';
import { Activity, CheckCircle2, ChevronDown, Clock3, Copy, Network, Pause, Play, RefreshCw, Settings2, TriangleAlert } from 'lucide-react';
import type { KubernetesLogSettings } from '../types/scripts';
import type { KubernetesInventory } from '../types/kubernetesInventory';
import { scriptRequest } from '../lib/scriptTransport';
import { PORT_MAPPINGS, mappedInventory, matchesPortService } from '../lib/portMappings';
import { startInventoryPolling } from '../lib/inventoryPolling';

function age(created: string | null, now: number) {
  if (!created) return '—';
  const seconds = Math.max(0, Math.floor((now - Date.parse(created)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
  return `${Math.floor(seconds / 86400)}d`;
}
const tones = {
  healthy: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  starting: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  error: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  terminating: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  completed: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
};

export function KubernetesInventoryView({ apiBase, token, initialSettings, connected, supported, mapped = false }: {
  apiBase: string; token: React.MutableRefObject<string>; initialSettings: KubernetesLogSettings;
  connected: boolean; supported: boolean; mapped?: boolean;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [form, setForm] = useState(initialSettings);
  const [inventory, setSnapshot] = useState<KubernetesInventory | null>(null);
  const [selected, setSelected] = useState('');
  const snapshot = inventory && mapped ? mappedInventory(inventory, selected) : inventory;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState('');
  const polling = useRef<ReturnType<typeof startInventoryPolling<KubernetesInventory>> | null>(null);
  const settingsKey = JSON.stringify(settings);
  useEffect(() => {
    if (!connected || !supported) return;
    setSnapshot(null); setError(''); setAutomatic(true);
    const poll = startInventoryPolling<KubernetesInventory>({
      read: signal => scriptRequest(apiBase, token.current, '/kubernetes/inspect', 'POST', { settings }, AbortSignal.any([signal, AbortSignal.timeout(15000)])),
      onResult: value => { setSnapshot(value); setError(''); },
      onError: problem => setError(problem instanceof Error ? problem.message : 'Unable to refresh Kubernetes. Check your local runner.'),
      onBusy: setBusy, onSchedule: setDeadline,
    });
    polling.current = poll;
    return () => { poll.stop(); polling.current = null; };
  }, [apiBase, connected, supported, settingsKey]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  function toggle() {
    if (automatic) polling.current?.pause(); else polling.current?.resume();
    setAutomatic(value => !value);
  }
  async function copy(name: string) {
    try { await navigator.clipboard.writeText(name); setCopied(name); setTimeout(() => setCopied(''), 2000); }
    catch { setError('Copy failed. Select and copy the pod name directly.'); }
  }
  const healthy = snapshot?.pods.filter(pod => pod.health === 'healthy').length || 0;
  const issues = snapshot?.pods.filter(pod => pod.health !== 'healthy' && pod.health !== 'completed').length || 0;
  const ready = connected && supported;
  const input = 'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm mt-1';
  return <section aria-label="Live pods and ports" className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden scroll-mt-20">
    <header className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-indigo-500 mb-2">Kubernetes · read only</p><h2 className="text-xl font-semibold flex items-center gap-2"><Network size={21} className="text-indigo-500" />Live pods &amp; ports</h2><p className="text-sm text-slate-500 mt-2"><span className="font-mono text-slate-700 dark:text-slate-300">{mapped ? '4 application services' : settings.podPrefix}</span> <span className="mx-1">/</span> {settings.namespace} namespace</p></div>
        <div className="flex gap-2"><button disabled={!ready} onClick={toggle} className="flex items-center gap-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 disabled:opacity-40">{automatic ? <Pause size={14} /> : <Play size={14} />}{automatic ? 'Pause refresh' : 'Resume refresh'}</button><button disabled={!ready || busy} onClick={() => polling.current?.refresh()} className="flex items-center gap-2 text-xs rounded-lg bg-indigo-600 text-white px-3 py-2 disabled:opacity-40"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} />Refresh now</button></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
        <span className={`flex items-center gap-2 ${error ? 'text-rose-600 dark:text-rose-300' : ready ? 'text-emerald-600 dark:text-emerald-400' : ''}`}><span className={`h-2 w-2 rounded-full ${error ? 'bg-rose-500' : ready ? 'bg-emerald-500' : 'bg-slate-400'}`} />{!ready ? 'Waiting for local runner' : busy ? 'Refreshing…' : error ? snapshot ? 'Refresh failed · previous data kept' : 'Could not load cluster data' : automatic ? 'Auto refresh · every 30 seconds' : 'Auto refresh paused'}</span>
        {snapshot && <span className="flex gap-1.5 items-center"><Clock3 size={13} />Updated {new Date(snapshot.observedAt).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata' })} IST</span>}
        {ready && automatic && deadline && !busy && <span>Next refresh in {Math.max(0, Math.ceil((deadline - now) / 1000))}s</span>}
      </div>
      <details className="mt-4"><summary className="cursor-pointer text-xs text-slate-500 flex items-center gap-2 w-fit"><Settings2 size={13} />Connection settings<ChevronDown size={12} /></summary><form className="mt-3 grid sm:grid-cols-2 gap-3" onSubmit={event => { event.preventDefault(); if (JSON.stringify(form) === settingsKey) void polling.current?.refresh(); else setSettings({ ...form }); }}>
        <label className="text-xs sm:col-span-2">Kubeconfig path<input required className={`${input} font-mono`} value={form.kubeconfig} onChange={event => setForm({ ...form, kubeconfig: event.target.value })} /></label>
        <label className="text-xs">Namespace<input required className={input} value={form.namespace} onChange={event => setForm({ ...form, namespace: event.target.value })} /></label>{!mapped && <label className="text-xs">Pod name prefix<input required className={input} value={form.podPrefix} onChange={event => setForm({ ...form, podPrefix: event.target.value })} /></label>}
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3"><button className="rounded-lg px-3 py-2 bg-indigo-600 text-white text-xs">Apply &amp; refresh</button><span className="text-xs text-slate-500">Uses the runner’s current user. Kubeconfig stays on this computer.</span></div>
      </form></details>
    </header>
    {!connected && <p className="p-6 text-sm text-slate-500">Connect your local terminal above to load pods and ports. This view will refresh automatically every 30 seconds.</p>}
    {connected && !supported && <div role="alert" className="p-6 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-sm"><p className="font-medium">Restart your local runner to enable live tables.</p><p className="mt-2">Stop the old runner with Ctrl+C, run <code>./scripts/start-terminal-runner.sh</code> again from the workspace folder, and reconnect using its new token.</p></div>}
    {error && <div role="alert" className="m-5 p-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-sm flex items-start gap-2"><TriangleAlert size={17} className="shrink-0 mt-0.5" /><div><p>{error}</p>{snapshot && <p className="text-xs mt-2">Showing the last successful snapshot. These rows may be out of date.</p>}</div></div>}
    {ready && !snapshot && !error && <p role="status" className="p-8 text-sm text-slate-500">Loading pod status and service ports…</p>}
    {mapped && <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800">
      <div className="flex justify-between items-center mb-3"><h3 className="font-medium text-sm">Application → service → port</h3><button onClick={() => setSelected('')} className={`text-xs px-3 py-1.5 rounded-lg ${!selected ? 'bg-indigo-600 text-white' : 'text-indigo-500 border border-indigo-200 dark:border-indigo-900'}`}>Show all apps</button></div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{PORT_MAPPINGS.map(mapping => {
        const pods = inventory?.pods.filter(pod => matchesPortService(pod.name, mapping.service)) || [];
        const service = inventory?.services.find(item => item.name === mapping.service);
        const healthy = pods.filter(pod => pod.health === 'healthy').length;
        return <button key={mapping.service} aria-pressed={selected === mapping.service} onClick={() => setSelected(selected === mapping.service ? '' : mapping.service)} className={`text-left rounded-xl border p-4 ${selected === mapping.service ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'}`}>
          <span className="text-sm font-semibold block">{mapping.app}</span><span className="font-mono text-[11px] text-slate-500 block mt-2 break-all">{mapping.service}</span>
          <span className="block text-xs mt-3 font-mono">{service ? service.ports.map(port => `${port.nodePort ? `${port.nodePort} → ` : ''}${port.port} → ${port.targetPort}/${port.protocol}`).join(', ') : inventory ? 'Service not found' : 'Waiting for cluster…'}</span>
          <span className={`block text-xs mt-3 ${inventory && healthy !== pods.length ? 'text-amber-600' : 'text-emerald-600 dark:text-emerald-400'}`}>{inventory ? `${healthy}/${pods.length} pods ready` : 'Not loaded'}</span>
        </button>;
      })}</div><p className="text-xs text-slate-500 mt-3">Port mapping: NodePort → service port → target port. Select an app to filter its pods and services. Internal and headless services appear in the table below.</p>
    </div>}
    {snapshot && <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-5 sm:px-6 py-5">
        {[[Activity, 'Pods', snapshot.pods.length], [CheckCircle2, 'Ready', healthy], [TriangleAlert, 'Need attention', issues], [Network, 'Services', snapshot.services.length]].map(([Icon, title, value]) => {
          const MetricIcon = Icon as typeof Activity;
          return <div key={String(title)} className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-3"><p className="text-xs text-slate-500 flex items-center gap-2"><MetricIcon size={14} />{String(title)}</p><p className={`text-2xl font-semibold mt-2 ${title === 'Need attention' && issues > 0 ? 'text-amber-600' : ''}`}>{String(value)}</p></div>;
        })}
      </div>
      <div className="px-5 sm:px-6 pb-6 space-y-6">
        <div><h3 className="font-medium text-sm mb-3">Pods <span className="text-slate-400 font-normal">· current snapshot</span></h3><div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-xs text-left whitespace-nowrap"><thead className="bg-slate-50 dark:bg-slate-950 text-slate-500"><tr>{['Pod name', 'Ready', 'Status', 'Restarts', 'Age', 'Pod IP', 'Container ports'].map(title => <th key={title} className="px-4 py-3 font-medium">{title}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{snapshot.pods.map(pod => <tr key={pod.uid || pod.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
            <td className="px-4 py-3.5"><span className="font-mono text-slate-800 dark:text-slate-200 select-text">{pod.name}</span><button aria-label={`Copy ${pod.name}`} onClick={() => copy(pod.name)} className="ml-2 text-slate-400 hover:text-indigo-500">{copied === pod.name ? <CheckCircle2 size={12} /> : <Copy size={12} />}</button></td>
            <td className="px-4 py-3.5 font-mono">{pod.ready}/{pod.total}</td><td className="px-4 py-3.5"><span className={`rounded-full px-2 py-1 text-[11px] font-medium ${tones[pod.health]}`}>{pod.status}{pod.status === 'Running' && pod.health === 'starting' ? ' · not ready' : ''}</span></td>
            <td className={`px-4 py-3.5 font-mono ${pod.restarts > 0 ? 'text-amber-600' : 'text-slate-500'}`}>{pod.restarts}</td><td className="px-4 py-3.5 text-slate-500" title={pod.createdAt || ''}>{age(pod.createdAt, now)}</td><td className="px-4 py-3.5 font-mono text-slate-500">{pod.ip || '—'}</td><td className="px-4 py-3.5 font-mono">{pod.ports.map(port => `${port.port}/${port.protocol}`).join(', ') || 'Not declared'}</td>
          </tr>)}{!snapshot.pods.length && <tr><td colSpan={7} className="p-7 text-center text-slate-500">No pods match <code>{settings.podPrefix}</code> in <code>{settings.namespace}</code>.</td></tr>}</tbody></table>
        </div></div>
        <div><h3 className="font-medium text-sm mb-3">Service ports</h3><div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800"><table className="w-full text-xs text-left whitespace-nowrap"><thead className="bg-slate-50 dark:bg-slate-950 text-slate-500"><tr>{['Service', 'Type', 'Service port', 'Target port', 'NodePort', 'Cluster IP'].map(title => <th key={title} className="px-4 py-3 font-medium">{title}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{snapshot.services.flatMap(service => service.ports.map((port, index) => <tr key={`${service.name}-${index}`}><td className="px-4 py-3.5 font-mono">{service.name}</td><td className="px-4 py-3.5 text-slate-500">{service.type}</td><td className="px-4 py-3.5 font-mono font-medium text-indigo-600 dark:text-indigo-300">{port.port}/{port.protocol}</td><td className="px-4 py-3.5 font-mono">{port.targetPort}</td><td className="px-4 py-3.5 font-mono">{port.nodePort ?? '—'}</td><td className="px-4 py-3.5 font-mono text-slate-500">{service.clusterIP || '—'}</td></tr>))}{!snapshot.services.length && <tr><td colSpan={6} className="p-6 text-slate-500 text-center">No matching services found. Service names and pod selectors are checked.</td></tr>}</tbody></table></div></div>
        {snapshot.endpoints.length > 0 && <details><summary className="text-xs text-slate-500 cursor-pointer">Endpoints · {snapshot.endpoints.length} addresses</summary><div className="flex flex-wrap gap-2 mt-3">{snapshot.endpoints.map((endpoint, index) => <span key={`${endpoint.service}-${endpoint.address}-${index}`} className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono">{endpoint.service} <span className="text-slate-500">{endpoint.address} · {endpoint.ports.join(', ')} · {endpoint.ready === false ? 'not ready' : endpoint.ready === true ? 'ready' : 'readiness unknown'}</span></span>)}</div></details>}
        {snapshot.warnings.map(warning => <p key={warning} className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">{warning}</p>)}
      </div>
    </>}
  </section>;
}
