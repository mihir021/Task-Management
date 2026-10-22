import React, { useState } from 'react';
import {
  GitBranch,
  GitCommit,
  GitMerge,
  CloudUpload,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
} from 'lucide-react';
import {
  GitStageStatus,
  GitWorkflowStage,
  RequiredCompletionChecks,
  TaskRecord,
  TaskRepository,
  WorkflowMode,
} from '../types/workspace';
import {
  evaluateTaskReadiness,
  formatUnambiguousDate,
  summarizeRepositoryProgress,
} from '../lib/workspaceLogic';

interface TaskGitWorkflowSectionProps {
  task: TaskRecord;
  timezone: string;
  cloudTargetLabel: string;
  completionChecks: RequiredCompletionChecks;
  onUpdateTask: (
    updates: Partial<TaskRecord>,
    activityMessage?: string,
    activityType?: string
  ) => Promise<void>;
}

const STAGE_STATUS_OPTIONS: GitStageStatus[] = [
  'Not Started',
  'In Progress',
  'Completed',
  'Blocked',
  'Not Applicable',
];

const CATEGORY_LABELS: Record<GitWorkflowStage['category'], string> = {
  local: 'Local Workspace Prep',
  commit: 'Local Git Commit',
  push: 'Remote Branch Push',
  merge: 'Development Branch Merge',
  deploy: 'Cloud / Release Promotion',
};

export const TaskGitWorkflowSection: React.FC<TaskGitWorkflowSectionProps> = ({
  task,
  timezone,
  cloudTargetLabel,
  completionChecks,
  onUpdateTask,
}) => {
  const [selectedRepoIndex, setSelectedRepoIndex] = useState(0);
  const [copiedPath, setCopiedPath] = useState(false);

  const readiness = evaluateTaskReadiness(task, completionChecks);
  const activeRepo: TaskRepository | undefined =
    task.repositories[selectedRepoIndex] || task.repositories[0];

  const handleCopyPath = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1500);
  };

  const handleChangeWorkflowMode = async (repoId: string, mode: WorkflowMode) => {
    const updatedRepos = task.repositories.map((r) => {
      if (r.id !== repoId) return r;
      const stages = r.stages.map((s) => {
        if (s.stageKey === 'open_pr') {
          if (mode === 'Direct Merge' && s.status === 'Not Started') {
            return {
              ...s,
              status: 'Not Applicable' as GitStageStatus,
              notApplicableReason: 'Direct merge workflow configured',
            };
          }
          if (mode === 'PR-Based' && s.status === 'Not Applicable') {
            return {
              ...s,
              status: 'Not Started' as GitStageStatus,
              notApplicableReason: '',
            };
          }
        }
        return s;
      });
      return { ...r, workflowMode: mode, stages };
    });

    await onUpdateTask(
      { repositories: updatedRepos },
      `Switched workflow mode to ${mode} for ${activeRepo?.repositoryName}`,
      'git'
    );
  };

  const handleUpdateStage = async (
    repoId: string,
    stageId: string,
    changes: Partial<GitWorkflowStage>
  ) => {
    let activityNote = '';
    const updatedRepos = task.repositories.map((repo) => {
      if (repo.id !== repoId) return repo;
      const stages = repo.stages.map((stage) => {
        if (stage.id !== stageId) return stage;

        const wasCompleted = stage.status === 'Completed';
        const nextStatus = changes.status !== undefined ? changes.status : stage.status;
        const now = new Date().toISOString();

        let completedAt = stage.completedAt;
        if (nextStatus === 'Completed' && stage.status !== 'Completed') {
          completedAt = now;
        } else if (nextStatus !== 'Completed') {
          completedAt = null;
        }

        if (changes.status && changes.status !== stage.status) {
          if (wasCompleted) {
            activityNote = `Corrected Git stage #${stage.stepNumber} "${stage.label}" on ${repo.repositoryName} from Completed to ${changes.status}`;
          } else {
            activityNote = `Updated Git stage #${stage.stepNumber} "${stage.label}" on ${repo.repositoryName} to ${changes.status}`;
          }
        } else if (changes.referenceValue !== undefined && changes.referenceValue !== stage.referenceValue) {
          activityNote = `Recorded ${stage.referenceType} reference "${changes.referenceValue}" on ${repo.repositoryName} (${stage.label})`;
        } else if (changes.notes !== undefined && wasCompleted) {
          activityNote = `Corrected notes on completed stage #${stage.stepNumber} "${stage.label}" (${repo.repositoryName})`;
        }

        return {
          ...stage,
          ...changes,
          completedAt,
        };
      });
      return { ...repo, stages };
    });

    await onUpdateTask(
      { repositories: updatedRepos },
      activityNote || undefined,
      'git'
    );
  };

  const handleCompleteTaskExplicitly = async () => {
    await onUpdateTask(
      {
        status: 'Done',
        completedAt: new Date().toISOString(),
      },
      `Explicitly completed task ${task.taskCode} after reviewing readiness checks`,
      'status'
    );
  };

  if (!activeRepo) {
    return (
      <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
        No repositories are linked to this task yet. Attach a repository in the Overview & Workspace tab to track Git and release stages.
      </div>
    );
  }

  const repoSummary = summarizeRepositoryProgress(activeRepo);

  return (
    <div className="space-y-6">
      {/* Manual Tracking Honesty Banner & Readiness Gate */}
      <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Delivery Readiness & Explicit Task Completion
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              All Git stages below are clearly labeled as manually recorded engineering checkpoints. This tracker never executes Git commands or auto-deploys code.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {task.status === 'Done' ? (
              <span className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                Task Completed ({formatUnambiguousDate(task.completedAt, timezone, true)})
              </span>
            ) : (
              <button
                type="button"
                onClick={handleCompleteTaskExplicitly}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  readiness.isReady
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {readiness.isReady
                  ? 'Mark Task Completed (All Checks Verified)'
                  : `Complete Task (${readiness.missingChecks.length} Checks Remaining)`}
              </button>
            )}
          </div>
        </div>

        {readiness.missingChecks.length > 0 && task.status !== 'Done' && (
          <div className="p-3.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 space-y-1.5">
            <div className="text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Remaining Required Verification & Git Checks ({readiness.missingChecks.length}):
            </div>
            <ul className="list-disc list-inside text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
              {readiness.missingChecks.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Repository Switcher Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {task.repositories.map((repo, idx) => {
            const sum = summarizeRepositoryProgress(repo);
            const isSelected = idx === selectedRepoIndex;
            return (
              <button
                key={repo.id}
                type="button"
                onClick={() => setSelectedRepoIndex(idx)}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-medium border transition-colors flex items-center gap-2 ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-400'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>{repo.repositoryName}</span>
                <span className="opacity-80 tabular-nums">
                  ({sum.completedCount}/{sum.applicableCount})
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Workflow Mode:</span>
          <select
            aria-label={`Workflow mode for ${activeRepo.repositoryName}`}
            value={activeRepo.workflowMode}
            onChange={(e) =>
              handleChangeWorkflowMode(activeRepo.id, e.target.value as WorkflowMode)
            }
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <option value="PR-Based">PR-Based Merge Workflow</option>
            <option value="Direct Merge">Direct Branch Merge Workflow</option>
          </select>
        </div>
      </div>

      {/* 4-Pillar Separation Banner: Local Commit vs Remote Push vs Dev Merge vs Cloud Target */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-medium">
              <GitCommit className="w-3.5 h-3.5 text-indigo-500" />
              1. Local Commit
            </span>
            <span
              className={`font-mono font-semibold ${
                repoSummary.localCommitted
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {repoSummary.localCommitted ? 'Committed' : 'Pending'}
            </span>
          </div>
          <div className="text-xs font-mono text-slate-800 dark:text-slate-200 truncate">
            Branch: {activeRepo.workingBranch}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-medium">
              <GitBranch className="w-3.5 h-3.5 text-sky-500" />
              2. Remote Push
            </span>
            <span
              className={`font-mono font-semibold ${
                repoSummary.remotePushed
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {repoSummary.remotePushed ? 'Pushed' : 'Not Pushed'}
            </span>
          </div>
          <div className="text-xs font-mono text-slate-800 dark:text-slate-200 truncate">
            origin/{activeRepo.workingBranch}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-medium">
              <GitMerge className="w-3.5 h-3.5 text-violet-500" />
              3. Dev Branch Merge
            </span>
            <span
              className={`font-mono font-semibold ${
                repoSummary.devMerged
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {repoSummary.devMerged ? 'Merged' : 'Unmerged'}
            </span>
          </div>
          <div className="text-xs font-mono text-slate-800 dark:text-slate-200 truncate">
            Target: {activeRepo.devTargetBranch}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-medium">
              <CloudUpload className="w-3.5 h-3.5 text-emerald-500" />
              4. {cloudTargetLabel}
            </span>
            <span
              className={`font-mono font-semibold ${
                repoSummary.cloudPromoted
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500'
              }`}
            >
              {repoSummary.cloudPromoted ? 'Promoted' : 'Not Promoted'}
            </span>
          </div>
          <div className="text-xs font-mono text-slate-800 dark:text-slate-200 truncate">
            Target: {activeRepo.cloudTargetName || 'Not configured'}
          </div>
        </div>
      </div>

      {/* Repository & Branch Metadata Bar */}
      <div className="p-4 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 font-mono">
            <span className="text-slate-500">Repository:</span>
            <code className="px-2 py-0.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-indigo-600 dark:text-indigo-400 font-semibold">
              {activeRepo.repositoryName}
            </code>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-slate-500">
            <span>
              Base Branch: <span className="text-slate-800 dark:text-slate-200">{activeRepo.baseBranch}</span> → Working Branch:{' '}
              <span className="text-indigo-600 dark:text-indigo-400">{activeRepo.workingBranch}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                const cmds = [
                  `git checkout ${activeRepo.baseBranch} && git pull origin ${activeRepo.baseBranch}`,
                  `git checkout -B ${activeRepo.workingBranch}`,
                  `git add . && git commit -m "${task.taskCode}: ${task.title}"`,
                  `git push -u origin ${activeRepo.workingBranch}`,
                ].join('\n');
                navigator.clipboard.writeText(cmds);
                setCopiedPath(true);
                setTimeout(() => setCopiedPath(false), 2000);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 text-white font-sans font-medium hover:bg-indigo-500 transition-colors"
            >
              {copiedPath ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copiedPath ? 'Copied Commands' : 'Copy Terminal Git Commands'}
            </button>
          </div>
        </div>
      </div>

      {/* 14-Stage Interactive Stepper */}
      <div className="space-y-3">
        {activeRepo.stages.map((stage) => {
          const isCompleted = stage.status === 'Completed';
          const isBlocked = stage.status === 'Blocked';
          const isNA = stage.status === 'Not Applicable';

          return (
            <div
              key={stage.id}
              className={`p-4 rounded-xl border transition-colors ${
                isCompleted
                  ? 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-900/60'
                  : isBlocked
                  ? 'bg-red-50/40 dark:bg-red-950/20 border-red-200 dark:border-red-900/70'
                  : isNA
                  ? 'bg-slate-50/60 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800/60 opacity-75'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-7 h-7 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 tabular-nums ${
                      isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isBlocked
                        ? 'bg-red-600 text-white'
                        : stage.status === 'In Progress'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {stage.stepNumber}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {stage.label}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        · {CATEGORY_LABELS[stage.category]}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        · {stage.recordingMode === 'Manual' ? 'Manually Recorded' : 'Verified Integration'}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-slate-500 mt-0.5">
                      {stage.sourceBranch} → {stage.targetBranch}
                      {stage.completedAt && (
                        <span className="text-emerald-600 dark:text-emerald-400 ml-2">
                          · Completed {formatUnambiguousDate(stage.completedAt, timezone, true)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <select
                    aria-label={`Stage ${stage.stepNumber} ${stage.label} status`}
                    value={stage.status}
                    onChange={(e) =>
                      handleUpdateStage(activeRepo.id, stage.id, {
                        status: e.target.value as GitStageStatus,
                      })
                    }
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    {STAGE_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Editable Stage Metadata Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    {stage.referenceType === 'commit'
                      ? 'Commit Hash'
                      : stage.referenceType === 'pr'
                      ? 'Pull / Merge Request URL'
                      : stage.referenceType === 'deployment'
                      ? 'Environment / Deployment URL or Tag'
                      : 'Branch / Reference'}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={stage.referenceValue}
                      onChange={(e) =>
                        handleUpdateStage(activeRepo.id, stage.id, {
                          referenceValue: e.target.value,
                        })
                      }
                      placeholder={
                        stage.referenceType === 'commit'
                          ? 'e.g. 7c4b91e'
                          : stage.referenceType === 'pr'
                          ? 'https://git.ray.internal/.../pulls/418'
                          : 'Reference or URL...'
                      }
                      className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                    />
                    {stage.referenceValue.startsWith('http') && (
                      <a
                        href={stage.referenceValue}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open reference link"
                        className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {stage.status === 'Not Applicable' ? (
                  <div className="md:col-span-2">
                    <label className="block text-[11px] text-amber-600 dark:text-amber-400 mb-1">
                      Reason Stage is Not Applicable *
                    </label>
                    <input
                      type="text"
                      value={stage.notApplicableReason}
                      onChange={(e) =>
                        handleUpdateStage(activeRepo.id, stage.id, {
                          notApplicableReason: e.target.value,
                        })
                      }
                      placeholder="Explain why this stage is not needed for this task..."
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/30"
                    />
                  </div>
                ) : (
                  <div className="md:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Stage Notes / Verification Evidence
                    </label>
                    <input
                      type="text"
                      value={stage.notes}
                      onChange={(e) =>
                        handleUpdateStage(activeRepo.id, stage.id, {
                          notes: e.target.value,
                        })
                      }
                      placeholder="Add commit notes, merge notes, or correction rationale..."
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
