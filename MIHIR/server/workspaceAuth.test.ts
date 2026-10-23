import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash } from 'node:crypto';
import { createWorkspaceAuth } from './workspaceAuth';

async function setup(t: any, options = {}) {
  const app = express(); app.use(express.json());
  const gate = createWorkspaceAuth({ passwordHash: createHash('sha256').update('test-password').digest('hex'), sessionSecret: 'test-secret-at-least-thirty-two-characters', ...options });
  app.use('/api/auth', gate.router); app.use('/api', gate.requireSession);
  app.get('/api/private', (_req, res) => { res.json({ secret: 'protected data' }); });
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const login = (password: string, headers: Record<string, string> = {}) => fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ password }) });
  return { base, login };
}
test('workspace routes require server-verified password and signed HTTP-only session', async t => {
  const { base, login } = await setup(t);
  assert.equal((await fetch(base + '/api/private')).status, 401);
  assert.equal((await login('wrong')).status, 401);
  assert.equal((await login('test-password', { Origin: 'https://evil.example' })).status, 403);
  const response = await login('test-password'); assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie')!;
  assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(';')[0];
  assert.equal((await fetch(base + '/api/private', { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(base + '/api/private', { headers: { Cookie: cookie + 'tampered' } })).status, 401);
  const logout = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie')!, /Expires=Thu, 01 Jan 1970/);
});
test('login rate limits repeated failures and shared-secret sessions work across instances', async t => {
  const first = await setup(t); const second = await setup(t);
  const valid = await first.login('test-password'); const cookie = valid.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await fetch(second.base + '/api/private', { headers: { Cookie: cookie } })).status, 200);
  for (let n = 0; n < 10; n++) assert.equal((await first.login('wrong')).status, 401);
  assert.equal((await first.login('wrong')).status, 429);
});
test('hosted session cookie is secure', async t => {
  const { login } = await setup(t, { hosted: true });
  const response = await login('test-password'); assert.match(response.headers.get('set-cookie')!, /Secure/);
});

test('hosted login stays unavailable until a strong shared session secret is configured', async t => {
  const { base, login } = await setup(t, { hosted: true, sessionSecret: 'short' });
  assert.equal((await login('test-password')).status, 503);
  const session = await (await fetch(base + '/api/auth/session')).json();
  assert.equal(session.configured, false); assert.equal(session.authenticated, false);
});
