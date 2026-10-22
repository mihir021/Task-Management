import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { run, requestApi } from './workspace.mjs';

test('client reads and writes the API with task-code resolution', async t => {
  const task = { id: 'task-1', taskCode: 'MIHIR-001', title: 'Example', status: 'Todo' };
  const calls = [];
  const state = { tasks: [task], repositories: [], projects: [], workNotes: [], timeEntries: [], activity: [] };
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ method: req.method, url: req.url, body });
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && req.url === '/api/workspace') return res.end(JSON.stringify(state));
    if (req.method === 'GET' && req.url === '/api/focus') return res.end(JSON.stringify({ items: [] }));
    if (req.url === '/api/tasks/task-1') return res.end(JSON.stringify({ task: { ...task, ...body } }));
    if (req.url === '/api/tasks') return res.end(JSON.stringify({ task: { ...task, ...body } }));
    if (req.url === '/api/work-notes') return res.end(JSON.stringify({ note: body }));
    if (req.url === '/api/time-entries') return res.end(JSON.stringify({ entry: body }));
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Example rejection' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const options = body => ({ baseUrl, payload: () => ({ ...body }) });
  assert.equal((await run(['status'], { baseUrl })).counts.tasks, 1);
  assert.equal((await run(['tasks'], { baseUrl }))[0].taskCode, task.taskCode);
  assert.equal((await run(['show', 'mihir-001'], { baseUrl })).id, task.id);
  assert.equal((await run(['create', '-'], options({ title: 'New task' }))).title, 'New task');
  assert.equal((await run(['update', 'MIHIR-001', '-'], options({ status: 'Done' }))).status, 'Done');
  assert.equal((await run(['note', '-'], options({ title: 'Note', taskId: 'MIHIR-001' }))).taskId, task.id);
  assert.equal((await run(['log-time', 'MIHIR-001', '-'], options({ durationMinutes: 12 }))).taskId, task.id);
  assert.deepEqual(await run(['focus'], { baseUrl }), []);
  const writes = calls.filter(call => call.method !== 'GET').length;
  await assert.rejects(run(['update', 'missing', '-'], options({ status: 'Done' })), /Task not found/);
  await assert.rejects(run(['log-time', 'MIHIR-001', '-'], options({ durationMinutes: -1 })), /durationMinutes/);
  await assert.rejects(run(['create', '-'], options({ title: '' })), /title/);
  await assert.rejects(run(['update', 'MIHIR-001', '-'], options({ status: 'Invalid' })), /status/);
  await assert.rejects(run(['update', 'MIHIR-001', '-'], options({ priority: 'Invalid' })), /priority/);
  await assert.rejects(run(['delete', 'MIHIR-001'], { baseUrl }), /Invalid command/);
  assert.equal(calls.filter(call => call.method !== 'GET').length, writes);
  await assert.rejects(requestApi(baseUrl, 'GET', '/missing'), /API 400: Example rejection/);
  state.tasks.push({ ...task, id: 'task-2' });
  await assert.rejects(run(['show', task.taskCode], { baseUrl }), /ambiguous/);
});

test('client rejects non-local origins before sending data', async () => {
  for (const origin of ['https://example.com', 'http://example.com', 'http://localhost.evil.test', 'http://user@localhost', 'http://localhost/path']) {
    assert.throws(() => requestApi(origin, 'POST', '/tasks', { title: 'Example' }), /loopback/);
  }
});
