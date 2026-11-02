-- The English workspace owns this database. Identity and sessions remain in
-- the platform database (`DB`); rows here are associated by the stable user ID
-- only when personal server-side data is introduced.

CREATE TABLE english_workspace_settings (
  setting_key TEXT PRIMARY KEY NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE english_vocabulary_catalog (
  id TEXT PRIMARY KEY NOT NULL,
  term TEXT NOT NULL COLLATE NOCASE,
  pronunciation TEXT,
  portuguese TEXT NOT NULL,
  part_of_speech TEXT,
  cefr_level TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (term)
);
CREATE INDEX idx_english_vocabulary_level
  ON english_vocabulary_catalog(cefr_level, term COLLATE NOCASE);

CREATE TABLE english_decks (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  cefr_level TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (name)
);

CREATE TABLE english_deck_entries (
  deck_id TEXT NOT NULL,
  vocabulary_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (deck_id, vocabulary_id),
  UNIQUE (deck_id, position),
  FOREIGN KEY (deck_id) REFERENCES english_decks(id) ON DELETE CASCADE,
  FOREIGN KEY (vocabulary_id) REFERENCES english_vocabulary_catalog(id) ON DELETE RESTRICT
);
CREATE INDEX idx_english_deck_entries_vocabulary
  ON english_deck_entries(vocabulary_id);

CREATE TABLE english_readings (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  cover_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_english_readings_updated_at
  ON english_readings(updated_at DESC);

CREATE TABLE english_chapters (
  id TEXT PRIMARY KEY NOT NULL,
  reading_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (reading_id) REFERENCES english_readings(id) ON DELETE CASCADE,
  UNIQUE (reading_id, position)
);
CREATE INDEX idx_english_chapters_reading_position
  ON english_chapters(reading_id, position);

CREATE TABLE english_chapter_lines (
  id TEXT PRIMARY KEY NOT NULL,
  chapter_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  portuguese TEXT,
  FOREIGN KEY (chapter_id) REFERENCES english_chapters(id) ON DELETE CASCADE,
  UNIQUE (chapter_id, position)
);
CREATE INDEX idx_english_chapter_lines_chapter
  ON english_chapter_lines(chapter_id, position);

CREATE TABLE english_chapter_line_terms (
  id TEXT PRIMARY KEY NOT NULL,
  chapter_line_id TEXT NOT NULL,
  vocabulary_id TEXT NOT NULL,
  start_index INTEGER NOT NULL CHECK (start_index >= 0),
  length INTEGER NOT NULL CHECK (length > 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (chapter_line_id) REFERENCES english_chapter_lines(id) ON DELETE CASCADE,
  FOREIGN KEY (vocabulary_id) REFERENCES english_vocabulary_catalog(id) ON DELETE RESTRICT
);
CREATE INDEX idx_english_terms_line
  ON english_chapter_line_terms(chapter_line_id, start_index);
CREATE INDEX idx_english_terms_vocabulary
  ON english_chapter_line_terms(vocabulary_id);
