import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerGame } from '../src/player/game.js';
import { quiz, session } from '../src/harness/mock-data.js';

const clock = () => new Date('2026-08-15T10:00:00.000Z');
const createGame = () => createPlayerGame({ quiz, session, clock });

test('anonymous players join by code and can reconnect with their private token', () => {
  const game = createGame();
  const joined = game.join({ joinCode: 'orbit1', nickname: ' Nova ', reconnectToken: null });
  const rejoined = game.join({ joinCode: 'ORBIT1', nickname: 'ignored', reconnectToken: joined.reconnectToken });
  assert.equal(joined.nickname, 'Nova');
  assert.equal(rejoined.participantId, joined.participantId);
  assert.equal(game.state(joined.participantId).question.options.some((option) => 'isCorrect' in option), false);
});

test('nicknames are unique within a game regardless of case', () => {
  const game = createGame();
  game.join({ joinCode: 'ORBIT1', nickname: 'Nova', reconnectToken: null });
  assert.throws(() => game.join({ joinCode: 'ORBIT1', nickname: 'nova', reconnectToken: null }), /already taken/);
});

test('answer scoring rewards correct selections and prevents resubmission', () => {
  const game = createGame();
  const player = game.join({ joinCode: 'ORBIT1', nickname: 'Ada', reconnectToken: null });
  const answer = { sessionId: session.id, participantId: player.participantId,
    questionId: 'q-mars', optionIds: ['opt-mars'], responseTimeMs: 10000 };
  const result = game.answer(answer);
  assert.deepEqual(result.correctOptionIds, ['opt-mars']);
  assert.equal(result.isCorrect, true);
  assert.equal(result.pointsAwarded, 750);
  assert.equal(game.state(player.participantId).phase, 'feedback');
  assert.throws(() => game.answer(answer), /already submitted/);
});

test('multiple choice requires the complete correct set', () => {
  const game = createGame();
  const player = game.join({ joinCode: 'ORBIT1', nickname: 'Lin', reconnectToken: null });
  game.advance();
  const result = game.answer({ sessionId: session.id, participantId: player.participantId,
    questionId: 'q-moons', optionIds: ['opt-mercury'], responseTimeMs: 1000 });
  assert.equal(result.isCorrect, false);
  game.advance();
  assert.equal(game.state(player.participantId).phase, 'completed');
});
