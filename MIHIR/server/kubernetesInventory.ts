import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import type { KubernetesLogSettings } from '../src/types/scripts';
import type { KubernetesInventory, PodInventoryRow } from '../src/types/kubernetesInventory';
import { inventoryArgs } from '../src/lib/inventoryCommands';
import { validateKubernetes } from './kubernetesScript';

const execute = promisify(execFile);
const list = (value: unknown): any[] => Array.isArray(value) ? value : [];
const text = (value: unknown) => typeof value === 'string' ? value.slice(0, 300) : '';
const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
const errorText = (error: any) => text(error?.code === 'ENOENT' ? 'kubectl was not found in the local runner PATH.'
  : error?.killed ? 'Kubernetes request timed out. Check your cluster connection.'
  : error?.stderr?.trim() || error?.message || 'Kubernetes request failed.');
export type InventoryQuery = (resource: 'pods' | 'services' | 'endpointslices', settings: KubernetesLogSettings, signal?: AbortSignal) => Promise<unknown>;

export const queryInventory: InventoryQuery = async (resource, settings, signal) => {
  const { stdout } = await execute('kubectl', inventoryArgs(resource, settings), { timeout: 9500, maxBuffer: 8 * 1024 * 1024, signal,
      env: Object.fromEntries(['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : [])),
    });
  return JSON.parse(stdout);
};

// Return only display fields. Kubeconfig contents, pod environment variables and annotations never leave this computer.
export function parseInventory(settings: KubernetesLogSettings, podData: any, serviceData: any, endpointData: any, warnings: string[] = [], now = new Date()): KubernetesInventory {
  if (!Array.isArray(podData?.items)) throw new Error('Kubernetes returned an invalid pod list.');
  const matched = list(podData?.items).filter(pod => text(pod?.metadata?.name).startsWith(settings.podPrefix));
  const pods: PodInventoryRow[] = matched.map(pod => {
    const statuses = list(pod.status?.containerStatuses);
    const containers = list(pod.spec?.containers);
    const ready = statuses.filter(status => status.ready === true).length;
    const failed = [...list(pod.status?.initContainerStatuses), ...statuses].find(status =>
      status.state?.waiting && !['ContainerCreating', 'PodInitializing'].includes(status.state.waiting.reason)
      || status.state?.terminated?.exitCode > 0);
    const terminating = Boolean(pod.metadata?.deletionTimestamp);
    const phase = text(pod.status?.phase) || 'Unknown';
    const status = terminating ? 'Terminating' : text(failed?.state?.waiting?.reason || failed?.state?.terminated?.reason) || phase;
    const health: PodInventoryRow['health'] = terminating ? 'terminating' : failed || phase === 'Failed' ? 'error' : phase === 'Succeeded' ? 'completed'
      : phase === 'Running' && ready === containers.length && containers.length > 0 ? 'healthy' : 'starting';
    return { name: text(pod.metadata?.name), uid: text(pod.metadata?.uid), ready, total: containers.length, status, health,
      restarts: statuses.reduce((sum, status) => sum + count(status.restartCount), 0),
      createdAt: Number.isFinite(Date.parse(pod.metadata?.creationTimestamp)) ? pod.metadata.creationTimestamp : null,
      ip: text(pod.status?.podIP), node: text(pod.spec?.nodeName),
      ports: containers.flatMap(container => list(container.ports).map(port => ({ container: text(container.name), port: count(port.containerPort), protocol: text(port.protocol) || 'TCP' }))),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const services = list(serviceData?.items).filter(service => {
    const selectors = Object.entries(service.spec?.selector || {});
    return text(service.metadata?.name).startsWith(settings.podPrefix)
      || selectors.length > 0 && matched.some(pod => selectors.every(([key, value]) => pod.metadata?.labels?.[key] === value));
  }).map(service => ({ name: text(service.metadata?.name), type: text(service.spec?.type), clusterIP: text(service.spec?.clusterIP),
    ports: list(service.spec?.ports).map(port => ({ name: text(port.name), port: count(port.port), targetPort: String(port.targetPort ?? port.port ?? ''),
      nodePort: typeof port.nodePort === 'number' ? port.nodePort : null, protocol: text(port.protocol) || 'TCP' })),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const names = new Set(services.map(service => service.name));
  const endpoints = list(endpointData?.items).filter(slice => {
    const name = text(slice.metadata?.labels?.['kubernetes.io/service-name']);
    return names.has(name) || name.startsWith(settings.podPrefix);
  }).flatMap(slice => list(slice.endpoints).flatMap(endpoint => list(endpoint.addresses).map(address => ({
    service: text(slice.metadata?.labels?.['kubernetes.io/service-name']), address: text(address),
    ready: typeof endpoint.conditions?.ready === 'boolean' ? endpoint.conditions.ready : null,
    ports: list(slice.ports).map(port => `${count(port.port)}/${text(port.protocol) || 'TCP'}`),
  }))));
  return { observedAt: now.toISOString(), namespace: settings.namespace, podPrefix: settings.podPrefix, pods, services, endpoints, warnings };
}

export async function inspectKubernetes(raw: KubernetesLogSettings, query: InventoryQuery = queryInventory, signal?: AbortSignal): Promise<KubernetesInventory> {
  const settings = validateKubernetes(raw);
  try { fs.accessSync(settings.kubeconfig, fs.constants.R_OK); }
  catch { throw new Error(`Cannot read kubeconfig: ${settings.kubeconfig}. Choose the full path under your user account; sudo su may change HOME to /root.`); }
  const resources = ['pods', 'services', 'endpointslices'] as const;
  const result = await Promise.allSettled(resources.map(resource => query(resource, settings, signal)));
  if (result[0].status === 'rejected') throw new Error('Unable to list pods. ' + errorText(result[0].reason));
  const warnings = result.flatMap((value, index) => value.status === 'rejected' ? [`Could not read ${resources[index]}: ${errorText(value.reason)}`] : []);
  return parseInventory(settings, result[0].value,
    result[1].status === 'fulfilled' ? result[1].value : null,
    result[2].status === 'fulfilled' ? result[2].value : null, warnings);
}
