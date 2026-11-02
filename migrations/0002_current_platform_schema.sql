-- Baseline for the post-reset platform. This contains only current product
-- data; historical repair steps do not belong in a fresh database.

ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN last_seen_at TEXT;
ALTER TABLE users ADD COLUMN last_module TEXT;
CREATE INDEX idx_users_last_seen ON users(last_seen_at);

ALTER TABLE readings ADD COLUMN cover_url TEXT;
CREATE INDEX idx_readings_updated_at ON readings(updated_at DESC);
CREATE INDEX idx_tags_name ON tags(name COLLATE NOCASE);
CREATE INDEX idx_chapters_reading_position ON chapters(reading_id, position);

CREATE TABLE chinese_quiz_questions (
  id TEXT PRIMARY KEY NOT NULL,
  hsk_level TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('recognition', 'hsk-mock')),
  question_type TEXT NOT NULL DEFAULT 'single_choice' CHECK (question_type IN ('single_choice', 'fill_blank')),
  prompt TEXT NOT NULL,
  choices_json TEXT NOT NULL,
  answer_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_chinese_quiz_questions_lookup ON chinese_quiz_questions(hsk_level, mode, created_at);

CREATE TABLE workspace_settings (
  setting_key TEXT PRIMARY KEY NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- A lossless import bridge for the backup created before the reset. Runtime
-- code converts these rows to user_study_snapshots on the user's first sync.
CREATE TABLE user_study_cards (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  vocabulary_id TEXT NOT NULL,
  source_line_id TEXT,
  deck_id TEXT,
  due_at TEXT NOT NULL,
  interval_days INTEGER NOT NULL,
  ease REAL NOT NULL,
  review_count INTEGER NOT NULL,
  lapse_count INTEGER NOT NULL,
  is_learned INTEGER NOT NULL DEFAULT 0 CHECK (is_learned IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_user_study_cards_due ON user_study_cards(user_id, due_at);

CREATE TABLE chinese_vocabulary_study_ids (
  numeric_id INTEGER PRIMARY KEY AUTOINCREMENT,
  vocabulary_id TEXT NOT NULL UNIQUE,
  FOREIGN KEY (vocabulary_id) REFERENCES chinese_vocabulary_catalog(id) ON DELETE RESTRICT
);
CREATE TRIGGER trg_chinese_vocabulary_study_ids_insert
AFTER INSERT ON chinese_vocabulary_catalog
BEGIN
  INSERT OR IGNORE INTO chinese_vocabulary_study_ids (vocabulary_id) VALUES (NEW.id);
END;

CREATE TABLE user_study_snapshots (
  user_id TEXT NOT NULL,
  hsk_level TEXT NOT NULL,
  payload BLOB NOT NULL,
  updated_at TEXT NOT NULL,
  last_studied_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, hsk_level),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_user_study_snapshots_last_studied ON user_study_snapshots(last_studied_at);

CREATE TABLE multiplayer_sentence_review_cache (
  sentence TEXT NOT NULL,
  context_hash BLOB NOT NULL,
  rubric_version INTEGER NOT NULL,
  result_flags INTEGER NOT NULL,
  payload BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (sentence, context_hash, rubric_version)
) WITHOUT ROWID;
CREATE INDEX idx_sentence_review_cache_approved_recent
  ON multiplayer_sentence_review_cache(created_at DESC)
  WHERE (result_flags & 7) = 7;
