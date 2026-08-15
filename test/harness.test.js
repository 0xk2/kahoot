import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarnessServer } from '../src/harness/server.js';

async function withServer(run) {
  const server = await createHarnessServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('harness retains representative gameplay state without authentication', () => withServer(async (origin) => {
  const response = await fetch(`${origin}/api/state`);
  const state = await response.json();
  assert.equal(response.status, 200);
  assert.equal(state.quiz.title, 'A Tiny Tour of Space');
  assert.equal('isCorrect' in state.currentQuestion.options[0], false);
}));

test('harness provides the creator account test surface', () => withServer(async (origin) => {
  const response = await fetch(origin);
  const page = await response.text();
  assert.equal(response.status, 200);
  assert.match(page, /<script type="module">/);
  assert.match(page, /demo_creator/);
}));

test('harness provides a direct answer-validation surface', () => withServer(async (origin) => {
  const response = await fetch(`${origin}/api/answers/validate`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session-demo', participantId: 'player-ada',
      questionId: 'q-mars', optionIds: ['opt-mars'], responseTimeMs: 4200 })
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.valid, true);
}));

test('harness reports contract failures as client errors', () => withServer(async (origin) => {
  const response = await fetch(`${origin}/api/answers/validate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /answer.sessionId/);
}));
