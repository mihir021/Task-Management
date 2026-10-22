import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Search, X, FileText } from 'lucide-react';
import { logRowsCsv, logSummary, readableLogText, type ScriptLogRow } from '../lib/scriptLogParser';

function Level({ value }: { value: string }) {
  const color = ['ERROR', 'FATAL'].includes(value) ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : value === 'WARN' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : value === 'INFO' ? 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return <span className={`inline-flex rounded px-2 py-1 text-[10px] font-semibold ${color}`}>{value}</span>;
}

function logTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? { time: '—', date: '', full: value } : {
    time: date.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }) + '.' + String(date.getUTCMilliseconds()).padStart(3, '0'),
    date: date.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' }), full: value,
  };
}

function LogDetails({ row, onClose }: { row: ScriptLogRow; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<'message' | 'payload' | 'raw'>('message');
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, []);
  const content = tab === 'raw' ? row.raw : tab === 'payload' ? JSON.stringify(row.payload, null, 2) :
    readableLogText(row.message) + (row.stack ? '\n\nStack trace\n' + readableLogText(row.stack) : '') + (row.continuation ? '\n' + readableLogText(row.continuation) : '');
  return <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label="Log entry details" className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={event => event.stopPropagation()}>
      <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800"><div><h3 className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500" />Log entry details <Level value={row.level} /></h3><p className="text-xs text-slate-500 mt-1 break-all">{row.timestamp || 'Monitor event'} · {row.pod || 'Script'}{row.container ? ' / ' + row.container : ''}</p></div><button ref={close} aria-label="Close log details" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose}><X className="w-5 h-5" /></button></div>
      <div className="px-5 py-3 grid sm:grid-cols-3 gap-3 text-xs bg-slate-50 dark:bg-slate-950"><p className="min-w-0"><span className="text-slate-500 block">Logger</span><span className="break-all">{row.logger || '—'}</span></p><p className="min-w-0"><span className="text-slate-500 block">Thread</span><span className="break-all">{row.thread || '—'}</span></p><p className="min-w-0"><span className="text-slate-500 block">Trace ID</span><span className="break-all font-mono">{row.traceId || '—'}</span></p></div>
      <div className="flex gap-3 px-5 py-3 text-sm border-b border-slate-200 dark:border-slate-800">{[['message', 'Formatted message'], ...(row.payload ? [['payload', 'JSON fields']] : []), ['raw', 'Original record']].map(([key, label]) => <button key={key} className={tab === key ? 'font-semibold text-indigo-600' : 'text-slate-500'} onClick={() => setTab(key as typeof tab)}>{label}</button>)}</div>
      {row.truncated && <p className="px-5 py-2 text-xs text-amber-700 bg-amber-50">This large record is shortened in the table buffer. Download the saved output for the retained original.</p>}
      <pre className="p-5 overflow-auto min-h-40 text-xs font-mono leading-5 whitespace-pre-wrap break-words text-slate-700 dark:text-slate-200">{content}</pre>
    </section>
  </div>;
}

export function ScriptLogTable({ rows, follow, running, compact = false }: { rows: ScriptLogRow[]; follow: boolean; running: boolean; compact?: boolean }) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('all');
  const [pod, setPod] = useState('all');
  const [showEvents, setShowEvents] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ScriptLogRow | null>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const pageSize = 30;
  const appRows = rows.filter(row => row.kind === 'log' || ['ERROR', 'FATAL'].includes(row.level));
  const pods = [...new Set(appRows.map(row => row.pod).filter(Boolean))].sort();
  const levels = [...new Set(appRows.map(row => row.level))].sort();
  const filtered = useMemo(() => rows.filter(row => (showEvents || row.kind === 'log' || ['ERROR', 'FATAL'].includes(row.level))
    && (level === 'all' || row.level === level) && (pod === 'all' || row.pod === pod)
    && (!query || [row.message, row.pod, row.container, row.logger, row.traceId, row.stack, row.continuation, row.raw].some(value => value.toLowerCase().includes(query.toLowerCase())))).reverse(),
  [rows, query, level, pod, showEvents]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const shown = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  useEffect(() => { setPage(0); }, [query, level, pod, showEvents]);
  useEffect(() => { if (follow) { setPage(0); if (scrollArea.current) scrollArea.current.scrollTop = 0; } }, [rows.length, rows[rows.length - 1]?.id, follow]);
  function download() {
    const url = URL.createObjectURL(new Blob(['\ufeff' + logRowsCsv(filtered)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'kubernetes-logs.csv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const field = 'rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs';
  return <div>
    <div className="px-5 py-4 bg-slate-50/70 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 space-y-3">
      <div className="flex flex-wrap gap-4 text-xs text-slate-500"><span><strong className="text-slate-900 dark:text-slate-100">{appRows.length}</strong> log entries received</span><span><strong className="text-rose-600">{appRows.filter(row => ['ERROR', 'FATAL'].includes(row.level)).length}</strong> errors</span><span><strong className="text-amber-600">{appRows.filter(row => row.level === 'WARN').length}</strong> warnings</span><span>{pods.length} pods in log entries</span></div>
      <div className="flex flex-wrap gap-2 items-center"><label className="relative flex-1 min-w-44"><Search className="w-3.5 h-3.5 absolute top-2.5 left-3 text-slate-400" /><input className={`${field} pl-8 w-full`} aria-label="Search log table" placeholder="Search messages, pod, logger or trace ID…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <select aria-label="Log table level" className={field} value={level} onChange={event => setLevel(event.target.value)}><option value="all">All levels</option>{levels.map(item => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Log table pod" className={`${field} max-w-56`} value={pod} onChange={event => setPod(event.target.value)}><option value="all">All pods</option>{pods.map(item => <option key={item} value={item}>{item}</option>)}</select>
        <button disabled={!filtered.length} onClick={download} className="flex items-center gap-1.5 text-xs text-indigo-600 px-2 disabled:opacity-40"><Download className="w-3.5 h-3.5" />CSV</button>
      </div>
      <label className="flex gap-2 items-center text-[11px] text-slate-500"><input type="checkbox" checked={showEvents} onChange={event => setShowEvents(event.target.checked)} />Include script and monitor events</label>
    </div>
    <div ref={scrollArea} className={`overflow-auto ${compact ? 'max-h-[420px]' : 'max-h-[540px]'} min-h-[220px]`}>
      <table className={`w-full ${compact ? 'min-w-[360px]' : 'min-w-[720px]'} table-fixed text-xs`} aria-label="Kubernetes log entries">
        <colgroup><col className={compact ? 'w-24' : 'w-28'} /><col className={compact ? 'w-16' : 'w-20'} />{!compact && <col className="w-48" />}<col /><col className={compact ? 'w-14' : 'w-24'} /></colgroup>
        <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10 text-slate-500 text-left border-b border-slate-200 dark:border-slate-800"><tr><th className="px-4 py-3 font-medium">Time (IST)</th><th className="px-2 py-3 font-medium">Level</th>{!compact && <th className="px-3 py-3 font-medium">Pod / container</th>}<th className="px-3 py-3 font-medium">Message</th><th className="px-2 py-3 font-medium">Details</th></tr></thead>
        <tbody>{shown.map(row => {
          const time = logTime(row.timestamp);
          return <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 align-top">
            <td className="px-4 py-3 text-slate-500 whitespace-nowrap" title={time.full}><span className="font-mono text-[11px] text-slate-700 dark:text-slate-200">{time.time}</span><span className="block text-[10px] mt-1">{time.date}</span></td>
            <td className="px-2 py-3"><Level value={row.level} /></td>
            {!compact && <td className="px-3 py-3 min-w-0"><span className="block truncate font-mono text-[10px]" title={row.pod}>{row.pod.length > 29 ? row.pod.slice(0, 13) + '…' + row.pod.slice(-12) : row.pod || 'Script / monitor'}</span><span className="block truncate text-[10px] text-slate-500 mt-1" title={row.container}>{row.container || '—'}</span></td>}
            <td className="px-3 py-3 min-w-0"><p className={`${compact ? 'text-xs line-clamp-3' : 'text-[13px] line-clamp-2'} leading-5 break-words`} style={{ overflowWrap: 'anywhere' }}>{logSummary(row.message, compact ? 110 : 190)}</p>{compact && row.pod ? <p className="truncate text-[10px] text-slate-400 mt-1" title={`${row.pod} / ${row.container}`}>…{row.pod.slice(-16)}</p> : row.logger && <p className="truncate text-[10px] text-slate-400 mt-1" title={row.logger}>{row.logger.split('.').slice(-2).join('.')}</p>}</td>
            <td className="px-2 py-3"><button aria-label={`View log details ${row.id}`} onClick={() => setSelected(row)} className="text-indigo-600 hover:underline font-medium whitespace-nowrap">{compact ? 'View' : 'View details'}</button></td>
          </tr>;
        })}</tbody>
      </table>
      {shown.length === 0 && <div className="p-10 text-center text-sm text-slate-500">{query || level !== 'all' || pod !== 'all' ? 'No entries match these filters.' : running ? 'Waiting for matching log entries. Monitor status and connection errors are available under “Include script and monitor events”.' : 'No application log entries in this run. Include script and monitor events to inspect its status.'}</div>}
    </div>
    <div className="flex flex-wrap justify-between items-center gap-3 px-5 py-3 text-[11px] text-slate-500"><p>{filtered.length ? `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, filtered.length)} of ${filtered.length} entries` : '0 entries'}{!compact && ' · Newest received first · Buffer: up to 500 rows / 2 million raw characters'}</p><div className="flex items-center gap-2"><button aria-label="Previous log page" className="p-1 disabled:opacity-30" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft className="w-4 h-4" /></button><span>{safePage + 1} / {pages}</span><button aria-label="Next log page" className="p-1 disabled:opacity-30" disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)}><ChevronRight className="w-4 h-4" /></button></div></div>
    {selected && <LogDetails row={selected} onClose={() => setSelected(null)} />}
  </div>;
}
