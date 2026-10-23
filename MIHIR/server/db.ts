import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from './database.js';
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
} from '../src/types/workspace.js';
import {
  createInitialSeedData,
  DEFAULT_DEMO_SUBTASKS,
  DEFAULT_RAY_REPOSITORIES,
  ensureSampleUploadFiles,
} from './seedAssets.js';

/** Vercel requires a durable remote database; never silently fall back to memory. */
export const IS_VERCEL = Boolean(process.env.VERCEL);

const MIHIR_ROOT = IS_VERCEL ? '/tmp' : path.resolve(process.cwd(), 'MIHIR');
export const DATA_DIR = process.env.MIHIR_DATA_DIR || path.join(MIHIR_ROOT, 'data');
export const UPLOADS_DIR = process.env.MIHIR_UPLOADS_DIR || path.join(MIHIR_ROOT, 'uploads');
export const DB_PATH = IS_VERCEL ? 'cloud:turso' : path.join(DATA_DIR, 'mihir_workspace.sqlite');

if (!IS_VERCEL) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const db = openDatabase(DB_PATH, IS_VERCEL);
export const databaseProvider = db.provider;
export const databaseConfigured = db.configured;

const schema = `
  CREATE TABLE IF NOT EXISTS uploaded_files (
    file_name TEXT PRIMARY KEY,
    mime_type TEXT NOT NULL,
    base64_data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS task_code_sequence (id INTEGER PRIMARY KEY, last_number INTEGER NOT NULL);

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
`;

async function initializeSeedIfNeeded() {
  const row = (await db.prepare(`SELECT COUNT(*) as cnt FROM workspace_settings WHERE key = 'initialized'`).get()) as { cnt: number };
  if (row && row.cnt > 0) {
    return;
  }

  if (!IS_VERCEL) ensureSampleUploadFiles(UPLOADS_DIR);
  const seed = createInitialSeedData();
  if (IS_VERCEL) { seed.tasks = []; seed.timeEntries = []; seed.activity = []; seed.workNotes = []; }

  const insertProject = db.prepare(`INSERT OR REPLACE INTO projects (id, name, data_json) VALUES (?, ?, ?)`);
  for (const p of seed.projects) {
    (await insertProject.run(p.id, p.name, JSON.stringify(p)));
  }

  const insertRepo = db.prepare(`INSERT OR REPLACE INTO repositories (id, name, project_name, data_json) VALUES (?, ?, ?, ?)`);
  for (const r of seed.repositories) {
    (await insertRepo.run(r.id, r.name, r.projectName, JSON.stringify(r)));
  }

  const insertTask = db.prepare(`
    INSERT OR REPLACE INTO tasks (id, task_code, status, priority, project_name, is_archived, is_demo, updated_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const t of seed.tasks) {
    (await insertTask.run(
      t.id,
      t.taskCode,
      t.status,
      t.priority,
      t.projectName,
      t.isArchived ? 1 : 0,
      t.isDemo ? 1 : 0,
      t.updatedAt,
      JSON.stringify(t)
    ));
  }

  const insertTime = db.prepare(`
    INSERT OR REPLACE INTO time_entries (id, task_id, started_at, duration_minutes, data_json)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const te of seed.timeEntries) {
    (await insertTime.run(te.id, te.taskId, te.startedAt, te.durationMinutes, JSON.stringify(te)));
  }

  const insertAct = db.prepare(`
    INSERT OR REPLACE INTO activity_log (id, task_id, timestamp, data_json)
    VALUES (?, ?, ?, ?)
  `);
  for (const act of seed.activity) {
    (await insertAct.run(act.id, act.taskId, act.timestamp, JSON.stringify(act)));
  }

  const insertNote = db.prepare(`
    INSERT OR REPLACE INTO work_notes (id, created_at, data_json)
    VALUES (?, ?, ?)
  `);
  for (const wn of seed.workNotes) {
    (await insertNote.run(wn.id, wn.createdAt, JSON.stringify(wn)));
  }

  const insertSetting = db.prepare(`INSERT OR REPLACE INTO workspace_settings (key, value_json) VALUES (?, ?)`);
  (await insertSetting.run('main', JSON.stringify(seed.settings)));
  (await insertSetting.run('initialized', JSON.stringify({ seededAt: new Date().toISOString() })));
}

async function ensureDefaultRepositories() {
  const existingRows = (await db.prepare(`SELECT data_json FROM repositories`).all()) as Array<{ data_json: string }>;
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
      (await insertOrReplaceRepo.run(defRepo.id, defRepo.name, defRepo.projectName, JSON.stringify(defRepo)));
    } else if (found.localFolderPath && found.localFolderPath.startsWith('/Users/mihir/workspace/ray/')) {
      const cleaned: RepositoryConfig = {
        ...found,
        localFolderPath: found.name,
      };
      (await insertOrReplaceRepo.run(cleaned.id, cleaned.name, cleaned.projectName, JSON.stringify(cleaned)));
    }
  }
}

export let databaseInitializationFailed = false;
if (db.configured) {
  try {
    await db.exec(schema);
    await initializeSeedIfNeeded();
    await ensureDefaultRepositories();
  } catch {
    databaseInitializationFailed = true;
    console.error('Workspace database initialization failed. Check server-side database configuration and connectivity.');
  }
}

export async function getDatabaseHealth() {
  if (!db.configured) return { connected: false, persistent: false, provider: db.provider, message: 'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel to enable cloud storage.' };
  if (databaseInitializationFailed) return { connected: false, persistent: false, provider: db.provider, message: 'Database initialization failed. Check the server connection settings.' };
  try {
    await db.prepare('SELECT 1 AS connected').get();
    return { connected: true, persistent: true, provider: db.provider, message: db.provider === 'turso' ? 'Cloud database connected' : 'Local SQLite database connected' };
  } catch {
    return { connected: false, persistent: false, provider: db.provider, message: 'Database connection failed. Check the server connection settings.' };
  }
}

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

async function normalizeStoredTask(raw: TaskRecord): Promise<TaskRecord> {
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
    (await db.prepare(`UPDATE tasks SET status = ?, data_json = ? WHERE id = ?`).run(
      task.status,
      JSON.stringify(task),
      task.id
    ));
  }

  return task;
}

export async function getAllTasks(): Promise<TaskRecord[]> {
  const rows = (await db.prepare(`SELECT data_json FROM tasks ORDER BY updated_at DESC`).all()) as Array<{ data_json: string }>;
  return Promise.all(rows.map(async (r) => (await normalizeStoredTask(JSON.parse(r.data_json) as TaskRecord))));
}

export async function getTaskById(id: string): Promise<TaskRecord | null> {
  const row = (await db.prepare(`SELECT data_json FROM tasks WHERE id = ?`).get(id)) as { data_json: string } | undefined;
  return row ? (await normalizeStoredTask(JSON.parse(row.data_json) as TaskRecord)) : null;
}

export async function getNextTaskCode(): Promise<string> {
  // Reserve each number atomically even when multiple serverless instances write together.
  const row = await db.prepare(`
    INSERT INTO task_code_sequence (id, last_number)
    SELECT 1, COALESCE(MAX(CAST(SUBSTR(task_code, 7) AS INTEGER)), 0) + 1
    FROM tasks WHERE UPPER(task_code) GLOB 'MIHIR-[0-9]*'
    ON CONFLICT(id) DO UPDATE SET last_number = MAX(task_code_sequence.last_number + 1, excluded.last_number)
    RETURNING last_number
  `).get() as { last_number: number };
  return `MIHIR-${String(row.last_number).padStart(3, '0')}`;
}

export async function upsertTask(task: TaskRecord): Promise<TaskRecord> {
  const now = new Date().toISOString();
  const updated: TaskRecord = {
    ...task,
    updatedAt: now,
  };
  (await db.prepare(`
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
  ));
  return updated;
}

export async function reorderTasksInColumn(
  orderedTaskIds: string[],
  statusUpdates?: Record<string, TaskRecord['status']>
): Promise<TaskRecord[]> {
  const now = new Date().toISOString();
  const updatedTasks: TaskRecord[] = [];
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tasks (id, task_code, status, priority, project_name, is_archived, is_demo, updated_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const [index, taskId] of orderedTaskIds.entries()) {
    const existing = (await getTaskById(taskId));
    if (!existing) continue;

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

    (await stmt.run(
      updated.id,
      updated.taskCode,
      updated.status,
      updated.priority,
      updated.projectName,
      updated.isArchived ? 1 : 0,
      updated.isDemo ? 1 : 0,
      updated.updatedAt,
      JSON.stringify(updated)
    ));
    updatedTasks.push(updated);
  }

  return updatedTasks;
}

export async function deleteTaskById(id: string): Promise<void> {
  (await db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id));
  (await db.prepare(`DELETE FROM time_entries WHERE task_id = ?`).run(id));
}

export async function getAllProjects(): Promise<ProjectConfig[]> {
  const rows = (await db.prepare(`SELECT data_json FROM projects ORDER BY name ASC`).all()) as Array<{ data_json: string }>;
  return rows.map((r) => JSON.parse(r.data_json) as ProjectConfig);
}

export async function upsertProject(project: ProjectConfig): Promise<ProjectConfig> {
  (await db.prepare(`INSERT OR REPLACE INTO projects (id, name, data_json) VALUES (?, ?, ?)`).run(
    project.id,
    project.name,
    JSON.stringify(project)
  ));
  return project;
}

export async function deleteProjectById(id: string): Promise<void> {
  (await db.prepare(`DELETE FROM projects WHERE id = ?`).run(id));
}

export async function getAllRepositories(): Promise<RepositoryConfig[]> {
  const rows = (await db.prepare(`SELECT data_json FROM repositories ORDER BY name ASC`).all()) as Array<{ data_json: string }>;
  return rows.map((r) => JSON.parse(r.data_json) as RepositoryConfig);
}

export async function upsertRepository(repo: RepositoryConfig): Promise<RepositoryConfig> {
  (await db.prepare(`INSERT OR REPLACE INTO repositories (id, name, project_name, data_json) VALUES (?, ?, ?, ?)`).run(
    repo.id,
    repo.name,
    repo.projectName,
    JSON.stringify(repo)
  ));
  return repo;
}

export async function deleteRepositoryById(id: string): Promise<void> {
  (await db.prepare(`DELETE FROM repositories WHERE id = ?`).run(id));
}

export async function getAllTimeEntries(): Promise<TimeEntry[]> {
  const rows = (await db.prepare(`SELECT data_json FROM time_entries ORDER BY started_at DESC`).all()) as Array<{ data_json: string }>;
  return rows.map((r) => JSON.parse(r.data_json) as TimeEntry);
}

export async function upsertTimeEntry(entry: TimeEntry): Promise<TimeEntry> {
  (await db.prepare(`
    INSERT OR REPLACE INTO time_entries (id, task_id, started_at, duration_minutes, data_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(entry.id, entry.taskId, entry.startedAt, entry.durationMinutes, JSON.stringify(entry)));
  return entry;
}

export async function deleteTimeEntryById(id: string): Promise<void> {
  (await db.prepare(`DELETE FROM time_entries WHERE id = ?`).run(id));
}

export async function getAllActivity(): Promise<ActivityItem[]> {
  const rows = (await db.prepare(`SELECT data_json FROM activity_log ORDER BY timestamp DESC LIMIT 250`).all()) as Array<{ data_json: string }>;
  return rows.map((r) => JSON.parse(r.data_json) as ActivityItem);
}

export async function logActivity(item: Omit<ActivityItem, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): Promise<ActivityItem> {
  const full: ActivityItem = {
    id: item.id || `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: item.timestamp || new Date().toISOString(),
    taskId: item.taskId,
    taskCode: item.taskCode,
    actionType: item.actionType,
    summary: item.summary,
    details: item.details,
  };
  (await db.prepare(`INSERT OR REPLACE INTO activity_log (id, task_id, timestamp, data_json) VALUES (?, ?, ?, ?)`).run(
    full.id,
    full.taskId,
    full.timestamp,
    JSON.stringify(full)
  ));
  return full;
}

export async function getAllWorkNotes(): Promise<WorkNote[]> {
  const rows = (await db.prepare(`SELECT data_json FROM work_notes ORDER BY created_at DESC`).all()) as Array<{ data_json: string }>;
  return rows.map((r) => JSON.parse(r.data_json) as WorkNote);
}

export async function upsertWorkNote(note: WorkNote): Promise<WorkNote> {
  (await db.prepare(`INSERT OR REPLACE INTO work_notes (id, created_at, data_json) VALUES (?, ?, ?)`).run(
    note.id,
    note.createdAt,
    JSON.stringify(note)
  ));
  return note;
}

export async function deleteWorkNoteById(id: string): Promise<void> {
  (await db.prepare(`DELETE FROM work_notes WHERE id = ?`).run(id));
}

export async function getSettings(): Promise<WorkspaceSettings> {
  const row = (await db.prepare(`SELECT value_json FROM workspace_settings WHERE key = 'main'`).get()) as { value_json: string } | undefined;
  if (!row) {
    const seed = createInitialSeedData();
    return seed.settings;
  }
  return JSON.parse(row.value_json) as WorkspaceSettings;
}

export async function saveSettings(settings: WorkspaceSettings): Promise<WorkspaceSettings> {
  (await db.prepare(`INSERT OR REPLACE INTO workspace_settings (key, value_json) VALUES ('main', ?)`).run(
    JSON.stringify(settings)
  ));
  return settings;
}

export async function clearAllWorkspaceData(): Promise<void> {
  await db.prepare('DELETE FROM uploaded_files').run();
  (await db.prepare(`DELETE FROM tasks`).run());
  (await db.prepare(`DELETE FROM time_entries`).run());
  (await db.prepare(`DELETE FROM activity_log`).run());
  (await db.prepare(`DELETE FROM work_notes`).run());
  (await db.prepare(`DELETE FROM chat_threads`).run());
  (await db.prepare(`DELETE FROM daily_focus`).run());

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

  (await db.prepare(`INSERT OR REPLACE INTO workspace_settings (key, value_json) VALUES ('initialized', ?)`).run(
    JSON.stringify({ seededAt: new Date().toISOString(), clean: true })
  ));

  (await logActivity({
    taskId: null,
    taskCode: null,
    actionType: 'system',
    summary: 'Workspace cleared of all data for a fresh start',
    details: 'All tasks, notes, chat threads, time entries, focus items, and uploads removed.',
  }));
}

export async function removeDemoData(): Promise<void> {
  (await clearAllWorkspaceData());
}

export async function restoreDemoData(): Promise<void> {
  ensureSampleUploadFiles(UPLOADS_DIR);
  const seed = createInitialSeedData();
  for (const p of seed.projects) (await upsertProject(p));
  for (const r of seed.repositories) (await upsertRepository(r));
  for (const t of seed.tasks) {
    if (IS_VERCEL) {
      for (const attachment of t.attachments) {
        const content = fs.readFileSync(path.join(UPLOADS_DIR, attachment.fileName)).toString('base64');
        await saveUploadedFile(attachment.fileName, attachment.mimeType, content);
        attachment.url = `/api/attachments/${attachment.fileName}`;
      }
    }
    await upsertTask(t);
  }
  for (const te of seed.timeEntries) (await upsertTimeEntry(te));
  for (const wn of seed.workNotes) (await upsertWorkNote(wn));
  for (const act of seed.activity) (await logActivity(act));

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
  for (const item of defaultFocus) (await upsertDailyFocusItem(item));
}

export async function getFullWorkspaceState(): Promise<WorkspaceStatePayload> {
  const tasks = (await getAllTasks());
  const attachmentCount = tasks.reduce((acc, t) => acc + t.attachments.length, 0);
  return {
    tasks,
    projects: (await getAllProjects()),
    repositories: (await getAllRepositories()),
    timeEntries: (await getAllTimeEntries()),
    activity: (await getAllActivity()),
    workNotes: (await getAllWorkNotes()),
    settings: (await getSettings()),
    storageInfo: {
      databasePath: db.provider === 'turso' ? 'cloud:turso' : DB_PATH,
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

export async function createCompleteBackupBundle(): Promise<BackupBundle> {
  const state = (await getFullWorkspaceState());
  const referencedFiles = new Map<string, string>();
  for (const task of state.tasks) {
    for (const att of task.attachments) {
      referencedFiles.set(att.fileName, att.mimeType);
    }
  }

  const uploadedFiles: BackupBundle['uploadedFiles'] = [];
  for (const [fileName, mimeType] of referencedFiles.entries()) {
    const fullPath = path.join(UPLOADS_DIR, path.basename(fileName));
    const stored = await getUploadedFile(fileName);
    if (stored) {
      uploadedFiles.push({ fileName: path.basename(fileName), mimeType: stored.mime_type, base64Data: stored.base64_data });
    } else if (fs.existsSync(fullPath)) {
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

export async function restoreFromBackupBundle(
  bundle: BackupBundle,
  duplicatePolicy: DuplicatePolicy
): Promise<{ importedTasks: number; skippedTasks: number; restoredFiles: number }> {
  if (!bundle || bundle.app !== 'MIHIR Workspace' || !bundle.state || !Array.isArray(bundle.state.tasks)) {
    throw new Error('Invalid MIHIR Workspace backup file format.');
  }

  let restoredFiles = 0;
  if (Array.isArray(bundle.uploadedFiles)) {
    for (const f of bundle.uploadedFiles) {
      if (f.fileName && f.base64Data) {
        const safeName = path.basename(f.fileName);
        const dest = path.join(UPLOADS_DIR, safeName);
        if (!IS_VERCEL) fs.writeFileSync(dest, Buffer.from(f.base64Data, 'base64'));
        await saveUploadedFile(safeName, f.mimeType, f.base64Data);
        restoredFiles++;
      }
    }
  }

  if (Array.isArray(bundle.state.projects)) {
    for (const p of bundle.state.projects) (await upsertProject(p));
  }
  if (Array.isArray(bundle.state.repositories)) {
    for (const r of bundle.state.repositories) (await upsertRepository(r));
  }
  if (bundle.state.settings) {
    (await saveSettings(bundle.state.settings));
  }

  const existingTasks = new Map((await getAllTasks()).map((t) => [t.id, t]));
  let importedTasks = 0;
  let skippedTasks = 0;

  for (const rawTask of bundle.state.tasks) {
    const incoming = { ...rawTask, attachments: (rawTask.attachments || []).map(attachment => ({ ...attachment, url: bundle.uploadedFiles?.some(file => file.fileName === attachment.fileName) ? `/api/attachments/${attachment.fileName}` : attachment.url })) };
    const exists = existingTasks.has(incoming.id);
    if (exists && duplicatePolicy === 'skip') {
      skippedTasks++;
      continue;
    }
    if (exists && duplicatePolicy === 'duplicate') {
      const newCode = (await getNextTaskCode());
      const cloned: TaskRecord = {
        ...incoming,
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        taskCode: newCode,
        title: `${incoming.title} (Restored Copy)`,
      };
      (await upsertTask(cloned));
      importedTasks++;
      continue;
    }
    // Overwrite or new
    (await upsertTask(incoming));
    importedTasks++;
  }

  if (Array.isArray(bundle.state.timeEntries)) {
    for (const te of bundle.state.timeEntries) {
      if (duplicatePolicy !== 'skip') {
        (await upsertTimeEntry(te));
      }
    }
  }

  if (Array.isArray(bundle.state.workNotes)) {
    for (const wn of bundle.state.workNotes) {
      if (duplicatePolicy !== 'skip') {
        (await upsertWorkNote(wn));
      }
    }
  }

  (await logActivity({
    taskId: null,
    taskCode: null,
    actionType: 'system',
    summary: `Restored backup (${importedTasks} tasks imported, ${skippedTasks} skipped, ${restoredFiles} attachments restored)`,
    details: `Duplicate policy: ${duplicatePolicy}`,
  }));

  return { importedTasks, skippedTasks, restoredFiles };
}

export interface DailyFocusItem {
  id: string;
  text: string;
  taskCode: string;
  completed: boolean;
  createdAt: string;
}

export async function getAllDailyFocusItems(): Promise<DailyFocusItem[]> {
  const rows = (await db.prepare(`SELECT data_json FROM daily_focus ORDER BY created_at ASC`).all()) as Array<{ data_json: string }>;
  return rows.map((r) => JSON.parse(r.data_json) as DailyFocusItem);
}

export async function upsertDailyFocusItem(item: DailyFocusItem): Promise<DailyFocusItem> {
  (await db.prepare(`INSERT OR REPLACE INTO daily_focus (id, created_at, data_json) VALUES (?, ?, ?)`).run(
    item.id,
    item.createdAt,
    JSON.stringify(item)
  ));
  return item;
}

export async function deleteDailyFocusItemById(id: string): Promise<void> {
  (await db.prepare(`DELETE FROM daily_focus WHERE id = ?`).run(id));
}

export async function getAllChatThreads(): Promise<any[]> {
  const rows = (await db.prepare(`SELECT data_json FROM chat_threads ORDER BY updated_at DESC`).all()) as Array<{ data_json: string }>;
  if (IS_VERCEL && rows.length === 0) return [];
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
    (await db.prepare(`INSERT OR REPLACE INTO chat_threads (id, updated_at, data_json) VALUES (?, ?, ?)`).run(
      starterThread.id,
      starterThread.updatedAt,
      JSON.stringify(starterThread)
    ));
    return [starterThread];
  }
  return rows.map((r) => JSON.parse(r.data_json));
}

export async function getChatThreadById(id: string): Promise<any | null> {
  const row = (await db.prepare(`SELECT data_json FROM chat_threads WHERE id = ?`).get(id)) as { data_json: string } | undefined;
  return row ? JSON.parse(row.data_json) : null;
}

export async function upsertChatThread(thread: any): Promise<any> {
  (await db.prepare(`INSERT OR REPLACE INTO chat_threads (id, updated_at, data_json) VALUES (?, ?, ?)`).run(
    thread.id,
    thread.updatedAt,
    JSON.stringify(thread)
  ));
  return thread;
}

export async function deleteChatThreadById(id: string): Promise<void> {
  (await db.prepare(`DELETE FROM chat_threads WHERE id = ?`).run(id));
}


export async function saveUploadedFile(fileName: string, mimeType: string, base64: string) {
  await db.prepare('INSERT OR REPLACE INTO uploaded_files (file_name, mime_type, base64_data) VALUES (?, ?, ?)').run(fileName, mimeType, base64);
}
export async function getUploadedFile(fileName: string) {
  return await db.prepare('SELECT mime_type, base64_data FROM uploaded_files WHERE file_name = ?').get(fileName) as { mime_type: string; base64_data: string } | undefined;
}
