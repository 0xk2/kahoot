import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ContractError, parseJoinSessionInput, parseQuestion, parseSubmitAnswerInput
} from '../src/contracts/index.js';
import { harnessState, quiz } from '../src/harness/mock-data.js';

test('representative harness data satisfies all composed contracts', () => {
  const state = harnessState();
  assert.equal(state.quiz.questions.length, 2);
  assert.equal(state.session.joinCode, 'ORBIT1');
  assert.equal(state.currentQuestion.options[1].text, 'Mars');
  assert.equal('isCorrect' in state.currentQuestion.options[1], false);
});

test('join inputs normalize codes and preserve optional reconnect state', () => {
  assert.deepEqual(parseJoinSessionInput({ joinCode: 'orbit1', nickname: 'Lin', reconnectToken: null }), {
    joinCode: 'ORBIT1', nickname: 'Lin', reconnectToken: null
  });
});

test('single-choice questions require exactly one correct option', () => {
  const invalid = structuredClone(quiz.questions[0]);
  invalid.options[0].isCorrect = true;
  assert.throws(() => parseQuestion(invalid), /invalid number of correct answers/);
});

test('answer input rejects empty selections with a useful path', () => {
  assert.throws(() => parseSubmitAnswerInput({
    sessionId: 's1', participantId: 'p1', questionId: 'q1', optionIds: [], responseTimeMs: 20
  }), (error) => error instanceof ContractError && error.path === 'answer.optionIds');
});
