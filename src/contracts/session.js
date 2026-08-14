import { id, integer, isoDate, nullable, object, oneOf, optionalString, string } from './validation.js';

export const SESSION_STATUSES = Object.freeze(['lobby', 'active', 'completed', 'cancelled']);
export const PARTICIPANT_STATUSES = Object.freeze(['connected', 'disconnected', 'removed']);

export function parseGameSession(value, path = 'session') {
  const input = object(value, path);
  return Object.freeze({
    id: id(input.id, `${path}.id`), quizId: id(input.quizId, `${path}.quizId`),
    hostId: id(input.hostId, `${path}.hostId`),
    joinCode: string(input.joinCode, `${path}.joinCode`, { min: 4, max: 12 }),
    status: oneOf(input.status, `${path}.status`, SESSION_STATUSES),
    currentQuestionIndex: nullable(input.currentQuestionIndex, integer, `${path}.currentQuestionIndex`),
    createdAt: isoDate(input.createdAt, `${path}.createdAt`),
    startedAt: nullable(input.startedAt, isoDate, `${path}.startedAt`),
    endedAt: nullable(input.endedAt, isoDate, `${path}.endedAt`)
  });
}

export function parseParticipant(value, path = 'participant') {
  const input = object(value, path);
  return Object.freeze({
    id: id(input.id, `${path}.id`), sessionId: id(input.sessionId, `${path}.sessionId`),
    nickname: string(input.nickname, `${path}.nickname`, { max: 40 }),
    status: oneOf(input.status, `${path}.status`, PARTICIPANT_STATUSES),
    score: integer(input.score, `${path}.score`, { max: 100000000 }),
    joinedAt: isoDate(input.joinedAt, `${path}.joinedAt`)
  });
}

export function parseCreateSessionInput(value, path = 'createSession') {
  const input = object(value, path);
  return Object.freeze({ quizId: id(input.quizId, `${path}.quizId`) });
}

export function parseJoinSessionInput(value, path = 'joinSession') {
  const input = object(value, path);
  return Object.freeze({
    joinCode: string(input.joinCode, `${path}.joinCode`, { min: 4, max: 12 }).toUpperCase(),
    nickname: string(input.nickname, `${path}.nickname`, { max: 40 }),
    reconnectToken: optionalString(input.reconnectToken, `${path}.reconnectToken`, { min: 16, max: 256 })
  });
}
