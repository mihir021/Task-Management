import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ActivityItem,
  DuplicatePolicy,
  ProjectConfig,
  RepositoryConfig,
  TaskRecord,
  TaskStatus,
  TimeEntry,
  WorkNote,
  WorkspaceSettings,
  WorkspaceStatePayload,
} from '../src/types/workspace';
import {
  createInitialSeedData,
  DEFAULT_DEMO_SUBTASKS,
  DEFAULT_RAY_REPOSITORIES,
  ensureSampleUploadFiles,
} from './seedAssets';

/** Vercel serverless has a read-only filesystem (except /tmp). Use in-memory SQLite there. */
export const IS_VERCEL = Boolean(process.env.VERCEL);

const MIHIR_ROOT = IS_VERCEL ? '/tmp' : path.resolve(process.cwd(), 'MIHIR');
export const DATA_DIR = path.join(MIHIR_ROOT, 'data');
export const UPLOADS_DIR = path.join(MIHIR_ROOT, 'uploads');
export const DB_PATH = IS_VERCEL ? ':memory:' : path.join(DATA_DIR, 'mihir_workspace.sqlite');

if (!IS_VERCEL) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    task_code TEXT NOT NULL,
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    project_name TEXT NOT NULL,
    is_archived INTEGER NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    data_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    data_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    project_name TEXT NOT NULL,
    data_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    data_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    timestamp TEXT NOT NULL,
    data_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS work_notes (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    data_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workspace_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_threads (
    id TEXT PRIMARY KEY,
    updated_at TEXT NOT NULL,
    data_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_focus (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    data_json TEXT NOT NULL
  );
`);

function initializeSeedIfNeeded() {
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM workspace_settings WHERE key = 'initialized'`).get() as { cnt: number };
  if (row && row.cnt > 0) {
    return;
  }

  const seed = createInitialSeedData();

  const insertProject = db.prepare(`INSERT OR REPLACE INTO projects (id, name, data_json) VALUES (?, ?, ?)`);
  for (const p of seed.projects) {
    insertProject.run(p.id, p.name, JSON.stringify(p));
  }

  const insertRepo = db.prepare(`INSERT OR REPLACE INTO repositories (id, name, project_name, data_json) VALUES (?, ?, ?, ?)`);
  for (const r of seed.repositories) {
    insertRepo.run(r.id, r.name, r.projectName, JSON.stringify(r));
  }

  const insertTask = db.prepare(`
    INSERT OR REPLACE INTO tasks (id, task_code, status, priority, project_name, is_archived, is_demo, updated_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const t of seed.tasks) {
    insertTask.run(
      t.id,
      t.taskCode,
      t.status,
      t.priority,
      t.projectName,
      t.isArchived ? 1 : 0,
      t.isDemo ? 1 : 0,
      t.updatedAt,
      JSON.stringify(t)
    );
  }

  const insertTime = db.prepare(`
    INSERT OR REPLACE INTO time_entries (id, task_id, started_at, duration_minutes, data_json)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const te of seed.timeEntries) {
    insertTime.run(te.id, te.taskId, te.startedAt, te.durationMinutes, JSON.stringify(te));
  }

  const insertAct = db.prepare(`
    INSERT OR REPLACE INTO activity_log (id, task_id, timestamp, data_json)
    VALUES (?, ?, ?, ?)
  `);
  for (const act of seed.activity) {
    insertAct.run(act.id, act.taskId, act.timestamp, JSON.stringify(act));
  }

  const insertNote = db.prepare(`
    INSERT OR REPLACE INTO work_notes (id, created_at, data_json)
    VALUES (?, ?, ?)
  `);
  for (const wn of seed.workNotes) {
    insertNote.run(wn.id, wn.createdAt, JSON.stringify(wn));
  }

  const insertSetting = db.prepare(`INSERT OR REPLACE INTO workspace_settings (key, value_json) VALUES (?, ?)`);
  insertSetting.run('main', JSON.stringify(seed.settings));
  insertSetting.run('initialized', JSON.stringify({ seededAt: new Date().toISOString() }));
}

function ensureDefaultRepositories() {
  const existingRows = db.prepare(`SELECT data_json FROM repositories`).all() as Array<{ data_json: string }>;
  const existingByName = new Map<string, RepositoryConfig>();
  for (const row of existingRows) {
    const parsed = JSON.parse(row.data_json) as RepositoryConfig;
    existingByName.set(parsed.name.toLowerCase(), parsed);
  }

  const insertOrReplaceRepo = db.prepare(
    `INSERT OR REPLACE INTO repositories (id, name, project_name, data_json) VALUES (?, ?, ?, ?)`
  );

  for (const defRepo of DEFAULT_RAY_REPOSITORIES) {
    const found = existingByName.get(defRepo.name.toLowerCase());
    if (!found) {
      insertOrReplaceRepo.run(defRepo.id, defRepo.name, defRepo.projectName, JSON.stringify(defRepo));
    } else if (found.localFolderPath && found.localFolderPath.startsWith('/Users/mihir/workspace/ray/')) {
      const cleaned: RepositoryConfig = {
        ...found,
        localFolderPath: found.name,
      };
      insertOrReplaceRepo.run(cleaned.id, cleaned.name, cleaned.projectName, JSON.stringify(cleaned));
    }
  }
}

initializeSeedIfNeeded();
ensureDefaultRepositories();

function mapLegacyTaskStatus(status: string): TaskStatus {
  switch (status) {
    case 'Todo':
      return 'Todo';
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
    case 'Review':
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

function normalizeStoredTask(raw: TaskRecord): TaskRecord {
  let modified = false;
  let task = raw;

  const normalizedStatus = mapLegacyTaskStatus(task.status as string);
  if (task.status !== normalizedStatus) {
    task = { ...task, status: normalizedStatus };
    modified = true;
  }

  if (!Array.isArray(task.subtasks)) {
    const demoDefault = DEFAULT_DEMO_SUBTASKS[task.taskCode];
    task = {
      ...task,
      subtasks: demoDefault ? demoDefault.map((item) => ({ ...item })) : [],
    };
    modified = true;
  }

  if (modified) {
    db.prepare(`UPDATE tasks SET status = ?, data_json = ? WHERE id = ?`).run(
      task.status,
      JSON.stringify(task),
      task.id
    );
  }

  return task;
}

export function getAllTasks(): TaskRecord[] {
  const rows = db.prepare(`SELECT data_json FROM tasks ORDER BY updated_at DESC`).all() as Array<{ data_json: string }>;
  return rows.map((r) => normalizeStoredTask(JSON.parse(r.data_json) as TaskRecord));
}

export function getTaskById(id: string): TaskRecord | null {
  const row = db.prepare(`SELECT data_json FROM tasks WHERE id = ?`).get(id) as { data_json: string } | undefined;
  return row ? normalizeStoredTask(JSON.parse(row.data_json) as TaskRecord) : null;
}

export function getNextTaskCode(): string {
  const tasks = getAllTasks();
  let maxNum = 0;
  for (const t of tasks) {
    const match = t.taskCode.match(/MIHIR-(\d+)/i);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  const next = maxNum + 1;
  return `MIHIR-${String(next).padStart(3, '0')}`;
}

export function upsertTask(task: TaskRecord): TaskRecord {
  const now = new Date().toISOString();
  const updated: TaskRecord = {
    ...task,
    updatedAt: now,
  };
  db.prepare(`
    INSERT OR REPLACE INTO tasks (id, task_code, status, priority, project_name, is_archived, is_demo, updated_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    updated.id,
    updated.taskCode,
    updated.status,
    updated.priority,
    updated.projectName,
    updated.isArchived ? 1 : 0,
    updated.isDemo ? 1 : 0,
    updated.updatedAt,
    JSON.stringify(updated)
  );
  return updated;
}

export function reorderTasksInColumn(
  orderedTaskIds: string[],
  statusUpdates?: Record<string, TaskRecord['status']>
): TaskRecord[] {
  const now = new Date().toISOString();
  const updatedTasks: TaskRecord[] = [];
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tasks (id, task_code, status, priority, project_name, is_archived, is_demo, updated_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  orderedTaskIds.forEach((taskId, index) => {
    const existing = getTaskById(taskId);
    if (!existing) return;

    const requestedStatus = statusUpdates?.[taskId];
    const statusChanged = Boolean(requestedStatus && requestedStatus !== existing.status);
    const nextStatus = requestedStatus || existing.status;

    let startedAt = existing.startedAt;
    if (nextStatus === 'In Progress' && !startedAt) {
      startedAt = now;
    }
    let completedAt = existing.completedAt;
    if (nextStatus === 'Done' && existing.status !== 'Done') {
      completedAt = now;
    } else if (nextStatus !== 'Done') {
      completedAt = null;
    }

    const updated: TaskRecord = {
      ...existing,
      status: nextStatus,
      startedAt,
      completedAt,
      boardOrder: index + 1,
      updatedAt: statusChanged ? now : existing.updatedAt,
    };

    stmt.run(
      updated.id,
      updated.taskCode,
      updated.status,
      updated.priority,
      updated.projectName,
      updated.isArchived ? 1 : 0,
      updated.isDemo ? 1 : 0,
      updated.updatedAt,
      JSON.stringify(updated)
    );
    updatedTasks.push(updated);
  });

  return updatedTasks;
}

export function deleteTaskById(id: string): void {
  db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
  db.prepare(`DELETE FROM time_entries WHERE task_id = ?`).run(id);
}

export function getAllProjects(): ProjectConfig[] {
  const rows = db.prepare(`SELECT data_json FROM projects ORDER BY name ASC`).all() as Array<{ data_json: string }>;
  return rows.map((r) => JSON.parse(r.data_json) as ProjectConfig);
}

export function upsertProject(project: ProjectConfig): ProjectConfig {
  db.prepare(`INSERT OR REPLACE INTO projects (id, name, data_json) VALUES (?, ?, ?)`).run(
    project.id,
    project.name,
    JSON.stringify(project)
  );
  return project;
}

export function deleteProjectById(id: string): void {
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
}

export function getAllRepositories(): RepositoryConfig[] {
  const rows = db.prepare(`SELECT data_json FROM repositories ORDER BY name ASC`).all() as Array<{ data_json: string }>;
  return rows.map((r) => JSON.parse(r.data_json) as RepositoryConfig);
}

export function upsertRepository(repo: RepositoryConfig): RepositoryConfig {
  db.prepare(`INSERT OR REPLACE INTO repositories (id, name, project_name, data_json) VALUES (?, ?, ?, ?)`).run(
    repo.id,
    repo.name,
    repo.projectName,
    JSON.stringify(repo)
  );
  return repo;
}

export function deleteRepositoryById(id: string): void {
  db.prepare(`DELETE FROM repositories WHERE id = ?`).run(id);
}

export function getAllTimeEntries(): TimeEntry[] {
  const rows = db.prepare(`SELECT data_json FROM time_entries ORDER BY started_at DESC`).all() as Array<{ data_json: string }>;
  return rows.map((r) => JSON.parse(r.data_json) as TimeEntry);
}

export function upsertTimeEntry(entry: TimeEntry): TimeEntry {
  db.prepare(`
    INSERT OR REPLACE INTO time_entries (id, task_id, started_at, duration_minutes, data_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(entry.id, entry.taskId, entry.startedAt, entry.durationMinutes, JSON.stringify(entry));
  return entry;
}

export function deleteTimeEntryById(id: string): void {
  db.prepare(`DELETE FROM time_entries WHERE id = ?`).run(id);
}

export function getAllActivity(): ActivityItem[] {
  const rows = db.prepare(`SELECT data_json FROM activity_log ORDER BY timestamp DESC LIMIT 250`).all() as Array<{ data_json: string }>;
  return rows.map((r) => JSON.parse(r.data_json) as ActivityItem);
}

export function logActivity(item: Omit<ActivityItem, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): ActivityItem {
  const full: ActivityItem = {
    id: item.id || `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: item.timestamp || new Date().toISOString(),
    taskId: item.taskId,
    taskCode: item.taskCode,
    actionType: item.actionType,
    summary: item.summary,
    details: item.details,
  };
  db.prepare(`INSERT OR REPLACE INTO activity_log (id, task_id, timestamp, data_json) VALUES (?, ?, ?, ?)`).run(
    full.id,
    full.taskId,
    full.timestamp,
    JSON.stringify(full)
  );
  return full;
}

export function getAllWorkNotes(): WorkNote[] {
  const rows = db.prepare(`SELECT data_json FROM work_notes ORDER BY created_at DESC`).all() as Array<{ data_json: string }>;
  return rows.map((r) => JSON.parse(r.data_json) as WorkNote);
}

export function upsertWorkNote(note: WorkNote): WorkNote {
  db.prepare(`INSERT OR REPLACE INTO work_notes (id, created_at, data_json) VALUES (?, ?, ?)`).run(
    note.id,
    note.createdAt,
    JSON.stringify(note)
  );
  return note;
}

export function deleteWorkNoteById(id: string): void {
  db.prepare(`DELETE FROM work_notes WHERE id = ?`).run(id);
}

export function getSettings(): WorkspaceSettings {
  const row = db.prepare(`SELECT value_json FROM workspace_settings WHERE key = 'main'`).get() as { value_json: string } | undefined;
  if (!row) {
    const seed = createInitialSeedData();
    return seed.settings;
  }
  return JSON.parse(row.value_json) as WorkspaceSettings;
}

export function saveSettings(settings: WorkspaceSettings): WorkspaceSettings {
  db.prepare(`INSERT OR REPLACE INTO workspace_settings (key, value_json) VALUES ('main', ?)`).run(
    JSON.stringify(settings)
  );
  return settings;
}

export function clearAllWorkspaceData(): void {
  db.prepare(`DELETE FROM tasks`).run();
  db.prepare(`DELETE FROM time_entries`).run();
  db.prepare(`DELETE FROM activity_log`).run();
  db.prepare(`DELETE FROM work_notes`).run();
  db.prepare(`DELETE FROM chat_threads`).run();
  db.prepare(`DELETE FROM daily_focus`).run();

  if (!IS_VERCEL && fs.existsSync(UPLOADS_DIR)) {
    const files = fs.readdirSync(UPLOADS_DIR);
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(UPLOADS_DIR, file));
      } catch (err) {
        console.error(`Failed to delete upload file ${file}:`, err);
      }
    }
  }

  db.prepare(`INSERT OR REPLACE INTO workspace_settings (key, value_json) VALUES ('initialized', ?)`).run(
    JSON.stringify({ seededAt: new Date().toISOString(), clean: true })
  );

  logActivity({
    taskId: null,
    taskCode: null,
    actionType: 'system',
    summary: 'Workspace cleared of all data for a fresh start',
    details: 'All tasks, notes, chat threads, time entries, focus items, and uploads removed.',
  });
}

export function removeDemoData(): void {
  clearAllWorkspaceData();
}

export function restoreDemoData(): void {
  ensureSampleUploadFiles(UPLOADS_DIR);
  const seed = createInitialSeedData();
  for (const p of seed.projects) upsertProject(p);
  for (const r of seed.repositories) upsertRepository(r);
  for (const t of seed.tasks) upsertTask(t);
  for (const te of seed.timeEntries) upsertTimeEntry(te);
  for (const wn of seed.workNotes) upsertWorkNote(wn);
  for (const act of seed.activity) logActivity(act);

  const defaultFocus: DailyFocusItem[] = [
    {
      id: 'focus-1',
      text: 'Verify MIHIR-001 Grafana security panel y=0 coordinates on development2',
      taskCode: 'MIHIR-001',
      completed: true,
      createdAt: '2026-10-21T03:30:00.000Z',
    },
    {
      id: 'focus-2',
      text: 'Push RAY-MIHIR-Security-Graphs batch query fix & run load check',
      taskCode: 'MIHIR-002',
      completed: false,
      createdAt: '2026-10-21T04:00:00.000Z',
    },
    {
      id: 'focus-3',
      text: 'Re-run MIHIR-004 SSL/TLS placeholder Vault integration check once unblocked',
      taskCode: 'MIHIR-004',
      completed: false,
      createdAt: '2026-10-21T04:30:00.000Z',
    },
  ];
  for (const item of defaultFocus) upsertDailyFocusItem(item);
}

export function getFullWorkspaceState(): WorkspaceStatePayload {
  const tasks = getAllTasks();
  const attachmentCount = tasks.reduce((acc, t) => acc + t.attachments.length, 0);
  return {
    tasks,
    projects: getAllProjects(),
    repositories: getAllRepositories(),
    timeEntries: getAllTimeEntries(),
    activity: getAllActivity(),
    workNotes: getAllWorkNotes(),
    settings: getSettings(),
    storageInfo: {
      databasePath: DB_PATH,
      uploadsPath: UPLOADS_DIR,
      taskCount: tasks.length,
      attachmentCount,
    },
  };
}

export interface BackupBundle {
  version: string;
  exportedAt: string;
  app: 'MIHIR Workspace';
  state: Omit<WorkspaceStatePayload, 'storageInfo'>;
  uploadedFiles: Array<{
    fileName: string;
    mimeType: string;
    base64Data: string;
  }>;
}

export function createCompleteBackupBundle(): BackupBundle {
  const state = getFullWorkspaceState();
  const referencedFiles = new Map<string, string>();
  for (const task of state.tasks) {
    for (const att of task.attachments) {
      referencedFiles.set(att.fileName, att.mimeType);
    }
  }

  const uploadedFiles: BackupBundle['uploadedFiles'] = [];
  for (const [fileName, mimeType] of referencedFiles.entries()) {
    const fullPath = path.join(UPLOADS_DIR, path.basename(fileName));
    if (fs.existsSync(fullPath)) {
      const buf = fs.readFileSync(fullPath);
      uploadedFiles.push({
        fileName: path.basename(fileName),
        mimeType,
        base64Data: buf.toString('base64'),
      });
    }
  }

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    app: 'MIHIR Workspace',
    state: {
      tasks: state.tasks,
      projects: state.projects,
      repositories: state.repositories,
      timeEntries: state.timeEntries,
      activity: state.activity,
      workNotes: state.workNotes,
      settings: state.settings,
    },
    uploadedFiles,
  };
}

export function restoreFromBackupBundle(
  bundle: BackupBundle,
  duplicatePolicy: DuplicatePolicy
): { importedTasks: number; skippedTasks: number; restoredFiles: number } {
  if (!bundle || bundle.app !== 'MIHIR Workspace' || !bundle.state || !Array.isArray(bundle.state.tasks)) {
    throw new Error('Invalid MIHIR Workspace backup file format.');
  }

  let restoredFiles = 0;
  if (Array.isArray(bundle.uploadedFiles)) {
    for (const f of bundle.uploadedFiles) {
      if (f.fileName && f.base64Data) {
        const safeName = path.basename(f.fileName);
        const dest = path.join(UPLOADS_DIR, safeName);
        fs.writeFileSync(dest, Buffer.from(f.base64Data, 'base64'));
        restoredFiles++;
      }
    }
  }

  if (Array.isArray(bundle.state.projects)) {
    for (const p of bundle.state.projects) upsertProject(p);
  }
  if (Array.isArray(bundle.state.repositories)) {
    for (const r of bundle.state.repositories) upsertRepository(r);
  }
  if (bundle.state.settings) {
    saveSettings(bundle.state.settings);
  }

  const existingTasks = new Map(getAllTasks().map((t) => [t.id, t]));
  let importedTasks = 0;
  let skippedTasks = 0;

  for (const incoming of bundle.state.tasks) {
    const exists = existingTasks.has(incoming.id);
    if (exists && duplicatePolicy === 'skip') {
      skippedTasks++;
      continue;
    }
    if (exists && duplicatePolicy === 'duplicate') {
      const newCode = getNextTaskCode();
      const cloned: TaskRecord = {
        ...incoming,
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        taskCode: newCode,
        title: `${incoming.title} (Restored Copy)`,
      };
      upsertTask(cloned);
      importedTasks++;
      continue;
    }
    // Overwrite or new
    upsertTask(incoming);
    importedTasks++;
  }

  if (Array.isArray(bundle.state.timeEntries)) {
    for (const te of bundle.state.timeEntries) {
      if (duplicatePolicy !== 'skip') {
        upsertTimeEntry(te);
      }
    }
  }

  if (Array.isArray(bundle.state.workNotes)) {
    for (const wn of bundle.state.workNotes) {
      if (duplicatePolicy !== 'skip') {
        upsertWorkNote(wn);
      }
    }
  }

  logActivity({
    taskId: null,
    taskCode: null,
    actionType: 'system',
    summary: `Restored backup (${importedTasks} tasks imported, ${skippedTasks} skipped, ${restoredFiles} attachments restored)`,
    details: `Duplicate policy: ${duplicatePolicy}`,
  });

  return { importedTasks, skippedTasks, restoredFiles };
}

export interface DailyFocusItem {
  id: string;
  text: string;
  taskCode: string;
  completed: boolean;
  createdAt: string;
}

export function getAllDailyFocusItems(): DailyFocusItem[] {
  const rows = db.prepare(`SELECT data_json FROM daily_focus ORDER BY created_at ASC`).all() as Array<{ data_json: string }>;
  return rows.map((r) => JSON.parse(r.data_json) as DailyFocusItem);
}

export function upsertDailyFocusItem(item: DailyFocusItem): DailyFocusItem {
  db.prepare(`INSERT OR REPLACE INTO daily_focus (id, created_at, data_json) VALUES (?, ?, ?)`).run(
    item.id,
    item.createdAt,
    JSON.stringify(item)
  );
  return item;
}

export function deleteDailyFocusItemById(id: string): void {
  db.prepare(`DELETE FROM daily_focus WHERE id = ?`).run(id);
}

export function getAllChatThreads(): any[] {
  const rows = db.prepare(`SELECT data_json FROM chat_threads ORDER BY updated_at DESC`).all() as Array<{ data_json: string }>;
  if (rows.length === 0) {
    const starterThread = {
      id: 'thread-ray-starter',
      title: 'MIHIR-002 Graph Loading & Multi-Repo Investigation',
      roleId: 'investigator',
      modelId: 'gemini-3.8-flash',
      linkedTaskId: 'task-mihir-002',
      createdAt: '2026-10-21T05:00:00.000Z',
      updatedAt: '2026-10-21T05:05:00.000Z',
      messages: [
        {
          id: 'msg-starter-1',
          sender: 'user',
          text: 'Summarize the root cause and next Git release steps for MIHIR-002 across raydashboard and rayhubapp.',
          modelUsed: 'gemini-3.8-flash',
          createdAt: '2026-10-21T05:00:00.000Z',
        },
        {
          id: 'msg-starter-2',
          sender: 'model',
          text: '### MIHIR-002 Root Cause & Multi-Repo Release Plan\n\n- **Root Cause**: Switching time-range filters in `raydashboard` triggered 6 unbatched timeseries requests without aborting stale in-flight requests.\n- **Fix Applied**:\n  1. `raydashboard` (`src/hooks/useSecurityGraphData.ts` on `RAY-MIHIR-Security-Graphs`): Added `AbortController` cleanup and 250ms debounce.\n  2. `rayhubapp` (`src/controllers/metricsBatchController.ts` on `RAY-MIHIR-Security-Graphs`): Added `POST /api/v2/security/metrics/batch`.\n- **Next Git Stepper Actions**:\n  - Complete **Stage 7 (Commit locally)** and **Stage 8 (Push working branch)** in both `raydashboard` (`development2`) and `rayhubapp` (`development`).',
          modelUsed: 'gemini-3.8-flash',
          createdAt: '2026-10-21T05:01:00.000Z',
        },
      ],
    };
    db.prepare(`INSERT OR REPLACE INTO chat_threads (id, updated_at, data_json) VALUES (?, ?, ?)`).run(
      starterThread.id,
      starterThread.updatedAt,
      JSON.stringify(starterThread)
    );
    return [starterThread];
  }
  return rows.map((r) => JSON.parse(r.data_json));
}

export function getChatThreadById(id: string): any | null {
  const row = db.prepare(`SELECT data_json FROM chat_threads WHERE id = ?`).get(id) as { data_json: string } | undefined;
  return row ? JSON.parse(row.data_json) : null;
}

export function upsertChatThread(thread: any): any {
  db.prepare(`INSERT OR REPLACE INTO chat_threads (id, updated_at, data_json) VALUES (?, ?, ?)`).run(
    thread.id,
    thread.updatedAt,
    JSON.stringify(thread)
  );
  return thread;
}

export function deleteChatThreadById(id: string): void {
  db.prepare(`DELETE FROM chat_threads WHERE id = ?`).run(id);
}

