import { createHash, randomUUID } from 'node:crypto';
import { parseSubmitAnswerInput } from '../contracts/index.js';
import { calculatePoints, rankPlayers } from './scoring.js';
import { PlayerGameError } from './game.js';

export class DurablePlayerGame {
  constructor(database, roomRepository, findQuiz, { clock = () => new Date() } = {}) {
    this.database = database;
    this.rooms = roomRepository;
    this.findQuiz = findQuiz;
    this.clock = clock;
  }

  state(participantId, reconnectToken) {
    this.#authorize(participantId, reconnectToken);
    const participant = this.#participant(participantId);
    const room = this.rooms.getById(participant.sessionId);
    const quiz = this.findQuiz(room.quizId);
    if (room.status === 'cancelled') throw new PlayerGameError('Game was cancelled', 409);
    if (room.status === 'completed') return this.#completed(room, participant);
    if (room.status === 'lobby') return { phase: 'lobby', mode: room.progressionMode,
      scoringMode: room.scoringMode, player: publicPlayer(participant) };
    const question = quiz.questions[room.currentQuestionIndex];
    if (!question) return this.#completed(room, participant);
    const answer = this.#answer(room.id, question.id, participant.id);
    if (!answer && this.clock() >= this.#deadline(room.id, question)) this.#record(room, participant, question, [], true);
    const recorded = answer || this.#answer(room.id, question.id, participant.id);
    return { phase: recorded ? 'feedback' : 'question', mode: room.progressionMode,
      scoringMode: room.scoringMode, canAdvance: false, player: publicPlayer(this.#participant(participantId)),
      question: this.#publicQuestion(room, quiz, question), result: recorded ? this.#result(recorded, question) : null,
      leaderboard: recorded ? this.#leaderboard(room.id) : null };
  }

  answer(value) {
    this.#authorize(value.participantId, value.reconnectToken);
    const input = parseSubmitAnswerInput(value);
    const participant = this.#participant(input.participantId);
    const room = this.rooms.getById(participant.sessionId);
    if (room.id !== input.sessionId) throw new PlayerGameError('Game not found', 404);
    if (room.status !== 'active') throw new PlayerGameError('That question is not active', 409);
    const quiz = this.findQuiz(room.quizId);
    const question = quiz.questions[room.currentQuestionIndex];
    if (!question || question.id !== input.questionId) throw new PlayerGameError('That question is no longer active', 409);
    if (this.#answer(room.id, question.id, participant.id)) throw new PlayerGameError('Answer already submitted', 409);
    const selected = new Set(input.optionIds);
    const valid = new Set(question.options.map(({ id }) => id));
    if (selected.size !== input.optionIds.length || [...selected].some((id) => !valid.has(id))) {
      throw new PlayerGameError('Select valid answers only');
    }
    if (question.type === 'single_choice' && selected.size !== 1) throw new PlayerGameError('Select one answer');
    const opened = this.#opened(room.id, question.position);
    const elapsed = Math.max(0, this.clock().getTime() - new Date(opened).getTime());
    if (this.clock() >= this.#deadline(room.id, question)) {
      this.#record(room, participant, question, [], true);
      throw new PlayerGameError('Time expired', 409);
    }
    return this.#record(room, participant, question, [...selected], false, Math.max(elapsed, input.responseTimeMs));
  }

  #record(room, participant, question, optionIds, timedOut, responseTimeMs) {
    const correctIds = question.options.filter(({ isCorrect }) => isCorrect).map(({ id }) => id);
    const selected = new Set(optionIds);
    const correct = !timedOut && selected.size === correctIds.length && correctIds.every((id) => selected.has(id));
    const elapsed = responseTimeMs ?? question.timeLimitSeconds * 1000;
    const points = calculatePoints({ isCorrect: correct, points: question.points, responseTimeMs: elapsed,
      timeLimitSeconds: question.timeLimitSeconds, mode: room.scoringMode });
    const id = randomUUID();
    this.database.exec('BEGIN');
    try {
      this.database.prepare(`INSERT INTO answers (id, session_id, question_id, participant_id,
        response_time_ms, is_correct, points_awarded, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, room.id, question.id, participant.id, elapsed, Number(correct), points, this.clock().toISOString());
      const insert = this.database.prepare('INSERT INTO answer_selections (answer_id, question_id, option_id) VALUES (?, ?, ?)');
      optionIds.forEach((optionId) => insert.run(id, question.id, optionId));
      this.database.prepare('UPDATE participants SET score = score + ? WHERE id = ?').run(points, participant.id);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      if (String(error.message).includes('UNIQUE')) throw new PlayerGameError('Answer already submitted', 409);
      throw error;
    }
    return this.#result(this.#answer(room.id, question.id, participant.id), question);
  }

  #result(answer, question) {
    const selected = new Set(this.database.prepare('SELECT option_id optionId FROM answer_selections WHERE answer_id = ?')
      .all(answer.id).map(({ optionId }) => optionId));
    const player = this.#participant(answer.participantId);
    return { isCorrect: Boolean(answer.isCorrect), timedOut: selected.size === 0, pointsAwarded: answer.pointsAwarded,
      correctOptionIds: question.options.filter(({ isCorrect }) => isCorrect).map(({ id }) => id),
      explanation: question.explanation, totalScore: player.score, selectedOptionIds: [...selected],
      reveal: question.options.map(({ id, text, isCorrect }) => ({ id, text, isCorrect, isSelected: selected.has(id) })) };
  }

  #answer(sessionId, questionId, participantId) {
    return this.database.prepare(`SELECT id, participant_id participantId, is_correct isCorrect,
      points_awarded pointsAwarded FROM answers WHERE session_id = ? AND question_id = ? AND participant_id = ?`)
      .get(sessionId, questionId, participantId) ?? null;
  }

  #participant(id) {
    const participant = this.rooms.findParticipant(id);
    if (!participant || participant.status === 'removed') throw new PlayerGameError('Player not found', 404);
    return participant;
  }

  #authorize(id, token) {
    const digest = createHash('sha256').update(token ?? '').digest('hex');
    if (!this.rooms.authorizeParticipant(id, digest)) throw new PlayerGameError('Player authorization required', 401);
  }

  #opened(sessionId, position) {
    return this.database.prepare('SELECT opened_at openedAt FROM session_questions WHERE session_id = ? AND position = ?')
      .get(sessionId, position)?.openedAt;
  }
  #deadline(sessionId, question) {
    return new Date(new Date(this.#opened(sessionId, question.position)).getTime() + question.timeLimitSeconds * 1000);
  }
  #publicQuestion(room, quiz, question) {
    return { questionId: question.id, prompt: question.prompt, type: question.type,
      options: question.options.map(({ id, text }) => ({ id, text })), questionNumber: question.position + 1,
      totalQuestions: quiz.questions.length, closesAt: this.#deadline(room.id, question).toISOString() };
  }
  #leaderboard(sessionId) { return rankPlayers(this.rooms.participants(sessionId)
    .filter(({ status }) => status !== 'removed').map((player, joinOrder) => ({ ...player, joinOrder }))); }
  #completed(room, participant) { return { phase: 'completed', mode: room.progressionMode,
    scoringMode: room.scoringMode, player: publicPlayer(participant), leaderboard: this.#leaderboard(room.id) }; }
}

function publicPlayer({ id, nickname, score }) { return { id, nickname, score }; }
