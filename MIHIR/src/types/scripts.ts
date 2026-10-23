export const RAY_CONTAINERS = [
  'jhipster-registry', 'zookeeper', 'kafka', 'ray-mqtt', 'ray-mqtt-proxy',
  'ray-gateway-service', 'raycrate01', 'pgadmin', 'ray-postgresql',
  'ray-hub-dashboard', 'ray-hub-service', 'ray-controller-service', 'ray-job-service',
];

export interface ScriptDefinition {
  id: string;
  name: string;
  description: string;
  cwd: string;
  runAsRoot: boolean;
  mode: 'steps' | 'custom' | 'kubernetes';
  kubernetes?: KubernetesLogSettings;
  customBody: string;
  pull: boolean;
  up: boolean;
  stopAll: boolean;
  finalAction: 'start' | 'restart' | 'none';
  selectedServicesOnly: boolean;
  containers: string[];
}

export interface KubernetesLogSettings {
  action?: 'logs' | 'inspect';
  kubeconfig: string;
  namespace: string;
  podPrefix: string;
  container: string;
  filter: 'errors' | 'warnings' | 'all' | 'custom';
  pattern: string;
  since: string;
  tail: number;
  follow: boolean;
  reconnect: boolean;
}

export interface RunStep { id: string; title: string; status: 'Pending' | 'Running' | 'Passed' | 'Failed' | 'Interrupted'; }
export interface ScriptRun {
  id: string;
  scriptId: string;
  name: string;
  cwd: string;
  runAsRoot: boolean;
  status: 'Running' | 'Passed' | 'Failed' | 'Interrupted' | 'Unknown';
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  stopRequested: boolean;
  outputTruncated: boolean;
  steps: RunStep[];
  processId?: number;
  message?: string;
  mode?: ScriptDefinition['mode'];
  exclusive?: boolean;
  target?: string;
  namespace?: string;
}
