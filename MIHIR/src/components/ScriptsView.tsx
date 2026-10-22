import { scriptRequest, LOCAL_RUNNER_URL, RUNNER_TOKEN_KEY, isLocalWorkspace } from '../lib/scriptTransport';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal, Play, Save, Plus, RefreshCw, ShieldCheck, FileCode2, PanelsTopLeft, Settings2 } from 'lucide-react';
import type { ScriptDefinition, ScriptRun } from '../types/scripts';
import { KubernetesScriptFields } from './KubernetesScriptFields';
import { RunOutputWindow, RunBadge } from './RunOutputWindow';
import { openOutputWindow, restoreOutputWindows } from '../lib/scriptWindows';

interface Bootstrap {
  scripts: ScriptDefinition[];
  runs: ScriptRun[];
  token: string;
  containers: string[];
  home: string;
  terminalAvailable: boolean;
}

export function ScriptsView() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [draft, setDraft] = useState<ScriptDefinition | null>(null);
  const [preview, setPreview] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const initialized = useRef(false);
  const hosted = !isLocalWorkspace(window.location.hostname);
  const apiBase = hosted ? LOCAL_RUNNER_URL : '';
  const token = useRef(hosted ? sessionStorage.getItem(RUNNER_TOKEN_KEY) || '' : '');
  const [pairing, setPairing] = useState('');
  const [connecting, setConnecting] = useState(false);

  const workspaceNode = useRef<HTMLElement>(null);
  const editorNode = useRef<HTMLDetailsElement>(null);

  async function api<T>(route: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
    return scriptRequest<T>(apiBase, token.current, route, method, body, signal);
  }

  async function load(silent = false) {
    if (hosted && !token.current) return false;
    try {
      const value = await api<Bootstrap>('');
      token.current = value.token; setData(value); if (!silent) setError('');
      if (hosted) sessionStorage.setItem(RUNNER_TOKEN_KEY, value.token);
      setDraft(previous => previous || value.scripts.find(item => item.mode === 'kubernetes') || value.scripts[0] || null);
      if (!initialized.current) {
        let saved: unknown;
        try { saved = JSON.parse(localStorage.getItem('mihir_script_windows') || 'null'); } catch { saved = null; }
        setOpenIds(restoreOutputWindows(saved, value.runs));
        setEditorOpen(value.runs.length === 0);
        initialized.current = true;
      }
      return true;
    } catch (problem: any) { if (!silent) setError(problem.message); return false; }
  }
  useEffect(() => { load(); }, []);
  async function connectRunner(event: React.FormEvent) {
    event.preventDefault();
    if (!/^[a-f0-9]{64}$/.test(pairing.trim())) { setError('Paste the full pairing token printed in your local runner terminal.'); return; }
    setConnecting(true); token.current = pairing.trim();
    try { if (await load()) setPairing(''); } finally { setConnecting(false); }
  }
  function disconnectRunner() {
    token.current = ''; sessionStorage.removeItem(RUNNER_TOKEN_KEY);
    setData(null); setDraft(null); setOpenIds([]); setFocusedId(null); initialized.current = false; setError('');
  }


  useEffect(() => {
    if (!draft || !data) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => api<{ source: string }>('/preview', 'POST', { script: draft }, controller.signal)
      .then(value => { setPreview(value.source); setPreviewError(''); })
      .catch(problem => { if (!controller.signal.aborted) setPreviewError(problem.message); }), 150);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [draft, data?.token]);

  useEffect(() => {
    if (initialized.current) localStorage.setItem('mihir_script_windows', JSON.stringify(openIds));
  }, [openIds]);
  const runningCount = data?.runs.filter(item => item.status === 'Running').length || 0;
  useEffect(() => {
    if (!runningCount) return;
    const timer = setInterval(() => load(true), 5000);
    return () => clearInterval(timer);
  }, [runningCount > 0]);
  useEffect(() => {
    if (!focusedId) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('[aria-label="Log entry details"]')) setFocusedId(null);
    };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, [focusedId]);
  const updateRun = useCallback((value: ScriptRun) => {
    setData(previous => previous ? { ...previous, runs: [value, ...previous.runs.filter(item => item.id !== value.id)].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 30) } : previous);
  }, []);

  function patch(value: Partial<ScriptDefinition>) { setDraft(previous => previous ? { ...previous, ...value } : previous); setNotice(''); }
  function quick(mode: string) {
    patch({ mode: 'steps', pull: mode === 'pull-run' || mode === 'pull', up: mode === 'pull-run', stopAll: false,
      finalAction: mode === 'pull-run' || mode === 'start' ? 'start' : mode === 'restart' ? 'restart' : 'none' });
  }
  function custom() { patch({ mode: 'custom', customBody: draft?.customBody || preview || 'pwd\nprintf "Custom script ready\\n"\n' }); }
  function kubernetes() {
    patch({ mode: 'kubernetes', runAsRoot: false, kubernetes: draft?.kubernetes || {
      kubeconfig: `${data?.home || '/home/mihir-rathod'}/TEMP/k8s-readonly-user-raylife`, namespace: 'default',
      podPrefix: 'ray-job-service', container: '', filter: 'errors', pattern: 'ERROR', since: '10m', tail: 200,
      follow: true, reconnect: true,
    } });
  }
  async function save() {
    if (!draft) return; setBusy(true); setError('');
    try {
      const value = await api<{ scripts: ScriptDefinition[] }>(`/definitions/${draft.id}`, 'PUT', { script: draft });
      setData(previous => previous ? { ...previous, scripts: value.scripts } : previous); setNotice('Script saved');
    } catch (problem: any) { setError(problem.message); }
    finally { setBusy(false); }
  }
  async function start() {
    if (!draft) return; setBusy(true); setError(''); setNotice('');
    try {
      const value = await api<{ run: ScriptRun }>('/runs', 'POST', { script: draft });
      const runs = [value.run, ...(data?.runs || [])];
      updateRun(value.run);
      setOpenIds(previous => {
        try { return openOutputWindow(previous, value.run.id, runs); }
        catch { return [...previous.slice(0, 2), value.run.id]; }
      });
      setFocusedId(null); setEditorOpen(false);
      workspaceNode.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (problem: any) { setError(problem.message); }
    finally { setBusy(false); }
  }
  function openWindow(id: string) {
    try {
      const ids = openOutputWindow(openIds, id, data?.runs || []);
      setOpenIds(ids); setFocusedId(null); setError('');
      workspaceNode.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (problem: any) { setError(problem.message); }
  }
  function prepareMonitor() {
    const template = data?.scripts.find(item => item.mode === 'kubernetes');
    const settings = template?.kubernetes || draft?.kubernetes;
    if (!settings) { setEditorOpen(true); return; }
    setDraft({ ...(template || draft!), id: crypto.randomUUID(), name: 'New application log monitor', mode: 'kubernetes', runAsRoot: false,
      kubernetes: { ...settings, podPrefix: '' } });
    setEditorOpen(true); setNotice('Enter the service pod prefix, then run it in a new window.');
    setTimeout(() => editorNode.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }
  const activeRuns = data?.runs.filter(item => item.status === 'Running') || [];
  const exclusiveDraft = draft?.runAsRoot || draft?.mode === 'steps';
  const blockReason = activeRuns.length >= 3 ? 'Three sessions are running. Stop one to start another.'
    : activeRuns.length && (exclusiveDraft || activeRuns.some(item => item.exclusive || item.runAsRoot || item.mode === 'steps'))
      ? 'Docker and root workflows require all other sessions to be stopped first.' : '';
  const windows = openIds.map(id => data?.runs.find(item => item.id === id)).filter((item): item is ScriptRun => Boolean(item));
  const panel = 'rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
  const inputClass = 'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm';
  return <div className="space-y-5">
    <div className="flex flex-wrap justify-between items-start gap-3"><div><h1 className="text-2xl font-bold flex items-center gap-2"><Terminal className="text-indigo-500" />Scripts</h1><p className="mt-1 text-sm text-slate-500">Run your Ray workflow locally, with live terminal output and step-by-step status.</p></div>
      <button onClick={() => load()} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm flex gap-2 items-center"><RefreshCw className="w-4 h-4" />Refresh</button></div>
    {hosted && <section aria-label="Local terminal connection" className={`${panel} p-5 space-y-3`}>
      <div className="flex justify-between gap-3"><div><h2 className="font-semibold">{data ? 'Connected to your local terminal' : 'Connect local terminal'}</h2><p className="text-xs text-slate-500 mt-1">Commands execute on this computer. Terminal view shows the raw process output; Log table provides a structured view.</p></div>{data && <button onClick={disconnectRunner} className="text-xs text-slate-500 underline">Disconnect</button>}</div>
      {!data && <><p className="text-sm">Start the runner in your system terminal and keep it open:</p><pre className="rounded-lg bg-slate-950 text-slate-100 p-3 text-xs overflow-x-auto">{'cd /home/mihir-rathod/antigravity/MIHIR-Workspace\n./scripts/start-terminal-runner.sh'}</pre>
      <form onSubmit={connectRunner} className="flex flex-wrap gap-2"><label className="grow text-xs">Pairing token<input type="password" autoComplete="off" spellCheck={false} aria-label="Local runner pairing token" className={`${inputClass} mt-1 font-mono`} value={pairing} onChange={event => setPairing(event.target.value)} placeholder="Paste the token printed by the runner" /></label><button disabled={connecting} className="self-end rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm disabled:opacity-50">{connecting ? 'Connecting…' : 'Connect local terminal'}</button></form><p className="text-xs text-slate-500">The connection stays on your computer at 127.0.0.1:43123. If asked, allow this website to access your local network. The token is remembered only in this browser tab. Restarting the runner requires pairing again.</p></>}
    </section>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 p-4 text-sm">{error}</p>}
    <section ref={workspaceNode} aria-label="Output workspace" className="space-y-4 scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold flex items-center gap-2"><PanelsTopLeft className="w-4 h-4 text-indigo-500" />Output workspace <span className="text-xs font-normal text-slate-500">{runningCount}/3 running · {windows.length} windows open</span></h2><p className="text-xs text-slate-500 mt-1">Independent outputs for each service. Expand a window for the full table.</p></div>
        <div className="flex flex-wrap gap-2"><select aria-label="Open recent run in a window" value="" className="max-w-64 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-2 text-xs" onChange={event => { if (event.target.value) openWindow(event.target.value); }}><option value="">Open recent run…</option>{data?.runs.filter(item => !openIds.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select><button disabled={!data} onClick={prepareMonitor} className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-xs flex items-center gap-1"><Plus className="w-4 h-4" />New monitor</button><button disabled={!data} onClick={() => setEditorOpen(value => !value)} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs flex items-center gap-1"><Settings2 className="w-4 h-4" />Script settings</button></div>
      </div>
      {focusedId && <div className="fixed inset-0 bg-slate-950/60 z-30" onClick={() => setFocusedId(null)} />}
      <div className={`grid gap-4 items-start ${windows.length > 1 ? 'lg:grid-cols-2' : 'grid-cols-1'} ${windows.length === 3 ? '2xl:grid-cols-3' : ''}`}>
        {windows.map((item, index) => <div key={item.id} className={focusedId === item.id ? 'fixed inset-4 z-40 overflow-auto rounded-2xl shadow-2xl' : focusedId ? 'hidden' : 'min-w-0'}>
          <RunOutputWindow apiBase={apiBase} initialRun={item} token={token} compact={windows.length > 1 && !focusedId} expanded={focusedId === item.id} index={index + 1} onUpdate={updateRun}
            onExpand={() => setFocusedId(previous => previous === item.id ? null : item.id)} onClose={() => { setOpenIds(previous => previous.filter(id => id !== item.id)); if (focusedId === item.id) setFocusedId(null); }} />
        </div>)}
        {!focusedId && windows.length < 3 && <button disabled={!data} onClick={prepareMonitor} className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-slate-500 min-h-44 flex flex-col items-center justify-center gap-2 hover:border-indigo-400 hover:text-indigo-600 p-6"><Plus className="w-6 h-6" /><span className="text-sm font-medium">{windows.length ? `Add service window ${windows.length + 1}` : 'Start your first service monitor'}</span><span className="text-xs">Kubernetes logs or custom application output</span></button>}
      </div>
    </section>
    <details ref={editorNode} open={editorOpen} onToggle={event => setEditorOpen(event.currentTarget.open)} className="scroll-mt-20">
      <summary className="font-medium text-sm cursor-pointer mb-4">Launch or edit a script</summary>
    <div className="grid lg:grid-cols-[220px_minmax(0,1fr)] gap-5">
      <aside className="space-y-4">
        <section className={`${panel} p-4 space-y-3`}><h2 className="font-semibold text-sm">Saved scripts</h2>
          {data?.scripts.map(item => <button key={item.id} onClick={() => { setDraft({ ...item, containers: [...item.containers] }); setNotice(''); setEditorOpen(true); }} className={`w-full text-left rounded-xl px-3 py-3 text-sm border ${draft?.id === item.id ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950' : 'border-slate-200 dark:border-slate-800'}`}><FileCode2 className="w-4 h-4 inline mr-2" />{item.name}</button>)}
          <button className="flex items-center gap-2 text-sm text-indigo-600" disabled={!draft} onClick={() => { if (draft) setDraft({ ...draft, id: crypto.randomUUID(), name: 'New custom script', mode: 'custom', runAsRoot: false, customBody: 'pwd\nprintf "Custom script ready\\n"\n' }); }}><Plus className="w-4 h-4" />New script</button>
        </section>
        <section className={`${panel} p-4 space-y-3`}><h2 className="font-semibold text-sm">Run history</h2>{!data?.runs.length && <p className="text-xs text-slate-500">No scripts run yet.</p>}
          <div className="space-y-2 max-h-80 overflow-auto">{data?.runs.map(item => <button className={`w-full text-left rounded-lg p-2 border ${openIds.includes(item.id) ? 'border-indigo-400' : 'border-transparent'}`} key={item.id} onClick={() => openWindow(item.id)}><span className="text-xs font-medium block mb-2">{item.name}</span><RunBadge status={item.status} /><span className="block text-[10px] mt-2 text-slate-500">{new Date(item.startedAt).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })}</span></button>)}</div>
        </section>
      </aside>
      <div className="min-w-0 space-y-5">
        {draft && <section className={`${panel} p-5 space-y-4`}>
          <div className="grid md:grid-cols-2 gap-3"><label className="text-xs font-medium space-y-1 block">Script name<input className={inputClass} value={draft.name} onChange={event => patch({ name: event.target.value })} /></label><label className="text-xs font-medium space-y-1 block">Base directory<input className={`${inputClass} font-mono`} value={draft.cwd} onChange={event => patch({ cwd: event.target.value })} /></label></div>
          {draft.mode !== 'kubernetes' && <div className="flex flex-wrap gap-2">{[['pull-run', 'Pull & run'], ['pull', 'Pull only'], ['start', 'Start only'], ['restart', 'Restart only']].map(([key, label]) => <button key={key} className="rounded-lg px-3 py-2 text-xs border border-indigo-200 dark:border-indigo-900 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950" onClick={() => quick(key)}>{label}</button>)}<button className="rounded-lg px-3 py-2 text-xs border border-slate-300 dark:border-slate-700" onClick={custom}>Custom Bash</button></div>}
          {draft.mode !== 'kubernetes' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.runAsRoot} onChange={event => patch({ runAsRoot: event.target.checked })} /><ShieldCheck className="w-4 h-4 text-indigo-500" />Run as root using sudo</label>}
          {draft.runAsRoot && <p className="text-xs text-slate-500">Sudo runs this script with root privileges. If prompted, click the terminal and type your password; it stays hidden and is not saved. Your existing HOME is preserved for ~/ray paths.</p>}
          <div className="flex gap-3 text-sm border-b border-slate-200 dark:border-slate-800 pb-3"><button className={draft.mode === 'steps' ? 'font-semibold text-indigo-600' : 'text-slate-500'} onClick={() => patch({ mode: 'steps' })}>Choose steps</button><button className={draft.mode === 'kubernetes' ? 'font-semibold text-indigo-600' : 'text-slate-500'} onClick={kubernetes}>Kubernetes logs</button><button className={draft.mode === 'custom' ? 'font-semibold text-indigo-600' : 'text-slate-500'} onClick={custom}>Custom script</button></div>
          {draft.mode === 'steps' ? <>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">{[['pull', 'Pull recent images · pull.sh'], ['up', 'Bring up stack · up.sh'], ['stopAll', 'Stop ALL running Docker containers']].map(([key, label]) => <label key={key} className="flex gap-2 items-center"><input type="checkbox" checked={Boolean(draft[key as keyof ScriptDefinition])} onChange={event => patch({ [key]: event.target.checked })} />{label}</label>)}
              <label className="flex items-center gap-2">Then<select aria-label="Container action" className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-2 text-sm" value={draft.finalAction} onChange={event => patch({ finalAction: event.target.value as ScriptDefinition['finalAction'] })}><option value="start">Start selected containers</option><option value="restart">Restart selected containers</option><option value="none">No start / restart</option></select></label>
            </div>
            {draft.stopAll && <p className="rounded-lg bg-amber-50 dark:bg-amber-950 p-3 text-sm text-amber-900 dark:text-amber-200">The stop step affects every running Docker container on this machine, including containers outside this selection.</p>}
            <label className="text-xs flex gap-2 items-center"><input type="checkbox" checked={draft.selectedServicesOnly} onChange={event => patch({ selectedServicesOnly: event.target.checked })} />Apply pull.sh / up.sh only to selected Compose services (otherwise the whole stack)</label>
            <details><summary className="text-sm cursor-pointer font-medium">Containers / services · {draft.containers.length} selected</summary><div className="flex gap-3 mt-3 text-xs"><button onClick={() => patch({ containers: data?.containers || [] })} className="text-indigo-500">Select all</button><button onClick={() => patch({ containers: [] })} className="text-slate-500">Clear</button></div><div className="grid md:grid-cols-2 gap-2 mt-3">{data?.containers.map(name => <label key={name} className="text-xs flex gap-2 items-center font-mono"><input type="checkbox" checked={draft.containers.includes(name)} onChange={event => patch({ containers: event.target.checked ? [...draft.containers, name] : draft.containers.filter(item => item !== name) })} />{name}</label>)}</div></details>
          </> : draft.mode === 'kubernetes' && draft.kubernetes ? <KubernetesScriptFields value={draft.kubernetes} onChange={value => patch({ kubernetes: value })} /> : <label className="block text-xs font-medium">Bash commands<textarea spellCheck={false} aria-label="Custom Bash commands" className="mt-2 w-full h-64 rounded-xl bg-slate-950 text-slate-200 p-4 font-mono text-xs leading-5 border border-slate-700" value={draft.customBody} onChange={event => patch({ customBody: event.target.value })} /><span className="block text-slate-500 mt-1">Commands run locally in the base directory with the privileges selected above.</span></label>}
          <details><summary className="font-medium text-sm cursor-pointer">Preview exact Bash script</summary>{previewError ? <p className="text-rose-500 text-xs mt-2">{previewError}</p> : <pre className="bg-slate-950 text-slate-300 text-xs p-4 rounded-xl mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words">{preview}</pre>}</details>
          <div className="flex flex-wrap gap-3 items-center"><button disabled={busy || Boolean(previewError)} onClick={save} className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" />Save script</button><button disabled={busy || Boolean(blockReason) || Boolean(previewError) || !data?.terminalAvailable} onClick={start} className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50"><Play className="w-4 h-4" />Run in new window</button>{notice && <span role="status" className="text-xs text-emerald-600">{notice}</span>}{previewError && <span className="text-xs text-rose-500">{previewError}</span>}{blockReason && <span className="text-xs text-amber-600">{blockReason}</span>}</div>
        </section>}
      </div>
    </div>

    </details>
  </div>;
}
