import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarnessServer } from '../src/harness/server.js';

async function withServer(run) {
  const server = await createHarnessServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('host hub exposes active controls and ranked past results without sign-in', () => withServer(async (origin) => {
  const [pageResponse, sessionsResponse] = await Promise.all([
    fetch(`${origin}/host`), fetch(`${origin}/api/host/sessions`)
  ]);
  const page = await pageResponse.text();
  const sessions = await sessionsResponse.json();
  assert.equal(pageResponse.status, 200);
  assert.match(page, /R5-2 host hub test harness/);
  assert.match(page, /<title>Live sessions \| Quizzes<\/title>/);
  assert.match(page, /Active sessions/);
  assert.match(page, /Past results/);
  const active = sessions.find(({ status }) => status === 'lobby');
  const completed = sessions.find(({ status }) => status === 'completed');
  assert.equal(active.participants.length, 3);
  assert.equal(completed.quiz.title, 'A Tiny Tour of Space');
  assert.deepEqual(completed.results.map(({ rank, score }) => [rank, score]), [[1, 4200], [2, 3650], [2, 3650]]);
}));

test('host display reveals question points and advances a host-paced game', async () => {
  const server = await createHarnessServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const sessions = await fetch(`${origin}/api/host/sessions`).then((response) => response.json());
    const lobby = sessions.find(({ status }) => status === 'lobby');
    const started = await fetch(`${origin}/api/rooms/${lobby.joinCode}/lifecycle`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'active', expectedRevision: 0 }) })
      .then((response) => response.json());
    const hostState = await fetch(`${origin}/api/host/rooms/${lobby.joinCode}`).then((response) => response.json());
    assert.equal(hostState.quiz.questions[0].prompt, 'Which planet is known as the Red Planet?');
    assert.equal('isCorrect' in hostState.quiz.questions[0].options[0], false);
    const revealed = await fetch(`${origin}/api/rooms/${lobby.joinCode}/harness/results`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: started.revision }) })
      .then((response) => response.json());
    assert.deepEqual(revealed.questionResults[0].results.map(({ points }) => points), [900, 720, 0]);
    const advanced = await fetch(`${origin}/api/rooms/${lobby.joinCode}/advance`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: revealed.revision }) })
      .then((response) => response.json());
    assert.equal(advanced.currentQuestionIndex, 1);
    const [page, script] = await Promise.all(['/live', '/live.js']
      .map((path) => fetch(origin + path).then((response) => response.text())));
    assert.match(page, /Points this question/);
    assert.match(script, /question-results/);
    assert.match(script, /rankings/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
