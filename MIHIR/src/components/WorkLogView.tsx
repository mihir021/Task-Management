import React, { useMemo, useState } from 'react';
import {
  Clock,
  FileText,
  Plus,
  Trash2,
  Edit3,
  Copy,
  Check,
} from 'lucide-react';
import {
  TaskRecord,
  TimeEntry,
  WorkNote,
} from '../types/workspace';
import {
  formatDurationMinutes,
  formatUnambiguousDate,
} from '../lib/workspaceLogic';

interface WorkLogViewProps {
  tasks: TaskRecord[];
  timeEntries: TimeEntry[];
  workNotes: WorkNote[];
  timezone: string;
  onOpenTask: (taskId: string) => void;
  onAddTimeEntry: (payload: { taskId: string; durationMinutes: number; notes: string }) => Promise<void>;
  onUpdateTimeEntry: (entry: TimeEntry) => Promise<void>;
  onDeleteTimeEntry: (id: string) => Promise<void>;
  onSaveWorkNote: (payload: { taskId: string | null; title: string; content: string }) => Promise<void>;
  onDeleteWorkNote: (id: string) => Promise<void>;
}

export const WorkLogView: React.FC<WorkLogViewProps> = ({
  tasks,
  timeEntries,
  workNotes,
  timezone,
  onOpenTask,
  onAddTimeEntry,
  onUpdateTimeEntry,
  onDeleteTimeEntry,
  onSaveWorkNote,
  onDeleteWorkNote,
}) => {
  const [selectedTaskId, setSelectedTaskId] = useState(tasks[0]?.id || '');
  const [durationMins, setDurationMins] = useState('60');
  const [sessionNotes, setSessionNotes] = useState('');

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editMins, setEditMins] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [noteTitle, setNoteTitle] = useState('');
  const [noteTaskId, setNoteTaskId] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [copiedSummary, setCopiedSummary] = useState(false);

  const nowIso = new Date().toISOString();
  const todayStr = formatUnambiguousDate(nowIso, timezone, false);

  const dailyGroups = useMemo(() => {
    const map = new Map<string, { dateLabel: string; totalMinutes: number; entries: TimeEntry[] }>();
    for (const entry of timeEntries) {
      const label = formatUnambiguousDate(entry.startedAt, timezone, false);
      const existing = map.get(label) || { dateLabel: label, totalMinutes: 0, entries: [] };
      existing.totalMinutes += entry.durationMinutes;
      existing.entries.push(entry);
      map.set(label, existing);
    }
    return Array.from(map.values());
  }, [timeEntries, timezone]);

  const totalAllTimeMinutes = useMemo(
    () => timeEntries.reduce((acc, e) => acc + e.durationMinutes, 0),
    [timeEntries]
  );

  const todayMinutes = useMemo(
    () =>
      timeEntries
        .filter((e) => formatUnambiguousDate(e.startedAt, timezone, false) === todayStr)
        .reduce((acc, e) => acc + e.durationMinutes, 0),
    [timeEntries, timezone, todayStr]
  );

  const handleCopyStandupSummary = () => {
    const lines = [
      `# MIHIR Workspace — Engineering Work Summary (${todayStr})`,
      ``,
      `## Active / Recent Tasks`,
      ...tasks
        .filter((t) => !t.isArchived)
        .slice(0, 6)
        .map(
          (t) =>
            `- **[${t.taskCode}] ${t.title}** (${t.status}) — Repos: ${t.repositories
              .map((r) => `${r.repositoryName}:${r.workingBranch}`)
              .join(', ')}`
        ),
      ``,
      `## Recent Work Sessions`,
      ...timeEntries
        .slice(0, 8)
        .map(
          (e) =>
            `- [${formatUnambiguousDate(e.startedAt, timezone, false)}] **${e.taskCode}** (${formatDurationMinutes(
              e.durationMinutes
            )}): ${e.notes}`
        ),
    ];
    navigator.clipboard?.writeText(lines.join('\n'));
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Work Log & Engineering Notes
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Daily and weekly time summaries, editable work session history, and technical journal notes.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCopyStandupSummary}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 rounded-lg whitespace-nowrap self-start sm:self-auto"
        >
          {copiedSummary ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              Copied Standup Markdown
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy Standup Summary
            </>
          )}
        </button>
      </div>

      {/* Summary Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500">Logged Today ({todayStr})</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400 mt-1">
            {formatDurationMinutes(todayMinutes)}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500">Total Logged Across Workspace</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {formatDurationMinutes(totalAllTimeMinutes)}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500">Saved Engineering Notes</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {workNotes.length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Time Logging & Daily Grouped Sessions */}
        <div className="lg:col-span-2 space-y-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const targetId = selectedTaskId || tasks[0]?.id;
              const mins = Number(durationMins);
              if (!targetId || !mins || mins <= 0) return;
              await onAddTimeEntry({
                taskId: targetId,
                durationMinutes: mins,
                notes: sessionNotes.trim() || 'Logged work session',
              });
              setSessionNotes('');
            }}
            className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
          >
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Record Manual Time Entry
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor="wl-task" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Task
                </label>
                <select
                  id="wl-task"
                  value={selectedTaskId || tasks[0]?.id || ''}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      [{t.taskCode}] {t.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="wl-mins" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Duration (Minutes)
                </label>
                <input
                  id="wl-mins"
                  type="number"
                  min={1}
                  max={720}
                  value={durationMins}
                  onChange={(e) => setDurationMins(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Log Time
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="wl-notes" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Work Session Notes
              </label>
              <input
                id="wl-notes"
                type="text"
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="What did you investigate, code, or test during this block?"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
          </form>

          {/* Daily Grouped Work Sessions */}
          <div className="space-y-4">
            {dailyGroups.map((group) => (
              <div
                key={group.dateLabel}
                className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {group.dateLabel}
                  </span>
                  <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    Total: {formatDurationMinutes(group.totalMinutes)}
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {group.entries.map((entry) => (
                    <div key={entry.id} className="py-2.5 flex items-center justify-between gap-3">
                      {editingEntryId === entry.id ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="number"
                            value={editMins}
                            onChange={(e) => setEditMins(e.target.value)}
                            className="w-20 px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700"
                          />
                          <input
                            type="text"
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            className="flex-1 px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              await onUpdateTimeEntry({
                                ...entry,
                                durationMinutes: Number(editMins) || entry.durationMinutes,
                                notes: editNotes,
                              });
                              setEditingEntryId(null);
                            }}
                            className="px-2.5 py-1 text-xs text-white bg-indigo-600 rounded"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <>
                          <div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onOpenTask(entry.taskId)}
                                className="font-mono font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                              >
                                {entry.taskCode}
                              </button>
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {entry.taskTitle}
                              </span>
                            </div>
                            <div className="text-slate-600 dark:text-slate-400 mt-0.5">
                              {entry.notes}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-semibold tabular-nums">
                              {formatDurationMinutes(entry.durationMinutes)}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEntryId(entry.id);
                                setEditMins(String(entry.durationMinutes));
                                setEditNotes(entry.notes);
                              }}
                              aria-label="Edit time entry"
                              className="p-1 text-slate-400 hover:text-slate-700"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteTimeEntry(entry.id)}
                              aria-label="Delete time entry"
                              className="p-1 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Engineering Work Notes */}
        <div className="space-y-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!noteTitle.trim()) return;
              await onSaveWorkNote({
                taskId: noteTaskId || null,
                title: noteTitle.trim(),
                content: noteContent.trim(),
              });
              setNoteTitle('');
              setNoteContent('');
            }}
            className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
          >
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Add Engineering Note
            </h2>

            <div>
              <label htmlFor="wn-title" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Title *
              </label>
              <input
                id="wn-title"
                type="text"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Note title..."
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>

            <div>
              <label htmlFor="wn-task" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Related Task
              </label>
              <select
                id="wn-task"
                value={noteTaskId}
                onChange={(e) => setNoteTaskId(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="">General Note</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    [{t.taskCode}] {t.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="wn-content" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Content
              </label>
              <textarea
                id="wn-content"
                rows={3}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Record branch findings, commands, or architecture reminders..."
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
            >
              Save Engineering Note
            </button>
          </form>

          <div className="space-y-3">
            {workNotes.map((wn) => (
              <div
                key={wn.id}
                className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <span>{wn.taskCode || 'GENERAL'}</span>
                  <div className="flex items-center gap-2">
                    <span>{formatUnambiguousDate(wn.createdAt, timezone, false)}</span>
                    <button
                      type="button"
                      onClick={() => onDeleteWorkNote(wn.id)}
                      aria-label={`Delete note ${wn.title}`}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">{wn.title}</div>
                <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                  {wn.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
