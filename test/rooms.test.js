import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomService } from '../src/rooms/service.js';

function fixture(options = {}) {
  let tick = 0;
  return new RoomService({ clock: () => new Date(`2026-08-15T12:00:${String(tick++).padStart(2, '0')}.000Z`), ...options });
}

test('rooms receive unique six-character PINs and shareable links', () => {
  const values = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
  const service = fixture({ random: () => values.shift() ?? 1, origin: 'http://quiz.test' });
  const first = service.create({ quizId: 'quiz-space' });
  const second = service.create({ quizId: 'quiz-space' });
  assert.match(first.joinCode, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.notEqual(first.joinCode, second.joinCode);
  assert.equal(first.joinUrl, `http://quiz.test/live?pin=${first.joinCode}`);
  assert.match(first.qrImageUrl, /create-qr-code/);
});

test('multiple sessions for one quiz keep lifecycle and participants isolated', () => {
  const service = fixture();
  const first = service.create({ quizId: 'quiz-space' }, 'creator-1');
  const second = service.create({ quizId: 'quiz-space' }, 'creator-1');
  service.join({ joinCode: first.joinCode, nickname: 'Ada', reconnectToken: null });
  service.join({ joinCode: second.joinCode, nickname: 'Ada', reconnectToken: null });
  service.transition(first.joinCode, 'active', 'creator-1', 0);

  assert.equal(service.get(first.joinCode).status, 'active');
  assert.equal(service.get(second.joinCode).status, 'lobby');
  assert.equal(service.get(first.joinCode).participants[0].sessionId, first.id);
  assert.equal(service.get(second.joinCode).participants[0].sessionId, second.id);
});

test('host session listing is scoped by owner and optionally quiz', () => {
  const service = fixture();
  const space = service.create({ quizId: 'quiz-space' }, 'creator-1');
  service.create({ quizId: 'quiz-history' }, 'creator-1');
  service.create({ quizId: 'quiz-space' }, 'creator-2');

  assert.deepEqual(service.list({ hostId: 'creator-1', quizId: 'quiz-space' }).map(({ id }) => id), [space.id]);
  assert.equal(service.list({ hostId: 'creator-1' }).length, 2);
  assert.throws(() => service.list(), /authorization/);
});

test('lobby accepts 50 players and rejects duplicates or overflow', () => {
  const service = fixture();
  const room = service.create({ quizId: 'quiz-space' });
  for (let index = 1; index <= 50; index += 1) {
    service.join({ joinCode: room.joinCode, nickname: `Player ${index}`, reconnectToken: null });
  }
  assert.throws(() => service.join({ joinCode: room.joinCode, nickname: 'Extra', reconnectToken: null }), /Room is full/);
  const other = service.create({ quizId: 'quiz-space' });
  service.join({ joinCode: other.joinCode, nickname: 'Ada', reconnectToken: null });
  assert.throws(() => service.join({ joinCode: other.joinCode, nickname: 'ada', reconnectToken: null }), /already in use/);
});

test('disconnect and reconnect preserve identity while invalid tokens fail', () => {
  const service = fixture();
  const room = service.create({ quizId: 'quiz-space' });
  const joined = service.join({ joinCode: room.joinCode, nickname: 'Lin', reconnectToken: null });
  service.disconnect(room.joinCode, joined.reconnectToken);
  assert.equal(service.get(room.joinCode).participants[0].status, 'disconnected');
  const rejoined = service.join({ joinCode: room.joinCode, nickname: 'Ignored', reconnectToken: joined.reconnectToken });
  assert.equal(rejoined.participant.id, joined.participant.id);
  assert.equal(rejoined.participant.status, 'connected');
  assert.throws(() => service.join({ joinCode: room.joinCode, nickname: 'Lin', reconnectToken: 'x'.repeat(20) }), /invalid/);
});

test('room lifecycle only follows lobby to active to completed', () => {
  const service = fixture();
  const room = service.create({ quizId: 'quiz-space' });
  assert.throws(() => service.transition(room.joinCode, 'completed', 'user-host', 0), /Cannot change/);
  const active = service.transition(room.joinCode, 'active', 'user-host', 0);
  assert.equal(active.currentQuestionIndex, 0);
  assert.ok(active.startedAt);
  assert.throws(() => service.join({ joinCode: room.joinCode, nickname: 'Late', reconnectToken: null }), /already started/);
  const completed = service.transition(room.joinCode, 'completed', 'user-host', 1);
  assert.ok(completed.endedAt);
  assert.throws(() => service.transition(room.joinCode, 'active', 'user-host', 2), /Cannot change/);
});

test('host mutations require ownership and reject stale concurrent writes', () => {
  const service = fixture();
  const room = service.create({ quizId: 'quiz-space' }, 'creator-1');
  assert.throws(() => service.transition(room.joinCode, 'active', 'attacker', 0), /authorization/);
  const active = service.transition(room.joinCode, 'active', 'creator-1', 0);
  assert.equal(active.revision, 1);
  assert.throws(() => service.transition(room.joinCode, 'completed', 'creator-1', 0), /refresh/);
  assert.equal(service.get(room.joinCode).status, 'active');
});
