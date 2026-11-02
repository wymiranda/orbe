import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const root = new URL('../', import.meta.url)
const source = async (path) => readFile(new URL(path, root), 'utf8')

/** Transpiles a TypeScript module and its relative imports so tests can run its pure logic. */
async function importTs(path) {
  const outDir = await mkdtemp(join(tmpdir(), 'niorb-test-'))
  const emitted = new Set()
  async function emit(file) {
    if (emitted.has(file)) return
    emitted.add(file)
    let code = ts.transpileModule(await source(file), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const dependencies = []
    code = code.replace(/(from\s+|import\s*\()(['"])(\.{1,2}\/[^'"]+)\2/g, (_match, prefix, quote, specifier) => {
      const base = specifier.replace(/\.(js|ts|tsx)$/, '')
      dependencies.push(base)
      return `${prefix}${quote}${base}.js${quote}`
    })
    const target = join(outDir, file.replace(/\.tsx?$/, '.js'))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, code)
    for (const base of dependencies) {
      const resolved = posix.normalize(posix.join(posix.dirname(file), base))
      const candidate = await source(`${resolved}.ts`).then(() => `${resolved}.ts`, () => `${resolved}.tsx`)
      await emit(candidate)
    }
  }
  await emit(path)
  return import(pathToFileURL(join(outDir, path.replace(/\.tsx?$/, '.js'))).href)
}

test('shared study definitions stay separate from user card state', async () => {
  const schema = await source('migrations/0001_create_platform.sql')
  assert.match(schema, /CREATE TABLE study_decks/)
  const migration = await source('migrations/0002_current_platform_schema.sql')
  assert.match(migration, /CREATE TABLE user_study_cards/)
  assert.doesNotMatch(migration, /review_history|answer_history/)
})

test('unknown API routes cannot fall back to the SPA asset handler', async () => {
  const worker = await source('worker/index.ts')
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\).*status: 404/s)
})

test('transactional email is isolated behind a provider service and cannot be an open relay', async () => {
  const service = await source('worker/modules/email/service.ts')
  const handler = await source('worker/modules/email/handler.ts')
  const config = await source('.dev.vars.example')
  assert.match(service, /https:\/\/api\.brevo\.com\/v3\/smtp\/email/)
  assert.match(service, /BREVO_API_KEY/)
  assert.match(handler, /url\.pathname !== '\/api\/email\/test'/)
  assert.match(handler, /user\.role !== 'admin'/)
  assert.match(handler, /to: user\.email/)
  assert.match(config, /BREVO_API_KEY/)
})

test('Chinese device progress is explicitly local-only', async () => {
  const progress = await source('src/experiences/chinese/device-progress.ts')
  assert.match(progress, /localStorage/)
  assert.doesNotMatch(progress, /fetch\(/)
})

test('English workspace is selectable and owns its vocabulary catalog', async () => {
  const registry = await source('src/core/module-registry.ts')
  const workspace = await source('src/experiences/english/EnglishWorkspace.tsx')
  const handler = await source('worker/modules/english/handler.ts')
  const schema = await source('migrations-english/0001_create_english_workspace.sql')
  const worker = await source('worker/index.ts')
  assert.match(registry, /id: 'english'/)
  assert.match(registry, /component: EnglishWorkspace/)
  assert.match(registry, /enabledByDefault: true/)
  assert.match(workspace, /niorb:english:progress:v1/)
  assert.match(handler, /\/api\/english\/vocabulary/)
  assert.match(handler, /\/api\/english\/readings/)
  assert.match(handler, /env\.ENGLISH_DB/)
  assert.match(schema, /CREATE TABLE english_vocabulary_catalog/)
  assert.match(worker, /handleEnglishRequest/)
})

test('English level is chosen freely and stored in the English database, not the platform', async () => {
  const handler = await source('worker/modules/english/handler.ts')
  const schema = await source('migrations-english/0002_create_english_user_preferences.sql')
  // The levels live in cefr-levels.ts, shared by the onboarding, the home card and the flashcards.
  const onboarding = await source('src/experiences/english/cefr-levels.ts')
  const worker = await source('worker/index.ts')
  assert.match(schema, /CREATE TABLE english_user_preferences/)
  assert.match(schema, /'A1', 'A2', 'B1', 'B2', 'C1', 'C2'/)
  assert.match(handler, /\/api\/english\/preferences/)
  assert.match(handler, /env\.ENGLISH_DB\.prepare\('INSERT INTO english_user_preferences/)
  assert.match(worker, /handleEnglishRequest\(request, env, authenticatedUser\)/)
  for (const level of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) assert.match(onboarding, new RegExp(`level: '${level}'`))
})

test('English vocabulary import cleans repeated terms and accepts CSV files', async () => {
  const handler = await source('worker/modules/english/handler.ts')
  const workspace = await source('src/experiences/english/EnglishWorkspace.tsx')
  assert.match(handler, /function cleanVocabulary/)
  assert.match(handler, /ON CONFLICT\(term\) DO UPDATE/)
  assert.doesNotMatch(handler, /termos repetidos/)
  assert.match(workspace, /parseCatalogCsv/)
})

test('learning paths use a compact, module-independent knowledge contract', async () => {
  const types = await source('src/learning-paths/types.ts')
  const repository = await source('src/learning-paths/repository.ts')
  const engine = await source('src/learning-paths/engine.ts')
  const trail = await source('src/learning-paths/trails/zh-hans-hsk1-foundations.json')
  assert.match(types, /export type ActivityRequest/)
  assert.match(types, /export type ActivityResult/)
  assert.match(repository, /indexedDB/)
  assert.doesNotMatch(repository, /fetch\(/)
  assert.match(engine, /selectNextActivity/)
  assert.match(trail, /苹果/)
  assert.match(trail, /我吃苹果/)
})

test('existing practice modules can report learning evidence without owning the knowledge state', async () => {
  const study = await source('src/modules/study/StudyModule.tsx')
  const quiz = await source('src/modules/quiz/QuizModule.tsx')
  const writing = await source('src/modules/writing/WritingModule.tsx')
  assert.match(study, /recordModuleActivity/)
  assert.match(quiz, /onActivityResult/)
  assert.match(writing, /recordModuleActivity/)
})

test('flashcard vocabulary remains available locally after its first download', async () => {
  const progress = await source('src/experiences/chinese/device-progress.ts')
  const study = await source('src/modules/study/StudyModule.tsx')
  assert.match(progress, /loadOfflineVocabulary/)
  assert.match(progress, /saveOfflineVocabulary/)
  assert.match(study, /loadOfflineVocabulary\(\)/)
  assert.match(study, /saveOfflineVocabulary\(catalogue\)/)
})

test('offline mode caches only shared read-only content and the local access shell', async () => {
  const worker = await source('public/sw.js')
  const auth = await source('src/core/AuthGate.tsx')
  assert.match(worker, /\/api\/readings/)
  assert.match(worker, /\/api\/chinese\/vocabulary/)
  assert.doesNotMatch(worker, /\/api\/auth\/me/)
  assert.match(auth, /loadCachedUser\(\)/)
})

test('Google OAuth uses an origin-derived callback and verifies the OAuth state', async () => {
  const auth = await source('worker/auth.ts')
  assert.match(auth, /new URL\('\/api\/auth\/google\/callback', url\.origin\)/)
  assert.match(auth, /state !== expectedState/)
  assert.match(auth, /email_verified/)
})

test('authentication is exclusively handled by Google OAuth', async () => {
  const auth = await source('worker/auth.ts')
  const gate = await source('src/core/AuthGate.tsx')
  assert.doesNotMatch(auth, /auth\/pin|BETA_ACCESS_PIN/)
  assert.doesNotMatch(gate, /PIN/)
})

/** The sentence catalogue as seeded by the Chinese database migration. */
async function seededSentences() {
  const sql = await source('migrations-chinese/0003_create_sentences.sql')
  const row = /\('([^']+)', '(\d)', '(\w+)', '([^']+)', (NULL|'[\w-]+'), ('(?:[^']|'')*'|NULL), (NULL|'\w+'), '(\w+)', (\d+),/g
  const text = (value) => value === 'NULL' ? null : value.slice(1, -1).replaceAll("''", "'")
  return [...sql.matchAll(row)].map(([, id, level, difficulty, tokens, form, mission, opportunity, status, position]) => ({ id, level, difficulty, tokens: JSON.parse(tokens), ...(text(form) ? { form: text(form) } : {}), mission: text(mission), opportunity: text(opportunity), status, position: Number(position) }))
}
async function seededRounds() {
  const rounds = await importTs('worker/modules/multiplayer/sentence-rounds.ts')
  return rounds.roundsFromSentences(await seededSentences())
}

test('sentence missions offer the canonical opening card first', async () => {
  const rounds = await importTs('worker/modules/multiplayer/sentence-rounds.ts')
  const sheIsWell = (await seededRounds()).find((round) => round.id === 'hsk1-very-good')

  assert.ok(sheIsWell)
  assert.deepEqual(rounds.requiredMissionOptions(sheIsWell, []), ['她'])
})

test('question missions require 吗 after the rest of the sentence', async () => {
  const rounds = await importTs('worker/modules/multiplayer/sentence-rounds.ts')
  const teaQuestion = (await seededRounds()).find((round) => round.id === 'hsk1-want-tea-question')

  assert.ok(teaQuestion)
  assert.deepEqual(rounds.requiredMissionOptions(teaQuestion, ['你', '想', '喝', '茶']), ['吗'])
})

test('sentence choices are contextual instead of arbitrary deck filler', async () => {
  const rounds = await importTs('worker/modules/multiplayer/sentence-rounds.ts')

  assert.deepEqual(new Set(rounds.sentenceOptions(['在'])), new Set(['学校', '家', '中国', '商场', '医院']))
})

test('free-mode choices follow validated sentence continuations when available', async () => {
  const rounds = await importTs('worker/modules/multiplayer/sentence-rounds.ts')

  assert.deepEqual(rounds.coherentNextOptions(['妈妈', '已经'], [['妈妈', '已经', '回家', '了']]), ['回家'])
})

test('sentence hands keep validated continuations and fill every difficulty hand', async () => {
  const handler = await source('worker/modules/multiplayer/handler.ts')
  const roundsSource = await source('worker/modules/multiplayer/sentence-rounds.ts')
  assert.match(handler, /const coherent = round \? \[\] : shuffle\(coherentNextOptions\(tokens, references\)/)
  assert.match(handler, /\[\.\.\.required, \.\.\.opportunities, \.\.\.coherent, \.\.\.fresh, \.\.\.repeated, \.\.\.filler\]/)
  assert.match(handler, /sentenceOptionCount\[difficulty\]/)
  assert.match(roundsSource, /easy: 4, medium: 8, hard: 12/)
})

test('cooperative sentence rounds are limited to twelve characters', async () => {
  const handler = await source('worker/modules/multiplayer/handler.ts')
  assert.match(handler, /const sentenceCharacterLimit = 12/)
})

test('bonus opportunities are announced only while their card is visible', async () => {
  const handler = await source('worker/modules/multiplayer/handler.ts')
  assert.match(handler, /availableOptions\.includes\(opportunity\.card\)/)
})

test('admins can inspect a sentence card even when it is not their turn', async () => {
  const multiplayer = await source('src/modules/multiplayer/MultiplayerModule.tsx')
  const sentenceOption = multiplayer.slice(multiplayer.indexOf('function SentenceOption'), multiplayer.indexOf('function SentenceRoom'))
  assert.match(sentenceOption, /aria-disabled=\{disabled\}/)
  assert.doesNotMatch(sentenceOption, /\sdisabled=\{disabled\}/)
})

test('the Chinese domain owns the sentence catalogue shared by the sentence games', async () => {
  const sentences = await seededSentences()
  const rounds = await seededRounds()
  const corpus = await source('worker/modules/chinese/sentence-corpus.ts')
  const handler = await source('worker/modules/chinese/handler.ts')
  const multiplayer = await source('src/modules/multiplayer/MultiplayerModule.tsx')
  // Every seeded sentence (the former hardcoded list) is a game round with its mission and bonus rule.
  assert.equal(sentences.length, 44)
  assert.equal(rounds.length, sentences.length)
  assert.deepEqual(rounds.map((round) => round.answer), sentences.map((sentence) => sentence.tokens))
  assert.ok(rounds.every((round) => round.mission))
  assert.equal(rounds.find((round) => round.id === 'hsk1-want-water')?.opportunity?.card, '想')
  // The catalogue lives in the Chinese database, not in code.
  assert.match(corpus, /FROM chinese_sentences/)
  assert.doesNotMatch(corpus, /tokens: \['/)
  assert.match(handler, /\/api\/chinese\/sentences/)
  assert.doesNotMatch(multiplayer, /'wǒ'|gameVocabulary/)
})

test('a sentence without a mission is not a round of the sentence game', async () => {
  const rounds = await importTs('worker/modules/multiplayer/sentence-rounds.ts')
  const sentence = { id: 'x', level: '1', difficulty: 'easy', tokens: ['我', '喝', '茶', '。'], mission: null, opportunity: null, status: 'active', position: 1 }
  assert.deepEqual(rounds.roundsFromSentences([sentence]), [])
  assert.equal(rounds.roundsFromSentences([{ ...sentence, mission: 'm' }]).length, 1)
})

test('Bate-olho receives its terms from an experience instead of calling the Chinese API', async () => {
  const game = await source('src/modules/scene-certa/SceneCertaModule.tsx')
  const chinese = await source('src/experiences/chinese/picture-source.ts')
  assert.doesNotMatch(game, /\/api\/chinese|zh-CN|speechSynthesis/)
  assert.match(game, /source: PictureGameSource/)
  assert.match(chinese, /\/api\/chinese\/vocabulary/)
})

test('Ouça e monte deals the sentence words plus distractors that never repeat an answer word', async () => {
  const rules = await importTs('src/modules/listen-build/listen-build.ts')
  const sentence = { id: 'tea', tokens: ['我', '喝', '茶'], text: '我喝茶。', contentIds: ['zh-hans:sentence:我喝茶', '我', '喝', '茶'] }
  const round = rules.buildRound(sentence, ['我', '茶', '水', '书', '吃'], 2, () => 0.3)
  const texts = round.cards.map((card) => card.text)
  assert.equal(round.cards.length, 5)
  assert.deepEqual(texts.filter((text) => sentence.tokens.includes(text)).sort(), [...sentence.tokens].sort())
  assert.equal(texts.filter((text) => !sentence.tokens.includes(text)).length, 2)
  const idOf = (text) => round.cards.find((card) => card.text === text).id
  assert.equal(rules.answerIsCorrect(round, ['我', '喝', '茶'].map(idOf)), true)
  assert.equal(rules.answerIsCorrect(round, ['茶', '喝', '我'].map(idOf)), false)
  assert.equal(rules.answerIsCorrect(round, ['我', '喝'].map(idOf)), false)
})

test('Ouça e monte reveals pinyin only when every word has a reading', async () => {
  const chinese = await importTs('src/experiences/chinese/listening-source.ts')
  const pinyin = new Map([['我', 'wǒ'], ['喝', 'hē'], ['茶', 'chá']])
  const full = chinese.toListeningSentence({ id: 'tea', level: '1', difficulty: 'easy', tokens: ['我', '喝', '茶', '。'] }, pinyin)
  assert.equal(full.text, '我喝茶。')
  assert.deepEqual(full.tokens, ['我', '喝', '茶'])
  assert.equal(full.reading, 'wǒ hē chá.')
  assert.deepEqual(full.contentIds, ['zh-hans:sentence:我喝茶', '我', '喝', '茶'])
  const partial = chinese.toListeningSentence({ id: 'water', level: '1', difficulty: 'easy', tokens: ['我', '喝', '水', '。'] }, pinyin)
  assert.equal(partial.reading, undefined)
})

test('listening results feed the listening modality of the knowledge map', async () => {
  const knowledge = await importTs('src/learning-paths/knowledge.ts')
  const snapshot = knowledge.applyActivityResult(knowledge.createKnowledgeSnapshot(), { moduleId: 'listen-build', language: 'zh-Hans', completedAt: 1, assessments: [{ contentId: '茶', skill: 'comprehension', correct: true, score: 1 }] })
  assert.equal(snapshot.contents['茶'].skills.comprehension.modalities.listening.attempts, 1)
})

test('the Chinese voice is chosen explicitly when the device lists one', async () => {
  const speech = await importTs('src/experiences/chinese/speech.ts')
  assert.equal(speech.pickChineseVoice([{ lang: 'pt-BR' }, { lang: 'zh-TW' }, { lang: 'zh-CN' }]).lang, 'zh-CN')
  assert.equal(speech.pickChineseVoice([{ lang: 'pt-BR' }, { lang: 'cmn-Hans-CN' }]).lang, 'cmn-Hans-CN')
  assert.equal(speech.pickChineseVoice([{ lang: 'pt-BR' }, { lang: 'en-US' }]), null)
})

test('the daily session draws one game: sentence 40%, listening 40%, picture 20%, the rest as fallbacks', async () => {
  const games = await importTs('src/experiences/chinese/session-games.ts')
  assert.deepEqual(games.sessionGameOrder(0.1), ['sentence', 'listening', 'picture'])
  assert.deepEqual(games.sessionGameOrder(0.5), ['listening', 'sentence', 'picture'])
  assert.deepEqual(games.sessionGameOrder(0.9), ['picture', 'sentence', 'listening'])
  assert.equal(games.sessionGameWeights.reduce((sum, [, weight]) => sum + weight, 0), 1)
})

test('a practice session plans its games up front: random, each once, within the chosen length', async () => {
  const games = await importTs('src/experiences/chinese/session-games.ts')
  const rolls = (...values) => () => values.shift() ?? 0
  assert.deepEqual(games.practiceGamePlan(10, rolls(0.1, 0.1)), ['sentence', 'listening', 'picture'])
  assert.deepEqual(games.practiceGamePlan(10, rolls(0.9, 0.9)), ['picture', 'listening', 'sentence'])
  assert.deepEqual(games.practiceGamePlan(5, rolls(0.1, 0.1)), ['sentence', 'listening'])
  assert.deepEqual(games.practiceGamePlan(1, rolls(0.1, 0.1)), ['sentence'])
  for (let run = 0; run < 50; run += 1) {
    const plan = games.practiceGamePlan(5)
    assert.equal(new Set(plan).size, plan.length)
    assert.ok(plan.length >= 1)
    assert.ok(plan.slice(1).reduce((sum, game) => sum + games.sessionGameMinutes[game], games.sessionGameMinutes[plan[0]]) <= 5 || plan.length === 1)
  }
})

test('Ouça e monte offers studied sentences first and new words only to fill the catalogue', async () => {
  const chinese = await importTs('src/experiences/chinese/listening-source.ts')
  const rules = await importTs('src/modules/listen-build/listen-build.ts')
  const sentence = (id, tokens) => ({ id, tokens, text: tokens.join(''), contentIds: tokens })
  const all = [sentence('known', ['我', '喝', '茶']), sentence('one-new', ['我', '喝', '水']), sentence('two-new', ['他', '看', '书'])]
  const studied = (hanzi) => ['我', '喝', '茶'].includes(hanzi)
  assert.deepEqual(chinese.preferStudiedSentences(all, studied, { strict: true }).map((item) => item.id), ['known'])
  const catalogue = chinese.preferStudiedSentences(all, studied, { minimum: 5 })
  assert.deepEqual(catalogue.map((item) => [item.id, item.priority]), [['known', 0], ['one-new', 1]])
  assert.deepEqual(rules.buildRounds(catalogue, 1).map((round) => round.sentence.id), ['known'])
})

test('words answered right less than 70% of the time come back for review, worst first', async () => {
  const plan = await importTs('src/experiences/chinese/session-plan.ts')
  const skill = (attempts, successes) => ({ attempts, successes, hints: 0, strength: 0, dueAt: 0, updatedAt: 0 })
  const snapshot = { version: 1, updatedAt: 0, contents: {
    '茶': { skills: { recognition: skill(4, 1) }, mastered: false, updatedAt: 1 },
    '水': { skills: { recognition: skill(3, 2) }, mastered: false, updatedAt: 1 },
    '我': { skills: { recognition: skill(5, 5) }, mastered: false, updatedAt: 1 },
    '书': { skills: { recognition: skill(1, 0) }, mastered: false, updatedAt: 1 },
    '喝': { skills: { comprehension: skill(4, 0), recognition: skill(2, 2) }, mastered: false, updatedAt: 1 },
    'zh-hans:sentence:我喝茶': { skills: { comprehension: skill(4, 0) }, mastered: false, updatedAt: 1 },
  } }
  assert.deepEqual(plan.weakWords(snapshot), ['茶', '水'])
})

test('one session in four is practice once ten sentences can be built', async () => {
  const plan = await importTs('src/experiences/chinese/session-plan.ts')
  const store = new Map()
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
  assert.equal(plan.nextSessionKind(9, storage), 'regular')
  assert.equal(store.size, 0)
  const kinds = Array.from({ length: 8 }, () => plan.nextSessionKind(12, storage))
  assert.deepEqual(kinds, ['regular', 'regular', 'regular', 'practice', 'regular', 'regular', 'regular', 'practice'])
  const studied = (hanzi) => ['我', '喝', '茶'].includes(hanzi)
  assert.deepEqual(plan.buildableSentences([{ tokens: ['我', '喝', '茶', '。'] }, { tokens: ['我', '喝', '水', '。'] }], studied).length, 1)
})

test('Solte a Voz compares transcripts without ignoring meaningful differences', async () => {
  const rules = await importTs('src/modules/speak-aloud/speak-aloud.ts')
  // Punctuation, spaces and width are formatting; the characters are what count.
  assert.deepEqual(rules.normalizeTranscript('我喝茶。', 'characters'), ['我', '喝', '茶'])
  assert.equal(rules.compareTranscript('我喝茶。', '我 喝茶！', 'characters').correct, true)
  // Arabic digits are read as Chinese numerals; "2" stands for 二 or 两.
  assert.equal(rules.compareTranscript('我有三个苹果。', '我有3个苹果', 'characters').correct, true)
  assert.equal(rules.compareTranscript('十二', '12', 'characters').correct, true)
  assert.equal(rules.compareTranscript('两个人', '2个人', 'characters').correct, true)
  // A different character is never accepted, and the highlights show where.
  const wrong = rules.compareTranscript('我喝茶', '我和茶', 'characters')
  assert.equal(wrong.correct, false)
  assert.deepEqual(wrong.expected.map((unit) => unit.matched), [true, false, true])
  assert.deepEqual(wrong.recognized.map((unit) => unit.matched), [true, false, true])
  assert.equal(Math.round(wrong.accuracy * 100), 67)
  // Something said beyond the answer keeps it from being right.
  assert.equal(rules.compareTranscript('茶', '茶茶', 'characters').correct, false)
  // The closest alternative of the recognizer counts.
  assert.equal(rules.bestComparison('我喝茶', ['我和茶', '我喝茶'], 'characters').correct, true)
  assert.equal(rules.bestComparison('我喝茶', ['', ' '], 'characters'), null)
  // Words languages compare whole words, ignoring case and punctuation.
  assert.equal(rules.compareTranscript("I don't know.", "i don't know", 'words').correct, true)
  assert.deepEqual(rules.compareTranscript('I drink tea', 'I drink coffee', 'words').expected.map((unit) => unit.matched), [true, true, false])
  // Retries lower the score; never right scores nothing.
  assert.equal(rules.speakingScore(true, 1), 1)
  assert.equal(rules.speakingScore(true, 3), .6)
  assert.equal(rules.speakingScore(true, 9), .4)
  assert.equal(rules.speakingScore(false, 2), 0)
  // Studied content first.
  const picked = rules.pickSpeakingItems([{ id: 'new', priority: 1 }, { id: 'known', priority: 0 }], 1)
  assert.deepEqual(picked.map((item) => item.id), ['known'])
})

test('Solte a Voz counts as speaking practice', async () => {
  const knowledge = await importTs('src/learning-paths/knowledge.ts')
  const snapshot = knowledge.applyActivityResult(knowledge.createKnowledgeSnapshot(), { moduleId: 'speak-aloud', language: 'zh-Hans', completedAt: 1, assessments: [{ contentId: '茶', skill: 'production', correct: true, score: 1 }] })
  assert.equal(snapshot.contents['茶'].skills.production.modalities.speaking.attempts, 1)
})

test('English Anki decks are private to their owner unless made public, and only the owner changes them', async () => {
  const decks = await source('worker/modules/english/decks.ts')
  const schema = await source('migrations-english/0006_create_english_anki_decks.sql')
  assert.match(schema, /visibility TEXT NOT NULL DEFAULT 'private' CHECK \(visibility IN \('private', 'public'\)\)/)
  // Listing and reading cards only reach the learner's own decks and public ones.
  assert.match(decks, /WHERE d\.owner_id = \? OR d\.visibility = \\'public\\'/)
  assert.match(decks, /WHERE id = \? AND \(owner_id = \? OR visibility = \\'public\\'\)/)
  // Visibility changes and deletion require ownership.
  assert.match(decks, /if \(!deck \|\| deck\.owner_id !== user\.id\) return Response\.json\(\{ error: notFound \}, \{ status: 404 \}\)/)
})
