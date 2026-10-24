import type { KubernetesLogSettings } from '../types/scripts';
export type InventoryResource = 'pods' | 'services' | 'endpointslices';
export const INVENTORY_RESOURCES: InventoryResource[] = ['pods', 'services', 'endpointslices'];
export function inventoryArgs(resource: InventoryResource, settings: Pick<KubernetesLogSettings, 'kubeconfig' | 'namespace'>) {
  return ['--kubeconfig', settings.kubeconfig, '--namespace', settings.namespace, '--request-timeout=8s', 'get', resource, '-o', 'json'];
}
export function quoteCommandArg(value: string) { return /^[a-zA-Z0-9_./:=+-]+$/.test(value) ? value : "'" + value.replace(/'/g, "'\\''") + "'"; }
export function inventoryCommandPreview(settings: Pick<KubernetesLogSettings, 'kubeconfig' | 'namespace'>, prefixes: string[]) {
  return prefixes.map(prefix => `# ${prefix} — keep matching names in the runner\n` + INVENTORY_RESOURCES.map(resource => ['kubectl', ...inventoryArgs(resource, settings)].map(quoteCommandArg).join(' ')).join('\n')).join('\n\n');
}
