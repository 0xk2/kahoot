import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { parseAuthUser, parseLoginInput, parseRegisterInput } from '../contracts/index.js';
import { hashPassword, verifyPassword } from './password.js';

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const DUMMY_HASH = await hashPassword('not-a-real-password');

export class AuthenticationError extends Error {}
export class UsernameTakenError extends Error {}

export class AuthService {
  constructor(repository, { now = () => new Date(), sessionMs = SESSION_MS } = {}) {
    this.repository = repository;
    this.now = now;
    this.sessionMs = sessionMs;
  }

  async register(value) {
    const input = parseRegisterInput(value);
    const passwordHash = await hashPassword(input.password);
    let user;
    try {
      const createdAt = this.now().toISOString();
      user = this.repository.createUser({ id: randomUUID(), ...input, passwordHash, createdAt });
    } catch (error) {
      if (String(error.message).includes('UNIQUE constraint failed: users.username')) {
        throw new UsernameTakenError('Username is unavailable');
      }
      throw error;
    }
    return { user: parseAuthUser(user), ...this.issueSession(user.id) };
  }

  async login(value) {
    const input = parseLoginInput(value);
    const credentials = this.repository.findCredentials(input.username);
    const valid = await verifyPassword(input.password, credentials?.passwordHash || DUMMY_HASH);
    if (!credentials || !valid) throw new AuthenticationError('Invalid username or password');
    const user = parseAuthUser(this.repository.findUserById(credentials.id));
    return { user, ...this.issueSession(user.id) };
  }

  authenticate(token) {
    if (!token) return null;
    const session = this.repository.findSession(tokenHash(token), this.now().toISOString());
    return session ? parseAuthUser(this.repository.findUserById(session.userId)) : null;
  }

  logout(token) {
    if (token) this.repository.deleteSession(tokenHash(token));
  }

  issueSession(userId) {
    const token = randomBytes(32).toString('base64url');
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + this.sessionMs).toISOString();
    this.repository.createSession({ id: randomUUID(), userId, tokenHash: tokenHash(token),
      createdAt: createdAt.toISOString(), expiresAt });
    return { token, expiresAt };
  }
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}
