import { mergeTaskRepositoryDraft } from "../lib/taskRepositoryDraft";
import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Play,
  Square,
  Download,
  Copy,
  Check,
  Archive,
  ArchiveRestore,
  Trash2,
  Plus,
  Save,
  Eye,
  Edit3,
  FolderGit2,
  FileCode2,
  FlaskConical,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import {
  ActiveTimerState,
  ActivityItem,
  AttachmentCategory,
  ChangeType,
  ProjectConfig,
  RepositoryConfig,
  RequiredCompletionChecks,
  TaskAttachment,
  TaskFileChange,
  TaskInvestigation,
  TaskPriority,
  TaskRecord,
  TaskRepository,
  TaskStatus,
  TaskTestRecord,
  TestStatus,
  TestType,
  TimeEntry,
} from '../types/workspace';
import {
  ALL_STATUSES,
  createDefaultGitStages,
  formatDurationMinutes,
  formatUnambiguousDate,
  generateTaskMarkdownReport,
  summarizeTaskChecklistProgress,
} from '../lib/workspaceLogic';
import { TaskAttachmentsSection } from './TaskAttachmentsSection';
import { TaskGitWorkflowSection } from './TaskGitWorkflowSection';

export type TaskDetailTab =
  | 'overview'
  | 'investigation'
  | 'files'
  | 'attachments'
  | 'testing'
  | 'git'
  | 'time';

interface TaskDetailViewProps {
  task: TaskRecord;
  initialTab?: TaskDetailTab;
  projects: ProjectConfig[];
  repositories: RepositoryConfig[];
  availableTags: string[];
  timeEntries: TimeEntry[];
  activity: ActivityItem[];
  activeTimer: ActiveTimerState | null;
  timezone: string;
  cloudTargetLabel: string;
  maxAttachmentSizeMB: number;
  completionChecks: RequiredCompletionChecks;
  onBack: () => void;
  onUpdateTask: (
    taskId: string,
    updates: Partial<TaskRecord>,
    activityMessage?: string,
    activityType?: string
  ) => Promise<void>;
  onDuplicateTask: (taskId: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onUploadAttachment: (taskId: string, payload: any) => Promise<void>;
  onUpdateAttachment: (taskId: string, attId: string, payload: Partial<TaskAttachment>) => Promise<void>;
  onDeleteAttachment: (taskId: string, attId: string) => Promise<void>;
  onStartTimer: (taskId: string) => Promise<void>;
  onStopTimer: () => Promise<void>;
  onAddTimeEntry: (payload: { taskId: string; durationMinutes: number; notes: string }) => Promise<void>;
  onUpdateTimeEntry: (entry: TimeEntry) => Promise<void>;
  onDeleteTimeEntry: (id: string) => Promise<void>;
  onSaveRepository?: (payload: Partial<RepositoryConfig>) => Promise<RepositoryConfig | null | void>;
}


function renderFormattedText(text: string) {
  if (!text || !text.trim()) {
    return <span className="italic text-slate-400">Not documented yet.</span>;
  }
  const blocks = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-2 text-xs leading-relaxed text-slate-800 dark:text-slate-200">
      {blocks.map((block, idx) => {
        if (block.startsWith('```') && block.endsWith('```')) {
          const code = block.replace(/^```\w*\n?/, '').replace(/```$/, '');
          return (
            <pre
              key={idx}
              className="p-3 rounded-lg bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto border border-slate-800"
            >
              <code>{code}</code>
            </pre>
          );
        }
        return (
          <div key={idx} className="whitespace-pre-wrap">
            {block}
          </div>
        );
      })}
    </div>
  );
}

export const TaskDetailView: React.FC<TaskDetailViewProps> = ({
  task,
  initialTab = 'overview',
  projects,
  repositories,
  availableTags,
  timeEntries,
  activity,
  activeTimer,
  timezone,
  cloudTargetLabel,
  maxAttachmentSizeMB,
  completionChecks,
  onBack,
  onUpdateTask,
  onDuplicateTask,
  onDeleteTask,
  onUploadAttachment,
  onUpdateAttachment,
  onDeleteAttachment,
  onStartTimer,
  onStopTimer,
  onAddTimeEntry,
  onUpdateTimeEntry,
  onDeleteTimeEntry,
  onSaveRepository,
}) => {
  const [activeTab, setActiveTab] = useState<TaskDetailTab>(initialTab);
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab, task.id]);

  // Overview form state
  const [overviewDraft, setOverviewDraft] = useState({
    taskCode: task.taskCode,
    title: task.title,
    description: task.description,
    ticketUrl: task.ticketUrl,
    assignedBy: task.assignedBy,
    priority: task.priority,
    status: task.status,
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
    expectedOutcome: task.expectedOutcome,
    acceptanceCriteria: task.acceptanceCriteria,
    blockerNotes: task.blockerNotes,
    projectName: task.projectName,
    tags: task.tags,
  });
  const [overviewDirty, setOverviewDirty] = useState(false);
  const [repoDraft, setRepoDraft] = useState<TaskRepository[]>(task.repositories);
  const [overviewSaving, setOverviewSaving] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [sharedBranch, setSharedBranch] = useState('');
  const [overviewSavedMsg, setOverviewSavedMsg] = useState('');

  // Investigation form state
  const [invDraft, setInvDraft] = useState<TaskInvestigation>(task.investigation);
  const [invDirty, setInvDirty] = useState(false);
  const [invPreviewMode, setInvPreviewMode] = useState(false);
  const [invSavedMsg, setInvSavedMsg] = useState('');

  // Sync when switching tasks
  useEffect(() => {
    setOverviewDraft({
      taskCode: task.taskCode,
      title: task.title,
      description: task.description,
      ticketUrl: task.ticketUrl,
      assignedBy: task.assignedBy,
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
      expectedOutcome: task.expectedOutcome,
      acceptanceCriteria: task.acceptanceCriteria,
      blockerNotes: task.blockerNotes,
      projectName: task.projectName,
      tags: task.tags,
    });
    setOverviewDirty(false);
    setRepoDraft(task.repositories);
    setSharedBranch('');
    setOverviewError('');
    setInvDraft(task.investigation);
    setInvDirty(false);
  }, [task.id]);

  // Changed File new record form
  const [newFileRepo, setNewFileRepo] = useState(
    task.repositories[0]?.repositoryName || repositories[0]?.name || 'raydashboard'
  );
  const [newFilePath, setNewFilePath] = useState('');
  const [newFileType, setNewFileType] = useState<ChangeType>('Modified');
  const [newFileWhat, setNewFileWhat] = useState('');
  const [newFileWhy, setNewFileWhy] = useState('');
  const [newFileContrib, setNewFileContrib] = useState('');
  const [newFileSnippet, setNewFileSnippet] = useState('');
  const [newFileCommit, setNewFileCommit] = useState('');
  const [newFileTestNotes, setNewFileTestNotes] = useState('');
  const [copiedFileKey, setCopiedFileKey] = useState<string | null>(null);

  // Testing new record form
  const [newTestTitle, setNewTestTitle] = useState('');
  const [newTestType, setNewTestType] = useState<TestType>('Manual');
  const [newTestStatus, setNewTestStatus] = useState<TestStatus>('Passed');
  const [newTestCmd, setNewTestCmd] = useState('');
  const [newTestExpected, setNewTestExpected] = useState('');
  const [newTestActual, setNewTestActual] = useState('');
  const [newTestBlockedReason, setNewTestBlockedReason] = useState('');
  const [newTestLogs, setNewTestLogs] = useState('');

  // Time entry form
  const [manualMins, setManualMins] = useState('45');
  const [manualTimeNotes, setManualTimeNotes] = useState('');
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editingTimeMins, setEditingTimeMins] = useState('');
  const [editingTimeNotes, setEditingTimeNotes] = useState('');

  // Confirm delete task
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // Inline custom repo / folder form in Section B
  const [showAddCustomRepo, setShowAddCustomRepo] = useState(false);
  const [customRepoName, setCustomRepoName] = useState('');
  const [customRepoBaseBranch, setCustomRepoBaseBranch] = useState('development');
  const [addingCustomRepo, setAddingCustomRepo] = useState(false);

  const checklistProgress = summarizeTaskChecklistProgress(task);

  const handleToggleChecklistItem = async (subtaskId: string) => {
    const updatedSubtasks = checklistProgress.items.map((item) =>
      item.id === subtaskId ? { ...item, completed: !item.completed } : item
    );
    await onUpdateTask(task.id, { subtasks: updatedSubtasks });
  };

  const handleAddChecklistItem = async () => {
    if (!newSubtaskTitle.trim()) return;
    const newItem = {
      id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: newSubtaskTitle.trim(),
      completed: false,
    };
    await onUpdateTask(
      task.id,
      { subtasks: [...checklistProgress.items, newItem] },
      `Added sub-task "${newItem.title}" to ${task.taskCode}`,
      'note'
    );
    setNewSubtaskTitle('');
  };

  const handleRemoveChecklistItem = async (subtaskId: string) => {
    const updatedSubtasks = checklistProgress.items.filter((item) => item.id !== subtaskId);
    await onUpdateTask(task.id, { subtasks: updatedSubtasks });
  };

  const isTimerRunning = activeTimer?.taskId === task.id;
  const taskTimeEntries = timeEntries.filter((te) => te.taskId === task.id);
  const totalTaskMinutes = taskTimeEntries.reduce((acc, te) => acc + te.durationMinutes, 0);
  const taskActivity = activity.filter((a) => a.taskId === task.id);

  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedFileKey(key);
    setTimeout(() => setCopiedFileKey(null), 1500);
  };

  const handleSaveOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (overviewSaving) return;
    setOverviewSaving(true); setOverviewError('');
    try {
    await onUpdateTask(
      task.id,
      {
        repositories: mergeTaskRepositoryDraft(task.repositories, repoDraft),
        taskCode: overviewDraft.taskCode.trim() || task.taskCode,
        title: overviewDraft.title.trim() || task.title,
        description: overviewDraft.description,
        ticketUrl: overviewDraft.ticketUrl,
        assignedBy: overviewDraft.assignedBy,
        dueDate: overviewDraft.dueDate ? new Date(overviewDraft.dueDate).toISOString() : null,
        expectedOutcome: overviewDraft.expectedOutcome,
        acceptanceCriteria: overviewDraft.acceptanceCriteria,
        blockerNotes: overviewDraft.blockerNotes,
        projectName: overviewDraft.projectName,
        tags: overviewDraft.tags,
      },
      `Updated overview details for ${overviewDraft.taskCode}`,
      'note'
    );
    setOverviewDirty(false);
    setOverviewSavedMsg('Saved');
    setTimeout(() => setOverviewSavedMsg(''), 2000);
    } catch (error: any) { setOverviewError(error.message || 'Unable to save. Your edits are still here.'); }
    finally { setOverviewSaving(false); }
  };

  const handleSaveInvestigation = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateTask(
      task.id,
      { investigation: invDraft },
      `Saved problem investigation & root cause notes on ${task.taskCode}`,
      'note'
    );
    setInvDirty(false);
    setInvSavedMsg('All changes saved to SQLite');
    setTimeout(() => setInvSavedMsg(''), 2500);
  };

  const handleAddRepositoryToTask = async (repoCfg: RepositoryConfig) => {
    if (repoDraft.some((r) => r.repositoryName === repoCfg.name)) return;
    const repoLinkId = `${task.id}-repo-${Date.now()}`;
    const workingBranch = sharedBranch || `RAY-${task.taskCode}`;
    const newRepoLink: TaskRepository = {
      id: repoLinkId,
      repositoryId: repoCfg.id,
      repositoryName: repoCfg.name,
      remoteUrl: repoCfg.remoteUrl,
      localFolderPath: repoCfg.localFolderPath,
      baseBranch: repoCfg.defaultBaseBranch,
      workingBranch,
      devTargetBranch: repoCfg.defaultDevBranch,
      cloudTargetName: repoCfg.cloudTargetName,
      workflowMode: repoCfg.defaultWorkflowMode,
      stages: createDefaultGitStages(
        repoLinkId,
        repoCfg.defaultBaseBranch,
        workingBranch,
        repoCfg.defaultDevBranch,
        repoCfg.cloudTargetName,
        repoCfg.defaultWorkflowMode
      ),
    };
    setRepoDraft(prev => [...prev, newRepoLink]);
    setOverviewDirty(true);
  };

  const handleAddCustomRepositoryInline = async () => {
    const trimmed = customRepoName.trim();
    if (!trimmed) return;
    setAddingCustomRepo(true);
    try {
      const baseBranch = customRepoBaseBranch.trim() || 'development';
      let savedRepo: RepositoryConfig | null | void = null;
      if (onSaveRepository) {
        savedRepo = await onSaveRepository({
          name: trimmed,
          projectName: task.projectName || 'Ray',
          localFolderPath: trimmed,
          defaultBaseBranch: baseBranch,
          defaultDevBranch: baseBranch,
          defaultWorkflowMode: 'PR-Based',
        });
      }
      const repoCfg: RepositoryConfig =
        savedRepo && typeof savedRepo === 'object' && 'id' in savedRepo
          ? (savedRepo as RepositoryConfig)
          : {
              id: `repo-${trimmed.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`,
              projectId: 'proj-ray',
              projectName: task.projectName || 'Ray',
              name: trimmed,
              description: 'Custom workspace repository / folder',
              remoteUrl: '',
              localFolderPath: trimmed,
              defaultBaseBranch: baseBranch,
              defaultDevBranch: baseBranch,
              cloudTargetName: 'cloud-release',
              cloudTargetType: 'Branch',
              defaultWorkflowMode: 'PR-Based',
            };
      await handleAddRepositoryToTask(repoCfg);
      setCustomRepoName('');
      setCustomRepoBaseBranch('development');
      setShowAddCustomRepo(false);
    } finally {
      setAddingCustomRepo(false);
    }
  };

  const handleUpdateRepoMeta = async (
    repoId: string,
    field: keyof TaskRepository,
    value: string
  ) => {
    setRepoDraft(prev => prev.map(r => r.id === repoId ? { ...r, [field]: value, ...(field === 'baseBranch' ? { devTargetBranch: value } : {}) } : r));
    setOverviewDirty(true);
  };

  const handleRemoveRepoFromTask = async (repoId: string) => {
    setRepoDraft(prev => prev.filter(r => r.id !== repoId));
    setOverviewDirty(true);
  };

  const handleAddFileChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFilePath.trim()) return;
    const fc: TaskFileChange = {
      id: `fc-${Date.now()}`,
      repositoryName: newFileRepo,
      filePath: newFilePath.trim(),
      changeType: newFileType,
      whatChanged: newFileWhat.trim(),
      whyChanged: newFileWhy.trim(),
      solutionContribution: newFileContrib.trim(),
      codeSnippet: newFileSnippet,
      relatedCommit: newFileCommit.trim(),
      testingNotes: newFileTestNotes.trim(),
      createdAt: new Date().toISOString(),
    };
    await onUpdateTask(
      task.id,
      { changedFiles: [fc, ...task.changedFiles] },
      `Recorded ${fc.changeType} file ${fc.filePath} (${fc.repositoryName})`,
      'file'
    );
    setNewFilePath('');
    setNewFileWhat('');
    setNewFileWhy('');
    setNewFileContrib('');
    setNewFileSnippet('');
    setNewFileCommit('');
    setNewFileTestNotes('');
  };

  const handleDeleteFileChange = async (fileId: string) => {
    await onUpdateTask(
      task.id,
      { changedFiles: task.changedFiles.filter((f) => f.id !== fileId) },
      `Removed file change record from ${task.taskCode}`,
      'file'
    );
  };

  const handleAddTestRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTestTitle.trim()) return;
    const tr: TaskTestRecord = {
      id: `test-${Date.now()}`,
      title: newTestTitle.trim(),
      testType: newTestType,
      commandOrSteps: newTestCmd.trim(),
      expectedResult: newTestExpected.trim(),
      actualResult: newTestActual.trim(),
      status: newTestStatus,
      testedAt: new Date().toISOString(),
      relatedAttachmentId: null,
      logs: newTestLogs,
      blockedOrSkippedReason:
        newTestStatus === 'Blocked' || newTestStatus === 'Skipped'
          ? newTestBlockedReason.trim()
          : '',
    };
    await onUpdateTask(
      task.id,
      { tests: [tr, ...task.tests] },
      `Added ${tr.testType} test "${tr.title}" with status ${tr.status}`,
      'test'
    );
    setNewTestTitle('');
    setNewTestCmd('');
    setNewTestExpected('');
    setNewTestActual('');
    setNewTestBlockedReason('');
    setNewTestLogs('');
  };

  const handleUpdateTestStatus = async (
    testId: string,
    status: TestStatus,
    blockedReason?: string
  ) => {
    const updatedTests = task.tests.map((t) =>
      t.id === testId
        ? {
            ...t,
            status,
            testedAt: new Date().toISOString(),
            blockedOrSkippedReason:
              blockedReason !== undefined ? blockedReason : t.blockedOrSkippedReason,
          }
        : t
    );
    await onUpdateTask(
      task.id,
      { tests: updatedTests },
      `Updated test status to ${status} on ${task.taskCode}`,
      'test'
    );
  };

  const handleDeleteTestRecord = async (testId: string) => {
    await onUpdateTask(task.id, {
      tests: task.tests.filter((t) => t.id !== testId),
    });
  };

  const handleExportTaskReport = () => {
    const markdown = generateTaskMarkdownReport(task, taskTimeEntries, timezone);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${task.taskCode}-engineering-report.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const TABS: Array<{ id: TaskDetailTab; label: string; count?: number }> = [
    { id: 'overview', label: 'Details', count: task.repositories.length },
    { id: 'investigation', label: 'Investigation' },
    { id: 'files', label: 'Changed Files', count: task.changedFiles.length },
    { id: 'attachments', label: 'Screenshots', count: task.attachments.length },
    { id: 'testing', label: 'Testing', count: task.tests.length },
    { id: 'git', label: 'Git & Release' },
    { id: 'time', label: 'Time & Activity', count: taskTimeEntries.length },
  ];

  return (
    <div className="space-y-6">
      {/* Sticky/Top Task Detail Header */}
      <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Tasks
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {isTimerRunning ? (
              <button
                type="button"
                onClick={onStopTimer}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 rounded-lg"
              >
                <Square className="w-3.5 h-3.5" />
                Stop Timer
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onStartTimer(task.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg"
              >
                <Play className="w-3.5 h-3.5" />
                Start Timer
              </button>
            )}

            <button
              type="button"
              onClick={handleExportTaskReport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              Export Report (.md)
            </button>

            <button
              type="button"
              onClick={() => onDuplicateTask(task.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 rounded-lg"
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicate
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdateTask(
                  task.id,
                  { isArchived: !task.isArchived },
                  task.isArchived ? `Recovered ${task.taskCode} from archive` : `Archived ${task.taskCode}`,
                  'status'
                )
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 rounded-lg"
            >
              {task.isArchived ? (
                <>
                  <ArchiveRestore className="w-3.5 h-3.5 text-amber-500" />
                  Recover Task
                </>
              ) : (
                <>
                  <Archive className="w-3.5 h-3.5" />
                  Archive
                </>
              )}
            </button>

            {confirmDelete ? (
              <button
                type="button"
                onClick={() => onDeleteTask(task.id)}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-500"
              >
                Confirm Permanent Delete
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete task"
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                {task.taskCode}
              </span>
              <span>·</span>
              <span>Project: {task.projectName}</span>
              <span>·</span>
              <span>Assigned: {formatUnambiguousDate(task.assignedAt, timezone, true)}</span>
              <span>·</span>
              <span>Time Logged: {formatDurationMinutes(totalTaskMinutes)}</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {task.title}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div>
              <label htmlFor="detail-header-status" className="block text-[10px] text-slate-500 mb-0.5">
                Task Status
              </label>
              <select
                id="detail-header-status"
                value={task.status}
                onChange={(e) => {
                  const next = e.target.value as TaskStatus;
                  setOverviewDraft((prev) => ({ ...prev, status: next }));
                  onUpdateTask(task.id, { status: next });
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                {ALL_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="detail-header-priority" className="block text-[10px] text-slate-500 mb-0.5">
                Priority
              </label>
              <select
                id="detail-header-priority"
                value={task.priority}
                onChange={(e) => {
                  const next = e.target.value as TaskPriority;
                  setOverviewDraft((prev) => ({ ...prev, priority: next }));
                  onUpdateTask(task.id, { priority: next });
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
          </div>
        </div>

        {/* Navigation Tabs inside Task Detail */}
        <div
          role="tablist"
          aria-label="Task detail sections"
          className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-slate-200 dark:border-slate-800"
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      active ? 'text-indigo-100' : 'text-slate-400'
                    }`}
                  >
                    ({tab.count})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: Overview & Workspace (Sections A & B) */}
      {activeTab === 'overview' && (
        <form onSubmit={handleSaveOverview} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); if (!overviewSaving) e.currentTarget.requestSubmit(); } }} className="task-simple-editor surface p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-semibold">Task details</h2><p className="text-xs text-slate-500 mt-1">Describe the work. Pick your folders. Add the branches.</p></div>
            <span role="status" className="text-xs text-slate-500">{overviewSaving ? 'Saving…' : overviewDirty ? 'Unsaved changes' : overviewSavedMsg || 'All changes saved'}</span>
          </div>
          {overviewError && <p role="alert" className="text-sm text-red-600">{overviewError}</p>}
          <fieldset disabled={overviewSaving} className="space-y-5 min-w-0">
          <label className="block text-sm font-medium">Task title<input aria-label="Task title" required value={overviewDraft.title} onChange={e => { setOverviewDraft({ ...overviewDraft, title: e.target.value }); setOverviewDirty(true); }} className="field block w-full mt-2" /></label>
          <label className="block text-sm font-medium">Description<textarea aria-label="Task description" rows={4} value={overviewDraft.description} onChange={e => { setOverviewDraft({ ...overviewDraft, description: e.target.value }); setOverviewDirty(true); }} placeholder="What needs to change? Paste the request or explain it in your own words…" className="field block w-full mt-2" /></label>
          <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <FolderGit2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Folders & branches
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Choose the folders you work in, then enter a branch for each.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCustomRepo((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/80 hover:bg-indigo-100 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                {showAddCustomRepo ? 'Cancel' : 'Add Repo / Folder'}
              </button>
            </div>

            {showAddCustomRepo && (
              <div className="p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/70 space-y-2">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Add Custom Repository or Folder
                </div>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={customRepoName}
                    onChange={(e) => setCustomRepoName(e.target.value)}
                    placeholder="Repo or custom folder name..."
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customRepoBaseBranch}
                      onChange={(e) => setCustomRepoBaseBranch(e.target.value)}
                      placeholder="Base branch (e.g. development)"
                      className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <button
                      type="button"
                      disabled={addingCustomRepo}
                      onClick={handleAddCustomRepositoryInline}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white whitespace-nowrap disabled:opacity-50"
                    >
                      {addingCustomRepo ? 'Adding...' : 'Add & Attach'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Choose folders:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {repositories.map((repo) => {
                  const attached = repoDraft.some((r) => r.repositoryName === repo.name);
                  return (
                    <button
                      key={repo.id}
                      type="button"
                      aria-pressed={attached}
                      onClick={() => { const linked = repoDraft.find(r => r.repositoryName === repo.name); if (linked) void handleRemoveRepoFromTask(linked.id); else void handleAddRepositoryToTask(repo); }}
                      className={`px-2.5 py-1 text-xs font-mono rounded-lg border transition-colors ${
                        attached
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-800 '
                          : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
                      }`}
                    >
                      {attached ? `✓ ${repo.name}` : `+ ${repo.name}`}
                    </button>
                  );
                })}
              </div>
            </div>

            {repoDraft.length > 1 && <label className="block text-xs text-slate-500">Use the same branch for all selected folders <span className="text-slate-400">optional</span><input aria-label="Branch for all selected folders" value={sharedBranch} placeholder="Type once to fill every folder" onChange={event => { const value = event.target.value; setSharedBranch(value); setRepoDraft(prev => prev.map(r => ({ ...r, workingBranch: value }))); setOverviewDirty(true); }} className="field block w-full mt-2" /></label>}
            <div className="space-y-4">
              {repoDraft.map((repo) => (
                <div
                  key={repo.id}
                  className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {repo.repositoryName}
                    </span>
                    {(
                      <button
                        type="button"
                        onClick={() => handleRemoveRepoFromTask(repo.id)}
                        className="text-[11px] text-slate-400 hover:text-red-500"
                      >
                        Unlink
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">Base branch</label>
                      <input
                        type="text"
                        aria-label={`Base branch for ${repo.repositoryName}`} value={repo.baseBranch}
                        onChange={(e) =>
                          handleUpdateRepoMeta(repo.id, 'baseBranch', e.target.value)
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">Branch you are working on</label>
                      <input
                        type="text"
                        aria-label={`Working branch for ${repo.repositoryName}`} placeholder="e.g. RAY-MIHIR-FIX-LOGS" value={repo.workingBranch}
                        onChange={(e) =>
                          handleUpdateRepoMeta(repo.id, 'workingBranch', e.target.value)
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <details className="task-extra-details border-t border-slate-200 pt-4"><summary className="cursor-pointer text-sm font-medium">Extra details <span className="text-xs text-slate-500">optional · due date, assignment, acceptance criteria, tags</span></summary><div className="space-y-4 mt-4">            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Assigned By
                </label>
                <input
                  type="text"
                  value={overviewDraft.assignedBy}
                  onChange={(e) => {
                    setOverviewDraft({ ...overviewDraft, assignedBy: e.target.value });
                    setOverviewDirty(true);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={overviewDraft.dueDate}
                  onChange={(e) => {
                    setOverviewDraft({ ...overviewDraft, dueDate: e.target.value });
                    setOverviewDirty(true);
                  }}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Task Source / Ticket URL
                </label>
                <input
                  type="text"
                  value={overviewDraft.ticketUrl}
                  onChange={(e) => {
                    setOverviewDraft({ ...overviewDraft, ticketUrl: e.target.value });
                    setOverviewDirty(true);
                  }}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Expected Outcome
                </label>
                <textarea
                  rows={3}
                  value={overviewDraft.expectedOutcome}
                  onChange={(e) => {
                    setOverviewDraft({ ...overviewDraft, expectedOutcome: e.target.value });
                    setOverviewDirty(true);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Acceptance Criteria
                </label>
                <textarea
                  rows={3}
                  value={overviewDraft.acceptanceCriteria}
                  onChange={(e) => {
                    setOverviewDraft({ ...overviewDraft, acceptanceCriteria: e.target.value });
                    setOverviewDirty(true);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                Blocker Notes (When Blocked or Awaiting Dependency)
              </label>
              <textarea
                rows={2}
                value={overviewDraft.blockerNotes}
                onChange={(e) => {
                  setOverviewDraft({ ...overviewDraft, blockerNotes: e.target.value });
                  setOverviewDirty(true);
                }}
                placeholder="Document any active blockers, external dependencies, or environment issues..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/20 dark:bg-red-950/20"
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Tags
              </span>
              <div className="flex flex-wrap gap-1.5">
                {availableTags.map((tag) => {
                  const selected = overviewDraft.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? overviewDraft.tags.filter((t) => t !== tag)
                          : [...overviewDraft.tags, tag];
                        setOverviewDraft({ ...overviewDraft, tags: next });
                        setOverviewDirty(true);
                      }}
                      className={`px-2.5 py-1 rounded text-xs transition-colors ${
                        selected
                          ? 'bg-indigo-600 text-white font-medium'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </div>
            </div>

</div></details>
          <details className="task-extra-details border-t border-slate-200 pt-4"><summary className="cursor-pointer text-sm font-medium">Checklist <span className="text-xs text-slate-500">optional · {checklistProgress.completedCount}/{checklistProgress.totalCount} done</span></summary>            {/* Sub-tasks & Execution Checklist */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Sub-tasks & Execution Checklist
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Track granular engineering steps. Progress is surfaced in the My Tasks list and Kanban views.
                  </p>
                </div>
                {checklistProgress.hasChecklist && (
                  <span className="font-mono text-xs font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
                    {checklistProgress.completedCount}/{checklistProgress.totalCount} ({checklistProgress.percent}%)
                  </span>
                )}
              </div>

              {checklistProgress.hasChecklist && (
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      checklistProgress.isComplete
                        ? 'bg-emerald-500 dark:bg-emerald-400'
                        : 'bg-indigo-600 dark:bg-indigo-400'
                    }`}
                    style={{ width: `${checklistProgress.percent}%` }}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                {checklistProgress.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800"
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleChecklistItem(item.id)}
                      className="flex items-center gap-2 text-left text-xs flex-1"
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                          item.completed
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        {item.completed && <Check className="w-3 h-3" />}
                      </span>
                      <span
                        className={
                          item.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-800 dark:text-slate-200'
                        }
                      >
                        {item.title}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveChecklistItem(item.id)}
                      aria-label={`Remove sub-task ${item.title}`}
                      className="p-1 text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddChecklistItem();
                    }
                  }}
                  placeholder="Add a sub-task or checklist item..."
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={handleAddChecklistItem}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Sub-task
                </button>
              </div>
            </div>
</details>
          </fieldset>
          <div className="task-save-bar flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><span className="text-xs text-slate-500">Description and folder branches save together.</span><button type="submit" disabled={overviewSaving || !overviewDirty} className="primary-button"><Save size={15} />{overviewSaving ? 'Saving…' : 'Save changes'}</button></div>
        </form>
      )}

      {/* TAB 2: Problem & Investigation (Section C) */}
      {activeTab === 'investigation' && (
        <form
          onSubmit={handleSaveInvestigation}
          className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                C. Problem Investigation & Engineering Journal
              </h2>
              <p className="text-xs text-slate-500">
                Document the issue, root cause, options considered, and why the final solution was chosen so it makes sense months later. Supports code blocks (<code className="font-mono">```</code>) and lists.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <span
                className={`text-xs font-medium ${
                  invDirty
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {invDirty ? '● Unsaved edits' : invSavedMsg || '✓ Saved'}
              </span>

              <button
                type="button"
                onClick={() => setInvPreviewMode(!invPreviewMode)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                {invPreviewMode ? (
                  <>
                    <Edit3 className="w-3.5 h-3.5" /> Edit Fields
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" /> Formatted View
                  </>
                )}
              </button>

              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
              >
                <Save className="w-3.5 h-3.5" />
                Save Investigation
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {(
              [
                ['originalRequirement', '1. Original Requirement'],
                ['stepsToReproduce', '2. Steps to Reproduce'],
                ['actualBehavior', '3. Actual Behavior (Before Change)'],
                ['expectedBehavior', '4. Expected Behavior'],
                ['investigationNotes', '5. Investigation Notes & Clues'],
                ['rootCause', '6. Root Cause Identified'],
                ['approachesConsidered', '7. Approaches Considered'],
                ['finalSolution', '8. Final Solution Implemented'],
                ['whyChosen', '9. Why This Solution Was Chosen'],
                ['limitationsFollowUp', '10. Remaining Limitations or Follow-up Work'],
              ] as Array<[keyof TaskInvestigation, string]>
            ).map(([key, label]) => (
              <div
                key={key}
                className="p-4 rounded-lg bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2"
              >
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {label}
                </label>
                {invPreviewMode ? (
                  renderFormattedText(invDraft[key])
                ) : (
                  <textarea
                    rows={4}
                    value={invDraft[key]}
                    onChange={(e) => {
                      setInvDraft({ ...invDraft, [key]: e.target.value });
                      setInvDirty(true);
                    }}
                    placeholder={`Document ${label.toLowerCase()}...`}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans"
                  />
                )}
              </div>
            ))}
          </div>
        </form>
      )}

      {/* TAB 3: Changed Files (Section D) */}
      {activeTab === 'files' && (
        <div className="space-y-6">
          <form
            onSubmit={handleAddFileChange}
            className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Record a Changed File & Rationale
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label htmlFor="fc-repo" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Repository
                </label>
                <select
                  id="fc-repo"
                  value={newFileRepo}
                  onChange={(e) => setNewFileRepo(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  {repositories.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="fc-path" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  File Path (Monospace) *
                </label>
                <input
                  id="fc-path"
                  type="text"
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  placeholder="src/features/ssl/SslTlsProfileModal.tsx"
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>

              <div>
                <label htmlFor="fc-type" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Change Type
                </label>
                <select
                  id="fc-type"
                  value={newFileType}
                  onChange={(e) => setNewFileType(e.target.value as ChangeType)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  <option value="Modified">Modified</option>
                  <option value="Added">Added</option>
                  <option value="Deleted">Deleted</option>
                  <option value="Renamed">Renamed</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="fc-what" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  What Changed
                </label>
                <textarea
                  id="fc-what"
                  rows={2}
                  value={newFileWhat}
                  onChange={(e) => setNewFileWhat(e.target.value)}
                  placeholder="Added Website certificate key select field..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <div>
                <label htmlFor="fc-why" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Why This File Needed to Change
                </label>
                <textarea
                  id="fc-why"
                  rows={2}
                  value={newFileWhy}
                  onChange={(e) => setNewFileWhy(e.target.value)}
                  placeholder="Required to bind key alias before submitting..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <div>
                <label htmlFor="fc-contrib" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  How It Contributes to Solution
                </label>
                <textarea
                  id="fc-contrib"
                  rows={2}
                  value={newFileContrib}
                  onChange={(e) => setNewFileContrib(e.target.value)}
                  placeholder="Prevents invalid certificate placeholder strings..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor="fc-snippet" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Optional Code Snippet or Diff
                </label>
                <textarea
                  id="fc-snippet"
                  rows={2}
                  value={newFileSnippet}
                  onChange={(e) => setNewFileSnippet(e.target.value)}
                  placeholder="+ const [websiteCertKey, setWebsiteCertKey] = useState('');"
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <div className="space-y-2">
                <div>
                  <label htmlFor="fc-commit" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Related Commit Hash
                  </label>
                  <input
                    id="fc-commit"
                    type="text"
                    value={newFileCommit}
                    onChange={(e) => setNewFileCommit(e.target.value)}
                    placeholder="e.g. e39a10f"
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Changed File
                  </button>
                </div>
              </div>
            </div>
          </form>

          <div className="space-y-3">
            {task.changedFiles.length === 0 ? (
              <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                No changed files documented for this task yet.
              </div>
            ) : (
              task.changedFiles.map((fc) => (
                <div
                  key={fc.id}
                  className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                        [{fc.repositoryName}]
                      </span>
                      <code className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100">
                        {fc.filePath}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyText(fc.id, fc.filePath)}
                        aria-label={`Copy path ${fc.filePath}`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                      >
                        {copiedFileKey === fc.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" /> Copy Path
                          </>
                        )}
                      </button>
                      <span className="text-xs text-slate-500">· {fc.changeType}</span>
                      {fc.relatedCommit && (
                        <span className="text-xs font-mono text-slate-500">
                          · Commit: {fc.relatedCommit}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteFileChange(fc.id)}
                      aria-label={`Remove file record ${fc.filePath}`}
                      className="p-1.5 rounded text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="font-semibold text-slate-700 dark:text-slate-300 mb-0.5">
                        What Changed
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">{fc.whatChanged || '—'}</p>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-700 dark:text-slate-300 mb-0.5">
                        Why Needed
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">{fc.whyChanged || '—'}</p>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-700 dark:text-slate-300 mb-0.5">
                        Contribution to Solution
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        {fc.solutionContribution || '—'}
                      </p>
                    </div>
                  </div>

                  {fc.codeSnippet && (
                    <pre className="p-3 rounded-lg bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto border border-slate-800">
                      <code>{fc.codeSnippet}</code>
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Screenshots & Attachments (Section E) */}
      {activeTab === 'attachments' && (
        <TaskAttachmentsSection
          task={task}
          timezone={timezone}
          maxSizeMB={maxAttachmentSizeMB}
          onUploadAttachment={(payload) => onUploadAttachment(task.id, payload)}
          onUpdateAttachment={(attId, payload) => onUpdateAttachment(task.id, attId, payload)}
          onDeleteAttachment={(attId) => onDeleteAttachment(task.id, attId)}
        />
      )}

      {/* TAB 5: Testing & Verification (Section F) */}
      {activeTab === 'testing' && (
        <div className="space-y-6">
          <form
            onSubmit={handleAddTestRecord}
            className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Record Verification Test Result
              </h2>
              <span className="text-xs text-slate-500">
                Blocked checks are strictly separated and never count as passed.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor="test-title" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Test Title *
                </label>
                <input
                  id="test-title"
                  type="text"
                  value={newTestTitle}
                  onChange={(e) => setNewTestTitle(e.target.value)}
                  placeholder="e.g., Verify SSL/TLS certificate key dropdown validation"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>

              <div>
                <label htmlFor="test-type" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Test Type
                </label>
                <select
                  id="test-type"
                  value={newTestType}
                  onChange={(e) => setNewTestType(e.target.value as TestType)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  <option value="Manual">Manual</option>
                  <option value="Unit">Unit</option>
                  <option value="Integration">Integration</option>
                  <option value="Build">Build</option>
                  <option value="Lint">Lint</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="test-status" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Status
                </label>
                <select
                  id="test-status"
                  value={newTestStatus}
                  onChange={(e) => setNewTestStatus(e.target.value as TestStatus)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  <option value="Passed">Passed</option>
                  <option value="Failed">Failed</option>
                  <option value="Blocked">Blocked</option>
                  <option value="Not Run">Not Run</option>
                  <option value="Skipped">Skipped</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="test-cmd" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Command or Reproduction Steps
                </label>
                <input
                  id="test-cmd"
                  type="text"
                  value={newTestCmd}
                  onChange={(e) => setNewTestCmd(e.target.value)}
                  placeholder="npm test -- SslTlsProfileModal.test.tsx"
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <div>
                <label htmlFor="test-expected" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Expected Result
                </label>
                <input
                  id="test-expected"
                  type="text"
                  value={newTestExpected}
                  onChange={(e) => setNewTestExpected(e.target.value)}
                  placeholder="All assertions pass with 0 errors"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <div>
                <label htmlFor="test-actual" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Actual Result
                </label>
                <input
                  id="test-actual"
                  type="text"
                  value={newTestActual}
                  onChange={(e) => setNewTestActual(e.target.value)}
                  placeholder="Observed outcome..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
            </div>

            {(newTestStatus === 'Blocked' || newTestStatus === 'Skipped') && (
              <div>
                <label htmlFor="test-blocked-reason" className="block text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                  Reason for {newTestStatus} Check *
                </label>
                <input
                  id="test-blocked-reason"
                  type="text"
                  value={newTestBlockedReason}
                  onChange={(e) => setNewTestBlockedReason(e.target.value)}
                  placeholder="Explain why this test is blocked or skipped..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/30"
                />
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Test Record
              </button>
            </div>
          </form>

          <div className="space-y-3">
            {task.tests.map((t) => {
              const isBlocked = t.status === 'Blocked';
              const isFailed = t.status === 'Failed';
              const isPassed = t.status === 'Passed';

              return (
                <div
                  key={t.id}
                  className={`p-5 rounded-xl border space-y-3 ${
                    isBlocked
                      ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
                      : isFailed
                      ? 'bg-red-50/50 dark:bg-red-950/20 border-red-300 dark:border-red-800'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`text-xs font-mono font-bold uppercase ${
                          isPassed
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : isBlocked
                            ? 'text-amber-700 dark:text-amber-400'
                            : isFailed
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-500'
                        }`}
                      >
                        [{t.status === 'Blocked' ? 'BLOCKED — NOT PASSED' : t.status}]
                      </span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {t.title}
                      </span>
                      <span className="text-xs text-slate-500">· {t.testType}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Change status for test ${t.title}`}
                        value={t.status}
                        onChange={(e) =>
                          handleUpdateTestStatus(t.id, e.target.value as TestStatus)
                        }
                        className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        <option value="Passed">Passed</option>
                        <option value="Failed">Failed</option>
                        <option value="Blocked">Blocked</option>
                        <option value="Not Run">Not Run</option>
                        <option value="Skipped">Skipped</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleDeleteTestRecord(t.id)}
                        aria-label={`Delete test ${t.title}`}
                        className="p-1.5 rounded text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {t.commandOrSteps && (
                    <div className="text-xs font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-950 px-3 py-1.5 rounded">
                      $ {t.commandOrSteps}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        Expected:{' '}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400">
                        {t.expectedResult || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        Actual:{' '}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400">
                        {t.actualResult || '—'}
                      </span>
                    </div>
                  </div>

                  {(t.status === 'Blocked' || t.status === 'Skipped') && (
                    <div className="p-2.5 rounded bg-amber-100/70 dark:bg-amber-950/50 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>
                        <strong>{t.status} Reason:</strong>{' '}
                        {t.blockedOrSkippedReason || 'No reason documented yet.'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 6: Git & Release Workflow (Section 7) */}
      {activeTab === 'git' && (
        <TaskGitWorkflowSection
          task={task}
          timezone={timezone}
          cloudTargetLabel={cloudTargetLabel}
          completionChecks={completionChecks}
          onUpdateTask={(updates, msg, type) => onUpdateTask(task.id, updates, msg, type)}
        />
      )}

      {/* TAB 7: Time & Activity (Section 8) */}
      {activeTab === 'time' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Automatic Lifecycle Timestamps */}
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <div className="text-slate-500">Created At</div>
                <div className="font-mono font-semibold mt-0.5 tabular-nums">
                  {formatUnambiguousDate(task.createdAt, timezone, true)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Started At</div>
                <div className="font-mono font-semibold mt-0.5 tabular-nums">
                  {formatUnambiguousDate(task.startedAt, timezone, true)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Last Updated</div>
                <div className="font-mono font-semibold mt-0.5 tabular-nums">
                  {formatUnambiguousDate(task.updatedAt, timezone, true)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Completed At</div>
                <div className="font-mono font-semibold mt-0.5 tabular-nums">
                  {formatUnambiguousDate(task.completedAt, timezone, true)}
                </div>
              </div>
            </div>

            {/* Manual Time Entry & Editable Work Sessions */}
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Work Session History ({formatDurationMinutes(totalTaskMinutes)} total)
                </h3>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const mins = Number(manualMins);
                  if (!mins || mins <= 0) return;
                  await onAddTimeEntry({
                    taskId: task.id,
                    durationMinutes: mins,
                    notes: manualTimeNotes.trim() || 'Manual work session',
                  });
                  setManualTimeNotes('');
                }}
                className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800"
              >
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={manualMins}
                  onChange={(e) => setManualMins(e.target.value)}
                  aria-label="Duration in minutes"
                  className="w-28 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  placeholder="Mins"
                />
                <input
                  type="text"
                  value={manualTimeNotes}
                  onChange={(e) => setManualTimeNotes(e.target.value)}
                  aria-label="Session notes"
                  placeholder="Add work session notes (e.g., debugged placeholder mapping)..."
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg whitespace-nowrap"
                >
                  + Log Session
                </button>
              </form>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {taskTimeEntries.map((entry) => (
                  <div key={entry.id} className="py-3 flex items-center justify-between gap-3">
                    {editingTimeId === entry.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="number"
                          value={editingTimeMins}
                          onChange={(e) => setEditingTimeMins(e.target.value)}
                          className="w-20 px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700"
                        />
                        <input
                          type="text"
                          value={editingTimeNotes}
                          onChange={(e) => setEditingTimeNotes(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await onUpdateTimeEntry({
                              ...entry,
                              durationMinutes: Number(editingTimeMins) || entry.durationMinutes,
                              notes: editingTimeNotes,
                            });
                            setEditingTimeId(null);
                          }}
                          className="px-2.5 py-1 text-xs text-white bg-indigo-600 rounded"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {entry.notes || 'Work session'}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                            {formatUnambiguousDate(entry.startedAt, timezone, true)} ·{' '}
                            {entry.isManual ? 'Manual Entry' : 'Timer Session'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
                            {formatDurationMinutes(entry.durationMinutes)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTimeId(entry.id);
                              setEditingTimeMins(String(entry.durationMinutes));
                              setEditingTimeNotes(entry.notes);
                            }}
                            aria-label="Edit session"
                            className="p-1 text-slate-400 hover:text-slate-700"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTimeEntry(entry.id)}
                            aria-label="Delete session"
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
          </div>

          {/* Task Activity Audit Log */}
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Task Activity Timeline ({taskActivity.length})
            </h3>
            {taskActivity.length === 0 ? (
              <p className="text-xs text-slate-500">No activity recorded for this task yet.</p>
            ) : (
              <ol className="space-y-3 text-xs">
                {taskActivity.map((act) => (
                  <li
                    key={act.id}
                    className="pb-3 border-b border-slate-100 dark:border-slate-800 last:border-none"
                  >
                    <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {formatUnambiguousDate(act.timestamp, timezone, true)}
                    </div>
                    <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                      {act.summary}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
