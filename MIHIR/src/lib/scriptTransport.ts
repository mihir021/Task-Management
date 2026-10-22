export const LOCAL_RUNNER_URL = 'http://127.0.0.1:43123';
export const RUNNER_TOKEN_KEY = 'mihir_terminal_pairing';
export const isLocalWorkspace = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);

// Explicitly identify loopback requests for browsers enforcing Local Network Access.
const loopbackOptions = (base: string): RequestInit & { targetAddressSpace?: 'loopback' } => base ? { targetAddressSpace: 'loopback' } : {};

export function scriptHeaders(token: string, json = false): Record<string, string> {
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Mihir-Scripts-Token': token } : {}) };
}
export async function scriptRequest<T>(base: string, token: string, route: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(base + '/api/scripts' + route, { ...loopbackOptions(base), method, signal: signal || AbortSignal.timeout(10000), credentials: 'omit',
      headers: scriptHeaders(token, body !== undefined), body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(base ? 'Local terminal runner is unreachable. Start npm run terminal:runner on this computer and allow local network access if your browser asks.' : 'Scripts server is unreachable. Check that the local app is running.');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Scripts API is unavailable here. Connect the local terminal runner to receive output from this computer.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Scripts request failed (${response.status}).`);
  return result;
}

// Fetch streaming supports an authentication header; EventSource cannot set one.
// The token never appears in request URLs, history, or downloaded output.
export function followScriptEvents(base: string, token: () => string, id: string,
  onEvent: (name: string, data: any) => boolean | void,
  onConnection: (connected: boolean) => void, onError: (message: string) => void) {
  const controller = new AbortController();
  const signal = controller.signal;
  const follow = async () => {
    while (!signal.aborted) {
      try {
        const response = await fetch(`${base}/api/scripts/runs/${encodeURIComponent(id)}/events`, {
          ...loopbackOptions(base), signal, credentials: 'omit', headers: scriptHeaders(token()),
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
          throw new Error(response.status === 403 ? 'Local runner pairing expired. Reconnect with its current token.' : 'Terminal stream unavailable. Check the local runner.');
        }
        onConnection(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (!signal.aborted) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
            let boundary: number;
            while ((boundary = buffer.indexOf('\n\n')) >= 0) {
              const packet = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
              const name = packet.split('\n').find(line => line.startsWith('event:'))?.slice(6).trim();
              const data = packet.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
              if (name && data && onEvent(name, JSON.parse(data)) === false) { controller.abort(); return; }
            }
            if (buffer.length > 8 * 1024 * 1024) throw new Error('Terminal stream packet exceeded the supported size.');
          }
        } finally { await reader.cancel().catch(() => {}); }
      } catch (error: any) { if (!signal.aborted) onError(error.message || 'Terminal connection lost. Reconnecting…'); }
      finally { onConnection(false); }
      if (!signal.aborted) await new Promise<void>(resolve => {
        const cancel = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 1500);
        signal.addEventListener('abort', cancel, { once: true });
      });
    }
  };
  void follow();
  return () => controller.abort();
}

export async function downloadScriptOutput(base: string, token: string, id: string) {
  const response = await fetch(`${base}/api/scripts/runs/${encodeURIComponent(id)}/output`, { ...loopbackOptions(base), credentials: 'omit', headers: scriptHeaders(token) });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/plain')) throw new Error('Unable to download terminal output. Check the local runner connection.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = `terminal-${id}.txt`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
