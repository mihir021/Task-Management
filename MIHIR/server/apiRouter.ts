import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  createCompleteBackupBundle,
  getDatabaseHealth,
  getUploadedFile,
  saveUploadedFile,
  databaseConfigured,
  databaseInitializationFailed,
  deleteProjectById,
  deleteRepositoryById,
  deleteTaskById,
  deleteTimeEntryById,
  deleteWorkNoteById,
  getAllRepositories,
  getFullWorkspaceState,
  getNextTaskCode,
  getSettings,
  getTaskById,
  IS_VERCEL,
  logActivity,
  clearAllWorkspaceData,
  removeDemoData,
  reorderTasksInColumn,
  restoreDemoData,
  restoreFromBackupBundle,
  saveSettings,
  UPLOADS_DIR,
  upsertProject,
  upsertRepository,
  upsertTask,
  upsertTimeEntry,
  upsertWorkNote,
  getAllChatThreads,
  getChatThreadById,
  upsertChatThread,
  deleteChatThreadById,
  getAllDailyFocusItems,
  upsertDailyFocusItem,
  deleteDailyFocusItemById,
} from './db.js';
import {
  BOT_ROLE_CONFIGS,
  EngineeringBotRole,
  GeminiModelChoice,
  runMultiTurnGeminiChat,
} from './geminiChat.js';
import { createDefaultGitStages } from '../src/lib/workspaceLogic.js';
import { DuplicatePolicy, TaskAttachment, TaskRecord, TaskRepository, TaskStatus } from '../src/types/workspace.js';

export const apiRouter = express.Router();

apiRouter.get('/health/database', async (_req, res) => {
  const health = await getDatabaseHealth();
  res.status(health.connected ? 200 : 503).json(health);
});
apiRouter.use((_req, res, next) => {
  if (!databaseConfigured || databaseInitializationFailed) {
    res.status(503).json({ error: 'Persistent database is unavailable. Check database setup in Vercel.', code: 'DATABASE_UNAVAILABLE' }); return;
  }
  next();
});

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'application/json',
]);

apiRouter.get('/workspace', async (_req, res) => {
  try {
    res.json((await getFullWorkspaceState()));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load workspace state' });
  }
});

apiRouter.post('/tasks', async (req, res) => {
  try {
    const body = req.body as Partial<TaskRecord> & {
      selectedRepoConfigs?: Array<{
        repositoryId: string;
        workingBranch?: string;
        baseBranch?: string;
        devTargetBranch?: string;
        cloudTargetName?: string;
      }>;
    };

    if (!body.title || !body.title.trim()) {
      res.status(400).json({ error: 'Task title is required.' });
      return;
    }

    const now = new Date().toISOString();
    const existingTasks = (await getFullWorkspaceState()).tasks;
    const requestedCode = body.taskCode?.trim();
    const codeCollision = requestedCode
      ? existingTasks.some((t) => t.taskCode.toUpperCase() === requestedCode.toUpperCase())
      : false;
    const taskCode = !requestedCode || codeCollision ? (await getNextTaskCode()) : requestedCode;
    const taskId = body.id || `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const allRepos = (await getAllRepositories());

    let repositories: TaskRepository[] = [];
    if (Array.isArray(body.repositories) && body.repositories.length > 0) {
      repositories = body.repositories;
    } else if (Array.isArray(body.selectedRepoConfigs) && body.selectedRepoConfigs.length > 0) {
      repositories = body.selectedRepoConfigs.map((sel, idx) => {
        const cfg = allRepos.find((r) => r.id === sel.repositoryId || r.name === sel.repositoryId) || allRepos[0];
        const repoLinkId = `${taskId}-repo-${idx + 1}`;
        const baseBranch = sel.baseBranch || cfg?.defaultBaseBranch || 'development';
        const workingBranch = sel.workingBranch || `RAY-MIHIR-${taskCode}`;
        const devTargetBranch = sel.devTargetBranch || baseBranch;
        const cloudTargetName = sel.cloudTargetName || cfg?.cloudTargetName || 'cloud-release';
        const workflowMode = cfg?.defaultWorkflowMode || 'PR-Based';

        return {
          id: repoLinkId,
          repositoryId: cfg?.id || sel.repositoryId,
          repositoryName: cfg?.name || sel.repositoryId,
          remoteUrl: cfg?.remoteUrl || '',
          localFolderPath: cfg?.localFolderPath || '',
          baseBranch,
          workingBranch,
          devTargetBranch,
          cloudTargetName,
          workflowMode,
          stages: createDefaultGitStages(
            repoLinkId,
            baseBranch,
            workingBranch,
            devTargetBranch,
            cloudTargetName,
            workflowMode
          ),
        };
      });
    }

    const status: TaskStatus = body.status || 'Todo';
    const newTask: TaskRecord = {
      id: taskId,
      taskCode,
      title: body.title.trim(),
      description: body.description || '',
      ticketUrl: body.ticketUrl || '',
      assignedBy: body.assignedBy || 'Self',
      assignedAt: body.assignedAt || now,
      priority: body.priority || 'Medium',
      status,
      dueDate: body.dueDate || null,
      tags: Array.isArray(body.tags) ? body.tags : [],
      expectedOutcome: body.expectedOutcome || '',
      acceptanceCriteria: body.acceptanceCriteria || '',
      blockerNotes: body.blockerNotes || '',
      projectName: body.projectName || 'Ray',
      isArchived: Boolean(body.isArchived),
      isDemo: false,
      createdAt: now,
      updatedAt: now,
      startedAt: status === 'In Progress' ? now : body.startedAt || null,
      completedAt: status === 'Done' ? now : null,
      subtasks: Array.isArray(body.subtasks) ? body.subtasks : [],
      repositories,
      investigation: body.investigation || {
        originalRequirement: body.description || '',
        actualBehavior: '',
        expectedBehavior: body.expectedOutcome || '',
        stepsToReproduce: '',
        investigationNotes: '',
        rootCause: '',
        approachesConsidered: '',
        finalSolution: '',
        whyChosen: '',
        limitationsFollowUp: '',
      },
      changedFiles: Array.isArray(body.changedFiles) ? body.changedFiles : [],
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      tests: Array.isArray(body.tests) ? body.tests : [],
    };

    const saved = (await upsertTask(newTask));
    (await logActivity({
      taskId: saved.id,
      taskCode: saved.taskCode,
      actionType: 'status',
      summary: `Created task ${saved.taskCode}: ${saved.title}`,
      details: `Project: ${saved.projectName} · Priority: ${saved.priority} · Status: ${saved.status}`,
    }));

    res.status(201).json({ task: saved, state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to create task' });
  }
});

apiRouter.put('/tasks/:id', async (req, res) => {
  try {
    const existing = (await getTaskById(req.params.id));
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const incoming = req.body as Partial<TaskRecord> & { _activityMessage?: string; _activityType?: any };
    const now = new Date().toISOString();

    let startedAt = existing.startedAt;
    if (incoming.status === 'In Progress' && !startedAt) {
      startedAt = now;
    }
    let completedAt = existing.completedAt;
    if (incoming.status === 'Done' && existing.status !== 'Done') {
      completedAt = now;
    } else if (incoming.status && incoming.status !== 'Done') {
      completedAt = null;
    }

    const merged: TaskRecord = {
      ...existing,
      ...incoming,
      id: existing.id,
      startedAt: incoming.startedAt !== undefined ? incoming.startedAt : startedAt,
      completedAt: incoming.completedAt !== undefined ? incoming.completedAt : completedAt,
      updatedAt: now,
    };

    const saved = (await upsertTask(merged));

    if (incoming._activityMessage) {
      (await logActivity({
        taskId: saved.id,
        taskCode: saved.taskCode,
        actionType: incoming._activityType || 'note',
        summary: incoming._activityMessage,
        details: saved.title,
      }));
    } else if (incoming.status && incoming.status !== existing.status) {
      (await logActivity({
        taskId: saved.id,
        taskCode: saved.taskCode,
        actionType: 'status',
        summary: `Changed status of ${saved.taskCode} from "${existing.status}" to "${saved.status}"`,
        details: saved.title,
      }));
    }

    res.json({ task: saved, state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to update task' });
  }
});

apiRouter.post('/tasks/reorder', async (req, res) => {
  try {
    const body = req.body as {
      orderedTaskIds?: string[];
      statusUpdates?: Record<string, TaskRecord['status']>;
      columnLabel?: string;
    };

    if (!Array.isArray(body.orderedTaskIds) || body.orderedTaskIds.length === 0) {
      res.status(400).json({ error: 'orderedTaskIds array is required' });
      return;
    }

    const updatedTasks = (await reorderTasksInColumn(body.orderedTaskIds, body.statusUpdates));

    if (updatedTasks.length > 0) {
      const codes = updatedTasks.map((t) => t.taskCode).join(' → ');
      (await logActivity({
        taskId: updatedTasks[0].id,
        taskCode: updatedTasks[0].taskCode,
        actionType: 'status',
        summary: `Reordered tasks in ${body.columnLabel || 'Board'}: ${codes}`,
        details: `Order saved: ${codes}`,
      }));
    }

    res.json({ tasks: updatedTasks, state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to reorder tasks' });
  }
});

apiRouter.post('/tasks/:id/duplicate', async (req, res) => {
  try {
    const existing = (await getTaskById(req.params.id));
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const now = new Date().toISOString();
    const newId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newCode = (await getNextTaskCode());

    const clonedRepos: TaskRepository[] = existing.repositories.map((r, idx) => {
      const repoLinkId = `${newId}-repo-${idx + 1}`;
      return {
        ...r,
        id: repoLinkId,
        stages: createDefaultGitStages(
          repoLinkId,
          r.baseBranch,
          r.workingBranch,
          r.devTargetBranch,
          r.cloudTargetName,
          r.workflowMode
        ),
      };
    });

    const duplicated: TaskRecord = {
      ...existing,
      id: newId,
      taskCode: newCode,
      title: `${existing.title} (Copy)`,
      status: 'Todo',
      isArchived: false,
      isDemo: false,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      subtasks: Array.isArray(existing.subtasks)
        ? existing.subtasks.map((st, idx) => ({
            ...st,
            id: `${newId}-st-${idx + 1}`,
            completed: false,
          }))
        : [],
      repositories: clonedRepos,
    };

    const saved = (await upsertTask(duplicated));
    (await logActivity({
      taskId: saved.id,
      taskCode: saved.taskCode,
      actionType: 'status',
      summary: `Duplicated ${existing.taskCode} as ${saved.taskCode}`,
      details: saved.title,
    }));

    res.status(201).json({ task: saved, state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to duplicate task' });
  }
});

apiRouter.delete('/tasks/:id', async (req, res) => {
  try {
    const existing = (await getTaskById(req.params.id));
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    (await deleteTaskById(existing.id));
    (await logActivity({
      taskId: null,
      taskCode: existing.taskCode,
      actionType: 'status',
      summary: `Deleted task ${existing.taskCode}: ${existing.title}`,
      details: 'Permanently removed task record',
    }));
    res.json({ state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to delete task' });
  }
});

apiRouter.get('/attachments/:fileName', async (req, res) => {
  try {
    const file = await getUploadedFile(path.basename(req.params.fileName));
    if (!file) { res.status(404).json({ error: 'Attachment not found' }); return; }
    res.set('Content-Type', file.mime_type).set('X-Content-Type-Options', 'nosniff')
      .set('Content-Security-Policy', "default-src 'none'; sandbox")
      .send(Buffer.from(file.base64_data, 'base64'));
  } catch { res.status(500).json({ error: 'Unable to load attachment' }); }
});

apiRouter.post('/tasks/:id/attachments', async (req, res) => {
  try {
    const existing = (await getTaskById(req.params.id));
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const {
      originalName,
      mimeType,
      sizeBytes,
      base64Data,
      category = 'After',
      caption = '',
      notes = '',
      linkedFileChangeId = null,
      linkedTestId = null,
    } = req.body;

    if (!originalName || !base64Data) {
      res.status(400).json({ error: 'Attachment file name and data are required.' });
      return;
    }

    const settings = (await getSettings());
    const maxBytes = (settings.maxAttachmentSizeMB || 10) * 1024 * 1024;
    if (sizeBytes && sizeBytes > maxBytes) {
      res.status(400).json({
        error: `File exceeds the configured maximum attachment size of ${settings.maxAttachmentSizeMB} MB.`,
      });
      return;
    }

    if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
      res.status(400).json({
        error: `Unsupported file format (${mimeType}). Supported: PNG, JPEG, WebP, GIF, SVG, PDF, TXT, JSON.`,
      });
      return;
    }

    const ext = path.extname(originalName) || '.png';
    const safeBase = path
      .basename(originalName, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 48);
    const storedFileName = `${Date.now()}-${safeBase}${ext}`;
    const destPath = path.join(UPLOADS_DIR, storedFileName);

    const cleanedBase64 = String(base64Data).replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanedBase64, 'base64');

    if (buffer.byteLength > maxBytes) {
      res.status(400).json({
        error: `Decoded file exceeds maximum attachment size of ${settings.maxAttachmentSizeMB} MB.`,
      });
      return;
    }

    await saveUploadedFile(storedFileName, mimeType || 'image/png', buffer.toString('base64'));
    // Local installations also retain the original upload files.
    if (!IS_VERCEL) {
      fs.writeFileSync(destPath, buffer);
    }

    const newAttachment: TaskAttachment = {
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fileName: storedFileName,
      originalName,
      mimeType: mimeType || 'image/png',
      sizeBytes: buffer.byteLength,
      url: `/api/attachments/${storedFileName}`,
      category,
      caption: caption || originalName,
      notes,
      linkedFileChangeId,
      linkedTestId,
      uploadedAt: new Date().toISOString(),
    };

    const updatedTask = (await upsertTask({
      ...existing,
      attachments: [newAttachment, ...existing.attachments],
    }));

    (await logActivity({
      taskId: updatedTask.id,
      taskCode: updatedTask.taskCode,
      actionType: 'attachment',
      summary: `Uploaded ${category} screenshot "${newAttachment.caption}" on ${updatedTask.taskCode}`,
      details: originalName,
    }));

    res.status(201).json({ attachment: newAttachment, task: updatedTask, state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to upload attachment' });
  }
});

apiRouter.put('/tasks/:id/attachments/:attId', async (req, res) => {
  try {
    const existing = (await getTaskById(req.params.id));
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const { caption, notes, category, originalName, linkedFileChangeId, linkedTestId } = req.body;
    const attachments = existing.attachments.map((att) =>
      att.id === req.params.attId
        ? {
            ...att,
            caption: caption !== undefined ? caption : att.caption,
            notes: notes !== undefined ? notes : att.notes,
            category: category !== undefined ? category : att.category,
            originalName: originalName !== undefined ? originalName : att.originalName,
            linkedFileChangeId: linkedFileChangeId !== undefined ? linkedFileChangeId : att.linkedFileChangeId,
            linkedTestId: linkedTestId !== undefined ? linkedTestId : att.linkedTestId,
          }
        : att
    );
    const updatedTask = (await upsertTask({ ...existing, attachments }));
    res.json({ task: updatedTask, state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to update attachment' });
  }
});

apiRouter.delete('/tasks/:id/attachments/:attId', async (req, res) => {
  try {
    const existing = (await getTaskById(req.params.id));
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const target = existing.attachments.find((a) => a.id === req.params.attId);
    const attachments = existing.attachments.filter((a) => a.id !== req.params.attId);
    const updatedTask = (await upsertTask({ ...existing, attachments }));

    if (target) {
      (await logActivity({
        taskId: updatedTask.id,
        taskCode: updatedTask.taskCode,
        actionType: 'attachment',
        summary: `Removed attachment "${target.caption}" from ${updatedTask.taskCode}`,
        details: target.originalName,
      }));
    }

    res.json({ task: updatedTask, state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to delete attachment' });
  }
});

apiRouter.post('/projects', async (req, res) => {
  try {
    const { id, name, description, leadName } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Project name is required.' });
      return;
    }
    (await upsertProject({
      id: id || `proj-${Date.now()}`,
      name: name.trim(),
      description: description || '',
      leadName: leadName || 'Mihir Rathod',
      createdAt: new Date().toISOString(),
    }));
    res.json({ state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to save project' });
  }
});

apiRouter.delete('/projects/:id', async (req, res) => {
  try {
    (await deleteProjectById(req.params.id));
    res.json({ state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to delete project' });
  }
});

apiRouter.post('/repositories', async (req, res) => {
  try {
    const body = req.body;
    if (!body.name || !body.name.trim()) {
      res.status(400).json({ error: 'Repository or folder name is required.' });
      return;
    }
    const cleanName = body.name.trim();
    const baseBranch = body.defaultBaseBranch?.trim() || 'development';
    const savedRepo = (await upsertRepository({
      id: body.id || `repo-${cleanName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-${Date.now().toString(36).slice(-4)}`,
      projectId: body.projectId || 'proj-ray',
      projectName: body.projectName || 'Ray',
      name: cleanName,
      description: body.description || 'Custom workspace repository / folder',
      remoteUrl: body.remoteUrl || '',
      localFolderPath: body.localFolderPath?.trim() || cleanName,
      defaultBaseBranch: baseBranch,
      defaultDevBranch: body.defaultDevBranch?.trim() || baseBranch,
      cloudTargetName: body.cloudTargetName || 'cloud-release',
      cloudTargetType: body.cloudTargetType || 'Branch',
      defaultWorkflowMode: body.defaultWorkflowMode || 'PR-Based',
    }));
    res.json({ repository: savedRepo, state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to save repository' });
  }
});

apiRouter.delete('/repositories/:id', async (req, res) => {
  try {
    (await deleteRepositoryById(req.params.id));
    res.json({ state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to delete repository' });
  }
});

apiRouter.post('/timer/start', async (req, res) => {
  try {
    const { taskId, notes = '' } = req.body;
    const task = (await getTaskById(taskId));
    if (!task) {
      res.status(404).json({ error: 'Task not found for timer' });
      return;
    }

    const settings = (await getSettings());
    const now = new Date().toISOString();

    // If another timer was running, stop and record it first to prevent duplicate timers
    if (settings.activeTimer && settings.activeTimer.taskId !== task.id) {
      const prevStart = new Date(settings.activeTimer.startedAt).getTime();
      const elapsedMins = Math.max(1, Math.round((Date.now() - prevStart) / 60000));
      (await upsertTimeEntry({
        id: `te-${Date.now()}-prev`,
        taskId: settings.activeTimer.taskId,
        taskCode: settings.activeTimer.taskCode,
        taskTitle: settings.activeTimer.taskTitle,
        startedAt: settings.activeTimer.startedAt,
        endedAt: now,
        durationMinutes: elapsedMins,
        notes: settings.activeTimer.notes || 'Auto-saved when switching task timer',
        isManual: false,
      }));
    }

    settings.activeTimer = {
      taskId: task.id,
      taskCode: task.taskCode,
      taskTitle: task.title,
      startedAt: now,
      notes,
    };
    (await saveSettings(settings));

    if (!task.startedAt) {
      (await upsertTask({ ...task, startedAt: now, status: task.status === 'Todo' ? 'In Progress' : task.status }));
    }

    (await logActivity({
      taskId: task.id,
      taskCode: task.taskCode,
      actionType: 'timer',
      summary: `Started work timer on ${task.taskCode}`,
      details: notes || task.title,
    }));

    res.json({ state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to start timer' });
  }
});

apiRouter.post('/timer/stop', async (req, res) => {
  try {
    const settings = (await getSettings());
    if (!settings.activeTimer) {
      res.status(400).json({ error: 'No active timer is currently running.' });
      return;
    }

    const { notes } = req.body || {};
    const now = new Date().toISOString();
    const startMs = new Date(settings.activeTimer.startedAt).getTime();
    const durationMinutes = Math.max(1, Math.round((Date.now() - startMs) / 60000));

    const entry = (await upsertTimeEntry({
      id: `te-${Date.now()}`,
      taskId: settings.activeTimer.taskId,
      taskCode: settings.activeTimer.taskCode,
      taskTitle: settings.activeTimer.taskTitle,
      startedAt: settings.activeTimer.startedAt,
      endedAt: now,
      durationMinutes,
      notes: notes !== undefined ? notes : settings.activeTimer.notes || 'Recorded timer session',
      isManual: false,
    }));

    (await logActivity({
      taskId: entry.taskId,
      taskCode: entry.taskCode,
      actionType: 'timer',
      summary: `Logged ${durationMinutes}m via timer on ${entry.taskCode}`,
      details: entry.notes,
    }));

    settings.activeTimer = null;
    (await saveSettings(settings));

    res.json({ entry, state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to stop timer' });
  }
});

apiRouter.post('/time-entries', async (req, res) => {
  try {
    const { id, taskId, startedAt, endedAt, durationMinutes, notes, isManual = true } = req.body;
    const task = (await getTaskById(taskId));
    const mins = Number(durationMinutes);
    if (!taskId || Number.isNaN(mins) || mins <= 0) {
      res.status(400).json({ error: 'Valid task and positive duration (minutes) are required.' });
      return;
    }

    const entry = (await upsertTimeEntry({
      id: id || `te-${Date.now()}`,
      taskId,
      taskCode: task?.taskCode || 'TASK',
      taskTitle: task?.title || 'Task',
      startedAt: startedAt || new Date().toISOString(),
      endedAt: endedAt || new Date().toISOString(),
      durationMinutes: Math.round(mins),
      notes: notes || '',
      isManual: Boolean(isManual),
    }));

    (await logActivity({
      taskId: entry.taskId,
      taskCode: entry.taskCode,
      actionType: 'timer',
      summary: `Logged ${entry.durationMinutes}m work session on ${entry.taskCode}`,
      details: entry.notes || 'Manual time entry',
    }));

    res.json({ entry, state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to save time entry' });
  }
});

apiRouter.put('/time-entries/:id', async (req, res) => {
  try {
    const { taskId, taskCode, taskTitle, startedAt, endedAt, durationMinutes, notes, isManual } = req.body;
    (await upsertTimeEntry({
      id: req.params.id,
      taskId,
      taskCode,
      taskTitle,
      startedAt,
      endedAt,
      durationMinutes: Number(durationMinutes) || 15,
      notes: notes || '',
      isManual: Boolean(isManual),
    }));
    res.json({ state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to update time entry' });
  }
});

apiRouter.delete('/time-entries/:id', async (req, res) => {
  try {
    (await deleteTimeEntryById(req.params.id));
    res.json({ state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to delete time entry' });
  }
});

apiRouter.post('/work-notes', async (req, res) => {
  try {
    const { id, taskId = null, title, content, tags = [] } = req.body;
    if (!title || !title.trim()) {
      res.status(400).json({ error: 'Note title is required.' });
      return;
    }
    const task = taskId ? (await getTaskById(taskId)) : null;
    const note = (await upsertWorkNote({
      id: id || `wn-${Date.now()}`,
      taskId,
      taskCode: task?.taskCode || null,
      title: title.trim(),
      content: content || '',
      tags: Array.isArray(tags) ? tags : [],
      createdAt: new Date().toISOString(),
    }));
    (await logActivity({
      taskId: note.taskId,
      taskCode: note.taskCode,
      actionType: 'note',
      summary: `Added engineering work note: "${note.title}"`,
      details: note.content.slice(0, 120),
    }));
    res.json({ note, state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to save work note' });
  }
});

apiRouter.delete('/work-notes/:id', async (req, res) => {
  try {
    (await deleteWorkNoteById(req.params.id));
    res.json({ state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to delete work note' });
  }
});

apiRouter.put('/settings', async (req, res) => {
  try {
    const current = (await getSettings());
    const updated = (await saveSettings({
      ...current,
      ...req.body,
    }));
    res.json({ settings: updated, state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to update settings' });
  }
});

apiRouter.post('/workspace/clear-all', async (_req, res) => {
  try {
    (await clearAllWorkspaceData());
    res.json({ state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to clear workspace data' });
  }
});

apiRouter.post('/demo/clear', async (_req, res) => {
  try {
    (await clearAllWorkspaceData());
    res.json({ state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to remove demo data' });
  }
});

apiRouter.post('/demo/restore', async (_req, res) => {
  try {
    (await restoreDemoData());
    res.json({ state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to restore demo data' });
  }
});

apiRouter.get('/backup/export', async (_req, res) => {
  try {
    const bundle = (await createCompleteBackupBundle());
    res.json(bundle);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to export backup' });
  }
});

apiRouter.post('/backup/restore', async (req, res) => {
  try {
    const { bundle, duplicatePolicy = 'overwrite' } = req.body as {
      bundle: any;
      duplicatePolicy?: DuplicatePolicy;
    };
    const result = (await restoreFromBackupBundle(bundle, duplicatePolicy));
    res.json({ result, state: (await getFullWorkspaceState()) });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to restore backup' });
  }
});

// Daily Focus Checklist Endpoints
apiRouter.get('/focus', async (_req, res) => {
  try {
    res.json({ items: (await getAllDailyFocusItems()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load daily focus items' });
  }
});

apiRouter.post('/focus', async (req, res) => {
  try {
    const { id, text, taskCode = 'RAY', completed = false } = req.body;
    if (!text || !String(text).trim()) {
      res.status(400).json({ error: 'Focus item text is required.' });
      return;
    }
    const existing = (await getAllDailyFocusItems()).find((i) => i.id === id);
    const saved = (await upsertDailyFocusItem({
      id: id || `focus-${Date.now()}`,
      text: String(text).trim(),
      taskCode: String(taskCode || 'RAY').trim(),
      completed: Boolean(completed),
      createdAt: existing?.createdAt || new Date().toISOString(),
    }));
    res.json({ item: saved, items: (await getAllDailyFocusItems()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to save daily focus item' });
  }
});

apiRouter.delete('/focus/:id', async (req, res) => {
  try {
    (await deleteDailyFocusItemById(req.params.id));
    res.json({ items: (await getAllDailyFocusItems()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to delete daily focus item' });
  }
});

// Multi-Turn Gemini Engineering Assistant Endpoints
apiRouter.get('/chat/threads', async (_req, res) => {
  try {
    res.json({
      threads: (await getAllChatThreads()),
      roles: Object.values(BOT_ROLE_CONFIGS),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load chat threads' });
  }
});

apiRouter.post('/chat/threads', async (req, res) => {
  try {
    const {
      title,
      roleId = 'investigator',
      modelId = 'gemini-3.8-flash',
      linkedTaskId = '',
    } = req.body as {
      title?: string;
      roleId?: EngineeringBotRole;
      modelId?: GeminiModelChoice;
      linkedTaskId?: string;
    };
    const roleConfig = BOT_ROLE_CONFIGS[roleId] || BOT_ROLE_CONFIGS.investigator;
    const linkedTask = linkedTaskId ? (await getTaskById(linkedTaskId)) : null;
    const now = new Date().toISOString();

    const newThread = (await upsertChatThread({
      id: `thread-${Date.now()}`,
      title:
        title?.trim() ||
        (linkedTask
          ? `${linkedTask.taskCode}: ${roleConfig.name}`
          : `${roleConfig.name} Session`),
      roleId: roleConfig.id,
      modelId: modelId || roleConfig.recommendedModel,
      linkedTaskId: linkedTaskId || '',
      createdAt: now,
      updatedAt: now,
      messages: [],
    }));

    res.json({ thread: newThread, threads: (await getAllChatThreads()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to create chat thread' });
  }
});

apiRouter.post('/chat/threads/:id/messages', async (req, res) => {
  try {
    const thread = (await getChatThreadById(req.params.id));
    if (!thread) {
      res.status(404).json({ error: 'Chat thread not found.' });
      return;
    }

    const {
      message,
      modelId = thread.modelId || 'gemini-3.8-flash',
      roleId = thread.roleId || 'investigator',
      linkedTaskId = thread.linkedTaskId || '',
    } = req.body as {
      message: string;
      modelId?: GeminiModelChoice;
      roleId?: EngineeringBotRole;
      linkedTaskId?: string;
    };

    if (!message || !String(message).trim()) {
      res.status(400).json({ error: 'Message text is required.' });
      return;
    }

    const state = (await getFullWorkspaceState());
    const linkedTask = linkedTaskId
      ? state.tasks.find((t) => t.id === linkedTaskId || t.taskCode === linkedTaskId)
      : undefined;

    const userMsg = {
      id: `msg-${Date.now()}-u`,
      sender: 'user' as const,
      text: String(message).trim(),
      modelUsed: modelId,
      createdAt: new Date().toISOString(),
    };

    const result = await runMultiTurnGeminiChat({
      modelId,
      roleId,
      history: Array.isArray(thread.messages) ? thread.messages : [],
      userMessage: userMsg.text,
      linkedTask,
      allTasks: state.tasks,
      timeEntries: state.timeEntries,
      notes: state.workNotes,
    });

    const modelMsg = {
      id: `msg-${Date.now()}-m`,
      sender: 'model' as const,
      text: result.replyText,
      modelUsed: result.modelUsed,
      createdAt: new Date().toISOString(),
    };

    const updatedMessages = [...(Array.isArray(thread.messages) ? thread.messages : []), userMsg, modelMsg];
    const updatedThread = (await upsertChatThread({
      ...thread,
      modelId,
      roleId,
      linkedTaskId,
      updatedAt: new Date().toISOString(),
      messages: updatedMessages,
    }));

    res.json({
      thread: updatedThread,
      threads: (await getAllChatThreads()),
      userMsg,
      modelMsg,
      fallbackNotice: result.fallbackNotice,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to process Gemini chat turn' });
  }
});

apiRouter.delete('/chat/threads/:id', async (req, res) => {
  try {
    (await deleteChatThreadById(req.params.id));
    res.json({ threads: (await getAllChatThreads()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to delete chat thread' });
  }
});

