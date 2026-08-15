import { array, boolean, ContractError, id, integer, isoDate, object, oneOf, optionalString, string } from './validation.js';

export const QUIZ_STATUSES = Object.freeze(['draft', 'published', 'archived']);
export const QUESTION_TYPES = Object.freeze(['single_choice', 'multiple_choice']);

export function parseAnswerOption(value, path = 'option') {
  const input = object(value, path);
  return Object.freeze({
    id: id(input.id, `${path}.id`),
    text: string(input.text, `${path}.text`, { max: 240 }),
    isCorrect: boolean(input.isCorrect, `${path}.isCorrect`),
    position: integer(input.position, `${path}.position`, { max: 9 })
  });
}

export function parseQuestion(value, path = 'question') {
  const input = object(value, path);
  const type = oneOf(input.type, `${path}.type`, QUESTION_TYPES);
  const options = array(input.options, `${path}.options`, parseAnswerOption, { min: 2, max: 10 });
  const correctCount = options.filter((option) => option.isCorrect).length;
  if (correctCount < 1 || (type === 'single_choice' && correctCount !== 1)) {
    throw new ContractError(`${path}.options`, `has an invalid number of correct answers for ${type}`);
  }
  return Object.freeze({
    id: id(input.id, `${path}.id`), type,
    prompt: string(input.prompt, `${path}.prompt`, { max: 500 }),
    explanation: optionalString(input.explanation, `${path}.explanation`, { max: 1000 }),
    timeLimitSeconds: integer(input.timeLimitSeconds, `${path}.timeLimitSeconds`, { min: 5, max: 300 }),
    points: integer(input.points, `${path}.points`, { min: 0, max: 100000 }),
    position: integer(input.position, `${path}.position`, { max: 999 }),
    options: Object.freeze(options)
  });
}

export function parseQuiz(value, path = 'quiz') {
  const input = object(value, path);
  return Object.freeze({
    id: id(input.id, `${path}.id`), ownerId: id(input.ownerId, `${path}.ownerId`),
    title: string(input.title, `${path}.title`, { max: 160 }),
    description: optionalString(input.description, `${path}.description`, { max: 1000 }),
    status: oneOf(input.status, `${path}.status`, QUIZ_STATUSES),
    questions: Object.freeze(array(input.questions, `${path}.questions`, parseQuestion, { max: 100 })),
    createdAt: isoDate(input.createdAt, `${path}.createdAt`),
    updatedAt: isoDate(input.updatedAt, `${path}.updatedAt`)
  });
}
