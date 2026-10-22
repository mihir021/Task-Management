import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Send,
  Plus,
  Trash2,
  Copy,
  Check,
  Terminal,
  Bug,
  FlaskConical,
  FileText,
  CloudCheck,
  GitBranch,
  ArrowUpRight,
} from 'lucide-react';
import { TaskRecord } from '../types/workspace';
import { syncChatTurnToFirestore } from '../lib/firebaseClient';

export type GeminiModelChoice =
  | 'gemini-4-argon'
  | 'gemini-3.8-flash'
  | 'gemini-3.1-flash-lite';

export type EngineeringBotRole =
  | 'investigator'
  | 'git_coach'
  | 'qa_strategist'
  | 'standup_writer';

export interface ChatTurnMessage {
  id: string;
  sender: 'user' | 'model';
  text: string;
  modelUsed: string;
  createdAt: string;
}

export interface ChatThreadRecord {
  id: string;
  title: string;
  roleId: EngineeringBotRole;
  modelId: GeminiModelChoice;
  linkedTaskId: string;
  messages: ChatTurnMessage[];
  createdAt: string;
  updatedAt: string;
}

interface BotRoleOption {
  id: EngineeringBotRole;
  name: string;
  badge: string;
  recommendedModel: GeminiModelChoice;
  description: string;
  systemInstruction: string;
}

interface AiCopilotViewProps {
  tasks: TaskRecord[];
  initialTaskId?: string | null;
  firebaseUserEmail?: string | null;
  onSaveAsWorkNote: (payload: {
    taskId: string | null;
    title: string;
    content: string;
    tags: string[];
  }) => Promise<void>;
  onOpenTask: (taskId: string) => void;
}

const MODEL_OPTIONS: Array<{
  id: GeminiModelChoice;
  label: string;
  tier: string;
  description: string;
}> = [
  {
    id: 'gemini-4-argon',
    label: 'gemini-4-argon',
    tier: 'Complex Tasks',
    description: 'Deep multi-repo root-cause analysis and complex Ray architecture tasks.',
  },
  {
    id: 'gemini-3.8-flash',
    label: 'gemini-3.8-flash',
    tier: 'General Tasks',
    description: 'Balanced engineering investigation, test verification, and code review.',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'gemini-3.1-flash-lite',
    tier: 'Fast Tasks',
    description: 'Ultra-fast Git command generation, standup formatting, and quick checks.',
  },
];

const QUICK_PROMPTS: Array<{
  label: string;
  role: EngineeringBotRole;
  model: GeminiModelChoice;
  prompt: string;
}> = [
  {
    label: 'Generate Terminal Git Commands',
    role: 'git_coach',
    model: 'gemini-3.1-flash-lite',
    prompt:
      'Generate the exact step-by-step terminal Git commands (checkout base, pull, switch working branch, commit, push, and dev merge) for the attached task repositories.',
  },
  {
    label: 'Analyze Root Cause & Solution',
    role: 'investigator',
    model: 'gemini-4-argon',
    prompt:
      'Analyze the attached task problem summary and changed files, and draft a clear Root Cause and Final Solution summary for Section C (Investigation).',
  },
  {
    label: 'Design Verification Test Suite',
    role: 'qa_strategist',
    model: 'gemini-3.8-flash',
    prompt:
      'Design a complete Unit, Integration, and UI verification checklist for the attached task, including how to resolve any Blocked test dependencies.',
  },
  {
    label: 'Write Daily Ray Standup Update',
    role: 'standup_writer',
    model: 'gemini-3.1-flash-lite',
    prompt:
      'Format my daily engineering standup update (Yesterday, Today, Blockers, and active Ray branch progress) across all active tasks.',
  },
];

export const AiCopilotView: React.FC<AiCopilotViewProps> = ({
  tasks,
  initialTaskId,
  firebaseUserEmail,
  onSaveAsWorkNote,
  onOpenTask,
}) => {
  const [threads, setThreads] = useState<ChatThreadRecord[]>([]);
  const [roles, setRoles] = useState<BotRoleOption[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<EngineeringBotRole>('investigator');
  const [selectedModel, setSelectedModel] = useState<GeminiModelChoice>('gemini-3.8-flash');
  const [selectedTaskId, setSelectedTaskId] = useState<string>(initialTaskId || '');
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [savedNoteMsgId, setSavedNoteMsgId] = useState<string | null>(null);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch('/api/chat/threads')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.roles)) {
          setRoles(data.roles);
        }
        if (Array.isArray(data.threads) && data.threads.length > 0) {
          setThreads(data.threads);
          const first = data.threads[0] as ChatThreadRecord;
          setActiveThreadId(first.id);
          setSelectedRole(first.roleId || 'investigator');
          setSelectedModel(first.modelId || 'gemini-3.8-flash');
          setSelectedTaskId(initialTaskId || first.linkedTaskId || tasks[0]?.id || '');
        }
      })
      .catch(() => {});
  }, [initialTaskId, tasks]);

  const activeThread = threads.find((t) => t.id === activeThreadId) || threads[0];
  const activeRoleConfig = roles.find((r) => r.id === selectedRole) || roles[0];
  const linkedTask = tasks.find((t) => t.id === selectedTaskId);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [activeThread?.messages.length, sending]);

  const handleSelectThread = (thread: ChatThreadRecord) => {
    setActiveThreadId(thread.id);
    setSelectedRole(thread.roleId);
    setSelectedModel(thread.modelId);
    setSelectedTaskId(thread.linkedTaskId || '');
    setNotice('');
  };

  const handleCreateThread = async (
    customRole?: EngineeringBotRole,
    customModel?: GeminiModelChoice
  ) => {
    const roleToUse = customRole || selectedRole;
    const modelToUse = customModel || selectedModel;
    const res = await fetch('/api/chat/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roleId: roleToUse,
        modelId: modelToUse,
        linkedTaskId: selectedTaskId,
      }),
    });
    const data = await res.json();
    if (data.thread) {
      setThreads(data.threads);
      setActiveThreadId(data.thread.id);
      setSelectedRole(data.thread.roleId);
      setSelectedModel(data.thread.modelId);
    }
  };

  const handleDeleteThread = async (threadId: string) => {
    const res = await fetch(`/api/chat/threads/${threadId}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (Array.isArray(data.threads)) {
      setThreads(data.threads);
      if (activeThreadId === threadId && data.threads[0]) {
        handleSelectThread(data.threads[0]);
      }
    }
  };

  const handleSendPrompt = async (overridePrompt?: string) => {
    const textToSend = (overridePrompt ?? inputMessage).trim();
    if (!textToSend || sending) return;

    let targetThreadId = activeThread?.id;
    if (!targetThreadId) {
      const createRes = await fetch('/api/chat/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleId: selectedRole,
          modelId: selectedModel,
          linkedTaskId: selectedTaskId,
        }),
      });
      const createdData = await createRes.json();
      targetThreadId = createdData.thread?.id;
    }
    if (!targetThreadId) return;

    if (!overridePrompt) {
      setInputMessage('');
    }
    setSending(true);
    setNotice('');

    try {
      const res = await fetch(`/api/chat/threads/${targetThreadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          modelId: selectedModel,
          roleId: selectedRole,
          linkedTaskId: selectedTaskId,
        }),
      });
      const data = await res.json();
      if (data.threads) {
        setThreads(data.threads);
      }
      if (data.fallbackNotice) {
        setNotice(data.fallbackNotice);
      }

      // Sync to Cloud Firestore if authenticated
      if (firebaseUserEmail && data.thread && data.userMsg && data.modelMsg) {
        await syncChatTurnToFirestore({
          threadId: data.thread.id,
          title: data.thread.title,
          roleId: selectedRole,
          modelId: selectedModel,
          linkedTaskCode: linkedTask?.taskCode || 'NONE',
          userMessageId: data.userMsg.id,
          userText: data.userMsg.text,
          modelMessageId: data.modelMsg.id,
          modelText: data.modelMsg.text,
          modelUsed: data.modelMsg.modelUsed,
        }).catch(() => {});
      }
    } finally {
      setSending(false);
    }
  };

  const handleCopyMessage = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleSaveReplyToWorkLog = async (msg: ChatTurnMessage) => {
    await onSaveAsWorkNote({
      taskId: selectedTaskId || null,
      title: `${linkedTask ? `${linkedTask.taskCode} — ` : ''}AI Copilot (${selectedRole}) Summary`,
      content: msg.text,
      tags: ['ai-copilot', selectedRole],
    });
    setSavedNoteMsgId(msg.id);
    setTimeout(() => setSavedNoteMsgId(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Gemini Engineering Copilot
            </h1>
            <span className="px-2.5 py-0.5 text-[11px] font-mono font-semibold rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 whitespace-nowrap shrink-0">
              Multi-Turn Context Engine
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Role-specialized engineering assistant grounded in your live Ray repositories, branches, changed files, and test records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {firebaseUserEmail && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-lg">
              <CloudCheck className="w-3.5 h-3.5" />
              Synced to Firestore
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowSystemPrompt((v) => !v)}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            {showSystemPrompt ? 'Hide Role System Instruction' : 'Inspect System Instruction'}
          </button>
          <button
            type="button"
            onClick={() => handleCreateThread()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Conversation
          </button>
        </div>
      </div>

      {/* Model & Role Control Bar */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Engineering Role Selector */}
          <div className="min-w-0">
            <label
              htmlFor="copilot-role-select"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              1. Assistant Role (System Instruction Persona)
            </label>
            <select
              id="copilot-role-select"
              value={selectedRole}
              onChange={(e) => {
                const nextRole = e.target.value as EngineeringBotRole;
                setSelectedRole(nextRole);
                const roleObj = roles.find((r) => r.id === nextRole);
                if (roleObj) {
                  setSelectedModel(roleObj.recommendedModel);
                }
              }}
              className="w-full max-w-full truncate px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="investigator">Ray Root-Cause Investigator (Complex Tasks)</option>
              <option value="git_coach">Git & Release Workflow Coach (14-Stage Stepper)</option>
              <option value="qa_strategist">QA & Verification Strategist (Test Suites)</option>
              <option value="standup_writer">Fast Standup & Sprint Summarizer (Daily Log)</option>
            </select>
          </div>

          {/* 2. Gemini Model Selector */}
          <div className="min-w-0">
            <label
              htmlFor="copilot-model-select"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              2. Gemini Model Tier
            </label>
            <select
              id="copilot-model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as GeminiModelChoice)}
              className="w-full max-w-full truncate px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.tier}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Attached Task Context */}
          <div className="min-w-0">
            <label
              htmlFor="copilot-task-select"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              3. Grounded Task Context
            </label>
            <div className="flex items-center gap-2 min-w-0">
              <select
                id="copilot-task-select"
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="flex-1 min-w-0 w-full max-w-full truncate px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="">All Active Ray Tasks (Overview)</option>
                {tasks
                  .filter((t) => !t.isArchived)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      [{t.taskCode}] {t.title.slice(0, 32)}
                    </option>
                  ))}
              </select>
              {linkedTask && (
                <button
                  type="button"
                  onClick={() => onOpenTask(linkedTask.id)}
                  title="Open attached task"
                  className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* System Instruction Preview Panel */}
        {showSystemPrompt && activeRoleConfig && (
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
            <div className="flex items-center justify-between font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
              <span>ACTIVE SYSTEM INSTRUCTION ({activeRoleConfig.name})</span>
              <span>Model: {selectedModel}</span>
            </div>
            <pre className="font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
              {activeRoleConfig.systemInstruction}
            </pre>
          </div>
        )}

        {/* Quick One-Click Engineering Prompts */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 mr-1">Quick Actions:</span>
          {QUICK_PROMPTS.map((qp) => (
            <button
              key={qp.label}
              type="button"
              disabled={sending}
              onClick={() => {
                setSelectedRole(qp.role);
                setSelectedModel(qp.model);
                handleSendPrompt(qp.prompt);
              }}
              className="px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              {qp.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split View: Thread List + Scrollable Multi-Turn Conversation */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Thread History Sidebar */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 h-fit">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Saved Threads ({threads.length})
            </h2>
            <button
              type="button"
              onClick={() => handleCreateThread()}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
            >
              + New
            </button>
          </div>

          <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
            {threads.map((t) => {
              const isSelected = activeThread?.id === t.id;
              return (
                <div
                  key={t.id}
                  className={`group flex items-start justify-between gap-2 p-2.5 rounded-lg border text-left transition-colors ${
                    isSelected
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/60'
                      : 'bg-slate-50/50 dark:bg-slate-950/40 border-transparent hover:border-slate-200 dark:hover:border-slate-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectThread(t)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {t.title}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                      <span>{t.modelId}</span>
                      <span>·</span>
                      <span>{t.messages?.length || 0} msgs</span>
                    </div>
                  </button>
                  {threads.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteThread(t.id)}
                      aria-label={`Delete thread ${t.title}`}
                      className="p-1 text-slate-400 hover:text-red-500 rounded opacity-70 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Scrollable Multi-Turn Message Thread */}
        <div className="lg:col-span-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col h-[580px]">
          {/* Active Thread Banner */}
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-950/40">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {activeThread?.title || 'Engineering Assistant Thread'}
              </span>
              {linkedTask && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <GitBranch className="w-3 h-3 text-indigo-500" />
                  {linkedTask.taskCode}
                </span>
              )}
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              Active Model: <strong className="text-slate-800 dark:text-slate-200">{selectedModel}</strong>
            </span>
          </div>

          {notice && (
            <div className="mx-5 mt-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300">
              {notice}
            </div>
          )}

          {/* Scrollable Messages Container */}
          <div
            ref={messagesContainerRef}
            data-testid="copilot-message-thread"
            className="flex-1 overflow-y-auto p-5 space-y-4"
          >
            {!activeThread || activeThread.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3 text-slate-500">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Terminal className="w-5 h-5" />
                </div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Start a Multi-Turn Engineering Session
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ask for root-cause investigation help on <code className="font-mono">raydashboard</code>,{' '}
                  <code className="font-mono">rayhubapp</code>, or <code className="font-mono">rayjobapp</code>, generate Git branch commands, or format today's standup.
                </p>
              </div>
            ) : (
              activeThread.messages.map((msg) => {
                const isUser = msg.sender === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-3xl rounded-xl p-4 text-xs leading-relaxed ${
                        isUser
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 mb-1.5 text-[10px] font-mono opacity-75">
                        <span>{isUser ? 'MIHIR (YOU)' : `GEMINI COPILOT (${msg.modelUsed})`}</span>
                      </div>
                      <div className="whitespace-pre-wrap font-sans">{msg.text}</div>

                      {!isUser && (
                        <div className="flex flex-wrap items-center gap-2 mt-3 pt-2.5 border-t border-slate-200/80 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(msg.id, msg.text)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                          >
                            {copiedMsgId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                Copy Markdown
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSaveReplyToWorkLog(msg)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                          >
                            {savedNoteMsgId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500" />
                                Saved to Work Log
                              </>
                            ) : (
                              <>
                                <FileText className="w-3 h-3 text-indigo-500" />
                                Save to Work Log
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {sending && (
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono p-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                <span>Generating response with {selectedModel}...</span>
              </div>
            )}
          </div>

          {/* Input Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendPrompt();
            }}
            className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 flex items-center gap-3"
          >
            <input
              type="text"
              aria-label="Ask Gemini Engineering Copilot"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={`Ask ${activeRoleConfig?.name || 'Copilot'} (${selectedModel}) about ${
                linkedTask ? linkedTask.taskCode : 'your Ray tasks, branches, or tests'
              }...`}
              className="flex-1 px-3.5 py-2.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={sending || !inputMessage.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
