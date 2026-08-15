export class AuthRepository {
  constructor(database) {
    this.database = database;
  }

  createUser(user) {
    this.database.prepare(`INSERT INTO users
      (id, username, password_hash, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(user.id, user.username, user.passwordHash, user.displayName, user.createdAt, user.createdAt);
    this.database.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(user.id, 'host');
    return this.findUserById(user.id);
  }

  findCredentials(username) {
    return this.database.prepare(`SELECT id, username, password_hash passwordHash
      FROM users WHERE username = ? COLLATE NOCASE`).get(username);
  }

  findUserById(id) {
    const row = this.database.prepare(`SELECT id, username, display_name displayName, created_at createdAt
      FROM users WHERE id = ?`).get(id);
    if (!row) return null;
    const roles = this.database.prepare('SELECT role FROM user_roles WHERE user_id = ? ORDER BY role').all(id);
    return { ...row, roles: roles.map(({ role }) => role) };
  }

  createSession(session) {
    this.database.prepare(`INSERT INTO auth_sessions
      (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(session.id, session.userId, session.tokenHash, session.expiresAt, session.createdAt);
  }

  findSession(tokenHash, now) {
    return this.database.prepare(`SELECT id, user_id userId, expires_at expiresAt
      FROM auth_sessions WHERE token_hash = ? AND expires_at > ?`).get(tokenHash, now);
  }

  deleteSession(tokenHash) {
    this.database.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
  }
}
