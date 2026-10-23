# MIHIR Workspace — Personal Developer Task Tracker & Engineering Journal

**MIHIR Workspace** is a personal developer work journal, multi-repository task tracker, and Git/release workflow verification log built for daily engineering work on the **Ray** project (`raydashboard`, `rayhubapp`, `rayjobapp`).

## 1. Architecture & Persistent Storage

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons (`MIHIR/src/`).
- **Backend:** Express + Node.js (`server.ts` and `MIHIR/server/apiRouter.ts`).
- **Database:** Built-in Node SQLite (`node:sqlite` `DatabaseSync` with WAL mode) stored persistently on disk at:
  - **SQLite Database Path:** `MIHIR/data/mihir_workspace.sqlite`
- **Uploaded Attachments & Screenshots:** Stored as binary files on disk and served at `/uploads/*` from:
  - **Uploads Directory Path:** `MIHIR/uploads/`
- **Local Preferences:** Theme preference (`light` / `dark`) is synced to both `localStorage` (`mihir_theme`) and the SQLite `workspace_settings` table.

---

## 2. Installation & Startup Commands

From the workspace root directory:

```bash
# 1. Install dependencies
npm install

# 2. Start the full-stack server (Express API + SQLite + Vite UI on port 3000)
npm run dev
```

Open **`http://localhost:3000`** in your browser.

### Running Unit Tests & Type Verification

```bash
# Run unit tests for core workspace logic, readiness gates, and search/filtering
npm test
# or directly:
tsx --test MIHIR/src/lib/workspaceLogic.test.ts

# Run TypeScript type checking
npm run lint

# Build production bundle
npm run build
```

---

## 3. Backup & Restore Instructions

### Exporting a Complete Backup
1. Navigate to **Settings** in the left sidebar.
2. Under **Complete Backup Export & Validated Restore**, click **Export Full Backup (.json + Attachments)**.
3. A single `.json` bundle (`mihir-workspace-backup-YYYY-MM-DD.json`) will download containing:
   - All tasks, multi-repository branch configurations, 14-stage Git workflows, problem/investigation notes, changed file records, and test records.
   - All projects, repository configurations, work sessions, activity logs, and settings.
   - Base64-encoded binary contents of every uploaded screenshot/attachment in `MIHIR/uploads/`.

### Restoring from a Backup
1. Navigate to **Settings** -> **Restore from Backup File**.
2. Choose your **Duplicate Task ID Handling Policy**:
   - **Overwrite:** Replaces existing tasks of the same ID with the backup version.
   - **Skip:** Preserves existing tasks and only imports missing tasks.
   - **Duplicate:** Imports colliding tasks as fresh `MIHIR-XXX` copies.
3. Click **Select Backup JSON to Restore** and select your `.json` backup file. All structured records are written to `MIHIR/data/mihir_workspace.sqlite` and all embedded attachments are written back to `MIHIR/uploads/`.

### Exporting a Readable Task Report
- Open any task and click **Export Report (.md)** in the top-right header to download a clean Markdown engineering report suitable for pull requests, post-mortems, or team handoffs.

## Hosted cloud database and workspace unlock

The app now checks the workspace password on the server and uses an HTTP-only, SameSite session cookie for up to 12 hours. The requested initial password is configured as a server-side digest. It is not included in the browser bundle. The password protects workspace API reads, writes, backups and attachment downloads. The local terminal runner retains its separate pairing token and hidden interactive sudo prompt. The workspace password is never supplied to sudo.

Vercel no longer uses temporary in-memory SQLite. Create a libSQL-compatible database in your Turso account, then add these **server-side** variables to the existing Vercel project before deploying this change:

| Variable | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | Database connection URL from Turso (`libsql://…` or HTTPS) |
| `TURSO_AUTH_TOKEN` | Database read/write token from Turso |
| `WORKSPACE_SESSION_SECRET` | Random value of at least 32 characters, generated once and shared by all instances |
| `WORKSPACE_PASSWORD_SHA256` | Optional SHA-256 digest if you want to override the initial password |

Generate the session secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Save it directly in Vercel's environment settings. Keep database tokens and the session secret out of browser code, screenshots and Git. Configure separate databases for Preview and Production if both environments are used. Rebuild/redeploy the frontend and API together after adding the variables. Missing database configuration returns an explicit 503; it never reports temporary memory as persistent storage. Missing or short hosted session secrets prevent login.

After unlocking, check **Settings** or **Scripts** for the database status, backed by `GET /api/health/database`. Successful status means a real SQL query completed against the selected database. Live cloud activation still requires your account configuration; local tests cannot verify a remote database that has not been provisioned. See [Turso's SDK reference](https://docs.turso.tech/sdk/ts/reference) and [Vercel environment settings](https://vercel.com/docs/environment-variables).

Local installs retain `MIHIR/data/mihir_workspace.sqlite`. `MIHIR_DATA_DIR` and `MIHIR_UPLOADS_DIR` override their directories. Only set `MIHIR_USE_CLOUD_DB=true` locally if you intend to use the same cloud records; there is no automatic merge between local SQLite and the remote database. To migrate existing data, export a complete backup from the local app's Settings, unlock the deployed app, and restore that backup there using the desired duplicate policy. Uploaded file content is stored in the persistent database and downloaded through authenticated `/api/attachments/…` routes. Old uploaded files are included by the existing backup exporter. Backup coverage remains tasks, projects, repositories, time entries, work notes, activity, settings and referenced attachments; daily focus and AI chat history are not included in that existing format.

Google sign-in remains optional summary sync and is separate from the full workspace database. A new cloud database starts without illustrative tasks. Tasks and uploads are durable after the cloud connection is configured. Scripts, machine paths and terminal output remain on your computer.

The local browser-free CLI accepts `MIHIR_WORKSPACE_PASSWORD` as an environment variable and keeps its session only in memory. Its loopback-only restriction is unchanged. Login throttling is per process; use Vercel's firewall rate limits for a shared deployment-wide limit if needed.

### Ray pods and ports

**Scripts → Ray job · Pods & ports → Inspect ports** exports the configured kubeconfig, lists matching pods, displays declared container ports, service/target/node ports and endpoints. Defaults use `/home/mihir-rathod/TEMP/k8s-readonly-user-raylife`, namespace `default`, and prefix `ray-job-service`. The action does not modify Kubernetes or start port forwarding. Service and endpoint queries require read permissions in addition to pod access. Kubernetes may warn that the legacy Endpoints API is deprecated; its output remains visible in the terminal.

Use the shortcut's settings button to change the base directory, namespace, prefix or **Run as root using sudo**. The output prints the real working directory. Sudo asks for your operating-system password in the web terminal; there is no need to run the entire app as root or use an interactive `sudo su` shell. Live log shortcuts remain available for job, hub and controller services, with up to three non-root sessions.

Verification commands: `npm run lint`, `npm run build`, `npm run test:auth`, `npm run test:database`, `npm run test:serverless`, `npm run test:scripts`, `npm run test:terminal-runner`, and `npm run test:workspace-client`.
