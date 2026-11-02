-- Difficulty of the English daily session, chosen on the home card next to the
-- CEFR level. Content is not split by difficulty yet: the choice is stored so
-- the session can use it once it is. Brutal is accepted by the schema (same
-- values as the Chinese session) but the API does not offer it yet.

ALTER TABLE english_user_preferences ADD COLUMN study_difficulty TEXT NOT NULL DEFAULT 'easy' CHECK (study_difficulty IN ('easy', 'medium', 'hard', 'brutal'));
