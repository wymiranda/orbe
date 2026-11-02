CREATE TABLE user_vocabulary_progress (
  user_id TEXT NOT NULL,
  vocabulary_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('learned', 'unlearned')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, vocabulary_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vocabulary_id) REFERENCES chinese_vocabulary_catalog(id) ON DELETE RESTRICT
);
CREATE INDEX idx_user_vocabulary_progress_user_updated ON user_vocabulary_progress(user_id, updated_at DESC);
