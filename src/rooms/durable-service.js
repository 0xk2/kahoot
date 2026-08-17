import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { parseCreateSessionInput, parseJoinSessionInput } from '../contracts/index.js';
import { RoomError } from './errors.js';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const TRANSITIONS = { lobby: ['active', 'cancelled'], active: ['completed', 'cancelled'] };

export class DurableRoomService {
  constructor(repository, findQuiz, { clock = () => new Date(), random = defaultRandom,
    origin = 'http://127.0.0.1:3000' } = {}) {
    this.repository = repository;
    this.findQuiz = findQuiz;
    this.clock = clock;
    this.random = random;
    this.origin = origin;
  }

  create(value, hostId, origin = this.origin) {
    const input = parseCreateSessionInput(value);
    const quiz = this.findQuiz(input.quizId);
    const room = { id: randomUUID(), quizId: quiz.id, hostId, joinCode: this.#pin(), status: 'lobby',
      revision: 0, progressionMode: value.progressionMode || 'host', scoringMode: value.scoringMode || 'speed_weighted',
      currentQuestionIndex: null, createdAt: this.clock().toISOString() };
    this.repository.create(room, quiz.questions.map(({ id }) => id));
    return this.#public(this.repository.getByPin(room.joinCode), origin);
  }

  get(pin) {
    const room = this.repository.getByPin(String(pin).toUpperCase());
    if (!room) throw new RoomError('Room not found', 404);
    return this.#public(room);
  }

  list({ hostId, quizId } = {}) {
    if (!hostId) throw new RoomError('Host authorization required', 403);
    return this.repository.list(hostId).filter((room) => !quizId || room.quizId === quizId).map((room) => this.#public(room));
  }

  join(value) {
    const input = parseJoinSessionInput(value);
    const room = this.#room(input.joinCode);
    if (input.reconnectToken) return this.#reconnect(room, input.reconnectToken);
    if (room.status !== 'lobby') throw new RoomError('This game has already started', 409);
    const active = room.participants.filter(({ status }) => status !== 'removed');
    if (active.length >= 50) throw new RoomError('Room is full (50 players)', 409);
    if (active.some(({ nickname }) => nickname.toLowerCase() === input.nickname.toLowerCase())) {
      throw new RoomError('Nickname is already in use', 409);
    }
    const reconnectToken = randomBytes(32).toString('base64url');
    const participant = this.repository.addParticipant({ id: randomUUID(), sessionId: room.id,
      nickname: input.nickname, status: 'connected', score: 0, joinedAt: this.clock().toISOString() }, hash(reconnectToken));
    return { room: this.#public(this.#room(room.joinCode)), participant, reconnectToken,
      sessionId: room.id, participantId: participant.id, nickname: participant.nickname };
  }

  transition(pin, status, hostId, expectedRevision) {
    const room = this.#authorized(pin, hostId, expectedRevision);
    if (!TRANSITIONS[room.status]?.includes(status)) throw new RoomError(`Cannot change ${room.status} room to ${status}`, 409);
    const now = this.clock().toISOString();
    const next = { status, currentQuestionIndex: status === 'active' ? 0 : room.currentQuestionIndex,
      startedAt: status === 'active' ? now : room.startedAt,
      endedAt: ['completed', 'cancelled'].includes(status) ? now : room.endedAt };
    if (!this.repository.transition(room, next)) throw stale();
    if (status === 'active') this.repository.database.prepare(`UPDATE session_questions SET opened_at = ?
      WHERE session_id = ? AND position = 0`).run(now, room.id);
    return this.get(pin);
  }

  advance(pin, hostId, expectedRevision, questionCount) {
    const room = this.#authorized(pin, hostId, expectedRevision);
    if (room.status !== 'active') throw new RoomError('Only active games can advance', 409);
    if (room.currentQuestionIndex >= questionCount - 1) throw new RoomError('Complete the game after the final question', 409);
    try { this.repository.advance(room, room.currentQuestionIndex + 1, this.clock().toISOString()); }
    catch (error) { if (error.message === 'STALE') throw stale(); throw error; }
    return this.get(pin);
  }

  remove(pin, participantId, hostId, expectedRevision) {
    const room = this.#authorized(pin, hostId, expectedRevision);
    const participant = room.participants.find(({ id }) => id === participantId);
    if (!participant) throw new RoomError('Player not found', 404);
    this.repository.remove(participantId);
    if (!this.repository.incrementRevision(room)) throw stale();
    return this.get(pin);
  }

  #reconnect(room, token) {
    const participant = this.repository.findReconnect(room.id, hash(token));
    if (!participant || participant.status === 'removed') throw new RoomError('Reconnect token is invalid', 401);
    if (['completed', 'cancelled'].includes(room.status)) throw new RoomError('This game has ended', 409);
    this.repository.reconnect(participant.id);
    return { room: this.get(room.joinCode), participant: { ...participant, status: 'connected' }, reconnectToken: token,
      sessionId: room.id, participantId: participant.id, nickname: participant.nickname };
  }

  #authorized(pin, hostId, revision) {
    const room = this.#room(pin);
    if (!hostId || room.hostId !== hostId) throw new RoomError('Host authorization required', 403);
    if (!Number.isInteger(revision)) throw new RoomError('Room revision is required', 400);
    if (room.revision !== revision) throw stale();
    return room;
  }

  #room(pin) {
    const room = this.repository.getByPin(String(pin).toUpperCase());
    if (!room) throw new RoomError('Room not found', 404);
    return room;
  }

  #pin() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let pin = '';
      for (let index = 0; index < 6; index += 1) pin += ALPHABET[this.random(ALPHABET.length)];
      if (!this.repository.getByPin(pin)) return pin;
    }
    throw new RoomError('Could not allocate a room PIN', 503);
  }

  #public(room, origin = this.origin) {
    const joinUrl = `${origin}/play?pin=${room.joinCode}`;
    return { ...room, hostId: undefined, maxPlayers: 50, joinUrl,
      qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}`,
      questionResults: [] };
  }
}

function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function defaultRandom(limit) { return randomBytes(4).readUInt32BE() % limit; }
function stale() { return new RoomError('Room changed; refresh and try again', 409); }
