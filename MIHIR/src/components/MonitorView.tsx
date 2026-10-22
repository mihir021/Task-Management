import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ExternalLink, RefreshCw, Settings2, Terminal, AlertCircle, GitBranch } from 'lucide-react';
import type { RepositoryConfig, TaskRecord } from '../types/workspace';
import type { JenkinsBuild, MonitorConfig, MonitorJob, MonitorLog } from '../types/monitor';

async function api<T>(url: string, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/monitor' + url, { ...init, signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Monitor returned HTTP ${response.status}`);
  return body;
}

function statusOf(build?: JenkinsBuild) {
  return !build ? 'No builds' : build.building ? 'Running' : build.result || 'Unknown';
}

function BuildStatus({ build }: { build?: JenkinsBuild }) {
  const status = statusOf(build);
  const color = status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
    : ['FAILURE', 'ABORTED'].includes(status) ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
    : status === 'Running' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>{status}</span>;
}

interface Props {
  tasks: TaskRecord[];
  repositories: RepositoryConfig[];
  timezone: string;
  onOpenTask: (id: string) => void;
  onRefreshWorkspace: () => Promise<void>;
}

export function MonitorView({ tasks, repositories, timezone, onOpenTask, onRefreshWorkspace }: Props) {
  const [config, setConfig] = useState<MonitorConfig | null>(null);
  const [configError, setConfigError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [repoId, setRepoId] = useState('');
  const [buildSelection, setBuildSelection] = useState('');
  const [jobRecord, setJobRecord] = useState<{ repositoryId: string; data: MonitorJob } | null>(null);
  const [jobError, setJobError] = useState('');
  const [jobLoading, setJobLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [live, setLive] = useState(true);
  const [follow, setFollow] = useState(true);
  const [search, setSearch] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [log, setLog] = useState({ key: '', text: '', error: '', checkedAt: '', loading: false, catchingUp: false });
  const terminal = useRef<HTMLPreElement>(null);
  const monitoredTasks = tasks.filter(task => !task.isArchived && task.status === 'Monitor Logs & Process');
  const mappedPath = config?.mappings.find(item => item.repositoryId === repoId)?.jobPath || '';
  const job = jobRecord?.repositoryId === repoId ? jobRecord.data : null;
  const buildNumber = buildSelection ? Number(buildSelection) : job?.builds[0]?.number;
  const currentBuild = job?.builds.find(build => build.number === buildNumber);
  const logKey = `${repoId}:${buildNumber}`;
  const logText = log.key === logKey ? log.text : '';

  useEffect(() => {
    const controller = new AbortController();
    api<MonitorConfig>('/config', controller.signal).then(data => {
      setConfig(data);
      setDrafts(Object.fromEntries(data.mappings.map(item => [item.repositoryId, item.jobPath])));
      setRepoId(data.mappings[0]?.repositoryId || repositories[0]?.id || '');
    }).catch(error => { if (!controller.signal.aborted) setConfigError(error.message); });
    return () => controller.abort();
  }, []);

  // Read-only polling runs only while this view is mounted and Live is enabled.
  useEffect(() => {
    if (!repoId || !mappedPath) { setJobRecord(null); setJobError(''); return; }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setJobRecord(null);
    async function load() {
      setJobLoading(true);
      try {
        const data = await api<MonitorJob>(`/repositories/${encodeURIComponent(repoId)}/builds`, controller.signal);
        if (!controller.signal.aborted) { setJobRecord({ repositoryId: repoId, data }); setJobError(''); }
      } catch (error: any) { if (!controller.signal.aborted) setJobError(error.message); }
      finally {
        if (!controller.signal.aborted) {
          setJobLoading(false);
          if (live) timer = setTimeout(load, 15000);
        }
      }
    }
    load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [repoId, mappedPath, live, refresh]);

  useEffect(() => {
    if (!repoId || !buildNumber || !mappedPath) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let cursor = 0;
    setLog({ key: logKey, text: '', error: '', checkedAt: '', loading: true, catchingUp: false });
    async function load() {
      try {
        const data = await api<MonitorLog>(`/repositories/${encodeURIComponent(repoId)}/builds/${buildNumber}/log?start=${cursor}`, controller.signal);
        if (controller.signal.aborted) return;
        cursor = data.nextStart;
        // Strip terminal control sequences; render all output as plain text.
        const clean = data.text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r/g, '');
        setLog(previous => ({ key: logKey, text: ((previous.key === logKey ? previous.text : '') + clean).slice(-200000), error: '', checkedAt: new Date().toISOString(), loading: false, catchingUp: data.truncated }));
        if (data.truncated || (live && data.moreData)) timer = setTimeout(load, data.truncated ? 300 : 5000);
      } catch (error: any) {
        if (!controller.signal.aborted) {
          setLog(previous => ({ ...previous, error: error.message, loading: false }));
          if (live) timer = setTimeout(load, 15000);
        }
      }
    }
    load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [repoId, buildNumber, mappedPath, live, refresh]);

  const visibleLog = useMemo(() => logText.split('\n').filter(line =>
    (!search || line.toLowerCase().includes(search.toLowerCase())) && (!errorsOnly || /error|warn|fail|exception/i.test(line))
  ).join('\n'), [logText, search, errorsOnly]);

  useEffect(() => { if (follow && terminal.current) terminal.current.scrollTop = terminal.current.scrollHeight; }, [visibleLog, follow]);

  async function saveMappings(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setConfigError(''); setSaved(false);
    try {
      const data = await api<MonitorConfig>('/config', undefined, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: repositories.filter(repo => drafts[repo.id]?.trim()).map(repo => ({ repositoryId: repo.id, jobPath: drafts[repo.id].trim() })) }),
      });
      setConfig(data); setRefresh(value => value + 1); setSaved(true);
    } catch (error: any) { setConfigError(error.message); }
    finally { setSaving(false); }
  }

  const panel = 'rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
  const input = 'rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm min-w-0';
  const date = (timestamp: number | string) => new Date(timestamp).toLocaleString('en-GB', { timeZone: timezone });
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Activity className="text-indigo-500" />Monitor</h1>
        <p className="text-sm text-slate-500 mt-1">Jenkins builds and console logs for tasks in Monitor Logs &amp; Process.</p></div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={live} onChange={event => setLive(event.target.checked)} />Live refresh</label>
        <button className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm flex items-center gap-2" onClick={() => { setRefresh(value => value + 1); onRefreshWorkspace(); }}><RefreshCw className={`w-4 h-4 ${jobLoading ? 'animate-spin' : ''}`} />Refresh</button>
      </div>
    </div>

    <div className="grid sm:grid-cols-3 gap-4">
      {[['Tasks monitoring', monitoredTasks.length], ['Repository job mappings', config?.mappings.length || 0], ['Jenkins access', config?.credentialsConfigured ? 'Token configured' : 'Setup required']].map(([label, value]) =>
        <div className={`${panel} p-4`} key={label}><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-semibold mt-2">{value}</p></div>)}
    </div>

    {configError && <p role="alert" className="rounded-xl bg-rose-50 dark:bg-rose-950 p-4 text-sm text-rose-700 dark:text-rose-300">{configError}</p>}

    <section className={`${panel} p-5`}>
      <h2 className="font-semibold">Tasks being monitored</h2>
      {monitoredTasks.length === 0 ? <p className="text-sm text-slate-500 mt-3">No tasks are in monitoring yet. Move a task to <strong>Monitor Logs &amp; Process</strong> in My Tasks to list it here. You can still inspect a configured Jenkins job below.</p> :
        <div className="grid lg:grid-cols-2 gap-3 mt-4">{monitoredTasks.map(task => <article key={task.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <button onClick={() => onOpenTask(task.id)} className="font-semibold text-left hover:text-indigo-600"><span className="text-indigo-500 text-xs mr-2">{task.taskCode}</span>{task.title}</button>
          <div className="flex flex-wrap gap-2 mt-3">{task.repositories.map(repo => {
            const mapping = config?.mappings.find(item => item.repositoryId === repo.repositoryId);
            return <button key={repo.id} disabled={!mapping} onClick={() => { setRepoId(repo.repositoryId); setBuildSelection(''); }} className={`rounded-lg px-3 py-2 text-xs text-left ${mapping ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
              <span className="block font-medium">{repo.repositoryName}{!mapping && ' · configure job below'}</span><span className="flex items-center gap-1 mt-1"><GitBranch className="w-3 h-3" />{repo.workingBranch}</span></button>;
          })}{task.repositories.length === 0 && <span className="text-xs text-amber-600">Add a repository to this task to choose its Jenkins job.</span>}</div>
        </article>)}</div>}
    </section>

    <details className={`${panel} p-5`} open={!config?.credentialsConfigured || undefined}>
      <summary className="font-semibold cursor-pointer"><Settings2 className="w-4 h-4 inline mr-2" />Jenkins connection &amp; repository jobs</summary>
      <p className="mt-3 text-sm text-slate-500">Server: <span className="font-mono">{config?.jenkinsUrl || 'Loading…'}</span></p>
      {!config?.credentialsConfigured && <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950 p-4 text-sm text-amber-900 dark:text-amber-200">
        Set <code>JENKINS_USER</code> and <code>JENKINS_API_TOKEN</code> in the app server’s <code>.env</code> file, then restart the server. Use a Jenkins account with permission to read the required jobs and logs. Credentials stay on the server.
      </div>}
      <form onSubmit={saveMappings} className="mt-4 space-y-3">
        <p className="text-xs text-slate-500">Enter the Jenkins job name for each repository. For nested jobs use folder/job. Leave blank to disable monitoring for a repository.</p>
        <div className="grid md:grid-cols-2 gap-3">{repositories.map(repo => <label className="text-xs font-medium flex flex-col gap-1" key={repo.id}>{repo.name}<input className={input} aria-label={`Jenkins job for ${repo.name}`} value={drafts[repo.id] || ''} placeholder="Job name, e.g. raydashboard" onChange={event => { setDrafts(previous => ({ ...previous, [repo.id]: event.target.value })); setSaved(false); }} /></label>)}</div>
        <div className="flex items-center gap-3"><button disabled={saving || !config} className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">{saving ? 'Saving…' : 'Save job mappings'}</button>{saved && <span role="status" className="text-sm text-emerald-600">Mappings saved</span>}</div>
      </form>
    </details>

    <section className={`${panel} overflow-hidden`}>
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap justify-between items-center gap-3">
        <div><h2 className="font-semibold flex items-center gap-2"><Terminal className="w-4 h-4 text-indigo-500" />Build &amp; deployment logs</h2><p className="text-xs text-slate-500 mt-1">Job history is shared. Confirm the build’s branch and commit before treating it as this task’s deployment.</p></div>
        <label className="text-xs flex items-center gap-2">Repository<select aria-label="Monitor repository" className={input} value={repoId} onChange={event => { setRepoId(event.target.value); setBuildSelection(''); }}><option value="" disabled>Select repository</option>{repositories.map(repo => <option key={repo.id} value={repo.id}>{repo.name}</option>)}</select></label>
      </div>
      {jobError && <div role="alert" className="m-5 rounded-xl bg-amber-50 dark:bg-amber-950 p-4 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2"><AlertCircle className="w-5 h-5 shrink-0" /><div><p>{jobError}</p>{job && <p className="mt-1 text-xs">Build history below is from the last successful refresh.</p>}</div></div>}
      {!mappedPath && config ? <p className="p-6 text-sm text-slate-500">No Jenkins job is configured for this repository. Add its job name above and save.</p> : jobLoading && !job ? <p role="status" className="p-6 text-sm text-slate-500">Connecting to Jenkins…</p> : !job ? <div className="p-8 text-center text-slate-500"><Terminal className="w-8 h-8 mx-auto mb-3 opacity-50" /><p className="text-sm">Build history and console output will appear here when Jenkins is connected.</p></div> :
        <div className="grid lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="p-4 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-3"><h3 className="text-sm font-semibold">Recent builds</h3><a className="text-xs text-indigo-500 flex items-center gap-1" href={job.url} target="_blank" rel="noreferrer">Jenkins<ExternalLink className="w-3 h-3" /></a></div>
            <button className={`w-full text-left text-xs rounded-lg px-3 py-2 mb-2 ${!buildSelection ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : ''}`} onClick={() => setBuildSelection('')}>Follow latest build</button>
            <div className="space-y-2 max-h-[520px] overflow-y-auto">{job.builds.map(build => <button key={build.number} className={`w-full text-left p-3 rounded-xl border ${buildNumber === build.number ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-800'}`} onClick={() => setBuildSelection(String(build.number))}>
              <span className="flex items-center justify-between gap-2"><strong className="text-sm">#{build.number}</strong><BuildStatus build={build} /></span><span className="block mt-2 text-[11px] text-slate-500">{date(build.timestamp)}</span><span className="block text-[11px] text-slate-500">{build.building ? 'Build in progress' : `${Math.round(build.duration / 1000)}s duration`}</span>
            </button>)}</div>
            {job.builds.length === 0 && <p className="text-sm text-slate-500">This job has no builds yet.</p>}
            <p className="text-[10px] text-slate-500 mt-3">Checked {date(job.checkedAt)}</p>
          </aside>
          <div className="min-w-0 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Console output {buildNumber ? `#${buildNumber}` : ''}</h3>{currentBuild && <a href={currentBuild.url + 'console'} target="_blank" rel="noreferrer" className="text-xs text-indigo-500">Open build in Jenkins ↗</a>}</div>
            <div className="flex flex-wrap items-center gap-3 text-xs"><input className={`${input} flex-1`} placeholder="Search console output…" aria-label="Search console output" value={search} onChange={event => setSearch(event.target.value)} /><label className="flex gap-1.5 items-center"><input type="checkbox" checked={errorsOnly} onChange={event => setErrorsOnly(event.target.checked)} />Errors &amp; warnings</label><label className="flex gap-1.5 items-center"><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} />Follow output</label></div>
            {log.key === logKey && log.error && <p role="alert" className="text-sm text-rose-600">{log.error}</p>}
            <pre ref={terminal} aria-label="Jenkins console output" className="h-[480px] overflow-auto rounded-xl bg-slate-950 text-slate-200 p-4 text-xs leading-5 font-mono whitespace-pre-wrap break-words">{visibleLog || (log.key === logKey && log.loading ? 'Loading console output…' : !buildNumber ? 'Select a build to inspect its logs.' : logText ? 'No matching log lines.' : 'No console output yet.')}</pre>
            <p className="text-[10px] text-slate-500">{log.key === logKey && log.checkedAt ? `Updated ${date(log.checkedAt)} · ` : ''}{log.catchingUp && log.key === logKey ? 'Loading more output… · ' : ''}Showing the latest 200,000 characters. {live ? 'Builds refresh every 15s; active logs every 5s.' : 'Live refresh paused.'}</p>
          </div>
        </div>}
    </section>
  </div>;
}
