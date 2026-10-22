#!/usr/bin/env node
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const HELP = `MIHIR Workspace — browser-free local client
Usage: npm run workspace -- COMMAND [TASK-ID-OR-CODE] [JSON-FILE|-]

  status                  Connection and record counts
  tasks                   List tasks (compact JSON)
  show TASK               Read full task by ID or task code
  repositories            List repository configurations
  notes                   List work notes
  time                    List time entries
  activity                List activity records
  focus                   List daily focus items
  create FILE|-           Create task from JSON
  update TASK FILE|-      Update task fields from JSON
  note FILE|-             Add work note from JSON (optional taskId/code)
  log-time TASK FILE|-    Log time from JSON (durationMinutes, notes)

Use - to read JSON from stdin. Server must be running; browser can be closed.
MIHIR_WORKSPACE_URL defaults to http://127.0.0.1:3000 (loopback only).
Writes print the saved record; they are never retried automatically.
`;

export function requestApi(baseUrl, method, route, body) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
      || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('MIHIR_WORKSPACE_URL must be a plain loopback HTTP origin.');
  }
  const url = new URL('/api' + route, base);
  const data = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method,
      headers: data === undefined ? { Accept: 'application/json' } : {
        Accept: 'application/json', 'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('error', reject);
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        let result;
        try { result = JSON.parse(text); }
        catch { reject(new Error('Server returned non-JSON data. Check the workspace server address.')); return; }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`API ${res.statusCode}: ${result.error || 'Request failed'}`));
        } else resolve(result);
      });
    });
    req.setTimeout(10000, () => req.destroy(new Error('Workspace request timed out. Check the server before retrying a write.')));
    req.on('error', reject);
    if (data !== undefined) req.write(data);
    req.end();
  });
}

function readPayload(file) {
  const data = JSON.parse(readFileSync(file === '-' ? 0 : file, 'utf8'));
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('JSON payload must be an object.');
  return data;
}

function validateTask(body) {
  const statuses = ['Todo', 'In Progress', 'Push to Local Branch', 'Push to Development Branch', 'Push to Cloud', 'Monitor Logs & Process', 'Done'];
  if (body.status !== undefined && !statuses.includes(body.status)) throw new Error('Invalid task status.');
  if (body.priority !== undefined && !['Low', 'Medium', 'High', 'Urgent'].includes(body.priority)) throw new Error('Invalid task priority.');
  if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim())) throw new Error('Task title must not be empty.');
}

export async function run(args, { baseUrl = process.env.MIHIR_WORKSPACE_URL || 'http://127.0.0.1:3000', payload = readPayload } = {}) {
  const [command = 'help', ...rest] = args;
  if (['help', '--help', '-h'].includes(command)) return HELP;
  const arity = { status: 0, tasks: 0, show: 1, repositories: 0, notes: 0, time: 0, activity: 0, focus: 0, create: 1, update: 2, note: 1, 'log-time': 2 };
  if (!Object.prototype.hasOwnProperty.call(arity, command) || rest.length !== arity[command]) throw new Error('Invalid command or arguments. Use --help.');
  const api = (method, route, body) => requestApi(baseUrl, method, route, body);
  const taskFrom = async reference => {
    const state = await api('GET', '/workspace');
    const matches = state.tasks.filter(t => t.id === reference || t.taskCode.toLowerCase() === reference.toLowerCase());
    if (matches.length !== 1) throw new Error(matches.length ? 'Task code is ambiguous; use its ID.' : `Task not found: ${reference}`);
    return matches[0];
  };
  if (command === 'focus') return (await api('GET', '/focus')).items;
  if (command === 'create') {
    const body = payload(rest[0]);
    validateTask(body);
    if (typeof body.title !== 'string' || !body.title.trim()) throw new Error('Task title is required.');
    return (await api('POST', '/tasks', body)).task;
  }
  if (command === 'update') {
    const body = payload(rest[1]);
    validateTask(body);
    const task = await taskFrom(rest[0]);
    return (await api('PUT', '/tasks/' + encodeURIComponent(task.id), body)).task;
  }
  if (command === 'note') {
    const body = payload(rest[0]);
    if (typeof body.title !== 'string' || !body.title.trim()) throw new Error('Note title is required.');
    if (body.taskId) body.taskId = (await taskFrom(body.taskId)).id;
    return (await api('POST', '/work-notes', body)).note;
  }
  if (command === 'log-time') {
    const body = payload(rest[1]);
    if (!Number.isFinite(body.durationMinutes) || body.durationMinutes < 1) throw new Error('durationMinutes must be a number of at least 1.');
    const task = await taskFrom(rest[0]);
    return (await api('POST', '/time-entries', { ...body, taskId: task.id })).entry;
  }
  if (command === 'show') return taskFrom(rest[0]);
  const state = await api('GET', '/workspace');
  if (command === 'status') return { connected: true, url: baseUrl, counts: Object.fromEntries(
    ['tasks', 'repositories', 'projects', 'workNotes', 'timeEntries'].map(key => [key, state[key].length])) };
  if (command === 'tasks') return state.tasks.map(({ id, taskCode, title, status, priority, projectName }) => ({ id, taskCode, title, status, priority, projectName }));
  return state[{ repositories: 'repositories', notes: 'workNotes', time: 'timeEntries', activity: 'activity' }[command]];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then(result => {
    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
  }).catch(error => {
    console.error(`Workspace: ${error.message}${error.code === 'ECONNREFUSED' ? '\nStart the app with npm run dev in MIHIR-Workspace.' : ''}`);
    process.exitCode = 1;
  });
}
