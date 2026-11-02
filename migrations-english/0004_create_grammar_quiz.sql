-- B1 grammar quiz, phase 1: the patterns the first learner gets wrong most often
-- (questions with do/does/did, indirect questions, in/on/at, past tenses,
-- third-person -s, -ing after prepositions and false friends).
--
-- choices_json: the options as { id, text }; options are shuffled when a session
-- is built, so the right answer is not always the first one.
-- answer_json: the id of the right option, or the ids in order for an ordering question.
-- prompt: null for ordering questions (the learner builds the sentence).
CREATE TABLE english_quiz_topics (
  id TEXT PRIMARY KEY NOT NULL,
  cefr_level TEXT NOT NULL CHECK (cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  label TEXT NOT NULL,
  position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_english_quiz_topics_level ON english_quiz_topics(status, cefr_level, position);

CREATE TABLE english_quiz_questions (
  id TEXT PRIMARY KEY NOT NULL,
  topic_id TEXT NOT NULL REFERENCES english_quiz_topics(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('single_choice', 'fill_blank', 'ordering')),
  prompt TEXT,
  choices_json TEXT NOT NULL,
  answer_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_english_quiz_questions_topic ON english_quiz_questions(topic_id, status, position);

INSERT INTO english_quiz_topics (id, cefr_level, label, position, status, created_at, updated_at) VALUES
  ('questions-do-does-did', 'B1', 'Perguntas com do, does e did', 1, 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('indirect-questions', 'B1', 'Perguntas indiretas', 2, 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('prepositions-in-on-at', 'B1', 'Preposições: in, on e at', 3, 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('past-simple-present-perfect', 'B1', 'Passado simples e present perfect', 4, 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('third-person-s', 'B1', 'Terceira pessoa: -s no verbo', 5, 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('ing-after-prepositions', 'B1', '-ing depois de preposição', 6, 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('false-friends', 'B1', 'Falsos cognatos', 7, 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z');

INSERT INTO english_quiz_questions (id, topic_id, position, type, prompt, choices_json, answer_json, status, created_at, updated_at) VALUES
  ('questions-do-does-did-1', 'questions-do-does-did', 1, 'fill_blank', '___ you think it''s a good idea?', '[{"id":"a","text":"Do"},{"id":"b","text":"Are"},{"id":"c","text":"Is"},{"id":"d","text":"Does"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('questions-do-does-did-2', 'questions-do-does-did', 2, 'fill_blank', 'Why ___ I have so many green hanzi?', '[{"id":"a","text":"do"},{"id":"b","text":"am"},{"id":"c","text":"have"},{"id":"d","text":"does"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('questions-do-does-did-3', 'questions-do-does-did', 3, 'fill_blank', 'How ___ a hanzi turn green?', '[{"id":"a","text":"does"},{"id":"b","text":"is"},{"id":"c","text":"do"},{"id":"d","text":"has"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('questions-do-does-did-4', 'questions-do-does-did', 4, 'fill_blank', 'What ___ you mean yesterday?', '[{"id":"a","text":"did"},{"id":"b","text":"do"},{"id":"c","text":"were"},{"id":"d","text":"are"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('questions-do-does-did-5', 'questions-do-does-did', 5, 'fill_blank', 'Where ___ she work?', '[{"id":"a","text":"does"},{"id":"b","text":"do"},{"id":"c","text":"is"},{"id":"d","text":"did"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('questions-do-does-did-6', 'questions-do-does-did', 6, 'fill_blank', '___ the app save my progress?', '[{"id":"a","text":"Does"},{"id":"b","text":"Do"},{"id":"c","text":"Is"},{"id":"d","text":"Are"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('questions-do-does-did-7', 'questions-do-does-did', 7, 'single_choice', 'Which question is correct?', '[{"id":"a","text":"Where do you think I should start?"},{"id":"b","text":"Where you think I should start?"},{"id":"c","text":"Where do you think should I start?"},{"id":"d","text":"Where think you I should start?"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('questions-do-does-did-8', 'questions-do-does-did', 8, 'ordering', NULL, '[{"id":"t0","text":"What"},{"id":"t1","text":"did"},{"id":"t2","text":"you"},{"id":"t3","text":"say"},{"id":"t4","text":"?"}]', '["t0","t1","t2","t3","t4"]', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('indirect-questions-1', 'indirect-questions', 1, 'fill_blank', 'Tell me what level ___.', '[{"id":"a","text":"you think I''m at"},{"id":"b","text":"do you think I''m at"},{"id":"c","text":"you think am I at"},{"id":"d","text":"do you think am I"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('indirect-questions-2', 'indirect-questions', 2, 'fill_blank', 'Can you explain what the green hanzi ___?', '[{"id":"a","text":"mean"},{"id":"b","text":"means"},{"id":"c","text":"do mean"},{"id":"d","text":"does mean"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('indirect-questions-3', 'indirect-questions', 3, 'fill_blank', 'I don''t know where ___.', '[{"id":"a","text":"she lives"},{"id":"b","text":"does she live"},{"id":"c","text":"she does live"},{"id":"d","text":"lives she"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('indirect-questions-4', 'indirect-questions', 4, 'fill_blank', 'Do you know what time ___?', '[{"id":"a","text":"it is"},{"id":"b","text":"is it"},{"id":"c","text":"does it"},{"id":"d","text":"it does"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('indirect-questions-5', 'indirect-questions', 5, 'fill_blank', 'I''m not sure why ___ that.', '[{"id":"a","text":"he said"},{"id":"b","text":"did he say"},{"id":"c","text":"he did say"},{"id":"d","text":"said he"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('indirect-questions-6', 'indirect-questions', 6, 'fill_blank', 'I wonder if ___ ready.', '[{"id":"a","text":"the app is"},{"id":"b","text":"is the app"},{"id":"c","text":"does the app"},{"id":"d","text":"the app does"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('indirect-questions-7', 'indirect-questions', 7, 'single_choice', 'Which sentence is correct?', '[{"id":"a","text":"Could you tell me where the station is?"},{"id":"b","text":"Could you tell me where is the station?"},{"id":"c","text":"Could you tell me where does the station is?"},{"id":"d","text":"Could you tell me where the station does is?"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('indirect-questions-8', 'indirect-questions', 8, 'ordering', NULL, '[{"id":"t0","text":"Tell"},{"id":"t1","text":"me"},{"id":"t2","text":"what"},{"id":"t3","text":"you"},{"id":"t4","text":"need"},{"id":"t5","text":"."}]', '["t0","t1","t2","t3","t4","t5"]', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('prepositions-in-on-at-1', 'prepositions-in-on-at', 1, 'fill_blank', 'Everything ___ the app stays in Portuguese.', '[{"id":"a","text":"in"},{"id":"b","text":"on"},{"id":"c","text":"at"},{"id":"d","text":"of"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('prepositions-in-on-at-2', 'prepositions-in-on-at', 2, 'fill_blank', 'Click the button ___ the screen.', '[{"id":"a","text":"on"},{"id":"b","text":"in"},{"id":"c","text":"at"},{"id":"d","text":"of"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('prepositions-in-on-at-3', 'prepositions-in-on-at', 3, 'fill_blank', 'The animation plays ___ the end of the session.', '[{"id":"a","text":"at"},{"id":"b","text":"in"},{"id":"c","text":"on"},{"id":"d","text":"of"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('prepositions-in-on-at-4', 'prepositions-in-on-at', 4, 'fill_blank', 'I study English ___ the morning.', '[{"id":"a","text":"in"},{"id":"b","text":"on"},{"id":"c","text":"at"},{"id":"d","text":"of"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('prepositions-in-on-at-5', 'prepositions-in-on-at', 5, 'fill_blank', 'My class is ___ Monday.', '[{"id":"a","text":"on"},{"id":"b","text":"in"},{"id":"c","text":"at"},{"id":"d","text":"of"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('prepositions-in-on-at-6', 'prepositions-in-on-at', 6, 'fill_blank', 'I''ll start ___ B1.', '[{"id":"a","text":"at"},{"id":"b","text":"in"},{"id":"c","text":"on"},{"id":"d","text":"of"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('prepositions-in-on-at-7', 'prepositions-in-on-at', 7, 'fill_blank', 'The meeting is ___ 3 p.m.', '[{"id":"a","text":"at"},{"id":"b","text":"in"},{"id":"c","text":"on"},{"id":"d","text":"of"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('prepositions-in-on-at-8', 'prepositions-in-on-at', 8, 'fill_blank', 'I was born ___ 1995.', '[{"id":"a","text":"in"},{"id":"b","text":"on"},{"id":"c","text":"at"},{"id":"d","text":"of"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('past-simple-present-perfect-1', 'past-simple-present-perfect', 1, 'fill_blank', 'I ___ know it was hard-coded.', '[{"id":"a","text":"didn''t"},{"id":"b","text":"don''t"},{"id":"c","text":"haven''t"},{"id":"d","text":"wasn''t"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('past-simple-present-perfect-2', 'past-simple-present-perfect', 2, 'fill_blank', 'She ___ to China last year.', '[{"id":"a","text":"went"},{"id":"b","text":"has gone"},{"id":"c","text":"goes"},{"id":"d","text":"has been going"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('past-simple-present-perfect-3', 'past-simple-present-perfect', 3, 'fill_blank', 'We ___ quite a few conversations already.', '[{"id":"a","text":"have had"},{"id":"b","text":"had had"},{"id":"c","text":"has had"},{"id":"d","text":"are having"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('past-simple-present-perfect-4', 'past-simple-present-perfect', 4, 'fill_blank', 'Yesterday I ___ a new feature.', '[{"id":"a","text":"built"},{"id":"b","text":"have built"},{"id":"c","text":"build"},{"id":"d","text":"was build"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('past-simple-present-perfect-5', 'past-simple-present-perfect', 5, 'fill_blank', 'I''ve just ___ of something.', '[{"id":"a","text":"thought"},{"id":"b","text":"think"},{"id":"c","text":"thinked"},{"id":"d","text":"thinking"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('past-simple-present-perfect-6', 'past-simple-present-perfect', 6, 'fill_blank', '___ you start learning Chinese last year?', '[{"id":"a","text":"Did"},{"id":"b","text":"Have"},{"id":"c","text":"Do"},{"id":"d","text":"Are"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('past-simple-present-perfect-7', 'past-simple-present-perfect', 7, 'fill_blank', 'I''ve ___ thinking about the session.', '[{"id":"a","text":"been"},{"id":"b","text":"be"},{"id":"c","text":"being"},{"id":"d","text":"was"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('past-simple-present-perfect-8', 'past-simple-present-perfect', 8, 'single_choice', 'Which sentence is correct?', '[{"id":"a","text":"Have you ever eaten sushi?"},{"id":"b","text":"Did you ever ate sushi?"},{"id":"c","text":"Have you ever ate sushi?"},{"id":"d","text":"Do you ever eaten sushi?"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('third-person-s-1', 'third-person-s', 1, 'fill_blank', 'It ___ to be on every screen.', '[{"id":"a","text":"needs"},{"id":"b","text":"need"},{"id":"c","text":"needing"},{"id":"d","text":"are need"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('third-person-s-2', 'third-person-s', 2, 'fill_blank', 'The app ___ my progress.', '[{"id":"a","text":"saves"},{"id":"b","text":"save"},{"id":"c","text":"saving"},{"id":"d","text":"are save"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('third-person-s-3', 'third-person-s', 3, 'fill_blank', 'When the person ___ the flashcards, the cards fly to the wall.', '[{"id":"a","text":"finishes"},{"id":"b","text":"finish"},{"id":"c","text":"finishing"},{"id":"d","text":"to finish"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('third-person-s-4', 'third-person-s', 4, 'fill_blank', 'My teacher ___ English and Chinese.', '[{"id":"a","text":"speaks"},{"id":"b","text":"speak"},{"id":"c","text":"speaking"},{"id":"d","text":"to speak"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('third-person-s-5', 'third-person-s', 5, 'fill_blank', 'She ___ like coffee.', '[{"id":"a","text":"doesn''t"},{"id":"b","text":"don''t"},{"id":"c","text":"isn''t"},{"id":"d","text":"not"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('third-person-s-6', 'third-person-s', 6, 'fill_blank', 'Every student ___ a different level.', '[{"id":"a","text":"has"},{"id":"b","text":"have"},{"id":"c","text":"having"},{"id":"d","text":"are"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('third-person-s-7', 'third-person-s', 7, 'fill_blank', 'The game ___ the sentence in Chinese.', '[{"id":"a","text":"shows"},{"id":"b","text":"show"},{"id":"c","text":"showing"},{"id":"d","text":"are show"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('third-person-s-8', 'third-person-s', 8, 'fill_blank', 'He ___ to work by bus.', '[{"id":"a","text":"goes"},{"id":"b","text":"go"},{"id":"c","text":"going"},{"id":"d","text":"gos"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('ing-after-prepositions-1', 'ing-after-prepositions', 1, 'fill_blank', 'I was thinking about ___ at the beginning.', '[{"id":"a","text":"starting"},{"id":"b","text":"started"},{"id":"c","text":"start"},{"id":"d","text":"to start"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('ing-after-prepositions-2', 'ing-after-prepositions', 2, 'fill_blank', 'I don''t see any problem with ___ it in Portuguese.', '[{"id":"a","text":"writing"},{"id":"b","text":"write"},{"id":"c","text":"wrote"},{"id":"d","text":"to write"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('ing-after-prepositions-3', 'ing-after-prepositions', 3, 'fill_blank', 'Thanks for ___ me.', '[{"id":"a","text":"helping"},{"id":"b","text":"help"},{"id":"c","text":"helped"},{"id":"d","text":"to help"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('ing-after-prepositions-4', 'ing-after-prepositions', 4, 'fill_blank', 'She is good at ___ ideas.', '[{"id":"a","text":"explaining"},{"id":"b","text":"explain"},{"id":"c","text":"explained"},{"id":"d","text":"to explain"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('ing-after-prepositions-5', 'ing-after-prepositions', 5, 'fill_blank', 'Before ___ the app, run the tests.', '[{"id":"a","text":"deploying"},{"id":"b","text":"deploy"},{"id":"c","text":"deployed"},{"id":"d","text":"to deploy"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('ing-after-prepositions-6', 'ing-after-prepositions', 6, 'fill_blank', 'I''m interested in ___ Chinese.', '[{"id":"a","text":"learning"},{"id":"b","text":"learn"},{"id":"c","text":"learned"},{"id":"d","text":"to learn"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('ing-after-prepositions-7', 'ing-after-prepositions', 7, 'fill_blank', 'He left without ___ goodbye.', '[{"id":"a","text":"saying"},{"id":"b","text":"say"},{"id":"c","text":"said"},{"id":"d","text":"to say"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('ing-after-prepositions-8', 'ing-after-prepositions', 8, 'fill_blank', 'How about ___ a quiz first?', '[{"id":"a","text":"doing"},{"id":"b","text":"do"},{"id":"c","text":"did"},{"id":"d","text":"to do"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('false-friends-1', 'false-friends', 1, 'fill_blank', 'The app is ___ in Portuguese, with some Chinese.', '[{"id":"a","text":"mostly"},{"id":"b","text":"almost"},{"id":"c","text":"actually"},{"id":"d","text":"eventually"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('false-friends-2', 'false-friends', 2, 'fill_blank', 'Every ___ ends with an animation.', '[{"id":"a","text":"session"},{"id":"b","text":"section"},{"id":"c","text":"season"},{"id":"d","text":"sector"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('false-friends-3', 'false-friends', 3, 'fill_blank', 'If you ___ a mistake, tell me.', '[{"id":"a","text":"notice"},{"id":"b","text":"note"},{"id":"c","text":"advertise"},{"id":"d","text":"attend"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('false-friends-4', 'false-friends', 4, 'fill_blank', 'I thought it was easy, but ___ it''s hard.', '[{"id":"a","text":"actually"},{"id":"b","text":"currently"},{"id":"c","text":"eventually"},{"id":"d","text":"recently"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('false-friends-5', 'false-friends', 5, 'fill_blank', 'I''m ___ working on the English workspace.', '[{"id":"a","text":"currently"},{"id":"b","text":"actually"},{"id":"c","text":"eventually"},{"id":"d","text":"lastly"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('false-friends-6', 'false-friends', 6, 'fill_blank', 'Please ___ the class tomorrow.', '[{"id":"a","text":"attend"},{"id":"b","text":"assist"},{"id":"c","text":"assume"},{"id":"d","text":"attain"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('false-friends-7', 'false-friends', 7, 'fill_blank', 'I have many ___ in São Paulo: aunts, uncles and cousins.', '[{"id":"a","text":"relatives"},{"id":"b","text":"parents"},{"id":"c","text":"parentals"},{"id":"d","text":"familiars"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('false-friends-8', 'false-friends', 8, 'fill_blank', 'She is very ___; she cries at sad movies.', '[{"id":"a","text":"sensitive"},{"id":"b","text":"sensible"},{"id":"c","text":"sensual"},{"id":"d","text":"sensory"}]', '"a"', 'active', '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z');
