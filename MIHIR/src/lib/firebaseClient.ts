import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';
import {
  TaskRecord,
  TimeEntry,
  WorkNote,
} from '../types/workspace';
import { summarizeRepositoryProgress } from './workspaceLogic';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection on boot as required by firebase-integration-rpc
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Sanitize IDs to strictly match ^[a-zA-Z0-9_\-]+$ and maxLength 128
export function sanitizeValidId(raw: string, fallback = 'item_1'): string {
  const cleaned = String(raw || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned.length > 0 ? cleaned : fallback;
}

function clampString(val: string | undefined | null, maxLen: number, minLen = 0, fallback = '-'): string {
  const str = String(val ?? '').trim();
  if (str.length < minLen) {
    return fallback.slice(0, maxLen);
  }
  return str.slice(0, maxLen);
}

export async function signInWithGooglePopup(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutFirebaseUser(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged };
export type { User };

export interface CloudTaskSummary {
  id: string;
  ownerId: string;
  taskCode: string;
  title: string;
  description: string;
  projectName: string;
  repositoryName: string;
  workingBranch: string;
  baseBranch: string;
  status: string;
  priority: string;
  rootCauseSummary: string;
  gitCompletedSteps: number;
  gitTotalSteps: number;
  isArchived: boolean;
  tags: string[];
}

export async function syncTaskToFirestore(task: TaskRecord): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const docId = sanitizeValidId(`${user.uid}_${task.id}`);
  const path = `tasks/${docId}`;
  const primaryRepo = task.repositories[0];
  const progress = primaryRepo
    ? summarizeRepositoryProgress(primaryRepo)
    : { completedCount: 0, applicableCount: 14 };

  const validStatuses = [
    'Backlog',
    'Assigned',
    'In Progress',
    'Blocked',
    'Ready for Testing',
    'In Review',
    'Done',
    'Locked',
  ];
  const validPriorities = ['Low', 'Medium', 'High', 'Urgent'];

  const sanitizedTags = (task.tags || [])
    .slice(0, 10)
    .map((t) => clampString(t, 50, 1, 'tag'))
    .filter((t) => t.length >= 1 && t.length <= 50);

  const payload = {
    ownerId: sanitizeValidId(user.uid),
    taskCode: sanitizeValidId(task.taskCode || 'MIHIR-001').slice(0, 40),
    title: clampString(task.title, 300, 1, 'Untitled Task'),
    description: clampString(task.description, 5000, 0, ''),
    projectName: clampString(task.projectName, 120, 1, 'Ray'),
    repositoryName: clampString(primaryRepo?.repositoryName, 120, 1, 'raydashboard'),
    workingBranch: clampString(primaryRepo?.workingBranch, 200, 1, 'RAY-MIHIR-Task'),
    baseBranch: clampString(primaryRepo?.baseBranch, 200, 1, 'development'),
    status: validStatuses.includes(task.status) ? task.status : 'Assigned',
    priority: validPriorities.includes(task.priority) ? task.priority : 'Medium',
    rootCauseSummary: clampString(
      `${task.investigation?.rootCause || ''} ${task.investigation?.finalSolution || ''}`.trim(),
      5000,
      0,
      ''
    ),
    gitCompletedSteps: Math.max(0, Math.min(20, Math.floor(progress.completedCount || 0))),
    gitTotalSteps: Math.max(1, Math.min(20, Math.floor(progress.applicableCount || 14))),
    isArchived: Boolean(task.isArchived),
    tags: sanitizedTags,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'tasks', docId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCloudTaskFromFirestore(taskId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const docId = sanitizeValidId(`${user.uid}_${taskId}`);
  const path = `tasks/${docId}`;
  try {
    await deleteDoc(doc(db, 'tasks', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncWorkNoteToFirestore(note: WorkNote, relatedTaskCode = 'GENERAL'): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const docId = sanitizeValidId(`${user.uid}_${note.id}`);
  const path = `workNotes/${docId}`;

  const payload = {
    ownerId: sanitizeValidId(user.uid),
    title: clampString(note.title, 200, 1, 'Engineering Note'),
    content: clampString(note.content, 5000, 1, 'Note recorded in MIHIR Workspace.'),
    relatedTaskCode: clampString(relatedTaskCode || 'GENERAL', 40, 1, 'GENERAL'),
    status: 'Active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'workNotes', docId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncTimeEntryToFirestore(entry: TimeEntry, taskCode = 'MIHIR-001'): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const docId = sanitizeValidId(`${user.uid}_${entry.id}`);
  const path = `timeEntries/${docId}`;

  const payload = {
    ownerId: sanitizeValidId(user.uid),
    taskCode: clampString(taskCode || 'MIHIR-001', 40, 1, 'MIHIR-001'),
    durationMinutes: Math.max(1, Math.min(1440, Math.round(entry.durationMinutes || 15))),
    notes: clampString(entry.notes, 1000, 1, 'Focused development session'),
    status: 'Logged',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'timeEntries', docId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncFullWorkspaceToFirestore(
  tasks: TaskRecord[],
  notes: WorkNote[],
  timeEntries: TimeEntry[]
): Promise<{ syncedTasks: number; syncedNotes: number; syncedTimeEntries: number }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return { syncedTasks: 0, syncedNotes: 0, syncedTimeEntries: 0 };
  }

  const taskMap = new Map(tasks.map((t) => [t.id, t.taskCode]));

  for (const task of tasks) {
    await syncTaskToFirestore(task);
  }
  for (const note of notes) {
    const code = note.taskId ? taskMap.get(note.taskId) || 'GENERAL' : 'GENERAL';
    await syncWorkNoteToFirestore(note, code);
  }
  for (const entry of timeEntries) {
    const code = taskMap.get(entry.taskId) || 'MIHIR-001';
    await syncTimeEntryToFirestore(entry, code);
  }

  return {
    syncedTasks: tasks.length,
    syncedNotes: notes.length,
    syncedTimeEntries: timeEntries.length,
  };
}

export async function syncChatTurnToFirestore(params: {
  threadId: string;
  title: string;
  roleId: string;
  modelId: 'gemini-4-argon' | 'gemini-3.8-flash' | 'gemini-3.1-flash-lite';
  linkedTaskCode: string;
  userMessageId: string;
  userText: string;
  modelMessageId: string;
  modelText: string;
  modelUsed: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const validModels = ['gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
  const safeThreadId = sanitizeValidId(`${user.uid}_${params.threadId}`);
  const threadPath = `chatThreads/${safeThreadId}`;

  const threadPayload = {
    ownerId: sanitizeValidId(user.uid),
    title: clampString(params.title, 200, 1, 'Engineering Chat'),
    roleId: clampString(params.roleId, 60, 1, 'investigator'),
    modelId: validModels.includes(params.modelId) ? params.modelId : 'gemini-3.8-flash',
    linkedTaskCode: clampString(params.linkedTaskCode || 'NONE', 40, 1, 'NONE'),
    status: 'Active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'chatThreads', safeThreadId), threadPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, threadPath);
  }

  const safeUserMsgId = sanitizeValidId(params.userMessageId);
  const userMsgPath = `chatThreads/${safeThreadId}/messages/${safeUserMsgId}`;
  try {
    await setDoc(doc(db, 'chatThreads', safeThreadId, 'messages', safeUserMsgId), {
      ownerId: sanitizeValidId(user.uid),
      threadId: safeThreadId,
      sender: 'user',
      text: clampString(params.userText, 15000, 1, '...'),
      modelUsed: clampString(params.modelUsed, 60, 1, 'gemini-3.8-flash'),
      status: 'Final',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userMsgPath);
  }

  const safeModelMsgId = sanitizeValidId(params.modelMessageId);
  const modelMsgPath = `chatThreads/${safeThreadId}/messages/${safeModelMsgId}`;
  try {
    await setDoc(doc(db, 'chatThreads', safeThreadId, 'messages', safeModelMsgId), {
      ownerId: sanitizeValidId(user.uid),
      threadId: safeThreadId,
      sender: 'model',
      text: clampString(params.modelText, 15000, 1, '...'),
      modelUsed: clampString(params.modelUsed, 60, 1, 'gemini-3.8-flash'),
      status: 'Final',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, modelMsgPath);
  }
}

export function subscribeToCloudTasks(
  userId: string,
  onUpdate: (cloudTasks: CloudTaskSummary[]) => void
): () => void {
  const safeUid = sanitizeValidId(userId);
  const q = query(collection(db, 'tasks'), where('ownerId', '==', safeUid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: CloudTaskSummary[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: data.ownerId,
          taskCode: data.taskCode,
          title: data.title,
          description: data.description,
          projectName: data.projectName,
          repositoryName: data.repositoryName,
          workingBranch: data.workingBranch,
          baseBranch: data.baseBranch,
          status: data.status,
          priority: data.priority,
          rootCauseSummary: data.rootCauseSummary,
          gitCompletedSteps: data.gitCompletedSteps,
          gitTotalSteps: data.gitTotalSteps,
          isArchived: data.isArchived,
          tags: Array.isArray(data.tags) ? data.tags : [],
        };
      });
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tasks');
    }
  );
}

export async function fetchCloudCollectionCounts(userId: string): Promise<{
  tasks: number;
  notes: number;
  timeEntries: number;
  chatThreads: number;
}> {
  const safeUid = sanitizeValidId(userId);
  try {
    const [tasksSnap, notesSnap, timeSnap, chatSnap] = await Promise.all([
      getDocs(query(collection(db, 'tasks'), where('ownerId', '==', safeUid))),
      getDocs(query(collection(db, 'workNotes'), where('ownerId', '==', safeUid))),
      getDocs(query(collection(db, 'timeEntries'), where('ownerId', '==', safeUid))),
      getDocs(query(collection(db, 'chatThreads'), where('ownerId', '==', safeUid))),
    ]);
    return {
      tasks: tasksSnap.size,
      notes: notesSnap.size,
      timeEntries: timeSnap.size,
      chatThreads: chatSnap.size,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'tasks');
  }
}
