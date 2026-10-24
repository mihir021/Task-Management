import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { resolveRunnerHome, repairRootKubeconfig } from './runnerHome';
import { inspectKubernetes } from './kubernetesInventory';
import { defaultScript, validateScript, buildScript } from './scriptBuilder';
import { ScriptRunner } from './scriptRunner';
import { RAY_CONTAINERS, type ScriptDefinition } from '../src/types/scripts';
import { kubernetesServicePresets } from './kubernetesScript';

export function createScriptsRouter({ dataDir, home = resolveRunnerHome(), companion }: { dataDir: string; home?: string; companion?: { token: string; origin: string } }) {
  const router = express.Router();
  const token = companion?.token || randomBytes(32).toString('hex');
  const scriptDir = path.join(dataDir, 'scripts');
  fs.mkdirSync(scriptDir, { recursive: true, mode: 0o700 });
  const definitions = path.join(scriptDir, 'definitions.json');
  const runner = new ScriptRunner(path.join(scriptDir, 'runs'));
  function readDefinitions(): ScriptDefinition[] {
    if (!fs.existsSync(definitions)) {
      fs.writeFileSync(definitions, JSON.stringify([defaultScript(home), ...kubernetesServicePresets(home)], null, 2), { mode: 0o600 });
    }
    let original: ScriptDefinition[];
    try { original = JSON.parse(fs.readFileSync(definitions, 'utf8')); }
    catch (problem: any) {
      // Older sudo runners can leave a root-owned file. Keep it intact; read-only monitoring must still work.
      if (problem.code === 'EACCES') return [defaultScript(home), ...kubernetesServicePresets(home)];
      throw problem;
    }
    const saved = original.map(script => repairRootKubeconfig(script, home));
    const additions = kubernetesServicePresets(home).filter(preset => !saved.some(item => item.id === preset.id));
    if (additions.length) saved.push(...additions);
    if (additions.length || saved.some((script, index) => script !== original[index])) saveDefinitions(saved);
    return saved;
  }
  function saveDefinitions(items: ScriptDefinition[]) {
    const temp = definitions + '.' + randomUUID() + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(items, null, 2), { mode: 0o600 }); fs.renameSync(temp, definitions);
  }
  function error(res: express.Response, value: unknown, status = 400) {
    res.status(status).json({ error: value instanceof Error ? value.message : 'Script request failed.' });
  }
  router.use((req, res, next) => {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');
    let host = '';
    try { host = new URL('http://' + req.get('host')).hostname; } catch { /* reject below */ }
    const origin = req.get('origin');
    if (!local || !['localhost', '127.0.0.1', '[::1]'].includes(host)) {
      res.status(403).json({ error: 'Scripts require a loopback connection on this computer.' }); return;
    }
    if (companion) {
      // No wildcard origins, cookies, or token-bearing URLs. Every read and write is paired.
      if (origin && origin !== companion.origin) {
        res.status(403).json({ error: 'This website is not paired with the local runner.' }); return;
      }
      if (origin) {
        res.set('Access-Control-Allow-Origin', companion.origin).set('Vary', 'Origin');
        res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, X-Mihir-Scripts-Token');
        res.set('Access-Control-Allow-Private-Network', 'true');
      }
      if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    } else if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== `${req.protocol}://${req.get('host')}`)) {
      res.status(403).json({ error: 'Scripts can only be used from this computer at localhost.' }); return;
    }
    if (companion || req.method !== 'GET') {
      const supplied = Buffer.from(req.get('x-mihir-scripts-token') || '');
      const expected = Buffer.from(token);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        res.status(403).json({ error: 'Pair this browser with the token from your local runner terminal.' }); return;
      }
    }
    res.set('Cache-Control', 'no-store'); next();
  });

  router.get('/', (_req, res) => {
    try { res.json({ scripts: readDefinitions(), runs: runner.list(), token, containers: RAY_CONTAINERS, home, capabilities: ['kubernetes-inventory-v1'], terminalAvailable: fs.existsSync('/usr/bin/script') }); }
    catch (value) { error(res, value, 500); }
  });
  router.get('/connection', (_req, res) => res.json({ token, home, capabilities: ['kubernetes-inventory-v1'] }));
  // Shared in-flight requests prevent overlapping 30-second polls or multiple tabs from spawning duplicate queries.
  const inventories = new Map<string, ReturnType<typeof inspectKubernetes>>();
  router.post('/kubernetes/inspect', async (req, res) => {
    const settings = req.body?.settings;
    const key = JSON.stringify(settings);
    try {
      let pending = inventories.get(key);
      if (!pending) {
        if (inventories.size >= 3) { res.status(429).json({ error: 'Three Kubernetes inspections are already in progress. Try again shortly.' }); return; }
        pending = inspectKubernetes(settings); inventories.set(key, pending);
        pending.finally(() => { if (inventories.get(key) === pending) inventories.delete(key); }).catch(() => {});
      }
      res.json(await pending);
    } catch (value) { error(res, value); }
  });
  router.post('/preview', (req, res) => {
    try { res.json(buildScript(validateScript(req.body.script))); } catch (value) { error(res, value); }
  });
  router.put('/definitions/:id', (req, res) => {
    try {
      const script = validateScript({ ...req.body.script, id: req.params.id });
      const items = readDefinitions();
      const index = items.findIndex(item => item.id === script.id);
      if (index === -1) { if (items.length >= 50) throw new Error('Maximum of 50 saved scripts reached.'); items.push(script); }
      else items[index] = script;
      saveDefinitions(items); res.json({ script, scripts: items });
    } catch (value) { error(res, value); }
  });
  router.post('/runs', (req, res) => {
    try { res.status(201).json({ run: runner.start(validateScript(req.body.script)) }); }
    catch (value) { error(res, value); }
  });
  router.get('/runs/:id', (req, res) => {
    try { res.json({ run: runner.get(req.params.id) }); } catch (value) { error(res, value, 404); }
  });
  router.get('/runs/:id/output', (req, res) => {
    try { res.set('Content-Type', 'text/plain; charset=utf-8').set('Content-Disposition', 'attachment; filename="script-output.txt"').send(runner.output(req.params.id)); }
    catch (value) { error(res, value, 404); }
  });
  router.post('/runs/:id/input', (req, res) => {
    try {
      if (typeof req.body.data !== 'string' || req.body.data.length > 8192) throw new Error('Invalid terminal input.');
      runner.input(req.params.id, req.body.data); res.json({ ok: true });
    } catch (value) { error(res, value); }
  });
  router.post('/runs/:id/interrupt', (req, res) => {
    try { res.json({ run: runner.interrupt(req.params.id) }); } catch (value) { error(res, value); }
  });
  router.get('/runs/:id/events', (req, res) => {
    let run;
    try { run = runner.get(req.params.id); } catch (value) { error(res, value, 404); return; }
    res.set({ 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); res.flushHeaders();
    const send = (event: string, data: unknown) => {
      if (res.writableLength > 1024 * 1024) { res.end(); return; }
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send('snapshot', { run, output: runner.output(run.id, true) });
    const listener = (event: string, data: unknown) => send(event, data);
    runner.events.on(run.id, listener);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
    req.on('close', () => { clearInterval(heartbeat); runner.events.off(run.id, listener); });
  });
  return router;
}
