import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_NAME, pageTitle } from '../public/page-titles.js';

test('page titles pair a distinct view with the Quizzes app name', () => {
  assert.equal(APP_NAME, 'Quizzes');
  assert.equal(pageTitle('Home'), 'Home | Quizzes');
  assert.equal(pageTitle('  Question 2  '), 'Question 2 | Quizzes');
});

test('page title falls back to the app name when there is no view', () => {
  assert.equal(pageTitle(), 'Quizzes');
  assert.equal(pageTitle('   '), 'Quizzes');
});
