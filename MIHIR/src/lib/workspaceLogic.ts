import {
  GitWorkflowStage,
  RequiredCompletionChecks,
  TaskChecklistItem,
  TaskPriority,
  TaskRecord,
  TaskStatus,
  TimeEntry,
  WorkflowMode,
} from '../types/workspace.js';

export const DEFAULT_GIT_STAGE_BLUEPRINTS: Array<{
  stageKey: string;
  stepNumber: number;
  label: string;
  category: GitWorkflowStage['category'];
  referenceType: GitWorkflowStage['referenceType'];
}> = [
  { stageKey: 'confirm_base', stepNumber: 1, label: 'Confirm base branch', category: 'local', referenceType: 'branch' },
  { stageKey: 'update_base', stepNumber: 2, label: 'Update local base from remote', category: 'local', referenceType: 'branch' },
  { stageKey: 'create_branch', stepNumber: 3, label: 'Create working branch', category: 'local', referenceType: 'branch' },
  { stageKey: 'implement_changes', stepNumber: 4, label: 'Implement changes', category: 'local', referenceType: 'none' },
  { stageKey: 'review_files', stepNumber: 5, label: 'Review changed files', category: 'local', referenceType: 'none' },
  { stageKey: 'run_checks', stepNumber: 6, label: 'Run relevant checks', category: 'local', referenceType: 'none' },
  { stageKey: 'commit_locally', stepNumber: 7, label: 'Commit locally', category: 'commit', referenceType: 'commit' },
  { stageKey: 'push_remote', stepNumber: 8, label: 'Push working branch to remote', category: 'push', referenceType: 'branch' },
  { stageKey: 'open_pr', stepNumber: 9, label: 'Open pull request or merge request', category: 'merge', referenceType: 'pr' },
  { stageKey: 'merge_dev', stepNumber: 10, label: 'Merge into the development target', category: 'merge', referenceType: 'commit' },
  { stageKey: 'verify_dev', stepNumber: 11, label: 'Verify the development result', category: 'merge', referenceType: 'deployment' },
  { stageKey: 'promote_cloud', stepNumber: 12, label: 'Promote or merge to cloud/release target', category: 'deploy', referenceType: 'deployment' },
  { stageKey: 'verify_cloud', stepNumber: 13, label: 'Verify cloud deployment or final environment', category: 'deploy', referenceType: 'deployment' },
  { stageKey: 'complete_task', stepNumber: 14, label: 'Complete the repository workflow', category: 'deploy', referenceType: 'none' },
];

export function createDefaultGitStages(
  repoIdPrefix: string,
  baseBranch: string,
  workingBranch: string,
  devTargetBranch: string,
  cloudTargetName: string,
  workflowMode: WorkflowMode = 'PR-Based'
): GitWorkflowStage[] {
  return DEFAULT_GIT_STAGE_BLUEPRINTS.map((bp) => {
    let sourceBranch = workingBranch;
    let targetBranch = devTargetBranch;
    if (bp.stageKey === 'confirm_base' || bp.stageKey === 'update_base') {
      sourceBranch = baseBranch;
      targetBranch = baseBranch;
    } else if (bp.stageKey === 'create_branch') {
      sourceBranch = baseBranch;
      targetBranch = workingBranch;
    } else if (bp.stageKey === 'promote_cloud' || bp.stageKey === 'verify_cloud') {
      sourceBranch = devTargetBranch;
      targetBranch = cloudTargetName || 'cloud-release';
    }

    const isDirectMergePrStage = workflowMode === 'Direct Merge' && bp.stageKey === 'open_pr';

    return {
      id: `${repoIdPrefix}-stage-${bp.stepNumber}`,
      stageKey: bp.stageKey,
      stepNumber: bp.stepNumber,
      label: bp.label,
      category: bp.category,
      status: isDirectMergePrStage ? 'Not Applicable' : 'Not Started',
      completedAt: null,
      notes: '',
      sourceBranch,
      targetBranch,
      referenceValue: '',
      referenceType: bp.referenceType,
      recordingMode: 'Manual',
      notApplicableReason: isDirectMergePrStage ? 'Direct merge workflow configured for this repository' : '',
    };
  });
}

export function formatUnambiguousDate(
  isoString: string | null | undefined,
  timezone = 'Asia/Kolkata',
  includeTime = false
): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';

  try {
    const dayFormatter = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: timezone,
    });
    const datePart = dayFormatter.format(date);
    if (!includeTime) {
      return datePart;
    }
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    });
    return `${datePart}, ${timeFormatter.format(date)}`;
  } catch {
    const fallbackFormatter = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    return fallbackFormatter.format(date);
  }
}

export function formatDurationMinutes(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export interface RepositoryProgressSummary {
  repositoryName: string;
  workingBranch: string;
  completedCount: number;
  applicableCount: number;
  percent: number;
  localCommitted: boolean;
  remotePushed: boolean;
  devMerged: boolean;
  cloudPromoted: boolean;
  hasBlockedStage: boolean;
}

export function summarizeRepositoryProgress(
  repo: TaskRecord['repositories'][number]
): RepositoryProgressSummary {
  const applicableStages = repo.stages.filter((s) => s.status !== 'Not Applicable');
  const completedStages = applicableStages.filter((s) => s.status === 'Completed');
  const applicableCount = applicableStages.length;
  const completedCount = completedStages.length;
  const percent = applicableCount > 0 ? Math.round((completedCount / applicableCount) * 100) : 100;

  const isDoneOrNA = (key: string) => {
    const stage = repo.stages.find((s) => s.stageKey === key);
    if (!stage) return false;
    return stage.status === 'Completed' || stage.status === 'Not Applicable';
  };

  const isStrictlyCompleted = (key: string) => {
    const stage = repo.stages.find((s) => s.stageKey === key);
    return stage?.status === 'Completed';
  };

  return {
    repositoryName: repo.repositoryName,
    workingBranch: repo.workingBranch,
    completedCount,
    applicableCount,
    percent,
    localCommitted: isStrictlyCompleted('commit_locally'),
    remotePushed: isStrictlyCompleted('push_remote'),
    devMerged: isDoneOrNA('merge_dev') && isStrictlyCompleted('commit_locally'),
    cloudPromoted: isStrictlyCompleted('promote_cloud') || isStrictlyCompleted('verify_cloud'),
    hasBlockedStage: repo.stages.some((s) => s.status === 'Blocked'),
  };
}

export interface TaskChecklistProgressSummary {
  hasChecklist: boolean;
  items: TaskChecklistItem[];
  completedCount: number;
  totalCount: number;
  percent: number;
  isComplete: boolean;
  source: 'subtasks' | 'acceptanceCriteria' | 'none';
}

export function parseAcceptanceCriteriaChecklist(
  acceptanceCriteria: string | undefined | null,
  defaultCompleted = false
): TaskChecklistItem[] {
  if (!acceptanceCriteria || !acceptanceCriteria.trim()) return [];
  const rawLines = acceptanceCriteria
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Only treat as checklist if there are multiple lines or explicit list/checkbox markers
  const listMarkerRegex = /^(?:[-*•]\s*\[([ xX✓✔])\]\s*|\[([ xX✓✔])\]\s*|(\d+)[.)]\s+|[-*•]\s+)/;
  const hasExplicitMarkers = rawLines.some((line) => listMarkerRegex.test(line));
  if (!hasExplicitMarkers && rawLines.length < 2) {
    return [];
  }

  return rawLines.map((line, idx) => {
    const checkboxMatch = line.match(/^(?:[-*•]\s*)?\[([ xX✓✔])\]\s*(.+)$/);
    if (checkboxMatch) {
      const mark = checkboxMatch[1].toLowerCase();
      const isChecked = mark === 'x' || mark === '✓' || mark === '✔';
      return {
        id: `ac-item-${idx + 1}`,
        title: checkboxMatch[2].trim(),
        completed: isChecked,
      };
    }

    const cleanedTitle = line.replace(/^(?:(\d+)[.)]\s+|[-*•]\s+)/, '').trim();
    return {
      id: `ac-item-${idx + 1}`,
      title: cleanedTitle || line,
      completed: defaultCompleted,
    };
  });
}

export function summarizeTaskChecklistProgress(task: TaskRecord): TaskChecklistProgressSummary {
  if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
    const items = task.subtasks.filter((item) => item && item.title.trim().length > 0);
    const totalCount = items.length;
    const completedCount = items.filter((item) => item.completed).length;
    const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    return {
      hasChecklist: totalCount > 0,
      items,
      completedCount,
      totalCount,
      percent,
      isComplete: totalCount > 0 && completedCount === totalCount,
      source: totalCount > 0 ? 'subtasks' : 'none',
    };
  }

  const parsedItems = parseAcceptanceCriteriaChecklist(
    task.acceptanceCriteria,
    task.status === 'Done'
  );
  if (parsedItems.length > 0) {
    const totalCount = parsedItems.length;
    const completedCount = parsedItems.filter((item) => item.completed).length;
    const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    return {
      hasChecklist: true,
      items: parsedItems,
      completedCount,
      totalCount,
      percent,
      isComplete: completedCount === totalCount,
      source: 'acceptanceCriteria',
    };
  }

  return {
    hasChecklist: false,
    items: [],
    completedCount: 0,
    totalCount: 0,
    percent: 0,
    isComplete: false,
    source: 'none',
  };
}

export interface TaskCompletionReadiness {
  isReady: boolean;
  missingChecks: string[];
  repoSummaries: RepositoryProgressSummary[];
  passedTests: number;
  failedTests: number;
  blockedTests: number;
  notRunTests: number;
}

export function evaluateTaskReadiness(
  task: TaskRecord,
  checks: RequiredCompletionChecks
): TaskCompletionReadiness {
  const missingChecks: string[] = [];
  const repoSummaries = task.repositories.map(summarizeRepositoryProgress);

  const passedTests = task.tests.filter((t) => t.status === 'Passed').length;
  const failedTests = task.tests.filter((t) => t.status === 'Failed').length;
  const blockedTests = task.tests.filter((t) => t.status === 'Blocked').length;
  const notRunTests = task.tests.filter((t) => t.status === 'Not Run').length;

  if (checks.requireNoBlockedTests && blockedTests > 0) {
    missingChecks.push(`${blockedTests} test check(s) are currently Blocked (blocked tests never count as passed)`);
  }

  if (failedTests > 0) {
    missingChecks.push(`${failedTests} test check(s) Failed and require fixes`);
  }

  if (checks.requireAllTestsPassedOrSkipped) {
    if (task.tests.length === 0) {
      missingChecks.push('At least one verification test record must be documented');
    } else if (notRunTests > 0) {
      missingChecks.push(`${notRunTests} test check(s) are still marked Not Run`);
    }
  }

  if (checks.requireRootCauseAndSolution) {
    if (!task.investigation.rootCause.trim()) {
      missingChecks.push('Root cause analysis is not yet documented in Investigation');
    }
    if (!task.investigation.finalSolution.trim()) {
      missingChecks.push('Final solution summary is not yet documented in Investigation');
    }
  }

  if (checks.requireGitCommitAndPush) {
    for (const repo of task.repositories) {
      const commitStage = repo.stages.find((s) => s.stageKey === 'commit_locally');
      const pushStage = repo.stages.find((s) => s.stageKey === 'push_remote');
      if (commitStage && commitStage.status !== 'Completed' && commitStage.status !== 'Not Applicable') {
        missingChecks.push(`${repo.repositoryName}: Local commit stage is ${commitStage.status}`);
      }
      if (pushStage && pushStage.status !== 'Completed' && pushStage.status !== 'Not Applicable') {
        missingChecks.push(`${repo.repositoryName}: Remote push stage is ${pushStage.status}`);
      }
    }
  }

  if (checks.requireDevMerge) {
    for (const repo of task.repositories) {
      const mergeStage = repo.stages.find((s) => s.stageKey === 'merge_dev');
      if (mergeStage && mergeStage.status !== 'Completed' && mergeStage.status !== 'Not Applicable') {
        missingChecks.push(`${repo.repositoryName}: Merge into development target (${repo.devTargetBranch}) is ${mergeStage.status}`);
      }
    }
  }

  for (const repo of task.repositories) {
    const blockedStages = repo.stages.filter((s) => s.status === 'Blocked');
    if (blockedStages.length > 0) {
      missingChecks.push(`${repo.repositoryName}: ${blockedStages.length} Git workflow stage(s) are Blocked`);
    }
  }

  return {
    isReady: missingChecks.length === 0,
    missingChecks,
    repoSummaries,
    passedTests,
    failedTests,
    blockedTests,
    notRunTests,
  };
}

export function isTaskAwaitingPushOrMerge(task: TaskRecord): boolean {
  if (task.isArchived || task.status === 'Done') return false;
  return task.repositories.some((repo) => {
    const implemented = repo.stages.find((s) => s.stageKey === 'implement_changes')?.status === 'Completed';
    const committed = repo.stages.find((s) => s.stageKey === 'commit_locally')?.status === 'Completed';
    const pushed = repo.stages.find((s) => s.stageKey === 'push_remote');
    const merged = repo.stages.find((s) => s.stageKey === 'merge_dev');

    const pushPending = pushed && pushed.status !== 'Completed' && pushed.status !== 'Not Applicable';
    const mergePending = merged && merged.status !== 'Completed' && merged.status !== 'Not Applicable';

    return (implemented || committed) && Boolean(pushPending || mergePending);
  });
}

export function isTaskOverdue(task: TaskRecord, nowIso: string): boolean {
  if (task.isArchived || task.status === 'Done' || !task.dueDate) return false;
  const dueTime = new Date(task.dueDate).getTime();
  const nowTime = new Date(nowIso).getTime();
  if (Number.isNaN(dueTime) || Number.isNaN(nowTime)) return false;
  return dueTime < nowTime;
}

export interface DashboardMetrics {
  assignedCount: number;
  inProgressCount: number;
  blockedCount: number;
  awaitingTestingOrReviewCount: number;
  awaitingPushOrMergeCount: number;
  recentlyCompletedCount: number;
  overdueCount: number;
  minutesToday: number;
  minutesThisWeek: number;
}

export function computeDashboardMetrics(
  tasks: TaskRecord[],
  timeEntries: TimeEntry[],
  nowIso: string,
  timezone = 'Asia/Kolkata'
): DashboardMetrics {
  const activeTasks = tasks.filter((t) => !t.isArchived);

  const assignedCount = activeTasks.filter((t) => t.status !== 'Done').length;
  const inProgressCount = activeTasks.filter((t) => t.status === 'In Progress').length;
  const blockedCount = activeTasks.filter(
    (t) =>
      Boolean(t.blockerNotes) ||
      t.tests.some((test) => test.status === 'Blocked') ||
      t.repositories.some((r) => r.stages.some((s) => s.status === 'Blocked'))
  ).length;
  const awaitingTestingOrReviewCount = activeTasks.filter(
    (t) =>
      t.status === 'Push to Development Branch' ||
      t.status === 'Monitor Logs & Process'
  ).length;
  const awaitingPushOrMergeCount = activeTasks.filter(isTaskAwaitingPushOrMerge).length;
  const recentlyCompletedCount = tasks.filter((t) => t.status === 'Done').length;
  const overdueCount = activeTasks.filter((t) => isTaskOverdue(t, nowIso)).length;

  const todayStr = formatUnambiguousDate(nowIso, timezone, false);
  const nowTime = new Date(nowIso).getTime();
  const sevenDaysAgo = nowTime - 7 * 24 * 60 * 60 * 1000;

  let minutesToday = 0;
  let minutesThisWeek = 0;

  for (const entry of timeEntries) {
    const entryDayStr = formatUnambiguousDate(entry.startedAt, timezone, false);
    const entryTime = new Date(entry.startedAt).getTime();
    if (entryDayStr === todayStr) {
      minutesToday += entry.durationMinutes;
    }
    if (!Number.isNaN(entryTime) && entryTime >= sevenDaysAgo && entryTime <= nowTime + 86400000) {
      minutesThisWeek += entry.durationMinutes;
    }
  }

  return {
    assignedCount,
    inProgressCount,
    blockedCount,
    awaitingTestingOrReviewCount,
    awaitingPushOrMergeCount,
    recentlyCompletedCount,
    overdueCount,
    minutesToday,
    minutesThisWeek,
  };
}

export interface TaskFilterCriteria {
  search?: string;
  status?: TaskStatus | 'All';
  priority?: TaskPriority | 'All';
  project?: string | 'All';
  repository?: string | 'All';
  tag?: string | 'All';
  dateFrom?: string;
  dateTo?: string;
  showArchived?: boolean;
  sortBy?: 'assignedAt' | 'dueDate' | 'priority' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  Urgent: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

export function filterAndSortTasks(tasks: TaskRecord[], criteria: TaskFilterCriteria): TaskRecord[] {
  const searchLower = (criteria.search || '').trim().toLowerCase();
  const showArchived = Boolean(criteria.showArchived);

  const filtered = tasks.filter((task) => {
    if (!showArchived && task.isArchived) return false;
    if (showArchived && !task.isArchived) return false;

    if (criteria.status && criteria.status !== 'All' && task.status !== criteria.status) {
      return false;
    }
    if (criteria.priority && criteria.priority !== 'All' && task.priority !== criteria.priority) {
      return false;
    }
    if (criteria.project && criteria.project !== 'All' && task.projectName !== criteria.project) {
      return false;
    }
    if (
      criteria.repository &&
      criteria.repository !== 'All' &&
      !task.repositories.some((r) => r.repositoryName === criteria.repository)
    ) {
      return false;
    }
    if (criteria.tag && criteria.tag !== 'All' && !task.tags.includes(criteria.tag)) {
      return false;
    }

    if (criteria.dateFrom) {
      const fromTime = new Date(criteria.dateFrom).getTime();
      const taskTime = new Date(task.assignedAt).getTime();
      if (!Number.isNaN(fromTime) && taskTime < fromTime) return false;
    }
    if (criteria.dateTo) {
      const toTime = new Date(criteria.dateTo).getTime() + 86400000;
      const taskTime = new Date(task.assignedAt).getTime();
      if (!Number.isNaN(toTime) && taskTime > toTime) return false;
    }

    if (searchLower) {
      const inTitle = task.title.toLowerCase().includes(searchLower);
      const inCode = task.taskCode.toLowerCase().includes(searchLower);
      const inDesc = task.description.toLowerCase().includes(searchLower);
      const inRepoOrBranch = task.repositories.some(
        (r) =>
          r.repositoryName.toLowerCase().includes(searchLower) ||
          r.workingBranch.toLowerCase().includes(searchLower) ||
          r.baseBranch.toLowerCase().includes(searchLower) ||
          r.devTargetBranch.toLowerCase().includes(searchLower)
      );
      const inFilePaths = task.changedFiles.some((f) =>
        f.filePath.toLowerCase().includes(searchLower)
      );
      const inTags = task.tags.some((t) => t.toLowerCase().includes(searchLower));

      if (!inTitle && !inCode && !inDesc && !inRepoOrBranch && !inFilePaths && !inTags) {
        return false;
      }
    }

    return true;
  });

  const sortBy = criteria.sortBy || 'updatedAt';
  const sortOrder = criteria.sortOrder || 'desc';
  const dir = sortOrder === 'asc' ? 1 : -1;

  return filtered.sort((a, b) => {
    if (sortBy === 'priority') {
      const diff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      if (diff !== 0) return diff * dir;
    } else if (sortBy === 'dueDate') {
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      if (aDue !== bDue) return (aDue - bDue) * dir;
    } else if (sortBy === 'assignedAt') {
      const aTime = new Date(a.assignedAt).getTime();
      const bTime = new Date(b.assignedAt).getTime();
      if (aTime !== bTime) return (aTime - bTime) * dir;
    }
    const aUpd = new Date(a.updatedAt).getTime();
    const bUpd = new Date(b.updatedAt).getTime();
    return (aUpd - bUpd) * dir;
  });
}

export function generateTaskMarkdownReport(
  task: TaskRecord,
  timeEntries: TimeEntry[],
  timezone = 'Asia/Kolkata'
): string {
  const totalMinutes = timeEntries
    .filter((e) => e.taskId === task.id)
    .reduce((acc, e) => acc + e.durationMinutes, 0);

  const lines: string[] = [
    `# [${task.taskCode}] ${task.title}`,
    ``,
    `- **Project:** ${task.projectName}`,
    `- **Status:** ${task.status}`,
    `- **Priority:** ${task.priority}`,
    `- **Assigned By:** ${task.assignedBy || 'Self'} on ${formatUnambiguousDate(task.assignedAt, timezone, true)}`,
    `- **Started:** ${formatUnambiguousDate(task.startedAt, timezone, true)}`,
    `- **Completed:** ${formatUnambiguousDate(task.completedAt, timezone, true)}`,
    `- **Total Time Logged:** ${formatDurationMinutes(totalMinutes)}`,
    `- **Tags:** ${task.tags.join(', ') || 'None'}`,
    ``,
    `## 1. Overview & Acceptance Criteria`,
    task.description || '_No description provided._',
    ``,
    `**Expected Outcome:**`,
    task.expectedOutcome || '_Not specified._',
    ``,
    `**Acceptance Criteria:**`,
    task.acceptanceCriteria || '_Not specified._',
    ``,
    `## 2. Repositories & Branch Workflow`,
  ];

  for (const repo of task.repositories) {
    lines.push(
      `### Repository: \`${repo.repositoryName}\` (${repo.workflowMode})`,
      `- **Local Path:** \`${repo.localFolderPath}\``,
      `- **Remote URL:** ${repo.remoteUrl}`,
      `- **Base Branch:** \`${repo.baseBranch}\` -> **Working Branch:** \`${repo.workingBranch}\``,
      `- **Dev Target:** \`${repo.devTargetBranch}\` -> **Cloud Target:** \`${repo.cloudTargetName}\``,
      ``,
      `| Step | Stage | Status | Reference | Completed At |`,
      `| :--- | :--- | :--- | :--- | :--- |`
    );
    for (const s of repo.stages) {
      lines.push(
        `| ${s.stepNumber} | ${s.label} | ${s.status} | ${s.referenceValue || '—'} | ${formatUnambiguousDate(s.completedAt, timezone, true)} |`
      );
    }
    lines.push(``);
  }

  lines.push(
    `## 3. Problem & Investigation`,
    `### Original Requirement`,
    task.investigation.originalRequirement || '_None_',
    ``,
    `### Actual vs Expected Behavior`,
    `- **Actual:** ${task.investigation.actualBehavior || '—'}`,
    `- **Expected:** ${task.investigation.expectedBehavior || '—'}`,
    ``,
    `### Root Cause`,
    task.investigation.rootCause || '_None_',
    ``,
    `### Final Solution & Rationale`,
    task.investigation.finalSolution || '_None_',
    ``,
    `**Why Chosen:** ${task.investigation.whyChosen || '—'}`,
    ``,
    `**Follow-up / Limitations:** ${task.investigation.limitationsFollowUp || '—'}`,
    ``,
    `## 4. Changed Files (${task.changedFiles.length})`
  );

  for (const f of task.changedFiles) {
    lines.push(
      `- **[\`${f.repositoryName}\`] \`${f.filePath}\` (${f.changeType})**`,
      `  - *What changed:* ${f.whatChanged}`,
      `  - *Why needed:* ${f.whyChanged}`,
      `  - *Contribution:* ${f.solutionContribution}`
    );
  }

  lines.push(``, `## 5. Testing & Verification (${task.tests.length})`);
  for (const t of task.tests) {
    lines.push(
      `- **[${t.status}] ${t.title}** (${t.testType}) — Command/Steps: \`${t.commandOrSteps}\``,
      `  - *Expected:* ${t.expectedResult}`,
      `  - *Actual:* ${t.actualResult}${t.blockedOrSkippedReason ? ` (Reason: ${t.blockedOrSkippedReason})` : ''}`
    );
  }

  return lines.join('\n');
}

export const ALL_STATUSES: TaskStatus[] = [
  'Todo',
  'In Progress',
  'Push to Local Branch',
  'Push to Development Branch',
  'Push to Cloud',
  'Monitor Logs & Process',
  'Done',
];

export type BoardWorkflowColumnId =
  | 'Todo'
  | 'In Progress'
  | 'Push to Local Branch'
  | 'Push to Development Branch'
  | 'Push to Cloud'
  | 'Monitor Logs & Process'
  | 'Done';

export interface BoardWorkflowColumnDefinition {
  id: BoardWorkflowColumnId;
  label: string;
  subtitle: string;
  mappedStatuses: TaskStatus[];
  defaultDropStatus: TaskStatus;
}

export const BOARD_WORKFLOW_COLUMNS: BoardWorkflowColumnDefinition[] = [
  {
    id: 'Todo',
    label: 'Todo',
    subtitle: 'Backlog & Scoped',
    mappedStatuses: ['Todo'],
    defaultDropStatus: 'Todo',
  },
  {
    id: 'In Progress',
    label: 'In Progress',
    subtitle: 'Active Development',
    mappedStatuses: ['In Progress'],
    defaultDropStatus: 'In Progress',
  },
  {
    id: 'Push to Local Branch',
    label: 'Push to Local Branch',
    subtitle: 'Local Branch Push',
    mappedStatuses: ['Push to Local Branch'],
    defaultDropStatus: 'Push to Local Branch',
  },
  {
    id: 'Push to Development Branch',
    label: 'Push to Development Branch',
    subtitle: 'Dev Branch Push',
    mappedStatuses: ['Push to Development Branch'],
    defaultDropStatus: 'Push to Development Branch',
  },
  {
    id: 'Push to Cloud',
    label: 'Push to Cloud',
    subtitle: 'Cloud Deployment',
    mappedStatuses: ['Push to Cloud'],
    defaultDropStatus: 'Push to Cloud',
  },
  {
    id: 'Monitor Logs & Process',
    label: 'Monitor Logs & Process',
    subtitle: 'Logs & Verification',
    mappedStatuses: ['Monitor Logs & Process'],
    defaultDropStatus: 'Monitor Logs & Process',
  },
  {
    id: 'Done',
    label: 'Done',
    subtitle: 'Verified & Merged',
    mappedStatuses: ['Done'],
    defaultDropStatus: 'Done',
  },
];

export function mapStatusToBoardColumn(status: string): BoardWorkflowColumnId {
  switch (status) {
    case 'Todo':
    case 'Backlog':
    case 'Assigned':
      return 'Todo';
    case 'In Progress':
    case 'Blocked':
      return 'In Progress';
    case 'Push to Local Branch':
      return 'Push to Local Branch';
    case 'Push to Development Branch':
    case 'Ready for Testing':
    case 'In Review':
      return 'Push to Development Branch';
    case 'Push to Cloud':
      return 'Push to Cloud';
    case 'Monitor Logs & Process':
    case 'Monitor Logs & Processes':
      return 'Monitor Logs & Process';
    case 'Done':
      return 'Done';
    default:
      return 'Todo';
  }
}

export function resolveStatusFromBoardColumnDrop(
  targetColumnId: BoardWorkflowColumnId,
  currentStatus?: TaskStatus
): TaskStatus {
  const column = BOARD_WORKFLOW_COLUMNS.find((c) => c.id === targetColumnId);
  if (!column) {
    return currentStatus ?? 'Todo';
  }
  if (currentStatus && column.mappedStatuses.includes(currentStatus)) {
    return currentStatus;
  }
  return column.defaultDropStatus;
}

export function sortTasksByBoardOrder(tasks: TaskRecord[]): TaskRecord[] {
  const indexed = tasks.map((task, index) => ({ task, index }));
  indexed.sort((a, b) => {
    const aHasOrder = typeof a.task.boardOrder === 'number';
    const bHasOrder = typeof b.task.boardOrder === 'number';
    if (aHasOrder && bHasOrder && a.task.boardOrder !== b.task.boardOrder) {
      return (a.task.boardOrder as number) - (b.task.boardOrder as number);
    }
    if (aHasOrder && !bHasOrder) return -1;
    if (!aHasOrder && bHasOrder) return 1;
    return a.index - b.index;
  });
  return indexed.map((item) => item.task);
}

export function computeReorderedColumnTaskIds(
  columnTaskIds: string[],
  draggedTaskId: string,
  targetTaskId?: string | null,
  dropPosition: 'before' | 'after' | 'auto' = 'auto'
): string[] {
  if (!draggedTaskId) return [...columnTaskIds];

  if (!targetTaskId || targetTaskId === draggedTaskId) {
    if (columnTaskIds.includes(draggedTaskId)) {
      if (dropPosition === 'after') {
        const without = columnTaskIds.filter((id) => id !== draggedTaskId);
        return [...without, draggedTaskId];
      }
      return [...columnTaskIds];
    }
    return [...columnTaskIds, draggedTaskId];
  }

  const sourceIndex = columnTaskIds.indexOf(draggedTaskId);
  const targetIndex = columnTaskIds.indexOf(targetTaskId);

  if (targetIndex === -1) {
    if (columnTaskIds.includes(draggedTaskId)) {
      return [...columnTaskIds];
    }
    return [...columnTaskIds, draggedTaskId];
  }

  let effectivePosition: 'before' | 'after';
  if (dropPosition === 'before' || dropPosition === 'after') {
    effectivePosition = dropPosition;
  } else {
    // 'auto': when dragging an earlier item onto a later item in the same column, place it after; otherwise place before
    effectivePosition =
      sourceIndex !== -1 && sourceIndex < targetIndex ? 'after' : 'before';
  }

  const remaining = columnTaskIds.filter((id) => id !== draggedTaskId);
  const newTargetIdx = remaining.indexOf(targetTaskId);
  if (newTargetIdx === -1) {
    return [...remaining, draggedTaskId];
  }

  const insertAt = effectivePosition === 'after' ? newTargetIdx + 1 : newTargetIdx;
  const result = [...remaining];
  result.splice(insertAt, 0, draggedTaskId);
  return result;
}

export function groupTasksByBoardColumn(
  tasks: TaskRecord[]
): Record<BoardWorkflowColumnId, TaskRecord[]> {
  const grouped: Record<BoardWorkflowColumnId, TaskRecord[]> = {
    Todo: [],
    'In Progress': [],
    'Push to Local Branch': [],
    'Push to Development Branch': [],
    'Push to Cloud': [],
    'Monitor Logs & Process': [],
    Done: [],
  };

  for (const task of tasks) {
    const colId = mapStatusToBoardColumn(task.status);
    if (grouped[colId]) {
      grouped[colId].push(task);
    } else {
      grouped.Todo.push(task);
    }
  }

  return {
    Todo: sortTasksByBoardOrder(grouped.Todo),
    'In Progress': sortTasksByBoardOrder(grouped['In Progress']),
    'Push to Local Branch': sortTasksByBoardOrder(grouped['Push to Local Branch']),
    'Push to Development Branch': sortTasksByBoardOrder(grouped['Push to Development Branch']),
    'Push to Cloud': sortTasksByBoardOrder(grouped['Push to Cloud']),
    'Monitor Logs & Process': sortTasksByBoardOrder(grouped['Monitor Logs & Process']),
    Done: sortTasksByBoardOrder(grouped.Done),
  };
}


