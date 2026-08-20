import { randomUUID } from 'node:crypto';
import { parseQuiz } from '../contracts/index.js';
import { quizLibrary, quizSummary } from './library.js';

export class QuizRepository {
  constructor(database, clock = () => new Date().toISOString()) {
    this.database = database;
    this.clock = clock;
  }

  list(ownerId, filters = {}) {
    const ids = this.database.prepare('SELECT id FROM quizzes WHERE owner_id = ?').all(ownerId);
    return quizLibrary(ids.map(({ id }) => this.get(id, ownerId)), filters).map(quizSummary);
  }

  get(id, ownerId) {
    const quiz = this.database.prepare(`SELECT id, owner_id ownerId, title, description, status,
      created_at createdAt, updated_at updatedAt FROM quizzes WHERE id = ? AND owner_id = ?`).get(id, ownerId);
    return quiz ? this.#hydrate(quiz) : null;
  }

  find(id) {
    const quiz = this.database.prepare(`SELECT id, owner_id ownerId, title, description, status,
      created_at createdAt, updated_at updatedAt FROM quizzes WHERE id = ?`).get(id);
    return quiz ? this.#hydrate(quiz) : null;
  }

  create(ownerId) {
    const id = randomUUID();
    const timestamp = this.clock();
    const quiz = { id, ownerId, title: 'Untitled quiz', description: null, status: 'draft',
      createdAt: timestamp, updatedAt: timestamp, questions: [{ id: randomUUID(), type: 'single_choice',
        prompt: 'Untitled question', explanation: null, timeLimitSeconds: 20, points: 1000, position: 0,
        options: [{ id: randomUUID(), text: 'Answer 1', isCorrect: true, position: 0 },
          { id: randomUUID(), text: 'Answer 2', isCorrect: false, position: 1 }] }] };
    return this.#replace(parseQuiz(quiz));
  }

  save(value, ownerId) {
    const existing = this.get(value.id, ownerId);
    if (!existing) return null;
    return this.#replace(parseQuiz({ ...value, ownerId, createdAt: existing.createdAt, updatedAt: this.clock() }));
  }

  #replace(quiz) {
    this.database.exec('BEGIN');
    try {
      this.database.prepare(`INSERT INTO quizzes (id, owner_id, title, description, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,
        description=excluded.description, status=excluded.status, updated_at=excluded.updated_at`)
        .run(quiz.id, quiz.ownerId, quiz.title, quiz.description, quiz.status, quiz.createdAt, quiz.updatedAt);
      this.database.prepare('DELETE FROM quiz_questions WHERE quiz_id = ?').run(quiz.id);
      const questionStatement = this.database.prepare(`INSERT INTO quiz_questions
        (id, quiz_id, type, prompt, explanation, time_limit_seconds, points, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      const optionStatement = this.database.prepare(`INSERT INTO answer_options
        (id, question_id, text, is_correct, position) VALUES (?, ?, ?, ?, ?)`);
      for (const question of quiz.questions) {
        questionStatement.run(question.id, quiz.id, question.type, question.prompt, question.explanation,
          question.timeLimitSeconds, question.points, question.position);
        for (const option of question.options) optionStatement.run(option.id, question.id, option.text,
          Number(option.isCorrect), option.position);
      }
      this.database.exec('COMMIT');
      return quiz;
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }

  #hydrate(quiz) {
    const questions = this.database.prepare(`SELECT id, type, prompt, explanation,
      time_limit_seconds timeLimitSeconds, points, position FROM quiz_questions WHERE quiz_id = ? ORDER BY position`).all(quiz.id);
    const optionStatement = this.database.prepare(`SELECT id, text, is_correct isCorrect, position
      FROM answer_options WHERE question_id = ? ORDER BY position`);
    return parseQuiz({ ...quiz, questions: questions.map((question) => ({ ...question,
      isCorrect: undefined, options: optionStatement.all(question.id).map((option) =>
        ({ ...option, isCorrect: Boolean(option.isCorrect) })) })) });
  }
}
