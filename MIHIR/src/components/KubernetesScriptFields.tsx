import React from 'react';
import type { KubernetesLogSettings } from '../types/scripts';

export function KubernetesScriptFields({ value, onChange }: { value: KubernetesLogSettings; onChange: (value: KubernetesLogSettings) => void }) {
  const patch = (change: Partial<KubernetesLogSettings>) => onChange({ ...value, ...change });
  const input = 'mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm';
  return <div className="space-y-4">
    <p className="rounded-lg bg-indigo-50 dark:bg-indigo-950 p-3 text-xs text-indigo-800 dark:text-indigo-200">Read-only Kubernetes monitoring. Discovers matching pods and prefixes logs with their pod/container names. Use sudo below only if your kubeconfig requires root access.</p>
    <label className="block text-xs font-medium">Kubeconfig path<input className={`${input} font-mono`} value={value.kubeconfig} onChange={event => patch({ kubeconfig: event.target.value })} /></label>
    <div className="grid md:grid-cols-2 gap-3">
      <label className="text-xs font-medium">Namespace<input className={input} value={value.namespace} onChange={event => patch({ namespace: event.target.value })} /></label>
      <label className="text-xs font-medium">Pod name prefix<input className={input} value={value.podPrefix} onChange={event => patch({ podPrefix: event.target.value })} /></label>
      {value.action !== 'inspect' && <><label className="text-xs font-medium">Log filter<select className={input} value={value.filter} onChange={event => patch({ filter: event.target.value as KubernetesLogSettings['filter'] })}><option value="errors">ERROR only</option><option value="warnings">ERROR + WARN</option><option value="all">All log lines</option><option value="custom">Custom regular expression</option></select></label>
      <label className="text-xs font-medium">Container (blank = all containers)<input className={input} value={value.container} onChange={event => patch({ container: event.target.value })} placeholder="All containers" /></label>
      {value.filter === 'custom' && <label className="text-xs font-medium md:col-span-2">Filter expression<input className={`${input} font-mono`} value={value.pattern} onChange={event => patch({ pattern: event.target.value })} placeholder="ERROR|Exception|timeout" /></label>}
      <label className="text-xs font-medium">Recent history<input className={input} value={value.since} onChange={event => patch({ since: event.target.value })} placeholder="10m, 1h, 30s" /></label>
      <label className="text-xs font-medium">Tail lines per container<input type="number" min={1} max={10000} className={input} value={value.tail} onChange={event => patch({ tail: Number(event.target.value) })} /></label>
    </>}
    </div>
    {value.action !== 'inspect' && <><div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={value.follow} onChange={event => patch({ follow: event.target.checked })} />Follow live logs</label><label className="flex items-center gap-2"><input type="checkbox" disabled={!value.follow} checked={value.reconnect && value.follow} onChange={event => patch({ reconnect: event.target.checked })} />Reconnect and discover replacement pods</label></div>
    <p className="text-xs text-slate-500">Pod discovery refreshes every 10 seconds while reconnect is enabled. Reconnection can replay recent lines. No matching ERROR lines is a valid quiet monitor; Kubernetes connection errors stay visible.</p></>}
  </div>;
}
