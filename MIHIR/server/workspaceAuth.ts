import express from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const cookieName = 'mihir_workspace_session';
const lifetime = 12 * 60 * 60;
// Password verification stays on the server; the browser bundle contains no password.
const defaultHash = 'a77ae5b49cf3a54dc60cb5373dab44a406ed79b6c974919504531f10dabd78eb';
export function createWorkspaceAuth(options: { passwordHash?: string; sessionSecret?: string; hosted?: boolean } = {}) {
  const hosted = options.hosted ?? Boolean(process.env.VERCEL);
  const passwordHash = options.passwordHash || process.env.WORKSPACE_PASSWORD_SHA256 || defaultHash;
  const configuredSecret = options.sessionSecret || process.env.WORKSPACE_SESSION_SECRET || (!hosted ? randomBytes(32).toString('hex') : '');
  const secret = hosted && configuredSecret.length < 32 ? '' : configuredSecret;
  const router = express.Router();
  const attempts = new Map<string, { count: number; until: number }>();
  const equal = (a: string, b: string) => { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); };
  const sign = (value: string) => createHmac('sha256', secret).update(value).digest('hex');
  const authenticated = (req: express.Request) => {
    if (!secret) return false;
    const value = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
    const [expires, nonce, signature] = value.split('.');
    return Boolean(expires && nonce && signature && Number(expires) > Date.now() && Number(expires) <= Date.now() + lifetime * 1000 && equal(signature, sign(`${expires}.${nonce}`)));
  };
  const sameOrigin: express.RequestHandler = (req, res, next) => {
    const origin = req.get('origin');
    const expected = `${hosted ? 'https' : req.protocol}://${req.get('host')}`;
    if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== expected)) { res.status(403).json({ error: 'Open this workspace directly to sign in.' }); return; }
    next();
  };
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/session', (req, res) => { res.json({ authenticated: authenticated(req), configured: Boolean(secret) }); });
  router.post('/login', sameOrigin, (req, res) => {
    if (!secret) { res.status(503).json({ error: 'Set WORKSPACE_SESSION_SECRET in Vercel before unlocking this workspace.' }); return; }
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    for (const [id, entry] of attempts) if (entry.until <= now) attempts.delete(id);
    const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    if (entry.count >= 10) { res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000))).status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' }); return; }
    entry.count++; attempts.set(key, entry);
    const password = req.body?.password;
    const hash = typeof password === 'string' && password.length <= 256 ? createHash('sha256').update(password).digest('hex') : '';
    if (!equal(hash, passwordHash)) { res.status(401).json({ error: 'Incorrect password. Please try again.' }); return; }
    attempts.delete(key);
    const payload = `${now + lifetime * 1000}.${randomBytes(16).toString('hex')}`;
    res.cookie(cookieName, `${payload}.${sign(payload)}`, { httpOnly: true, secure: hosted, sameSite: 'strict', maxAge: lifetime * 1000, path: '/' });
    res.json({ authenticated: true });
  });
  router.post('/logout', sameOrigin, (_req, res) => {
    res.clearCookie(cookieName, { httpOnly: true, secure: hosted, sameSite: 'strict', path: '/' }); res.json({ authenticated: false });
  });
  const requireSession: express.RequestHandler = (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!authenticated(req)) { res.status(401).json({ error: 'Unlock your workspace to continue.', code: 'WORKSPACE_LOCKED' }); return; }
    next();
  };
  return { router, requireSession };
}
