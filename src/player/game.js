import { randomBytes, randomUUID } from 'node:crypto';
import { parseJoinSessionInput, parseSubmitAnswerInput } from '../contracts/index.js';
import { calculatePoints, rankPlayers, SCORING_MODES } from './scoring.js';

export function createPlayerGame({ quiz, session, clock = () => new Date(), scoringMode = 'speed_weighted' }) {
  if (!SCORING_MODES.includes(scoringMode)) throw new TypeError(`Unknown scoring mode: ${scoringMode}`);
  let questionIndex = 0;
  let joinOrder = 0;
  const players = new Map();
  const tokens = new Map();

  function join(value) {
    const input = parseJoinSessionInput(value);
    if (input.joinCode !== session.joinCode) throw new PlayerGameError('Game not found', 404);
    if (input.reconnectToken) {
      const playerId = tokens.get(input.reconnectToken);
      const player = players.get(playerId);
      if (player) return joined(player, input.reconnectToken);
    }
    const nickname = input.nickname.trim();
    if (!nickname) throw new PlayerGameError('Enter a nickname');
    if ([...players.values()].some((player) => player.nickname.toLowerCase() === nickname.toLowerCase())) {
      throw new PlayerGameError('That nickname is already taken', 409);
    }
    const player = { id: randomUUID(), nickname, score: 0, answers: new Map(), joinOrder: joinOrder++ };
    const reconnectToken = randomBytes(24).toString('base64url');
    players.set(player.id, player);
    tokens.set(reconnectToken, player.id);
    return joined(player, reconnectToken);
  }

  function state(playerId) {
    const player = requirePlayer(playerId);
    const question = quiz.questions[questionIndex];
    if (!question) return { phase: 'completed', player: publicPlayer(player), totalQuestions: quiz.questions.length,
      scoringMode, leaderboard: leaderboard() };
    const prior = player.answers.get(question.id);
    return {
      phase: prior ? 'feedback' : session.status === 'lobby' ? 'lobby' : 'question',
      player: publicPlayer(player), question: publicQuestion(question), result: prior?.result ?? null,
      scoringMode, leaderboard: prior ? leaderboard() : null
    };
  }

  function answer(value) {
    const input = parseSubmitAnswerInput(value);
    if (input.sessionId !== session.id) throw new PlayerGameError('Game not found', 404);
    const player = requirePlayer(input.participantId);
    const question = quiz.questions[questionIndex];
    if (!question || question.id !== input.questionId) throw new PlayerGameError('That question is no longer active', 409);
    if (player.answers.has(question.id)) throw new PlayerGameError('Answer already submitted', 409);
    const validIds = new Set(question.options.map(({ id }) => id));
    const selected = new Set(input.optionIds);
    if (selected.size !== input.optionIds.length || [...selected].some((id) => !validIds.has(id))) {
      throw new PlayerGameError('Select valid answers only');
    }
    if (question.type === 'single_choice' && selected.size !== 1) throw new PlayerGameError('Select one answer');
    const correctIds = question.options.filter((option) => option.isCorrect).map((option) => option.id);
    const isCorrect = selected.size === correctIds.length && correctIds.every((id) => selected.has(id));
    const pointsAwarded = calculatePoints({ isCorrect, points: question.points,
      responseTimeMs: input.responseTimeMs, timeLimitSeconds: question.timeLimitSeconds, mode: scoringMode });
    player.score += pointsAwarded;
    const result = { isCorrect, pointsAwarded, correctOptionIds: correctIds,
      explanation: question.explanation, totalScore: player.score,
      selectedOptionIds: [...selected], reveal: question.options.map(({ id, text, isCorrect: correct }) =>
        ({ id, text, isCorrect: correct, isSelected: selected.has(id) })) };
    player.answers.set(question.id, { optionIds: [...selected], result });
    return result;
  }

  function advance() { questionIndex = Math.min(questionIndex + 1, quiz.questions.length); }
  function reset() { questionIndex = 0; joinOrder = 0; players.clear(); tokens.clear(); }
  function leaderboard() { return rankPlayers(players.values()); }
  function joined(player, reconnectToken) {
    return { sessionId: session.id, participantId: player.id, nickname: player.nickname, reconnectToken };
  }
  function requirePlayer(id) {
    const player = players.get(id);
    if (!player) throw new PlayerGameError('Player not found', 404);
    return player;
  }
  function publicPlayer(player) { return { id: player.id, nickname: player.nickname, score: player.score }; }
  function publicQuestion(question) {
    return { questionId: question.id, prompt: question.prompt, type: question.type,
      options: question.options.map(({ id, text }) => ({ id, text })), questionNumber: questionIndex + 1,
      totalQuestions: quiz.questions.length,
      closesAt: new Date(clock().getTime() + question.timeLimitSeconds * 1000).toISOString() };
  }
  return { join, state, answer, advance, reset, leaderboard };
}

export class PlayerGameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
