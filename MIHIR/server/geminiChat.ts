import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { TaskRecord, TimeEntry, WorkNote } from '../src/types/workspace.js';
import { summarizeRepositoryProgress } from '../src/lib/workspaceLogic.js';

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

export const BOT_ROLE_CONFIGS: Record<
  EngineeringBotRole,
  {
    id: EngineeringBotRole;
    name: string;
    badge: string;
    recommendedModel: GeminiModelChoice;
    description: string;
    systemInstruction: string;
  }
> = {
  investigator: {
    id: 'investigator',
    name: 'Ray Root-Cause Investigator',
    badge: 'Complex Analysis',
    recommendedModel: 'gemini-4-argon',
    description:
      'Deep root-cause analysis and architecture debugging across raydashboard, rayhubapp, and rayjobapp.',
    systemInstruction: `You are the Ray Principal Root-Cause & Architecture Investigator inside MIHIR Workspace.
Your role is to help Mihir investigate, debug, and document engineering tasks across the Ray platform repositories:
- raydashboard (/Users/mihir/workspace/ray/raydashboard, default base branch: development2): Frontend analytics, Grafana security panel configurations, and SSL/TLS profile UI.
- rayhubapp (/Users/mihir/workspace/ray/rayhubapp, default base branch: development): Central service hub coordinating API gateway routes, profile schemas, and timeseries query aggregation.
- rayjobapp (/Users/mihir/workspace/ray/rayjobapp, default base branch: development): Worker daemon and template processor mapping SSL/TLS certificate placeholders into runtime nginx/envoy configs.

Always format responses with clear Markdown headings, concise bullet points, and actionable file/branch recommendations suitable for pasting directly into Section C (Issue & Investigation) or Section D (Changed Files) of MIHIR Workspace.`,
  },
  git_coach: {
    id: 'git_coach',
    name: 'Git & Release Workflow Coach',
    badge: 'General Workflow',
    recommendedModel: 'gemini-3.8-flash',
    description:
      'Generates exact terminal Git commands, PR descriptions, and 14-stage Ray release checklists.',
    systemInstruction: `You are the Ray Git & Release Workflow Coach inside MIHIR Workspace.
Your role is to guide Mihir through the 14-stage Ray Git & Deployment workflow:
1. Confirm base branch (development or development2)
2. Update local base from remote
3. Create/switch working branch (e.g., RAY-MIHIR-...)
4. Implement code changes
5. Review changed files
6. Stage changes
7. Commit locally
8. Push working branch to remote
9. Open PR or prepare direct merge
10. Code review / self-review
11. Merge into development target
12. Verify in development environment
13. Promote/merge to cloud release target
14. Verify in cloud/production environment.

Always output exact, copy-pasteable bash/git commands using the task's local folder path, base branch, working branch, and development target branch.`,
  },
  qa_strategist: {
    id: 'qa_strategist',
    name: 'QA & Verification Strategist',
    badge: 'General QA',
    recommendedModel: 'gemini-3.8-flash',
    description:
      'Designs unit, integration, API, UI, and regression test plans and resolves Blocked test states.',
    systemInstruction: `You are the Ray QA & Verification Strategist inside MIHIR Workspace.
Your role is to help Mihir design comprehensive verification checks (Unit, Integration, Manual, API, UI, Regression, Build) for Section F of his task tracker.
Remember that in MIHIR Workspace, 'Blocked' tests never count as passed and prevent task completion readiness until resolved. Provide concrete test commands, expected vs actual outcomes, and edge-case checklists.`,
  },
  standup_writer: {
    id: 'standup_writer',
    name: 'Fast Standup & Sprint Summarizer',
    badge: 'Fast Response',
    recommendedModel: 'gemini-3.1-flash-lite',
    description:
      'Rapidly formats daily standups (Yesterday / Today / Blockers), PR summaries, and work log notes.',
    systemInstruction: `You are the Fast Daily Standup & Engineering Journal Writer inside MIHIR Workspace.
Your role is to turn Mihir's active Ray tasks, branch progress, time logs, and blockers into crisp, copy-ready daily standup updates (Yesterday, Today, Blockers, Git/PR status) and concise work log notes. Keep responses fast, scannable, and high-signal.`,
  },
};

function buildWorkspaceContextPrompt(
  linkedTask: TaskRecord | undefined,
  allTasks: TaskRecord[],
  timeEntries: TimeEntry[],
  notes: WorkNote[]
): string {
  const lines: string[] = [];
  lines.push('=== LIVE MIHIR WORKSPACE CONTEXT ===');
  lines.push(
    `Active Tasks (${allTasks.filter((t) => !t.isArchived).length}): ` +
      allTasks
        .filter((t) => !t.isArchived)
        .map((t) => {
          const repos = t.repositories
            .map((r) => `${r.repositoryName}:${r.workingBranch}`)
            .join(', ');
          return `${t.taskCode} [${t.status}, ${t.priority}] "${t.title}" (${repos})`;
        })
        .join(' | ')
  );

  if (linkedTask) {
    lines.push('\n--- CURRENTLY ATTACHED TASK CONTEXT ---');
    lines.push(`Task ID: ${linkedTask.taskCode}`);
    lines.push(`Title: ${linkedTask.title}`);
    lines.push(`Status: ${linkedTask.status} | Priority: ${linkedTask.priority}`);
    lines.push(`Description: ${linkedTask.description}`);
    lines.push(`Blocker Notes: ${linkedTask.blockerNotes || 'None'}`);
    lines.push(
      `Repositories & Branches:\n` +
        linkedTask.repositories
          .map((r) => {
            const prog = summarizeRepositoryProgress(r);
            return `  - ${r.repositoryName} (${r.localFolderPath}): base=${r.baseBranch} -> working=${r.workingBranch} -> dev=${r.devTargetBranch} | Git ${prog.completedCount}/${prog.applicableCount} (${prog.percent}%) | Commit: ${prog.localCommitted ? 'Done' : 'Pending'}, Push: ${prog.remotePushed ? 'Done' : 'Pending'}, Merge: ${prog.devMerged ? 'Done' : 'Pending'}`;
          })
          .join('\n')
    );
    lines.push(`Problem Summary: ${linkedTask.investigation.actualBehavior || 'Not yet recorded'}`);
    lines.push(`Root Cause: ${linkedTask.investigation.rootCause || 'Not yet recorded'}`);
    lines.push(`Final Solution: ${linkedTask.investigation.finalSolution || 'Not yet recorded'}`);
    lines.push(
      `Changed Files (${linkedTask.changedFiles.length}): ` +
        linkedTask.changedFiles
          .map((f) => `${f.repositoryName}:${f.filePath} (${f.changeType} - ${f.whatChanged})`)
          .join('; ')
    );
    lines.push(
      `Tests (${linkedTask.tests.length}): ` +
        linkedTask.tests.map((t) => `${t.title} [${t.testType}: ${t.status}]`).join('; ')
    );
  }

  const totalMin = timeEntries.reduce((acc, e) => acc + e.durationMinutes, 0);
  lines.push(
    `\nTotal Logged Workspace Time: ${Math.floor(totalMin / 60)}h ${totalMin % 60}m across ${timeEntries.length} sessions. Recent Notes: ${notes.length}.`
  );
  return lines.join('\n');
}

function generateContextualFallbackReply(
  userMessage: string,
  roleId: EngineeringBotRole,
  modelId: GeminiModelChoice,
  linkedTask: TaskRecord | undefined,
  allTasks: TaskRecord[]
): string {
  const focusTask = linkedTask || allTasks[0];
  const primaryRepo = focusTask?.repositories[0];
  const repoName = primaryRepo?.repositoryName || 'raydashboard';
  const localPath = primaryRepo?.localFolderPath || `/Users/mihir/workspace/ray/${repoName}`;
  const baseBranch = primaryRepo?.baseBranch || 'development2';
  const workingBranch = primaryRepo?.workingBranch || 'RAY-MIHIR-Security-Graphs';
  const devBranch = primaryRepo?.devTargetBranch || baseBranch;

  if (roleId === 'git_coach' || /git|branch|commit|push|merge/i.test(userMessage)) {
    return `### Git & Release Workflow Commands (${focusTask?.taskCode || 'Ray Workspace'})

Here is the step-by-step terminal sequence for **\`${repoName}\`** on branch **\`${workingBranch}\`**:

\`\`\`bash
# 1. Navigate to local repository and sync base branch (${baseBranch})
cd ${localPath}
git checkout ${baseBranch}
git pull origin ${baseBranch}

# 2. Switch to or create working branch
git checkout -B ${workingBranch}

# 3. Inspect modified files and run verification suite
git status -sb
git diff

# 4. Stage and record local commit
git add .
git commit -m "${focusTask?.taskCode || 'RAY-TASK'}: ${focusTask?.title || 'Implement Ray workspace update'}"

# 5. Push working branch to remote origin
git push -u origin ${workingBranch}

# 6. Merge into development target (${devBranch}) after review
git checkout ${devBranch}
git pull origin ${devBranch}
git merge --no-ff ${workingBranch}
git push origin ${devBranch}
\`\`\`

**Readiness Reminder:** Before marking **${focusTask?.taskCode || 'the task'}** as \`Done\`, ensure all \`Blocked\` tests are resolved and Stage 11 (*Merge into development target*) is marked \`Completed\` in the **Git & Release** tab.`;
  }

  if (roleId === 'standup_writer' || /standup|summary|today|yesterday/i.test(userMessage)) {
    const activeList = allTasks.filter((t) => !t.isArchived);
    const blockedList = activeList.filter(
      (t) =>
        Boolean(t.blockerNotes) ||
        t.tests.some((test) => test.status === 'Blocked') ||
        t.repositories.some((r) => r.stages.some((s) => s.status === 'Blocked'))
    );
    return `### Daily Engineering Standup — Ray Project

**Yesterday / Recent Progress:**
${activeList
  .slice(0, 3)
  .map((t) => {
    const r = t.repositories[0];
    return `- **${t.taskCode}** (*${t.title}*): Worked in \`${r?.repositoryName || 'raydashboard'}\` on branch \`${r?.workingBranch || 'main'}\` (${t.changedFiles.length} files documented, status: **${t.status}**).`;
  })
  .join('\n')}

**Today's Focus:**
- Complete remaining verification and dev-branch merge steps for active tasks (${activeList.map((t) => t.taskCode).join(', ')}).
- Capture final Before/After verification screenshots and update test records.

**Blockers:**
${
  blockedList.length > 0
    ? blockedList
        .map(
          (b) =>
            `- **${b.taskCode}**: ${b.blockerNotes || 'Awaiting staging environment dependency resolution.'}`
        )
        .join('\n')
    : '- None currently blocking active branches.'
}`;
  }

  if (roleId === 'qa_strategist' || /test|verify|qa|blocked/i.test(userMessage)) {
    return `### Verification & Test Plan for ${focusTask?.taskCode || 'Ray Task'}

1. **Unit & Schema Validation (\`${repoName}\`)**:
   - Verify changed files (${
     focusTask?.changedFiles.map((f) => `\`${f.filePath}\``).join(', ') || 'modified modules'
   }) against strict input/output contracts.
2. **Cross-Service Integration Check**:
   - Confirm payload compatibility between \`raydashboard\`, \`rayhubapp\`, and \`rayjobapp\` on branch \`${workingBranch}\`.
3. **UI & Before/After Visual Verification**:
   - Capture 1440x900 desktop and 390x844 mobile screenshots and attach them under **E. Screenshots** with \`Before\` and \`After\` categories.
4. **Blocked Test Resolution Gate**:
   - Any test currently marked \`Blocked\` prevents task completion readiness; re-run and mark \`Passed\` once the environment dependency is available.`;
  }

  return `### Engineering Analysis — ${focusTask ? `${focusTask.taskCode}: ${focusTask.title}` : 'MIHIR Workspace'}

- **Repository & Branch Context**: \`${repoName}\` (\`${localPath}\`) — \`${baseBranch}\` → \`${workingBranch}\`
- **Root Cause & Architecture Summary**:
  - ${focusTask?.investigation?.rootCause || 'Inspect the upstream request lifecycle and payload mapping between raydashboard and rayhubapp.'}
- **Recommended Solution Steps**:
  1. ${focusTask?.investigation?.finalSolution || 'Apply the targeted fix in the primary module and verify that downstream consumers handle the updated schema cleanly.'}
  2. Document every touched file in **D. Changed Files** with clear *What* and *Why* notes so the task remains self-explanatory months later.
  3. Advance the **G. Git & Release** stepper through Local Commit, Remote Push, and Dev Branch Merge (\`${devBranch}\`).`;
}

export async function runMultiTurnGeminiChat(params: {
  modelId: GeminiModelChoice;
  roleId: EngineeringBotRole;
  history: ChatTurnMessage[];
  userMessage: string;
  linkedTask?: TaskRecord;
  allTasks: TaskRecord[];
  timeEntries: TimeEntry[];
  notes: WorkNote[];
}): Promise<{ replyText: string; modelUsed: string; fallbackNotice?: string }> {
  const roleConfig = BOT_ROLE_CONFIGS[params.roleId] || BOT_ROLE_CONFIGS.investigator;
  const workspaceContext = buildWorkspaceContextPrompt(
    params.linkedTask,
    params.allTasks,
    params.timeEntries,
    params.notes
  );
  const fullSystemInstruction = `${roleConfig.systemInstruction}\n\n${workspaceContext}`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      replyText: generateContextualFallbackReply(
        params.userMessage,
        params.roleId,
        params.modelId,
        params.linkedTask,
        params.allTasks
      ),
      modelUsed: `${params.modelId} (Workspace Local Engine)`,
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const formattedHistory = params.history
    .filter((m) => m.text && m.text.trim().length > 0)
    .slice(-16)
    .map((m) => ({
      role: m.sender === 'user' ? ('user' as const) : ('model' as const),
      parts: [{ text: m.text }],
    }));

  const tryModel = async (targetModel: GeminiModelChoice): Promise<string> => {
    const chat = ai.chats.create({
      model: targetModel,
      history: formattedHistory,
      config: {
        systemInstruction: fullSystemInstruction,
      },
    });
    const response: GenerateContentResponse = await chat.sendMessage({
      message: params.userMessage,
    });
    return response.text || 'No response generated.';
  };

  try {
    const text = await tryModel(params.modelId);
    return { replyText: text, modelUsed: params.modelId };
  } catch (err: any) {
    // If gemini-4-argon was selected without a paid API key, gracefully fall back to gemini-3.8-flash
    if (params.modelId === 'gemini-4-argon') {
      try {
        const fallbackText = await tryModel('gemini-3.8-flash');
        return {
          replyText: fallbackText,
          modelUsed: 'gemini-3.8-flash',
          fallbackNotice:
            'Responded with gemini-3.8-flash (gemini-4-argon requires a paid-tier API key in Settings > Secrets).',
        };
      } catch {
        // Fall through to contextual engineering engine
      }
    }
    return {
      replyText: generateContextualFallbackReply(
        params.userMessage,
        params.roleId,
        params.modelId,
        params.linkedTask,
        params.allTasks
      ),
      modelUsed: params.modelId,
    };
  }
}
