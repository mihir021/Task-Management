import test, { after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mihir-db-regression-'));
process.env.MIHIR_DATA_DIR = path.join(temporary, 'MIHIR/data');
process.env.MIHIR_UPLOADS_DIR = path.join(temporary, 'MIHIR/uploads');
delete process.env.VERCEL;
delete process.env.MIHIR_USE_CLOUD_DB;
after(() => fs.rmSync(temporary, { recursive: true, force: true }));
const {
  createCompleteBackupBundle,
  deleteTaskById,
  getAllTasks,
  getFullWorkspaceState,
  getTaskById,
  reorderTasksInColumn,
  restoreDemoData,
  restoreFromBackupBundle,
  upsertTask,
} = await import('./db');
import { createDefaultGitStages, groupTasksByBoardColumn } from '../src/lib/workspaceLogic';
import { TaskRecord } from '../src/types/workspace';

test('SQLite database initializes sample Ray tasks and persists newly created tasks and column reordering', async () => {
  if ((await getAllTasks()).length < 4) {
    (await restoreDemoData());
  }
  const initialTasks = (await getAllTasks());
  assert.ok(initialTasks.length >= 4, 'Should have seeded at least 4 sample Ray tasks');
  assert.ok(
    initialTasks.some((t) => Array.isArray(t.subtasks) && t.subtasks.length >= 4),
    'Sample Ray tasks should include structured subtasks'
  );

  const testId = `test-persist-${Date.now()}`;
  const stages = createDefaultGitStages(
    'repo-test',
    'development2',
    'RAY-MIHIR-TEST-PERSIST',
    'development2',
    'cloud-release',
    'PR-Based'
  );

  (await upsertTask({
    id: testId,
    taskCode: 'MIHIR-999',
    title: 'Persistence verification test task',
    description: 'Testing SQLite persistence',
    ticketUrl: '',
    assignedBy: 'Mihir',
    assignedAt: '2026-10-21T10:00:00.000Z',
    priority: 'High',
    status: 'In Progress',
    dueDate: null,
    tags: ['verification'],
    expectedOutcome: 'Persisted in SQLite',
    acceptanceCriteria: 'Retrievable by ID',
    blockerNotes: '',
    projectName: 'Ray',
    isArchived: false,
    isDemo: true,
    createdAt: '2026-10-21T10:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z',
    startedAt: '2026-10-21T10:00:00.000Z',
    completedAt: null,
    repositories: [
      {
        id: 'repo-test',
        repositoryId: 'repo-raydashboard',
        repositoryName: 'raydashboard',
        remoteUrl: 'https://git.ray.internal/ray/raydashboard.git',
        localFolderPath: '/Users/mihir/workspace/ray/raydashboard',
        baseBranch: 'development2',
        workingBranch: 'RAY-MIHIR-TEST-PERSIST',
        devTargetBranch: 'development2',
        cloudTargetName: 'cloud-release',
        workflowMode: 'PR-Based',
        stages,
      },
    ],
    investigation: {
      originalRequirement: 'Req',
      actualBehavior: 'Act',
      expectedBehavior: 'Exp',
      stepsToReproduce: 'Steps',
      investigationNotes: 'Notes',
      rootCause: 'Cause',
      approachesConsidered: 'Approaches',
      finalSolution: 'Solution',
      whyChosen: 'Why',
      limitationsFollowUp: 'None',
    },
    changedFiles: [],
    attachments: [],
    tests: [],
  }));

  const fetched = (await getTaskById(testId));
  assert.ok(fetched);
  assert.equal(fetched.taskCode, 'MIHIR-999');
  assert.equal(fetched.repositories[0].workingBranch, 'RAY-MIHIR-TEST-PERSIST');

  // Test same-column task reordering persistence
  const devBranchTasks = groupTasksByBoardColumn((await getAllTasks()))['Push to Development Branch'] || [];
  if (devBranchTasks.length >= 2) {
    const reversedIds = devBranchTasks.map((t: TaskRecord) => t.id).reverse();
    (await reorderTasksInColumn(reversedIds));
    const afterReorder = groupTasksByBoardColumn((await getAllTasks()))['Push to Development Branch'] || [];
    assert.equal(afterReorder[0].id, reversedIds[0]);
    assert.equal(afterReorder[0].boardOrder, 1);
    assert.equal(afterReorder[1].id, reversedIds[1]);
    assert.equal(afterReorder[1].boardOrder, 2);
    // Restore original order
    (await reorderTasksInColumn([...reversedIds].reverse()));
  }

  // Test Backup Export & Restore with skip policy
  const bundle = (await createCompleteBackupBundle());
  assert.equal(bundle.app, 'MIHIR Workspace');
  assert.ok(bundle.uploadedFiles.length >= 4, 'Backup bundle should include sample SVG attachments');

  const restoreRes = (await restoreFromBackupBundle(bundle, 'skip'));
  assert.equal(restoreRes.importedTasks, 0);
  assert.ok(restoreRes.skippedTasks >= 5);

  (await deleteTaskById(testId));
  const state = (await getFullWorkspaceState());
  assert.ok(state.storageInfo.databasePath.endsWith('mihir_workspace.sqlite'));
});

