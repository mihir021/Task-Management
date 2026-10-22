import React, { useState } from 'react';
import { X, Clock, FileText } from 'lucide-react';
import { TaskRecord } from '../types/workspace';

interface QuickLogTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TaskRecord[];
  defaultTaskId?: string;
  onLogTime: (payload: { taskId: string; durationMinutes: number; notes: string }) => Promise<void>;
}

export const QuickLogTimeModal: React.FC<QuickLogTimeModalProps> = ({
  isOpen,
  onClose,
  tasks,
  defaultTaskId,
  onLogTime,
}) => {
  const [taskId, setTaskId] = useState(defaultTaskId || tasks[0]?.id || '');
  const [durationMinutes, setDurationMinutes] = useState('45');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedTask = taskId || tasks[0]?.id;
    const mins = Number(durationMinutes);
    if (!selectedTask) {
      setError('Please select a task.');
      return;
    }
    if (Number.isNaN(mins) || mins <= 0) {
      setError('Please enter a valid positive number of minutes.');
      return;
    }
    setError('');
    await onLogTime({ taskId: selectedTask, durationMinutes: mins, notes: notes.trim() });
    setNotes('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-log-time-title"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-md overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 id="quick-log-time-title" className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Log Work Session Time
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close log time dialog"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div role="alert" className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="log-time-task" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Task
            </label>
            <select
              id="log-time-task"
              value={taskId || tasks[0]?.id || ''}
              onChange={(e) => setTaskId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.taskCode}] {t.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="log-time-minutes" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Duration (Minutes)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="log-time-minutes"
                type="number"
                min={1}
                max={720}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              {[15, 30, 60, 120].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDurationMinutes(String(preset))}
                  className="px-2.5 py-2 text-xs font-mono rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
                >
                  {preset}m
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="log-time-notes" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Work Session Notes
            </label>
            <textarea
              id="log-time-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              placeholder="What did you investigate, implement, or verify during this session?"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
            >
              Save Time Entry
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface QuickWorkNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TaskRecord[];
  onSaveNote: (payload: { taskId: string | null; title: string; content: string }) => Promise<void>;
}

export const QuickWorkNoteModal: React.FC<QuickWorkNoteModalProps> = ({
  isOpen,
  onClose,
  tasks,
  onSaveNote,
}) => {
  const [taskId, setTaskId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a title for the work note.');
      return;
    }
    setError('');
    await onSaveNote({
      taskId: taskId || null,
      title: title.trim(),
      content: content.trim(),
    });
    setTitle('');
    setContent('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-work-note-title"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-md overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 id="quick-work-note-title" className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Add Quick Engineering Note
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close work note dialog"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div role="alert" className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="note-title" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Note Title *
            </label>
            <input
              id="note-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              placeholder="e.g., Vault Certificate Alias Naming Pattern"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="note-task" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Linked Task (Optional)
            </label>
            <select
              id="note-task"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="">General Workspace Note</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.taskCode}] {t.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="note-content" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Details / Snippet / Findings
            </label>
            <textarea
              id="note-content"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              placeholder="Write down commands, branch observations, or meeting takeaways..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
            >
              Save Work Note
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
