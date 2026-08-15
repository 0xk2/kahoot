import { parseGameSession, parseParticipant, parsePlayerQuestion, parseQuiz } from '../contracts/index.js';

const now = '2026-08-14T12:00:00.000Z';

export const quiz = parseQuiz({
  id: 'quiz-space', ownerId: 'user-host', title: 'A Tiny Tour of Space',
  description: 'Representative quiz data for manually exploring the contracts.', status: 'published',
  createdAt: now, updatedAt: now,
  questions: [
    { id: 'q-mars', type: 'single_choice', prompt: 'Which planet is known as the Red Planet?',
      explanation: 'Iron minerals in the soil oxidize, giving Mars its red appearance.',
      timeLimitSeconds: 20, points: 1000, position: 0,
      options: [
        { id: 'opt-venus', text: 'Venus', isCorrect: false, position: 0 },
        { id: 'opt-mars', text: 'Mars', isCorrect: true, position: 1 },
        { id: 'opt-jupiter', text: 'Jupiter', isCorrect: false, position: 2 }
      ] },
    { id: 'q-moons', type: 'multiple_choice', prompt: 'Which planets have no natural moons?',
      explanation: 'Mercury and Venus are the only moonless planets.',
      timeLimitSeconds: 30, points: 1500, position: 1,
      options: [
        { id: 'opt-mercury', text: 'Mercury', isCorrect: true, position: 0 },
        { id: 'opt-venus-2', text: 'Venus', isCorrect: true, position: 1 },
        { id: 'opt-earth', text: 'Earth', isCorrect: false, position: 2 }
      ] }
  ]
});

export const session = parseGameSession({
  id: 'session-demo', quizId: quiz.id, hostId: 'user-host', joinCode: 'ORBIT1', status: 'active',
  currentQuestionIndex: 0, createdAt: now, startedAt: now, endedAt: null
});

export const participants = Object.freeze([
  parseParticipant({ id: 'player-ada', sessionId: session.id, nickname: 'Ada', status: 'connected', score: 1750, joinedAt: now }),
  parseParticipant({ id: 'player-grace', sessionId: session.id, nickname: 'Grace', status: 'connected', score: 1200, joinedAt: now })
]);

export function publicQuestion(index = 0) {
  const question = quiz.questions[index];
  return parsePlayerQuestion({
    questionId: question.id, prompt: question.prompt, type: question.type,
    options: question.options.map(({ id, text }) => ({ id, text })),
    questionNumber: index + 1, totalQuestions: quiz.questions.length,
    closesAt: '2026-08-14T12:00:20.000Z'
  });
}

export function harnessState() {
  return { quiz, session, participants, currentQuestion: publicQuestion(session.currentQuestionIndex) };
}
