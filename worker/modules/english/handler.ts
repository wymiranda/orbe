import { knownEnglishEmoji } from './vocabulary-visuals.js'
import { loadGrammarQuestions, loadGrammarTopics } from './grammar-quiz.js'
import { handleEnglishDeckRequest } from './decks.js'

type EnglishVocabulary = {
  id: string
  term: string
  pronunciation: string | null
  portuguese: string
  part_of_speech: string | null
  cefr_level: string | null
  visual_kind?: 'emoji' | 'svg' | 'image' | null
  visual_value?: string | null
}

const vocabularyQuery = 'SELECT id, term, pronunciation, portuguese, part_of_speech, cefr_level, visual_kind, visual_value FROM english_vocabulary_catalog ORDER BY cefr_level COLLATE NOCASE, term COLLATE NOCASE'

type VocabularyInput = {
  id?: unknown
  term?: unknown
  pronunciation?: unknown
  portuguese?: unknown
  part_of_speech?: unknown
  cefr_level?: unknown
}

type EnglishReading = {
  id: string
  title: string
  category: string | null
  cover_url: string | null
  created_at: string
  updated_at: string
}

type EnglishChapter = { id: string; position: number; title: string; content: string }
type EnglishChapterLine = { id: string; chapter_id: string; position: number; text: string; portuguese: string | null }

export type EnglishEnv = { ENGLISH_DB: D1Database }

const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
/** Brutal is not offered in English yet: there is no unlock for it here. */
const englishStudyDifficulties = ['easy', 'medium', 'hard']

const importChunkSize = 500

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function cleanText(value: unknown) { return text(value).replace(/\s+/g, ' ') }

/*
 * Cleans an imported catalogue instead of rejecting it: blank rows are dropped,
 * spacing is collapsed, unknown levels become empty and repeated terms (case-insensitive)
 * are merged into one entry with the lowest level and every part of speech.
 * Returns null when a row has a term but no translation.
 */
function cleanVocabulary(entries: unknown[]): EnglishVocabulary[] | null {
  const merged = new Map<string, EnglishVocabulary>()
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const input = entry as VocabularyInput
    const term = cleanText(input.term)
    if (!term) continue
    const portuguese = cleanText(input.portuguese)
    if (!portuguese) return null
    const level = cleanText(input.cefr_level).toUpperCase()
    const cefrLevel = cefrLevels.includes(level) ? level : null
    const partOfSpeech = cleanText(input.part_of_speech).toLocaleLowerCase() || null
    const key = term.toLocaleLowerCase()
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { id: cleanText(input.id) || crypto.randomUUID(), term, pronunciation: cleanText(input.pronunciation) || null, portuguese, part_of_speech: partOfSpeech, cefr_level: cefrLevel })
      continue
    }
    if (cefrLevel && (!existing.cefr_level || cefrLevels.indexOf(cefrLevel) < cefrLevels.indexOf(existing.cefr_level))) existing.cefr_level = cefrLevel
    if (partOfSpeech) existing.part_of_speech = [...new Set([...(existing.part_of_speech?.split(', ') ?? []), partOfSpeech])].join(', ')
    existing.pronunciation ??= cleanText(input.pronunciation) || null
  }
  return merged.size ? [...merged.values()] : null
}

export async function handleEnglishRequest(request: Request, env: EnglishEnv, user?: { id: string }): Promise<Response | null> {
  const url = new URL(request.url)

  if (url.pathname.startsWith('/api/english/decks') && user) {
    const deckResponse = await handleEnglishDeckRequest(request, env, user)
    if (deckResponse) return deckResponse
  }

  if (url.pathname === '/api/english/preferences' && user) {
    const preferences = () => env.ENGLISH_DB.prepare('SELECT cefr_level, study_difficulty FROM english_user_preferences WHERE user_id = ?').bind(user.id).first<{ cefr_level: string; study_difficulty: string }>()
    if (request.method === 'GET') {
      const saved = await preferences()
      return Response.json({ cefr_level: saved?.cefr_level ?? null, study_difficulty: saved?.study_difficulty ?? 'easy' })
    }
    if (request.method === 'PUT') {
      // Level and difficulty are saved independently; the level is chosen first (onboarding), so the row exists for the difficulty.
      const body = await request.json().catch(() => null) as { cefrLevel?: unknown; difficulty?: unknown } | null
      const cefrLevel = body?.cefrLevel === undefined ? null : text(body.cefrLevel)
      const difficulty = body?.difficulty === undefined ? null : text(body.difficulty)
      if ((cefrLevel === null && difficulty === null) || (cefrLevel !== null && !cefrLevels.includes(cefrLevel))) return Response.json({ error: 'Escolha um nível válido.' }, { status: 400 })
      if (difficulty !== null && !englishStudyDifficulties.includes(difficulty)) return Response.json({ error: 'Escolha um nível e uma dificuldade válidos.' }, { status: 400 })
      const now = new Date().toISOString()
      if (cefrLevel !== null) await env.ENGLISH_DB.prepare('INSERT INTO english_user_preferences (user_id, cefr_level, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET cefr_level = excluded.cefr_level, updated_at = excluded.updated_at').bind(user.id, cefrLevel, now).run()
      if (difficulty !== null) {
        const { meta } = await env.ENGLISH_DB.prepare('UPDATE english_user_preferences SET study_difficulty = ?, updated_at = ? WHERE user_id = ?').bind(difficulty, now, user.id).run()
        if (!meta.changes) return Response.json({ error: 'Escolha um nível válido.' }, { status: 400 })
      }
      const saved = await preferences()
      return Response.json({ cefr_level: saved?.cefr_level ?? null, study_difficulty: saved?.study_difficulty ?? 'easy' })
    }
  }

  if (url.pathname === '/api/english/quiz/topics' && request.method === 'GET') {
    const level = url.searchParams.get('level') ?? ''
    if (!cefrLevels.includes(level)) return Response.json({ error: 'Nível inválido.' }, { status: 400 })
    return Response.json(await loadGrammarTopics(env.ENGLISH_DB, level))
  }
  const quizTopic = /^\/api\/english\/quiz\/topics\/([a-z0-9-]+)\/questions$/.exec(url.pathname)
  if (quizTopic && request.method === 'GET') {
    const count = Math.max(1, Math.min(50, Number(url.searchParams.get('count')) || 10))
    return Response.json(await loadGrammarQuestions(env.ENGLISH_DB, quizTopic[1], count))
  }

  if (url.pathname === '/api/english/vocabulary' && request.method === 'GET') {
    const { results } = await env.ENGLISH_DB.prepare(vocabularyQuery).all<EnglishVocabulary>()
    return Response.json(results)
  }

  if (url.pathname === '/api/english/vocabulary/import' && request.method === 'POST') {
    let body: { entries?: unknown }
    try { body = await request.json<{ entries?: unknown }>() } catch { return Response.json({ error: 'Envie o catálogo em JSON válido.' }, { status: 400 }) }
    const entries = Array.isArray(body.entries) ? body.entries : []
    const vocabulary = cleanVocabulary(entries)
    if (!vocabulary) return Response.json({ error: 'Cada termo precisa de palavra e tradução.' }, { status: 400 })
    const now = new Date().toISOString()
    // One JSON parameter per statement keeps large catalogues within D1's bound-parameter and per-request query limits.
    const rows = vocabulary.map((entry) => ({ ...entry, emoji: knownEnglishEmoji(entry.term) }))
    const chunks = Array.from({ length: Math.ceil(rows.length / importChunkSize) }, (_, index) => rows.slice(index * importChunkSize, (index + 1) * importChunkSize))
    // A known emoji only fills words without a visual, so a visual set by hand is never replaced.
    await env.ENGLISH_DB.batch(chunks.map((chunk) => env.ENGLISH_DB.prepare(`INSERT INTO english_vocabulary_catalog (id, term, pronunciation, portuguese, part_of_speech, cefr_level, visual_kind, visual_value, created_at, updated_at)
      SELECT json_extract(value, '$.id'), json_extract(value, '$.term'), json_extract(value, '$.pronunciation'), json_extract(value, '$.portuguese'), json_extract(value, '$.part_of_speech'), json_extract(value, '$.cefr_level'), CASE WHEN json_extract(value, '$.emoji') IS NOT NULL THEN 'emoji' END, json_extract(value, '$.emoji'), ?2, ?2 FROM json_each(?1) WHERE true
      ON CONFLICT(term) DO UPDATE SET pronunciation = excluded.pronunciation, portuguese = excluded.portuguese, part_of_speech = excluded.part_of_speech, cefr_level = excluded.cefr_level,
        visual_kind = COALESCE(english_vocabulary_catalog.visual_kind, excluded.visual_kind), visual_value = CASE WHEN english_vocabulary_catalog.visual_kind IS NULL THEN excluded.visual_value ELSE english_vocabulary_catalog.visual_value END, updated_at = excluded.updated_at`).bind(JSON.stringify(chunk), now)))
    const { results } = await env.ENGLISH_DB.prepare(vocabularyQuery).all<EnglishVocabulary>()
    return Response.json(results, { status: 201 })
  }

  if (url.pathname === '/api/english/readings' && request.method === 'GET') {
    const { results } = await env.ENGLISH_DB.prepare('SELECT id, title, category, cover_url, created_at, updated_at FROM english_readings ORDER BY updated_at DESC').all<EnglishReading>()
    return Response.json(results)
  }

  const readingMatch = url.pathname.match(/^\/api\/english\/readings\/([^/]+)$/)
  if (readingMatch && request.method === 'GET') {
    const readingId = decodeURIComponent(readingMatch[1])
    const reading = await env.ENGLISH_DB.prepare('SELECT id, title, category, cover_url, created_at, updated_at FROM english_readings WHERE id = ?').bind(readingId).first<EnglishReading>()
    if (!reading) return Response.json({ error: 'Leitura não encontrada.' }, { status: 404 })
    const { results: chapters } = await env.ENGLISH_DB.prepare('SELECT id, position, title, content FROM english_chapters WHERE reading_id = ? ORDER BY position').bind(reading.id).all<EnglishChapter>()
    const { results: lines } = await env.ENGLISH_DB.prepare('SELECT id, chapter_id, position, text, portuguese FROM english_chapter_lines WHERE chapter_id IN (SELECT id FROM english_chapters WHERE reading_id = ?) ORDER BY chapter_id, position').bind(reading.id).all<EnglishChapterLine>()
    return Response.json({
      ...reading,
      chapters: chapters.map((chapter) => ({ ...chapter, lines: lines.filter((line) => line.chapter_id === chapter.id) })),
    })
  }

  return null
}
