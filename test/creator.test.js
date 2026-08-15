import test from 'node:test';
import assert from 'node:assert/strict';
import { quizLibrary, quizSummary } from '../src/creator/library.js';
import { createCreatorStore } from '../src/creator/store.js';
import { creatorQuizzes } from '../src/harness/creator-data.js';

test('quiz library searches, filters, and sorts without mutating source data', () => {
  const source = [...creatorQuizzes];
  const result = quizLibrary(source, { search: 'team', status: 'archived', sort: 'title' });
  assert.deepEqual(result.map((quiz) => quiz.id), ['quiz-safety']);
  assert.deepEqual(source, creatorQuizzes);
});

test('quiz summaries total points and timer duration', () => {
  const summary = quizSummary(creatorQuizzes[0]);
  assert.equal(summary.questionCount, 2);
  assert.equal(summary.totalPoints, 2500);
  assert.equal(summary.totalSeconds, 50);
});

test('creator store validates edits and assigns the server-controlled timestamp', () => {
  const store = createCreatorStore(creatorQuizzes, () => '2026-08-15T10:30:00.000Z');
  const edit = structuredClone(store.get('quiz-space'));
  edit.questions[0].points = 2000;
  edit.questions[0].timeLimitSeconds = 60;
  edit.questions[0].options[0].isCorrect = true;
  edit.questions[0].type = 'multiple_choice';
  const saved = store.save(edit);
  assert.equal(saved.updatedAt, '2026-08-15T10:30:00.000Z');
  assert.equal(saved.questions[0].points, 2000);
  assert.equal(saved.questions[0].type, 'multiple_choice');
});

test('creator store builds a valid editable quiz', () => {
  const store = createCreatorStore(creatorQuizzes, () => '2026-08-15T10:30:00.000Z');
  const created = store.create();
  assert.equal(created.status, 'draft');
  assert.equal(created.questions[0].options.length, 2);
  assert.equal(store.list().length, 4);
});
