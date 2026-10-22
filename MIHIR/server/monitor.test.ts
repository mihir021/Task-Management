import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createMonitorRouter } from './monitorRouter';
import { getJob, getBuildLog, jobRelativePath } from './jenkinsClient';

test('Jenkins job paths cannot override the configured destination', () => {
  assert.equal(jobRelativePath('team/raydashboard'), 'job/team/job/raydashboard/');
  for (const input of ['../secret', 'http://other.example/job/test', '//other.example', 'test?token=x', '.', 'test/#fragment']) {
    assert.throws(() => jobRelativePath(input));
  }
});

test('Jenkins reads history, authenticates server-side, and continues bounded logs', async () => {
  const calls: { url: string; authorization: string | null }[] = [];
  const options = {
    baseUrl: 'http://jenkins.test/', username: 'reader', token: 'test-only-token',
    fetcher: (async (url, init) => {
      calls.push({ url: String(url), authorization: new Headers(init?.headers).get('Authorization') });
      if (String(url).includes('progressiveText')) return new Response('line one\n', { headers: { 'X-Text-Size': '19', 'X-More-Data': 'true' } });
      return new Response(JSON.stringify({ name: 'raydashboard', builds: [{ number: 394, result: 'SUCCESS', building: false, timestamp: 1000, duration: 2500, url: 'https://untrusted.example/' }] }));
    }) as typeof fetch,
  };
  const job = await getJob('raydashboard', options);
  assert.equal(job.builds[0].url, 'http://jenkins.test/job/raydashboard/394/');
  assert.equal(job.builds[0].result, 'SUCCESS');
  const log = await getBuildLog('raydashboard', 394, 10, options);
  assert.deepEqual(log, { text: 'line one\n', nextStart: 19, moreData: true, truncated: false });
  assert.equal(calls[0].authorization, 'Basic ' + Buffer.from('reader:test-only-token').toString('base64'));
  assert.ok(calls[1].url.endsWith('/394/logText/progressiveText?start=10'));
  const big = await getBuildLog('raydashboard', 394, 0, { ...options, fetcher: (async () => new Response('x'.repeat(300000), { headers: { 'X-Text-Size': '300000' } })) as typeof fetch });
  assert.equal(big.nextStart, 256 * 1024);
  assert.equal(big.truncated, true);
  assert.equal(big.moreData, true);
  await assert.rejects(getBuildLog('raydashboard', -1, 0, options), /Invalid build/);
  await assert.rejects(getBuildLog('raydashboard', 394, -1, options), /Invalid build/);
});

test('Jenkins authentication, redirects, unavailable jobs and network errors are explicit', async () => {
  for (const status of [401, 403, 302, 404, 500]) {
    const options = { baseUrl: 'http://jenkins.test/', fetcher: (async () => new Response('', { status })) as typeof fetch };
    await assert.rejects(getJob('raydashboard', options), status === 404 ? /not found/ : status === 500 ? /HTTP 500/ : /authentication/);
  }
  await assert.rejects(getJob('raydashboard', { fetcher: (async () => { throw new Error('test timeout'); }) as typeof fetch }), /unreachable/);
  await assert.rejects(getJob('raydashboard', { fetcher: (async () => new Response('<html>Login</html>')) as typeof fetch }), /invalid API response/);
});

test('Monitor routes persist mappings, validate requests, and reject cross-origin access', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mihir-monitor-test-'));
  const app = express();
  app.use(express.json());
  app.use('/api/monitor', createMonitorRouter({ dataDir: dir, getRepositories: () => [{ id: 'repo-dashboard', name: 'raydashboard' }] }));
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(dir, { recursive: true, force: true }); });
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api/monitor`;
  const initial = await (await fetch(base + '/config')).json();
  assert.equal(initial.mappings[0].jobPath, 'raydashboard');
  assert.equal(initial.token, undefined);
  const send = (mappings: unknown, origin?: string) => fetch(base + '/config', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify({ mappings }) });
  assert.equal((await send([{ repositoryId: 'repo-dashboard', jobPath: 'folder/dashboard' }])).status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'monitor-config.json'), 'utf8'))[0].jobPath, 'folder/dashboard');
  for (const mapping of [[{ repositoryId: 'missing', jobPath: 'test' }], [{ repositoryId: 'repo-dashboard', jobPath: '../test' }]]) {
    assert.equal((await send(mapping)).status, 400);
  }
  assert.equal((await send([], 'http://untrusted.example')).status, 403);
  assert.equal((await fetch(base + '/repositories/missing/builds')).status, 404);
  assert.equal((await fetch(base + '/repositories/repo-dashboard/builds/3/log?start=-1')).status, 400);
});
