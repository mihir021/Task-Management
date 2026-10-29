import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  LayoutGrid,
  Table as TableIcon,
  Plus,
  Copy,
  Archive,
  ArchiveRestore,
  GitBranch,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  ListChecks,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  GripVertical,
} from 'lucide-react';
import {
  ProjectConfig,
  RepositoryConfig,
  TaskPriority,
  TaskRecord,
  TaskStatus,
} from '../types/workspace';
import {
  BOARD_WORKFLOW_COLUMNS,
  BoardWorkflowColumnId,
  computeReorderedColumnTaskIds,
  filterAndSortTasks,
  formatUnambiguousDate,
  groupTasksByBoardColumn,
  mapStatusToBoardColumn,
  resolveStatusFromBoardColumnDrop,
  sortTasksByBoardOrder,
  summarizeRepositoryProgress,
  summarizeTaskChecklistProgress,
} from '../lib/workspaceLogic';

const ALL_STATUSES: TaskStatus[] = [
  'Todo',
  'In Progress',
  'Push to Local Branch',
  'Push to Development Branch',
  'Push to Cloud',
  'Monitor Logs & Process',
  'Done',
];

function getStatusBadgeStyle(status: TaskStatus | string): string {
  switch (status) {
    case 'Todo':
      return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
    case 'In Progress':
      return 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800';
    case 'Push to Local Branch':
      return 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800';
    case 'Push to Development Branch':
      return 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800';
    case 'Push to Cloud':
      return 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800';
    case 'Monitor Logs & Process':
      return 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800';
    case 'Done':
      return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800';
    default:
      return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
  }
}

function getStatusDotClass(status: string): string {
  switch (status) {
    case 'Todo':
      return 'bg-slate-400';
    case 'In Progress':
      return 'bg-blue-500';
    case 'Push to Local Branch':
      return 'bg-cyan-500';
    case 'Push to Development Branch':
      return 'bg-purple-500';
    case 'Push to Cloud':
      return 'bg-amber-500';
    case 'Monitor Logs & Process':
      return 'bg-teal-500';
    case 'Done':
      return 'bg-emerald-500';
    default:
      return 'bg-slate-400';
  }
}

interface TaskListViewProps {
  tasks: TaskRecord[];
  projects: ProjectConfig[];
  repositories: RepositoryConfig[];
  availableTags: string[];
  timezone: string;
  initialStatusFilter?: string;
  initialRepoFilter?: string;
  globalSearchQuery: string;
  onOpenTask: (taskId: string) => void;
  onOpenNewTask: () => void;
  onUpdateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onReorderTasks?: (payload: {
    orderedTaskIds: string[];
    statusUpdates?: Record<string, TaskStatus>;
    columnLabel?: string;
  }) => Promise<void>;
  onToggleSubtask?: (taskId: string, subtaskId: string) => Promise<void>;
  onToggleArchiveTask: (taskId: string, archive: boolean) => Promise<void>;
  onDuplicateTask: (taskId: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

export const TaskListView: React.FC<TaskListViewProps> = ({
  tasks,
  projects,
  repositories,
  availableTags,
  timezone,
  initialStatusFilter = 'All',
  initialRepoFilter = 'All',
  globalSearchQuery,
  onOpenTask,
  onOpenNewTask,
  onUpdateTaskStatus,
  onReorderTasks,
  onToggleSubtask,
  onToggleArchiveTask,
  onDuplicateTask,
  onDeleteTask,
}) => {
  const [viewMode, setViewModeState] = useState<'table' | 'kanban'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mihir_task_view_mode');
      if (saved === 'table' || saved === 'kanban') {
        return saved;
      }
    }
    return 'kanban';
  });

  const setViewMode = (mode: 'table' | 'kanban') => {
    setViewModeState(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mihir_task_view_mode', mode);
    }
  };

  const [boardLayoutMode, setBoardLayoutMode] = useState<'workflow4' | 'detailed7'>('workflow4');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after' | null>(null);
  const [lastBoardMoveNotice, setLastBoardMoveNotice] = useState<string | null>(null);
  const [localSearch, setLocalSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'All'>(
    (initialStatusFilter as TaskStatus | 'All') || 'All'
  );
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'All'>('All');
  const [projectFilter, setProjectFilter] = useState<string>('All');
  const [repoFilter, setRepoFilter] = useState<string>(initialRepoFilter || 'All');
  const [tagFilter, setTagFilter] = useState<string>('All');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'updatedAt' | 'assignedAt' | 'dueDate' | 'priority'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedChecklistIds, setExpandedChecklistIds] = useState<Record<string, boolean>>({});

  const toggleChecklistExpand = (taskId: string) => {
    setExpandedChecklistIds((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const combinedSearch = [globalSearchQuery, localSearch].filter(Boolean).join(' ').trim();

  const filteredTasks = useMemo(
    () =>
      filterAndSortTasks(tasks, {
        search: combinedSearch,
        status: statusFilter,
        priority: priorityFilter,
        project: projectFilter,
        repository: repoFilter,
        tag: tagFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        showArchived,
        sortBy,
        sortOrder,
      }),
    [
      tasks,
      combinedSearch,
      statusFilter,
      priorityFilter,
      projectFilter,
      repoFilter,
      tagFilter,
      dateFrom,
      dateTo,
      showArchived,
      sortBy,
      sortOrder,
    ]
  );

  const groupedBoardTasks = useMemo(
    () => groupTasksByBoardColumn(filteredTasks),
    [filteredTasks]
  );

  const archivedCount = useMemo(() => tasks.filter((t) => t.isArchived).length, [tasks]);

  const handleResetFilters = () => {
    setLocalSearch('');
    setStatusFilter('All');
    setPriorityFilter('All');
    setProjectFilter('All');
    setRepoFilter('All');
    setTagFilter('All');
    setDateFrom('');
    setDateTo('');
    setShowArchived(false);
  };

  useEffect(() => {
    const handleWindowDragOver = (e: DragEvent) => {
      if (draggedTaskId) {
        e.preventDefault();
      }
    };
    const handleWindowDrop = (e: DragEvent) => {
      if (draggedTaskId) {
        e.preventDefault();
        clearDragState();
      }
    };
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [draggedTaskId]);

  const clearDragState = () => {
    setDraggedTaskId(null);
    setDragOverColumnId(null);
    setDragOverTaskId(null);
    setDragOverPosition(null);
  };

  const handleTaskDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('application/x-mihir-task-id', taskId);
      e.dataTransfer.setData('text/plain', taskId);
    } catch {
      // ignore
    }
  };

  const handleTaskDragEnd = () => {
    clearDragState();
  };

  const handleColumnDragOver = (e: React.DragEvent<HTMLDivElement>, columnKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumnId !== columnKey) {
      setDragOverColumnId(columnKey);
    }
  };

  const handleColumnDragLeave = (e: React.DragEvent<HTMLDivElement>, columnKey: string) => {
    const relatedTarget = e.relatedTarget as Node | null;
    if (!e.currentTarget.contains(relatedTarget)) {
      if (dragOverColumnId === columnKey) {
        setDragOverColumnId(null);
      }
      setDragOverTaskId(null);
      setDragOverPosition(null);
    }
  };

  const handleCardDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    columnKey: string,
    targetTaskId: string,
    columnTaskIds: string[]
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumnId !== columnKey) {
      setDragOverColumnId(columnKey);
    }
    if (draggedTaskId === targetTaskId) {
      setDragOverTaskId(null);
      setDragOverPosition(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const sourceIdx = draggedTaskId ? columnTaskIds.indexOf(draggedTaskId) : -1;
    const targetIdx = columnTaskIds.indexOf(targetTaskId);

    let pos: 'before' | 'after';
    if (sourceIdx !== -1 && targetIdx !== -1) {
      if (sourceIdx < targetIdx && offsetY >= rect.height * 0.25) {
        pos = 'after';
      } else if (sourceIdx > targetIdx && offsetY <= rect.height * 0.75) {
        pos = 'before';
      } else {
        pos = offsetY < rect.height / 2 ? 'before' : 'after';
      }
    } else {
      pos = offsetY < rect.height / 2 ? 'before' : 'after';
    }

    if (dragOverTaskId !== targetTaskId || dragOverPosition !== pos) {
      setDragOverTaskId(targetTaskId);
      setDragOverPosition(pos);
    }
  };

  const persistColumnOrderAndStatus = async (
    orderedTaskIds: string[],
    movedTask: TaskRecord,
    nextStatus: TaskStatus,
    columnLabel: string,
    wasReorderedWithinSameColumn: boolean
  ) => {
    const statusChanged = nextStatus !== movedTask.status;
    if (onReorderTasks) {
      await onReorderTasks({
        orderedTaskIds,
        statusUpdates: statusChanged ? { [movedTask.id]: nextStatus } : undefined,
        columnLabel,
      });
    } else if (statusChanged) {
      await onUpdateTaskStatus(movedTask.id, nextStatus);
    }

    const newRank = orderedTaskIds.indexOf(movedTask.id) + 1;
    if (wasReorderedWithinSameColumn && !statusChanged) {
      setLastBoardMoveNotice(
        `Reordered ${movedTask.taskCode} to #${newRank} in ${columnLabel}`
      );
    } else {
      setLastBoardMoveNotice(
        `Moved ${movedTask.taskCode} to ${columnLabel} (${nextStatus})`
      );
    }
  };

  const handleMoveTaskToWorkflowColumn = async (
    taskId: string,
    targetColumnId: BoardWorkflowColumnId
  ) => {
    const targetTask = tasks.find((t) => t.id === taskId);
    if (!targetTask) return;
    const nextStatus = resolveStatusFromBoardColumnDrop(targetColumnId, targetTask.status);
    const colTasks = groupedBoardTasks[targetColumnId] || [];
    const columnTaskIds = colTasks.map((t) => t.id);
    const orderedTaskIds = computeReorderedColumnTaskIds(
      columnTaskIds,
      taskId,
      null,
      'after'
    );
    await persistColumnOrderAndStatus(
      orderedTaskIds,
      targetTask,
      nextStatus,
      targetColumnId,
      false
    );
  };

  const handleWorkflowColumnDrop = async (
    e: React.DragEvent<HTMLDivElement>,
    targetColumnId: BoardWorkflowColumnId,
    targetCardId?: string | null
  ) => {
    e.preventDefault();
    e.stopPropagation();
    let droppedId = draggedTaskId;
    try {
      droppedId =
        e.dataTransfer.getData('application/x-mihir-task-id') ||
        e.dataTransfer.getData('text/plain') ||
        draggedTaskId;
    } catch {
      droppedId = draggedTaskId;
    }
    const position = dragOverPosition || 'auto';
    clearDragState();
    if (!droppedId) return;

    const movedTask = tasks.find((t) => t.id === droppedId);
    if (!movedTask) return;

    const colTasks = groupedBoardTasks[targetColumnId] || [];
    const columnTaskIds = colTasks.map((t) => t.id);
    const wasInSameColumn = columnTaskIds.includes(droppedId);
    const nextStatus = resolveStatusFromBoardColumnDrop(targetColumnId, movedTask.status);

    const orderedTaskIds = computeReorderedColumnTaskIds(
      columnTaskIds,
      droppedId,
      targetCardId ?? null,
      targetCardId ? position : 'after'
    );

    const orderChanged =
      orderedTaskIds.length !== columnTaskIds.length ||
      orderedTaskIds.some((id, idx) => columnTaskIds[idx] !== id);

    if (!orderChanged && nextStatus === movedTask.status) {
      return;
    }

    await persistColumnOrderAndStatus(
      orderedTaskIds,
      movedTask,
      nextStatus,
      targetColumnId,
      wasInSameColumn
    );
  };

  const handleDetailedStatusDrop = async (
    e: React.DragEvent<HTMLDivElement>,
    targetStatus: TaskStatus,
    targetCardId?: string | null
  ) => {
    e.preventDefault();
    e.stopPropagation();
    let droppedId = draggedTaskId;
    try {
      droppedId =
        e.dataTransfer.getData('application/x-mihir-task-id') ||
        e.dataTransfer.getData('text/plain') ||
        draggedTaskId;
    } catch {
      droppedId = draggedTaskId;
    }
    const position = dragOverPosition || 'auto';
    clearDragState();
    if (!droppedId) return;

    const movedTask = tasks.find((t) => t.id === droppedId);
    if (!movedTask) return;

    const colTasks = sortTasksByBoardOrder(
      filteredTasks.filter((t) => t.status === targetStatus)
    );
    const columnTaskIds = colTasks.map((t) => t.id);
    const wasInSameColumn = columnTaskIds.includes(droppedId);

    const orderedTaskIds = computeReorderedColumnTaskIds(
      columnTaskIds,
      droppedId,
      targetCardId ?? null,
      targetCardId ? position : 'after'
    );

    const orderChanged =
      orderedTaskIds.length !== columnTaskIds.length ||
      orderedTaskIds.some((id, idx) => columnTaskIds[idx] !== id);

    if (!orderChanged && movedTask.status === targetStatus) {
      return;
    }

    await persistColumnOrderAndStatus(
      orderedTaskIds,
      movedTask,
      targetStatus,
      targetStatus,
      wasInSameColumn
    );
  };

  const handleStepReorderInColumn = async (
    columnTaskIds: string[],
    taskId: string,
    direction: 'up' | 'down',
    columnLabel: string
  ) => {
    const idx = columnTaskIds.indexOf(taskId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= columnTaskIds.length) return;

    const movedTask = tasks.find((t) => t.id === taskId);
    if (!movedTask) return;

    const nextIds = [...columnTaskIds];
    const [removed] = nextIds.splice(idx, 1);
    nextIds.splice(targetIdx, 0, removed);

    await persistColumnOrderAndStatus(
      nextIds,
      movedTask,
      movedTask.status,
      columnLabel,
      true
    );
  };

  return (
    <div className="task-list-page space-y-5">
      {/* Header & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            My Tasks
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Every task, from first idea to final delivery.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Segmented Table / Board Switcher */}
          <div
            role="group"
            aria-label="Task view mode"
            className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            <button
              type="button"
              data-testid="view-mode-table"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              Table View
            </button>
            <button
              type="button"
              data-testid="view-mode-board"
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                viewMode === 'kanban'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Board View
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenNewTask}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Comprehensive Search, Filter & Sort Toolbar */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              aria-label="Filter tasks by title, ID, branch, repository, or file path"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Filter by title, MIHIR-001, branch (RAY-MIHIR-...), repo, or file path..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'All')}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="All">All Statuses</option>
              {ALL_STATUSES.map((st) => (
                <option key={st} value={st}>
                  Status: {st}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              aria-label="Filter by priority"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | 'All')}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="All">All Priorities</option>
              <option value="Urgent">Priority: Urgent</option>
              <option value="High">Priority: High</option>
              <option value="Medium">Priority: Medium</option>
              <option value="Low">Priority: Low</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Filter by project"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200"
            >
              <option value="All">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.name}>
                  Project: {p.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by repository"
              value={repoFilter}
              onChange={(e) => setRepoFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200"
            >
              <option value="All">All Repositories</option>
              {repositories.map((r) => (
                <option key={r.id} value={r.name}>
                  Repo: {r.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by tag"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200"
            >
              <option value="All">All Tags</option>
              {availableTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>Assigned:</span>
              <input
                type="date"
                aria-label="Assigned from date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200"
              />
              <span>to</span>
              <input
                type="date"
                aria-label="Assigned to date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                aria-label="Sort tasks by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200"
              >
                <option value="updatedAt">Sort: Last Updated</option>
                <option value="assignedAt">Sort: Assignment Date</option>
                <option value="dueDate">Sort: Due Date</option>
                <option value="priority">Sort: Priority</option>
              </select>
              <button
                type="button"
                onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
              >
                {sortOrder.toUpperCase()}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                showArchived
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              {showArchived ? `Viewing Archived (${archivedCount})` : `Archived (${archivedCount})`}
            </button>

            <button
              type="button"
              onClick={handleResetFilters}
              className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Results Display */}
      {filteredTasks.length === 0 ? (
        <div className="p-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {showArchived
              ? 'No archived tasks match the current filters.'
              : 'No tasks match your search or filter criteria.'}
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
            >
              Clear Filters
            </button>
            <button
              type="button"
              onClick={onOpenNewTask}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg"
            >
              Create Task
            </button>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-3 whitespace-nowrap">Task ID</th>
                  <th className="py-3 px-3">Title & Context</th>
                  <th className="py-3 px-3 whitespace-nowrap">Task Status</th>
                  <th className="py-3 px-3 whitespace-nowrap">Priority</th>
                  <th className="py-3 px-3 whitespace-nowrap">Repos & Branches</th>
                  <th className="py-3 px-3 whitespace-nowrap">Git Progress</th>
                  <th className="py-3 px-3 whitespace-nowrap">Due / Updated</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {filteredTasks.map((task) => {
                  const repoSummaries = task.repositories.map(summarizeRepositoryProgress);
                  const checklist = summarizeTaskChecklistProgress(task);
                  const isChecklistExpanded = Boolean(expandedChecklistIds[task.id]);
                  const nextPendingSubtask = checklist.items.find((item) => !item.completed);

                  return (
                    <tr
                      key={task.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-3 font-mono font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap align-top">
                        <button
                          type="button"
                          onClick={() => onOpenTask(task.id)}
                          className="hover:underline"
                        >
                          {task.taskCode}
                        </button>
                      </td>
                      <td className="py-3.5 px-3 align-top max-w-sm">
                        <button
                          type="button"
                          onClick={() => onOpenTask(task.id)}
                          className="text-left font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors block"
                        >
                          {task.title}
                        </button>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
                          <span>{task.projectName}</span>
                          {task.tags.length > 0 && (
                            <>
                              <span>·</span>
                              <span>{task.tags.map((t) => `#${t}`).join(' ')}</span>
                            </>
                          )}
                          <span>·</span>
                          <span className="font-mono">{task.changedFiles.length} files</span>
                          <span>·</span>
                          <span className="font-mono">{task.tests.length} tests</span>
                        </div>

                        {/* Visual Progress Indicator for Sub-tasks / Checklist Items */}
                        {checklist.hasChecklist && (
                          <div
                            data-testid={`task-checklist-progress-${task.taskCode}`}
                            className="mt-2.5 p-2.5 rounded-lg bg-slate-50/90 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800/90 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => toggleChecklistExpand(task.id)}
                                aria-expanded={isChecklistExpanded}
                                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                              >
                                <ListChecks
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    checklist.isComplete
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-indigo-600 dark:text-indigo-400'
                                  }`}
                                />
                                <span>
                                  {checklist.source === 'subtasks' ? 'Sub-tasks' : 'Checklist'}
                                </span>
                                {isChecklistExpanded ? (
                                  <ChevronUp className="w-3 h-3 text-slate-400" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-slate-400" />
                                )}
                              </button>

                              <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                                <span className="text-slate-600 dark:text-slate-300 font-semibold">
                                  {checklist.completedCount}/{checklist.totalCount}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${
                                    checklist.isComplete
                                      ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                                      : 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300'
                                  }`}
                                >
                                  {checklist.percent}%
                                </span>
                              </div>
                            </div>

                            {/* Smooth + Segmented Visual Progress Bar */}
                            <div
                              role="progressbar"
                              aria-label={`${task.taskCode} sub-task checklist progress`}
                              aria-valuenow={checklist.percent}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden"
                            >
                              <div
                                className={`h-full transition-all duration-300 rounded-full ${
                                  checklist.isComplete
                                    ? 'bg-emerald-500 dark:bg-emerald-400'
                                    : 'bg-indigo-600 dark:bg-indigo-400'
                                }`}
                                style={{ width: `${checklist.percent}%` }}
                              />
                            </div>

                            {/* Segmented Step Dots & Next Item Preview */}
                            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                              <span className="truncate">
                                {checklist.isComplete
                                  ? '✓ All checklist items verified'
                                  : nextPendingSubtask
                                  ? `Next: ${nextPendingSubtask.title}`
                                  : ''}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                {checklist.items.map((item) => (
                                  <span
                                    key={item.id}
                                    title={`${item.completed ? '[Done]' : '[Pending]'} ${item.title}`}
                                    className={`w-2 h-2 rounded-xs ${
                                      item.completed
                                        ? 'bg-emerald-500 dark:bg-emerald-400'
                                        : 'bg-slate-300 dark:bg-slate-700'
                                    }`}
                                  />
                                ))}
                              </div>
                            </div>

                            {/* Expandable Interactive Sub-task Checklist */}
                            {isChecklistExpanded && (
                              <div className="pt-1.5 mt-1 border-t border-slate-200/70 dark:border-slate-800 space-y-1">
                                {checklist.items.map((item) => (
                                  <label
                                    key={item.id}
                                    className="flex items-start gap-2 text-[11px] py-0.5 cursor-pointer group"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => onToggleSubtask && onToggleSubtask(task.id, item.id)}
                                      aria-label={`Toggle sub-task ${item.title}`}
                                      className={`mt-0.5 w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0 transition-colors ${
                                        item.completed
                                          ? 'bg-emerald-600 border-emerald-600 text-white'
                                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 group-hover:border-indigo-500'
                                      }`}
                                    >
                                      {item.completed && <Check className="w-2.5 h-2.5" />}
                                    </button>
                                    <span
                                      className={`leading-snug ${
                                        item.completed
                                          ? 'line-through text-slate-400 dark:text-slate-500'
                                          : 'text-slate-700 dark:text-slate-200'
                                      }`}
                                    >
                                      {item.title}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-3 align-top whitespace-nowrap">
                        <select
                          aria-label={`Change status for ${task.taskCode}`}
                          value={task.status}
                          onChange={(e) => onUpdateTaskStatus(task.id, e.target.value as TaskStatus)}
                          className="px-2 py-1 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200"
                        >
                          {ALL_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3.5 px-3 align-top whitespace-nowrap font-medium">
                        <span
                          className={
                            task.priority === 'Urgent'
                              ? 'text-red-600 dark:text-red-400 font-semibold'
                              : task.priority === 'High'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-600 dark:text-slate-400'
                          }
                        >
                          {task.priority}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 align-top">
                        <div className="space-y-1">
                          {task.repositories.map((r) => (
                            <div key={r.id} className="font-mono text-[11px] flex items-center gap-1">
                              <GitBranch className="w-3 h-3 text-indigo-500 shrink-0" />
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {r.repositoryName}
                              </span>
                              <span className="text-slate-400">/</span>
                              <span className="text-indigo-600 dark:text-indigo-400 truncate max-w-[125px]">
                                {r.workingBranch}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 align-top font-mono tabular-nums">
                        <div className="space-y-1.5">
                          {repoSummaries.map((s) => (
                            <div key={s.repositoryName} className="space-y-0.5">
                              <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                                <span>
                                  {s.completedCount}/{s.applicableCount}
                                </span>
                                <span>{s.percent}%</span>
                              </div>
                              <div className="w-24 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-indigo-600 dark:bg-indigo-400"
                                  style={{ width: `${s.percent}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 align-top font-mono text-[11px] text-slate-500 whitespace-nowrap tabular-nums">
                        <div>Due: {formatUnambiguousDate(task.dueDate, timezone, false)}</div>
                        <div className="mt-0.5">
                          Upd: {formatUnambiguousDate(task.updatedAt, timezone, false)}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onDuplicateTask(task.id)}
                            title="Duplicate task as starting point"
                            aria-label={`Duplicate ${task.taskCode}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {task.isArchived ? (
                            <button
                              type="button"
                              onClick={() => onToggleArchiveTask(task.id, false)}
                              title="Recover archived task"
                              aria-label={`Recover ${task.taskCode}`}
                              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50"
                            >
                              <ArchiveRestore className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onToggleArchiveTask(task.id, true)}
                              title="Archive task"
                              aria-label={`Archive ${task.taskCode}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {confirmDeleteId === task.id ? (
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteTask(task.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2 py-1 text-[11px] font-medium text-white bg-red-600 rounded hover:bg-red-500"
                            >
                              Confirm Delete
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(task.id)}
                              title="Delete task"
                              aria-label={`Delete ${task.taskCode}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Drag-and-Drop Board View (Todo, In Progress, Review, Done) */
        <div className="space-y-3.5" data-testid="task-board-view">
          {/* Board Header Bar: Drag Hint, Move Feedback, and 4-Column vs 7-Stage Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <GripVertical className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>
                Drag cards within a column to reorder priority or across columns to update workflow status.
              </span>
              {lastBoardMoveNotice && (
                <span
                  data-testid="board-move-notice"
                  className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-mono text-[11px]"
                >
                  {lastBoardMoveNotice}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 self-start sm:self-auto shrink-0">
              <button
                type="button"
                data-testid="board-layout-workflow4"
                onClick={() => setBoardLayoutMode('workflow4')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  boardLayoutMode === 'workflow4'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                7-Stage Workflow
              </button>
              <button
                type="button"
                data-testid="board-layout-detailed7"
                onClick={() => setBoardLayoutMode('detailed7')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  boardLayoutMode === 'detailed7'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Grid View
              </button>
            </div>
          </div>

          {boardLayoutMode === 'workflow4' ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              className="flex gap-4 pb-4 overflow-x-auto min-w-full items-start scroll-smooth"
            >
              {BOARD_WORKFLOW_COLUMNS.map((col) => {
                const colTasks = groupedBoardTasks[col.id] || [];
                const columnTaskIds = colTasks.map((t) => t.id);
                const isDropActive = dragOverColumnId === col.id;
                const completedSubtasksInCol = colTasks.reduce(
                  (acc, t) => acc + summarizeTaskChecklistProgress(t).completedCount,
                  0
                );
                const totalSubtasksInCol = colTasks.reduce(
                  (acc, t) => acc + summarizeTaskChecklistProgress(t).totalCount,
                  0
                );

                return (
                  <div
                    key={col.id}
                    data-testid={`board-column-${col.id}`}
                    onDragOver={(e) => handleColumnDragOver(e, col.id)}
                    onDragLeave={(e) => handleColumnDragLeave(e, col.id)}
                    onDrop={(e) => handleWorkflowColumnDrop(e, col.id, null)}
                    className={`w-72 min-w-[288px] shrink-0 flex flex-col rounded-xl p-3.5 min-h-[460px] transition-all border ${
                      isDropActive
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-500 ring-2 ring-indigo-500/20'
                        : 'bg-slate-100/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {/* Column Header */}
                    <div className="pb-2.5 mb-3 border-b border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${getStatusDotClass(col.id)}`}
                          />
                          <h3
                            className="text-xs font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate"
                            title={col.label}
                          >
                            {col.label}
                          </h3>
                        </div>
                        <span
                          data-testid={`board-column-count-${col.id}`}
                          className="px-2 py-0.5 text-xs font-mono font-semibold tabular-nums rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0"
                        >
                          {colTasks.length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500 dark:text-slate-400 gap-2">
                        <span className="truncate" title={col.subtitle}>{col.subtitle}</span>
                        {totalSubtasksInCol > 0 && (
                          <span className="font-mono tabular-nums text-[10px] shrink-0">
                            Checks: {completedSubtasksInCol}/{totalSubtasksInCol}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Active Drop Indicator when hovering column space */}
                    {isDropActive && !dragOverTaskId && (
                      <div
                        data-testid={`board-drop-indicator-${col.id}`}
                        className="mb-2.5 px-3 py-2 rounded-lg border border-dashed border-indigo-500 bg-indigo-500/10 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 text-center"
                      >
                        Drop card to place in {col.label} ({col.defaultDropStatus})
                      </div>
                    )}

                    {/* Column Cards */}
                    <div className="space-y-2.5 flex-1">
                      {colTasks.length === 0 ? (
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverColumnId !== col.id) {
                              setDragOverColumnId(col.id);
                            }
                          }}
                          onDrop={(e) => handleWorkflowColumnDrop(e, col.id, null)}
                          className="h-32 flex flex-col items-center justify-center text-center px-3 text-[11px] text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg pointer-events-auto cursor-pointer"
                        >
                          <span>No tasks in {col.label}</span>
                          <span className="text-[10px] mt-0.5 text-slate-400 dark:text-slate-600">
                            Drag a task card here to set status to {col.defaultDropStatus}
                          </span>
                        </div>
                      ) : (
                        colTasks.map((task, cardIndex) => {
                          const firstRepo = task.repositories[0];
                          const prog = firstRepo ? summarizeRepositoryProgress(firstRepo) : null;
                          const checklist = summarizeTaskChecklistProgress(task);
                          const isChecklistExpanded = Boolean(expandedChecklistIds[task.id]);
                          const isDragging = draggedTaskId === task.id;
                          const isDropTargetBefore =
                            dragOverTaskId === task.id && dragOverPosition === 'before';
                          const isDropTargetAfter =
                            dragOverTaskId === task.id && dragOverPosition === 'after';
                          const currentColId = mapStatusToBoardColumn(task.status);
                          const currentStageIndex = Math.max(0, ALL_STATUSES.indexOf(task.status));

                          return (
                            <div key={task.id} className="space-y-1.5">
                              {isDropTargetBefore && (
                                <div
                                  data-testid={`drop-indicator-before-${task.taskCode}`}
                                  className="px-2.5 py-1 rounded bg-indigo-500/15 border border-indigo-500 text-[10px] font-mono font-medium text-indigo-700 dark:text-indigo-300 text-center"
                                >
                                  Drop before {task.taskCode}
                                </div>
                              )}

                              <div
                                draggable
                                data-testid={`board-card-${task.taskCode}`}
                                data-board-order={cardIndex + 1}
                                onDragStart={(e) => handleTaskDragStart(e, task.id)}
                                onDragEnd={handleTaskDragEnd}
                                onDragOver={(e) =>
                                  handleCardDragOver(e, col.id, task.id, columnTaskIds)
                                }
                                onDrop={(e) => handleWorkflowColumnDrop(e, col.id, task.id)}
                                className={`p-3.5 rounded-lg bg-white dark:bg-slate-900 border transition-all space-y-2.5 cursor-grab active:cursor-grabbing overflow-hidden ${
                                  isDragging
                                    ? 'opacity-50 scale-[0.98] border-indigo-500 ring-2 ring-indigo-500/30'
                                    : isDropTargetBefore || isDropTargetAfter
                                    ? 'border-indigo-500 ring-2 ring-indigo-500/25'
                                    : 'border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500/70 shadow-2xs'
                                }`}
                              >
                                {/* Card Top Metadata Row */}
                                <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <GripVertical
                                      className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0"
                                      aria-hidden="true"
                                    />
                                    <span
                                      data-testid={`board-rank-${task.taskCode}`}
                                      className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0"
                                    >
                                      #{cardIndex + 1}
                                    </span>
                                    <span className="font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                                      {task.taskCode}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span
                                      className={`text-[10px] font-semibold whitespace-nowrap ${
                                        task.priority === 'Urgent'
                                          ? 'text-red-600 dark:text-red-400'
                                          : task.priority === 'High'
                                          ? 'text-amber-600 dark:text-amber-400'
                                          : 'text-slate-500 dark:text-slate-400'
                                      }`}
                                    >
                                      {task.priority}
                                    </span>
                                    {colTasks.length > 1 && (
                                      <div
                                        className="inline-flex items-center rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                                        role="group"
                                        aria-label={`Reorder ${task.taskCode} in ${col.label}`}
                                      >
                                        <button
                                          type="button"
                                          data-testid={`move-up-${task.taskCode}`}
                                          aria-label={`Move ${task.taskCode} up in ${col.label}`}
                                          disabled={cardIndex === 0}
                                          onClick={() =>
                                            handleStepReorderInColumn(
                                              columnTaskIds,
                                              task.id,
                                              'up',
                                              col.label
                                            )
                                          }
                                          className="p-0.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30 disabled:pointer-events-none"
                                          title="Move card up in column"
                                        >
                                          <ArrowUp className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          data-testid={`move-down-${task.taskCode}`}
                                          aria-label={`Move ${task.taskCode} down in ${col.label}`}
                                          disabled={cardIndex === colTasks.length - 1}
                                          onClick={() =>
                                            handleStepReorderInColumn(
                                              columnTaskIds,
                                              task.id,
                                              'down',
                                              col.label
                                            )
                                          }
                                          className="p-0.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30 disabled:pointer-events-none"
                                          title="Move card down in column"
                                        >
                                          <ArrowDown className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Task Title & Granular Status Sub-label */}
                                <div className="space-y-1">
                                  <button
                                    type="button"
                                    onClick={() => onOpenTask(task.id)}
                                    className="text-left text-xs font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 line-clamp-2 block w-full break-words"
                                  >
                                    {task.title}
                                  </button>
                                  <div className="flex items-center justify-between gap-2 text-[10px] min-w-0">
                                    <span
                                      className={`px-1.5 py-0.5 rounded font-medium truncate max-w-[170px] ${getStatusBadgeStyle(
                                        task.status
                                      )}`}
                                      title={task.status}
                                    >
                                      {task.status}
                                    </span>
                                    <span className="font-mono text-slate-400 dark:text-slate-500 shrink-0 truncate max-w-[80px]">
                                      {task.projectName}
                                    </span>
                                  </div>
                                </div>

                                {/* Visual Sub-task / Checklist Progress Indicator */}
                                {checklist.hasChecklist && (
                                  <div
                                    data-testid={`kanban-checklist-progress-${task.taskCode}`}
                                    className="p-2 rounded-md bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 space-y-1.5"
                                  >
                                    <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
                                      <button
                                        type="button"
                                        onClick={() => toggleChecklistExpand(task.id)}
                                        className="inline-flex items-center gap-1 font-sans font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400"
                                      >
                                        <ListChecks
                                          className={`w-3 h-3 ${
                                            checklist.isComplete
                                              ? 'text-emerald-600 dark:text-emerald-400'
                                              : 'text-indigo-600 dark:text-indigo-400'
                                          }`}
                                        />
                                        <span>
                                          {checklist.source === 'subtasks' ? 'Sub-tasks' : 'Checklist'}
                                        </span>
                                        {isChecklistExpanded ? (
                                          <ChevronUp className="w-2.5 h-2.5 text-slate-400" />
                                        ) : (
                                          <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
                                        )}
                                      </button>
                                      <span
                                        className={
                                          checklist.isComplete
                                            ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                            : 'text-slate-600 dark:text-slate-400 font-semibold'
                                        }
                                      >
                                        {checklist.completedCount}/{checklist.totalCount} ({checklist.percent}%)
                                      </span>
                                    </div>
                                    <div
                                      role="progressbar"
                                      aria-label={`${task.taskCode} kanban checklist progress`}
                                      aria-valuenow={checklist.percent}
                                      aria-valuemin={0}
                                      aria-valuemax={100}
                                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden"
                                    >
                                      <div
                                        className={`h-full transition-all duration-300 rounded-full ${
                                          checklist.isComplete
                                            ? 'bg-emerald-500 dark:bg-emerald-400'
                                            : 'bg-indigo-600 dark:bg-indigo-400'
                                        }`}
                                        style={{ width: `${checklist.percent}%` }}
                                      />
                                    </div>

                                    {isChecklistExpanded && (
                                      <div className="pt-1 space-y-1 border-t border-slate-200/70 dark:border-slate-800">
                                        {checklist.items.map((item) => (
                                          <button
                                            key={item.id}
                                            type="button"
                                            onClick={() =>
                                              onToggleSubtask && onToggleSubtask(task.id, item.id)
                                            }
                                            className="w-full flex items-start gap-1.5 text-left text-[10px] py-0.5 text-slate-700 dark:text-slate-300 hover:text-indigo-600"
                                          >
                                            <span
                                              className={`mt-0.5 w-3 h-3 rounded flex items-center justify-center border shrink-0 ${
                                                item.completed
                                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                                  : 'border-slate-300 dark:border-slate-700'
                                              }`}
                                            >
                                              {item.completed && <Check className="w-2 h-2" />}
                                            </span>
                                            <span
                                              className={
                                                item.completed
                                                  ? 'line-through text-slate-400 dark:text-slate-500'
                                                  : ''
                                              }
                                            >
                                              {item.title}
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Repository & Git Summary */}
                                {firstRepo && prog && (
                                  <div className="text-[11px] font-mono text-slate-500 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                                    <div className="truncate text-slate-700 dark:text-slate-300">
                                      {firstRepo.repositoryName} ·{' '}
                                      <span className="text-indigo-600 dark:text-indigo-400">
                                        {firstRepo.workingBranch}
                                      </span>
                                    </div>
                                    <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums">
                                      <span>
                                        Git: {prog.completedCount}/{prog.applicableCount} ({prog.percent}%)
                                      </span>
                                      <span>Due: {formatUnambiguousDate(task.dueDate, timezone, false)}</span>
                                    </div>
                                  </div>
                                )}

                                {/* Quick Workflow Stage Controls */}
                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5 overflow-hidden">
                                  <div className="flex items-center gap-1.5 min-w-0 w-full">
                                    <button
                                      type="button"
                                      disabled={currentStageIndex <= 0}
                                      onClick={() =>
                                        currentStageIndex > 0 &&
                                        handleMoveTaskToWorkflowColumn(
                                          task.id,
                                          ALL_STATUSES[currentStageIndex - 1]
                                        )
                                      }
                                      className={`px-2 py-1 text-[10px] font-semibold rounded border transition-colors flex items-center gap-0.5 shrink-0 ${
                                        currentStageIndex <= 0
                                          ? 'opacity-40 cursor-not-allowed bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400'
                                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600'
                                      }`}
                                      title={
                                        currentStageIndex > 0
                                          ? `Move back to ${ALL_STATUSES[currentStageIndex - 1]}`
                                          : 'First stage'
                                      }
                                    >
                                      <ChevronLeft className="w-3 h-3 shrink-0" />
                                      <span>Prev</span>
                                    </button>

                                    <div className="flex-1 min-w-0">
                                      <select
                                        aria-label={`Move ${task.taskCode} to status`}
                                        value={task.status}
                                        onChange={(e) =>
                                          onUpdateTaskStatus(task.id, e.target.value as TaskStatus)
                                        }
                                        className="w-full truncate px-2 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 overflow-hidden"
                                      >
                                        {ALL_STATUSES.map((st) => (
                                          <option key={st} value={st}>
                                            {st}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <button
                                      type="button"
                                      disabled={currentStageIndex >= ALL_STATUSES.length - 1}
                                      onClick={() =>
                                        currentStageIndex < ALL_STATUSES.length - 1 &&
                                        handleMoveTaskToWorkflowColumn(
                                          task.id,
                                          ALL_STATUSES[currentStageIndex + 1]
                                        )
                                      }
                                      className={`px-2 py-1 text-[10px] font-semibold rounded border transition-colors flex items-center gap-0.5 shrink-0 ${
                                        currentStageIndex >= ALL_STATUSES.length - 1
                                          ? 'opacity-40 cursor-not-allowed bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400'
                                          : 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 hover:border-indigo-400'
                                      }`}
                                      title={
                                        currentStageIndex < ALL_STATUSES.length - 1
                                          ? `Advance to ${ALL_STATUSES[currentStageIndex + 1]}`
                                          : 'Task completed'
                                      }
                                    >
                                      <span>Next</span>
                                      <ChevronRight className="w-3 h-3 shrink-0" />
                                    </button>
                                  </div>

                                  {/* 7-Stage Quick Move Bar - Compact numbered pills that fit within the card without text overflow */}
                                  <div className="grid grid-cols-7 gap-1 pt-0.5 w-full">
                                    {BOARD_WORKFLOW_COLUMNS.map((targetCol, sIdx) => {
                                      const isCurrentCol = currentColId === targetCol.id;
                                      const isPast = sIdx < currentStageIndex;
                                      return (
                                        <button
                                          key={targetCol.id}
                                          type="button"
                                          data-testid={`quick-move-${task.taskCode}-${targetCol.id}`}
                                          disabled={isCurrentCol}
                                          onClick={() =>
                                            handleMoveTaskToWorkflowColumn(task.id, targetCol.id)
                                          }
                                          className={`py-1 text-[9px] font-mono font-bold rounded border transition-all text-center truncate ${
                                            isCurrentCol
                                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs cursor-default'
                                              : isPast
                                              ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-100'
                                              : 'bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-indigo-300 hover:text-indigo-600'
                                          }`}
                                          title={`Step ${sIdx + 1}: ${targetCol.label} (${targetCol.subtitle})`}
                                        >
                                          {sIdx + 1}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>

                              {isDropTargetAfter && (
                                <div
                                  data-testid={`drop-indicator-after-${task.taskCode}`}
                                  className="px-2.5 py-1 rounded bg-indigo-500/15 border border-indigo-500 text-[10px] font-mono font-medium text-indigo-700 dark:text-indigo-300 text-center"
                                >
                                  Drop after {task.taskCode}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* 7-Stage Granular Drag-and-Drop View */
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-2"
            >
              {ALL_STATUSES.map((colStatus) => {
                const colTasks = sortTasksByBoardOrder(
                  filteredTasks.filter((t) => t.status === colStatus)
                );
                const columnTaskIds = colTasks.map((t) => t.id);
                const isDropActive = dragOverColumnId === colStatus;
                return (
                  <div
                    key={colStatus}
                    data-testid={`detailed-column-${colStatus}`}
                    onDragOver={(e) => handleColumnDragOver(e, colStatus)}
                    onDragLeave={(e) => handleColumnDragLeave(e, colStatus)}
                    onDrop={(e) => handleDetailedStatusDrop(e, colStatus, null)}
                    className={`flex flex-col rounded-xl p-3.5 min-h-[260px] transition-all border ${
                      isDropActive
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-500 ring-2 ring-indigo-500/20'
                        : 'bg-slate-100/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${getStatusDotClass(colStatus)}`}
                        />
                        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {colStatus}
                        </h3>
                      </div>
                      <span className="text-xs font-mono tabular-nums text-slate-500">
                        {colTasks.length}
                      </span>
                    </div>

                    <div className="space-y-2.5 flex-1">
                      {colTasks.length === 0 ? (
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverColumnId !== colStatus) {
                              setDragOverColumnId(colStatus);
                            }
                          }}
                          onDrop={(e) => handleDetailedStatusDrop(e, colStatus, null)}
                          className="h-24 flex items-center justify-center text-[11px] text-slate-400 dark:text-slate-600 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg pointer-events-auto cursor-pointer"
                        >
                          No tasks in {colStatus}
                        </div>
                      ) : (
                        colTasks.map((task, cardIndex) => {
                          const firstRepo = task.repositories[0];
                          const prog = firstRepo ? summarizeRepositoryProgress(firstRepo) : null;
                          const checklist = summarizeTaskChecklistProgress(task);
                          const isChecklistExpanded = Boolean(expandedChecklistIds[task.id]);

                          return (
                            <div
                              key={task.id}
                              draggable
                              data-testid={`detailed-card-${task.taskCode}`}
                              onDragStart={(e) => handleTaskDragStart(e, task.id)}
                              onDragEnd={handleTaskDragEnd}
                              onDragOver={(e) =>
                                handleCardDragOver(e, colStatus, task.id, columnTaskIds)
                              }
                              onDrop={(e) => handleDetailedStatusDrop(e, colStatus, task.id)}
                              className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 space-y-2 cursor-grab active:cursor-grabbing overflow-hidden"
                            >
                              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 gap-2 min-w-0">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                                    #{cardIndex + 1}
                                  </span>
                                  <span className="font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                                    {task.taskCode}
                                  </span>
                                </div>
                                <span className="whitespace-nowrap shrink-0">{task.priority}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => onOpenTask(task.id)}
                                className="text-left text-xs font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 line-clamp-2 block break-words w-full"
                              >
                                {task.title}
                              </button>

                              {checklist.hasChecklist && (
                                <div className="p-2 rounded-md bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                                  <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
                                    <button
                                      type="button"
                                      onClick={() => toggleChecklistExpand(task.id)}
                                      className="inline-flex items-center gap-1 font-sans font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400"
                                    >
                                      <ListChecks className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                                      <span>
                                        {checklist.source === 'subtasks' ? 'Sub-tasks' : 'Checklist'}
                                      </span>
                                    </button>
                                    <span>
                                      {checklist.completedCount}/{checklist.totalCount} ({checklist.percent}%)
                                    </span>
                                  </div>
                                </div>
                              )}

                              {firstRepo && prog && (
                                <div className="text-[11px] font-mono text-slate-500 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                                  <div className="truncate text-slate-700 dark:text-slate-300">
                                    {firstRepo.repositoryName} ·{' '}
                                    <span className="text-indigo-600 dark:text-indigo-400">
                                      {firstRepo.workingBranch}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
