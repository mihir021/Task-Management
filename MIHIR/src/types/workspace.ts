export type TaskStatus =
  | 'Todo'
  | 'In Progress'
  | 'Push to Local Branch'
  | 'Push to Development Branch'
  | 'Push to Cloud'
  | 'Monitor Logs & Process'
  | 'Done';

export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export type ChangeType = 'Added' | 'Modified' | 'Deleted' | 'Renamed';

export type AttachmentCategory = 'Before' | 'After' | 'Reference' | 'Testing';

export type TestType = 'Manual' | 'Unit' | 'Integration' | 'Build' | 'Lint' | 'Other';

export type TestStatus = 'Not Run' | 'Passed' | 'Failed' | 'Blocked' | 'Skipped';

export type GitStageStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Completed'
  | 'Blocked'
  | 'Not Applicable';

export type GitStageCategory = 'local' | 'commit' | 'push' | 'merge' | 'deploy';

export type WorkflowMode = 'PR-Based' | 'Direct Merge';

export interface GitWorkflowStage {
  id: string;
  stageKey: string;
  stepNumber: number;
  label: string;
  category: GitStageCategory;
  status: GitStageStatus;
  completedAt: string | null;
  notes: string;
  sourceBranch: string;
  targetBranch: string;
  referenceValue: string; // commit hash, PR URL, or deployment URL
  referenceType: 'commit' | 'pr' | 'deployment' | 'branch' | 'none';
  recordingMode: 'Manual' | 'Integration';
  notApplicableReason: string;
}

export interface TaskRepository {
  id: string;
  repositoryId: string;
  repositoryName: string;
  remoteUrl: string;
  localFolderPath: string;
  baseBranch: string;
  workingBranch: string;
  devTargetBranch: string;
  cloudTargetName: string;
  workflowMode: WorkflowMode;
  stages: GitWorkflowStage[];
}

export interface TaskInvestigation {
  originalRequirement: string;
  actualBehavior: string;
  expectedBehavior: string;
  stepsToReproduce: string;
  investigationNotes: string;
  rootCause: string;
  approachesConsidered: string;
  finalSolution: string;
  whyChosen: string;
  limitationsFollowUp: string;
}

export interface TaskFileChange {
  id: string;
  repositoryName: string;
  filePath: string;
  changeType: ChangeType;
  whatChanged: string;
  whyChanged: string;
  solutionContribution: string;
  codeSnippet: string;
  relatedCommit: string;
  testingNotes: string;
  createdAt: string;
}

export interface TaskAttachment {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  category: AttachmentCategory;
  caption: string;
  notes: string;
  linkedFileChangeId: string | null;
  linkedTestId: string | null;
  uploadedAt: string;
}

export interface TaskTestRecord {
  id: string;
  title: string;
  testType: TestType;
  commandOrSteps: string;
  expectedResult: string;
  actualResult: string;
  status: TestStatus;
  testedAt: string;
  relatedAttachmentId: string | null;
  logs: string;
  blockedOrSkippedReason: string;
}

export interface TimeEntry {
  id: string;
  taskId: string;
  taskCode: string;
  taskTitle: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  notes: string;
  isManual: boolean;
}

export interface ActivityItem {
  id: string;
  taskId: string | null;
  taskCode: string | null;
  actionType: 'status' | 'note' | 'file' | 'attachment' | 'test' | 'git' | 'timer' | 'system';
  summary: string;
  details: string;
  timestamp: string;
}

export interface WorkNote {
  id: string;
  taskId: string | null;
  taskCode: string | null;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

export interface TaskChecklistItem {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskRecord {
  id: string;
  taskCode: string; // e.g., MIHIR-001
  title: string;
  description: string;
  ticketUrl: string;
  assignedBy: string;
  assignedAt: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  tags: string[];
  expectedOutcome: string;
  acceptanceCriteria: string;
  blockerNotes: string;
  projectName: string;
  isArchived: boolean;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  boardOrder?: number;
  subtasks?: TaskChecklistItem[];
  repositories: TaskRepository[];
  investigation: TaskInvestigation;
  changedFiles: TaskFileChange[];
  attachments: TaskAttachment[];
  tests: TaskTestRecord[];
}

export interface RepositoryConfig {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  description: string;
  remoteUrl: string;
  localFolderPath: string;
  defaultBaseBranch: string;
  defaultDevBranch: string;
  cloudTargetName: string;
  cloudTargetType: 'Branch' | 'Remote Repository' | 'Deployment Environment';
  defaultWorkflowMode: WorkflowMode;
}

export interface ProjectConfig {
  id: string;
  name: string;
  description: string;
  leadName: string;
  createdAt: string;
}

export interface RequiredCompletionChecks {
  requireAllTestsPassedOrSkipped: boolean;
  requireNoBlockedTests: boolean;
  requireGitCommitAndPush: boolean;
  requireDevMerge: boolean;
  requireRootCauseAndSolution: boolean;
}

export interface ActiveTimerState {
  taskId: string;
  taskCode: string;
  taskTitle: string;
  startedAt: string;
  notes: string;
}

export interface WorkspaceSettings {
  theme: 'light' | 'dark';
  timezone: string;
  cloudTargetLabel: string;
  defaultWorkflowMode: WorkflowMode;
  maxAttachmentSizeMB: number;
  requiredCompletionChecks: RequiredCompletionChecks;
  tags: string[];
  activeTimer: ActiveTimerState | null;
}

export interface WorkspaceStatePayload {
  tasks: TaskRecord[];
  projects: ProjectConfig[];
  repositories: RepositoryConfig[];
  timeEntries: TimeEntry[];
  activity: ActivityItem[];
  workNotes: WorkNote[];
  settings: WorkspaceSettings;
  storageInfo: {
    databasePath: string;
    uploadsPath: string;
    taskCount: number;
    attachmentCount: number;
  };
}

export type DuplicatePolicy = 'skip' | 'overwrite' | 'duplicate';
