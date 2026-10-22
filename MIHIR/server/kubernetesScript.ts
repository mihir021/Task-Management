import path from 'node:path';
import fs from 'node:fs';
import type { KubernetesLogSettings, ScriptDefinition } from '../src/types/scripts';

const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";

export function kubernetesPreset(home: string): ScriptDefinition {
  return {
    id: 'kubernetes-ray-job-logs', name: 'Kubernetes · ray-job-service logs',
    description: 'Read-only log monitoring across the current ray-job-service pods.', cwd: home,
    runAsRoot: false, mode: 'kubernetes', customBody: '', pull: false, up: false, stopAll: false,
    finalAction: 'none', selectedServicesOnly: false, containers: [],
    kubernetes: { kubeconfig: path.join(home, 'TEMP/k8s-readonly-user-raylife'), namespace: 'default',
      podPrefix: 'ray-job-service', container: '', filter: 'errors', pattern: 'ERROR', since: '10m',
      tail: 200, follow: true, reconnect: true },
  };
}

export function kubernetesServicePresets(home: string): ScriptDefinition[] {
  const base = kubernetesPreset(home);
  return [base, ...['hub', 'controller'].map(service => ({
    ...base, id: `kubernetes-ray-${service}-logs`, name: `Kubernetes · ray-${service}-service logs`,
    kubernetes: { ...base.kubernetes!, podPrefix: `ray-${service}-service` },
  }))];
}

export function validateKubernetes(value: KubernetesLogSettings | undefined): KubernetesLogSettings {
  if (!value || typeof value.kubeconfig !== 'string' || !path.isAbsolute(value.kubeconfig) || /[\0\r\n]/.test(value.kubeconfig)
    || typeof value.namespace !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(value.namespace)
    || typeof value.podPrefix !== 'string' || !/^[a-z0-9][a-z0-9.-]{0,252}$/.test(value.podPrefix)
    || typeof value.container !== 'string' || (value.container && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(value.container))
    || !['errors', 'warnings', 'all', 'custom'].includes(value.filter)
    || typeof value.pattern !== 'string' || value.pattern.length > 300 || /[\0\r\n]/.test(value.pattern)
    || (value.filter === 'custom' && !value.pattern.trim())
    || typeof value.since !== 'string' || !/^[1-9][0-9]{0,4}[smh]$/.test(value.since)
    || !Number.isInteger(value.tail) || value.tail < 1 || value.tail > 10000
    || typeof value.follow !== 'boolean' || typeof value.reconnect !== 'boolean') {
    throw new Error('Invalid Kubernetes settings. Set a kubeconfig path, namespace, pod prefix, history such as 10m, and 1–10000 tail lines.');
  }
  return { ...value };
}

export function buildKubernetes(settings: KubernetesLogSettings) {
  const filter = settings.filter === 'all' ? '' : settings.filter === 'errors' ? 'ERROR' : settings.filter === 'warnings' ? 'ERROR|WARN' : settings.pattern;
  const setup = [
    `export KUBECONFIG=${quote(settings.kubeconfig)}`,
    '[[ -r "$KUBECONFIG" ]] || { printf "Kubeconfig file is not readable.\\n" >&2; exit 1; }',
    'command -v kubectl >/dev/null || { printf "kubectl is not installed or is not in PATH.\\n" >&2; exit 1; }',
    'command -v setsid >/dev/null || { printf "setsid is required to manage log streams.\\n" >&2; exit 1; }',
    `export monitor_namespace=${quote(settings.namespace)}`,
    `monitor_pod_prefix=${quote(settings.podPrefix)}`,
    `export monitor_container=${quote(settings.container)}`,
    `export monitor_filter=${quote(filter)}`,
    `export monitor_since=${quote(settings.since)}`,
    `export monitor_tail=${settings.tail}`,
    `export monitor_follow=${settings.follow ? 'true' : 'false'}`,
    `monitor_reconnect=${settings.reconnect && settings.follow ? 'true' : 'false'}`,
    'if [[ -n "$monitor_filter" ]]; then',
    '  monitor_grep_code=0; printf "" | grep -Ei -- "$monitor_filter" >/dev/null || monitor_grep_code=$?',
    '  (( monitor_grep_code <= 1 )) || { printf "Invalid custom log filter.\\n" >&2; exit 1; }',
    'fi',
    'printf "Namespace: %s | Pod prefix: %s | Filter: %s\\n" "$monitor_namespace" "$monitor_pod_prefix" "${monitor_filter:-ALL}"',
    'printf "Read-only: get pods + logs. Ctrl+C stops monitoring.\\n"',
  ].join('\n');
  return { setup, monitor: fs.readFileSync(new URL('./kubernetes-monitor.sh', import.meta.url), 'utf8') };
}
