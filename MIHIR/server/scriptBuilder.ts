import path from 'node:path';
import { RAY_CONTAINERS, type ScriptDefinition, type RunStep } from '../src/types/scripts';
import { validateKubernetes, buildKubernetes, buildKubernetesInspection } from './kubernetesScript';

export function quoteShell(value: string) { return "'" + value.replace(/'/g, "'\\''") + "'"; }

export function defaultScript(home: string): ScriptDefinition {
  return {
    id: 'ray-pull-and-run', name: 'Pull and run containers',
    description: 'Pull recent Ray images, bring up the stack, then start the selected containers.',
    cwd: home, runAsRoot: true, mode: 'steps', customBody: '',
    pull: true, up: true, stopAll: false, finalAction: 'start', selectedServicesOnly: false,
    containers: [...RAY_CONTAINERS],
  };
}

export function validateScript(body: unknown): ScriptDefinition {
  const value = body as ScriptDefinition;
  if (!value || typeof value.id !== 'string' || !/^[\w-]{1,100}$/.test(value.id)
      || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100
      || typeof value.cwd !== 'string' || !path.isAbsolute(value.cwd) || /[\0\r\n]/.test(value.cwd)
      || !['steps', 'custom', 'kubernetes'].includes(value.mode)
      || typeof value.customBody !== 'string' || value.customBody.length > 64000 || value.customBody.includes('\0')
      || !['start', 'restart', 'none'].includes(value.finalAction)
      || !Array.isArray(value.containers) || value.containers.length > 50
      || value.containers.some(name => typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(name))
      || ['runAsRoot', 'pull', 'up', 'stopAll', 'selectedServicesOnly'].some(key => typeof (value as any)[key] !== 'boolean')) {
    throw new Error('Invalid script settings. Check the name, base directory, steps and container names.');
  }
  if (value.mode === 'custom' && !value.customBody.trim()) throw new Error('Enter commands for the custom script.');
  const kubernetes = value.mode === 'kubernetes' ? validateKubernetes(value.kubernetes) : value.kubernetes;
  if (value.mode === 'steps' && !value.pull && !value.up && !value.stopAll && value.finalAction === 'none') throw new Error('Select at least one step.');
  if (value.mode === 'steps' && (value.finalAction !== 'none' || value.selectedServicesOnly) && !value.containers.length) throw new Error('Select at least one container/service.');
  return {
    id: value.id, name: value.name.trim(), description: String(value.description || '').slice(0, 1000),
    cwd: value.cwd, runAsRoot: value.runAsRoot, mode: value.mode, customBody: value.customBody,
    pull: value.pull, up: value.up, stopAll: value.stopAll, finalAction: value.finalAction,
    selectedServicesOnly: value.selectedServicesOnly, containers: [...new Set(value.containers)],
    ...(kubernetes ? { kubernetes } : {}),
  };
}

export function buildScript(script: ScriptDefinition): { source: string; steps: RunStep[] } {
  const steps: RunStep[] = [];
  const lines = [
    '#!/usr/bin/env bash', 'set -Eeuo pipefail',
    `cd -- ${quoteShell(script.cwd)}`,
    'printf "\\033[1;36mMIHIR Scripts · local terminal\\033[0m\\n"',
    'printf "User: %s | Directory: %s\\n" "$(id -un)" "$PWD"',
  ];
  function step(id: string, title: string, commands: string) {
    steps.push({ id, title, status: 'Pending' });
    // An OSC control message carries step state without cluttering the terminal.
    lines.push(`printf '\\033]777;MIHIR_STEP:${id}:Running\\007'`, `printf '\\n%s\\n' ${quoteShell(title)}`, commands,
      `printf '\\033]777;MIHIR_STEP:${id}:Passed\\007'`);
  }
  if (script.mode === 'kubernetes') {
    if (script.kubernetes?.action === 'inspect') {
      step('pods-ports', 'Inspect pods, container ports and services', buildKubernetesInspection(validateKubernetes(script.kubernetes)));
    } else {
    const kubernetes = buildKubernetes(validateKubernetes(script.kubernetes));
    step('kube-check', 'Check Kubernetes log settings', kubernetes.setup);
    step('pod-logs', 'Discover pods and monitor logs', kubernetes.monitor);
    }
  } else if (script.mode === 'custom') step('custom', 'Run custom commands', script.customBody);
  else {
    const services = script.selectedServicesOnly ? ' ' + script.containers.map(quoteShell).join(' ') : '';
    if (script.pull) step('pull', 'Pull recent container images', `bash -e -- ${quoteShell(path.join(script.cwd, 'ray/docker/scripts/pull.sh'))}${services}`);
    if (script.up) step('up', 'Bring up the Ray stack', `bash -e -- ${quoteShell(path.join(script.cwd, 'ray/docker/scripts/up.sh'))}${services}`);
    if (script.stopAll) step('stop-all', 'Stop ALL running Docker containers', [
      'mihir_running_ids=$(docker ps -q)',
      'if [[ -n "$mihir_running_ids" ]]; then',
      '  mapfile -t mihir_running_array <<< "$mihir_running_ids"',
      '  docker stop "${mihir_running_array[@]}"',
      'else printf "No running containers to stop.\\n"; fi',
    ].join('\n'));
    if (script.finalAction !== 'none') step(script.finalAction, `${script.finalAction === 'start' ? 'Start' : 'Restart'} selected containers`,
      `docker ${script.finalAction} ${script.containers.map(quoteShell).join(' ')}`);
    if ((script.finalAction !== 'none' || script.up) && script.containers.length) step('status', 'Show container status and health',
      `docker inspect --format ${quoteShell('{{.Name}} | {{.State.Status}} | {{if .State.Health}}{{.State.Health.Status}}{{else}}no healthcheck{{end}}')} ${script.containers.map(quoteShell).join(' ')}`);
  }
  lines.push('printf "\\n\\033[1;32mScript completed successfully.\\033[0m\\n"');
  return { source: lines.join('\n') + '\n', steps };
}
