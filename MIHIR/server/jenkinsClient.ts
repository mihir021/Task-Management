import type { JenkinsBuild, MonitorLog } from '../src/types/monitor';

export class JenkinsError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export function jobRelativePath(jobPath: string): string {
  const parts = jobPath.trim().split('/');
  if (!parts.length || parts.length > 12 || parts.some(part => !/^[\w .@()-]{1,100}$/.test(part) || part === '.' || part === '..')) {
    throw new JenkinsError('Enter a job name, or folder/job for nested jobs. Do not enter a URL.', 400);
  }
  return parts.map(part => 'job/' + encodeURIComponent(part)).join('/') + '/';
}

export function jenkinsBaseUrl(value = process.env.JENKINS_URL || 'http://192.168.110.129:8080'): URL {
  const url = new URL(value.endsWith('/') ? value : value + '/');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new JenkinsError('JENKINS_URL must be an HTTP(S) server URL without credentials or query parameters.', 503);
  }
  return url;
}

export interface JenkinsOptions {
  baseUrl?: string;
  username?: string;
  token?: string;
  fetcher?: typeof fetch;
}

export async function readJenkins(jobPath: string, suffix: string, options: JenkinsOptions = {}) {
  const base = jenkinsBaseUrl(options.baseUrl);
  const username = options.username ?? process.env.JENKINS_USER;
  const token = options.token ?? process.env.JENKINS_API_TOKEN;
  const headers: Record<string, string> = { Accept: suffix.includes('logText') ? 'text/plain' : 'application/json' };
  if (username && token) headers.Authorization = 'Basic ' + Buffer.from(`${username}:${token}`).toString('base64');
  let response: Response;
  try {
    response = await (options.fetcher || fetch)(new URL(jobRelativePath(jobPath) + suffix, base), {
      headers, redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new JenkinsError('Jenkins is unreachable or timed out. Check the server address and network connection.');
  }
  if ([401, 403].includes(response.status) || (response.status >= 300 && response.status < 400)) {
    await response.body?.cancel();
    throw new JenkinsError('Jenkins requires API authentication. Set JENKINS_USER and JENKINS_API_TOKEN in the app server .env file, then restart the app.', 401);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new JenkinsError(response.status === 404 ? 'Jenkins job or build was not found. Check the repository job mapping.' : `Jenkins returned HTTP ${response.status}.`, response.status === 404 ? 404 : 502);
  }
  return response;
}

async function readBounded(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) return { bytes: Buffer.alloc(0), truncated: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const available = limit - size;
      chunks.push(value.subarray(0, available));
      size += Math.min(value.length, available);
      if (size === limit) { truncated = true; await reader.cancel(); break; }
    }
  } catch {
    throw new JenkinsError('Jenkins response was interrupted. Refresh to try again.');
  } finally { reader.releaseLock(); }
  return { bytes: Buffer.concat(chunks), truncated };
}

export async function getJob(jobPath: string, options: JenkinsOptions = {}) {
  const tree = 'name,builds[number,result,building,timestamp,duration,displayName]{0,20}';
  const response = await readJenkins(jobPath, 'api/json?tree=' + encodeURIComponent(tree), options);
  const { bytes, truncated } = await readBounded(response, 1024 * 1024);
  if (truncated) throw new JenkinsError('Jenkins build history response is too large.');
  let body: any;
  try { body = JSON.parse(bytes.toString('utf8')); }
  catch { throw new JenkinsError('Jenkins returned an invalid API response. Check API authentication.'); }
  const url = new URL(jobRelativePath(jobPath), jenkinsBaseUrl(options.baseUrl)).href;
  if (!Array.isArray(body.builds)) throw new JenkinsError('Jenkins did not return a job build list.');
  return {
    name: String(body.name || jobPath), url,
    builds: body.builds.filter((b: any) => Number.isSafeInteger(b.number) && b.number > 0).slice(0, 20).map((b: any): JenkinsBuild => ({
      number: b.number, result: typeof b.result === 'string' ? b.result : null,
      building: b.building === true, timestamp: Number(b.timestamp) || 0, duration: Number(b.duration) || 0,
      displayName: typeof b.displayName === 'string' ? b.displayName : '#' + b.number,
      url: new URL(String(b.number) + '/', url).href,
    })), checkedAt: new Date().toISOString(),
  };
}

export async function getBuildLog(jobPath: string, build: number, start: number, options: JenkinsOptions = {}): Promise<MonitorLog> {
  if (!Number.isSafeInteger(build) || build < 1 || !Number.isSafeInteger(start) || start < 0) throw new JenkinsError('Invalid build number or log offset.', 400);
  const response = await readJenkins(jobPath, `${build}/logText/progressiveText?start=${start}`, options);
  const { bytes, truncated } = await readBounded(response, 256 * 1024);
  const reported = Number(response.headers.get('x-text-size'));
  const nextStart = truncated || !Number.isSafeInteger(reported) || reported < start ? start + bytes.length : reported;
  return { text: bytes.toString('utf8'), nextStart, moreData: truncated || response.headers.get('x-more-data') === 'true', truncated };
}
