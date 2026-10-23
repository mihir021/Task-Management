import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('compiled serverless API runs in plain Node without a TypeScript loader', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'mihir-serverless-'));
  try {
    // Match Vercel's temporary compiler project, including its isolated file list.
    const config = path.join(temporary, 'tsconfig.json');
    await writeFile(config, JSON.stringify({
      extends: path.join(root, 'tsconfig.json'),
      compilerOptions: {
        noEmit: false,
        noCheck: true,
        rootDir: root,
        outDir: temporary,
        rewriteRelativeImportExtensions: true,
      },
      files: [path.join(root, 'api/index.ts')],
      include: [],
      exclude: [],
    }));
    execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', config]);
    await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}');
    await symlink(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
    execFileSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import app from './api/index.js';
      const server = app.listen(0, '127.0.0.1');
      await new Promise(resolve => server.once('listening', resolve));
      try {
        const base = 'http://127.0.0.1:' + server.address().port;
        const locked = await fetch(base + '/api/workspace');
        assert.equal(locked.status, 401);
        const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'serverless-test-password' }) });
        assert.equal(login.status, 200);
        const cookie = login.headers.get('set-cookie').split(';')[0];
        const headers = { Cookie: cookie };
        const health = await fetch(base + '/api/health/database', { headers });
        assert.equal(health.status, 503);
        assert.equal((await health.json()).provider, 'unconfigured');
        const response = await fetch(base + '/api/workspace', { headers });
        assert.equal(response.status, 503);
        assert.equal((await response.json()).code, 'DATABASE_UNAVAILABLE');
        const scripts = await fetch(base + '/api/scripts', { headers });
        assert.equal(scripts.status, 503);
        assert.equal((await scripts.json()).code, 'LOCAL_RUNNER_REQUIRED');
      } finally {
        await new Promise(resolve => server.close(resolve));
      }
    `], { cwd: temporary, env: { ...process.env, VERCEL: '1', TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '', WORKSPACE_SESSION_SECRET: 'serverless-test-secret-long-enough-32', WORKSPACE_PASSWORD_SHA256: (await import('node:crypto')).createHash('sha256').update('serverless-test-password').digest('hex') }, timeout: 15000 });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
