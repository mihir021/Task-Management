import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_WORKFLOW_COLUMNS,
  computeReorderedColumnTaskIds,
  createDefaultGitStages,
  evaluateTaskReadiness,
  computeDashboardMetrics,
  filterAndSortTasks,
  formatUnambiguousDate,
  groupTasksByBoardColumn,
  mapStatusToBoardColumn,
  parseAcceptanceCriteriaChecklist,
  resolveStatusFromBoardColumnDrop,
  sortTasksByBoardOrder,
  summarizeRepositoryProgress,
  summarizeTaskChecklistProgress,
} from './workspaceLogic';
import { RequiredCompletionChecks, TaskRecord } from '../types/workspace';
import { getNextTaskCodeFromList } from './taskCodeHelper';
import { DEFAULT_RAY_REPOSITORIES } from '../../server/seedAssets';

function createSampleTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  const stages = createDefaultGitStages(
    'repo-1',
    'development2',
    'RAY-MIHIR-Security-Graphs',
    'development2',
    'cloud-release',
    'PR-Based'
  );
  return {
    id: 'task-1',
    taskCode: 'MIHIR-001',
    title: 'Reorder Grafana security panels',
    description: 'Ensure Top Attack Vectors and SSL Expiry panels appear above throughput metrics.',
    ticketUrl: 'https://ray.internal/tickets/RAY-402',
    assignedBy: 'Arjun Mehta',
    assignedAt: '2026-10-19T09:00:00.000Z',
    priority: 'High',
    status: 'In Progress',
    dueDate: '2026-10-24T12:00:00.000Z',
    tags: ['grafana', 'security'],
    expectedOutcome: 'Panels reordered cleanly',
    acceptanceCriteria: 'Verified on development2',
    blockerNotes: '',
    projectName: 'Ray',
    isArchived: false,
    isDemo: true,
    createdAt: '2026-10-19T09:00:00.000Z',
    updatedAt: '2026-10-21T08:00:00.000Z',
    startedAt: '2026-10-19T10:00:00.000Z',
    completedAt: null,
    repositories: [
      {
        id: 'repo-1',
        repositoryId: 'cfg-raydashboard',
        repositoryName: 'raydashboard',
        remoteUrl: 'https://git.ray.internal/ray/raydashboard.git',
        localFolderPath: '/Users/mihir/workspace/ray/raydashboard',
        baseBranch: 'development2',
        workingBranch: 'RAY-MIHIR-Security-Graphs',
        devTargetBranch: 'development2',
        cloudTargetName: 'cloud-release',
        workflowMode: 'PR-Based',
        stages,
      },
    ],
    investigation: {
      originalRequirement: 'Reorder panels',
      actualBehavior: 'Panels at bottom',
      expectedBehavior: 'Panels at top',
      stepsToReproduce: 'Open Security dashboard',
      investigationNotes: 'Checked gridPos coordinates',
      rootCause: 'Hardcoded y-offsets in panel JSON',
      approachesConsidered: 'Dynamic vs static gridPos',
      finalSolution: 'Updated gridPos in security_overview.json',
      whyChosen: 'Deterministic layout across screen sizes',
      limitationsFollowUp: 'None',
    },
    changedFiles: [
      {
        id: 'fc-1',
        repositoryName: 'raydashboard',
        filePath: 'src/dashboards/security/security_overview.json',
        changeType: 'Modified',
        whatChanged: 'Adjusted y coordinates for security panels',
        whyChanged: 'Required for top placement',
        solutionContribution: 'Places critical alerts at top of viewport',
        codeSnippet: '',
        relatedCommit: 'a81f39c',
        testingNotes: 'Verified at 1440px',
        createdAt: '2026-10-20T11:00:00.000Z',
      },
    ],
    attachments: [],
    tests: [
      {
        id: 'test-1',
        title: 'Verify panel grid alignment',
        testType: 'Manual',
        commandOrSteps: 'npm run dev',
        expectedResult: 'No overlap',
        actualResult: 'Clean grid layout',
        status: 'Passed',
        testedAt: '2026-10-20T12:00:00.000Z',
        relatedAttachmentId: null,
        logs: '',
        blockedOrSkippedReason: '',
      },
    ],
    ...overrides,
  };
}

const DEFAULT_CHECKS: RequiredCompletionChecks = {
  requireAllTestsPassedOrSkipped: true,
  requireNoBlockedTests: true,
  requireGitCommitAndPush: true,
  requireDevMerge: true,
  requireRootCauseAndSolution: true,
};

test('formatUnambiguousDate formats date in Asia/Kolkata as DD Mon YYYY', () => {
  const formatted = formatUnambiguousDate('2026-10-21T12:00:00.000Z', 'Asia/Kolkata', false);
  assert.equal(formatted, '21 Oct 2026');
});

test('Blocked test never counts as passed and prevents task readiness', () => {
  const task = createSampleTask({
    tests: [
      {
        id: 'test-blocked',
        title: 'Integration check on staging',
        testType: 'Integration',
        commandOrSteps: 'npm run test:integration',
        expectedResult: '200 OK',
        actualResult: 'Staging VPN down',
        status: 'Blocked',
        testedAt: '2026-10-21T08:00:00.000Z',
        relatedAttachmentId: null,
        logs: '',
        blockedOrSkippedReason: 'Staging VPN maintenance',
      },
    ],
  });

  const readiness = evaluateTaskReadiness(task, DEFAULT_CHECKS);
  assert.equal(readiness.passedTests, 0);
  assert.equal(readiness.blockedTests, 1);
  assert.equal(readiness.isReady, false);
  assert.ok(readiness.missingChecks.some((m) => m.includes('Blocked')));
});

test('Git workflow stages distinguish local commit, remote push, dev merge, and cloud promotion', () => {
  const task = createSampleTask();
  const repo = task.repositories[0];

  // Mark commit_locally and push_remote as Completed, leave merge_dev as In Progress
  for (const stage of repo.stages) {
    if (stage.stageKey === 'commit_locally' || stage.stageKey === 'push_remote') {
      stage.status = 'Completed';
    }
  }

  const summary = summarizeRepositoryProgress(repo);
  assert.equal(summary.localCommitted, true);
  assert.equal(summary.remotePushed, true);
  assert.equal(summary.devMerged, false);
  assert.equal(summary.cloudPromoted, false);

  const readiness = evaluateTaskReadiness(task, DEFAULT_CHECKS);
  assert.equal(readiness.isReady, false);
  assert.ok(readiness.missingChecks.some((m) => m.includes('Merge into development target')));

  // Now complete merge_dev
  const mergeStage = repo.stages.find((s) => s.stageKey === 'merge_dev')!;
  mergeStage.status = 'Completed';

  const readinessAfterMerge = evaluateTaskReadiness(task, DEFAULT_CHECKS);
  assert.equal(readinessAfterMerge.isReady, true);
});

test('filterAndSortTasks searches by branch name, repository, and file path', () => {
  const t1 = createSampleTask();
  const t2 = createSampleTask({
    id: 'task-2',
    taskCode: 'MIHIR-002',
    title: 'SSL/TLS Website certificate key dropdown',
    priority: 'Urgent',
    repositories: [
      {
        ...t1.repositories[0],
        repositoryName: 'rayjobapp',
        workingBranch: 'RAY-MIHIR-SSL-TLS-ADD-PROFILE',
      },
    ],
    changedFiles: [
      {
        ...t1.changedFiles[0],
        repositoryName: 'rayjobapp',
        filePath: 'jobs/ssl_placeholder_mapper.py',
      },
    ],
  });

  const byBranch = filterAndSortTasks([t1, t2], { search: 'SSL-TLS-ADD-PROFILE' });
  assert.equal(byBranch.length, 1);
  assert.equal(byBranch[0].taskCode, 'MIHIR-002');

  const byFilePath = filterAndSortTasks([t1, t2], { search: 'ssl_placeholder_mapper.py' });
  assert.equal(byFilePath.length, 1);
  assert.equal(byFilePath[0].taskCode, 'MIHIR-002');

  const sortedByPriority = filterAndSortTasks([t1, t2], { sortBy: 'priority', sortOrder: 'desc' });
  assert.equal(sortedByPriority[0].taskCode, 'MIHIR-002');
});

test('computeDashboardMetrics calculates real counts and time logged', () => {
  const t1 = createSampleTask();
  // Mark commit_locally completed so it awaits push/merge
  t1.repositories[0].stages.find((s) => s.stageKey === 'commit_locally')!.status = 'Completed';

  const metrics = computeDashboardMetrics(
    [t1],
    [
      {
        id: 'te-1',
        taskId: 'task-1',
        taskCode: 'MIHIR-001',
        taskTitle: t1.title,
        startedAt: '2026-10-21T09:00:00.000Z',
        endedAt: '2026-10-21T10:30:00.000Z',
        durationMinutes: 90,
        notes: 'Panel layout adjustments',
        isManual: false,
      },
    ],
    '2026-10-21T12:00:00.000Z',
    'Asia/Kolkata'
  );

  assert.equal(metrics.assignedCount, 1);
  assert.equal(metrics.inProgressCount, 1);
  assert.equal(metrics.awaitingPushOrMergeCount, 1);
  assert.equal(metrics.minutesToday, 90);
  assert.equal(metrics.minutesThisWeek, 90);
});

test('summarizeTaskChecklistProgress computes progress for structured subtasks and acceptance criteria checklists', () => {
  const withSubtasks = createSampleTask({
    subtasks: [
      { id: 'st-1', title: 'Audit gridPos coordinates', completed: true },
      { id: 'st-2', title: 'Promote WAF & TLS panels to y=0', completed: true },
      { id: 'st-3', title: 'Add responsive single-column sort', completed: true },
      { id: 'st-4', title: 'Run unit tests', completed: false },
    ],
  });

  const prog1 = summarizeTaskChecklistProgress(withSubtasks);
  assert.equal(prog1.hasChecklist, true);
  assert.equal(prog1.source, 'subtasks');
  assert.equal(prog1.completedCount, 3);
  assert.equal(prog1.totalCount, 4);
  assert.equal(prog1.percent, 75);
  assert.equal(prog1.isComplete, false);

  const allDone = createSampleTask({
    subtasks: [
      { id: 'st-1', title: 'Step 1', completed: true },
      { id: 'st-2', title: 'Step 2', completed: true },
    ],
  });
  const progDone = summarizeTaskChecklistProgress(allDone);
  assert.equal(progDone.percent, 100);
  assert.equal(progDone.isComplete, true);

  const fallbackTask = createSampleTask({
    subtasks: [],
    acceptanceCriteria:
      '- [x] AbortController cancels stale fetches\n- [x] Batch endpoint in rayhubapp\n- [ ] IntersectionObserver lazy mount',
  });
  const progFallback = summarizeTaskChecklistProgress(fallbackTask);
  assert.equal(progFallback.hasChecklist, true);
  assert.equal(progFallback.source, 'acceptanceCriteria');
  assert.equal(progFallback.completedCount, 2);
  assert.equal(progFallback.totalCount, 3);
  assert.equal(progFallback.percent, 67);

  const parsedNumbered = parseAcceptanceCriteriaChecklist(
    '1. First check\n2. Second check',
    false
  );
  assert.equal(parsedNumbered.length, 2);
  assert.equal(parsedNumbered[0].title, 'First check');
});

test('Board view manages 7 granular workflow stages and resolves drag-and-drop transitions', () => {
  assert.equal(BOARD_WORKFLOW_COLUMNS.length, 7);
  assert.deepEqual(
    BOARD_WORKFLOW_COLUMNS.map((c) => c.id),
    [
      'Todo',
      'In Progress',
      'Push to Local Branch',
      'Push to Development Branch',
      'Push to Cloud',
      'Monitor Logs & Process',
      'Done',
    ]
  );

  assert.equal(mapStatusToBoardColumn('Backlog'), 'Todo');
  assert.equal(mapStatusToBoardColumn('Assigned'), 'Todo');
  assert.equal(mapStatusToBoardColumn('Todo'), 'Todo');
  assert.equal(mapStatusToBoardColumn('In Progress'), 'In Progress');
  assert.equal(mapStatusToBoardColumn('Blocked'), 'In Progress');
  assert.equal(mapStatusToBoardColumn('Push to Local Branch'), 'Push to Local Branch');
  assert.equal(mapStatusToBoardColumn('Push to Development Branch'), 'Push to Development Branch');
  assert.equal(mapStatusToBoardColumn('Ready for Testing'), 'Push to Development Branch');
  assert.equal(mapStatusToBoardColumn('In Review'), 'Push to Development Branch');
  assert.equal(mapStatusToBoardColumn('Push to Cloud'), 'Push to Cloud');
  assert.equal(mapStatusToBoardColumn('Monitor Logs & Process'), 'Monitor Logs & Process');
  assert.equal(mapStatusToBoardColumn('Done'), 'Done');

  // Dropping into a new column assigns that column's default status
  assert.equal(resolveStatusFromBoardColumnDrop('Todo', 'In Progress'), 'Todo');
  assert.equal(resolveStatusFromBoardColumnDrop('In Progress', 'Todo'), 'In Progress');
  assert.equal(resolveStatusFromBoardColumnDrop('Push to Local Branch', 'In Progress'), 'Push to Local Branch');
  assert.equal(resolveStatusFromBoardColumnDrop('Push to Development Branch', 'In Progress'), 'Push to Development Branch');
  assert.equal(resolveStatusFromBoardColumnDrop('Push to Cloud', 'Push to Development Branch'), 'Push to Cloud');
  assert.equal(resolveStatusFromBoardColumnDrop('Monitor Logs & Process', 'Push to Cloud'), 'Monitor Logs & Process');
  assert.equal(resolveStatusFromBoardColumnDrop('Done', 'Monitor Logs & Process'), 'Done');

  // Dropping within the same column preserves the status
  assert.equal(resolveStatusFromBoardColumnDrop('Todo', 'Todo'), 'Todo');
  assert.equal(resolveStatusFromBoardColumnDrop('In Progress', 'In Progress'), 'In Progress');
  assert.equal(resolveStatusFromBoardColumnDrop('Push to Cloud', 'Push to Cloud'), 'Push to Cloud');

  const tasks = [
    createSampleTask({ id: 't1', taskCode: 'MIHIR-001', status: 'Push to Development Branch' }),
    createSampleTask({ id: 't2', taskCode: 'MIHIR-002', status: 'In Progress' }),
    createSampleTask({ id: 't3', taskCode: 'MIHIR-003', status: 'Todo' }),
    createSampleTask({ id: 't4', taskCode: 'MIHIR-004', status: 'Done' }),
  ];

  const grouped = groupTasksByBoardColumn(tasks);
  assert.equal(grouped['Todo'].length, 1);
  assert.equal(grouped['Todo'][0].taskCode, 'MIHIR-003');
  assert.equal(grouped['In Progress'].length, 1);
  assert.equal(grouped['In Progress'][0].taskCode, 'MIHIR-002');
  assert.equal(grouped['Push to Development Branch'].length, 1);
  assert.equal(grouped['Push to Development Branch'][0].taskCode, 'MIHIR-001');
  assert.equal(grouped['Done'].length, 1);
  assert.equal(grouped['Done'][0].taskCode, 'MIHIR-004');
});

test('computeReorderedColumnTaskIds and sortTasksByBoardOrder support same-column and cross-column reordering', () => {
  const initialIds = ['task-a', 'task-b', 'task-c'];

  // Move last item before first item
  assert.deepEqual(
    computeReorderedColumnTaskIds(initialIds, 'task-c', 'task-a', 'before'),
    ['task-c', 'task-a', 'task-b']
  );

  // Move first item after second item
  assert.deepEqual(
    computeReorderedColumnTaskIds(initialIds, 'task-a', 'task-b', 'after'),
    ['task-b', 'task-a', 'task-c']
  );

  // Auto mode: dragging earlier onto later places after; dragging later onto earlier places before
  assert.deepEqual(
    computeReorderedColumnTaskIds(initialIds, 'task-a', 'task-c', 'auto'),
    ['task-b', 'task-c', 'task-a']
  );
  assert.deepEqual(
    computeReorderedColumnTaskIds(initialIds, 'task-c', 'task-a', 'auto'),
    ['task-c', 'task-a', 'task-b']
  );

  // Cross-column insert before a specific target card
  assert.deepEqual(
    computeReorderedColumnTaskIds(initialIds, 'task-new', 'task-b', 'before'),
    ['task-a', 'task-new', 'task-b', 'task-c']
  );

  // Sort tasks by boardOrder within a column
  const tasksInReview = [
    createSampleTask({ id: 'r1', taskCode: 'MIHIR-001', status: 'Push to Development Branch', boardOrder: 2 }),
    createSampleTask({ id: 'r2', taskCode: 'MIHIR-003', status: 'Push to Development Branch', boardOrder: 1 }),
  ];
  const sorted = sortTasksByBoardOrder(tasksInReview);
  assert.deepEqual(
    sorted.map((t) => t.taskCode),
    ['MIHIR-003', 'MIHIR-001']
  );
});

test('getNextTaskCodeFromList auto-assigns sequential MIHIR-XXX task IDs and DEFAULT_RAY_REPOSITORIES includes all 7 Ray repos', () => {
  assert.equal(getNextTaskCodeFromList([]), 'MIHIR-001');
  const existing = [
    createSampleTask({ id: '1', taskCode: 'MIHIR-001' }),
    createSampleTask({ id: '4', taskCode: 'MIHIR-004' }),
    createSampleTask({ id: '2', taskCode: 'MIHIR-002' }),
  ];
  assert.equal(getNextTaskCodeFromList(existing), 'MIHIR-005');

  const repoNames = DEFAULT_RAY_REPOSITORIES.map((r) => r.name);
  assert.deepEqual(repoNames, [
    'rayapp',
    'raydashboard',
    'raydashboard-power-btn-fix',
    'raygateway',
    'rayhubapp',
    'rayhubdashboard',
    'rayjobapp',
  ]);
});
