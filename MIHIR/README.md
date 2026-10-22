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
