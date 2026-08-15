import { randomBytes, randomUUID } from 'node:crypto';
import { parseJoinSessionInput, parseSubmitAnswerInput } from '../contracts/index.js';

const MODES = new Set(['host', 'player']);

export function createPlayerGame({ quiz, session, clock = () => new Date(), mode = 'host' }) {
  if (!MODES.has(mode)) throw new TypeError('mode must be host or player');
  let progressionMode = mode;
  let hostIndex = 0;
  let hostQuestionStartedAt = clock().getTime();
  const players = new Map();
  const tokens = new Map();

  function join(value) {
    const input = parseJoinSessionInput(value);
    if (input.joinCode !== session.joinCode) throw new PlayerGameError('Game not found', 404);
    if (input.reconnectToken) {
      const player = players.get(tokens.get(input.reconnectToken));
      if (player) return joined(player, input.reconnectToken);
    }
    const nickname = input.nickname.trim();
    if (!nickname) throw new PlayerGameError('Enter a nickname');
    if ([...players.values()].some((player) => player.nickname.toLowerCase() === nickname.toLowerCase())) {
      throw new PlayerGameError('That nickname is already taken', 409);
    }
    const player = { id: randomUUID(), nickname, score: 0, answers: new Map(), questionIndex: 0,
      questionStartedAt: clock().getTime() };
    const reconnectToken = randomBytes(24).toString('base64url');
    players.set(player.id, player); tokens.set(reconnectToken, player.id);
    return joined(player, reconnectToken);
  }

  function state(playerId) {
    const player = requirePlayer(playerId);
    const index = currentIndex(player);
    const question = quiz.questions[index];
    if (!question) return { phase: 'completed', mode: progressionMode,
      player: publicPlayer(player), totalQuestions: quiz.questions.length };
    expire(player, question);
    const prior = player.answers.get(question.id);
    return { phase: prior ? 'feedback' : session.status === 'lobby' ? 'lobby' : 'question',
      mode: progressionMode, canAdvance: progressionMode === 'player' && Boolean(prior),
      player: publicPlayer(player), question: publicQuestion(question, index, startedAt(player)),
      result: prior?.result ?? null };
  }

  function answer(value) {
    const input = parseSubmitAnswerInput(value);
    if (input.sessionId !== session.id) throw new PlayerGameError('Game not found', 404);
    const player = requirePlayer(input.participantId);
    const question = quiz.questions[currentIndex(player)];
    if (!question || question.id !== input.questionId) throw new PlayerGameError('That question is no longer active', 409);
    expire(player, question);
    if (player.answers.has(question.id)) throw new PlayerGameError('Answer already submitted or time expired', 409);
    const validIds = new Set(question.options.map(({ id }) => id));
    const selected = new Set(input.optionIds);
    if (selected.size !== input.optionIds.length || [...selected].some((id) => !validIds.has(id))) {
      throw new PlayerGameError('Select valid answers only');
    }
    if (question.type === 'single_choice' && selected.size !== 1) throw new PlayerGameError('Select one answer');
    const elapsed = Math.max(0, clock().getTime() - startedAt(player));
    const responseTimeMs = Math.max(input.responseTimeMs, elapsed);
    if (responseTimeMs > question.timeLimitSeconds * 1000) {
      expire(player, question, true); throw new PlayerGameError('Time expired', 409);
    }
    return record(player, question, [...selected], responseTimeMs, false);
  }

  function advance(playerId) {
    if (progressionMode === 'host') {
      hostIndex = Math.min(hostIndex + 1, quiz.questions.length);
      hostQuestionStartedAt = clock().getTime();
      return { mode: progressionMode, questionIndex: hostIndex };
    }
    const player = requirePlayer(playerId);
    const question = quiz.questions[player.questionIndex];
    if (question) expire(player, question);
    if (question && !player.answers.has(question.id)) throw new PlayerGameError('Answer or wait for time to expire', 409);
    player.questionIndex = Math.min(player.questionIndex + 1, quiz.questions.length);
    player.questionStartedAt = clock().getTime();
    return state(player.id);
  }

  function setMode(nextMode) {
    if (!MODES.has(nextMode)) throw new PlayerGameError('Mode must be host or player');
    progressionMode = nextMode; resetProgress();
    return { mode: progressionMode };
  }
  function reset() { resetProgress(); players.clear(); tokens.clear(); }
  function resetProgress() {
    hostIndex = 0; hostQuestionStartedAt = clock().getTime();
    for (const player of players.values()) {
      player.score = 0; player.answers.clear(); player.questionIndex = 0; player.questionStartedAt = clock().getTime();
    }
  }
  function expire(player, question, force = false) {
    if (player.answers.has(question.id)) return;
    if (force || clock().getTime() >= startedAt(player) + question.timeLimitSeconds * 1000) record(player, question, [], question.timeLimitSeconds * 1000, true);
  }
  function record(player, question, optionIds, responseTimeMs, timedOut) {
    const selected = new Set(optionIds);
    const correctIds = question.options.filter((option) => option.isCorrect).map((option) => option.id);
    const isCorrect = !timedOut && selected.size === correctIds.length && correctIds.every((id) => selected.has(id));
    const speed = Math.max(0, 1 - responseTimeMs / (question.timeLimitSeconds * 1000));
    const pointsAwarded = isCorrect ? Math.round(question.points * (0.5 + speed * 0.5)) : 0;
    player.score += pointsAwarded;
    const result = { isCorrect, timedOut, pointsAwarded, correctOptionIds: correctIds,
      explanation: question.explanation, totalScore: player.score };
    player.answers.set(question.id, { optionIds, result }); return result;
  }
  function currentIndex(player) { return progressionMode === 'host' ? hostIndex : player.questionIndex; }
  function startedAt(player) { return progressionMode === 'host' ? hostQuestionStartedAt : player.questionStartedAt; }
  function publicQuestion(question, index, start) {
    return { questionId: question.id, prompt: question.prompt, type: question.type,
      options: question.options.map(({ id, text }) => ({ id, text })), questionNumber: index + 1,
      totalQuestions: quiz.questions.length,
      closesAt: new Date(start + question.timeLimitSeconds * 1000).toISOString() };
  }
  function joined(player, reconnectToken) { return { sessionId: session.id, participantId: player.id, nickname: player.nickname, reconnectToken }; }
  function requirePlayer(id) { const player = players.get(id); if (!player) throw new PlayerGameError('Player not found', 404); return player; }
  function publicPlayer(player) { return { id: player.id, nickname: player.nickname, score: player.score }; }
  return { join, state, answer, advance, setMode, reset };
}

export class PlayerGameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
