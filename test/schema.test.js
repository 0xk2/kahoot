import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { applySchema } from '../src/db/schema.js';

function fixture() {
  const db = new DatabaseSync(':memory:');
  return applySchema(db).then(() => {
    const now = '2026-08-14T12:00:00.000Z';
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)')
      .run('u1', 'host@example.com', 'hash', 'Host', now, now);
    db.prepare('INSERT INTO user_roles VALUES (?, ?)').run('u1', 'host');
    db.prepare('INSERT INTO quizzes VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('qz1', 'u1', 'Quiz', null, 'published', now, now);
    db.prepare('INSERT INTO quiz_questions VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('q1', 'qz1', 'single_choice', 'Prompt?', null, 20, 1000, 0);
    db.prepare('INSERT INTO answer_options VALUES (?, ?, ?, ?, ?)').run('o1', 'q1', 'Yes', 1, 0);
    db.prepare('INSERT INTO answer_options VALUES (?, ?, ?, ?, ?)').run('o2', 'q1', 'No', 0, 1);
    db.prepare('INSERT INTO game_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('s1', 'qz1', 'u1', 'PLAY1', 'active', 0, now, now, null);
    return { db, now };
  });
}

test('schema applies cleanly and supports a complete answer flow', async () => {
  const { db, now } = await fixture();
  db.prepare('INSERT INTO participants VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('p1', 's1', 'Ada', 'token-hash', 'connected', 0, now);
  db.prepare('INSERT INTO session_questions VALUES (?, ?, ?, ?, ?)').run('s1', 'q1', 0, now, null);
  db.prepare('INSERT INTO answers VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('a1', 's1', 'q1', 'p1', 3210, 1, 850, now);
  db.prepare('INSERT INTO answer_selections VALUES (?, ?, ?)').run('a1', 'q1', 'o1');
  const row = db.prepare(`SELECT p.nickname, a.points_awarded, ao.text
    FROM answers a JOIN participants p ON p.id = a.participant_id
    JOIN answer_selections s ON s.answer_id = a.id
    JOIN answer_options ao ON ao.id = s.option_id`).get();
  assert.deepEqual({ ...row }, { nickname: 'Ada', points_awarded: 850, text: 'Yes' });
  db.close();
});

test('schema enforces enums, uniqueness, and foreign keys', async () => {
  const { db, now } = await fixture();
  assert.throws(() => db.prepare('UPDATE game_sessions SET status = ? WHERE id = ?').run('unknown', 's1'), /CHECK/);
  assert.throws(() => db.prepare('INSERT INTO participants VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('p1', 'missing', 'Ada', 'hash', 'connected', 0, now), /FOREIGN KEY/);
  assert.throws(() => db.prepare('INSERT INTO game_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('s2', 'qz1', 'u1', 'play1', 'lobby', null, now, null, null), /UNIQUE/);
  db.prepare('INSERT INTO game_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('s2', 'qz1', 'u1', 'PLAY2', 'active', 0, now, now, null);
  db.prepare('INSERT INTO participants VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('p2', 's2', 'Grace', 'hash-2', 'connected', 0, now);
  db.prepare('INSERT INTO session_questions VALUES (?, ?, ?, ?, ?)').run('s1', 'q1', 0, now, null);
  assert.throws(() => db.prepare('INSERT INTO answers VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('a-cross', 's1', 'q1', 'p2', 100, 1, 10, now), /FOREIGN KEY/);
  db.close();
});

test('deleting a quiz cascades authoring content but protects played sessions', async () => {
  const { db } = await fixture();
  assert.throws(() => db.prepare('DELETE FROM quizzes WHERE id = ?').run('qz1'), /FOREIGN KEY/);
  db.prepare('DELETE FROM game_sessions WHERE id = ?').run('s1');
  db.prepare('DELETE FROM quizzes WHERE id = ?').run('qz1');
  assert.equal(db.prepare('SELECT count(*) count FROM quiz_questions').get().count, 0);
  db.close();
});
