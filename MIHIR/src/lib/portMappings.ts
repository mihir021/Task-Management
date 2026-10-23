import type { KubernetesInventory } from '../types/kubernetesInventory';

export const PORT_MAPPINGS = [
  { app: 'Ray app', service: 'ray-controller-service' },
  { app: 'Job app', service: 'ray-job-service' },
  { app: 'Gateway', service: 'ray-gateway-service' },
  { app: 'Hub app', service: 'ray-hub-service' },
];
export function matchesPortService(name: string, service: string) {
  return name === service || name.startsWith(`${service}-`);
}
export function mappedInventory(inventory: KubernetesInventory, selected = ''): KubernetesInventory {
  const mappings = PORT_MAPPINGS.filter(item => !selected || item.service === selected);
  const matches = (name: string) => mappings.some(item => matchesPortService(name, item.service));
  return { ...inventory, pods: inventory.pods.filter(pod => matches(pod.name)),
    services: inventory.services.filter(service => matches(service.name)),
    endpoints: inventory.endpoints.filter(endpoint => matches(endpoint.service)) };
}
