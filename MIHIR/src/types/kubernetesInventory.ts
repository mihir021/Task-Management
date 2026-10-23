export interface PodInventoryRow {
  name: string; uid: string; ready: number; total: number; status: string;
  health: 'healthy' | 'starting' | 'error' | 'terminating' | 'completed';
  restarts: number; createdAt: string | null; ip: string; node: string;
  ports: { container: string; port: number; protocol: string }[];
}
export interface ServiceInventoryRow {
  name: string; type: string; clusterIP: string;
  ports: { name: string; port: number; targetPort: string; nodePort: number | null; protocol: string }[];
}
export interface EndpointInventoryRow { service: string; address: string; ready: boolean | null; ports: string[]; }
export interface KubernetesInventory {
  observedAt: string; namespace: string; podPrefix: string;
  pods: PodInventoryRow[]; services: ServiceInventoryRow[]; endpoints: EndpointInventoryRow[];
  warnings: string[];
}
