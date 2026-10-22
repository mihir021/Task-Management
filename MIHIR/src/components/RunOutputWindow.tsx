import { scriptRequest, followScriptEvents, downloadScriptOutput } from '../lib/scriptTransport';
import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Terminal, Square, Download, Maximize2, Minimize2, X, Loader2, CheckCircle2, Circle } from 'lucide-react';
import type { ScriptRun } from '../types/scripts';
import { ScriptLogTable } from './ScriptLogTable';
import { ScriptLogParser, type ScriptLogRow } from '../lib/scriptLogParser';

export function RunBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${status === 'Passed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : status === 'Running' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300' : status === 'Failed' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{status}</span>;
}

interface Props {
  initialRun: ScriptRun;
  apiBase: string;
  token: React.MutableRefObject<string>;
  compact: boolean;
  expanded: boolean;
  index: number;
  onUpdate: (run: ScriptRun) => void;
  onExpand: () => void;
  onClose: () => void;
}

export function RunOutputWindow({ initialRun, apiBase, token, compact, expanded, index, onUpdate, onExpand, onClose }: Props) {
  const [run, setRun] = useState(initialRun);
  const [connected, setConnected] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [follow, setFollow] = useState(true);
  const [view, setView] = useState<'table' | 'terminal'>('terminal');
  const [rows, setRows] = useState<ScriptLogRow[]>([]);
  const [error, setError] = useState('');
  const node = useRef<HTMLDivElement>(null);
  const terminal = useRef<XTerminal | null>(null);
  const currentRun = useRef(run); currentRun.current = run;
  const updateRef = useRef(onUpdate); updateRef.current = onUpdate;
  const followRef = useRef(follow); followRef.current = follow;
  const inputChain = useRef<Promise<unknown>>(Promise.resolve());

  async function action(route: string, body?: unknown) {
    return scriptRequest<any>(apiBase, token.current, `/runs/${initialRun.id}/${route}`, 'POST', body || {});
  }

  useEffect(() => {
    if (!node.current) return;
    const term = new XTerminal({ fontSize: 12, fontFamily: '"DejaVu Sans Mono", monospace',
      cursorBlink: true, scrollback: 5000, convertEol: true,
      theme: { background: '#020617', foreground: '#cbd5e1', cursor: '#a5b4fc', selectionBackground: '#4338ca80' },
    });
    const fit = new FitAddon(); term.loadAddon(fit); term.open(node.current);
    term.textarea?.setAttribute('aria-label', `Terminal input for ${initialRun.name}`);
    terminal.current = term;
    const resize = new ResizeObserver(() => { try { fit.fit(); } catch { /* Hidden or closing window. */ } });
    resize.observe(node.current); try { fit.fit(); } catch { /* Table may be selected initially. */ }
    const input = term.onData(value => {
      if (currentRun.current.status !== 'Running') return;
      inputChain.current = inputChain.current.then(() => action('input', { data: value })).catch(problem => setError(problem.message));
    });
    return () => { input.dispose(); resize.disconnect(); term.dispose(); terminal.current = null; };
  }, [initialRun.id]);

  useEffect(() => {
    const parser = new ScriptLogParser();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => { setRows(parser.records()); timer = null; };
    const schedule = () => { if (!timer) timer = setTimeout(flush, 200); };
    const update = (value: ScriptRun) => {
      setRun(value); updateRef.current(value);
      if (value.status !== 'Running') { parser.finish(); if (timer) clearTimeout(timer); flush(); return false; }
    };
    const stop = followScriptEvents(apiBase, () => token.current, initialRun.id, (name, value) => {
      if (name === 'snapshot') {
        parser.reset(); parser.ingest(value.output || ''); schedule();
        terminal.current?.reset(); terminal.current?.write(value.output || 'No output recorded yet.\r\n');
        return update(value.run);
      }
      if (name === 'output') {
        parser.ingest(value); schedule();
        terminal.current?.write(value, () => { if (followRef.current) terminal.current?.scrollToBottom(); });
      }
      if (name === 'status') return update(value);
    }, value => { setConnected(value); if (value) setError(''); }, setError);
    return () => { stop(); if (timer) clearTimeout(timer); };
  }, [initialRun.id, apiBase]);

  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Math.floor(((run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now()) - new Date(run.startedAt).getTime()) / 1000)));
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [run.startedAt, run.finishedAt]);

  async function interrupt() {
    try { const result = await action('interrupt'); setRun(result.run); updateRef.current(result.run); }
    catch (problem: any) { setError(problem.message); }
  }
  const target = run.target || run.name.replace(/^Kubernetes\s*[·:]\s*/, '').replace(/\s+logs$/, '');
  return <section role="region" aria-label={`Output window ${index}: ${run.name}`} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
    <header className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-start gap-3 justify-between">
      <div className="min-w-0"><div className="flex items-center gap-2"><span className="h-6 w-6 shrink-0 rounded-md bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 text-xs font-semibold">{index}</span><h3 className="font-semibold text-sm truncate" title={run.name}>{target}</h3><RunBadge status={run.status} /></div><p className="text-[10px] text-slate-500 mt-1.5">{run.namespace ? `${run.namespace} · ` : ''}{elapsed}s{run.exitCode !== null ? ` · exit ${run.exitCode}` : ''}{run.status === 'Running' ? connected ? ' · live' : ' · reconnecting…' : ''}</p></div>
      <div className="flex items-center gap-1 shrink-0"><button onClick={onExpand} aria-label={expanded ? `Restore window ${index}` : `Expand window ${index}`} title={expanded ? 'Restore windows' : 'Expand this window'} className="p-1.5 text-slate-500 rounded hover:bg-slate-200 dark:hover:bg-slate-800">{expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}</button><button onClick={onClose} aria-label={`Close window ${index} view`} title="Close this view; the process continues running" className="p-1.5 text-slate-500 rounded hover:bg-slate-200 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button></div>
    </header>
    <div className="px-4 pt-3 flex flex-wrap gap-3 justify-between border-b border-slate-200 dark:border-slate-800"><div className="flex gap-4" role="tablist" aria-label={`Output format for window ${index}`}><button role="tab" aria-selected={view === 'table'} className={`pb-3 text-xs ${view === 'table' ? 'font-semibold text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500'}`} onClick={() => setView('table')}>Log table</button><button role="tab" aria-selected={view === 'terminal'} className={`pb-3 text-xs flex items-center gap-1 ${view === 'terminal' ? 'font-semibold text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500'}`} onClick={() => setView('terminal')}><Terminal className="w-3 h-3" />Terminal</button></div><div className="flex gap-3 items-start text-[10px]"><label className="flex items-center gap-1"><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} />Follow</label><button className="text-indigo-600" aria-label="Download terminal output" title="Download this session output" onClick={() => downloadScriptOutput(apiBase, token.current, run.id).catch(problem => setError(problem.message))}><Download className="w-3.5 h-3.5" /></button><button disabled={run.status !== 'Running'} className="text-rose-500 flex gap-1 items-center disabled:opacity-30" onClick={interrupt}><Square className="w-3 h-3" />Stop</button></div></div>
    {error && <p role="alert" className="px-4 py-2 text-xs text-rose-600">{error}</p>}
    {run.message && <p className="px-4 py-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950">{run.message}</p>}
    {run.stopRequested && run.status === 'Running' && <p className="px-4 py-2 text-xs text-amber-700">Interrupt sent; waiting for this process to exit.</p>}
    {view === 'table' && <ScriptLogTable rows={rows} follow={follow} running={run.status === 'Running'} compact={compact} />}
    <div className={view === 'terminal' ? '' : 'hidden'}><div ref={node} className={`${expanded ? 'h-[65vh]' : 'h-[450px]'} bg-slate-950 p-3`} aria-label={`Terminal output for ${run.name}`} /></div>
    <details className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500"><summary className="cursor-pointer">Run steps · {run.steps.filter(step => step.status === 'Passed').length}/{run.steps.length} passed</summary><div className="space-y-2 mt-2">{run.steps.map(step => <p className="flex items-center gap-2" key={step.id}>{step.status === 'Running' ? <Loader2 className="w-3 h-3 animate-spin text-indigo-500" /> : step.status === 'Passed' ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Circle className="w-3 h-3" />}{step.title} · {step.status}</p>)}</div></details>
    <p className="px-4 py-2 text-[10px] text-slate-400">{view === 'terminal' ? 'Click the terminal to answer prompts. ' : 'Select View for the full message and stack trace. '}Closing this view leaves its process running.{run.outputTruncated && ' Saved output has reached the 5 MiB limit.'}</p>
  </section>;
}
