import { parseQuiz } from '../contracts/index.js';
import { quiz } from './mock-data.js';

const ownerId = 'user-host';
const createdAt = '2026-08-10T09:00:00.000Z';

function smallQuiz(id, title, description, status, updatedAt, prompt) {
  return parseQuiz({ id, ownerId, title, description, status, createdAt, updatedAt, questions: [{
    id: `${id}-q1`, type: 'single_choice', prompt, explanation: null,
    timeLimitSeconds: 10, points: 500, position: 0, options: [
      { id: `${id}-a`, text: 'True', isCorrect: true, position: 0 },
      { id: `${id}-b`, text: 'False', isCorrect: false, position: 1 }
    ]
  }] });
}

export const creatorQuizzes = Object.freeze([
  quiz,
  smallQuiz('quiz-history', 'History lightning round', 'Fast facts for Friday.', 'draft',
    '2026-08-13T15:30:00.000Z', 'The printing press was invented before 1500.'),
  smallQuiz('quiz-safety', 'Lab safety essentials', 'Annual team refresher.', 'archived',
    '2026-08-11T10:00:00.000Z', 'Safety goggles are optional during setup.')
]);
