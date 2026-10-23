import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { buildScript, defaultScript, quoteShell, validateScript } from './scriptBuilder';
import { ScriptRunner } from './scriptRunner';
import { createScriptsRouter } from './scriptsRouter';
import { kubernetesPreset, validateKubernetes } from './kubernetesScript';
import { spawnSync } from 'node:child_process';

function temporary(t: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mihir-scripts-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir;
}
function finish(runner: ScriptRunner, id: string) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { runner.events.off(id, listener); reject(new Error('Run did not finish')); }, 10000);
    const listener = (event: string, value: any) => {
      if (event === 'status' && value.status !== 'Running') { clearTimeout(timeout); runner.events.off(id, listener); resolve(); }
    };
    runner.events.on(id, listener);
    if (runner.get(id).status !== 'Running') { clearTimeout(timeout); runner.events.off(id, listener); resolve(); }
  });
}

test('presets use the requested paths, optional stop-all, and safely quoted arguments', () => {
  const preset = defaultScript('/home/test user');
  const full = buildScript(preset);
  assert.match(full.source, /cd -- '\/home\/test user'/);
  assert.match(full.source, /ray\/docker\/scripts\/pull.sh/);
  assert.match(full.source, /ray\/docker\/scripts\/up.sh/);
  assert.match(full.source, /docker start/);
  assert.doesNotMatch(full.source, /docker stop/);
  const stop = buildScript({ ...preset, stopAll: true }).source;
  assert.match(stop, /if \[\[ -n "\$mihir_running_ids"/);
  assert.match(stop, /docker stop "\$\{mihir_running_array\[@\]\}"/);
  const pull = buildScript({ ...preset, pull: true, up: false, finalAction: 'none' });
  assert.deepEqual(pull.steps.map(step => step.id), ['pull']);
  assert.doesNotMatch(pull.source, /docker (start|restart|stop|inspect)/);
  assert.equal(quoteShell("it's"), "'it'\\''s'");
  assert.throws(() => validateScript({ ...preset, containers: ['service;touch /tmp/no'] }), /Invalid/);
  assert.throws(() => validateScript({ ...preset, containers: [] }), /Select/);
});

test('real PTY records output and exit status without exposing injected server credentials', async t => {
  const home = temporary(t);
  const runner = new ScriptRunner(path.join(home, 'runs'));
  const script = { ...defaultScript(home), runAsRoot: false, mode: 'custom' as const,
    customBody: 'printf "Hello from a real PTY\\n"\ntest -t 0\nprintf "server-token=%s\\n" "${JENKINS_API_TOKEN-not-inherited}"' };
  const run = runner.start(script);
  await finish(runner, run.id);
  assert.equal(run.status, 'Passed'); assert.equal(run.exitCode, 0);
  assert.equal(run.steps[0].status, 'Passed');
  assert.match(runner.output(run.id), /Hello from a real PTY/);
  assert.match(runner.output(run.id), /server-token=not-inherited/);
  const restored = new ScriptRunner(path.join(home, 'runs'));
  assert.equal(restored.get(run.id).status, 'Passed');
  const failed = runner.start({ ...script, customBody: 'printf "Intentional failure\\n"\nexit 7' });
  await finish(runner, failed.id);
  assert.equal(failed.status, 'Failed'); assert.equal(failed.exitCode, 7);
  assert.equal(failed.steps[0].status, 'Failed');
});

test('interactive hidden input reaches the PTY and is not written to output', async t => {
  const home = temporary(t);
  const runner = new ScriptRunner(path.join(home, 'runs'));
  const run = runner.start({ ...defaultScript(home), runAsRoot: false, mode: 'custom',
    customBody: 'printf "Input prompt: "\nread -rs mihir_secret\nprintf "\\nInput received\\n"' });
  const done = finish(runner, run.id);
  await new Promise<void>(resolve => {
    const listener = (event: string, value: any) => {
      if (event === 'output' && value.includes('Input prompt:')) { runner.events.off(run.id, listener); resolve(); }
    };
    runner.events.on(run.id, listener);
  });
  runner.input(run.id, 'not-a-real-password\n');
  await done;
  assert.equal(run.status, 'Passed');
  assert.match(runner.output(run.id), /Input received/);
  assert.doesNotMatch(runner.output(run.id), /not-a-real-password/);
});

test('Docker workflow steps execute in order against a fake Docker command', async t => {
  const home = temporary(t);
  const bin = path.join(home, 'bin');
  const scripts = path.join(home, 'ray/docker/scripts');
  fs.mkdirSync(bin); fs.mkdirSync(scripts, { recursive: true });
  fs.writeFileSync(path.join(bin, 'docker'), '#!/bin/bash\nif [[ "$1" == ps ]]; then exit 0; fi\nprintf "FAKE_DOCKER:%s\\n" "$*"\n', { mode: 0o700 });
  fs.writeFileSync(path.join(scripts, 'pull.sh'), 'printf "FAKE_PULL:%s\\n" "$*"\n');
  fs.writeFileSync(path.join(scripts, 'up.sh'), 'printf "FAKE_UP:%s\\n" "$*"\n');
  const runner = new ScriptRunner(path.join(home, 'runs'));
  const originalPath = process.env.PATH;
  let run;
  try {
    process.env.PATH = bin + path.delimiter + originalPath;
    run = runner.start({ ...defaultScript(home), runAsRoot: false, stopAll: true,
      finalAction: 'restart', selectedServicesOnly: true, containers: ['kafka', 'zookeeper'] });
  } finally { process.env.PATH = originalPath; }
  await finish(runner, run.id);
  assert.equal(run.status, 'Passed');
  assert.deepEqual(run.steps.map(step => step.status), ['Passed', 'Passed', 'Passed', 'Passed', 'Passed']);
  const output = runner.output(run.id);
  assert.match(output, /FAKE_PULL:kafka zookeeper/);
  assert.match(output, /FAKE_UP:kafka zookeeper/);
  assert.match(output, /FAKE_DOCKER:restart kafka zookeeper/);
  assert.match(output, /No running containers to stop/);
  assert.doesNotMatch(output, /FAKE_DOCKER:stop/);
  assert.ok(output.indexOf('FAKE_PULL') < output.indexOf('FAKE_UP'));
  assert.ok(output.indexOf('FAKE_UP') < output.indexOf('FAKE_DOCKER:restart'));
});

test('three independent sessions run concurrently and stopping one leaves others running', async t => {
  const home = temporary(t);
  const runner = new ScriptRunner(path.join(home, 'runs'));
  const script = { ...defaultScript(home), runAsRoot: false, mode: 'custom' as const };
  const runs = [1, 2, 3].map(index => runner.start({ ...script, id: 'session-' + index, name: 'Application ' + index,
    customBody: 'printf "APP-' + index + '-READY\\n"\nsleep 30' }));
  const completions = runs.map(run => finish(runner, run.id));
  assert.throws(() => runner.start({ ...script, customBody: 'printf extra' }), /Three sessions/);
  await Promise.all(runs.map((run, index) => new Promise<void>(resolve => {
    const listener = (event: string, value: any) => {
      if (event === 'output' && value.includes('APP-' + (index + 1) + '-READY')) { runner.events.off(run.id, listener); resolve(); }
    };
    runner.events.on(run.id, listener);
  })));
  for (const [index, run] of runs.entries()) {
    const output = runner.output(run.id);
    assert.match(output, new RegExp('APP-' + (index + 1) + '-READY'));
    for (let other = 1; other <= 3; other++) if (other !== index + 1) assert.doesNotMatch(output, new RegExp('APP-' + other + '-READY'));
  }
  runner.interrupt(runs[1].id); await completions[1];
  assert.equal(runs[1].status, 'Interrupted');
  assert.equal(runs[0].status, 'Running'); assert.equal(runs[2].status, 'Running');
  runner.interrupt(runs[0].id); runner.interrupt(runs[2].id);
  await Promise.all(completions);
});

test('Docker maintenance remains exclusive while non-root sessions can overlap', async t => {
  const home = temporary(t);
  fs.mkdirSync(path.join(home, 'ray/docker/scripts'), { recursive: true });
  fs.writeFileSync(path.join(home, 'ray/docker/scripts/up.sh'), 'printf "MAINTENANCE-READY\\n"\nsleep 30');
  const runner = new ScriptRunner(path.join(home, 'runs'));
  const maintenance = { ...defaultScript(home), runAsRoot: false, pull: false, up: true, finalAction: 'none' as const, containers: [] };
  const run = runner.start(maintenance);
  const done = finish(runner, run.id);
  assert.throws(() => runner.start({ ...maintenance, mode: 'custom', customBody: 'printf should-not-run' }), /exclusively/);
  await new Promise<void>(resolve => {
    const listener = (event: string, value: any) => { if (event === 'output' && value.includes('MAINTENANCE-READY')) { runner.events.off(run.id, listener); resolve(); } };
    runner.events.on(run.id, listener);
  });
  runner.interrupt(run.id); await done;
});

test('script API requires a local host, same origin, and a session token for writes', async t => {
  const dir = temporary(t);
  const app = express(); app.use(express.json());
  app.use('/api/scripts', createScriptsRouter({ dataDir: dir, home: dir }));
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/scripts`;
  const data = await (await fetch(base)).json();
  assert.equal(data.scripts[0].name, 'Pull and run containers');
  const send = (route: string, method: string, token = '', origin?: string) => fetch(base + route, { method,
    headers: { 'Content-Type': 'application/json', 'X-Mihir-Scripts-Token': token, ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify({ script: defaultScript(dir) }) });
  assert.equal((await send('/runs', 'POST')).status, 403);
  assert.equal((await send('/runs', 'POST', data.token, 'http://other.example')).status, 403);
  const badHostStatus = await new Promise<number | undefined>((resolve, reject) => {
    http.get(base, { headers: { Host: 'other.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(badHostStatus, 403);
  assert.equal((await send('/definitions/ray-pull-and-run', 'PUT', data.token)).status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'scripts/definitions.json'), 'utf8'))[0].id, 'ray-pull-and-run');
  const preview = await send('/preview', 'POST', data.token);
  assert.equal(preview.status, 200); assert.match((await preview.json()).source, /pull.sh/);
});

test('Kubernetes monitor discovers replicas and filters logs without failing on no matches', t => {
  const home = temporary(t);
  const bin = path.join(home, 'bin'); fs.mkdirSync(bin);
  const config = path.join(home, 'readonly-config'); fs.writeFileSync(config, 'test-only-placeholder');
  const fixture = path.join(bin, 'kubectl');
  const writeFixture = (logs: string, code = 0, pods = 'ray-job-service-a|Running|uid-a|0,\nray-job-service-b|Running|uid-b|0,\nray-job-service-otherapp|Pending|uid-c|0,\nunrelated-pod|Running|uid-d|0,') => {
    fs.writeFileSync(fixture, '#!/bin/bash\ncase " $* " in\n  *" get pods "*) printf "%s\\n" ' + quoteShell(pods) + ';;\n  *" logs "*) printf "%s\\n" ' + quoteShell(logs) + '; exit ' + code + ';;\nesac\n', { mode: 0o700 });
  };
  const preset = kubernetesPreset(home);
  preset.kubernetes = { ...preset.kubernetes!, kubeconfig: config, follow: false, reconnect: false };
  const run = () => spawnSync('/bin/bash', ['-c', buildScript(validateScript(preset)).source], { encoding: 'utf8', timeout: 5000, env: { ...process.env, PATH: bin + ':' + process.env.PATH } });
  writeFixture('[pod/test/app] 2026-10-22T00:00:00Z INFO started\n[pod/test/app] 2026-10-22T00:00:01Z ERROR example failure');
  let result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ray-job-service-a \| Running/);
  assert.match(result.stdout, /ray-job-service-b \| Running/);
  assert.match(result.stdout, /ERROR example failure/);
  assert.doesNotMatch(result.stdout, /INFO started/);
  assert.doesNotMatch(result.stdout, /unrelated-pod/);
  writeFixture('INFO no errors in this output');
  result = run(); assert.equal(result.status, 0, result.stderr);
  writeFixture('ERROR access forbidden', 1);
  result = run(); assert.notEqual(result.status, 0);
  writeFixture('', 0, 'other-service|Running|uid|0,');
  result = run(); assert.notEqual(result.status, 0); assert.match(result.stdout, /No matching pods/);
  preset.kubernetes.filter = 'all'; writeFixture('INFO visible when All is selected');
  result = run(); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /INFO visible/);
  assert.throws(() => validateKubernetes({ ...preset.kubernetes!, namespace: 'default;bad' }));
});

test('interrupting Kubernetes monitoring cleans up background log processes', async t => {
  const home = temporary(t);
  const bin = path.join(home, 'bin'); fs.mkdirSync(bin);
  const config = path.join(home, 'readonly-config'); fs.writeFileSync(config, 'test-only');
  const childFile = path.join(home, 'log-process.pid');
  fs.writeFileSync(path.join(bin, 'kubectl'), '#!/bin/bash\ncase " $* " in\n *" get pods "*) printf "ray-job-service-a|Running|uid|0,\\n";;\n *" logs "*) echo $$ > ' + quoteShell(childFile) + '; printf "ERROR streaming test\\n"; sleep 30;;\nesac\n', { mode: 0o700 });
  const preset = kubernetesPreset(home);
  preset.kubernetes = { ...preset.kubernetes!, kubeconfig: config };
  const runner = new ScriptRunner(path.join(home, 'runs'));
  const originalPath = process.env.PATH;
  let run;
  try { process.env.PATH = bin + ':' + originalPath; run = runner.start(preset); }
  finally { process.env.PATH = originalPath; }
  const done = finish(runner, run.id);
  await new Promise<void>(resolve => {
    const listener = (event: string, value: any) => { if (event === 'output' && value.includes('ERROR streaming test')) { runner.events.off(run.id, listener); resolve(); } };
    runner.events.on(run.id, listener);
  });
  const pid = Number(fs.readFileSync(childFile, 'utf8'));
  runner.interrupt(run.id); await done;
  assert.equal(run.status, 'Interrupted');
  assert.throws(() => process.kill(pid, 0), /ESRCH|No such process/);
});

test('Kubernetes monitoring rediscovers a replacement pod and stops the old stream', async t => {
  const home = temporary(t);
  const bin = path.join(home, 'bin'); fs.mkdirSync(bin);
  const config = path.join(home, 'readonly-config'); fs.writeFileSync(config, 'test-only');
  const countFile = path.join(home, 'queries');
  const workers = path.join(home, 'workers');
  fs.writeFileSync(path.join(bin, 'kubectl'), '#!/bin/bash\ncase " $* " in\n *" get pods "*)\n  count=0; [[ ! -f ' + quoteShell(countFile) + ' ]] || read -r count < ' + quoteShell(countFile) + '\n  count=$((count+1)); echo "$count" > ' + quoteShell(countFile) + '\n  if (( count == 1 )); then printf "ray-job-service-old|Running|uid-old|0,\\n"; else printf "ray-job-service-new|Running|uid-new|0,\\n"; fi;;\n *" logs "*) echo $$ >> ' + quoteShell(workers) + '; printf "ERROR fixture stream\\n"; sleep 30;;\nesac\n', { mode: 0o700 });
  const preset = kubernetesPreset(home);
  preset.kubernetes = { ...preset.kubernetes!, kubeconfig: config };
  const source = buildScript(preset).source.replaceAll('sleep 10', 'sleep 0.1');
  const runner = new ScriptRunner(path.join(home, 'runs'));
  const originalPath = process.env.PATH;
  let run;
  try { process.env.PATH = bin + ':' + originalPath; run = runner.start({ ...preset, mode: 'custom', customBody: source }); }
  finally { process.env.PATH = originalPath; }
  const done = finish(runner, run.id);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { runner.interrupt(run.id); reject(new Error('Replacement pod was not discovered')); }, 3000);
    const listener = (event: string, value: any) => {
      if (event === 'output' && value.includes('Pod removed: ray-job-service-old')) { clearTimeout(timeout); runner.events.off(run.id, listener); resolve(); }
    };
    runner.events.on(run.id, listener);
  });
  runner.interrupt(run.id); await done;
  const output = runner.output(run.id);
  assert.match(output, /Attaching logs: ray-job-service-old/);
  assert.match(output, /Attaching logs: ray-job-service-new/);
  assert.equal(run.status, 'Interrupted');
  for (const pid of fs.readFileSync(workers, 'utf8').trim().split('\n').map(Number)) {
    assert.throws(() => process.kill(pid, 0), /ESRCH|No such process/);
  }
});

test('pods and ports preset runs only read-only commands and prints service target ports', async t => {
  const home = temporary(t); const bin = path.join(home, 'bin'); fs.mkdirSync(bin);
  const config = path.join(home, 'config'); fs.writeFileSync(config, 'mock config');
  fs.writeFileSync(path.join(bin, 'kubectl'), `#!/bin/bash
case "$*" in
  *'get pods -o wide'*) printf 'NAME READY STATUS\\nray-job-service-123 1/1 Running\\nother-service-123 1/1 Running\\n' ;;
  *'get pods -o=custom-columns='*) printf 'POD CONTAINER PORTS\\nray-job-service-123 job 8080\\nother-service-123 other 9999\\n' ;;
  *'get services -o=custom-columns='*) printf 'SERVICE TYPE PORT TARGET NODEPORT\\nray-job-service ClusterIP 80 8080 <none>\\n' ;;
  *'get endpoints -o wide'*) printf 'NAME ENDPOINTS AGE\\nray-job-service 10.0.0.1:8080 1d\\n' ;;
  *) printf 'unexpected command: %s\\n' "$*" >&2; exit 9 ;;
esac
`, { mode: 0o700 });
  const preset = kubernetesPreset(home); preset.kubernetes = { ...preset.kubernetes!, action: 'inspect', kubeconfig: config };
  const script = buildScript(preset); assert.deepEqual(script.steps.map(step => step.id), ['pods-ports']);
  assert.doesNotMatch(script.source, /kubectl.*(?:delete|apply|port-forward)/);
  const result = spawnSync('/bin/bash', ['-c', script.source], { env: { ...process.env, PATH: bin + ':' + process.env.PATH }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /ray-job-service-123/);
  assert.match(result.stdout, /80 8080/); assert.match(result.stdout, /10.0.0.1:8080/);
  assert.doesNotMatch(result.stdout, /other-service-123/);
  assert.throws(() => validateKubernetes({ ...preset.kubernetes!, action: 'delete' as any }), /Invalid/);
});
