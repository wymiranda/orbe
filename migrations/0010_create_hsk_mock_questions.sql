-- Curated HSK mock bank. A definition mirrors the generic QuizQuestion shape
-- and may carry text, image and audio without constraining future content.
CREATE TABLE chinese_hsk_mock_questions (
  id TEXT PRIMARY KEY NOT NULL,
  hsk_level TEXT NOT NULL CHECK (hsk_level IN ('1', '2')),
  section TEXT NOT NULL CHECK (section IN ('listening', 'reading')),
  part INTEGER NOT NULL CHECK (part BETWEEN 1 AND 4),
  format TEXT NOT NULL CHECK (format IN (
    'listening_picture_true_false',
    'listening_picture_choice',
    'listening_dialogue_picture_choice',
    'listening_dialogue_choice',
    'reading_picture_true_false',
    'reading_picture_choice',
    'reading_match',
    'reading_fill_blank',
    'reading_statement_true_false'
  )),
  definition_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_chinese_hsk_mock_questions_lookup ON chinese_hsk_mock_questions(hsk_level, section, part, status, position);
