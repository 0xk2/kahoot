import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProductionServer } from '../src/server.js';

async function start(path, revision = 'test-revision') {
  const server = await createProductionServer({ databasePath: path, revision });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)) };
}
async function request(app, path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(app.origin + path, { method, headers: {
    ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
  body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null,
    cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

test('production connects authenticated authoring to durable anonymous gameplay and history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'quizzes-r7-2-'));
  const path = join(directory, 'runtime.sqlite');
  let app = await start(path);
  try {
    assert.equal((await request(app, '/api/creator/quizzes')).status, 401);
    const registered = await request(app, '/api/auth/register', { method: 'POST', body: {
      username: 'creator_one', password: 'a sufficiently long password', displayName: 'Creator One' } });
    const cookie = registered.cookie;
    const created = await request(app, '/api/creator/quizzes', { method: 'POST', cookie });
    const quiz = { ...created.body, title: 'Durable planets', status: 'published' };
    assert.equal((await request(app, '/api/rooms', { method: 'POST',
      body: { quizId: quiz.id }, cookie })).status, 409);
    const saved = await request(app, `/api/creator/quizzes/${quiz.id}`, { method: 'PUT', body: quiz, cookie });
    assert.equal(saved.status, 200);
    const launched = await request(app, '/api/rooms', { method: 'POST', body: { quizId: quiz.id }, cookie });
    assert.equal(launched.status, 201);
    const joined = await request(app, '/api/player/join', { method: 'POST', body: {
      joinCode: launched.body.joinCode, nickname: 'Sky', reconnectToken: null } });
    const player = joined.body;
    const outsider = await request(app, '/api/auth/register', { method: 'POST', body: {
      username: 'other_creator', password: 'another sufficiently long password', displayName: 'Other' } });
    assert.equal((await request(app, `/api/rooms/${launched.body.joinCode}/lifecycle`, { method: 'POST',
      cookie: outsider.cookie, body: { status: 'active', expectedRevision: 0 } })).status, 403);
    await request(app, `/api/rooms/${launched.body.joinCode}/lifecycle`, { method: 'POST', cookie,
      body: { status: 'active', expectedRevision: 0 } });
    assert.equal((await request(app, `/api/rooms/${launched.body.joinCode}/lifecycle`, { method: 'POST', cookie,
      body: { status: 'cancelled', expectedRevision: 0 } })).status, 409);
    const state = await request(app, `/api/player/state?participantId=${player.participantId}&reconnectToken=${player.reconnectToken}`);
    assert.equal(state.body.phase, 'question');
    const correctId = quiz.questions[0].options.find(({ isCorrect }) => isCorrect).id;
    const answer = await request(app, '/api/player/answer', { method: 'POST', body: { sessionId: player.sessionId,
      participantId: player.participantId, questionId: state.body.question.questionId,
      optionIds: [correctId], responseTimeMs: 100, reconnectToken: player.reconnectToken } });
    assert.equal(answer.body.isCorrect, true);
    await request(app, `/api/rooms/${launched.body.joinCode}/lifecycle`, { method: 'POST', cookie,
      body: { status: 'completed', expectedRevision: 1 } });
    await app.close();
    app = await start(path);
    const login = await request(app, '/api/auth/login', { method: 'POST', body: {
      username: 'creator_one', password: 'a sufficiently long password' } });
    const history = await request(app, '/api/host/sessions', { cookie: login.cookie });
    assert.equal(history.body[0].status, 'completed');
    assert.equal(history.body[0].results[0].nickname, 'Sky');
    assert.equal((await request(app, `/api/player/state?participantId=${player.participantId}&reconnectToken=${player.reconnectToken}`)).body.phase, 'completed');
  } finally { await app.close(); await rm(directory, { recursive: true }); }
});

test('production excludes harness capabilities and reports its exact revision', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'quizzes-r7-2-config-'));
  const app = await start(join(directory, 'runtime.sqlite'), 'guarded-sha');
  try {
    assert.deepEqual((await request(app, '/api/revision')).body, { revision: 'guarded-sha' });
    for (const path of ['/audit', '/mobile', '/api/player/harness/reset', '/api/player/harness/rivals']) {
      assert.equal((await request(app, path, { method: path.startsWith('/api') ? 'POST' : 'GET', body: path.startsWith('/api') ? {} : undefined })).status, 404);
    }
  } finally { await app.close(); await rm(directory, { recursive: true }); }
});
