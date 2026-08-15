import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { parseCreateSessionInput, parseJoinSessionInput } from '../contracts/index.js';
import { RoomError } from './errors.js';

const PIN_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const TRANSITIONS = Object.freeze({ lobby: ['active', 'cancelled'], active: ['completed', 'cancelled'] });

export class RoomService {
  constructor({ clock = () => new Date(), random = defaultRandom, origin = 'http://127.0.0.1:4173', maxPlayers = 50 } = {}) {
    this.clock = clock;
    this.random = random;
    this.origin = origin;
    this.maxPlayers = maxPlayers;
    this.rooms = new Map();
  }

  create(value, hostId = 'user-host', origin = this.origin) {
    const { quizId } = parseCreateSessionInput(value);
    const joinCode = this.#uniquePin();
    const createdAt = this.clock().toISOString();
    const room = { id: randomUUID(), quizId, hostId, joinCode, origin, status: 'lobby',
      currentQuestionIndex: null, createdAt, startedAt: null, endedAt: null, participants: new Map() };
    this.rooms.set(joinCode, room);
    return this.snapshot(room);
  }

  join(value) {
    const input = parseJoinSessionInput(value);
    if (!/^[A-Z0-9]{6}$/.test(input.joinCode)) throw new RoomError('PIN must be six characters');
    const room = this.#room(input.joinCode);
    if (input.reconnectToken) return this.#reconnect(room, input.reconnectToken);
    if (room.status !== 'lobby') throw new RoomError('This game has already started', 409);
    const players = [...room.participants.values()].filter((player) => player.status !== 'removed');
    if (players.length >= this.maxPlayers) throw new RoomError('Room is full (50 players)', 409);
    const nicknameKey = input.nickname.toLocaleLowerCase();
    if (players.some((player) => player.nickname.toLocaleLowerCase() === nicknameKey)) {
      throw new RoomError('Nickname is already in use', 409);
    }
    const reconnectToken = randomBytes(32).toString('base64url');
    const participant = { id: randomUUID(), sessionId: room.id, nickname: input.nickname,
      status: 'connected', score: 0, joinedAt: this.clock().toISOString(), tokenHash: hash(reconnectToken) };
    room.participants.set(participant.id, participant);
    return { room: this.snapshot(room), participant: publicParticipant(participant), reconnectToken };
  }

  disconnect(joinCode, token) {
    const { room, participant } = this.#authorizedPlayer(joinCode, token);
    if (participant.status !== 'removed') participant.status = 'disconnected';
    return { room: this.snapshot(room), participant: publicParticipant(participant) };
  }

  remove(joinCode, participantId) {
    const room = this.#room(joinCode);
    const participant = room.participants.get(participantId);
    if (!participant) throw new RoomError('Player not found', 404);
    participant.status = 'removed';
    return this.snapshot(room);
  }

  transition(joinCode, status) {
    const room = this.#room(joinCode);
    if (!TRANSITIONS[room.status]?.includes(status)) throw new RoomError(`Cannot change ${room.status} room to ${status}`, 409);
    room.status = status;
    const timestamp = this.clock().toISOString();
    if (status === 'active') { room.startedAt = timestamp; room.currentQuestionIndex = 0; }
    if (status === 'completed' || status === 'cancelled') room.endedAt = timestamp;
    return this.snapshot(room);
  }

  get(joinCode) { return this.snapshot(this.#room(joinCode)); }

  snapshot(room) {
    const joinUrl = `${room.origin}/live?pin=${room.joinCode}`;
    return Object.freeze({ id: room.id, quizId: room.quizId, hostId: room.hostId, joinCode: room.joinCode,
      status: room.status, currentQuestionIndex: room.currentQuestionIndex, createdAt: room.createdAt,
      startedAt: room.startedAt, endedAt: room.endedAt, maxPlayers: this.maxPlayers, joinUrl,
      qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}`,
      participants: Object.freeze([...room.participants.values()].map(publicParticipant)) });
  }

  #reconnect(room, token) {
    const participant = [...room.participants.values()].find((item) => item.tokenHash === hash(token));
    if (!participant || participant.status === 'removed') throw new RoomError('Reconnect token is invalid', 401);
    if (room.status === 'completed' || room.status === 'cancelled') throw new RoomError('This game has ended', 409);
    participant.status = 'connected';
    return { room: this.snapshot(room), participant: publicParticipant(participant), reconnectToken: token };
  }

  #authorizedPlayer(joinCode, token) {
    const room = this.#room(joinCode);
    const participant = [...room.participants.values()].find((item) => item.tokenHash === hash(token ?? ''));
    if (!participant) throw new RoomError('Reconnect token is invalid', 401);
    return { room, participant };
  }

  #room(joinCode) {
    const room = this.rooms.get(String(joinCode).toUpperCase());
    if (!room) throw new RoomError('Room not found', 404);
    return room;
  }

  #uniquePin() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let pin = '';
      for (let index = 0; index < 6; index += 1) pin += PIN_ALPHABET[this.random(PIN_ALPHABET.length)];
      if (!this.rooms.has(pin)) return pin;
    }
    throw new RoomError('Could not allocate a room PIN', 503);
  }
}

function publicParticipant({ tokenHash, ...participant }) { return Object.freeze(participant); }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function defaultRandom(limit) { return randomBytes(4).readUInt32BE() % limit; }
