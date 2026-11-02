-- Difficulty of the daily session, chosen on the home card, and the evidence
-- used to suggest moving up (Fácil → Médio → Difícil → next HSK level).
ALTER TABLE users ADD COLUMN study_difficulty TEXT NOT NULL DEFAULT 'easy' CHECK (study_difficulty IN ('easy', 'medium', 'hard', 'brutal'));
-- 0: locked; 1: unlocked, the learner has not been told yet; 2: unlocked and told.
ALTER TABLE users ADD COLUMN brutal_unlocked INTEGER NOT NULL DEFAULT 0;
-- Only sessions completed after this moment count towards a suggestion: it
-- moves whenever the learner changes level or difficulty, or declines one.
ALTER TABLE users ADD COLUMN study_suggestion_since TEXT;

ALTER TABLE user_study_session_logs ADD COLUMN difficulty TEXT;
ALTER TABLE user_study_session_logs ADD COLUMN hsk_level TEXT;
ALTER TABLE user_study_session_logs ADD COLUMN answers_total INTEGER;
ALTER TABLE user_study_session_logs ADD COLUMN answers_correct INTEGER;
