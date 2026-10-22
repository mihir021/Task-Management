import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createScriptsRouter } from './scriptsRouter';
import { defaultScript } from './scriptBuilder';
import { followScriptEvents, scriptRequest } from '../src/lib/scriptTransport';

const origin = 'https://task-management-azure-iota.vercel.app';
const token = 'a'.repeat(64);
async function setup(t: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mihir-bridge-'));
  const app = express(); app.use(express.json());
  app.use('/api/scripts', createScriptsRouter({ dataDir: dir, home: dir, companion: { token, origin } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(dir, { recursive: true, force: true }); });
  return { base: `http://127.0.0.1:${(server.address() as any).port}`, dir };
}

test('companion only permits paired reads/writes from its exact hosted origin', async t => {
  const { base } = await setup(t);
  const preflight = await fetch(base + '/api/scripts', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Private-Network': 'true' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');
  for (const route of ['', '/runs/not-a-run/events', '/runs/not-a-run/output']) {
    const unauthenticated = await fetch(base + '/api/scripts' + route, { headers: { Origin: origin } });
    assert.equal(unauthenticated.status, 403);
    assert.doesNotMatch(await unauthenticated.text(), new RegExp(token));
  }
  const blocked = await fetch(base + '/api/scripts', { headers: { Origin: 'https://evil.example', 'X-Mihir-Scripts-Token': token } });
  assert.equal(blocked.status, 403); assert.equal(blocked.headers.get('access-control-allow-origin'), null);
  const queryToken = await fetch(base + '/api/scripts?token=' + token, { headers: { Origin: origin } });
  assert.equal(queryToken.status, 403);
  const allowed = await fetch(base + '/api/scripts', { headers: { Origin: origin, 'X-Mihir-Scripts-Token': token } });
  assert.equal(allowed.status, 200); assert.ok(Array.isArray((await allowed.json()).scripts));
});

test('authenticated browser transport receives real PTY output, ANSI, input and exit status', async t => {
  const { base, dir } = await setup(t);
  const { run } = await scriptRequest<any>(base, token, '/runs', 'POST', { script: {
    ...defaultScript(dir), mode: 'custom', runAsRoot: false,
    customBody: 'test -t 0\nprintf "\\033[32mLOCAL-PTY-READY\\033[0m\\n"\nread -r answer\nprintf "INPUT:%s\\n" "$answer"\ntty\n',
  } });
  let output = ''; let status = ''; let sentInput = false;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { stop(); reject(new Error('PTY stream timed out')); }, 8000);
    const stop = followScriptEvents(base, () => token, run.id, (name, value) => {
      if (name === 'snapshot') { output = value.output; status = value.run.status; }
      if (name === 'output') output += value;
      if (!sentInput && output.includes('LOCAL-PTY-READY')) {
        sentInput = true;
        void scriptRequest(base, token, `/runs/${run.id}/input`, 'POST', { data: 'from-browser\n' }).catch(reject);
      }
      if (name === 'status') status = value.status;
      if (status !== 'Running') { clearTimeout(timeout); resolve(); return false; }
    }, () => {}, message => { clearTimeout(timeout); stop(); reject(new Error(message)); });
  });
  assert.equal(status, 'Passed');
  assert.match(output, /\x1b\[32mLOCAL-PTY-READY\x1b\[0m/);
  assert.match(output, /INPUT:from-browser/); assert.match(output, /\/dev\/pts\/\d+/);
  const download = await fetch(base + `/api/scripts/runs/${run.id}/output`, { headers: { 'X-Mihir-Scripts-Token': token } });
  assert.equal(await download.text(), output);
});

test('HTML fallback becomes an actionable connection error', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('<!DOCTYPE html>', { headers: { 'Content-Type': 'text/html' } });
  try { await assert.rejects(scriptRequest('', '', ''), /Connect the local terminal runner/); }
  finally { globalThis.fetch = original; }
});
