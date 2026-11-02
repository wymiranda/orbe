-- Personal preferences of the English workspace, associated by the stable user
-- ID from the platform database (`DB`). The level is chosen freely by the
-- learner; there is no placement test.

CREATE TABLE english_user_preferences (
  user_id TEXT PRIMARY KEY NOT NULL,
  cefr_level TEXT NOT NULL CHECK (cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  updated_at TEXT NOT NULL
);
