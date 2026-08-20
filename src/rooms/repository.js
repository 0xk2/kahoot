export class RoomRepository {
  constructor(database) { this.database = database; }

  create(room, questionIds) {
    this.database.exec('BEGIN');
    try {
      this.database.prepare(`INSERT INTO game_sessions (id, quiz_id, host_id, join_code, status,
        current_question_index, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(room.id, room.quizId, room.hostId, room.joinCode, room.status, room.currentQuestionIndex, room.createdAt);
      this.database.prepare(`INSERT INTO game_session_runtime
        (session_id, revision, progression_mode, scoring_mode) VALUES (?, ?, ?, ?)`)
        .run(room.id, room.revision, room.progressionMode, room.scoringMode);
      const insert = this.database.prepare(`INSERT INTO session_questions (session_id, question_id, position)
        VALUES (?, ?, ?)`);
      questionIds.forEach((id, position) => insert.run(room.id, id, position));
      this.database.exec('COMMIT');
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
    return this.getByPin(room.joinCode);
  }

  getByPin(pin) {
    const row = this.database.prepare(`SELECT game_sessions.id, quiz_id quizId, host_id hostId, join_code joinCode,
      status, revision, progression_mode progressionMode, scoring_mode scoringMode,
      current_question_index currentQuestionIndex, created_at createdAt, started_at startedAt,
      ended_at endedAt FROM game_sessions JOIN game_session_runtime ON session_id = game_sessions.id
      WHERE join_code = ? COLLATE NOCASE`).get(pin);
    return row ? { ...row, participants: this.participants(row.id) } : null;
  }

  getById(id) {
    const pin = this.database.prepare('SELECT join_code joinCode FROM game_sessions WHERE id = ?').get(id);
    return pin ? this.getByPin(pin.joinCode) : null;
  }

  list(hostId) {
    return this.database.prepare('SELECT join_code joinCode FROM game_sessions WHERE host_id = ? ORDER BY created_at DESC')
      .all(hostId).map(({ joinCode }) => this.getByPin(joinCode));
  }

  participants(sessionId) {
    return this.database.prepare(`SELECT id, session_id sessionId, nickname, status, score,
      joined_at joinedAt FROM participants WHERE session_id = ? ORDER BY joined_at, id`).all(sessionId);
  }

  findParticipant(id) {
    return this.database.prepare(`SELECT id, session_id sessionId, nickname, status, score,
      joined_at joinedAt FROM participants WHERE id = ?`).get(id) ?? null;
  }

  findReconnect(sessionId, tokenHash) {
    return this.database.prepare(`SELECT id, session_id sessionId, nickname, status, score,
      joined_at joinedAt FROM participants WHERE session_id = ? AND reconnect_token_hash = ?`)
      .get(sessionId, tokenHash) ?? null;
  }

  authorizeParticipant(id, tokenHash) {
    return this.database.prepare(`SELECT id FROM participants WHERE id = ? AND reconnect_token_hash = ?
      AND status != 'removed'`).get(id, tokenHash) ?? null;
  }

  addParticipant(player, tokenHash) {
    this.database.prepare(`INSERT INTO participants
      (id, session_id, nickname, reconnect_token_hash, status, score, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(player.id, player.sessionId, player.nickname, tokenHash, player.status, player.score, player.joinedAt);
    return this.findParticipant(player.id);
  }

  reconnect(id) { this.database.prepare("UPDATE participants SET status = 'connected' WHERE id = ?").run(id); }
  remove(id) { this.database.prepare("UPDATE participants SET status = 'removed' WHERE id = ?").run(id); }

  transition(room, next) {
    if (this.database.prepare('UPDATE game_session_runtime SET revision = revision + 1 WHERE session_id = ? AND revision = ?')
      .run(room.id, room.revision).changes !== 1) return false;
    this.database.prepare(`UPDATE game_sessions SET status = ?, current_question_index = ?, started_at = ?, ended_at = ?
      WHERE id = ?`).run(next.status, next.currentQuestionIndex, next.startedAt, next.endedAt, room.id);
    return true;
  }

  advance(room, nextIndex, openedAt) {
    this.database.exec('BEGIN');
    try {
      const result = this.database.prepare(`UPDATE game_session_runtime SET revision = revision + 1
        WHERE session_id = ? AND revision = ?`).run(room.id, room.revision);
      if (result.changes !== 1) throw new Error('STALE');
      this.database.prepare('UPDATE game_sessions SET current_question_index = ? WHERE id = ?').run(nextIndex, room.id);
      this.database.prepare(`UPDATE session_questions SET opened_at = ? WHERE session_id = ? AND position = ?`)
        .run(openedAt, room.id, nextIndex);
      this.database.exec('COMMIT');
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }

  incrementRevision(room) {
    return this.database.prepare('UPDATE game_session_runtime SET revision = revision + 1 WHERE session_id = ? AND revision = ?')
      .run(room.id, room.revision).changes === 1;
  }
}
