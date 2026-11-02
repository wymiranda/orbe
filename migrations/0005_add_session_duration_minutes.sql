ALTER TABLE users ADD COLUMN session_duration_minutes INTEGER CHECK (session_duration_minutes IN (5, 10, 15, 20, 30));
