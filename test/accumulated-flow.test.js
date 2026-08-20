import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarnessServer } from '../src/harness/server.js';

async function startServer() {
  const server = await createHarnessServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

const jsonRequest = (url, method, body, headers = {}) => fetch(url, {
  method,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body)
});

test('normal entrypoint reaches creator, host, and player surfaces', async () => {
  const app = await startServer();
  try {
    const pages = await Promise.all(['/', '/creator', '/host', '/play?pin=ORBIT1', '/audit']
      .map((path) => fetch(app.origin + path)));
    assert.deepEqual(pages.map(({ status }) => status), [200, 200, 200, 200, 200]);
    assert.match(await pages[0].text(), /href="\/creator"/);
    assert.match(await pages[4].text(), /newly launched room/);
  } finally { await app.close(); }
});

test('published quiz launches and accepts an anonymous room player', async () => {
  const app = await startServer();
  try {
    const roomResponse = await jsonRequest(`${app.origin}/api/rooms`, 'POST', { quizId: 'quiz-space' });
    const room = await roomResponse.json();
    const joinResponse = await jsonRequest(`${app.origin}/api/rooms/join`, 'POST', {
      joinCode: room.joinCode, nickname: 'Audit Player', reconnectToken: null
    });
    assert.equal(roomResponse.status, 201);
    assert.equal(joinResponse.status, 200);
  } finally { await app.close(); }
});

test('audit harness keeps its explicit creator authentication bypass isolated', async () => {
  const app = await startServer();
  try {
    const response = await fetch(`${app.origin}/api/creator/quizzes`, {
      headers: { cookie: 'kahoot_session=invalid' }
    });
    assert.equal(response.status, 200);
  } finally { await app.close(); }
});

test('audit harness keeps launched rooms separate from representative mock gameplay', async () => {
  const app = await startServer();
  try {
    const room = await jsonRequest(`${app.origin}/api/rooms`, 'POST', { quizId: 'quiz-space' })
      .then((response) => response.json());
    const joined = await jsonRequest(`${app.origin}/api/rooms/join`, 'POST', {
      joinCode: room.joinCode, nickname: 'Connected Player', reconnectToken: null
    }).then((response) => response.json());
    const state = await fetch(`${app.origin}/api/player/state?participantId=${joined.participant.id}`);
    assert.equal(state.status, 404);
  } finally { await app.close(); }
});

test('audit harness resets authored quizzes on restart instead of using production storage', async () => {
  let app = await startServer();
  const created = await jsonRequest(`${app.origin}/api/creator/quizzes`, 'POST', {})
    .then((response) => response.json());
  await app.close();
  app = await startServer();
  try {
    const response = await fetch(`${app.origin}/api/creator/quizzes/${created.id}`);
    assert.equal(response.status, 404);
  } finally { await app.close(); }
});
