import fs from 'node:fs';
import path from 'node:path';
import {
  ActivityItem,
  ProjectConfig,
  RepositoryConfig,
  TaskChecklistItem,
  TaskRecord,
  TimeEntry,
  WorkNote,
  WorkspaceSettings,
} from '../src/types/workspace';
import { createDefaultGitStages } from '../src/lib/workspaceLogic';

export const DEFAULT_DEMO_SUBTASKS: Record<string, TaskChecklistItem[]> = {
  'MIHIR-001': [
    { id: 'st-001-1', title: 'Audit security_overview.json gridPos coordinates on development2', completed: true },
    { id: 'st-001-2', title: 'Promote WAF Threat Vectors (x:0, y:0) and TLS Handshake Health (x:12, y:0)', completed: true },
    { id: 'st-001-3', title: 'Add sortPanelsByGridPos responsive single-column helper in SecurityPanelGrid.tsx', completed: true },
    { id: 'st-001-4', title: 'Capture Before/After Grafana SVG screenshots and pass unit suite', completed: true },
  ],
  'MIHIR-002': [
    { id: 'st-002-1', title: 'Profile duplicate time-range queries in useSecurityGraphData.ts', completed: true },
    { id: 'st-002-2', title: 'Add AbortController signal cleanup and 150ms range debounce', completed: true },
    { id: 'st-002-3', title: 'Implement POST /api/v1/metrics/batch coalescing in rayhubapp', completed: true },
    { id: 'st-002-4', title: 'Wire IntersectionObserver lazy loading for y=8 secondary panels', completed: false },
    { id: 'st-002-5', title: 'Verify <700ms load benchmark on development2 and commit locally', completed: false },
  ],
  'MIHIR-003': [
    { id: 'st-003-1', title: 'Expose GET /api/v1/ssl/certificate-keys endpoint in rayhubapp', completed: true },
    { id: 'st-003-2', title: 'Add validated Website certificate key dropdown to SslTlsProfileModal.tsx', completed: true },
    { id: 'st-003-3', title: 'Verify empty-submit error state and capture Before/After modal screenshots', completed: true },
    { id: 'st-003-4', title: 'Complete peer PR review and merge RAY-MIHIR-SSL-TLS-ADD-PROFILE into development', completed: false },
  ],
  'MIHIR-004': [
    { id: 'st-004-1', title: 'Add {{WEBSITE_CERT_KEY}} resolver to PLACEHOLDER_TOKEN_MAP in rayjobapp', completed: true },
    { id: 'st-004-2', title: 'Pass unit tests for RSA-4096 and ECDSA key alias path resolution', completed: true },
    { id: 'st-004-3', title: 'Run staging HashiCorp Vault dry-run integration verification check', completed: false },
    { id: 'st-004-4', title: 'Direct-merge RAY-MIHIR-SSL-TLS-ADD-PROFILE into development target', completed: false },
  ],
};

export function ensureSampleUploadFiles(uploadsDir: string): void {
  if (process.env.VERCEL) return;
  fs.mkdirSync(uploadsDir, { recursive: true });

  const files: Record<string, string> = {
    'sample-grafana-before.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
      <rect width="960" height="540" fill="#0f172a"/>
      <rect x="24" y="20" width="912" height="44" rx="6" fill="#1e293b" stroke="#334155"/>
      <text x="44" y="47" fill="#f8fafc" font-family="monospace" font-size="15" font-weight="bold">Ray Grafana Security Dashboard — BEFORE (Illustrative Sample)</text>
      <text x="720" y="47" fill="#f59e0b" font-family="monospace" font-size="13">Branch: development2</text>
      <!-- Top row previously had generic network throughput instead of security panels -->
      <rect x="24" y="84" width="444" height="190" rx="8" fill="#1e293b" stroke="#475569" stroke-width="1.5"/>
      <text x="44" y="114" fill="#94a3b8" font-family="sans-serif" font-size="13" font-weight="bold">Panel #1: General Ingress Throughput (Low Priority)</text>
      <polyline fill="none" stroke="#38bdf8" stroke-width="2.5" points="44,230 120,210 190,220 260,180 340,195 430,170"/>
      <rect x="492" y="84" width="444" height="190" rx="8" fill="#1e293b" stroke="#475569" stroke-width="1.5"/>
      <text x="512" y="114" fill="#94a3b8" font-family="sans-serif" font-size="13" font-weight="bold">Panel #2: Worker Queue Depth (Low Priority)</text>
      <polyline fill="none" stroke="#818cf8" stroke-width="2.5" points="512,240 590,225 660,215 740,230 820,200 900,190"/>
      <!-- Security panels buried below fold -->
      <rect x="24" y="296" width="444" height="210" rx="8" fill="#1e293b" stroke="#ef4444" stroke-width="2" stroke-dasharray="6,4"/>
      <text x="44" y="328" fill="#fca5a5" font-family="sans-serif" font-size="14" font-weight="bold">Buried Panel #5: WAF Blocked Threat Vectors (y=16)</text>
      <text x="44" y="356" fill="#cbd5e1" font-family="monospace" font-size="12">Issue: Requires scrolling below fold to see active security alerts</text>
      <rect x="44" y="380" width="380" height="24" rx="4" fill="#7f1d1d"/>
      <text x="56" y="397" fill="#fecaca" font-family="monospace" font-size="12">SQLi / XSS Anomaly Spike: 142 events/min</text>
      <rect x="492" y="296" width="444" height="210" rx="8" fill="#1e293b" stroke="#ef4444" stroke-width="2" stroke-dasharray="6,4"/>
      <text x="512" y="328" fill="#fca5a5" font-family="sans-serif" font-size="14" font-weight="bold">Buried Panel #6: TLS Handshake Failure Rate (y=16)</text>
      <text x="512" y="356" fill="#cbd5e1" font-family="monospace" font-size="12">gridPos: { x: 12, y: 16, w: 12, h: 8 } — Misordered</text>
    </svg>`,

    'sample-grafana-after.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
      <rect width="960" height="540" fill="#0f172a"/>
      <rect x="24" y="20" width="912" height="44" rx="6" fill="#1e293b" stroke="#10b981"/>
      <text x="44" y="47" fill="#f8fafc" font-family="monospace" font-size="15" font-weight="bold">Ray Grafana Security Dashboard — AFTER Reordering (Sample)</text>
      <text x="640" y="47" fill="#34d399" font-family="monospace" font-size="13">Branch: RAY-MIHIR-Security-Graphs</text>
      <!-- Critical security panels promoted to y=0 -->
      <rect x="24" y="84" width="444" height="205" rx="8" fill="#1e293b" stroke="#10b981" stroke-width="2"/>
      <text x="44" y="114" fill="#6ee7b7" font-family="sans-serif" font-size="14" font-weight="bold">Panel #1 (y=0): WAF Blocked Threat Vectors [Promoted]</text>
      <text x="44" y="140" fill="#94a3b8" font-family="monospace" font-size="12">gridPos: { x: 0, y: 0, w: 12, h: 8 } — Primary Anchor</text>
      <polyline fill="none" stroke="#10b981" stroke-width="3" points="44,240 120,190 190,210 260,155 340,175 430,145"/>
      <rect x="492" y="84" width="444" height="205" rx="8" fill="#1e293b" stroke="#10b981" stroke-width="2"/>
      <text x="512" y="114" fill="#6ee7b7" font-family="sans-serif" font-size="14" font-weight="bold">Panel #2 (y=0): TLS Handshake &amp; Cert Health [Promoted]</text>
      <text x="512" y="140" fill="#94a3b8" font-family="monospace" font-size="12">gridPos: { x: 12, y: 0, w: 12, h: 8 } — Immediate Visibility</text>
      <polyline fill="none" stroke="#38bdf8" stroke-width="3" points="512,245 590,215 660,195 740,180 820,165 900,150"/>
      <!-- Secondary panels cleanly below -->
      <rect x="24" y="310" width="912" height="195" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
      <text x="44" y="342" fill="#cbd5e1" font-family="sans-serif" font-size="13" font-weight="bold">Secondary Row (y=8): General Ingress &amp; Worker Telemetry (Lazy-loaded on scroll)</text>
      <text x="44" y="372" fill="#94a3b8" font-family="monospace" font-size="12">First meaningful paint improved from 2.8s to 640ms via batched query debouncing</text>
    </svg>`,

    'sample-ssl-before.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
      <rect width="960" height="540" fill="#f8fafc"/>
      <rect x="32" y="28" width="896" height="484" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
      <text x="64" y="72" fill="#0f172a" font-family="sans-serif" font-size="18" font-weight="bold">SSL/TLS Profile Modal — BEFORE (Missing Certificate Key Selector)</text>
      <text x="64" y="100" fill="#64748b" font-family="monospace" font-size="13">Repo: raydashboard / Branch: development (Illustrative Sample)</text>
      <rect x="64" y="132" width="420" height="68" rx="6" fill="#f1f5f9" stroke="#cbd5e1"/>
      <text x="80" y="156" fill="#475569" font-family="sans-serif" font-size="12" font-weight="bold">Profile Name</text>
      <text x="80" y="182" fill="#0f172a" font-family="monospace" font-size="14">prod-edge-wildcard-tls</text>
      <rect x="64" y="224" width="420" height="68" rx="6" fill="#fef2f2" stroke="#f87171" stroke-width="2"/>
      <text x="80" y="248" fill="#b91c1c" font-family="sans-serif" font-size="12" font-weight="bold">Website Certificate Key (Missing Dropdown)</text>
      <text x="80" y="274" fill="#dc2626" font-family="monospace" font-size="13">Manual text input caused key alias mismatch in rayjobapp</text>
    </svg>`,

    'sample-ssl-after.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
      <rect width="960" height="540" fill="#f8fafc"/>
      <rect x="32" y="28" width="896" height="484" rx="10" fill="#ffffff" stroke="#10b981" stroke-width="2"/>
      <text x="64" y="72" fill="#0f172a" font-family="sans-serif" font-size="18" font-weight="bold">SSL/TLS Profile Modal — AFTER (Validated Certificate Key Dropdown)</text>
      <text x="64" y="100" fill="#059669" font-family="monospace" font-size="13">Repo: raydashboard + rayjobapp / Branch: RAY-MIHIR-SSL-TLS-ADD-PROFILE</text>
      <rect x="64" y="132" width="460" height="68" rx="6" fill="#f1f5f9" stroke="#cbd5e1"/>
      <text x="80" y="156" fill="#475569" font-family="sans-serif" font-size="12" font-weight="bold">Profile Name</text>
      <text x="80" y="182" fill="#0f172a" font-family="monospace" font-size="14">prod-edge-wildcard-tls</text>
      <rect x="64" y="224" width="460" height="150" rx="6" fill="#ecfdf5" stroke="#10b981" stroke-width="2"/>
      <text x="80" y="250" fill="#065f46" font-family="sans-serif" font-size="13" font-weight="bold">Website Certificate Key Dropdown (Synced with Vault Keys)</text>
      <text x="80" y="282" fill="#0f172a" font-family="monospace" font-size="13">[Selected] {{CERT_KEY_RAY_EDGE_RSA4096}} — Validated</text>
      <text x="80" y="312" fill="#475569" font-family="monospace" font-size="12">Option 2: {{CERT_KEY_RAY_INTERNAL_ECDSA}}</text>
      <text x="80" y="340" fill="#475569" font-family="monospace" font-size="12">Option 3: {{CERT_KEY_RAY_FALLBACK_2026}}</text>
    </svg>`,
  };

  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(uploadsDir, name);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8');
    }
  }
}

export const DEFAULT_RAY_REPOSITORIES: RepositoryConfig[] = [
  {
    id: 'repo-rayapp',
    projectId: 'proj-ray',
    projectName: 'Ray',
    name: 'rayapp',
    description: 'Core Ray client application, user portal workflows, and core service integration.',
    remoteUrl: 'https://git.ray.internal/ray/rayapp.git',
    localFolderPath: 'rayapp',
    defaultBaseBranch: 'development',
    defaultDevBranch: 'development',
    cloudTargetName: 'ray-cloud-app',
    cloudTargetType: 'Branch',
    defaultWorkflowMode: 'PR-Based',
  },
  {
    id: 'repo-raydashboard',
    projectId: 'proj-ray',
    projectName: 'Ray',
    name: 'raydashboard',
    description: 'Frontend analytics, Grafana security panel configurations, and SSL/TLS profile management UI.',
    remoteUrl: 'https://git.ray.internal/ray/raydashboard.git',
    localFolderPath: 'raydashboard',
    defaultBaseBranch: 'development2',
    defaultDevBranch: 'development2',
    cloudTargetName: 'cloud-release-main',
    cloudTargetType: 'Branch',
    defaultWorkflowMode: 'PR-Based',
  },
  {
    id: 'repo-raydashboard-power-btn-fix',
    projectId: 'proj-ray',
    projectName: 'Ray',
    name: 'raydashboard-power-btn-fix',
    description: 'Dedicated workspace folder for dashboard power button state & control hotfix.',
    remoteUrl: 'https://git.ray.internal/ray/raydashboard.git',
    localFolderPath: 'raydashboard-power-btn-fix',
    defaultBaseBranch: 'development2',
    defaultDevBranch: 'development2',
    cloudTargetName: 'cloud-release-main',
    cloudTargetType: 'Branch',
    defaultWorkflowMode: 'PR-Based',
  },
  {
    id: 'repo-raygateway',
    projectId: 'proj-ray',
    projectName: 'Ray',
    name: 'raygateway',
    description: 'Edge API gateway, routing middleware, TLS termination, and request authentication.',
    remoteUrl: 'https://git.ray.internal/ray/raygateway.git',
    localFolderPath: 'raygateway',
    defaultBaseBranch: 'development',
    defaultDevBranch: 'development',
    cloudTargetName: 'ray-cloud-gateway',
    cloudTargetType: 'Deployment Environment',
    defaultWorkflowMode: 'PR-Based',
  },
  {
    id: 'repo-rayhubapp',
    projectId: 'proj-ray',
    projectName: 'Ray',
    name: 'rayhubapp',
    description: 'Central service hub coordinating API gateway routes, profile schemas, and timeseries query aggregation.',
    remoteUrl: 'https://git.ray.internal/ray/rayhubapp.git',
    localFolderPath: 'rayhubapp',
    defaultBaseBranch: 'development',
    defaultDevBranch: 'development',
    cloudTargetName: 'ray-cloud-staging',
    cloudTargetType: 'Deployment Environment',
    defaultWorkflowMode: 'PR-Based',
  },
  {
    id: 'repo-rayhubdashboard',
    projectId: 'proj-ray',
    projectName: 'Ray',
    name: 'rayhubdashboard',
    description: 'Hub administration dashboard, tenant telemetry monitoring, and cluster controls.',
    remoteUrl: 'https://git.ray.internal/ray/rayhubdashboard.git',
    localFolderPath: 'rayhubdashboard',
    defaultBaseBranch: 'development',
    defaultDevBranch: 'development',
    cloudTargetName: 'ray-hub-release',
    cloudTargetType: 'Branch',
    defaultWorkflowMode: 'PR-Based',
  },
  {
    id: 'repo-rayjobapp',
    projectId: 'proj-ray',
    projectName: 'Ray',
    name: 'rayjobapp',
    description: 'Worker daemon and template processor mapping SSL/TLS certificate placeholders into runtime nginx/envoy configs.',
    remoteUrl: 'https://git.ray.internal/ray/rayjobapp.git',
    localFolderPath: 'rayjobapp',
    defaultBaseBranch: 'development',
    defaultDevBranch: 'development',
    cloudTargetName: 'ray-cloud-workers',
    cloudTargetType: 'Deployment Environment',
    defaultWorkflowMode: 'Direct Merge',
  },
];

export function createInitialSeedData(): {
  projects: ProjectConfig[];
  repositories: RepositoryConfig[];
  tasks: TaskRecord[];
  timeEntries: TimeEntry[];
  activity: ActivityItem[];
  workNotes: WorkNote[];
  settings: WorkspaceSettings;
} {
  const projects: ProjectConfig[] = [
    {
      id: 'proj-ray',
      name: 'Ray',
      description: 'Core Ray platform: security observability dashboards, hub management APIs, and background certificate/job orchestration.',
      leadName: 'Mihir Rathod',
      createdAt: '2026-10-01T09:00:00.000Z',
    },
  ];

  const repositories: RepositoryConfig[] = DEFAULT_RAY_REPOSITORIES.map((r) => ({ ...r }));

  // Task 1: Reordering Grafana security panels
  const t1Stages = createDefaultGitStages(
    't1-repo1',
    'development2',
    'RAY-MIHIR-Security-Graphs',
    'development2',
    'cloud-release-main',
    'PR-Based'
  );
  // Mark stages 1..8 as Completed (manually recorded), awaiting PR/merge
  for (const s of t1Stages) {
    if (s.stepNumber <= 8) {
      s.status = 'Completed';
      s.completedAt = '2026-10-20T14:20:00.000Z';
      if (s.stageKey === 'commit_locally') {
        s.referenceValue = '7c4b91e';
        s.notes = 'Illustrative sample record: committed gridPos y-axis reordering locally';
      }
      if (s.stageKey === 'push_remote') {
        s.referenceValue = 'origin/RAY-MIHIR-Security-Graphs';
        s.notes = 'Illustrative sample record: pushed working branch for review';
      }
    } else if (s.stepNumber === 9) {
      s.status = 'In Progress';
      s.notes = 'Sample PR #418 drafted targeting development2';
      s.referenceValue = 'https://git.ray.internal/ray/raydashboard/pulls/418';
    }
  }

  // Task 2: Improving graph loading behavior
  const t2StagesDash = createDefaultGitStages(
    't2-repo1',
    'development2',
    'RAY-MIHIR-Security-Graphs',
    'development2',
    'cloud-release-main',
    'PR-Based'
  );
  for (const s of t2StagesDash) {
    if (s.stepNumber <= 6) {
      s.status = 'Completed';
      s.completedAt = '2026-10-21T07:15:00.000Z';
    } else if (s.stepNumber === 7) {
      s.status = 'In Progress';
      s.notes = 'Verifying query debounce batching before local commit';
    }
  }
  const t2StagesHub = createDefaultGitStages(
    't2-repo2',
    'development',
    'RAY-MIHIR-Security-Graphs',
    'development',
    'ray-cloud-staging',
    'PR-Based'
  );
  for (const s of t2StagesHub) {
    if (s.stepNumber <= 5) {
      s.status = 'Completed';
      s.completedAt = '2026-10-21T06:45:00.000Z';
    }
  }

  // Task 3: Adding an SSL/TLS "Website certificate key" dropdown
  const t3StagesDash = createDefaultGitStages(
    't3-repo1',
    'development',
    'RAY-MIHIR-SSL-TLS-ADD-PROFILE',
    'development',
    'cloud-release-main',
    'PR-Based'
  );
  for (const s of t3StagesDash) {
    if (s.stepNumber <= 7) {
      s.status = 'Completed';
      s.completedAt = '2026-10-20T16:40:00.000Z';
      if (s.stageKey === 'commit_locally') {
        s.referenceValue = 'e39a10f';
        s.notes = 'Sample commit: added Website certificate key dropdown in SSL/TLS Add Profile modal';
      }
    }
  }
  const t3StagesHub = createDefaultGitStages(
    't3-repo2',
    'development',
    'RAY-MIHIR-SSL-TLS-ADD-PROFILE',
    'development',
    'ray-cloud-staging',
    'PR-Based'
  );
  for (const s of t3StagesHub) {
    if (s.stepNumber <= 7) {
      s.status = 'Completed';
      s.completedAt = '2026-10-20T17:10:00.000Z';
      if (s.stageKey === 'commit_locally') {
        s.referenceValue = '91b4d2c';
        s.notes = 'Sample commit: exposed /api/v1/ssl/certificate-keys enum endpoint';
      }
    }
  }

  // Task 4: Updating related placeholder mapping in rayjobapp
  const t4StagesJob = createDefaultGitStages(
    't4-repo1',
    'development',
    'RAY-MIHIR-SSL-TLS-ADD-PROFILE',
    'development',
    'ray-cloud-workers',
    'Direct Merge'
  );
  for (const s of t4StagesJob) {
    if (s.stepNumber <= 5) {
      s.status = 'Completed';
      s.completedAt = '2026-10-21T08:30:00.000Z';
    } else if (s.stepNumber === 6) {
      s.status = 'Blocked';
      s.notes = 'Illustrative sample blocker: awaiting staging vault key fixture to run integration check';
    }
  }

  const tasks: TaskRecord[] = [
    {
      id: 'demo-task-1',
      taskCode: 'MIHIR-001',
      title: 'Reorder Grafana security panels on Ray Security Overview',
      description:
        '[Illustrative Sample Record] Reorder the Grafana security panels in raydashboard so WAF Blocked Threat Vectors and TLS Handshake Health appear in the top row (y=0) above general throughput panels.',
      ticketUrl: 'https://ray.internal/browse/RAY-1401',
      assignedBy: 'Vikram Desai',
      assignedAt: '2026-10-19T04:30:00.000Z',
      priority: 'High',
      status: 'Push to Development Branch',
      dueDate: '2026-10-23T12:30:00.000Z',
      tags: ['grafana', 'security-panels', 'raydashboard', 'sample'],
      expectedOutcome:
        'Security operators immediately see WAF threat spikes and TLS handshake anomalies at the top of the dashboard without scrolling.',
      acceptanceCriteria:
        '1. WAF Threat Vectors panel at gridPos (x:0, y:0, w:12, h:8)\n2. TLS Handshake Health panel at gridPos (x:12, y:0, w:12, h:8)\n3. Throughput panels shifted cleanly to y:8 with zero panel overlap across 1440px and tablet breakpoints.',
      blockerNotes: '',
      projectName: 'Ray',
      isArchived: false,
      isDemo: true,
      createdAt: '2026-10-19T04:30:00.000Z',
      updatedAt: '2026-10-21T06:30:00.000Z',
      startedAt: '2026-10-19T05:15:00.000Z',
      completedAt: null,
      subtasks: DEFAULT_DEMO_SUBTASKS['MIHIR-001'],
      repositories: [
        {
          id: 't1-repo1',
          repositoryId: 'repo-raydashboard',
          repositoryName: 'raydashboard',
          remoteUrl: 'https://git.ray.internal/ray/raydashboard.git',
          localFolderPath: '/Users/mihir/workspace/ray/raydashboard',
          baseBranch: 'development2',
          workingBranch: 'RAY-MIHIR-Security-Graphs',
          devTargetBranch: 'development2',
          cloudTargetName: 'cloud-release-main',
          workflowMode: 'PR-Based',
          stages: t1Stages,
        },
      ],
      investigation: {
        originalRequirement:
          'Security operations requested promoting WAF Blocked Threat Vectors and TLS Handshake Failure panels to the top row of the Security Overview Grafana board.',
        actualBehavior:
          'General ingress throughput and worker queue depth occupied y=0, pushing critical WAF and TLS alert panels below the fold at y=16.',
        expectedBehavior:
          'WAF and TLS security panels render first at y=0, while secondary telemetry panels follow at y=8.',
        stepsToReproduce:
          '1. Open Ray Dashboard -> Security -> Grafana Overview on branch development2.\n2. Observe at 1440x900 viewport that security alert panels require vertical scrolling.',
        investigationNotes:
          'Inspected `src/dashboards/security/security_overview.json` and `SecurityPanelGrid.tsx`. Found that Grafana auto-pack only triggers when `y` coordinates collide; explicit `gridPos.y` values were hardcoded from an older layout.',
        rootCause:
          'Static `gridPos` coordinates in `security_overview.json` assigned `y: 16` to panel IDs 14 and 15 (`waf_threats` and `tls_handshakes`).',
        approachesConsidered:
          'Option A: Override panel order at runtime in React wrapper.\nOption B: Update canonical Grafana JSON model `gridPos` coordinates and add a unit test validating panel priority order.',
        finalSolution:
          'Updated `gridPos` coordinates in `security_overview.json` and added a layout order normalizer in `SecurityPanelGrid.tsx` to preserve responsive row heights.',
        whyChosen:
          'Option B keeps the exported Grafana JSON definition canonical while guaranteeing deterministic panel ordering.',
        limitationsFollowUp:
          'Consider adding user-customizable pinned panels in a future sprint.',
      },
      changedFiles: [
        {
          id: 'fc-demo-1',
          repositoryName: 'raydashboard',
          filePath: 'src/dashboards/security/security_overview.json',
          changeType: 'Modified',
          whatChanged: 'Updated gridPos.y from 16 to 0 for panels waf_threats and tls_handshakes; shifted throughput panels to y=8.',
          whyChanged: 'Grafana renders panels strictly by gridPos.y and gridPos.x coordinates.',
          solutionContribution: 'Promotes critical security panels to the top row of the dashboard.',
          codeSnippet: `@@ -84,7 +84,7 @@\n   "id": 14,\n   "title": "WAF Blocked Threat Vectors",\n-  "gridPos": { "h": 8, "w": 12, "x": 0, "y": 16 }\n+  "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 }`,
          relatedCommit: '7c4b91e',
          testingNotes: 'Verified JSON schema and panel collision rules.',
          createdAt: '2026-10-20T11:30:00.000Z',
        },
        {
          id: 'fc-demo-2',
          repositoryName: 'raydashboard',
          filePath: 'src/components/security/SecurityPanelGrid.tsx',
          changeType: 'Modified',
          whatChanged: 'Added sortPanelsByGridPos helper before rendering panel cards.',
          whyChanged: 'Ensures mobile/tablet single-column fallback respects the updated y/x order.',
          solutionContribution: 'Consistent ordering on both desktop 24-column grid and narrow viewports.',
          codeSnippet: `const orderedPanels = useMemo(() => [...panels].sort((a, b) => a.gridPos.y - b.gridPos.y || a.gridPos.x - b.gridPos.x), [panels]);`,
          relatedCommit: '7c4b91e',
          testingNotes: 'Checked at 1440px and 768px widths.',
          createdAt: '2026-10-20T12:10:00.000Z',
        },
      ],
      attachments: [
        {
          id: 'att-demo-1',
          fileName: 'sample-grafana-before.svg',
          originalName: 'grafana_security_panels_before.svg',
          mimeType: 'image/svg+xml',
          sizeBytes: 1842,
          url: '/uploads/sample-grafana-before.svg',
          category: 'Before',
          caption: 'Before: WAF and TLS panels buried below fold at y=16 (Sample)',
          notes: 'Captured on branch development2 prior to gridPos update.',
          linkedFileChangeId: 'fc-demo-1',
          linkedTestId: 'test-demo-1',
          uploadedAt: '2026-10-20T10:00:00.000Z',
        },
        {
          id: 'att-demo-2',
          fileName: 'sample-grafana-after.svg',
          originalName: 'grafana_security_panels_after.svg',
          mimeType: 'image/svg+xml',
          sizeBytes: 1910,
          url: '/uploads/sample-grafana-after.svg',
          category: 'After',
          caption: 'After: Security panels promoted to top row y=0 (Sample)',
          notes: 'Captured on working branch RAY-MIHIR-Security-Graphs.',
          linkedFileChangeId: 'fc-demo-1',
          linkedTestId: 'test-demo-1',
          uploadedAt: '2026-10-20T14:30:00.000Z',
        },
      ],
      tests: [
        {
          id: 'test-demo-1',
          title: 'Verify top-row placement of WAF & TLS panels at 1440px and 768px',
          testType: 'Manual',
          commandOrSteps: 'npm run dev -> Open /security/overview -> Inspect top row panels',
          expectedResult: 'WAF Blocked Threat Vectors and TLS Handshake Health appear in row 1 with no overlap.',
          actualResult: 'Both panels render cleanly at y=0; responsive single-column order matches.',
          status: 'Passed',
          testedAt: '2026-10-20T14:10:00.000Z',
          relatedAttachmentId: 'att-demo-2',
          logs: 'Grid validation passed: 0 overlapping bounding boxes.',
          blockedOrSkippedReason: '',
        },
        {
          id: 'test-demo-2',
          title: 'Dashboard JSON schema & unit test suite',
          testType: 'Unit',
          commandOrSteps: 'npm test -- src/components/security/SecurityPanelGrid.test.ts',
          expectedResult: 'All unit assertions pass',
          actualResult: '6 passed in 420ms',
          status: 'Passed',
          testedAt: '2026-10-20T14:15:00.000Z',
          relatedAttachmentId: null,
          logs: 'PASS src/components/security/SecurityPanelGrid.test.ts',
          blockedOrSkippedReason: '',
        },
      ],
    },
    {
      id: 'demo-task-2',
      taskCode: 'MIHIR-002',
      title: 'Improve security graph loading behavior and eliminate duplicate time-range queries',
      description:
        '[Illustrative Sample Record] Optimize graph loading in raydashboard and batch timeseries queries in rayhubapp so switching time ranges (1h / 6h / 24h) does not trigger redundant full-board refetches.',
      ticketUrl: 'https://ray.internal/browse/RAY-1405',
      assignedBy: 'Vikram Desai',
      assignedAt: '2026-10-19T11:00:00.000Z',
      priority: 'High',
      status: 'In Progress',
      dueDate: '2026-10-24T12:30:00.000Z',
      tags: ['performance', 'graphs', 'raydashboard', 'rayhubapp', 'sample'],
      expectedOutcome:
        'Sub-700ms initial graph load, skeleton placeholders matching exact panel heights, and cancellation of in-flight stale requests.',
      acceptanceCriteria:
        '1. AbortController cancels stale fetches when time-range selector changes rapidly.\n2. Below-the-fold panels lazy-fetch via IntersectionObserver.\n3. Batch endpoint in rayhubapp coalesces panel queries.',
      blockerNotes: '',
      projectName: 'Ray',
      isArchived: false,
      isDemo: true,
      createdAt: '2026-10-19T11:00:00.000Z',
      updatedAt: '2026-10-21T09:15:00.000Z',
      startedAt: '2026-10-20T06:00:00.000Z',
      completedAt: null,
      subtasks: DEFAULT_DEMO_SUBTASKS['MIHIR-002'],
      repositories: [
        {
          id: 't2-repo1',
          repositoryId: 'repo-raydashboard',
          repositoryName: 'raydashboard',
          remoteUrl: 'https://git.ray.internal/ray/raydashboard.git',
          localFolderPath: '/Users/mihir/workspace/ray/raydashboard',
          baseBranch: 'development2',
          workingBranch: 'RAY-MIHIR-Security-Graphs',
          devTargetBranch: 'development2',
          cloudTargetName: 'cloud-release-main',
          workflowMode: 'PR-Based',
          stages: t2StagesDash,
        },
        {
          id: 't2-repo2',
          repositoryId: 'repo-rayhubapp',
          repositoryName: 'rayhubapp',
          remoteUrl: 'https://git.ray.internal/ray/rayhubapp.git',
          localFolderPath: '/Users/mihir/workspace/ray/rayhubapp',
          baseBranch: 'development',
          workingBranch: 'RAY-MIHIR-Security-Graphs',
          devTargetBranch: 'development',
          cloudTargetName: 'ray-cloud-staging',
          workflowMode: 'PR-Based',
          stages: t2StagesHub,
        },
      ],
      investigation: {
        originalRequirement:
          'Eliminate UI freezes and slow loading spinners when opening the Security Graphs view or toggling the time window.',
        actualBehavior:
          'All 12 panels fired concurrent unbatched requests on mount and re-fired twice due to unmemoized time-range context object.',
        expectedBehavior:
          'Visible top-row panels load first in a single batched request; changing time window debounces by 150ms and aborts stale requests.',
        stepsToReproduce:
          '1. Open Network tab in DevTools on Security Graphs page.\n2. Toggle range from 1h -> 6h -> 24h quickly.\n3. Observe 36 overlapping requests and layout shift.',
        investigationNotes:
          'Profiled `useSecurityGraphData.ts` hook. Identified unstable object reference in `timeRange` prop causing double effect execution.',
        rootCause:
          'Unmemoized `timeRange` filter object combined with lack of `AbortController` cleanup and eager mounting of offscreen Grafana panels.',
        approachesConsidered:
          '1. Client-only request deduplication cache.\n2. Client AbortController + IntersectionObserver lazy mount + batched `/api/v1/metrics/batch` handler in rayhubapp.',
        finalSolution:
          'Implemented `useBatchedGraphQuery` with `AbortController` and `IntersectionObserver` in `raydashboard`, paired with batch query coalescing in `rayhubapp`.',
        whyChosen:
          'Reduces HTTP connection contention on browser and cuts backend timeseries DB round-trips by 65%.',
        limitationsFollowUp:
          'Add Redis short-TTL response cache in rayhubapp for 24h historical aggregations.',
      },
      changedFiles: [
        {
          id: 'fc-demo-3',
          repositoryName: 'raydashboard',
          filePath: 'src/hooks/useSecurityGraphData.ts',
          changeType: 'Modified',
          whatChanged: 'Added AbortController signal cleanup, 150ms debounce, and stable query key serialization.',
          whyChanged: 'Prevented duplicate requests and race conditions when switching time windows.',
          solutionContribution: 'Eliminates stale graph overwrites and cuts redundant network calls.',
          codeSnippet: `const controller = new AbortController();\nfetchBatchMetrics(stableQueryKey, { signal: controller.signal });\nreturn () => controller.abort();`,
          relatedCommit: 'pending',
          testingNotes: 'Verified with rapid 1h/6h/24h toggles in Chrome DevTools.',
          createdAt: '2026-10-21T07:00:00.000Z',
        },
        {
          id: 'fc-demo-4',
          repositoryName: 'rayhubapp',
          filePath: 'src/controllers/metricsBatchController.ts',
          changeType: 'Added',
          whatChanged: 'Created POST /api/v1/metrics/batch endpoint executing panel queries in parallel with shared DB connection.',
          whyChanged: 'Single HTTP round-trip for visible security panels.',
          solutionContribution: 'Reduces p95 dashboard load time from 2.8s to 640ms.',
          codeSnippet: `export async function handleBatchMetrics(req: Request, res: Response) {\n  const { panelIds, from, to } = req.body;\n  // coalesced query execution\n}`,
          relatedCommit: 'pending',
          testingNotes: 'Unit tested with 8 concurrent panel IDs.',
          createdAt: '2026-10-21T07:30:00.000Z',
        },
      ],
      attachments: [],
      tests: [
        {
          id: 'test-demo-3',
          title: 'Rapid time-range toggle AbortController cancellation test',
          testType: 'Unit',
          commandOrSteps: 'npm test -- useSecurityGraphData.test.ts',
          expectedResult: 'Previous in-flight request is aborted when range changes within 150ms',
          actualResult: 'AbortError caught cleanly; only latest range state committed',
          status: 'Passed',
          testedAt: '2026-10-21T08:00:00.000Z',
          relatedAttachmentId: null,
          logs: 'PASS src/hooks/useSecurityGraphData.test.ts (4 tests)',
          blockedOrSkippedReason: '',
        },
      ],
    },
    {
      id: 'demo-task-3',
      taskCode: 'MIHIR-003',
      title: 'Add SSL/TLS "Website certificate key" dropdown in Add Profile flow',
      description:
        '[Illustrative Sample Record] Add a validated "Website certificate key" dropdown field to the SSL/TLS Add Profile modal in raydashboard, populated from the available certificate key aliases in rayhubapp.',
      ticketUrl: 'https://ray.internal/browse/RAY-1412',
      assignedBy: 'Neha Sharma',
      assignedAt: '2026-10-18T10:00:00.000Z',
      priority: 'Urgent',
      status: 'Monitor Logs & Process',
      dueDate: '2026-10-22T12:30:00.000Z',
      tags: ['ssl-tls', 'dropdown', 'raydashboard', 'rayhubapp', 'sample'],
      expectedOutcome:
        'Users configuring an SSL/TLS profile select a valid Website certificate key from a dropdown instead of typing raw placeholder strings.',
      acceptanceCriteria:
        '1. Dropdown lists active certificate keys with algorithm metadata (RSA-4096 / ECDSA-P256).\n2. Form validation prevents saving an SSL/TLS profile without a valid Website certificate key.\n3. Selected key persists in profile payload sent to rayhubapp.',
      blockerNotes: '',
      projectName: 'Ray',
      isArchived: false,
      isDemo: true,
      createdAt: '2026-10-18T10:00:00.000Z',
      updatedAt: '2026-10-21T05:00:00.000Z',
      startedAt: '2026-10-18T11:30:00.000Z',
      completedAt: null,
      subtasks: DEFAULT_DEMO_SUBTASKS['MIHIR-003'],
      repositories: [
        {
          id: 't3-repo1',
          repositoryId: 'repo-raydashboard',
          repositoryName: 'raydashboard',
          remoteUrl: 'https://git.ray.internal/ray/raydashboard.git',
          localFolderPath: '/Users/mihir/workspace/ray/raydashboard',
          baseBranch: 'development',
          workingBranch: 'RAY-MIHIR-SSL-TLS-ADD-PROFILE',
          devTargetBranch: 'development',
          cloudTargetName: 'cloud-release-main',
          workflowMode: 'PR-Based',
          stages: t3StagesDash,
        },
        {
          id: 't3-repo2',
          repositoryId: 'repo-rayhubapp',
          repositoryName: 'rayhubapp',
          remoteUrl: 'https://git.ray.internal/ray/rayhubapp.git',
          localFolderPath: '/Users/mihir/workspace/ray/rayhubapp',
          baseBranch: 'development',
          workingBranch: 'RAY-MIHIR-SSL-TLS-ADD-PROFILE',
          devTargetBranch: 'development',
          cloudTargetName: 'ray-cloud-staging',
          workflowMode: 'PR-Based',
          stages: t3StagesHub,
        },
      ],
      investigation: {
        originalRequirement:
          'Provide a "Website certificate key" dropdown in the SSL/TLS Add/Edit Profile dialog so admins can bind a certificate key alias without syntax errors.',
        actualBehavior:
          'The Add Profile form lacked a structured selector for the Website certificate key, causing mismatches with downstream worker placeholders.',
        expectedBehavior:
          'Dropdown fetches registered key aliases from rayhubapp and stores the canonical placeholder token (e.g. `{{CERT_KEY_RAY_EDGE_RSA4096}}`).',
        stepsToReproduce:
          '1. Go to Security -> SSL/TLS Profiles -> Add Profile.\n2. Observe missing Website certificate key selector.',
        investigationNotes:
          'Checked `SslTlsProfileModal.tsx` in `raydashboard` and `sslProfileSchema.ts` in `rayhubapp`. Added field `websiteCertificateKey` to both form state and API payload.',
        rootCause:
          'When SSL/TLS profile creation was originally built, only the public certificate chain field was included in the modal schema.',
        approachesConsidered:
          'Static client enum vs dynamic API-driven key catalog from `rayhubapp`.',
        finalSolution:
          'Added `/api/v1/ssl/certificate-keys` in `rayhubapp` and wired an accessible `<select>` dropdown with search/filter support in `SslTlsProfileModal.tsx`.',
        whyChosen:
          'Dynamic catalog ensures newly rotated keys appear without a frontend rebuild.',
        limitationsFollowUp:
          'Coordinate placeholder expansion in `rayjobapp` (tracked in MIHIR-004).',
      },
      changedFiles: [
        {
          id: 'fc-demo-5',
          repositoryName: 'raydashboard',
          filePath: 'src/features/ssl/SslTlsProfileModal.tsx',
          changeType: 'Modified',
          whatChanged: 'Added Website certificate key dropdown control, validation state, and error message.',
          whyChanged: 'Required by user story to select certificate key during profile creation.',
          solutionContribution: 'Prevents invalid key aliases at form submission time.',
          codeSnippet: `<label htmlFor="websiteCertificateKey">Website certificate key</label>\n<select id="websiteCertificateKey" value={form.websiteCertificateKey} onChange={handleKeyChange}>...</select>`,
          relatedCommit: 'e39a10f',
          testingNotes: 'Tested empty submission validation and keyboard selection.',
          createdAt: '2026-10-20T15:00:00.000Z',
        },
        {
          id: 'fc-demo-6',
          repositoryName: 'rayhubapp',
          filePath: 'src/routes/sslCertificateKeys.ts',
          changeType: 'Added',
          whatChanged: 'Exposed GET /api/v1/ssl/certificate-keys returning registered key metadata.',
          whyChanged: 'Supplies the frontend dropdown with valid placeholder identifiers.',
          solutionContribution: 'Ensures single source of truth between hub and job workers.',
          codeSnippet: `router.get('/certificate-keys', requireAuth, listRegisteredCertificateKeys);`,
          relatedCommit: '91b4d2c',
          testingNotes: 'Verified 200 response payload schema.',
          createdAt: '2026-10-20T16:00:00.000Z',
        },
      ],
      attachments: [
        {
          id: 'att-demo-3',
          fileName: 'sample-ssl-before.svg',
          originalName: 'ssl_tls_modal_before.svg',
          mimeType: 'image/svg+xml',
          sizeBytes: 1210,
          url: '/uploads/sample-ssl-before.svg',
          category: 'Before',
          caption: 'Before: SSL/TLS Add Profile modal without Website certificate key dropdown (Sample)',
          notes: 'Illustrative screenshot before adding dropdown selector.',
          linkedFileChangeId: 'fc-demo-5',
          linkedTestId: 'test-demo-4',
          uploadedAt: '2026-10-20T14:50:00.000Z',
        },
        {
          id: 'att-demo-4',
          fileName: 'sample-ssl-after.svg',
          originalName: 'ssl_tls_modal_after.svg',
          mimeType: 'image/svg+xml',
          sizeBytes: 1490,
          url: '/uploads/sample-ssl-after.svg',
          category: 'After',
          caption: 'After: SSL/TLS Add Profile modal with validated Website certificate key dropdown (Sample)',
          notes: 'Illustrative screenshot on branch RAY-MIHIR-SSL-TLS-ADD-PROFILE.',
          linkedFileChangeId: 'fc-demo-5',
          linkedTestId: 'test-demo-4',
          uploadedAt: '2026-10-20T17:20:00.000Z',
        },
      ],
      tests: [
        {
          id: 'test-demo-4',
          title: 'Validate Website certificate key dropdown selection & required field error',
          testType: 'Manual',
          commandOrSteps: 'Open SSL/TLS Add Profile -> Submit empty -> Select {{CERT_KEY_RAY_EDGE_RSA4096}} -> Save',
          expectedResult: 'Empty submit shows inline validation error; selecting key saves profile payload.',
          actualResult: 'Inline validation and payload persistence verified.',
          status: 'Passed',
          testedAt: '2026-10-20T17:30:00.000Z',
          relatedAttachmentId: 'att-demo-4',
          logs: 'POST /api/v1/ssl/profiles 201 Created',
          blockedOrSkippedReason: '',
        },
      ],
    },
    {
      id: 'demo-task-4',
      taskCode: 'MIHIR-004',
      title: 'Update SSL/TLS placeholder mapping in rayjobapp for Website certificate key',
      description:
        '[Illustrative Sample Record] Update the template placeholder resolver in rayjobapp so the newly added `websiteCertificateKey` token from SSL/TLS profiles maps accurately during job execution.',
      ticketUrl: 'https://ray.internal/browse/RAY-1413',
      assignedBy: 'Neha Sharma',
      assignedAt: '2026-10-20T08:00:00.000Z',
      priority: 'Urgent',
      status: 'Todo',
      dueDate: '2026-10-22T18:00:00.000Z',
      tags: ['ssl-tls', 'placeholder-mapping', 'rayjobapp', 'sample'],
      expectedOutcome:
        'Background deployment jobs resolve `{{WEBSITE_CERT_KEY}}` and profile key tokens without unresolved placeholder errors.',
      acceptanceCriteria:
        '1. `ssl_placeholder_mapper.ts` maps `profile.websiteCertificateKey` to the runtime key path.\n2. Unknown or revoked key tokens fail fast with a structured diagnostic log.\n3. End-to-end job dry-run passes against staging vault.',
      blockerNotes:
        'Illustrative sample blocker: Waiting on staging HashiCorp Vault test fixture token to run the live integration verification check.',
      projectName: 'Ray',
      isArchived: false,
      isDemo: true,
      createdAt: '2026-10-20T08:00:00.000Z',
      updatedAt: '2026-10-21T09:45:00.000Z',
      startedAt: '2026-10-20T09:30:00.000Z',
      completedAt: null,
      subtasks: DEFAULT_DEMO_SUBTASKS['MIHIR-004'],
      repositories: [
        {
          id: 't4-repo1',
          repositoryId: 'repo-rayjobapp',
          repositoryName: 'rayjobapp',
          remoteUrl: 'https://git.ray.internal/ray/rayjobapp.git',
          localFolderPath: '/Users/mihir/workspace/ray/rayjobapp',
          baseBranch: 'development',
          workingBranch: 'RAY-MIHIR-SSL-TLS-ADD-PROFILE',
          devTargetBranch: 'development',
          cloudTargetName: 'ray-cloud-workers',
          workflowMode: 'Direct Merge',
          stages: t4StagesJob,
        },
      ],
      investigation: {
        originalRequirement:
          'Ensure `rayjobapp` resolves the new `websiteCertificateKey` field introduced in `RAY-MIHIR-SSL-TLS-ADD-PROFILE` when generating edge proxy TLS configurations.',
        actualBehavior:
          '`rayjobapp` only mapped ` {{SSL_CERT_CHAIN}} ` and ignored `websiteCertificateKey`, leaving `{{WEBSITE_CERT_KEY}}` unexpanded in generated worker configs.',
        expectedBehavior:
          '`sslPlaceholderMapper` resolves `websiteCertificateKey` against the worker key registry and writes the resolved path.',
        stepsToReproduce:
          '1. Trigger job `sync_ssl_profile` with payload containing `websiteCertificateKey`.\n2. Inspect rendered template output in worker logs.',
        investigationNotes:
          'Traced `src/jobs/sslPlaceholderMapper.ts` and `src/templates/edgeTlsConfig.tpl`. Added key token lookup and fallback validation.',
        rootCause:
          '`PLACEHOLDER_TOKEN_MAP` dictionary in `sslPlaceholderMapper.ts` did not include an entry for `websiteCertificateKey`.',
        approachesConsidered:
          'Regex string replacement vs typed AST placeholder dictionary with strict validation.',
        finalSolution:
          'Extended `PLACEHOLDER_TOKEN_MAP` in `sslPlaceholderMapper.ts` with strict key existence validation before writing config files.',
        whyChosen:
          'Typed dictionary prevents partial template writes if a key alias is missing.',
        limitationsFollowUp:
          'Once staging Vault token is unblocked, complete integration check and merge into `development`.',
      },
      changedFiles: [
        {
          id: 'fc-demo-7',
          repositoryName: 'rayjobapp',
          filePath: 'src/jobs/sslPlaceholderMapper.ts',
          changeType: 'Modified',
          whatChanged: 'Added `{{WEBSITE_CERT_KEY}}` mapping and key alias resolver in `resolveSslPlaceholders()`.',
          whyChanged: 'Connects the new dropdown selection from raydashboard/rayhubapp to actual worker config generation.',
          solutionContribution: 'Completes end-to-end SSL/TLS profile key binding in rayjobapp.',
          codeSnippet: `export const PLACEHOLDER_TOKEN_MAP = {\n  '{{SSL_CERT_CHAIN}}': (p: SslProfile) => p.certificateChainPath,\n  '{{WEBSITE_CERT_KEY}}': (p: SslProfile) => resolveKeyAliasPath(p.websiteCertificateKey),\n};`,
          relatedCommit: 'pending',
          testingNotes: 'Unit test passed; staging Vault integration test currently blocked.',
          createdAt: '2026-10-21T08:15:00.000Z',
        },
      ],
      attachments: [],
      tests: [
        {
          id: 'test-demo-5',
          title: 'Unit test placeholder token resolution for {{WEBSITE_CERT_KEY}}',
          testType: 'Unit',
          commandOrSteps: 'npm test -- src/jobs/sslPlaceholderMapper.test.ts',
          expectedResult: 'Maps {{CERT_KEY_RAY_EDGE_RSA4096}} to /etc/ray/certs/edge_rsa4096.key',
          actualResult: 'All 5 unit test cases passed.',
          status: 'Passed',
          testedAt: '2026-10-21T08:25:00.000Z',
          relatedAttachmentId: null,
          logs: 'PASS src/jobs/sslPlaceholderMapper.test.ts',
          blockedOrSkippedReason: '',
        },
        {
          id: 'test-demo-6',
          title: 'End-to-end worker dry-run against staging Vault key store',
          testType: 'Integration',
          commandOrSteps: 'RAY_ENV=staging npm run job:verify-ssl-mapper',
          expectedResult: 'Worker fetches key metadata from staging Vault and writes dry-run config',
          actualResult: 'Connection refused on staging Vault sandbox (maintenance window)',
          status: 'Blocked',
          testedAt: '2026-10-21T08:40:00.000Z',
          relatedAttachmentId: null,
          logs: 'Error: ECONNREFUSED 10.24.8.19:8200 — Staging Vault sandbox maintenance',
          blockedOrSkippedReason: 'Staging Vault sandbox is undergoing scheduled certificate rotation until 18:00 IST.',
        },
      ],
    },
  ];

  const timeEntries: TimeEntry[] = [
    {
      id: 'te-demo-1',
      taskId: 'demo-task-1',
      taskCode: 'MIHIR-001',
      taskTitle: 'Reorder Grafana security panels on Ray Security Overview',
      startedAt: '2026-10-20T09:30:00.000Z',
      endedAt: '2026-10-20T11:45:00.000Z',
      durationMinutes: 135,
      notes: 'Audited security_overview.json gridPos coordinates and updated top row layout.',
      isManual: false,
    },
    {
      id: 'te-demo-2',
      taskId: 'demo-task-3',
      taskCode: 'MIHIR-003',
      taskTitle: 'Add SSL/TLS "Website certificate key" dropdown in Add Profile flow',
      startedAt: '2026-10-20T14:00:00.000Z',
      endedAt: '2026-10-20T17:10:00.000Z',
      durationMinutes: 190,
      notes: 'Implemented Website certificate key dropdown in raydashboard and enum endpoint in rayhubapp.',
      isManual: false,
    },
    {
      id: 'te-demo-3',
      taskId: 'demo-task-2',
      taskCode: 'MIHIR-002',
      taskTitle: 'Improve security graph loading behavior and eliminate duplicate time-range queries',
      startedAt: '2026-10-21T05:30:00.000Z',
      endedAt: '2026-10-21T07:45:00.000Z',
      durationMinutes: 135,
      notes: 'Added AbortController cleanup and batched metrics endpoint in rayhubapp.',
      isManual: false,
    },
    {
      id: 'te-demo-4',
      taskId: 'demo-task-4',
      taskCode: 'MIHIR-004',
      taskTitle: 'Update SSL/TLS placeholder mapping in rayjobapp for Website certificate key',
      startedAt: '2026-10-21T08:00:00.000Z',
      endedAt: '2026-10-21T09:15:00.000Z',
      durationMinutes: 75,
      notes: 'Updated PLACEHOLDER_TOKEN_MAP in rayjobapp and wrote unit tests.',
      isManual: true,
    },
  ];

  const activity: ActivityItem[] = [
    {
      id: 'act-demo-1',
      taskId: 'demo-task-1',
      taskCode: 'MIHIR-001',
      actionType: 'git',
      summary: 'Recorded local commit 7c4b91e and remote push on raydashboard (RAY-MIHIR-Security-Graphs)',
      details: 'Manually recorded Git stages 1-8 for MIHIR-001.',
      timestamp: '2026-10-20T14:25:00.000Z',
    },
    {
      id: 'act-demo-2',
      taskId: 'demo-task-3',
      taskCode: 'MIHIR-003',
      actionType: 'attachment',
      summary: 'Attached Before & After screenshots for SSL/TLS Website certificate key dropdown',
      details: 'Uploaded ssl_tls_modal_before.svg and ssl_tls_modal_after.svg',
      timestamp: '2026-10-20T17:22:00.000Z',
    },
    {
      id: 'act-demo-3',
      taskId: 'demo-task-2',
      taskCode: 'MIHIR-002',
      actionType: 'file',
      summary: 'Documented 2 changed files across raydashboard and rayhubapp',
      details: 'useSecurityGraphData.ts and metricsBatchController.ts',
      timestamp: '2026-10-21T07:35:00.000Z',
    },
    {
      id: 'act-demo-4',
      taskId: 'demo-task-4',
      taskCode: 'MIHIR-004',
      actionType: 'test',
      summary: 'Marked integration check as Blocked on MIHIR-004 (Staging Vault maintenance)',
      details: 'Unit test passed; integration test blocked awaiting Vault fixture.',
      timestamp: '2026-10-21T08:42:00.000Z',
    },
  ];

  const workNotes: WorkNote[] = [
    {
      id: 'wn-demo-1',
      taskId: 'demo-task-3',
      taskCode: 'MIHIR-003',
      title: 'SSL/TLS Certificate Key Placeholder Convention',
      content:
        'Confirmed with Neha that all certificate key aliases in `rayhubapp` follow the `{{CERT_KEY_<ENV>_<ALGO>}}` format and are resolved by `rayjobapp` worker daemons prior to reloading edge proxies.',
      tags: ['ssl-tls', 'architecture'],
      createdAt: '2026-10-20T15:30:00.000Z',
    },
    {
      id: 'wn-demo-2',
      taskId: 'demo-task-1',
      taskCode: 'MIHIR-001',
      title: 'Grafana 24-Column Grid Coordinate Reference',
      content:
        'Top priority security panels in `raydashboard` use `w: 12, h: 8` at `y: 0` (`x: 0` and `x: 12`). Secondary throughput rows start at `y: 8`.',
      tags: ['grafana', 'raydashboard'],
      createdAt: '2026-10-20T11:00:00.000Z',
    },
  ];

  const settings: WorkspaceSettings = {
    theme: 'dark',
    timezone: 'Asia/Kolkata',
    cloudTargetLabel: 'Cloud / Release Target',
    defaultWorkflowMode: 'PR-Based',
    maxAttachmentSizeMB: 10,
    requiredCompletionChecks: {
      requireAllTestsPassedOrSkipped: true,
      requireNoBlockedTests: true,
      requireGitCommitAndPush: true,
      requireDevMerge: true,
      requireRootCauseAndSolution: true,
    },
    tags: [
      'grafana',
      'security-panels',
      'performance',
      'graphs',
      'ssl-tls',
      'dropdown',
      'placeholder-mapping',
      'raydashboard',
      'rayhubapp',
      'rayjobapp',
      'bugfix',
      'feature',
    ],
    activeTimer: null,
  };

  return {
    projects,
    repositories,
    tasks,
    timeEntries,
    activity,
    workNotes,
    settings,
  };
}
