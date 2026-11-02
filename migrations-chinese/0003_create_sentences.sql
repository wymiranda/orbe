-- The sentence catalogue moves from code into the Chinese workspace database, so
-- it can be organised and managed from the app. The rows below are the sentences
-- (and the missions of the cooperative sentence game) that lived in
-- worker/modules/chinese/sentence-corpus.ts and worker/modules/multiplayer/sentence-rounds.ts.
--
-- tokens_json: catalogue words in order, including the final punctuation.
-- mission: the sentence game's prompt; a sentence without one is not a game round.
-- opportunity: bonus card rule of the sentence game ('want' 想, 'at' 在, 'like' 喜欢).
CREATE TABLE chinese_sentences (
  id TEXT PRIMARY KEY NOT NULL,
  hsk_level TEXT NOT NULL CHECK (hsk_level IN ('1', '2', '3', '4', '5', '6')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  tokens_json TEXT NOT NULL,
  form TEXT CHECK (form IN ('question', 'negative', 'time-place', 'expansion')),
  mission TEXT,
  opportunity TEXT CHECK (opportunity IN ('want', 'at', 'like')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_chinese_sentences_status_level ON chinese_sentences(status, hsk_level, position);

INSERT INTO chinese_sentences (id, hsk_level, difficulty, tokens_json, form, mission, opportunity, status, position, created_at, updated_at) VALUES
  ('hsk1-i-eat-apple', '1', 'easy', '["我","吃","苹果","。"]', NULL, 'Construa a frase “eu como maçã”.', NULL, 'active', 1, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-i-drink-tea', '1', 'easy', '["我","喝","茶","。"]', NULL, 'Construa a frase “eu bebo chá”.', NULL, 'active', 2, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-i-want-drink-tea', '1', 'easy', '["我","想","喝","茶","。"]', NULL, 'Construa a frase “eu quero beber chá”.', NULL, 'active', 3, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-i-not-drink-tea', '1', 'easy', '["我","不","喝","茶","。"]', 'negative', 'Construa a frase “eu não bebo chá”.', NULL, 'active', 4, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-want-water', '1', 'easy', '["我","想","喝","水","。"]', NULL, 'Construam uma frase sobre beber água.', 'want', 'active', 5, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-want-tea-question', '1', 'easy', '["你","想","喝","茶","吗","？"]', 'question', 'Construam uma pergunta sobre beber chá.', 'want', 'active', 6, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-at-school', '1', 'easy', '["他","在","学校","。"]', NULL, 'Construam uma frase dizendo que ele está na escola.', 'at', 'active', 7, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-very-good', '1', 'easy', '["她","很","好","。"]', NULL, 'Construam uma frase dizendo que ela está bem.', NULL, 'active', 8, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-not-read', '1', 'medium', '["我","不","看","书","。"]', 'negative', 'Construam uma frase dizendo que eu não leio livros.', NULL, 'active', 9, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-go-china', '1', 'medium', '["我们","去","中国","。"]', NULL, 'Construam uma frase dizendo que nós vamos à China.', NULL, 'active', 10, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-today-school', '1', 'medium', '["今天","我","去","学校","。"]', 'time-place', 'Construam uma frase dizendo que hoje eu vou à escola.', NULL, 'active', 11, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-like-rice', '1', 'medium', '["你","喜欢","吃","米饭","吗","？"]', 'question', 'Construam uma pergunta sobre gostar de comer arroz.', 'like', 'active', 12, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-mother-home', '1', 'hard', '["妈妈","在","家","。"]', NULL, 'Construam uma frase dizendo que mamãe está em casa.', 'at', 'active', 13, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-want-film', '1', 'hard', '["我","想","看","电影","。"]', NULL, 'Construam uma frase sobre querer assistir a um filme.', 'want', 'active', 14, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-like-tea', '1', 'easy', '["我","喜欢","茶","。"]', NULL, 'Construam uma frase dizendo que eu gosto de chá.', 'like', 'active', 15, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-drink-water-question', '1', 'easy', '["你","喝","水","吗","？"]', 'question', 'Construam uma pergunta perguntando se você bebe água.', NULL, 'active', 16, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-he-read-book', '1', 'easy', '["他","看","书","。"]', NULL, 'Construam uma frase dizendo que ele lê um livro.', NULL, 'active', 17, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-she-home', '1', 'easy', '["她","在","家","。"]', NULL, 'Construam uma frase dizendo que ela está em casa.', 'at', 'active', 18, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-we-school', '1', 'easy', '["我们","在","学校","。"]', NULL, 'Construam uma frase dizendo que nós estamos na escola.', 'at', 'active', 19, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-mother-drinks-tea', '1', 'easy', '["妈妈","喝","茶","。"]', NULL, 'Construam uma frase dizendo que mamãe bebe chá.', NULL, 'active', 20, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-today-read-book', '1', 'easy', '["今天","我","看","书","。"]', 'time-place', 'Construam uma frase dizendo que hoje eu leio um livro.', NULL, 'active', 21, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-she-wants-water', '1', 'easy', '["她","想","喝","水","。"]', NULL, 'Construam uma frase dizendo que ela quer beber água.', 'want', 'active', 22, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-like-china', '1', 'medium', '["我","喜欢","中国","。"]', NULL, 'Construam uma frase dizendo que eu gosto da China.', 'like', 'active', 23, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-go-school-question', '1', 'medium', '["你","去","学校","吗","？"]', 'question', 'Construam uma pergunta perguntando se você vai à escola.', NULL, 'active', 24, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-he-not-tea', '1', 'medium', '["他","不","喝","茶","。"]', 'negative', 'Construam uma frase dizendo que ele não bebe chá.', NULL, 'active', 25, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-we-want-film', '1', 'medium', '["我们","想","看","电影","。"]', NULL, 'Construam uma frase dizendo que nós queremos assistir a filmes.', 'want', 'active', 26, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-today-mother-home', '1', 'medium', '["今天","妈妈","在","家","。"]', 'time-place', 'Construam uma frase dizendo que hoje mamãe está em casa.', 'at', 'active', 27, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-you-like-book-question', '1', 'medium', '["你","喜欢","书","吗","？"]', 'question', 'Construam uma pergunta perguntando se você gosta de livros.', 'like', 'active', 28, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-she-go-china', '1', 'medium', '["她","去","中国","。"]', NULL, 'Construam uma frase dizendo que ela vai à China.', NULL, 'active', 29, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-he-wants-tea', '1', 'medium', '["他","想","喝","茶","。"]', NULL, 'Construam uma frase dizendo que ele quer beber chá.', 'want', 'active', 30, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-mother-reads-book', '1', 'hard', '["妈妈","看","书","。"]', NULL, 'Construam uma frase dizendo que mamãe lê um livro.', NULL, 'active', 31, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-today-we-school', '1', 'hard', '["今天","我们","去","学校","。"]', 'time-place', 'Construam uma frase dizendo que hoje nós vamos à escola.', NULL, 'active', 32, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-you-want-china-question', '1', 'hard', '["你","想","去","中国","吗","？"]', 'question', 'Construam uma pergunta perguntando se você quer ir à China.', 'want', 'active', 33, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk1-she-likes-film', '1', 'hard', '["她","喜欢","看","电影","。"]', NULL, 'Construam uma frase dizendo que ela gosta de assistir a filmes.', 'like', 'active', 34, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk2-coffee', '2', 'easy', '["我","想","喝","咖啡","。"]', NULL, 'Construam uma frase sobre querer beber café.', 'want', 'active', 35, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk2-together-shop', '2', 'easy', '["我们","一起","去","商场","。"]', NULL, 'Construam uma frase dizendo que vocês vão juntos ao shopping.', NULL, 'active', 36, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk2-already-home', '2', 'easy', '["他","已经","回家","了","。"]', NULL, 'Construam uma frase dizendo que ele já voltou para casa.', NULL, 'active', 37, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk2-study-chinese', '2', 'medium', '["她","在","学校","学习","中文","。"]', 'time-place', 'Construam uma frase dizendo que ela estuda chinês na escola.', 'at', 'active', 38, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk2-not-coffee', '2', 'medium', '["我","不","喝","咖啡","。"]', 'negative', 'Construam uma frase dizendo que eu não bebo café.', NULL, 'active', 39, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk2-go-by-subway-question', '2', 'medium', '["你","坐","地铁","去","学校","吗","？"]', 'question', 'Construam uma pergunta sobre ir à escola de metrô.', NULL, 'active', 40, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk2-like-sport', '2', 'medium', '["我们","喜欢","运动","。"]', NULL, 'Construam uma frase dizendo que vocês gostam de praticar esporte.', 'like', 'active', 41, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk2-weather', '2', 'hard', '["今天","天气","很好","。"]', 'time-place', 'Construam uma frase dizendo que o tempo está muito bom hoje.', NULL, 'active', 42, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk2-read-newspaper', '2', 'hard', '["爸爸","在","看","报纸","。"]', NULL, 'Construam uma frase dizendo que papai está lendo jornal.', 'at', 'active', 43, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z'),
  ('hsk2-travel', '2', 'hard', '["明天","我们","去","旅游","。"]', 'time-place', 'Construam uma frase dizendo que vocês vão viajar amanhã.', NULL, 'active', 44, '2026-10-30T00:00:00.000Z', '2026-10-30T00:00:00.000Z');
