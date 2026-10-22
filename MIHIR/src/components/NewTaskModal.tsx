import React, { useEffect, useState } from 'react';
import { X, Plus, GitBranch, FolderGit2, Sparkles, FolderPlus } from 'lucide-react';
import {
  ProjectConfig,
  RepositoryConfig,
  TaskPriority,
  TaskRecord,
  TaskStatus,
} from '../types/workspace';
import { ALL_STATUSES } from '../lib/workspaceLogic';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectConfig[];
  repositories: RepositoryConfig[];
  availableTags: string[];
  suggestedTaskCode: string;
  onCreateTask: (payload: any) => Promise<TaskRecord | null>;
  onSaveRepository?: (payload: Partial<RepositoryConfig>) => Promise<RepositoryConfig | null | void>;
}

export const NewTaskModal: React.FC<NewTaskModalProps> = ({
  isOpen,
  onClose,
  projects,
  repositories,
  availableTags,
  suggestedTaskCode,
  onCreateTask,
  onSaveRepository,
}) => {
  const [title, setTitle] = useState('');
  const [taskCode, setTaskCode] = useState(suggestedTaskCode);
  const [projectName, setProjectName] = useState(projects[0]?.name || 'Ray');
  const [priority, setPriority] = useState<TaskPriority>('High');
  const [status, setStatus] = useState<TaskStatus>('Todo');
  const [assignedBy, setAssignedBy] = useState('Vikram Desai');
  const [dueDate, setDueDate] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
  const [description, setDescription] = useState('');
  const [expectedOutcome, setExpectedOutcome] = useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const [subtasksText, setSubtasksText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<
    Array<{
      repositoryId: string;
      repositoryName?: string;
      baseBranch: string;
      workingBranch: string;
      devTargetBranch: string;
      cloudTargetName: string;
    }>
  >(() => {
    const first = repositories[0];
    if (!first) return [];
    return [
      {
        repositoryId: first.id,
        repositoryName: first.name,
        baseBranch: first.defaultBaseBranch,
        workingBranch: `RAY-MIHIR-${suggestedTaskCode}`,
        devTargetBranch: first.defaultBaseBranch,
        cloudTargetName: first.cloudTargetName,
      },
    ];
  });

  // Inline custom repo / folder form state
  const [showAddRepoForm, setShowAddRepoForm] = useState(false);
  const [customRepoName, setCustomRepoName] = useState('');
  const [customBaseBranch, setCustomBaseBranch] = useState('development');
  const [addingCustomRepo, setAddingCustomRepo] = useState(false);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Always auto-assign and synchronize Task ID when modal opens or suggestedTaskCode updates
  useEffect(() => {
    if (!isOpen) return;
    setTaskCode(suggestedTaskCode);
    setSelectedRepos((prev) => {
      if (prev.length === 0 && repositories.length > 0) {
        const first = repositories[0];
        return [
          {
            repositoryId: first.id,
            repositoryName: first.name,
            baseBranch: first.defaultBaseBranch,
            workingBranch: `RAY-MIHIR-${suggestedTaskCode}`,
            devTargetBranch: first.defaultBaseBranch,
            cloudTargetName: first.cloudTargetName,
          },
        ];
      }
      return prev.map((item) => {
        const isAutoWorkingBranch =
          !item.workingBranch || /^RAY-MIHIR-MIHIR-\d+$/i.test(item.workingBranch);
        return {
          ...item,
          workingBranch: isAutoWorkingBranch
            ? `RAY-MIHIR-${suggestedTaskCode}`
            : item.workingBranch,
        };
      });
    });
  }, [isOpen, suggestedTaskCode, repositories]);

  if (!isOpen) return null;

  const handleToggleRepo = (repo: RepositoryConfig) => {
    const exists = selectedRepos.some(
      (r) => r.repositoryId === repo.id || r.repositoryName === repo.name
    );
    if (exists) {
      setSelectedRepos(
        selectedRepos.filter(
          (r) => r.repositoryId !== repo.id && r.repositoryName !== repo.name
        )
      );
    } else {
      const activeCode = suggestedTaskCode || taskCode;
      setSelectedRepos([
        ...selectedRepos,
        {
          repositoryId: repo.id,
          repositoryName: repo.name,
          baseBranch: repo.defaultBaseBranch,
          workingBranch: `RAY-MIHIR-${activeCode}`,
          devTargetBranch: repo.defaultBaseBranch,
          cloudTargetName: repo.cloudTargetName,
        },
      ]);
    }
  };

  const handleAddCustomRepoInline = async () => {
    const trimmedName = customRepoName.trim();
    if (!trimmedName) {
      setError('Please enter a repository or custom folder name.');
      return;
    }
    setError('');
    setAddingCustomRepo(true);
    try {
      const baseBranch = customBaseBranch.trim() || 'development';
      const activeCode = suggestedTaskCode || taskCode;
      let savedRepo: RepositoryConfig | null | void = null;
      if (onSaveRepository) {
        savedRepo = await onSaveRepository({
          name: trimmedName,
          projectName: projectName || 'Ray',
          localFolderPath: trimmedName,
          defaultBaseBranch: baseBranch,
          defaultDevBranch: baseBranch,
          defaultWorkflowMode: 'PR-Based',
        });
      }
      const newRepoId =
        (savedRepo && typeof savedRepo === 'object' && 'id' in savedRepo && savedRepo.id) ||
        trimmedName;
      const newRepoName =
        (savedRepo && typeof savedRepo === 'object' && 'name' in savedRepo && savedRepo.name) ||
        trimmedName;

      if (
        !selectedRepos.some(
          (r) => r.repositoryId === newRepoId || r.repositoryName === newRepoName
        )
      ) {
        setSelectedRepos((prev) => [
          ...prev,
          {
            repositoryId: newRepoId,
            repositoryName: newRepoName,
            baseBranch,
            workingBranch: `RAY-MIHIR-${activeCode}`,
            devTargetBranch: baseBranch,
            cloudTargetName: 'cloud-release',
          },
        ]);
      }
      setCustomRepoName('');
      setCustomBaseBranch('development');
      setShowAddRepoForm(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to add custom repository / folder.');
    } finally {
      setAddingCustomRepo(false);
    }
  };

  const handleUpdateRepoField = (
    repositoryId: string,
    field: 'baseBranch' | 'workingBranch',
    value: string
  ) => {
    setSelectedRepos(
      selectedRepos.map((item) =>
        item.repositoryId === repositoryId
          ? {
              ...item,
              [field]: value,
              ...(field === 'baseBranch' ? { devTargetBranch: value } : {}),
            }
          : item
      )
    );
  };

  const handleToggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a clear task title.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const parsedSubtasks = subtasksText
        .split(/\r?\n/)
        .map((line) => line.replace(/^(?:[-*•]\s*|\d+[.)]\s*)/, '').trim())
        .filter(Boolean)
        .map((line, idx) => ({
          id: `st-new-${Date.now()}-${idx + 1}`,
          title: line,
          completed: false,
        }));

      const autoAssignedCode = suggestedTaskCode || taskCode.trim();
      const created = await onCreateTask({
        title: title.trim(),
        taskCode: autoAssignedCode,
        projectName,
        priority,
        status,
        assignedBy: assignedBy.trim() || 'Self',
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        ticketUrl: ticketUrl.trim(),
        description: description.trim(),
        expectedOutcome: expectedOutcome.trim(),
        acceptanceCriteria: acceptanceCriteria.trim(),
        subtasks: parsedSubtasks,
        tags: selectedTags,
        selectedRepoConfigs: selectedRepos.map((r) => ({
          ...r,
          devTargetBranch: r.baseBranch,
        })),
      });
      if (created) {
        setTitle('');
        setDescription('');
        setExpectedOutcome('');
        setAcceptanceCriteria('');
        setSubtasksText('');
        setTicketUrl('');
        setSelectedTags([]);
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to create task.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-task-modal-title"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 id="new-task-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Create New Developer Task
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Record assignment details, target repositories or custom folders, and working branches.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new task modal"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="new-task-code" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Task ID
                </label>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/70">
                  <Sparkles className="w-2.5 h-2.5" />
                  Auto
                </span>
              </div>
              <input
                id="new-task-code"
                type="text"
                value={suggestedTaskCode || taskCode}
                readOnly
                aria-readonly="true"
                title="Task ID is automatically assigned"
                className="w-full px-3 py-2 text-sm font-mono font-semibold rounded-lg border border-indigo-200 dark:border-indigo-900/70 bg-indigo-50/40 dark:bg-slate-950 text-indigo-700 dark:text-indigo-300 cursor-default select-all focus:outline-none"
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="new-task-title" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Task Title *
              </label>
              <input
                id="new-task-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g., Add SSL/TLS certificate chain validation in raydashboard"
                autoFocus
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label htmlFor="new-task-project" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Project
              </label>
              <select
                id="new-task-project"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="new-task-status" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Initial Status
              </label>
              <select
                id="new-task-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                {ALL_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="new-task-priority" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Priority
              </label>
              <select
                id="new-task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label htmlFor="new-task-duedate" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Due Date
              </label>
              <input
                id="new-task-duedate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="new-task-assignedby" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Assigned By
              </label>
              <input
                id="new-task-assignedby"
                type="text"
                value={assignedBy}
                onChange={(e) => setAssignedBy(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                placeholder="e.g., Vikram Desai / Neha Sharma"
              />
            </div>
            <div>
              <label htmlFor="new-task-ticketurl" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Task Source / Ticket URL
              </label>
              <input
                id="new-task-ticketurl"
                type="text"
                value={ticketUrl}
                onChange={(e) => setTicketUrl(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                placeholder="https://ray.internal/browse/RAY-..."
              />
            </div>
          </div>

          {/* Repositories & Branches section */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <FolderGit2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Target Repositories & Branch Configuration
              </span>
              <button
                type="button"
                onClick={() => setShowAddRepoForm((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/80 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                {showAddRepoForm ? 'Cancel' : '+ Add Repo / Custom Folder'}
              </button>
            </div>

            {showAddRepoForm && (
              <div className="p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/70 space-y-2.5">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Add a new repository or custom workspace folder
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="custom-repo-name-input" className="block text-[11px] text-slate-500 mb-0.5">
                      Repository / Custom Folder Name *
                    </label>
                    <input
                      id="custom-repo-name-input"
                      type="text"
                      value={customRepoName}
                      onChange={(e) => setCustomRepoName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomRepoInline();
                        }
                      }}
                      placeholder="e.g., raycustom-folder or raydashboard-hotfix"
                      className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label htmlFor="custom-repo-base-input" className="block text-[11px] text-slate-500 mb-0.5">
                      Default Base Branch
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id="custom-repo-base-input"
                        type="text"
                        value={customBaseBranch}
                        onChange={(e) => setCustomBaseBranch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomRepoInline();
                          }
                        }}
                        placeholder="development"
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        disabled={addingCustomRepo}
                        onClick={handleAddCustomRepoInline}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white whitespace-nowrap shrink-0 disabled:opacity-50"
                      >
                        {addingCustomRepo ? 'Adding...' : 'Add'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {repositories.map((repo) => {
                const isSelected = selectedRepos.some(
                  (r) => r.repositoryId === repo.id || r.repositoryName === repo.name
                );
                return (
                  <button
                    key={repo.id}
                    type="button"
                    onClick={() => handleToggleRepo(repo)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-colors whitespace-nowrap ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-indigo-400'
                    }`}
                  >
                    {isSelected ? '✓ ' : '+ '}
                    {repo.name}
                  </button>
                );
              })}
            </div>

            {selectedRepos.length > 0 && (
              <div className="space-y-2.5">
                {selectedRepos.map((sel) => {
                  const repoObj = repositories.find(
                    (r) => r.id === sel.repositoryId || r.name === sel.repositoryName
                  );
                  const displayName = repoObj?.name || sel.repositoryName || sel.repositoryId;
                  return (
                    <div
                      key={sel.repositoryId}
                      className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                          <GitBranch className="w-3.5 h-3.5" />
                          {displayName}
                        </span>
                        {selectedRepos.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedRepos((prev) =>
                                prev.filter((r) => r.repositoryId !== sel.repositoryId)
                              )
                            }
                            className="text-[11px] text-slate-400 hover:text-red-500 transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Base Branch
                          </label>
                          <input
                            type="text"
                            value={sel.baseBranch}
                            onChange={(e) =>
                              handleUpdateRepoField(sel.repositoryId, 'baseBranch', e.target.value)
                            }
                            className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                            placeholder="development2"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Working Branch
                          </label>
                          <input
                            type="text"
                            value={sel.workingBranch}
                            onChange={(e) =>
                              handleUpdateRepoField(
                                sel.repositoryId,
                                'workingBranch',
                                e.target.value
                              )
                            }
                            className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                            placeholder="RAY-MIHIR-Security-Graphs"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="new-task-desc" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              What Was Requested (Summary & Context)
            </label>
            <textarea
              id="new-task-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              placeholder="Describe what was requested, any initial reproduction clues, or specific behavior to change..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="new-task-outcome" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Expected Outcome
              </label>
              <textarea
                id="new-task-outcome"
                rows={2}
                value={expectedOutcome}
                onChange={(e) => setExpectedOutcome(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                placeholder="Desired end-user or system outcome..."
              />
            </div>
            <div>
              <label htmlFor="new-task-criteria" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Acceptance Criteria
              </label>
              <textarea
                id="new-task-criteria"
                rows={2}
                value={acceptanceCriteria}
                onChange={(e) => setAcceptanceCriteria(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                placeholder="1. Verified on development2..."
              />
            </div>
          </div>

          <div>
            <label htmlFor="new-task-subtasks" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Sub-tasks / Checklist Items (one per line)
            </label>
            <textarea
              id="new-task-subtasks"
              rows={2}
              value={subtasksText}
              onChange={(e) => setSubtasksText(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              placeholder={"Audit gridPos coordinates\nUpdate component & unit tests\nVerify on development2"}
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Tags
            </span>
            <div className="flex flex-wrap gap-1.5">
              {availableTags.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className={`px-2.5 py-1 rounded-md text-xs transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-indigo-600 text-white font-medium'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              {submitting ? 'Creating Task...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
