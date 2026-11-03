-- HSK level a learner jumped to on their own (raising level or difficulty without
-- the app's suggestion): the words up to it are taken as known until the games show
-- otherwise. NULL: the learner progresses step by step.
ALTER TABLE users ADD COLUMN placement_level TEXT;
