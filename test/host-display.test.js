import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarnessServer } from '../src/harness/server.js';

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
