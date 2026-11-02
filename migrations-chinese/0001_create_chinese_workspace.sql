-- The Chinese workspace owns this database. Authentication remains in `DB`.
-- User IDs are stable identifiers issued by the platform database, so this
-- schema intentionally has no cross-database foreign keys to `users`.

CREATE TABLE readings (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  cover_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_readings_updated_at ON readings(updated_at DESC);

CREATE TABLE tags (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_tags_name ON tags(name COLLATE NOCASE);

CREATE TABLE reading_tags (
  reading_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (reading_id, tag_id),
  FOREIGN KEY (reading_id) REFERENCES readings(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
CREATE INDEX idx_reading_tags_tag_id ON reading_tags(tag_id);

CREATE TABLE chapters (
  id TEXT PRIMARY KEY NOT NULL,
  reading_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  layout TEXT NOT NULL DEFAULT 'plain' CHECK (layout IN ('plain', 'layered')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (reading_id) REFERENCES readings(id) ON DELETE CASCADE,
  UNIQUE (reading_id, position)
);
CREATE INDEX idx_chapters_reading_position ON chapters(reading_id, position);

CREATE TABLE chapter_lines (
  id TEXT PRIMARY KEY NOT NULL,
  chapter_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  top_text TEXT,
  text TEXT NOT NULL,
  bottom_text TEXT,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  UNIQUE (chapter_id, position)
);
CREATE INDEX idx_chapter_lines_chapter ON chapter_lines(chapter_id, position);

CREATE TABLE chinese_vocabulary_catalog (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('character', 'word')),
  hanzi TEXT NOT NULL,
  pinyin TEXT NOT NULL,
  english TEXT NOT NULL,
  portuguese TEXT NOT NULL,
  hsk_level TEXT NOT NULL,
  UNIQUE (type, hanzi)
);
CREATE INDEX idx_chinese_vocabulary_level ON chinese_vocabulary_catalog(hsk_level, type);

CREATE TABLE chinese_chapter_line_terms (
  id TEXT PRIMARY KEY NOT NULL,
  chapter_line_id TEXT NOT NULL,
  vocabulary_id TEXT NOT NULL,
  start_index INTEGER NOT NULL,
  length INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (chapter_line_id) REFERENCES chapter_lines(id) ON DELETE CASCADE,
  FOREIGN KEY (vocabulary_id) REFERENCES chinese_vocabulary_catalog(id) ON DELETE RESTRICT
);
CREATE INDEX idx_chinese_terms_line ON chinese_chapter_line_terms(chapter_line_id, start_index);
CREATE INDEX idx_chinese_terms_vocabulary ON chinese_chapter_line_terms(vocabulary_id);

CREATE TABLE study_decks (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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
  PRIMARY KEY (user_id, id)
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
  PRIMARY KEY (user_id, hsk_level)
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
