/**
 * Vercel serverless entry point.
 * All /api/* routes are handled by Express; static frontend is served from dist/.
 */
let appInstance: any = null;
let initError: any = null;

async function getApp() {
  if (appInstance) return appInstance;
  if (initError) throw initError;
  try {
    const mod = await import('../server');
    appInstance = mod.default || mod;
    return appInstance;
  } catch (err: any) {
    initError = err;
    console.error('Failed to initialize server application:', err);
    throw err;
  }
}

export default async function handler(req: any, res: any) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err: any) {
    console.error('Serverless function invocation failed:', err);
    return res.status(500).json({
      error: 'Workspace Backend Error',
      message: err?.message || String(err),
      nodeVersion: process.version,
      stack: process.env.NODE_ENV === 'production' ? err?.message : err?.stack,
    });
  }
}

