import { WorkspaceComicHero } from "../../../src/workspace/WorkspaceExperience";
import { SpiderMark } from './SpiderMark';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Clock,
  FileText,
  Play,
  Square,
  GitBranch,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Trash2,
  RotateCcw,
  FileCode2,
  Image as ImageIcon,
  FlaskConical,
  GitMerge,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import {
  ActiveTimerState,
  ActivityItem,
  ProjectConfig,
  RepositoryConfig,
  TaskRecord,
  TimeEntry,
} from '../types/workspace';
import {
  computeDashboardMetrics,
  formatDurationMinutes,
  formatUnambiguousDate,
  isTaskAwaitingPushOrMerge,
  isTaskOverdue,
  summarizeRepositoryProgress,
} from '../lib/workspaceLogic';

interface DailyFocusEntry {
  id: string;
  text: string;
  taskCode: string;
  completed: boolean;
  createdAt: string;
}

interface DashboardViewProps {
  tasks: TaskRecord[];
  projects: ProjectConfig[];
  repositories: RepositoryConfig[];
  timeEntries: TimeEntry[];
  activity: ActivityItem[];
  activeTimer: ActiveTimerState | null;
  timezone: string;
  onOpenTask: (taskId: string, initialTab?: string) => void;
  onOpenNewTask: () => void;
  onOpenQuickNote: () => void;
  onOpenQuickTime: (taskId?: string) => void;
  onStartTimer: (taskId: string) => void;
  onStopTimer: () => void;
  onClearDemoData: () => void;
  onRestoreDemoData: () => void;
  onNavigateToTasksWithFilter: (filterPreset: { status?: string; repository?: string }) => void;
  onOpenAiCopilot?: () => void;
  onCopyStandup?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  tasks,
  projects,
  repositories,
  timeEntries,
  activity,
  activeTimer,
  timezone,
  onOpenTask,
  onOpenNewTask,
  onOpenQuickNote,
  onOpenQuickTime,
  onStartTimer,
  onStopTimer,
  onClearDemoData,
  onRestoreDemoData,
  onNavigateToTasksWithFilter,
  onOpenAiCopilot,
  onCopyStandup,
}) => {
  const [selectedProject, setSelectedProject] = useState<string>('All');
  const [selectedRepo, setSelectedRepo] = useState<string>('All');
  const [focusItems, setFocusItems] = useState<DailyFocusEntry[]>([]);
  const [newFocusText, setNewFocusText] = useState('');
  const [newFocusTaskCode, setNewFocusTaskCode] = useState('RAY');
  const [copiedStandupToast, setCopiedStandupToast] = useState(false);

  useEffect(() => {
    fetch('/api/focus')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.items)) setFocusItems(d.items);
      })
      .catch(() => {});
  }, []);

  const handleAddFocusItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFocusText.trim()) return;
    const res = await fetch('/api/focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: newFocusText.trim(),
        taskCode: newFocusTaskCode || 'RAY',
        completed: false,
      }),
    });
    const data = await res.json();
    if (Array.isArray(data.items)) {
      setFocusItems(data.items);
      setNewFocusText('');
    }
  };

  const handleToggleFocusItem = async (item: DailyFocusEntry) => {
    const res = await fetch('/api/focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...item,
        completed: !item.completed,
      }),
    });
    const data = await res.json();
    if (Array.isArray(data.items)) setFocusItems(data.items);
  };

  const handleDeleteFocusItem = async (id: string) => {
    const res = await fetch(`/api/focus/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (Array.isArray(data.items)) setFocusItems(data.items);
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.isArchived) return false;
      if (selectedProject !== 'All' && t.projectName !== selectedProject) return false;
      if (
        selectedRepo !== 'All' &&
        !t.repositories.some((r) => r.repositoryName === selectedRepo)
      ) {
        return false;
      }
      return true;
    });
  }, [tasks, selectedProject, selectedRepo]);

  const filteredTimeEntries = useMemo(() => {
    const allowedIds = new Set(filteredTasks.map((t) => t.id));
    return timeEntries.filter((te) => allowedIds.has(te.taskId));
  }, [filteredTasks, timeEntries]);

  const nowIso = new Date().toISOString();
  const metrics = useMemo(
    () => computeDashboardMetrics(filteredTasks, filteredTimeEntries, nowIso, timezone),
    [filteredTasks, filteredTimeEntries, nowIso, timezone]
  );

  const continueWorkingTasks = useMemo(() => {
    return [...filteredTasks]
      .filter((t) => t.status !== 'Done')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 4);
  }, [filteredTasks]);

  const awaitingPushMergeList = useMemo(
    () => filteredTasks.filter(isTaskAwaitingPushOrMerge),
    [filteredTasks]
  );

  const blockedOrOverdueList = useMemo(
    () =>
      filteredTasks.filter(
        (t) =>
          Boolean(t.blockerNotes) ||
          t.tests.some((test) => test.status === 'Blocked') ||
          isTaskOverdue(t, nowIso)
      ),
    [filteredTasks, nowIso]
  );

  const recentlyCompletedList = useMemo(
    () =>
      tasks
        .filter((t) => t.status === 'Done')
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 3),
    [tasks]
  );

  const hasDemoTasks = useMemo(() => tasks.some((t) => t.isDemo), [tasks]);

  return (
    <div className="dashboard-page space-y-6">
      {/* Top Workspace Header & Quick Actions */}
      <div className="dashboard-heading flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="relative z-10">
          <p className="eyebrow muted mb-3">{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: timezone }).toUpperCase()} · {timezone.toUpperCase()}</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Your daily issue.
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Personal engineering journal, multi-repository branch tracker, and verification log for the Ray project.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenNewTask}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
          {onOpenAiCopilot && (
            <button
              type="button"
              onClick={onOpenAiCopilot}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              AI Copilot
            </button>
          )}
          {onCopyStandup && (
            <button
              type="button"
              onClick={() => {
                onCopyStandup();
                setCopiedStandupToast(true);
                setTimeout(() => setCopiedStandupToast(false), 2000);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {copiedStandupToast ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-500" />
              )}
              {copiedStandupToast ? 'Copied Standup!' : 'Copy Daily Standup'}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenQuickNote}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            Add Work Note
          </button>
          <button
            type="button"
            onClick={() => onOpenQuickTime()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            Log Time
          </button>
        </div>
      </div>

      <WorkspaceComicHero onCreateTask={onOpenNewTask} />
      {/* Daily Engineering Focus Checklist Card */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-500" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Today&apos;s Daily Engineering Focus ({focusItems.filter((i) => i.completed).length}/{focusItems.length} Done)
            </h2>
          </div>
          <form onSubmit={handleAddFocusItem} className="flex items-center gap-2">
            <select
              aria-label="Focus item task code"
              value={newFocusTaskCode}
              onChange={(e) => setNewFocusTaskCode(e.target.value)}
              className="px-2 py-1 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200"
            >
              <option value="RAY">RAY</option>
              {tasks
                .filter((t) => !t.isArchived)
                .map((t) => (
                  <option key={t.id} value={t.taskCode}>
                    {t.taskCode}
                  </option>
                ))}
            </select>
            <input
              type="text"
              aria-label="Add daily focus action item"
              value={newFocusText}
              onChange={(e) => setNewFocusText(e.target.value)}
              placeholder="Add today's priority action item..."
              className="w-52 sm:w-64 px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
            >
              + Add
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {focusItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs ${
                item.completed
                  ? 'bg-slate-50/60 dark:bg-slate-950/40 border-slate-200/70 dark:border-slate-800/60 text-slate-400 line-through'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
              }`}
            >
              <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={() => handleToggleFocusItem(item)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-mono text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                  [{item.taskCode}]
                </span>
                <span className="truncate">{item.text}</span>
              </label>
              <button
                type="button"
                onClick={() => handleDeleteFocusItem(item.id)}
                aria-label={`Remove focus item ${item.text}`}
                className="text-slate-400 hover:text-red-500 p-0.5 shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Illustrative Demo Content Notice */}
      {hasDemoTasks && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60">
          <div className="text-xs text-amber-900 dark:text-amber-200">
            <span className="font-semibold">Illustrative Sample Dataset Loaded:</span> Showing 4 sample Ray tasks (Grafana security panels, graph loading optimization, SSL/TLS Website certificate key dropdown, and placeholder mapping in <code className="font-mono">rayjobapp</code>). These are sample records only and do not claim live repository state.
          </div>
          <button
            type="button"
            onClick={onClearDemoData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 dark:hover:bg-amber-900 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove Demo Dataset
          </button>
        </div>
      )}

      {/* Filter Bar by Project & Repository */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="dash-project-filter" className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Project:
            </label>
            <select
              id="dash-project-filter"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            >
              <option value="All">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 max-w-full">
            <button
              type="button"
              onClick={() => setSelectedRepo('All')}
              className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                selectedRepo === 'All'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              All Repositories
            </button>
            {repositories.map((repo) => (
              <button
                key={repo.id}
                type="button"
                onClick={() => setSelectedRepo(repo.name)}
                className={`px-3 py-1 text-xs font-mono font-medium rounded-md whitespace-nowrap ${
                  selectedRepo === repo.name
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {repo.name}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          Timezone: {timezone} · Today: {formatUnambiguousDate(nowIso, timezone, false)}
        </div>
      </div>

      {/* 8 Real Stored Metric Cards */}
      <div className="dashboard-metrics grid grid-cols-2 xl:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigateToTasksWithFilter({ status: 'All' })}
          className="text-left p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
        >
          <div className="text-xs text-slate-500 dark:text-slate-400">Assigned Active</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {metrics.assignedCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateToTasksWithFilter({ status: 'In Progress' })}
          className="text-left p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
        >
          <div className="text-xs text-slate-500 dark:text-slate-400">In Progress</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400 mt-1">
            {metrics.inProgressCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateToTasksWithFilter({ status: 'Blocked' })}
          className="text-left p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-red-400 transition-colors"
        >
          <div className="text-xs text-slate-500 dark:text-slate-400">Blocked</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-red-600 dark:text-red-400 mt-1">
            {metrics.blockedCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateToTasksWithFilter({ status: 'Ready for Testing' })}
          className="text-left p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-400 transition-colors"
        >
          <div className="text-xs text-slate-500 dark:text-slate-400">Testing / Review</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1">
            {metrics.awaitingTestingOrReviewCount}
          </div>
        </button>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">Awaiting Push/Merge</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400 mt-1">
            {metrics.awaitingPushOrMergeCount}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigateToTasksWithFilter({ status: 'Done' })}
          className="text-left p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-400 transition-colors"
        >
          <div className="text-xs text-slate-500 dark:text-slate-400">Completed</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
            {metrics.recentlyCompletedCount}
          </div>
        </button>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">Overdue</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {metrics.overdueCount}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">Time Today / Week</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1.5">
            {formatDurationMinutes(metrics.minutesToday)} <span className="text-slate-400 font-normal">/</span>{' '}
            <span className="text-sm text-slate-600 dark:text-slate-300">{formatDurationMinutes(metrics.minutesThisWeek)}</span>
          </div>
        </div>
      </div>

      {/* Empty State if no tasks exist */}
      {filteredTasks.length === 0 ? (
        <div className="p-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4">
          <div className="empty-task-illustration"><FileText size={40} strokeWidth={1.3} /><Plus size={16} /></div>
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              No active tasks in this view
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Start recording a new engineering task for the Ray project, or load the illustrative sample dataset to explore multi-repository workflows.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenNewTask}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create First Task
            </button>
            {!hasDemoTasks && (
              <button
                type="button"
                onClick={onRestoreDemoData}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Load Sample Ray Dataset
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Continue Working + Git & Blocker Queues */}
          <div className="lg:col-span-2 space-y-6">
            {/* Continue Working Area */}
            <section aria-labelledby="continue-working-heading" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 id="continue-working-heading" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Continue Working
                </h2>
                <span className="text-xs text-slate-500">
                  Recent active tasks with direct section links
                </span>
              </div>

              <div className="space-y-3">
                {continueWorkingTasks.map((task) => {
                  const isTimerRunning = activeTimer?.taskId === task.id;
                  const passedTests = task.tests.filter((t) => t.status === 'Passed').length;
                  const blockedTests = task.tests.filter((t) => t.status === 'Blocked').length;

                  return (
                    <div
                      key={task.id}
                      className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                              {task.taskCode}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {task.status}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{task.priority} Priority</span>
                            <span aria-hidden="true">·</span>
                            <span>Updated {formatUnambiguousDate(task.updatedAt, timezone, false)}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => onOpenTask(task.id, 'overview')}
                            className="text-left text-base font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          >
                            {task.title}
                          </button>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isTimerRunning ? (
                            <button
                              type="button"
                              onClick={onStopTimer}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap"
                            >
                              <Square className="w-3.5 h-3.5" />
                              Stop Timer
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onStartTimer(task.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
                            >
                              <Play className="w-3.5 h-3.5" />
                              Start Timer
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onOpenTask(task.id, 'overview')}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap"
                          >
                            Open Task
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Repository branch & Git stepper mini summary */}
                      {task.repositories.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                          {task.repositories.map((repo) => {
                            const prog = summarizeRepositoryProgress(repo);
                            return (
                              <div
                                key={repo.id}
                                className="flex flex-wrap items-center justify-between gap-2 text-xs"
                              >
                                <div className="flex items-center gap-2 font-mono text-slate-700 dark:text-slate-300">
                                  <GitBranch className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                  <span className="font-semibold">{repo.repositoryName}</span>
                                  <span className="text-slate-400">:</span>
                                  <span className="text-slate-500">{repo.baseBranch}</span>
                                  <span className="text-slate-400">→</span>
                                  <span className="text-indigo-600 dark:text-indigo-400">{repo.workingBranch}</span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                  <span>
                                    Git {prog.completedCount}/{prog.applicableCount} ({prog.percent}%)
                                  </span>
                                  <span>·</span>
                                  <span>
                                    Commit: {prog.localCommitted ? 'Yes' : 'Pending'}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    Push: {prog.remotePushed ? 'Yes' : 'Pending'}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    Merge: {prog.devMerged ? 'Yes' : 'Pending'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Direct Deep Links into Task Sections */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => onOpenTask(task.id, 'investigation')}
                            className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Investigation
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenTask(task.id, 'files')}
                            className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 font-mono tabular-nums transition-colors"
                          >
                            <FileCode2 className="w-3.5 h-3.5" />
                            Changed Files ({task.changedFiles.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenTask(task.id, 'attachments')}
                            className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 font-mono tabular-nums transition-colors"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            Screenshots ({task.attachments.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenTask(task.id, 'testing')}
                            className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 font-mono tabular-nums transition-colors"
                          >
                            <FlaskConical className="w-3.5 h-3.5" />
                            Tests ({passedTests}/{task.tests.length} passed{blockedTests > 0 ? `, ${blockedTests} blocked` : ''})
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenTask(task.id, 'git')}
                            className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 transition-colors"
                          >
                            <GitMerge className="w-3.5 h-3.5" />
                            Git Stepper
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Secondary Queues: Awaiting Push/Merge & Blocked/Attention */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                  <span>Awaiting Push or Dev Merge</span>
                  <span className="font-mono text-xs text-sky-600 dark:text-sky-400 tabular-nums">
                    {awaitingPushMergeList.length}
                  </span>
                </h3>
                {awaitingPushMergeList.length === 0 ? (
                  <p className="text-xs text-slate-500">All committed changes are pushed and merged.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {awaitingPushMergeList.map((t) => (
                      <li key={t.id} className="py-2.5 first:pt-0 last:pb-0">
                        <button
                          type="button"
                          onClick={() => onOpenTask(t.id, 'git')}
                          className="w-full text-left group"
                        >
                          <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{t.taskCode}</span>
                            <span>{t.repositories.map((r) => r.repositoryName).join(', ')}</span>
                          </div>
                          <div className="text-xs font-medium text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 mt-0.5 truncate">
                            {t.title}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    Blocked or Overdue Tasks
                  </span>
                  <span className="font-mono text-xs text-red-600 dark:text-red-400 tabular-nums">
                    {blockedOrOverdueList.length}
                  </span>
                </h3>
                {blockedOrOverdueList.length === 0 ? (
                  <p className="text-xs text-slate-500">Zero blocked or overdue tasks right now.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {blockedOrOverdueList.map((t) => (
                      <li key={t.id} className="py-2.5 first:pt-0 last:pb-0">
                        <button
                          type="button"
                          onClick={() => onOpenTask(t.id, 'testing')}
                          className="w-full text-left group"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-semibold text-red-600 dark:text-red-400">
                              {t.taskCode} · {t.status}
                            </span>
                            <span className="font-mono text-slate-500">
                              Due {formatUnambiguousDate(t.dueDate, timezone, false)}
                            </span>
                          </div>
                          <div className="text-xs font-medium text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 mt-0.5 truncate">
                            {t.title}
                          </div>
                          {t.blockerNotes && (
                            <div className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 truncate">
                              {t.blockerNotes}
                            </div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Compact Activity Timeline & Recently Completed */}
          <div className="space-y-6">
            <section
              aria-labelledby="activity-timeline-heading"
              className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 id="activity-timeline-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Recent Engineering Activity
                </h2>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {activity.length} events
                </span>
              </div>

              {activity.length === 0 ? (
                <p className="text-xs text-slate-500">No activity recorded yet.</p>
              ) : (
                <ol className="space-y-3.5">
                  {activity.slice(0, 8).map((item) => (
                    <li
                      key={item.id}
                      className="text-xs space-y-0.5 pb-3 border-b border-slate-100 dark:border-slate-800/70 last:border-none last:pb-0"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                        <span>{item.taskCode || 'WORKSPACE'}</span>
                        <span>{formatUnambiguousDate(item.timestamp, timezone, true)}</span>
                      </div>
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {item.taskId ? (
                          <button
                            type="button"
                            onClick={() => onOpenTask(item.taskId!)}
                            className="text-left hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          >
                            {item.summary}
                          </button>
                        ) : (
                          item.summary
                        )}
                      </div>
                      {item.details && (
                        <div className="text-slate-500 dark:text-slate-400 truncate">
                          {item.details}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section
              aria-labelledby="recently-completed-heading"
              className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
            >
              <h2 id="recently-completed-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Recently Completed Tasks
              </h2>
              {recentlyCompletedList.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No tasks marked Done yet. Complete a task's verification checks to record delivery.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {recentlyCompletedList.map((t) => (
                    <li key={t.id} className="text-xs">
                      <button
                        type="button"
                        onClick={() => onOpenTask(t.id)}
                        className="w-full text-left hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        <div className="font-mono text-emerald-600 dark:text-emerald-400">
                          {t.taskCode} · Completed {formatUnambiguousDate(t.completedAt || t.updatedAt, timezone, false)}
                        </div>
                        <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                          {t.title}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
};
