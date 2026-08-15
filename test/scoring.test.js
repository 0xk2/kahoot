import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePoints, rankPlayers } from '../src/player/scoring.js';

test('fixed scoring awards configured points regardless of response time', () => {
  const input = { isCorrect: true, points: 1000, timeLimitSeconds: 20, mode: 'fixed' };
  assert.equal(calculatePoints({ ...input, responseTimeMs: 0 }), 1000);
  assert.equal(calculatePoints({ ...input, responseTimeMs: 20000 }), 1000);
});

test('speed-weighted scoring ranges from full to half points', () => {
  const input = { isCorrect: true, points: 1000, timeLimitSeconds: 20, mode: 'speed_weighted' };
  assert.equal(calculatePoints({ ...input, responseTimeMs: 0 }), 1000);
  assert.equal(calculatePoints({ ...input, responseTimeMs: 10000 }), 750);
  assert.equal(calculatePoints({ ...input, responseTimeMs: 30000 }), 500);
  assert.equal(calculatePoints({ ...input, responseTimeMs: 1000, isCorrect: false }), 0);
});

test('leaderboards are stable and give equal scores equal ranks', () => {
  const ranked = rankPlayers([
    { id: 'p-2', nickname: 'Second join', score: 500, joinOrder: 1 },
    { id: 'p-1', nickname: 'First join', score: 500, joinOrder: 0 },
    { id: 'p-3', nickname: 'Third', score: 100, joinOrder: 2 }
  ]);
  assert.deepEqual(ranked.map(({ participantId, rank }) => [participantId, rank]),
    [['p-1', 1], ['p-2', 1], ['p-3', 3]]);
});
