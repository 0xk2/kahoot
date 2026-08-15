import { parseQuiz } from '../contracts/index.js';
import { quizLibrary, quizSummary } from './library.js';

export function createCreatorStore(seedQuizzes, clock = () => new Date().toISOString()) {
  const quizzes = new Map(seedQuizzes.map((quiz) => [quiz.id, parseQuiz(quiz)]));
  let sequence = 1;
  return Object.freeze({
    list(filters) {
      return quizLibrary([...quizzes.values()], filters).map(quizSummary);
    },
    get(id) {
      return quizzes.get(id) ?? null;
    },
    create() {
      const timestamp = clock();
      const id = `quiz-new-${sequence++}`;
      const quiz = parseQuiz({ id, ownerId: 'user-host', title: 'Untitled quiz', description: null,
        status: 'draft', createdAt: timestamp, updatedAt: timestamp, questions: [{
          id: `${id}-q1`, type: 'single_choice', prompt: 'Untitled question', explanation: null,
          timeLimitSeconds: 20, points: 1000, position: 0, options: [
            { id: `${id}-a1`, text: 'Answer 1', isCorrect: true, position: 0 },
            { id: `${id}-a2`, text: 'Answer 2', isCorrect: false, position: 1 }
          ]
        }] });
      quizzes.set(id, quiz);
      return quiz;
    },
    save(value) {
      const existing = quizzes.get(value.id);
      if (!existing) return null;
      const saved = parseQuiz({ ...value, ownerId: existing.ownerId, createdAt: existing.createdAt, updatedAt: clock() });
      quizzes.set(saved.id, saved);
      return saved;
    }
  });
}
