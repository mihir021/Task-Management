import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import { kubernetesPreset } from './kubernetesScript';
import { parseInventory, inspectKubernetes, queryInventory } from './kubernetesInventory';
import { resolveRunnerHome, repairRootKubeconfig } from './runnerHome';
import { inventoryArgs, inventoryCommandPreview } from '../src/lib/inventoryCommands';
import { PORT_MAPPINGS, mappedInventory, matchesPortService } from '../src/lib/portMappings';
import { createScriptsRouter } from './scriptsRouter';

const settings = kubernetesPreset('/home/example').kubernetes!;
const pod = (name: string, ready = true, extra = {}) => ({ metadata: { name, uid: name, labels: { app: 'job' }, creationTimestamp: '2026-10-23T10:00:00Z' },
  spec: { containers: [{ name: 'job', ports: [{ containerPort: 38082 }] }], nodeName: 'worker-a' },
  status: { phase: 'Running', podIP: '10.0.0.1', containerStatuses: [{ name: 'job', ready, restartCount: 2 }], ...extra } });
const pods = { items: [pod('ray-job-service-a'), pod('ray-job-service-b', false), pod('unrelated-c')] };
const services = { items: [{ metadata: { name: 'different-service-name' }, spec: { type: 'NodePort', selector: { app: 'job' }, clusterIP: '10.1.0.1', ports: [{ port: 38082, targetPort: 38082, nodePort: 32082, protocol: 'TCP' }] } }] };
const endpoints = { items: [{ metadata: { labels: { 'kubernetes.io/service-name': 'different-service-name' } }, ports: [{ port: 38082 }], endpoints: [{ addresses: ['10.0.0.1'], conditions: { ready: true } }] }] };

test('inventory exposes ready counts, ports and selector-linked services without leaking pod secrets', () => {
  const data = parseInventory(settings, pods, services, endpoints);
  assert.equal(data.pods.length, 2); assert.equal(data.pods[0].ready, 1); assert.equal(data.pods[1].health, 'starting');
  assert.equal(data.pods[0].restarts, 2); assert.equal(data.pods[0].ports[0].port, 38082);
  assert.equal(data.services[0].ports[0].nodePort, 32082); assert.equal(data.endpoints[0].service, 'different-service-name');
  const secretPod = pod('ray-job-service-secret'); (secretPod.spec as any).containers[0].env = [{ name: 'TOKEN', value: 'never-send-this' }];
  assert.doesNotMatch(JSON.stringify(parseInventory(settings, { items: [secretPod] }, null, null)), /never-send-this|TOKEN/);
  assert.throws(() => parseInventory(settings, {}, null, null), /invalid pod list/);
  assert.equal(parseInventory(settings, { items: [] }, null, null).pods.length, 0);
});
test('pod failures and terminating replacements remain distinguishable from healthy Running pods', () => {
  const broken = pod('ray-job-service-error', false, { containerStatuses: [{ ready: false, restartCount: 3, state: { waiting: { reason: 'CrashLoopBackOff' } } }] });
  const draining = pod('ray-job-service-draining'); (draining.metadata as any).deletionTimestamp = '2026-10-23T10:10:00Z';
  const data = parseInventory(settings, { items: [broken, draining] }, null, null);
  assert.equal(data.pods.find(item => item.name.endsWith('error'))?.status, 'CrashLoopBackOff');
  assert.equal(data.pods.find(item => item.name.endsWith('error'))?.health, 'error');
  assert.equal(data.pods.find(item => item.name.endsWith('draining'))?.health, 'terminating');
});
test('sudo su resolves the repository owner home and only repairs unreadable legacy preset paths', () => {
  const passwd = 'root:x:0:0:root:/root:/bin/bash\nmihir:x:1000:1000::/home/mihir:/bin/bash\n';
  assert.equal(resolveRunnerHome({ home: '/root', ownerUid: 1000, passwd, sudoUser: '' }), '/home/mihir');
  assert.equal(resolveRunnerHome({ home: '/root', ownerUid: 0, passwd, sudoUser: 'mihir' }), '/home/mihir');
  assert.equal(resolveRunnerHome({ home: '/home/other', passwd }), '/home/other');
  const old = kubernetesPreset('/root');
  const fixed = repairRootKubeconfig(old, '/home/mihir', file => file.startsWith('/home/mihir/'));
  assert.equal(fixed.cwd, '/home/mihir'); assert.equal(fixed.kubernetes?.kubeconfig, '/home/mihir/TEMP/k8s-readonly-user-raylife');
  assert.equal(repairRootKubeconfig(old, '/home/mihir', () => true), old, 'Preserve a working root config');
  const custom = { ...old, kubernetes: { ...old.kubernetes!, kubeconfig: '/custom/config' } };
  assert.equal(repairRootKubeconfig(custom, '/home/mihir', () => true), custom);
});
test('partial RBAC failure preserves pods; unreadable config and pod permission failures are explicit', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mihir-inventory-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const config = path.join(dir, 'config'); fs.writeFileSync(config, 'test'); const value = { ...settings, kubeconfig: config };
  const result = await inspectKubernetes(value, async resource => {
    if (resource !== 'pods') throw { stderr: 'Forbidden: not allowed to list services' };
    return pods;
  });
  assert.equal(result.pods.length, 2); assert.equal(result.services.length, 0); assert.equal(result.warnings.length, 2);
  await assert.rejects(inspectKubernetes(value, async () => { throw { stderr: 'Forbidden: pods' }; }), /Unable to list pods.*Forbidden/);
  await assert.rejects(inspectKubernetes({ ...value, kubeconfig: path.join(dir, 'missing') }), /Cannot read kubeconfig/);
  await assert.rejects(inspectKubernetes({ ...value, podPrefix: 'job;bad' }), /Invalid Kubernetes/);
});
test('paired inventory API reads kubectl JSON, coalesces concurrent polls and keeps server secrets out of kubectl', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mihir-inventory-api-')); const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
  const config = path.join(dir, "config with ' quotes; safe"); fs.writeFileSync(config, 'fixture');
  const calls = path.join(dir, 'calls.txt');
  fs.writeFileSync(path.join(bin, 'kubectl'), `#!/usr/bin/env node\nconst fs=require('node:fs'); const args=process.argv.slice(2);\nif(args[1]!==${JSON.stringify(config)}) process.exit(9);\nif(process.env.MIHIR_SERVER_ONLY_SECRET) process.exit(8);\nconst resource=args[args.indexOf('get')+1];fs.appendFileSync(${JSON.stringify(calls)},resource+'\\n');\nconst data=${JSON.stringify({ pods, services, endpointslices: endpoints })};setTimeout(()=>console.log(JSON.stringify(data[resource])),50);\n`, { mode: 0o700 });
  const oldPath = process.env.PATH; process.env.PATH = bin + ':' + oldPath; process.env.MIHIR_SERVER_ONLY_SECRET = 'must-not-be-inherited';
  const app = express(); app.use(express.json()); const origin = 'https://task-management-azure-iota.vercel.app'; const token = 'c'.repeat(64);
  app.use('/api/scripts', createScriptsRouter({ dataDir: dir, home: dir, companion: { token, origin } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(async () => { process.env.PATH = oldPath; delete process.env.MIHIR_SERVER_ONLY_SECRET; server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/scripts`;
  const body = JSON.stringify({ settings: { ...settings, kubeconfig: config } });
  assert.equal((await fetch(base + '/kubernetes/inspect', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body })).status, 403);
  const request = () => fetch(base + '/kubernetes/inspect', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Mihir-Scripts-Token': token }, body });
  const [first, second] = await Promise.all([request(), request()]);
  assert.equal(first.status, 200); assert.equal(second.status, 200); assert.equal((await first.json()).pods.length, 2);
  assert.equal(fs.readFileSync(calls, 'utf8').trim().split('\n').length, 3, 'Two overlapping polls share three read-only queries');
  const bootstrap = await (await fetch(base, { headers: { Origin: origin, 'X-Mihir-Scripts-Token': token } })).json();
  assert.ok(bootstrap.capabilities.includes('kubernetes-inventory-v1'));
  assert.equal((await queryInventory('pods', { ...settings, kubeconfig: config }) as any).items.length, 3);
});

test('application mappings include internal gateway variants without matching unrelated services', () => {
  assert.deepEqual(PORT_MAPPINGS.map(item => item.service), ['ray-controller-service', 'ray-job-service', 'ray-gateway-service', 'ray-hub-service']);
  assert.equal(matchesPortService('ray-job-service-extra', 'ray-job-service'), true);
  assert.equal(matchesPortService('ray-job-serviceother', 'ray-job-service'), false);
  const inventory = parseInventory({ ...settings, podPrefix: 'ray-' }, { items: [pod('ray-job-service-a'), pod('ray-hub-service-b'), pod('ray-audit-service-c'), pod('ray-gateway-service-internal-d')] }, { items: [] }, { items: [] });
  assert.equal(mappedInventory(inventory).pods.length, 3);
  assert.deepEqual(mappedInventory(inventory, 'ray-gateway-service').pods.map(pod => pod.name), ['ray-gateway-service-internal-d']);
  assert.deepEqual(mappedInventory(inventory, 'ray-controller-service').pods, []);
});

test('command preview uses the exact kubectl arguments and contains only selected service prefixes', () => {
  const settings = { kubeconfig: "/tmp/config with ' quote; safe", namespace: 'default' };
  assert.deepEqual(inventoryArgs('pods', settings), ['--kubeconfig', settings.kubeconfig, '--namespace', 'default', '--request-timeout=8s', 'get', 'pods', '-o', 'json']);
  const preview = inventoryCommandPreview(settings, ['ray-job-service']);
  assert.ok(preview.includes("'\\''"), 'Single quotes are escaped for terminal copy');
  assert.equal((preview.match(/kubectl /g) || []).length, 3);
  assert.ok(preview.includes('ray-job-service')); assert.ok(!preview.includes('ray-hub-service'));
  assert.equal(inventoryCommandPreview(settings, []), '');
});
test('root-owned script definitions do not block authenticated connection or default read-only workflows', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mihir-permission-'));
  const scripts = path.join(dir, 'scripts'); fs.mkdirSync(scripts); const file = path.join(scripts, 'definitions.json');
  fs.writeFileSync(file, 'preserved-original');
  const read = fs.readFileSync.bind(fs);
  t.mock.method(fs, 'readFileSync', ((target: any, ...args: any[]) => {
    if (target === file) throw Object.assign(new Error('EACCES: permission denied, open definitions.json'), { code: 'EACCES' });
    return (read as any)(target, ...args);
  }) as any);
  const app = express(); const token = 'd'.repeat(64);
  app.use('/api/scripts', createScriptsRouter({ dataDir: dir, home: dir, companion: { token, origin: 'https://task-management-azure-iota.vercel.app' } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); t.mock.restoreAll(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/scripts`;
  assert.equal((await fetch(base + '/connection')).status, 403);
  const options = { headers: { 'X-Mihir-Scripts-Token': token } };
  const connection = await (await fetch(base + '/connection', options)).json();
  assert.equal(connection.token, token); assert.equal(connection.home, dir);
  const response = await fetch(base, options); assert.equal(response.status, 200);
  assert.ok((await response.json()).scripts.some((item: any) => item.kubernetes));
  assert.equal(read(file, 'utf8'), 'preserved-original');
});
