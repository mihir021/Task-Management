import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  X,
  Plus,
  Sparkles,
  Clock,
  FileText,
  Sun,
  Moon,
  GitBranch,
  ArrowRight,
  Copy,
  Check,
  CloudUpload,
} from 'lucide-react';
import { TaskRecord } from '../types/workspace';
import { TaskDetailTab } from './TaskDetailView';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TaskRecord[];
  currentTheme: 'light' | 'dark';
  onOpenTask: (taskId: string, tab?: TaskDetailTab) => void;
  onNavigateSection: (
    section: 'dashboard' | 'tasks' | 'projects' | 'worklog' | 'copilot' | 'settings'
  ) => void;
  onOpenNewTask: () => void;
  onOpenQuickTime: () => void;
  onOpenQuickNote: () => void;
  onToggleTheme: () => void;
  onCopyDailyStandup: () => void;
  onSyncCloudNow?: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  tasks,
  currentTheme,
  onOpenTask,
  onNavigateSection,
  onOpenNewTask,
  onOpenQuickTime,
  onOpenQuickNote,
  onToggleTheme,
  onCopyDailyStandup,
  onSyncCloudNow,
}) => {
  const [queryText, setQueryText] = useState('');
  const [copiedStandup, setCopiedStandup] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setQueryText('');
      setCopiedStandup(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const matchingTasks = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    const active = tasks.filter((t) => !t.isArchived);
    if (!q) return active.slice(0, 6);
    return active.filter((t) => {
      const repoMatch = t.repositories.some(
        (r) =>
          r.repositoryName.toLowerCase().includes(q) ||
          r.workingBranch.toLowerCase().includes(q)
      );
      const fileMatch = t.changedFiles.some((f) => f.filePath.toLowerCase().includes(q));
      return (
        t.taskCode.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        repoMatch ||
        fileMatch
      );
    });
  }, [tasks, queryText]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Developer Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-950/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <Search className="w-4 h-4 text-indigo-500 shrink-0" />
          <input
            type="text"
            autoFocus
            aria-label="Command palette search"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matchingTasks.length > 0) {
                e.preventDefault();
                onOpenTask(matchingTasks[0].id, 'overview');
                onClose();
              }
            }}
            placeholder="Type a task ID (MIHIR-001), branch (RAY-MIHIR-...), file path, or daily command..."
            className="flex-1 text-sm bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none"
          />
          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
            ESC
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[440px] overflow-y-auto p-3 space-y-4">
          {/* Quick Daily Developer Actions */}
          <div>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Daily Developer Actions
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenNewTask();
                }}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left"
              >
                <span className="flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5 text-indigo-500" />
                  Create New Ray Task
                </span>
                <span className="text-[10px] font-mono text-slate-400">New</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateSection('copilot');
                }}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  Open Gemini Engineering Copilot
                </span>
                <span className="text-[10px] font-mono text-slate-400">AI Chat</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onCopyDailyStandup();
                  setCopiedStandup(true);
                  setTimeout(() => {
                    setCopiedStandup(false);
                    onClose();
                  }, 900);
                }}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left"
              >
                <span className="flex items-center gap-2">
                  {copiedStandup ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-indigo-500" />
                  )}
                  {copiedStandup ? 'Copied Daily Standup!' : 'Copy Daily Standup Summary'}
                </span>
                <span className="text-[10px] font-mono text-slate-400">Standup</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenQuickTime();
                }}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left"
              >
                <span className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  Log Work Session Time
                </span>
                <span className="text-[10px] font-mono text-slate-400">Timer</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenQuickNote();
                }}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left"
              >
                <span className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-indigo-500" />
                  Add Engineering Work Note
                </span>
                <span className="text-[10px] font-mono text-slate-400">Journal</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onToggleTheme();
                  onClose();
                }}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left"
              >
                <span className="flex items-center gap-2">
                  {currentTheme === 'dark' ? (
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                  ) : (
                    <Moon className="w-3.5 h-3.5 text-indigo-500" />
                  )}
                  Switch to {currentTheme === 'dark' ? 'Light' : 'Dark'} Theme
                </span>
                <span className="text-[10px] font-mono text-slate-400">Theme</span>
              </button>

              {onSyncCloudNow && (
                <button
                  type="button"
                  onClick={() => {
                    onSyncCloudNow();
                    onClose();
                  }}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left"
                >
                  <span className="flex items-center gap-2">
                    <CloudUpload className="w-3.5 h-3.5 text-emerald-500" />
                    Sync Local Workspace to Cloud Firestore
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Cloud</span>
                </button>
              )}
            </div>
          </div>

          {/* Matching Tasks & Direct Tab Jump */}
          <div>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Jump to Task or Section ({matchingTasks.length})
            </div>
            <div className="space-y-1.5">
              {matchingTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onOpenTask(task.id, 'overview');
                      onClose();
                    }}
                    className="text-left flex-1 min-w-0"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap shrink-0">
                        {task.taskCode}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {task.title}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <GitBranch className="w-3 h-3 text-indigo-500" />
                      <span>
                        {task.repositories.map((r) => `${r.repositoryName}:${r.workingBranch}`).join(', ')}
                      </span>
                    </div>
                  </button>

                  <div className="flex flex-wrap items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onOpenTask(task.id, 'investigation');
                        onClose();
                      }}
                      className="px-2 py-1 text-[10px] font-medium rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-500"
                    >
                      Investigation
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenTask(task.id, 'files');
                        onClose();
                      }}
                      className="px-2 py-1 text-[10px] font-medium rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-500"
                    >
                      Files ({task.changedFiles.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenTask(task.id, 'git');
                        onClose();
                      }}
                      className="px-2 py-1 text-[10px] font-medium rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-500 flex items-center gap-0.5"
                    >
                      Git Stepper
                      <ArrowRight className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
