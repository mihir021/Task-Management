import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ScriptDefinition } from '../src/types/scripts';

export function resolveRunnerHome(options: { home?: string; sudoUser?: string; ownerUid?: number; passwd?: string; override?: string } = {}) {
  const home = options.home ?? os.homedir();
  const override = options.override ?? process.env.MIHIR_RUNNER_HOME;
  if (override) {
    if (!path.isAbsolute(override) || /[\0\r\n]/.test(override)) throw new Error('MIHIR_RUNNER_HOME must be an absolute directory.');
    return override;
  }
  if (home !== '/root') return home;
  // sudo su changes HOME; the repository owner's account still identifies this workspace.
  try {
    const accounts = (options.passwd ?? fs.readFileSync('/etc/passwd', 'utf8')).split('\n').map(line => line.split(':'));
    const sudoUser = options.sudoUser ?? process.env.SUDO_USER;
    const ownerUid = options.ownerUid ?? fs.statSync(new URL('../../package.json', import.meta.url)).uid;
    const account = accounts.find(parts => parts.length >= 7 && Boolean(sudoUser) && parts[0] === sudoUser && parts[2] !== '0')
      || accounts.find(parts => parts.length >= 7 && Number(parts[2]) === ownerUid && parts[2] !== '0');
    if (account?.[5] && path.isAbsolute(account[5])) return account[5];
  } catch { /* Fall back to the current account if user lookup is unavailable. */ }
  return home;
}

export function repairRootKubeconfig(script: ScriptDefinition, home: string, readable = (file: string) => {
  try { fs.accessSync(file, fs.constants.R_OK); return true; } catch { return false; }
}): ScriptDefinition {
  const oldPath = '/root/TEMP/k8s-readonly-user-raylife';
  const candidate = path.join(home, 'TEMP/k8s-readonly-user-raylife');
  if (!/^kubernetes-ray-(job|hub|controller)-(logs|ports)$/.test(script.id)
    || script.kubernetes?.kubeconfig !== oldPath || readable(oldPath) || !readable(candidate)) return script;
  return { ...script, cwd: script.cwd === '/root' ? home : script.cwd,
    kubernetes: { ...script.kubernetes, kubeconfig: candidate } };
}
