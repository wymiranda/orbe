CREATE TABLE user_study_session_logs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  planned_duration_minutes INTEGER NOT NULL CHECK (planned_duration_minutes IN (5, 10, 15, 20, 30)),
  activity_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX idx_user_study_session_logs_user_started_at ON user_study_session_logs(user_id, started_at DESC);
