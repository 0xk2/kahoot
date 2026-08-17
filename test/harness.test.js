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

test('public landing page exposes host and PIN-based join paths', () => withServer(async (origin) => {
  const [pageResponse, scriptResponse, styleResponse] = await Promise.all([
    fetch(origin), fetch(`${origin}/landing.js`), fetch(`${origin}/landing.css`)
  ]);
  const page = await pageResponse.text();
  const script = await scriptResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.equal(scriptResponse.status, 200);
  assert.equal(styleResponse.status, 200);
  assert.match(page, /href="\/creator"/);
  assert.match(page, /id="join-form"/);
  assert.match(page, /ORBIT1/);
  assert.match(page, /<title>Home \| Quizzes<\/title>/);
  assert.match(page, /aria-label="Quizzes home"/);
  assert.match(script, /\/play\?pin=/);
  const style = await styleResponse.text();
  assert.match(style, /max-width:760px/);
  assert.doesNotMatch(style, /\.hero::before/);
}));

test('product pages have distinct Quizzes titles and can load dynamic title support', () => withServer(async (origin) => {
  const [creator, live, player, titles] = await Promise.all([
    fetch(`${origin}/creator`).then((response) => response.text()),
    fetch(`${origin}/live`).then((response) => response.text()),
    fetch(`${origin}/play`).then((response) => response.text()),
    fetch(`${origin}/page-titles.js`)
  ]);
  assert.match(creator, /<title>My quizzes \| Quizzes<\/title>/);
  assert.match(live, /<title>Host or join \| Quizzes<\/title>/);
  assert.match(player, /<title>Join a quiz \| Quizzes<\/title>/);
  assert.equal(titles.status, 200);
  assert.match(await titles.text(), /APP_NAME = 'Quizzes'/);
}));

test('player surface accepts a landing-page PIN query', () => withServer(async (origin) => {
  const [page, script] = await Promise.all([
    fetch(`${origin}/play?pin=ORBIT1`).then((response) => response.text()),
    fetch(`${origin}/player.js`).then((response) => response.text())
  ]);
  assert.match(page, /name="joinCode"/);
  assert.match(script, /URLSearchParams/);
  assert.match(script, /requestedPin/);
}));

test('mobile review harness links all auth-free interactive surfaces', () => withServer(async (origin) => {
  const [pageResponse, styleResponse] = await Promise.all([
    fetch(`${origin}/mobile`), fetch(`${origin}/mobile.css`)
  ]);
  const page = await pageResponse.text();
  const style = await styleResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.equal(styleResponse.status, 200);
  assert.match(page, /R2-1 test harness/);
  assert.match(page, /href="\/creator"/);
  assert.match(page, /href="\/live"/);
  assert.match(page, /href="\/play"/);
  assert.match(style, /max-width:720px/);
}));

test('product surfaces include narrow and safe-area mobile rules', () => withServer(async (origin) => {
  const styles = await Promise.all(['/creator.css', '/live.css', '/player.css']
    .map((path) => fetch(origin + path).then((response) => response.text())));
  assert.match(styles[0], /max-width:600px/);
  assert.match(styles[0], /overflow-x:auto/);
  assert.match(styles[1], /max-width:650px/);
  assert.match(styles[2], /safe-area-inset-bottom/);
  assert.match(styles[2], /max-height:700px/);
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

test('progression harness switches to independent player pacing', () => withServer(async (origin) => {
  const modeResponse = await fetch(`${origin}/api/player/harness/mode`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'player' }) });
  assert.deepEqual(await modeResponse.json(), { mode: 'player' });
  const joined = await fetch(`${origin}/api/player/join`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ joinCode: 'ORBIT1',
      nickname: 'Paced', reconnectToken: null }) }).then((response) => response.json());
  const early = await fetch(`${origin}/api/player/harness/advance`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ participantId: joined.participantId }) });
  assert.equal(early.status, 409);
  assert.match((await early.json()).error, /Answer or wait/);
}));

test('live harness creates, joins, reconnects, and starts an auth-free room', () => withServer(async (origin) => {
  const page = await fetch(`${origin}/live`).then((response) => response.text());
  assert.match(page, /R1-8 integrated test harness · auth bypassed/);
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
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'active', expectedRevision: 0 }) }).then((response) => response.json());
  assert.equal(active.status, 'active');
  assert.equal(active.revision, 1);
  assert.equal(active.participants.length, 1);
}));

test('creator dashboard launches only published owned quizzes into the host display', () => withServer(async (origin) => {
  const creator = await fetch(`${origin}/creator`).then((response) => response.text());
  const script = await fetch(`${origin}/creator.js`).then((response) => response.text());
  assert.match(creator, /My quizzes/);
  assert.match(script, /Host live/);
  const draft = await fetch(`${origin}/api/rooms`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quizId: 'quiz-history' }) });
  assert.equal(draft.status, 409);
  const launched = await fetch(`${origin}/api/rooms`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quizId: 'quiz-space' }) });
  const room = await launched.json();
  assert.equal(launched.status, 201);
  assert.equal(room.quizId, 'quiz-space');
  assert.equal(room.revision, 0);
  assert.equal('hostId' in room, false);
  assert.match(await fetch(`${origin}/live?host=${room.joinCode}`).then((response) => response.text()), /Host lobby/);
}));

test('host HTTP actions reject stale revisions without double-transitioning', () => withServer(async (origin) => {
  const room = await fetch(`${origin}/api/rooms`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quizId: 'quiz-space' }) }).then((response) => response.json());
  const action = () => fetch(`${origin}/api/rooms/${room.joinCode}/lifecycle`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'active', expectedRevision: 0 }) });
  const [first, second] = await Promise.all([action(), action()]);
  assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  const current = await fetch(`${origin}/api/rooms/${room.joinCode}`).then((response) => response.json());
  assert.equal(current.status, 'active');
  assert.equal(current.revision, 1);
}));

test('concurrent session harness lists isolated rooms for the same quiz', () => withServer(async (origin) => {
  const page = await fetch(`${origin}/concurrent`).then((response) => response.text());
  assert.match(page, /R5-1 test harness/);
  const create = () => fetch(`${origin}/api/rooms`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quizId: 'quiz-space' }) })
    .then((response) => response.json());
  const [first, second] = await Promise.all([create(), create()]);
  await fetch(`${origin}/api/rooms/join`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ joinCode: first.joinCode, nickname: 'Ada', reconnectToken: null }) });
  const listed = await fetch(`${origin}/api/rooms?quizId=quiz-space`).then((response) => response.json());
  assert.deepEqual(new Set(listed.map(({ id }) => id)), new Set([first.id, second.id]));
  assert.equal(listed.find(({ id }) => id === first.id).participants.length, 1);
  assert.equal(listed.find(({ id }) => id === second.id).participants.length, 0);
}));
