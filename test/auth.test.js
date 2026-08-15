import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { applySchema } from '../src/db/schema.js';
import { AuthRepository } from '../src/auth/repository.js';
import { AuthenticationError, AuthService, UsernameTakenError } from '../src/auth/service.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

async function fixture(options) {
  const database = new DatabaseSync(':memory:');
  await applySchema(database);
  return { database, service: new AuthService(new AuthRepository(database), options) };
}

test('passwords use salted scrypt hashes and verify without storing plaintext', async () => {
  const first = await hashPassword('a secure password');
  const second = await hashPassword('a secure password');
  assert.match(first, /^scrypt\$16384\$8\$1\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('a secure password', first), true);
  assert.equal(await verifyPassword('wrong password', first), false);
});

test('registration normalizes usernames and creates a creator session', async () => {
  const { database, service } = await fixture();
  const result = await service.register({ username: 'Ada_L', password: 'long enough password', displayName: 'Ada' });
  assert.equal(result.user.username, 'ada_l');
  assert.deepEqual(result.user.roles, ['host']);
  assert.equal(service.authenticate(result.token).id, result.user.id);
  const row = database.prepare('SELECT password_hash passwordHash FROM users').get();
  assert.equal(row.passwordHash.includes('long enough password'), false);
  assert.notEqual(database.prepare('SELECT token_hash tokenHash FROM auth_sessions').get().tokenHash, result.token);
  database.close();
});

test('duplicate usernames are rejected case-insensitively', async () => {
  const { database, service } = await fixture();
  await service.register({ username: 'creator', password: 'long enough password', displayName: 'One' });
  await assert.rejects(service.register({ username: 'CREATOR', password: 'another good password', displayName: 'Two' }), UsernameTakenError);
  database.close();
});

test('login uses a generic error and logout revokes the session', async () => {
  const { database, service } = await fixture();
  await service.register({ username: 'creator', password: 'long enough password', displayName: 'Creator' });
  await assert.rejects(service.login({ username: 'creator', password: 'wrong' }), AuthenticationError);
  await assert.rejects(service.login({ username: 'missing', password: 'wrong' }), AuthenticationError);
  const login = await service.login({ username: 'CREATOR', password: 'long enough password' });
  service.logout(login.token);
  assert.equal(service.authenticate(login.token), null);
  database.close();
});

test('expired sessions are not authenticated', async () => {
  let instant = new Date('2026-08-15T00:00:00.000Z');
  const { database, service } = await fixture({ now: () => instant, sessionMs: 1000 });
  const result = await service.register({ username: 'creator', password: 'long enough password', displayName: 'Creator' });
  instant = new Date('2026-08-15T00:00:02.000Z');
  assert.equal(service.authenticate(result.token), null);
  database.close();
});
