# Browser-free workspace access

The command-line client uses the same Express API and SQLite database as the
website. No browser, cloud account, new network listener, or direct database edits
are needed. Keep `npm run dev` running in the application directory. The server
requires Node 22, as before.

From the application directory:

```bash
npm run workspace -- status
npm run workspace -- tasks
npm run workspace -- repositories
npm run workspace -- show MIHIR-001
npm run workspace -- notes
npm run workspace -- time
npm run workspace -- activity
npm run workspace -- focus
```

The script also works from any other directory:

```bash
node /home/mihir-rathod/antigravity/MIHIR-Workspace/scripts/workspace.mjs status
```

To create a task, save a JSON file and pass its filename:

```json
{
  "title": "Improve WAN dashboard panels",
  "description": "Match the compact Security panel styling.",
  "status": "In Progress",
  "selectedRepoConfigs": [{
    "repositoryId": "raydashboard-power-btn-fix",
    "workingBranch": "RAY-MIHIR-DASHBOARD-WAN"
  }]
}
```

```bash
npm run workspace -- create task.json
npm run workspace -- update MIHIR-001 update.json
npm run workspace -- note note.json
npm run workspace -- log-time MIHIR-001 time.json
```

`update.json` contains only fields to change, such as `{"status":"In Progress"}`.
`note.json` contains `title`, `content`, and optionally `taskId` (ID or task code).
`time.json` contains `durationMinutes` (a number of at least 1) and optional `notes`.
Use a repository ID or name from `repositories` for task repository configuration.
Use `-` instead of a filename to read JSON from stdin. Writes print the saved
record, and task writes use the server's existing activity logging.

Commands fail on missing/ambiguous tasks, invalid JSON, server errors, or an
unavailable server. They never retry writes automatically. If a request times out,
read the workspace before retrying to avoid duplicate records. An open website
may need a refresh to display changes made by the client.

`MIHIR_WORKSPACE_URL` can select another loopback HTTP port; external hosts and
redirects are rejected. The local client retains its loopback-only restriction. Set MIHIR_WORKSPACE_PASSWORD in your shell to authenticate with the workspace password screen; the session cookie stays in this process. Never pass the password as a command-line argument.

Agents can use this client when asked to manage the workspace. This is a local
command-line integration, not a registered MCP connector, and does not run in the
background or automatically log work from other chats.
