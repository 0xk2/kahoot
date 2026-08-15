import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarnessServer } from '../src/harness/server.js';

async function withServer(run) {
  const server = await createHarnessServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('login sets a protected cookie that authenticates the session', () => withServer(async (origin) => {
  const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'demo_creator', password: 'correct horse battery staple' }) });
  const cookie = login.headers.get('set-cookie');
  assert.equal(login.status, 200);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal((await login.json()).user.username, 'demo_creator');
  const me = await fetch(`${origin}/api/auth/me`, { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.displayName, 'Demo Creator');
}));

test('logout clears the cookie and revokes its server-side session', () => withServer(async (origin) => {
  const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'demo_creator', password: 'correct horse battery staple' }) });
  const cookie = login.headers.get('set-cookie');
  const logout = await fetch(`${origin}/api/auth/logout`, { method: 'POST', headers: { cookie } });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
  assert.equal((await fetch(`${origin}/api/auth/me`, { headers: { cookie } })).status, 401);
}));
