PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('host', 'admin')),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('single_choice', 'multiple_choice')),
  prompt TEXT NOT NULL,
  explanation TEXT,
  time_limit_seconds INTEGER NOT NULL CHECK (time_limit_seconds BETWEEN 5 AND 300),
  points INTEGER NOT NULL DEFAULT 1000 CHECK (points >= 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (quiz_id, position)
);

CREATE TABLE IF NOT EXISTS answer_options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  position INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (question_id, position),
  UNIQUE (question_id, id)
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE RESTRICT,
  host_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  join_code TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(join_code) = 6),
  status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'active', 'completed', 'cancelled')),
  current_question_index INTEGER CHECK (current_question_index >= 0),
  created_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  reconnect_token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'removed')),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  joined_at TEXT NOT NULL,
  UNIQUE (session_id, nickname),
  UNIQUE (session_id, id)
);

CREATE TABLE IF NOT EXISTS session_questions (
  session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES quiz_questions(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position >= 0),
  opened_at TEXT,
  closed_at TEXT,
  PRIMARY KEY (session_id, question_id),
  UNIQUE (session_id, position)
);

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  response_time_ms INTEGER NOT NULL CHECK (response_time_ms >= 0),
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  points_awarded INTEGER NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  submitted_at TEXT NOT NULL,
  FOREIGN KEY (session_id, question_id) REFERENCES session_questions(session_id, question_id) ON DELETE CASCADE,
  FOREIGN KEY (session_id, participant_id) REFERENCES participants(session_id, id) ON DELETE CASCADE,
  UNIQUE (session_id, question_id, participant_id),
  UNIQUE (id, question_id)
);

CREATE TABLE IF NOT EXISTS answer_selections (
  answer_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  FOREIGN KEY (answer_id, question_id) REFERENCES answers(id, question_id) ON DELETE CASCADE,
  FOREIGN KEY (question_id, option_id) REFERENCES answer_options(question_id, id) ON DELETE RESTRICT,
  PRIMARY KEY (answer_id, option_id)
);

CREATE INDEX IF NOT EXISTS idx_quizzes_owner ON quizzes(owner_id);
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON quiz_questions(quiz_id, position);
CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_answers_participant ON answers(participant_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);

CREATE TRIGGER IF NOT EXISTS limit_session_participants
BEFORE INSERT ON participants
WHEN (SELECT count(*) FROM participants WHERE session_id = NEW.session_id AND status != 'removed') >= 50
BEGIN
  SELECT RAISE(ABORT, 'room is full (50 players)');
END;
