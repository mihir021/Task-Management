import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  FolderGit2,
  Clock,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Plus,
  Sun,
  Moon,
  Square,
  Menu,
  X,
  Sparkles,
  CloudCheck,
  CloudUpload,
  LogIn,
  LogOut,
  Command,
  Activity,
  Terminal,
  Network,
} from 'lucide-react';
import {
  DuplicatePolicy,
  ProjectConfig,
  RepositoryConfig,
  TaskAttachment,
  TaskRecord,
  TaskStatus,
  TimeEntry,
  WorkNote,
  WorkspaceSettings,
  WorkspaceStatePayload,
} from './types/workspace';
import { getNextTaskCodeFromList } from './lib/taskCodeHelper';
import { summarizeTaskChecklistProgress } from './lib/workspaceLogic';
import { DatabaseStatus } from './components/DatabaseStatus';
import { DashboardView } from './components/DashboardView';
import { TaskListView } from './components/TaskListView';
import { TaskDetailTab, TaskDetailView } from './components/TaskDetailView';
import { ProjectsReposView } from './components/ProjectsReposView';
import { WorkLogView } from './components/WorkLogView';
import { MonitorView } from './components/MonitorView';
import { ScriptsView } from './components/ScriptsView';
import { SpiderMark } from './components/SpiderMark';
import { PortsMonitoringView } from './components/PortsMonitoringView';
import { SettingsView } from './components/SettingsView';
import { NewTaskModal } from './components/NewTaskModal';
import { QuickLogTimeModal, QuickWorkNoteModal } from './components/QuickModals';
import { AiCopilotView } from './components/AiCopilotView';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import {
  auth,
  deleteCloudTaskFromFirestore,
  onAuthStateChanged,
  signInWithGooglePopup,
  signOutFirebaseUser,
  subscribeToCloudTasks,
  syncFullWorkspaceToFirestore,
  syncTaskToFirestore,
  syncTimeEntryToFirestore,
  syncWorkNoteToFirestore,
  User,
} from './lib/firebaseClient';

type MainSection = 'dashboard' | 'tasks' | 'projects' | 'worklog' | 'monitor' | 'ports' | 'scripts' | 'copilot' | 'settings';

export const MihirWorkspaceApp: React.FC = () => {
  const [spiderTheme, setSpiderTheme] = useState(() => localStorage.getItem('mihir_appearance') !== 'classic');
  const [workspace, setWorkspace] = useState<WorkspaceStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string>('');

  const [activeSection, setActiveSectionState] = useState<MainSection>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mihir_active_section');
      if (
        saved &&
        ['dashboard', 'tasks', 'projects', 'worklog', 'monitor', 'ports', 'scripts', 'copilot', 'settings'].includes(saved)
      ) {
        return saved as MainSection;
      }
    }
    return 'dashboard';
  });

  const setActiveSection = (sec: MainSection) => {
    setActiveSectionState(sec);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mihir_active_section', sec);
    }
  };

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskTab, setSelectedTaskTab] = useState<TaskDetailTab>('overview');

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [globalSearch, setGlobalSearch] = useState<string>('');

  // Preset filters when jumping from Dashboard or Projects
  const [taskStatusPreset, setTaskStatusPreset] = useState<string>('All');
  const [taskRepoPreset, setTaskRepoPreset] = useState<string>('All');

  // Modals
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [quickTimeOpen, setQuickTimeOpen] = useState(false);
  const [quickTimeTaskId, setQuickTimeTaskId] = useState<string | undefined>(undefined);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Firebase Auth & Cloud Firestore Sync State
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [cloudSyncedTaskCount, setCloudSyncedTaskCount] = useState<number>(0);
  const [syncingCloud, setSyncingCloud] = useState<boolean>(false);

  // Live timer tick for display
  const [timerElapsedSeconds, setTimerElapsedSeconds] = useState<number>(0);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? '' : prev));
    }, 3000);
  }, []);

  const fetchWorkspace = useCallback(async () => {
    try {
      setErrorBanner('');
      const res = await fetch('/api/workspace');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = (await res.json()) as WorkspaceStatePayload;
      setWorkspace(data);
    } catch (err: any) {
      setErrorBanner(
        err?.message || 'Unable to reach local workspace backend. Please verify server status.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [activeSection, selectedTaskId]);

  // Global Cmd+K / Ctrl+K shortcut for Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen to Firebase Auth state and attach Firestore onSnapshot when authenticated
  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (unsubFirestore) {
        unsubFirestore();
        unsubFirestore = null;
      }
      if (user && user.emailVerified) {
        unsubFirestore = subscribeToCloudTasks(user.uid, (cloudTasks) => {
          setCloudSyncedTaskCount(cloudTasks.length);
        });
      } else {
        setCloudSyncedTaskCount(0);
      }
    });
    return () => {
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
    };
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setErrorBanner('');
      const user = await signInWithGooglePopup();
      showToast(`Signed in as ${user.email || user.displayName}`);
      if (workspace) {
        setSyncingCloud(true);
        const res = await syncFullWorkspaceToFirestore(
          workspace.tasks,
          workspace.workNotes,
          workspace.timeEntries
        );
        setSyncingCloud(false);
        showToast(`Synced ${res.syncedTasks} tasks & ${res.syncedNotes} notes to Cloud Firestore`);
      }
    } catch (err: any) {
      setSyncingCloud(false);
      if (err?.code !== 'auth/popup-closed-by-user') {
        setErrorBanner(err?.message || 'Google Sign-In failed.');
      }
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutFirebaseUser();
    showToast('Signed out of Cloud Firestore sync');
  };

  const handleSyncToCloudNow = async () => {
    if (!firebaseUser || !workspace) return;
    try {
      setSyncingCloud(true);
      const res = await syncFullWorkspaceToFirestore(
        workspace.tasks,
        workspace.workNotes,
        workspace.timeEntries
      );
      showToast(`Cloud Firestore synced (${res.syncedTasks} tasks, ${res.syncedNotes} notes)`);
    } catch (err: any) {
      setErrorBanner(err?.message || 'Cloud Firestore sync failed.');
    } finally {
      setSyncingCloud(false);
    }
  };

  const handleCopyDailyStandup = () => {
    if (!workspace) return;
    const activeTasks = workspace.tasks.filter((t) => !t.isArchived);
    const blockedTasks = activeTasks.filter(
      (t) =>
        Boolean(t.blockerNotes) ||
        t.tests.some((test) => test.status === 'Blocked') ||
        t.repositories.some((r) => r.stages.some((s) => s.status === 'Blocked'))
    );
    const lines = [
      `# MIHIR Workspace — Daily Ray Engineering Standup (${new Date().toISOString().slice(0, 10)})`,
      '',
      '## Active Tasks & Branches',
      ...activeTasks.map((t) => {
        const repos = t.repositories.map((r) => `${r.repositoryName}:${r.workingBranch}`).join(', ');
        return `- **${t.taskCode}** [${t.status}] ${t.title} (\`${repos}\` — ${t.changedFiles.length} files, ${t.tests.length} tests)`;
      }),
      '',
      '## Blockers',
      ...(blockedTasks.length > 0
        ? blockedTasks.map((b) => `- **${b.taskCode}**: ${b.blockerNotes || 'Blocked test / dependency'}`)
        : ['- None']),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    showToast('Copied Daily Ray Standup to clipboard');
  };

  // Apply theme preference to <html> and localStorage
  const currentTheme = useMemo(() => {
    const savedLocal = localStorage.getItem('mihir_theme') as 'light' | 'dark' | null;
    return workspace?.settings.theme || savedLocal || 'dark';
  }, [workspace?.settings.theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (currentTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('mihir_theme', currentTheme);
  }, [currentTheme]);

  // Live active timer counter
  useEffect(() => {
    const timer = workspace?.settings.activeTimer;
    if (!timer) {
      setTimerElapsedSeconds(0);
      return;
    }
    const updateElapsed = () => {
      const startMs = new Date(timer.startedAt).getTime();
      const diffSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setTimerElapsedSeconds(diffSec);
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [workspace?.settings.activeTimer]);

  const apiRequest = async <T,>(
    url: string,
    options?: RequestInit,
    successToast?: string
  ): Promise<T> => {
    setErrorBanner('');
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const json = await res.json();
    if (!res.ok) {
      const msg = json?.error || `Request failed (${res.status})`;
      setErrorBanner(msg);
      throw new Error(msg);
    }
    if (json?.state) {
      setWorkspace(json.state);
    }
    if (successToast) {
      showToast(successToast);
    }
    return json as T;
  };

  const handleToggleTheme = async () => {
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('mihir_theme', nextTheme);
    const root = document.documentElement;
    if (nextTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    setWorkspace((prev) =>
      prev ? { ...prev, settings: { ...prev.settings, theme: nextTheme } } : prev
    );
    await apiRequest(
      '/api/settings',
      {
        method: 'PUT',
        body: JSON.stringify({ theme: nextTheme }),
      },
      `Switched to ${nextTheme} theme`
    );
  };

  const handleCreateTask = async (payload: any): Promise<TaskRecord | null> => {
    const res = await apiRequest<{ task: TaskRecord }>(
      '/api/tasks',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      undefined
    );
    if (res.task) showToast(`Created ${res.task.taskCode}`);
    if (res.task && firebaseUser) {
      syncTaskToFirestore(res.task).catch(() => {});
    }
    return res.task;
  };

  const handleUpdateTask = async (
    taskId: string,
    updates: Partial<TaskRecord>,
    activityMessage?: string,
    activityType?: string
  ) => {
    const res = await apiRequest<{ task?: TaskRecord }>(
      `/api/tasks/${taskId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          ...updates,
          _activityMessage: activityMessage,
          _activityType: activityType,
        }),
      },
      'Saved task changes'
    );
    if (res.task && firebaseUser) {
      syncTaskToFirestore(res.task).catch(() => {});
    }
  };

  const handleReorderTasks = async (payload: {
    orderedTaskIds: string[];
    statusUpdates?: Record<string, TaskStatus>;
    columnLabel?: string;
  }) => {
    if (payload.statusUpdates && Object.keys(payload.statusUpdates).length > 0) {
      setWorkspace((prev) => {
        if (!prev) return prev;
        const updatedTasks = prev.tasks.map((t) => {
          const newStatus = payload.statusUpdates?.[t.id];
          return newStatus ? { ...t, status: newStatus } : t;
        });
        return { ...prev, tasks: updatedTasks };
      });
    }

    const res = await apiRequest<{ tasks?: TaskRecord[] }>(
      '/api/tasks/reorder',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      `Saved ${payload.columnLabel || 'board'} task order`
    );
    if (res.tasks && firebaseUser) {
      for (const t of res.tasks) {
        syncTaskToFirestore(t).catch(() => {});
      }
    }
  };

  const handleDuplicateTask = async (taskId: string) => {
    const res = await apiRequest<{ task: TaskRecord }>(
      `/api/tasks/${taskId}/duplicate`,
      { method: 'POST' },
      'Duplicated task'
    );
    if (res.task) {
      if (firebaseUser) {
        syncTaskToFirestore(res.task).catch(() => {});
      }
      setSelectedTaskId(res.task.id);
      setSelectedTaskTab('overview');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    await apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE' }, 'Deleted task');
    if (firebaseUser) {
      deleteCloudTaskFromFirestore(taskId).catch(() => {});
    }
    if (selectedTaskId === taskId) {
      setSelectedTaskId(null);
    }
  };

  const handleUploadAttachment = async (taskId: string, payload: any) => {
    await apiRequest(
      `/api/tasks/${taskId}/attachments`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'Uploaded attachment to MIHIR/uploads/'
    );
  };

  const handleUpdateAttachment = async (
    taskId: string,
    attId: string,
    payload: Partial<TaskAttachment>
  ) => {
    await apiRequest(
      `/api/tasks/${taskId}/attachments/${attId}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      'Updated attachment metadata'
    );
  };

  const handleDeleteAttachment = async (taskId: string, attId: string) => {
    await apiRequest(
      `/api/tasks/${taskId}/attachments/${attId}`,
      { method: 'DELETE' },
      'Removed attachment'
    );
  };

  const handleStartTimer = async (taskId: string) => {
    await apiRequest(
      '/api/timer/start',
      {
        method: 'POST',
        body: JSON.stringify({ taskId }),
      },
      'Started live task timer'
    );
  };

  const handleStopTimer = async () => {
    await apiRequest(
      '/api/timer/stop',
      { method: 'POST', body: JSON.stringify({}) },
      'Stopped timer and logged work session'
    );
  };

  const handleAddTimeEntry = async (payload: {
    taskId: string;
    durationMinutes: number;
    notes: string;
  }) => {
    const res = await apiRequest<{ entry?: TimeEntry }>(
      '/api/time-entries',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      `Logged ${payload.durationMinutes}m work session`
    );
    if (res.entry && firebaseUser && workspace) {
      const code = workspace.tasks.find((t) => t.id === payload.taskId)?.taskCode || 'MIHIR-001';
      syncTimeEntryToFirestore(res.entry, code).catch(() => {});
    }
  };

  const handleUpdateTimeEntry = async (entry: TimeEntry) => {
    await apiRequest(
      `/api/time-entries/${entry.id}`,
      {
        method: 'PUT',
        body: JSON.stringify(entry),
      },
      'Updated work session'
    );
  };

  const handleDeleteTimeEntry = async (id: string) => {
    await apiRequest(`/api/time-entries/${id}`, { method: 'DELETE' }, 'Deleted time entry');
  };

  const handleSaveWorkNote = async (payload: {
    taskId: string | null;
    title: string;
    content: string;
    tags?: string[];
  }) => {
    const res = await apiRequest<{ note?: WorkNote }>(
      '/api/work-notes',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'Saved engineering note'
    );
    if (res.note && firebaseUser && workspace) {
      const code = payload.taskId
        ? workspace.tasks.find((t) => t.id === payload.taskId)?.taskCode || 'GENERAL'
        : 'GENERAL';
      syncWorkNoteToFirestore(res.note, code).catch(() => {});
    }
  };

  const handleDeleteWorkNote = async (id: string) => {
    await apiRequest(`/api/work-notes/${id}`, { method: 'DELETE' }, 'Deleted work note');
  };

  const handleSaveProject = async (payload: Partial<ProjectConfig>) => {
    await apiRequest(
      '/api/projects',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'Saved project'
    );
  };

  const handleDeleteProject = async (id: string) => {
    await apiRequest(`/api/projects/${id}`, { method: 'DELETE' }, 'Deleted project');
  };

  const handleSaveRepository = async (
    payload: Partial<RepositoryConfig>
  ): Promise<RepositoryConfig | null> => {
    const res = await apiRequest<{ repository?: RepositoryConfig }>(
      '/api/repositories',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'Saved repository configuration'
    );
    return res.repository || null;
  };

  const handleDeleteRepository = async (id: string) => {
    await apiRequest(`/api/repositories/${id}`, { method: 'DELETE' }, 'Deleted repository');
  };

  const handleUpdateSettings = async (updates: Partial<WorkspaceSettings>) => {
    await apiRequest(
      '/api/settings',
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      },
      'Updated workspace settings'
    );
  };

  const handleClearDemoData = async () => {
    await apiRequest('/api/demo/clear', { method: 'POST' }, 'Removed demo tasks');
    setSelectedTaskId(null);
  };

  const handleRestoreDemoData = async () => {
    await apiRequest('/api/demo/restore', { method: 'POST' }, 'Restored sample Ray dataset');
  };

  const handleExportBackup = async () => {
    const res = await fetch('/api/backup/export');
    if (!res.ok) {
      setErrorBanner('Failed to generate backup bundle.');
      return;
    }
    const bundle = await res.json();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mihir-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded complete backup bundle');
  };

  const handleRestoreBackup = async (bundle: any, duplicatePolicy: DuplicatePolicy) => {
    const res = await apiRequest<{
      result: { importedTasks: number; skippedTasks: number; restoredFiles: number };
    }>(
      '/api/backup/restore',
      {
        method: 'POST',
        body: JSON.stringify({ bundle, duplicatePolicy }),
      },
      'Restored workspace backup'
    );
    return res.result;
  };

  if (loading && !workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
        <div className="space-y-3 text-center">
          <div className="text-sm font-mono">Loading MIHIR Workspace...</div>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-red-300 dark:border-red-900 max-w-md space-y-3 text-center">
          <h1 className="text-base font-semibold text-red-600">Workspace Storage Error</h1>
          <p className="text-xs text-slate-600 dark:text-slate-400">{errorBanner}</p>
          <DatabaseStatus />
          <button
            type="button"
            onClick={fetchWorkspace}
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const activeTask = selectedTaskId
    ? workspace.tasks.find((t) => t.id === selectedTaskId) || null
    : null;

  const suggestedTaskCode = getNextTaskCodeFromList(workspace.tasks);
  const activeTimer = workspace.settings.activeTimer;
  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const NAV_ITEMS: Array<{ id: MainSection; label: string; icon: React.ComponentType<any>; badge?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'tasks',
      label: 'My Tasks',
      icon: CheckSquare,
      badge: workspace.tasks.filter((t) => !t.isArchived && t.status !== 'Done').length,
    },
    {
      id: 'projects',
      label: 'Projects & Repos',
      icon: FolderGit2,
      badge: workspace.repositories.length,
    },
    { id: 'worklog', label: 'Work Log', icon: Clock },
    { id: 'monitor', label: 'Monitor', icon: Activity, badge: workspace.tasks.filter(task => !task.isArchived && task.status === 'Monitor Logs & Process').length },
    { id: 'ports', label: 'Ports Monitoring', icon: Network },
    { id: 'scripts', label: 'Scripts', icon: Terminal },
    { id: 'copilot', label: 'AI Copilot', icon: Sparkles },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div data-appearance={spiderTheme ? 'spider' : 'classic'} className="workspace-shell min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Collapsible Desktop Left Sidebar */}
      <aside
        aria-label="Primary Workspace Navigation"
        className={`hidden md:flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-transform shrink-0 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => {
                setSelectedTaskId(null);
                setActiveSection('dashboard');
              }}
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap truncate"
            >
              <span className="brand-lockup"><SpiderMark className="brand-spider" /><span>MIHIR Workspace<small>ENGINEERING JOURNAL</small></span></span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        {!sidebarCollapsed && <div className="sidebar-project"><span className="project-icon">R</span><div><small>PROJECT</small><strong>Ray workspace</strong></div><span className="connection-dot online" /></div>}
        <button type="button" className="appearance-switch" aria-label={spiderTheme ? 'Switch to classic appearance' : 'Switch to Spider-Man appearance'} onClick={() => { const next = !spiderTheme; setSpiderTheme(next); localStorage.setItem('mihir_appearance', next ? 'spider' : 'classic'); }}>{sidebarCollapsed ? '◈' : spiderTheme ? '◈ Spider-Man edition' : '◈ Classic edition'}</button>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isCurrent = !selectedTaskId && activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedTaskId(null);
                  setActiveSection(item.id);
                }}
                title={sidebarCollapsed ? item.label : undefined}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  isCurrent
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </span>
                {!sidebarCollapsed && item.badge !== undefined && (
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      isCurrent ? 'text-indigo-100' : 'text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {!sidebarCollapsed && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2 text-[11px] text-slate-500">
            {/* Firebase Cloud Auth & Firestore Sync Card */}
            {firebaseUser ? (
              <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 space-y-1.5">
                <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300 font-semibold">
                  <span className="flex items-center gap-1 truncate">
                    <CloudCheck className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{firebaseUser.email || 'Google Auth'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleGoogleSignOut}
                    title="Sign out"
                    aria-label="Sign out of Google"
                    className="p-0.5 hover:text-red-500"
                  >
                    <LogOut className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                  <span>Firestore: {cloudSyncedTaskCount} summaries</span>
                  <button
                    type="button"
                    disabled={syncingCloud}
                    onClick={handleSyncToCloudNow}
                    className="underline hover:no-underline font-semibold"
                  >
                    {syncingCloud ? 'Syncing...' : 'Sync Now'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/70 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 font-medium text-xs transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Google sign-in (summary sync)</span>
              </button>
            )}

            <div className="flex items-center justify-between font-mono pt-1">
              <span>Project: Ray</span>
              <span>{workspace.tasks.length} tasks</span>
            </div>
            <button
              type="button"
              onClick={handleToggleTheme}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
            >
              <span>Theme: {currentTheme === 'dark' ? 'Dark' : 'Light'}</span>
              {currentTheme === 'dark' ? (
                <Sun className="w-3.5 h-3.5" />
              ) : (
                <Moon className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-10">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <span className="text-sm font-bold">MIHIR Workspace</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-1.5 rounded-lg text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {!sidebarCollapsed && <div className="sidebar-project"><span className="project-icon">R</span><div><small>PROJECT</small><strong>Ray workspace</strong></div><span className="connection-dot online" /></div>}
        <button type="button" className="appearance-switch" aria-label={spiderTheme ? 'Switch to classic appearance' : 'Switch to Spider-Man appearance'} onClick={() => { const next = !spiderTheme; setSpiderTheme(next); localStorage.setItem('mihir_appearance', next ? 'spider' : 'classic'); }}>{sidebarCollapsed ? '◈' : spiderTheme ? '◈ Spider-Man edition' : '◈ Classic edition'}</button>
        <nav className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isCurrent = !selectedTaskId && activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedTaskId(null);
                      setActiveSection(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium ${
                      isCurrent
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Following Clean 3-Zone Contract */}
        <header className="workspace-topbar h-14 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4 sticky top-0 z-30">
          {/* Zone 1: Mobile Menu + Context Breadcrumb */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="md:hidden p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
              {activeTask
                ? `Tasks / ${activeTask.taskCode}`
                : activeSection === 'dashboard'
                ? 'Ray / Dashboard'
                : activeSection === 'tasks'
                ? 'Ray / My Tasks'
                : activeSection === 'projects'
                ? 'Ray / Projects & Repositories'
                : activeSection === 'worklog'
                ? 'Ray / Work Log'
                : activeSection === 'monitor'
                ? 'Ray / Monitor'
                : activeSection === 'ports'
                  ? 'Ray / Ports Monitoring'
                : activeSection === 'scripts'
                ? 'Ray / Scripts'
                : activeSection === 'copilot'
                ? 'Ray / AI Copilot'
                : 'Ray / Settings'}
            </span>
          </div>

          {/* Zone 2: Global Search Bar + Command Palette Trigger */}
          <div className="flex-1 max-w-md">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Global workspace search"
                value={globalSearch}
                onChange={(e) => {
                  const val = e.target.value;
                  setGlobalSearch(val);
                  if (val.trim() && (activeSection !== 'tasks' || selectedTaskId)) {
                    setSelectedTaskId(null);
                    setActiveSection('tasks');
                  }
                }}
                placeholder="Search tasks, MIHIR-001, branches, or files..."
                className="w-full pl-8 pr-16 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                aria-label="Open Command Palette"
                className="absolute right-2 px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-950 flex items-center gap-0.5"
              >
                <Command className="w-2.5 h-2.5" />K
              </button>
            </div>
          </div>

          {/* Zone 3: Active Timer Indicator, Cloud Auth, & Primary New Task CTA */}
          <div className="flex items-center gap-2 shrink-0">
            {activeTimer && (
              <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTaskId(activeTimer.taskId);
                    setSelectedTaskTab('time');
                  }}
                  className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {activeTimer.taskCode}
                </button>
                <span className="tabular-nums text-slate-700 dark:text-slate-300">
                  {formatElapsed(timerElapsedSeconds)}
                </span>
                <button
                  type="button"
                  onClick={handleStopTimer}
                  aria-label="Stop active task timer"
                  className="p-0.5 rounded text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50"
                >
                  <Square className="w-3 h-3" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setSelectedTaskId(null);
                setActiveSection('copilot');
              }}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/70 hover:bg-indigo-100 rounded-lg transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              AI Copilot
            </button>

            <button
              type="button"
              onClick={() => setNewTaskOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              New task
            </button>
          </div>
        </header>

        {/* Feedback / Error Banners */}
        {errorBanner && (
          <div
            role="alert"
            className="mx-6 mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 flex items-center justify-between text-xs text-red-700 dark:text-red-300"
          >
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner('')}
              className="font-semibold ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {toastMessage && (
          <div
            role="status"
            className="fixed bottom-4 right-4 z-40 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white text-xs font-medium shadow-lg"
          >
            {toastMessage}
          </div>
        )}

        {/* Main Viewport Content */}
        <main key={selectedTaskId || activeSection} className="workspace-main flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTask ? (
            <TaskDetailView
              task={activeTask}
              initialTab={selectedTaskTab}
              projects={workspace.projects}
              repositories={workspace.repositories}
              availableTags={workspace.settings.tags}
              timeEntries={workspace.timeEntries}
              activity={workspace.activity}
              activeTimer={workspace.settings.activeTimer}
              timezone={workspace.settings.timezone}
              cloudTargetLabel={workspace.settings.cloudTargetLabel}
              maxAttachmentSizeMB={workspace.settings.maxAttachmentSizeMB}
              completionChecks={workspace.settings.requiredCompletionChecks}
              onBack={() => setSelectedTaskId(null)}
              onUpdateTask={handleUpdateTask}
              onDuplicateTask={handleDuplicateTask}
              onDeleteTask={handleDeleteTask}
              onUploadAttachment={handleUploadAttachment}
              onUpdateAttachment={handleUpdateAttachment}
              onDeleteAttachment={handleDeleteAttachment}
              onStartTimer={handleStartTimer}
              onStopTimer={handleStopTimer}
              onAddTimeEntry={handleAddTimeEntry}
              onUpdateTimeEntry={handleUpdateTimeEntry}
              onDeleteTimeEntry={handleDeleteTimeEntry}
              onSaveRepository={handleSaveRepository}
            />
          ) : activeSection === 'dashboard' ? (
            <DashboardView
              tasks={workspace.tasks}
              projects={workspace.projects}
              repositories={workspace.repositories}
              timeEntries={workspace.timeEntries}
              activity={workspace.activity}
              activeTimer={workspace.settings.activeTimer}
              timezone={workspace.settings.timezone}
              onOpenTask={(taskId, tab) => {
                setSelectedTaskId(taskId);
                setSelectedTaskTab((tab as TaskDetailTab) || 'overview');
              }}
              onOpenNewTask={() => setNewTaskOpen(true)}
              onOpenQuickNote={() => setQuickNoteOpen(true)}
              onOpenQuickTime={(taskId) => {
                setQuickTimeTaskId(taskId);
                setQuickTimeOpen(true);
              }}
              onStartTimer={handleStartTimer}
              onStopTimer={handleStopTimer}
              onClearDemoData={handleClearDemoData}
              onRestoreDemoData={handleRestoreDemoData}
              onNavigateToTasksWithFilter={({ status, repository }) => {
                setTaskStatusPreset(status || 'All');
                setTaskRepoPreset(repository || 'All');
                setActiveSection('tasks');
              }}
              onOpenAiCopilot={() => {
                setSelectedTaskId(null);
                setActiveSection('copilot');
              }}
              onCopyStandup={handleCopyDailyStandup}
            />
          ) : activeSection === 'tasks' ? (
            <TaskListView
              tasks={workspace.tasks}
              projects={workspace.projects}
              repositories={workspace.repositories}
              availableTags={workspace.settings.tags}
              timezone={workspace.settings.timezone}
              initialStatusFilter={taskStatusPreset}
              initialRepoFilter={taskRepoPreset}
              globalSearchQuery={globalSearch}
              onOpenTask={(taskId) => {
                setSelectedTaskId(taskId);
                setSelectedTaskTab('overview');
              }}
              onOpenNewTask={() => setNewTaskOpen(true)}
              onUpdateTaskStatus={(taskId, status: TaskStatus) =>
                handleUpdateTask(taskId, { status })
              }
              onReorderTasks={handleReorderTasks}
              onToggleSubtask={async (taskId, subtaskId) => {
                const targetTask = workspace.tasks.find((t) => t.id === taskId);
                if (!targetTask) return;
                const currentChecklist = summarizeTaskChecklistProgress(targetTask);
                const updatedSubtasks = currentChecklist.items.map((item) =>
                  item.id === subtaskId ? { ...item, completed: !item.completed } : item
                );
                const toggledItem = updatedSubtasks.find((item) => item.id === subtaskId);
                await handleUpdateTask(
                  taskId,
                  { subtasks: updatedSubtasks },
                  toggledItem
                    ? `${toggledItem.completed ? 'Completed' : 'Reopened'} sub-task "${toggledItem.title}" on ${targetTask.taskCode}`
                    : undefined,
                  'status'
                );
              }}
              onToggleArchiveTask={(taskId, archive) =>
                handleUpdateTask(
                  taskId,
                  { isArchived: archive },
                  archive ? 'Archived task' : 'Recovered archived task',
                  'status'
                )
              }
              onDuplicateTask={handleDuplicateTask}
              onDeleteTask={handleDeleteTask}
            />
          ) : activeSection === 'projects' ? (
            <ProjectsReposView
              projects={workspace.projects}
              repositories={workspace.repositories}
              tasks={workspace.tasks}
              cloudTargetLabel={workspace.settings.cloudTargetLabel}
              onSaveProject={handleSaveProject}
              onDeleteProject={handleDeleteProject}
              onSaveRepository={handleSaveRepository}
              onDeleteRepository={handleDeleteRepository}
              onOpenTasksForRepo={(repoName) => {
                setTaskRepoPreset(repoName);
                setTaskStatusPreset('All');
                setActiveSection('tasks');
              }}
            />
          ) : activeSection === 'worklog' ? (
            <WorkLogView
              tasks={workspace.tasks}
              timeEntries={workspace.timeEntries}
              workNotes={workspace.workNotes}
              timezone={workspace.settings.timezone}
              onOpenTask={(taskId) => {
                setSelectedTaskId(taskId);
                setSelectedTaskTab('overview');
              }}
              onAddTimeEntry={handleAddTimeEntry}
              onUpdateTimeEntry={handleUpdateTimeEntry}
              onDeleteTimeEntry={handleDeleteTimeEntry}
              onSaveWorkNote={handleSaveWorkNote}
              onDeleteWorkNote={handleDeleteWorkNote}
            />
          ) : activeSection === 'ports' ? (
            <PortsMonitoringView />
          ) : activeSection === 'scripts' ? (
            <ScriptsView />
          ) : activeSection === 'monitor' ? (
            <MonitorView tasks={workspace.tasks} repositories={workspace.repositories}
              timezone={workspace.settings.timezone} onRefreshWorkspace={fetchWorkspace}
              onOpenTask={taskId => { setSelectedTaskId(taskId); setSelectedTaskTab('overview'); }} />
          ) : activeSection === 'copilot' ? (
            <AiCopilotView
              tasks={workspace.tasks}
              initialTaskId={selectedTaskId}
              firebaseUserEmail={firebaseUser?.email}
              onSaveAsWorkNote={handleSaveWorkNote}
              onOpenTask={(taskId) => {
                setSelectedTaskId(taskId);
                setSelectedTaskTab('overview');
              }}
            />
          ) : (
            <SettingsView
              settings={workspace.settings}
              storageInfo={workspace.storageInfo}
              hasDemoTasks={workspace.tasks.some((t) => t.isDemo)}
              onUpdateSettings={handleUpdateSettings}
              onExportBackup={handleExportBackup}
              onRestoreBackup={handleRestoreBackup}
              onClearDemoData={handleClearDemoData}
              onRestoreDemoData={handleRestoreDemoData}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <NewTaskModal
        isOpen={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        projects={workspace.projects}
        repositories={workspace.repositories}
        availableTags={workspace.settings.tags}
        suggestedTaskCode={suggestedTaskCode}
        onCreateTask={handleCreateTask}
        onSaveRepository={handleSaveRepository}
      />

      <QuickLogTimeModal
        isOpen={quickTimeOpen}
        onClose={() => setQuickTimeOpen(false)}
        tasks={workspace.tasks}
        defaultTaskId={quickTimeTaskId}
        onLogTime={handleAddTimeEntry}
      />

      <QuickWorkNoteModal
        isOpen={quickNoteOpen}
        onClose={() => setQuickNoteOpen(false)}
        tasks={workspace.tasks}
        onSaveNote={handleSaveWorkNote}
      />

      <CommandPaletteModal
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        tasks={workspace.tasks}
        currentTheme={currentTheme}
        onOpenTask={(taskId, tab) => {
          setSelectedTaskId(taskId);
          setSelectedTaskTab(tab || 'overview');
        }}
        onNavigateSection={(sec) => {
          setSelectedTaskId(null);
          setActiveSection(sec);
        }}
        onOpenNewTask={() => setNewTaskOpen(true)}
        onOpenQuickTime={() => setQuickTimeOpen(true)}
        onOpenQuickNote={() => setQuickNoteOpen(true)}
        onToggleTheme={handleToggleTheme}
        onCopyDailyStandup={handleCopyDailyStandup}
        onSyncCloudNow={firebaseUser ? handleSyncToCloudNow : undefined}
      />
    </div>
  );
};

