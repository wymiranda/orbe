-- Keep the sentence catalogue compatible with the new Brutal tier and retain
-- the curated Portuguese translation for sentence-based quizzes.
PRAGMA foreign_keys = OFF;

CREATE TABLE chinese_sentences_next (
  id TEXT PRIMARY KEY NOT NULL,
  hsk_level TEXT NOT NULL CHECK (hsk_level IN ('1', '2', '3', '4', '5', '6')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'brutal')),
  tokens_json TEXT NOT NULL,
  translation TEXT,
  form TEXT CHECK (form IN ('question', 'negative', 'time-place', 'expansion')),
  mission TEXT,
  opportunity TEXT CHECK (opportunity IN ('want', 'at', 'like')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO chinese_sentences_next (id, hsk_level, difficulty, tokens_json, translation, form, mission, opportunity, status, position, created_at, updated_at)
SELECT id, hsk_level, difficulty, tokens_json, NULL, form, mission, opportunity, status, position, created_at, updated_at
FROM chinese_sentences;

DROP TABLE chinese_sentences;
ALTER TABLE chinese_sentences_next RENAME TO chinese_sentences;
CREATE INDEX idx_chinese_sentences_status_level ON chinese_sentences(status, hsk_level, position);

PRAGMA foreign_keys = ON;
