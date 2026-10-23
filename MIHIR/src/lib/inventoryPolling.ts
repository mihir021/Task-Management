export const INVENTORY_REFRESH_MS = 30_000;

// One request at a time. Pause and unmount clear timers; stopped requests cannot overwrite a newer view.
export function startInventoryPolling<T>(options: {
  read: (signal: AbortSignal) => Promise<T>;
  onResult: (value: T) => void; onError: (error: unknown) => void;
  onBusy: (busy: boolean) => void; onSchedule: (deadline: number | null) => void;
  intervalMs?: number;
}) {
  let automatic = true;
  let stopped = false;
  let busy = false;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { clearTimeout(timer); options.onSchedule(null); };
  const refresh = async () => {
    if (stopped || busy) return;
    clear(); busy = true; options.onBusy(true); controller = new AbortController();
    try {
      const value = await options.read(controller.signal);
      if (!stopped) options.onResult(value);
    } catch (error) { if (!stopped) options.onError(error); }
    finally {
      busy = false;
      if (!stopped) {
        options.onBusy(false);
        if (automatic) {
          const interval = options.intervalMs ?? INVENTORY_REFRESH_MS;
          options.onSchedule(Date.now() + interval);
          timer = setTimeout(refresh, interval);
        }
      }
    }
  };
  void refresh();
  return {
    refresh,
    pause() { automatic = false; clear(); },
    resume() { if (stopped || automatic) return; automatic = true; void refresh(); },
    stop() { stopped = true; clearTimeout(timer); controller?.abort(); },
  };
}
