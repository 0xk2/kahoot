import { array, boolean, id, integer, isoDate, object, oneOf, optionalString, string } from './validation.js';

export function parsePlayerQuestion(value, path = 'playerQuestion') {
  const input = object(value, path);
  return Object.freeze({
    questionId: id(input.questionId, `${path}.questionId`),
    prompt: string(input.prompt, `${path}.prompt`, { max: 500 }),
    type: oneOf(input.type, `${path}.type`, ['single_choice', 'multiple_choice']),
    options: Object.freeze(array(input.options, `${path}.options`, (option, optionPath) => {
      const item = object(option, optionPath);
      return Object.freeze({ id: id(item.id, `${optionPath}.id`), text: string(item.text, `${optionPath}.text`, { max: 240 }) });
    }, { min: 2, max: 10 })),
    questionNumber: integer(input.questionNumber, `${path}.questionNumber`, { min: 1, max: 100 }),
    totalQuestions: integer(input.totalQuestions, `${path}.totalQuestions`, { min: 1, max: 100 }),
    closesAt: isoDate(input.closesAt, `${path}.closesAt`)
  });
}

export function parseSubmitAnswerInput(value, path = 'answer') {
  const input = object(value, path);
  return Object.freeze({
    sessionId: id(input.sessionId, `${path}.sessionId`), participantId: id(input.participantId, `${path}.participantId`),
    questionId: id(input.questionId, `${path}.questionId`),
    optionIds: Object.freeze(array(input.optionIds, `${path}.optionIds`, id, { min: 1, max: 10 })),
    responseTimeMs: integer(input.responseTimeMs, `${path}.responseTimeMs`, { max: 300000 })
  });
}

export function parseAnswerResult(value, path = 'answerResult') {
  const input = object(value, path);
  return Object.freeze({
    isCorrect: boolean(input.isCorrect, `${path}.isCorrect`),
    pointsAwarded: integer(input.pointsAwarded, `${path}.pointsAwarded`, { max: 100000 }),
    correctOptionIds: Object.freeze(array(input.correctOptionIds, `${path}.correctOptionIds`, id, { min: 1, max: 10 })),
    explanation: optionalString(input.explanation, `${path}.explanation`, { max: 1000 }),
    totalScore: integer(input.totalScore, `${path}.totalScore`, { max: 100000000 })
  });
}

export function parseLeaderboardEntry(value, path = 'leaderboardEntry') {
  const input = object(value, path);
  return Object.freeze({
    participantId: id(input.participantId, `${path}.participantId`),
    nickname: string(input.nickname, `${path}.nickname`, { max: 40 }),
    score: integer(input.score, `${path}.score`, { max: 100000000 }),
    rank: integer(input.rank, `${path}.rank`, { min: 1, max: 1000000 })
  });
}
