-- Sentences a learner saved from the games to study later as flashcards
-- (Flashcards → Estudar frases). The sentence itself stays in the catalogue.
CREATE TABLE user_saved_sentences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sentence_id TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (user_id, sentence_id)
);
