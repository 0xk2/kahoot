import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarnessServer } from '../src/harness/server.js';

async function withServer(run) {
  const server = createHarnessServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('harness exposes representative state without authentication', () => withServer(async (origin) => {
  const response = await fetch(`${origin}/api/state`);
  const state = await response.json();
  assert.equal(response.status, 200);
  assert.equal(state.quiz.title, 'A Tiny Tour of Space');
  assert.equal('isCorrect' in state.currentQuestion.options[0], false);
}));

test('harness loads its top-level-await client as a module', () => withServer(async (origin) => {
  const response = await fetch(origin);
  const page = await response.text();
  assert.equal(response.status, 200);
  assert.match(page, /<script type="module">/);
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

test('creator harness exposes the auth-free quiz library and editor surface', () => withServer(async (origin) => {
  const [pageResponse, listResponse] = await Promise.all([
    fetch(`${origin}/creator`), fetch(`${origin}/api/creator/quizzes?status=draft&sort=title`)
  ]);
  const page = await pageResponse.text();
  const list = await listResponse.json();
  assert.match(page, /Creator test harness · auth bypassed/);
  assert.match(page, /Question settings/);
  assert.deepEqual(list.map((quiz) => quiz.id), ['quiz-history']);
}));

test('creator harness saves validated multiple-choice settings', () => withServer(async (origin) => {
  const quiz = await fetch(`${origin}/api/creator/quizzes/quiz-space`).then((response) => response.json());
  quiz.questions[0].type = 'multiple_choice';
  quiz.questions[0].options[0].isCorrect = true;
  quiz.questions[0].points = 2000;
  quiz.questions[0].timeLimitSeconds = 60;
  const response = await fetch(`${origin}/api/creator/quizzes/quiz-space`, { method: 'PUT',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(quiz) });
  const saved = await response.json();
  assert.equal(response.status, 200);
  assert.equal(saved.questions[0].type, 'multiple_choice');
  assert.equal(saved.questions[0].timeLimitSeconds, 60);
}));
