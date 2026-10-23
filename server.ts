import { createWorkspaceAuth } from './MIHIR/server/workspaceAuth.js';
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { apiRouter } from './MIHIR/server/apiRouter';
import { IS_VERCEL, UPLOADS_DIR, DATA_DIR, getAllRepositories } from './MIHIR/server/db';

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const workspaceAuth = createWorkspaceAuth();
app.use('/api/auth', workspaceAuth.router);
app.use('/api', workspaceAuth.requireSession);
app.use('/uploads', workspaceAuth.requireSession);

// Serve persistent uploaded files from MIHIR/uploads
if (!IS_VERCEL) {
  app.use('/uploads', express.static(UPLOADS_DIR));
}

// Monitor & Scripts routers require local filesystem + child processes — disabled on Vercel
if (!IS_VERCEL) {
  // Dynamic imports to avoid pulling child_process deps into Vercel bundle
  const { createMonitorRouter } = await import('./MIHIR/server/monitorRouter');
  const { createScriptsRouter } = await import('./MIHIR/server/scriptsRouter');
  app.use('/api/monitor', createMonitorRouter({ dataDir: DATA_DIR, getRepositories: getAllRepositories }));
  app.use('/api/scripts', createScriptsRouter({ dataDir: DATA_DIR }));
}

app.use('/api/scripts', (_req, res) => res.status(503).json({ error: 'Connect the local terminal runner.', code: 'LOCAL_RUNNER_REQUIRED' }));

// Mount REST API
app.use('/api', apiRouter);

const distPath = path.resolve(process.cwd(), 'dist');
const isProd = fs.existsSync(distPath);

if (isProd) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else if (!IS_VERCEL) {
  // Local development: add Vite middleware for HMR
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      watch: {
        ignored: [
          '**/MIHIR/data/**',
          '**/MIHIR/uploads/**',
          '**/*.sqlite',
          '**/*.sqlite-wal',
          '**/*.sqlite-shm',
        ],
      },
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

// Start listening when running as a standalone server (not on Vercel)
if (!IS_VERCEL) {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MIHIR Workspace server listening on http://localhost:${PORT}`);
  });
}

// Export for Vercel serverless functions
export default app;
