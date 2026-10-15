CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE readings (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL
);

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
  FOREIGN KEY (vocabulary_id) REFERENCES chinese_vocabulary_catalog(id)
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
