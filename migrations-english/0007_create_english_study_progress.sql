-- English flashcard progress on the shared flashcard engine, synced from the
-- learner's devices (same protocol as /api/study/progress for Chinese).
-- user_id is the stable user ID from the platform database (`DB`).
--
-- card_id is a catalogue word id or an Anki deck card id ("<deck id>:<position>").
-- Ids are not checked against the catalogue or the decks: a deck deleted later
-- must not block a device's sync, and unknown ids are simply never shown.
-- A removed card is kept as a tombstone (deleted_at) so other devices drop it too;
-- updated_at is the device timestamp of the last change (last write wins).

CREATE TABLE english_study_cards (
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  due_at TEXT NOT NULL,
  interval_days INTEGER NOT NULL,
  ease REAL NOT NULL,
  is_new INTEGER NOT NULL,
  is_learned INTEGER NOT NULL,
  deleted_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, card_id)
);

-- Words marked as learned (or unmarked) by the learner.
CREATE TABLE english_vocabulary_progress (
  user_id TEXT NOT NULL,
  vocabulary_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('learned', 'unlearned')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, vocabulary_id)
);
