import React, { useEffect, useRef, useState } from 'react';
import { Network, Play, Pause, RefreshCw, Check, Copy, Terminal, ShieldCheck, Square, ChevronDown } from 'lucide-react';
import { SpiderMark } from './SpiderMark';
import { isLocalWorkspace, LOCAL_RUNNER_URL, RUNNER_TOKEN_KEY, scriptRequest } from '../lib/scriptTransport';
import { PORT_MAPPINGS, mappedInventory } from '../lib/portMappings';
import { inventoryCommandPreview } from '../lib/inventoryCommands';
import { startInventoryPolling } from '../lib/inventoryPolling';
import type { KubernetesInventory } from '../types/kubernetesInventory';
import type { KubernetesLogSettings } from '../types/scripts';

type Connection = { token: string; home: string; capabilities?: string[] };
type Result = { data?: KubernetesInventory; error?: string };
const defaultPath = '/home/mihir-rathod/TEMP/k8s-readonly-user-raylife';
const settingsFor = (kubeconfig: string, namespace: string, podPrefix: string): KubernetesLogSettings => ({ action: 'inspect', kubeconfig, namespace, podPrefix, container: '', filter: 'all', pattern: '', since: '10m', tail: 200, follow: false, reconnect: false });
function age(created: string | null) { if (!created) return '—'; const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(created)) / 60000)); return minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${Math.floor(minutes / 1440)}d`; }
export function PortsMonitoringView() {
  const hosted = !isLocalWorkspace(window.location.hostname);
  const apiBase = hosted ? LOCAL_RUNNER_URL : '';
  const token = useRef(hosted ? sessionStorage.getItem(RUNNER_TOKEN_KEY) || '' : '');
  const [connected, setConnected] = useState(false);
  const [pairing, setPairing] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [connectionNote, setConnectionNote] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [kubeconfig, setKubeconfig] = useState(defaultPath);
  const [namespace, setNamespace] = useState('default');
  const [selected, setSelected] = useState<string[]>([]);
  const [applied, setApplied] = useState<{ services: string[]; kubeconfig: string; namespace: string } | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const polling = useRef<ReturnType<typeof startInventoryPolling<Record<string, Result>>> | null>(null);
  async function connect(event?: React.FormEvent) {
    event?.preventDefault();
    const candidate = event ? pairing.trim() : token.current;
    if (hosted && !candidate) return;
    if (hosted && !/^[a-f0-9]{64}$/.test(candidate)) { setConnectionError('Paste the complete pairing token printed by your runner.'); return; }
    setConnecting(true); setConnectionError(''); setConnectionNote('');
    try {
      let data: Connection;
      try { data = await scriptRequest<Connection>(apiBase, candidate, '/connection'); }
      catch {
        try { data = await scriptRequest<Connection>(apiBase, candidate, ''); }
        catch (problem: any) {
          // This exact error is returned only after pairing validation by older runners.
          if (hosted && /EACCES.*definitions\.json/.test(problem.message)) {
            data = { token: candidate, home: '/home/mihir-rathod' };
            setConnectionNote('Connected for port monitoring. Older saved scripts have a file permission issue; they are preserved and do not block this view.');
          } else throw problem;
        }
      }
      token.current = data.token; if (hosted) sessionStorage.setItem(RUNNER_TOKEN_KEY, data.token);
      setConnected(true); setPairing('');
    } catch (problem: any) { setConnectionError(problem.message); }
    finally { setConnecting(false); }
  }
  useEffect(() => { void connect(); }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!applied || !connected) return;
    setAutomatic(true);
    const poll = startInventoryPolling<Record<string, Result>>({
      // Query only the selected applications, sequentially to respect the runner's concurrency limit.
      read: async signal => {
        const values: Record<string, Result> = {};
        for (const service of applied.services) {
          if (signal.aborted) break;
          try {
            const data = await scriptRequest<KubernetesInventory>(apiBase, token.current, '/kubernetes/inspect', 'POST', { settings: settingsFor(applied.kubeconfig, applied.namespace, service) }, AbortSignal.any([signal, AbortSignal.timeout(15000)]));
            values[service] = { data: mappedInventory(data, service) };
          } catch (problem: any) { if (!signal.aborted) values[service] = { error: problem.message }; }
        }
        return values;
      },
      onResult: values => setResults(previous => Object.fromEntries(applied.services.map(service => [service, values[service]?.error ? { ...previous[service], error: values[service].error } : values[service] || previous[service] || {}]))),
      onError: problem => setConnectionError(String(problem)), onBusy: setBusy,
      onSchedule: value => { setDeadline(value); setNow(Date.now()); },
    });
    polling.current = poll;
    return () => { poll.stop(); polling.current = null; };
  }, [applied, connected]);
  const preview = inventoryCommandPreview({ kubeconfig, namespace }, selected);
  const dirty = applied && JSON.stringify(applied) !== JSON.stringify({ services: selected, kubeconfig, namespace });
  const loaded = Object.values(results).flatMap(value => value.data?.pods || []);
  const ready = loaded.filter(pod => pod.health === 'healthy').length;
  function apply() { setResults({}); setApplied({ services: [...selected], kubeconfig, namespace }); }
  function stop() { setApplied(null); setBusy(false); setDeadline(null); }
  return <div className="ports-page space-y-6">
    <header className="web-hero ports-hero">
      <div className="relative z-10"><p className="eyebrow">THE NETWORK DESK / RAY OPERATIONS</p><h1>Every port.<br /><span>One clear picture.</span></h1><p className="hero-description">Pick your apps. Follow the connections. Keep your services in sight.</p><div className="hero-pills"><span><ShieldCheck size={13} />Read-only Kubernetes</span><span><RefreshCw size={13} />30-second refresh</span></div></div>
      <SpiderMark className="hero-spider" />
    </header>
    <section className="surface runner-bar" aria-label="Ports runner connection">
      <div className="flex items-center gap-3"><span className={`connection-dot ${connected ? 'online' : ''}`} /><div><h2 className="font-semibold text-sm">{connected ? 'Local runner connected' : 'Connect your local runner'}</h2><p className="text-xs text-slate-500 mt-1">Your kubeconfig and terminal stay on this computer.</p></div></div>
      {connected ? <button className="quiet-button" onClick={() => { stop(); setConnected(false); token.current = ''; sessionStorage.removeItem(RUNNER_TOKEN_KEY); }}>Disconnect</button> : <details className="w-full sm:w-auto" open={Boolean(connectionError)}><summary className="quiet-button cursor-pointer">Set up connection <ChevronDown size={13} /></summary><div className="mt-4 space-y-3"><pre className="command-code">{'cd /home/mihir-rathod/antigravity/MIHIR-Workspace\n./scripts/start-terminal-runner.sh'}</pre><form onSubmit={connect} className="flex flex-wrap gap-2"><input type="password" aria-label="Local runner pairing token" autoComplete="off" placeholder="Paste runner pairing token" value={pairing} onChange={event => setPairing(event.target.value)} className="field grow" /><button disabled={connecting} className="primary-button">{connecting ? 'Connecting…' : 'Connect runner'}</button></form></div></details>}
      {connectionError && <p role="alert" className="text-sm text-rose-600 w-full">{connectionError}</p>}{connectionNote && <p className="text-xs text-amber-700 dark:text-amber-300 w-full">{connectionNote}</p>}
    </section>
    <section className="surface p-5 sm:p-6" aria-label="Choose applications">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5"><div><p className="eyebrow muted">01 / CHOOSE YOUR WATCHLIST</p><h2 className="text-lg font-semibold mt-1">Which apps are we watching?</h2></div><div className="flex gap-3 text-xs"><button onClick={() => setSelected(PORT_MAPPINGS.map(item => item.service))} className="quiet-button">Select all four</button><button onClick={() => setSelected([])} className="quiet-button">Clear</button></div></div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{PORT_MAPPINGS.map((mapping, index) => <label key={mapping.service} className={`app-choice ${selected.includes(mapping.service) ? 'chosen' : ''}`}><span className="flex justify-between items-center"><span className="app-number">0{index + 1}</span><input type="checkbox" aria-label={`Monitor ${mapping.app}`} checked={selected.includes(mapping.service)} onChange={event => setSelected(previous => event.target.checked ? PORT_MAPPINGS.filter(item => [...previous, mapping.service].includes(item.service)).map(item => item.service) : previous.filter(item => item !== mapping.service))} /></span><span className="block font-semibold mt-4">{mapping.app}</span><span className="block font-mono text-[11px] mt-2 text-slate-500 break-all">{mapping.service}</span></label>)}</div>
      <div className="grid sm:grid-cols-[1fr_200px] gap-3 mt-5"><label className="text-xs text-slate-500">Kubeconfig path<input className="field block w-full mt-1 font-mono" value={kubeconfig} onChange={event => setKubeconfig(event.target.value)} /></label><label className="text-xs text-slate-500">Namespace<input className="field block w-full mt-1" value={namespace} onChange={event => setNamespace(event.target.value)} /></label></div>
      <details className="command-preview mt-5" open><summary className="flex items-center gap-2 text-sm font-medium cursor-pointer"><Terminal size={15} />Commands to run · {selected.length} {selected.length === 1 ? 'app' : 'apps'}</summary><p className="text-xs text-slate-500 my-3">These exact kubectl arguments read namespace JSON. The runner filters names for each chosen service; internal and headless variants stay visible. No cluster changes.</p><pre className="command-code max-h-48 overflow-auto">{preview || '# Choose at least one application above. No commands run until you press Start monitoring.'}</pre>{preview && <button className="quiet-button mt-2" onClick={async () => { try { await navigator.clipboard.writeText(preview); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setConnectionError('Select and copy the commands directly.'); } }}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy commands'}</button>}</details>
      <div className="flex flex-wrap items-center justify-between gap-4 mt-5 pt-5 border-t border-slate-200 dark:border-slate-800"><p className="text-xs text-slate-500">{selected.length} of 4 apps selected{dirty ? ' · changes waiting to apply' : ''}{!connected ? ' · connect the runner to start' : ''}</p><button className="primary-button" disabled={!connected || !selected.length || !kubeconfig.trim() || !namespace.trim() || busy} onClick={apply}><Play size={14} />{applied ? 'Apply selection & refresh' : 'Start monitoring'}</button></div>
    </section>
    {applied ? <>
      <div className="surface flex flex-wrap items-center justify-between p-4 gap-4" aria-label="Monitoring controls"><div className="flex gap-6 text-sm"><span><strong>{ready}/{loaded.length}</strong> pods ready</span><span className="text-slate-500">{applied.services.length} apps · {applied.namespace}</span></div><div className="flex flex-wrap items-center gap-3"><span className="text-xs text-slate-500" role="status">{busy ? 'Reading cluster…' : automatic ? `Auto · next in ${deadline ? Math.min(30, Math.max(0, Math.ceil((deadline - now) / 1000))) : 0}s` : 'Paused'}</span><button className="quiet-button" onClick={() => { automatic ? polling.current?.pause() : polling.current?.resume(); setAutomatic(!automatic); }}>{automatic ? <Pause size={13} /> : <Play size={13} />}{automatic ? 'Pause' : 'Resume'}</button><button disabled={busy} className="quiet-button" onClick={() => polling.current?.refresh()}><RefreshCw size={13} />Refresh now</button><button className="quiet-button" onClick={stop}><Square size={13} />Stop</button></div></div>
      {PORT_MAPPINGS.filter(item => applied.services.includes(item.service)).map(mapping => {
        const result = results[mapping.service]; const data = result?.data;
        return <section key={mapping.service} className="surface app-table overflow-hidden" aria-label={`${mapping.app} ports`}><header className="p-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800"><div><p className="eyebrow muted">{mapping.service}</p><h2 className="text-xl font-semibold mt-1">{mapping.app}</h2></div><span className="text-xs text-slate-500">{data ? `Updated ${new Date(data.observedAt).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata' })} IST` : busy ? 'Loading…' : 'No snapshot yet'}</span></header>
          {result?.error && <p role="alert" className="p-4 text-sm text-rose-600 bg-rose-50 dark:bg-rose-950/30">{result.error}{data ? ' Showing the last successful snapshot; it may be stale.' : ''}</p>}
          {data && <><div className="p-5"><h3 className="table-caption">Service port mappings</h3><div className="overflow-x-auto"><table className="ports-table"><thead><tr>{['Service', 'Type', 'NodePort', 'Service port', 'Target port', 'Protocol'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{data.services.flatMap(service => service.ports.map((port, index) => <tr key={`${service.name}-${index}`}><td className="font-mono">{service.name}</td><td>{service.type}</td><td className="port-accent">{port.nodePort ?? '—'}</td><td>{port.port}</td><td>{port.targetPort}</td><td>{port.protocol}</td></tr>))}{!data.services.length && <tr><td colSpan={6}>No matching services found.</td></tr>}</tbody></table></div></div>
          <div className="px-5 pb-5"><h3 className="table-caption">Pods · {data.pods.filter(pod => pod.health === 'healthy').length}/{data.pods.length} ready</h3><div className="overflow-x-auto"><table className="ports-table"><thead><tr>{['Pod', 'Ready', 'Status', 'Restarts', 'Age', 'IP', 'Container ports'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{data.pods.map(pod => <tr key={pod.uid || pod.name}><td className="font-mono">{pod.name}</td><td>{pod.ready}/{pod.total}</td><td><span className={`status-pill ${pod.health === 'healthy' ? 'healthy' : 'attention'}`}>{pod.status}{pod.status === 'Running' && pod.health !== 'healthy' ? ' · not ready' : ''}</span></td><td>{pod.restarts}</td><td>{age(pod.createdAt)}</td><td className="font-mono">{pod.ip || '—'}</td><td>{pod.ports.map(port => `${port.port}/${port.protocol}`).join(', ') || 'Not declared'}</td></tr>)}{!data.pods.length && <tr><td colSpan={7}>No matching pods found.</td></tr>}</tbody></table></div>{data.warnings.map(warning => <p className="text-xs text-amber-600 mt-3" key={warning}>{warning}</p>)}</div>
          <details className="px-5 pb-5"><summary className="text-xs text-slate-500 cursor-pointer">Endpoints · {data.endpoints.length} addresses</summary><div className="grid sm:grid-cols-2 gap-2 mt-3">{data.endpoints.map((endpoint, index) => <p key={index} className="text-xs font-mono text-slate-500">{endpoint.service}: {endpoint.address} · {endpoint.ports.join(', ')} · {endpoint.ready === false ? 'not ready' : endpoint.ready === true ? 'ready' : 'unknown'}</p>)}</div></details></>}
        </section>;
      })}
    </> : <div className="watchlist-empty surface"><Network size={32} /><h2>Your watchlist, your call.</h2><p>Select one, two, three, or all four apps. Review the commands, then start monitoring.</p></div>}
  </div>;
}
