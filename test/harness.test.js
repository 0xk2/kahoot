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

test('player harness supports direct anonymous join and question retrieval', () => withServer(async (origin) => {
  const page = await fetch(`${origin}/play`).then((response) => response.text());
  assert.match(page, /Player test harness · no account required/);
  const joinResponse = await fetch(`${origin}/api/player/join`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ joinCode: 'orbit1', nickname: 'Nova', reconnectToken: null }) });
  const joined = await joinResponse.json();
  const state = await fetch(`${origin}/api/player/state?participantId=${joined.participantId}`).then((response) => response.json());
  assert.equal(joinResponse.status, 201);
  assert.equal(state.phase, 'question');
  assert.equal(state.question.questionId, 'q-mars');
  assert.equal('isCorrect' in state.question.options[0], false);
  const answerResponse = await fetch(`${origin}/api/player/answer`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: joined.sessionId,
      participantId: joined.participantId, questionId: 'q-mars', optionIds: ['opt-mars'], responseTimeMs: 5000 }) });
  const result = await answerResponse.json();
  assert.equal(result.isCorrect, true);
  assert.equal(result.totalScore > 0, true);
}));

test('player harness exposes scoring mode and representative rivals', () => withServer(async (origin) => {
  await fetch(`${origin}/api/player/harness/reset`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scoringMode: 'fixed' }) });
  const joined = await fetch(`${origin}/api/player/join`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ joinCode: 'ORBIT1',
      nickname: 'Reviewer', reconnectToken: null }) }).then((response) => response.json());
  const rivals = await fetch(`${origin}/api/player/harness/rivals`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: '{}' }).then((response) => response.json());
  assert.equal(rivals.leaderboard.length, 4);
  const state = await fetch(`${origin}/api/player/state?participantId=${joined.participantId}`)
    .then((response) => response.json());
  assert.equal(state.scoringMode, 'fixed');
  assert.equal(state.leaderboard, null);
}));

test('live harness creates, joins, reconnects, and starts an auth-free room', () => withServer(async (origin) => {
  const page = await fetch(`${origin}/live`).then((response) => response.text());
  assert.match(page, /R1-4 test harness · auth bypassed/);
  const roomResponse = await fetch(`${origin}/api/rooms`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quizId: 'quiz-space' }) });
  const room = await roomResponse.json();
  assert.equal(roomResponse.status, 201);
  assert.match(room.joinCode, /^[A-Z0-9]{6}$/);
  assert.equal(room.joinUrl, `${origin}/live?pin=${room.joinCode}`);
  const join = await fetch(`${origin}/api/rooms/join`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ joinCode: room.joinCode,
      nickname: 'Mae', reconnectToken: null }) }).then((response) => response.json());
  assert.equal(join.participant.nickname, 'Mae');
  assert.ok(join.reconnectToken.length >= 32);
  const active = await fetch(`${origin}/api/rooms/${room.joinCode}/lifecycle`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'active' }) }).then((response) => response.json());
  assert.equal(active.status, 'active');
  assert.equal(active.participants.length, 1);
}));
