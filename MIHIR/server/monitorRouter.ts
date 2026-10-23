import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getJob, getBuildLog, JenkinsError, jenkinsBaseUrl, jobRelativePath } from './jenkinsClient';
import type { MonitorMapping } from '../src/types/monitor';

export function createMonitorRouter({ dataDir, getRepositories }: {
  dataDir: string;
  getRepositories: () => Array<{ id: string; name: string }> | Promise<Array<{ id: string; name: string }>>;
}) {
const monitorRouter = express.Router();
const configFile = path.join(dataDir, 'monitor-config.json');

// Build logs stay available only on the local computer, even if the existing
// development server also listens on a LAN interface.
monitorRouter.use((req, res, next) => {
  const address = req.socket.remoteAddress || '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) {
    res.status(403).json({ error: 'Monitor is available only on the local computer.' }); return;
  }
  const origin = req.get('origin');
  if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
    res.status(403).json({ error: 'Cross-origin monitor requests are not allowed.' }); return;
  }
  res.set('Cache-Control', 'no-store');
  next();
});

async function mappings(): Promise<MonitorMapping[]> {
  if (fs.existsSync(configFile)) {
    const data = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (!Array.isArray(data)) throw new Error('Invalid monitor configuration file.');
    return data;
  }
  return (await getRepositories()).filter(repo => ['raydashboard', 'raydashboard-power-btn-fix'].includes(repo.name))
    .map(repo => ({ repositoryId: repo.id, jobPath: 'raydashboard' }));
}

async function config() {
  return { jenkinsUrl: jenkinsBaseUrl().href, credentialsConfigured: Boolean(process.env.JENKINS_USER && process.env.JENKINS_API_TOKEN), mappings: await mappings() };
}

function fail(res: express.Response, error: unknown) {
  res.status(error instanceof JenkinsError ? error.status : 500).json({ error: error instanceof JenkinsError ? error.message : 'Unable to read or save Monitor configuration.' });
}

monitorRouter.get('/config', async (_req, res) => {
  try { res.json(await config()); } catch (error) { fail(res, error); }
});

monitorRouter.put('/config', async (req, res) => {
  try {
    const incoming = req.body.mappings;
    const repositories = await getRepositories();
    if (!Array.isArray(incoming) || incoming.length > repositories.length) throw new JenkinsError('Invalid repository mappings.', 400);
    const ids = new Set<string>();
    const clean = incoming.map((item: MonitorMapping) => {
      if (!item || typeof item.repositoryId !== 'string' || !repositories.some(repo => repo.id === item.repositoryId) || ids.has(item.repositoryId) || typeof item.jobPath !== 'string') throw new JenkinsError('Invalid or duplicate repository mapping.', 400);
      ids.add(item.repositoryId);
      jobRelativePath(item.jobPath);
      return { repositoryId: item.repositoryId, jobPath: item.jobPath.trim() };
    });
    const temp = configFile + '.' + randomUUID() + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(clean, null, 2), { mode: 0o600 });
    fs.renameSync(temp, configFile);
    res.json(await config());
  } catch (error) { fail(res, error); }
});

async function mappedJob(repositoryId: string): Promise<string> {
  const mapping = (await mappings()).find(item => item.repositoryId === repositoryId);
  if (!mapping) throw new JenkinsError('Configure a Jenkins job for this repository first.', 404);
  return mapping.jobPath;
}

monitorRouter.get('/repositories/:id/builds', async (req, res) => {
  try { res.json(await getJob(await mappedJob(req.params.id))); } catch (error) { fail(res, error); }
});

monitorRouter.get('/repositories/:id/builds/:build/log', async (req, res) => {
  try { res.json(await getBuildLog(await mappedJob(req.params.id), Number(req.params.build), Number(req.query.start ?? 0))); } catch (error) { fail(res, error); }
});
return monitorRouter;
}
