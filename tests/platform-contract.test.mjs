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
  // The pre-engine English record keeps its key (read once by the migration, never deleted).
  assert.match(await source('src/experiences/english/english-progress.ts'), /niorb:english:progress:v1/)
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
  const chinese = await source('src/experiences/chinese/flashcard-source.tsx')
  const study = await source('src/modules/study/StudyModule.tsx')
  assert.match(progress, /loadOfflineVocabulary/)
  assert.match(progress, /saveOfflineVocabulary/)
  assert.match(chinese, /loadOfflineVocabulary\(\)/)
  assert.match(chinese, /saveOfflineVocabulary\(catalogue\)/)
  // Offline, the module falls back to the catalogue the source keeps on the device.
  assert.match(study, /source\.cachedVocabulary\(\)/)
})

/** A browser window with an in-memory localStorage, enough for the device progress stores. */
function fakeWindow(entries = {}) {
  const storage = new Map(Object.entries(entries))
  globalThis.window = {
    localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  return storage
}

test('every language studies flashcards on the one shared engine', async () => {
  const study = await source('src/modules/study/StudyModule.tsx')
  const english = await source('src/experiences/english/EnglishWorkspace.tsx')
  const chinese = await source('src/experiences/chinese/ChineseWorkspace.tsx')
  // The module knows no language: words, store and card faces come from the source.
  assert.doesNotMatch(study, /experiences\//)
  // (`focus-hanzi` is only the class name of the card front.)
  assert.doesNotMatch(study, /\.hanzi|pinyin|hsk|\/api\//i)
  assert.match(chinese, /<StudyModule[^>]*source=\{flashcardSource\}/)
  assert.match(english, /<StudyModule[^>]*source=\{source\}/)
  assert.doesNotMatch(english, /function EnglishFlashcardSession/)
})

test('Chinese progress keeps its storage key on the shared engine', async () => {
  const storage = fakeWindow({ 'niorb:chinese-progress:v1': JSON.stringify({ vocabulary: { a: 'learned' }, cards: [{ vocabularyId: 'a', dueAt: '2026-01-01T00:00:00.000Z', intervalDays: 3, ease: 2.5, isNew: false, updatedAt: 5 }], studySync: {}, vocabularySync: {} }) })
  const chinese = await importTs('src/experiences/chinese/device-progress.ts')
  const progress = chinese.loadDeviceProgress()
  assert.equal(progress.cards.length, 1)
  assert.equal(progress.cards[0].intervalDays, 3)
  assert.equal(progress.vocabulary.a, 'learned')
  chinese.createCard(progress, 'b')
  assert.deepEqual(JSON.parse(storage.get('niorb:chinese-progress:v1')).cards.map((card) => card.vocabularyId), ['a', 'b'])
})

test('old English flashcard progress moves into the engine once, and the old data is kept', async () => {
  const legacy = JSON.stringify({ cards: ['seen', 'known'], learned: ['known'], reviews: 7, spelling: 2, quizCorrect: 1, quizAttempts: 3 })
  const storage = fakeWindow({ 'niorb:english:progress:v1': legacy })
  const english = await importTs('src/experiences/english/english-progress.ts')
  assert.equal(english.migrateLegacyEnglishProgress(), 2)
  const progress = english.englishProgressStore.load()
  const byId = Object.fromEntries(progress.cards.map((card) => [card.vocabularyId, card]))
  // Seen but not learned: due now. Learned: stays learned, scheduled as after a "Normal" answer.
  assert.equal(byId.seen.isNew, false)
  assert.ok(Date.parse(byId.seen.dueAt) <= Date.now())
  assert.equal(byId.known.intervalDays, 2)
  assert.equal(progress.vocabulary.known, 'learned')
  assert.equal(progress.vocabulary.seen, undefined)
  // Everything is queued for the server, the learned flag included.
  assert.equal(progress.studySync.known.learned, true)
  assert.equal(progress.studySync.seen.learned, false)
  // Runs once; the old record is untouched.
  assert.equal(english.migrateLegacyEnglishProgress(), 0)
  assert.equal(storage.get('niorb:english:progress:v1'), legacy)
  assert.equal(english.loadLegacyProgress().reviews, 7)
})

test('the English migration never overwrites cards the engine already has', async () => {
  fakeWindow({
    'niorb:english:progress:v1': JSON.stringify({ cards: ['word'], learned: [] }),
    'niorb:english-flashcards:v1': JSON.stringify({ vocabulary: {}, cards: [{ vocabularyId: 'word', dueAt: '2030-01-01T00:00:00.000Z', intervalDays: 30, ease: 2.8, isNew: false, updatedAt: 9 }], studySync: {}, vocabularySync: {} }),
  })
  const english = await importTs('src/experiences/english/english-progress.ts')
  assert.equal(english.migrateLegacyEnglishProgress(), 0)
  assert.equal(english.englishProgressStore.load().cards[0].intervalDays, 30)
})

test('English flashcard progress syncs with the English database', async () => {
  const handler = await source('worker/modules/english/handler.ts')
  const study = await source('worker/modules/english/study.ts')
  const schema = await source('migrations-english/0007_create_english_study_progress.sql')
  const progress = await source('src/experiences/english/english-progress.ts')
  assert.match(progress, /createStudySync\(englishProgressStore, '\/api\/english\/study\/progress'\)/)
  assert.match(handler, /url\.pathname === '\/api\/english\/study\/progress'/)
  assert.match(study, /if \(!user\) return Response\.json\(\{ error: 'Faça login para continuar\.' \}, \{ status: 401 \}\)/)
  // Every row belongs to the signed-in learner, and an older change never replaces a newer one.
  assert.match(study, /WHERE user_id = \?/)
  assert.match(study, /WHERE excluded\.updated_at > english_study_cards\.updated_at/)
  assert.match(schema, /CREATE TABLE english_study_cards/)
  assert.match(schema, /PRIMARY KEY \(user_id, card_id\)/)
  assert.doesNotMatch(schema, /DROP|ALTER TABLE/)
})

test('a large outbox is sent in chunks the servers accept', async () => {
  fakeWindow()
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
  const { createProgressStore } = await importTs('src/modules/study/engine/progress-store.ts')
  const { createStudySync } = await importTs('src/modules/study/engine/study-sync.ts')
  const store = createProgressStore({ storageKey: 'test-progress', changeEvent: 'test-progress' })
  store.createCardsForVocabulary(store.load(), Array.from({ length: 1_234 }, (_, index) => `w${index}`))
  const sent = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_url, init) => {
    if (init?.method === 'PUT') { sent.push(JSON.parse(init.body).changes.length); return new Response('{}') }
    return new Response(JSON.stringify({ cards: [], tombstones: [], vocabulary: [], revisions: { all: 1 } }))
  }
  try { await createStudySync(store, '/api/test').sync() } finally { globalThis.fetch = originalFetch }
  assert.deepEqual(sent, [500, 500, 234])
  assert.equal(Object.keys(store.load().studySync).length, 0)
})

test('a rating sets the next review only for a new or due card', async () => {
  fakeWindow()
  const { createProgressStore } = await importTs('src/modules/study/engine/progress-store.ts')
  const store = createProgressStore({ storageKey: 'test-rating', changeEvent: 'test-rating' })
  store.createCardsForVocabulary(store.load(), ['茶'])
  const first = store.rateCard(store.load(), '茶', 'easy')
  assert.equal(first.intervalDays, 4)
  // Shown again before its review is due: "easy" does not stretch the interval.
  const early = store.rateCard(store.load(), '茶', 'easy')
  assert.equal(early.intervalDays, 4)
  assert.equal(early.dueAt, first.dueAt)
  const progress = store.load()
  progress.cards[0].dueAt = new Date(Date.now() - 1_000).toISOString()
  store.save(progress)
  assert.ok(store.rateCard(store.load(), '茶', 'easy').intervalDays > 4)
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

test('a weak word is reviewed only while it still needs it, the weakest first', async () => {
  const plan = await importTs('src/experiences/chinese/session-plan.ts')
  const skill = (attempts, successes, strength, dueAt = 0) => ({ attempts, successes, hints: 0, strength, dueAt, updatedAt: 0 })
  const word = (value) => ({ skills: { recognition: value }, mastered: false, updatedAt: 1 })
  const snapshot = { version: 1, updatedAt: 0, contents: {
    '茶': word(skill(4, 1, 40)),
    '水': word(skill(4, 1, 10)),
    '书': word(skill(5, 2, 70)),
    '看': word(skill(4, 1, 20, 2_000)),
    '喝': word(skill(4, 1, 5)),
  } }
  // 书 has recovered (answered right lately), 看 is not due yet, 喝 waits its flashcard interval.
  assert.deepEqual(plan.weakWords(snapshot, { now: 1_000, scheduledLater: (id) => id === '喝' }), ['水', '茶'])
})

test('session games play the sentences with the new words of the session first', async () => {
  const plan = await importTs('src/experiences/chinese/session-plan.ts')
  const sentences = [{ id: 'tea', tokens: ['我', '喝', '茶'] }, { id: 'water', tokens: ['我', '喝', '水'] }, { id: 'apple', tokens: ['我', '吃', '苹果'] }, { id: 'she', tokens: ['她', '想', '喝', '水'] }]
  const ordered = plan.focusFirst(sentences, ['水', '她']).map((sentence) => sentence.id)
  assert.deepEqual(ordered.slice(0, 2).sort(), ['she', 'water'])
  assert.deepEqual(ordered.slice(2).sort(), ['apple', 'tea'])
})

test('the session review takes on overdue flashcards, more only in a catch-up session', async () => {
  const plan = await importTs('src/experiences/chinese/session-plan.ts')
  const card = (id, day, ease = 2.5, isNew = false) => ({ vocabularyId: id, dueAt: `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`, isNew, ease })
  const now = '2026-02-01T00:00:00.000Z'
  const many = (count, ease) => Array.from({ length: count }, (_, index) => card(`w${index}`, (index % 28) + 1, ease))
  // Nothing overdue: nothing added (new cards and the session's own words do not count).
  assert.deepEqual(plan.overdueReview([card('茶', 1), card('新', 1, 2.5, true), { ...card('明', 1), dueAt: '2026-03-01T00:00:00.000Z' }], { now, exclude: ['茶'] }).ids, [])
  // A few overdue: all of them, the most overdue first.
  assert.deepEqual(plan.overdueReview([card('b', 9), card('a', 2)], { now }).ids, ['a', 'b'])
  assert.equal(plan.overdueReview(many(25), { now, catchUpTurn: true }).ids.length, 10)
  assert.equal(plan.overdueReview(many(40), { now, catchUpTurn: false }).ids.length, 10)
  assert.equal(plan.overdueReview(many(40), { now, catchUpTurn: true }).ids.length, 20)
  // Cards the learner keeps marking hard pile up again: no catch-up for them.
  assert.equal(plan.overdueReview(many(40, 1.5), { now, catchUpTurn: true }).ids.length, 10)
  const store = new Map()
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
  const turns = Array.from({ length: 5 }, () => { const turn = plan.reviewCatchUpTurn(storage); turn.record(turn.due); return turn.due })
  assert.deepEqual(turns, [true, false, false, true, false])
})

test('a word used right in a sentence game counts as the review of its overdue flashcard', async () => {
  const plan = await importTs('src/experiences/chinese/session-plan.ts')
  const now = '2026-02-01T00:00:00.000Z'
  const cards = [{ vocabularyId: '喜欢', dueAt: '2026-01-01T00:00:00.000Z', isNew: false }, { vocabularyId: '茶', dueAt: '2026-03-01T00:00:00.000Z', isNew: false }, { vocabularyId: '我', dueAt: '2026-01-01T00:00:00.000Z', isNew: false }]
  const result = { moduleId: 'multiplayer', assessments: [{ contentId: '我', correct: false }, { contentId: '喜欢', correct: true }, { contentId: '茶', correct: true }] }
  assert.deepEqual(plan.wordsReviewedBySentences(result, cards, now), ['喜欢'])
  assert.deepEqual(plan.wordsReviewedBySentences({ ...result, moduleId: 'study' }, cards, now), [])
})

test('after the starter core, new words come at a pace that follows the learner', async () => {
  const plan = await importTs('src/experiences/chinese/session-plan.ts')
  const base = { starterLeft: 0, weakCount: 0, lastNewWords: 3, lastWordsFragile: false, freshSentences: 0, knownWords: 30 }
  // While the starter core is being learned: always 3.
  assert.deepEqual(plan.sessionPace({ ...base, starterLeft: 4, weakCount: 5, lastWordsFragile: true }), { newWords: 3, focus: null })
  // Fewer words the more sentences are waiting to be practised, at most 2 from 60 words on.
  assert.equal(plan.sessionPace({ ...base, freshSentences: 2 }).newWords, 3)
  assert.equal(plan.sessionPace({ ...base, freshSentences: 7 }).newWords, 2)
  assert.equal(plan.sessionPace({ ...base, freshSentences: 15 }).newWords, 1)
  assert.equal(plan.sessionPace({ ...base, knownWords: 80 }).newWords, 2)
  // Weak words, or the last session's words still fragile: a session on them, no new word.
  assert.deepEqual(plan.sessionPace({ ...base, weakCount: 3 }), { newWords: 0, focus: 'weak' })
  assert.deepEqual(plan.sessionPace({ ...base, lastWordsFragile: true }), { newWords: 0, focus: 'recent' })
  // Never two sessions in a row without a new word.
  assert.deepEqual(plan.sessionPace({ ...base, lastNewWords: 0, weakCount: 5, lastWordsFragile: true }), { newWords: 3, focus: null })
  const skill = (strength) => ({ attempts: 2, successes: 2, hints: 0, strength, dueAt: 0, updatedAt: 0 })
  const snapshot = { version: 1, updatedAt: 0, contents: { '水': { skills: { recognition: skill(70), production: skill(30) }, mastered: false, updatedAt: 1 }, '茶': { skills: { recognition: skill(80) }, mastered: false, updatedAt: 1 } } }
  assert.equal(plan.fragileWord(snapshot, '水'), true)
  assert.equal(plan.fragileWord(snapshot, '茶'), false)
})

test('sentences saved from the games are kept per learner and studied as their own deck', async () => {
  const migration = await source('migrations/0013_create_saved_sentences.sql')
  assert.match(migration, /CREATE TABLE user_saved_sentences/)
  assert.match(migration, /PRIMARY KEY \(user_id, sentence_id\)/)
  assert.doesNotMatch(migration, /DROP|ALTER TABLE/)
  const handler = await source('worker/modules/chinese/handler.ts')
  // Only catalogue sentences can be saved, and only by the learner who is signed in.
  assert.match(handler, /SELECT 1 FROM chinese_sentences WHERE id = \?/)
  assert.match(handler, /user_saved_sentences WHERE user_id = \?/)
  const saved = await source('src/experiences/chinese/saved-sentences.tsx')
  assert.match(saved, /storageKey: 'niorb:chinese-sentence-progress:v1'/)
  const workspace = await source('src/experiences/chinese/ChineseWorkspace.tsx')
  assert.match(workspace, /sentenceAction=\{saveRoundAction\}/)
  assert.match(workspace, /sentenceAction: saveSentenceAction/)
})

test('raising level or difficulty on one\'s own is a jump; following the suggestion is not', async () => {
  const { placementAfter } = await importTs('worker/auth.ts')
  const user = (level, difficulty, placement = null) => ({ self_assessed_hsk_level: level, study_difficulty: difficulty, placement_level: placement })
  assert.equal(placementAfter(user('1', 'easy'), { level: '2', difficulty: 'hard' }, null), '2')
  assert.equal(placementAfter(user('1', 'easy'), { level: '1', difficulty: 'hard' }, null), '1')
  // Accepting the app's suggestion is a step, not a jump.
  assert.equal(placementAfter(user('1', 'hard'), { level: '2', difficulty: 'hard' }, { kind: 'hsk', hskLevel: '2' }), null)
  assert.equal(placementAfter(user('1', 'easy'), { level: '1', difficulty: 'medium' }, { kind: 'difficulty', difficulty: 'medium' }), null)
  // Going down brings the jump down; staying keeps it.
  assert.equal(placementAfter(user('2', 'hard', '2'), { level: '1', difficulty: 'hard' }, null), '1')
  assert.equal(placementAfter(user('2', 'hard', '2'), { level: '2', difficulty: 'easy' }, null), '2')
  assert.equal(placementAfter(user('1', 'easy', '1'), { level: '0', difficulty: 'easy' }, null), null)
})

test('after a jump, words are proven in sentences or taught again, and the level comes first', async () => {
  const plan = await importTs('src/experiences/chinese/session-plan.ts')
  const skill = (attempts, successes) => ({ attempts, successes, hints: 0, strength: 0, dueAt: 0, updatedAt: 0 })
  const snapshot = { version: 1, updatedAt: 0, contents: {
    '咖啡': { skills: { production: skill(2, 2), comprehension: skill(1, 1) }, mastered: false, updatedAt: 1 },
    '机场': { skills: { production: skill(4, 1) }, mastered: false, updatedAt: 1 },
    '药': { skills: { production: skill(2, 2) }, mastered: false, updatedAt: 1 },
  } }
  assert.equal(plan.placementStatus(snapshot, '咖啡'), 'proven')
  assert.equal(plan.placementStatus(snapshot, '机场'), 'failed')
  assert.equal(plan.placementStatus(snapshot, '药'), 'unproven')
  const vocabulary = ['我', '咖啡', '机场', '药', '飞机'].map((id) => ({ id, hsk_level: id === '我' ? '1' : '2' })).concat({ id: '高', hsk_level: '3' })
  assert.deepEqual(plan.placementWords({ vocabulary, placement: 2, learned: (id) => id === '我', snapshot }), { assumed: ['咖啡', '药', '飞机'], failed: ['机场'] })
  const sentence = (id, level, tokens) => ({ id, level, tokens })
  const ordered = [sentence('a', '2', ['咖啡']), sentence('old-useful', '1', ['飞机']), sentence('b', '2', ['药']), sentence('old', '1', ['我']), sentence('c', '2', ['咖啡']), sentence('d', '2', ['药'])]
  // Three of the level, then one earlier sentence with a word no sentence of the level has; useless earlier ones last.
  assert.deepEqual(plan.placementSentenceOrder(ordered, '2', ['咖啡', '药', '飞机']).map((item) => item.id), ['a', 'b', 'c', 'old-useful', 'd', 'old'])
})

test('a session review never brings back a card before its time, and plays at most one free round', async () => {
  const workspace = await source('src/experiences/chinese/ChineseWorkspace.tsx')
  // Reviews keep only due cards; with nothing due the session goes to its games.
  assert.match(workspace, /card\.dueAt <= now; \}\);\s*const review = withOverdueReviews/)
  assert.match(workspace, /if \(!review\.content\.length\) \{ startSessionGame\(sessionGameOrder\(\)\); return; \}/)
  assert.match(workspace, /fragileWord\(knowledge, id\) && dueNow\(id\)/)
  assert.match(workspace, /!freeRoundPlayed\.current && plan\.roundIds\.length >= 2/)
  const handler = await source('worker/modules/multiplayer/handler.ts')
  assert.match(handler, /soloSession && input\?\.freeRound === true && index === sentenceRounds\.length - 1 \? 'free'/)
})

test('progress per modality weighs every skill by its evidence', async () => {
  const { modalityMetric } = await importTs('src/learning-paths/metrics.ts')
  const skill = (modalities) => ({ attempts: 1, successes: 1, hints: 0, strength: 0, dueAt: 0, updatedAt: 0, modalities })
  const evidence = (attempts, strength) => ({ attempts, successes: attempts, strength, updatedAt: 0 })
  const snapshot = { version: 1, updatedAt: 0, contents: {
    '茶': { skills: { recognition: skill({ reading: evidence(3, 90) }), production: skill({ writing: evidence(1, 40) }) }, mastered: false, updatedAt: 1 },
    '水': { skills: { recognition: skill({ reading: evidence(1, 50) }) }, mastered: false, updatedAt: 1 },
  } }
  assert.deepEqual(modalityMetric(snapshot), { reading: 80, writing: 40, speaking: 0, listening: 0 })
})

test('grammar words come with an explanation and examples on their card', async () => {
  const { wordExplanations } = await importTs('src/experiences/chinese/word-explanations.ts')
  const hsk1 = new Set((await source('files/vocabulario hsk/hsk1.txt')).split(/\r?\n/).slice(1).map((line) => line.split(',')[0]).filter(Boolean))
  for (const [word, explanation] of Object.entries(wordExplanations)) {
    assert.ok(hsk1.has(word), `${word} is an HSK 1 word`)
    assert.ok(explanation.text.length > 20, `${word} has an explanation`)
    assert.ok(explanation.examples.length >= 2 && explanation.examples.every((example) => example.text.includes(word.replace('哪儿', '哪')) && example.reading && example.meaning), `${word} has examples that use it`)
  }
  for (const word of ['吗', '在', '了', '的', '不', '个']) assert.ok(wordExplanations[word], `${word} is explained`)
  assert.match(await source('src/experiences/chinese/flashcard-source.tsx'), /explanation: wordExplanations\[item\.hanzi\]/)
})

test('right after the trail the starter core is taught in its order', async () => {
  const plan = await importTs('src/experiences/chinese/session-plan.ts')
  const vocabulary = ['我', '喝', '茶', '想', '不', '水', '吃', '苹果', '他', '你', '吗', '她', '喜欢', '书'].map((id) => ({ id, hsk_level: '1' }))
  const trail = ['我', '喝', '茶', '想', '不', '水', '吃', '苹果', '他']
  assert.deepEqual(plan.nextWordsToLearn({ vocabulary, sentences: [], level: 1, studied: (id) => trail.includes(id) }), ['你', '吗', '她'])
  assert.deepEqual(plan.nextWordsToLearn({ vocabulary, sentences: [], level: 1, studied: (id) => [...trail, '你'].includes(id) }), ['吗', '她', '喜欢'])
})

test('review-only sessions wait for nine known words', async () => {
  const plan = await importTs('src/experiences/chinese/session-plan.ts')
  const store = new Map([['niorb:chinese:practice-cadence:v1', '3']])
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
  assert.equal(plan.nextSessionKind(12, storage, 8), 'regular')
  assert.equal(plan.nextSessionKind(12, storage, 9), 'practice')
})

test('games bring back hard words after the new ones, without repeating what was just played', async () => {
  const plan = await importTs('src/experiences/chinese/session-plan.ts')
  const sentences = [
    { id: 'plain', tokens: ['我', '喝', '茶'] }, { id: 'hard', tokens: ['我', '喜欢', '茶'] },
    { id: 'hard-recent', tokens: ['她', '喜欢', '水'] }, { id: 'plain-recent', tokens: ['我', '吃', '苹果'] }, { id: 'new', tokens: ['他', '喝', '水'] },
  ]
  assert.deepEqual(plan.focusFirst(sentences, ['他'], () => 0.5, ['hard-recent', 'plain-recent'], ['喜欢']).map((sentence) => sentence.id), ['new', 'hard', 'plain', 'hard-recent', 'plain-recent'])
  const cards = [{ vocabularyId: '喜欢', isNew: false, ease: 2.1 }, { vocabularyId: '茶', isNew: false, ease: 2.65 }, { vocabularyId: '水', isNew: false, ease: 2.3 }, { vocabularyId: '新', isNew: true, ease: 1.3 }]
  const skill = (attempts, successes, strength) => ({ attempts, successes, hints: 0, strength, dueAt: 0, updatedAt: 0 })
  const snapshot = { version: 1, updatedAt: 0, contents: { '吃': { skills: { recognition: skill(4, 1, 20) }, mastered: false, updatedAt: 1 } } }
  // Lowest ease first, then words often missed; marked easy (high ease) or never reviewed: not hard.
  assert.deepEqual(plan.difficultWords(cards, snapshot), ['喜欢', '水', '吃'])
})

test('sentences played lately go after the others, new words still first', async () => {
  const plan = await importTs('src/experiences/chinese/session-plan.ts')
  const sentences = [{ id: 'a', tokens: ['我', '喝', '茶'] }, { id: 'b', tokens: ['我', '吃', '苹果'] }, { id: 'c', tokens: ['我', '喝', '水'] }, { id: 'd', tokens: ['他', '喝', '水'] }]
  assert.deepEqual(plan.focusFirst(sentences, ['他'], () => 0.5, ['a', 'd']).map((sentence) => sentence.id), ['d', 'b', 'c', 'a'])
  const store = new Map()
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
  plan.rememberSessionSentences(['a', 'b'], storage); plan.rememberSessionSentences(['a'], storage)
  assert.deepEqual(plan.recentSessionSentences(storage), ['b', 'a'])
})

test('after the trail, new words are the ones that complete the most sentences', async () => {
  const plan = await importTs('src/experiences/chinese/session-plan.ts')
  const vocabulary = ['书', '我', '水', '看', '喝', '飞机'].map((id) => ({ id, hsk_level: '1' })).concat({ id: '咖啡', hsk_level: '2' })
  const sentences = [
    { tokens: ['我', '喝', '水', '。'], level: '1', difficulty: 'easy' },
    { tokens: ['我', '看', '书', '。'], level: '1', difficulty: 'easy' },
    { tokens: ['我', '喝', '咖啡', '。'], level: '2', difficulty: 'easy' },
  ]
  const studied = (id) => ['我', '喝'].includes(id)
  // 水 completes a sentence; 看 and 书 each appear once; 咖啡 is above the level; 飞机 is in no sentence.
  assert.deepEqual(plan.nextWordsToLearn({ vocabulary, sentences, level: 1, studied, limit: 3 }), ['水', '书', '看'])
  assert.deepEqual(plan.nextWordsToLearn({ vocabulary, sentences, level: 1, studied, limit: 5 }), ['水', '书', '看', '飞机'])
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
