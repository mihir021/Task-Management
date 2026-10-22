import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { EventEmitter } from 'node:events';
import { buildScript, quoteShell, validateScript } from './scriptBuilder';
import type { ScriptDefinition, ScriptRun } from '../src/types/scripts';

const MAX_LOG_BYTES = 5 * 1024 * 1024;
export class ScriptRunner {
  readonly events = new EventEmitter();
  readonly runs = new Map<string, ScriptRun>();
  private active = new Map<string, { run: ScriptRun; child: ChildProcessWithoutNullStreams }>();
  constructor(readonly runDir: string) {
    fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
    this.events.setMaxListeners(50);
    for (const file of fs.readdirSync(runDir).filter(name => /^[\w-]+\.json$/.test(name))) {
      try {
        const run = JSON.parse(fs.readFileSync(path.join(runDir, file), 'utf8')) as ScriptRun;
        if (run.status === 'Running') {
          run.status = 'Unknown';
          run.message = 'The app server restarted before an exit result was recorded. Check the processes before running again.';
        }
        this.runs.set(run.id, run);
      } catch { /* An incomplete metadata file is not an executable script. */ }
    }
  }
  private file(id: string, ext: string) { return path.join(this.runDir, id + ext); }
  private persist(run: ScriptRun) {
    const file = this.file(run.id, '.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(run, null, 2), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
  }
  list() { return [...this.runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 30); }
  get(id: string) { const run = this.runs.get(id); if (!run) throw new Error('Run not found.'); return run; }
  output(id: string, tail = false) {
    this.get(id);
    const file = this.file(id, '.log');
    if (!fs.existsSync(file)) return '';
    const size = fs.statSync(file).size;
    const start = tail ? Math.max(0, size - 200000) : 0;
    const descriptor = fs.openSync(file, 'r');
    try {
      const bytes = Buffer.alloc(Math.min(size - start, MAX_LOG_BYTES));
      fs.readSync(descriptor, bytes, 0, bytes.length, start);
      return (start ? '[Earlier output omitted from terminal replay; use Download output.]\r\n' : '') + bytes.toString('utf8');
    } finally { fs.closeSync(descriptor); }
  }
  start(definition: ScriptDefinition) {
    const script = validateScript(definition);
    const exclusive = script.runAsRoot || script.mode === 'steps';
    if (this.active.size >= 3) throw new Error('Three sessions are already running. Stop one before starting another.');
    if (this.active.size && (exclusive || [...this.active.values()].some(item => item.run.exclusive))) {
      throw new Error('Root and Docker workflows run exclusively. Stop other sessions before starting this workflow.');
    }
    for (const run of this.runs.values()) {
      if (run.status === 'Unknown' && run.processId) {
        try { process.kill(run.processId, 0); }
        catch { continue; }
        throw new Error('A previous script process may still be running after a server restart. Check it in your system terminal first.');
      }
    }
    if (!fs.statSync(script.cwd).isDirectory()) throw new Error('Base directory does not exist.');
    const { source, steps } = buildScript(script);
    const syntax = spawnSync('/bin/bash', ['-n'], { input: source, timeout: 2000, encoding: 'utf8' });
    if (syntax.status !== 0) throw new Error('Bash syntax error: ' + (syntax.stderr || 'Unable to validate script.').slice(0, 2000));
    const id = randomUUID();
    const scriptFile = this.file(id, '.sh');
    fs.writeFileSync(scriptFile, source, { mode: 0o600 });
    fs.writeFileSync(this.file(id, '.log'), '', { mode: 0o600 });
    const run: ScriptRun = { id, scriptId: script.id, name: script.name, cwd: script.cwd, runAsRoot: script.runAsRoot,
      status: 'Running', startedAt: new Date().toISOString(), finishedAt: null, exitCode: null, stopRequested: false, outputTruncated: false, steps,
      mode: script.mode, exclusive, target: script.mode === 'kubernetes' ? script.kubernetes?.podPrefix : undefined,
      namespace: script.mode === 'kubernetes' ? script.kubernetes?.namespace : undefined };
    this.runs.set(id, run);
    const root = script.runAsRoot && process.getuid?.() !== 0;
    // Keep the user's existing HOME so the supplied ~/ray paths still work.
    const command = (root ? '/usr/bin/sudo --preserve-env=HOME -- ' : '') + '/bin/bash --noprofile --norc ' + quoteShell(scriptFile);
    const env: NodeJS.ProcessEnv = {};
    for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL']) if (process.env[key]) env[key] = process.env[key];
    env.TERM = 'xterm-256color';
    const child = spawn('/usr/bin/script', ['--quiet', '--return', '--flush', '--echo', 'never', '--command', command, '/dev/null'], {
      cwd: script.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true,
    });
    run.processId = child.pid;
    this.active.set(id, { run, child });
    this.persist(run);
    const decoder = new StringDecoder('utf8');
    let lineBuffer = '';
    let storedBytes = 0;
    const output = (text: string) => {
      if (!text) return;
      const bytes = Buffer.from(text);
      if (storedBytes < MAX_LOG_BYTES) {
        const part = bytes.subarray(0, MAX_LOG_BYTES - storedBytes);
        fs.appendFileSync(this.file(id, '.log'), part);
        storedBytes += part.length;
      }
      if (bytes.length && storedBytes >= MAX_LOG_BYTES && !run.outputTruncated) { run.outputTruncated = true; this.persist(run); }
      lineBuffer = (lineBuffer + text).slice(-100000);
      const markers = /\x1b\]777;MIHIR_STEP:([\w-]+):(Running|Passed)\x07/g;
      let match: RegExpExecArray | null;
      let consumed = 0;
      while ((match = markers.exec(lineBuffer))) {
        consumed = markers.lastIndex;
        const [, stepId, stepStatus] = match;
        const step = run.steps.find(item => item.id === stepId);
        if (step) { step.status = stepStatus as 'Running' | 'Passed'; this.persist(run); this.events.emit(id, 'status', run); }
      }
      if (consumed) lineBuffer = lineBuffer.slice(consumed);
      this.events.emit(id, 'output', text);
    };
    child.stdout.on('data', bytes => output(decoder.write(bytes)));
    child.stderr.on('data', bytes => output(bytes.toString('utf8')));
    child.stdin.on('error', () => { /* Closing a finished PTY can race a final keystroke. */ });
    let finished = false;
    const finish = (code: number | null, message?: string) => {
      if (finished) return; finished = true;
      output(decoder.end());
      run.exitCode = code; run.finishedAt = new Date().toISOString();
      run.status = run.stopRequested ? 'Interrupted' : code === 0 ? 'Passed' : 'Failed';
      run.message = message;
      for (const step of run.steps) if (step.status === 'Running') step.status = run.status === 'Passed' ? 'Passed' : run.status === 'Interrupted' ? 'Interrupted' : 'Failed';
      this.active.delete(id);
      this.persist(run); this.events.emit(id, 'status', run);
      child.stdin.end();
    };
    child.on('error', error => { output('\r\nUnable to open local terminal: ' + error.message + '\r\n'); finish(null, error.message); });
    child.on('close', code => finish(code));
    return run;
  }
  input(id: string, data: string) {
    const session = this.active.get(id);
    if (!session) throw new Error('This run has no active terminal.');
    session.child.stdin.write(data);
  }
  interrupt(id: string) {
    const run = this.get(id);
    const session = this.active.get(id);
    if (!session) throw new Error('This run has no active terminal.');
    run.stopRequested = true;
    // Ctrl+C travels through the PTY to the foreground process, including sudo.
    session.child.stdin.write('\x03');
    this.persist(run); this.events.emit(id, 'status', run);
    return run;
  }
}
