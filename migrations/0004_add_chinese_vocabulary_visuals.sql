ALTER TABLE chinese_vocabulary_catalog ADD COLUMN visual_kind TEXT CHECK (visual_kind IN ('emoji', 'svg', 'image'));
ALTER TABLE chinese_vocabulary_catalog ADD COLUMN visual_value TEXT;
