export interface ScriptLogRow {
  id: number;
  kind: 'log' | 'system';
  timestamp: string;
  pod: string;
  container: string;
  level: string;
  message: string;
  logger: string;
  thread: string;
  traceId: string;
  stack: string;
  continuation: string;
  raw: string;
  payload: Record<string, unknown> | null;
  truncated: boolean;
}

const MAX_ROW = 256000;
const MAX_BUFFER = 2000000;
const MAX_ROWS = 500;
const timestampPattern = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s*/;
const text = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);

function cleanControls(value: string) {
  return value.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

function decodeJson(value: string): Record<string, unknown> | null {
  let decoded: unknown = value;
  for (let depth = 0; depth < 3 && typeof decoded === 'string'; depth++) {
    try { decoded = JSON.parse(decoded); } catch { return null; }
  }
  return decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded as Record<string, unknown> : null;
}

export function readableLogText(value: string) {
  const decoded = decodeJson(value.trim());
  if (decoded) return JSON.stringify(decoded, null, 2);
  // Decode common escaped formatting for inspection, keeping original raw data
  // separately. Do not interpret or execute embedded HTML or shell commands.
  return value.replace(/\\{1,4}r\\{1,4}n/g, '\n').replace(/\\{1,4}n/g, '\n')
    .replace(/\\{1,4}t/g, '    ').replace(/\\{1,4}"/g, '"');
}

export function logSummary(value: string, max = 190) {
  const first = readableLogText(value.slice(0, 4000)).split('\n').find(line => line.trim()) || '(empty message)';
  const compact = first.replace(/\s+/g, ' ').trim();
  return compact.length > max ? compact.slice(0, max - 1) + '…' : compact;
}

export class ScriptLogParser {
  private pending = '';
  private rows: ScriptLogRow[] = [];
  private sequence = 0;
  private bytes = 0;
  reset() { this.pending = ''; this.rows = []; this.sequence = 0; this.bytes = 0; }
  records() { return [...this.rows]; }
  ingest(chunk: string) {
    this.pending += chunk;
    let newline: number;
    while ((newline = this.pending.indexOf('\n')) !== -1) {
      const line = this.pending.slice(0, newline);
      this.pending = this.pending.slice(newline + 1);
      this.add(line);
    }
    if (this.pending.length > 1024000) {
      this.add(this.pending.slice(0, MAX_ROW), true);
      this.pending = '';
    }
  }
  finish() { if (this.pending.trim()) this.add(this.pending); this.pending = ''; }
  private add(original: string, alreadyTruncated = false) {
    const truncated = alreadyTruncated || original.length > MAX_ROW;
    const clean = cleanControls(original);
    const raw = clean.slice(0, MAX_ROW);
    if (!raw.trim()) return;
    let body = clean;
    const source = body.match(/^\[pod\/([^/\]]+)\/([^\]]+)\]\s*/);
    const pod = source?.[1] || '';
    const container = source?.[2] || '';
    if (source) body = body.slice(source[0].length);
    const time = body.match(timestampPattern);
    if (time) body = body.slice(time[0].length);
    const payload = decodeJson(body);
    const timestamp = time?.[1] || text(payload?.['@timestamp'] || payload?.timestamp || payload?.time);
    const levelText = text(payload?.level || payload?.severity || payload?.log_level).toUpperCase();
    const plainLevel = body.slice(0, 200).match(/\b(FATAL|ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE)\b/i)?.[1]?.toUpperCase();
    const systemError = !pod && !timestamp && !payload && /^(?:error[: ]|fatal[: ]|Unable to connect|Kubeconfig file is not readable|kubectl is not installed|\[monitor\] (?:Pod query failed|Log stream repeatedly failed))/i.test(body);
    const level = (systemError ? 'ERROR' : levelText || (pod || timestamp ? plainLevel : '') || (pod || payload ? 'UNKNOWN' : 'SYSTEM')).replace('WARNING', 'WARN');
    const last = this.rows[this.rows.length - 1];
    if (!payload && last?.kind === 'log' && (!pod || pod === last.pod)
      && /^\s*(?:at\s|Caused by:|Suppressed:|\.\.\. \d+ more)/.test(body)) {
      const addition = '\n' + raw;
      last.continuation = (last.continuation + '\n' + body).slice(0, MAX_ROW);
      const oldLength = last.raw.length;
      last.raw = (last.raw + addition).slice(0, MAX_ROW);
      last.truncated ||= last.raw.length === MAX_ROW;
      this.bytes += last.raw.length - oldLength;
      this.trim(); return;
    }
    const row: ScriptLogRow = {
      id: ++this.sequence, kind: pod || timestamp || payload ? 'log' : 'system', timestamp, pod, container, level,
      message: text(payload?.message ?? payload?.msg ?? payload?.error ?? body).slice(0, MAX_ROW),
      logger: text(payload?.logger_name || payload?.logger || payload?.source),
      thread: text(payload?.thread_name || payload?.thread), traceId: text(payload?.trace_id || payload?.traceId),
      stack: text(payload?.stack_trace || payload?.stackTrace || payload?.exception).slice(0, MAX_ROW), continuation: '', raw, payload, truncated,
    };
    this.rows.push(row); this.bytes += raw.length; this.trim();
  }
  private trim() {
    while (this.rows.length > MAX_ROWS || (this.bytes > MAX_BUFFER && this.rows.length > 1)) {
      this.bytes -= this.rows.shift()!.raw.length;
    }
  }
}

export function logRowsCsv(rows: ScriptLogRow[]) {
  const field = (value: string) => '"' + (/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replace(/"/g, '""') + '"';
  return [['Timestamp', 'Level', 'Pod', 'Container', 'Message', 'Logger', 'Trace ID'], ...rows.map(row =>
    [row.timestamp, row.level, row.pod, row.container, row.message, row.logger, row.traceId]
  )].map(row => row.map(field).join(',')).join('\r\n');
}
