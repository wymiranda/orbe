-- Brutal as a playable level is unlocked per HSK level, once the learner has
-- answered 10 different Brutal sentences of that level correctly (the surprise
-- rounds of "Ouça e monte").
CREATE TABLE user_brutal_correct_sentences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sentence_id TEXT NOT NULL,
  hsk_level TEXT NOT NULL,
  answered_at TEXT NOT NULL,
  PRIMARY KEY (user_id, sentence_id)
);
CREATE INDEX idx_user_brutal_correct_sentences_level ON user_brutal_correct_sentences(user_id, hsk_level);

CREATE TABLE user_brutal_unlocks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hsk_level TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  -- Set once the learner has been told about the unlock.
  notice_seen_at TEXT,
  PRIMARY KEY (user_id, hsk_level)
);

-- Learners who had unlocked Brutal under the previous rule (one unlock for every
-- level) keep it on the levels that exist today.
INSERT OR IGNORE INTO user_brutal_unlocks (user_id, hsk_level, unlocked_at, notice_seen_at)
SELECT users.id, levels.hsk_level, CURRENT_TIMESTAMP, CASE WHEN users.brutal_unlocked = 2 THEN CURRENT_TIMESTAMP END
FROM users CROSS JOIN (SELECT '1' AS hsk_level UNION ALL SELECT '2') AS levels
WHERE users.brutal_unlocked > 0;
