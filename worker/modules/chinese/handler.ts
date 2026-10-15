type ChineseVocabulary = {
  id: string
  type: 'character' | 'word'
  hanzi: string
  pinyin: string
  english: string
  portuguese: string
  hsk_level: string
}

type StoredChineseVocabulary = Pick<ChineseVocabulary, 'id' | 'type' | 'hanzi'>

export type ChineseEnv = { DB: D1Database }

type CurationTerm = { id: string; hanzi: string; pinyin: string; portuguese: string; hsk_level: string; occurrences: number; reading_count: number; learned?: number }

const curationTermQuery = `SELECT chinese_vocabulary_catalog.id, chinese_vocabulary_catalog.hanzi, chinese_vocabulary_catalog.pinyin, chinese_vocabulary_catalog.portuguese, chinese_vocabulary_catalog.hsk_level, COUNT(chinese_chapter_line_terms.id) AS occurrences, COUNT(DISTINCT chapters.reading_id) AS reading_count FROM chinese_vocabulary_catalog LEFT JOIN chinese_chapter_line_terms ON chinese_chapter_line_terms.vocabulary_id = chinese_vocabulary_catalog.id LEFT JOIN chapter_lines ON chapter_lines.id = chinese_chapter_line_terms.chapter_line_id LEFT JOIN chapters ON chapters.id = chapter_lines.chapter_id GROUP BY chinese_vocabulary_catalog.id`

function csvCell(value: string | number) { return `"${String(value).replaceAll('"', '""')}"` }

export async function handleChineseRequest(request: Request, env: ChineseEnv): Promise<Response | null> {
  const url = new URL(request.url)

  if (url.pathname === '/api/chinese/vocabulary' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, type, hanzi, pinyin, english, portuguese, hsk_level FROM chinese_vocabulary_catalog ORDER BY hsk_level, hanzi').all<ChineseVocabulary>()
    return Response.json(results)
  }

  if (url.pathname === '/api/chinese/vocabulary/import' && request.method === 'POST') { try {
    let body: { entries?: unknown }
    try {
      body = await request.json<{ entries?: unknown }>()
    } catch {
      return Response.json({ error: 'O arquivo enviado não contém JSON válido.' }, { status: 400 })
    }
    const entries = Array.isArray(body.entries) ? body.entries : []
    const validEntries = entries.filter((entry): entry is ChineseVocabulary => typeof entry === 'object' && entry !== null
      && typeof (entry as ChineseVocabulary).id === 'string'
      && ((entry as ChineseVocabulary).type === 'character' || (entry as ChineseVocabulary).type === 'word')
      && typeof (entry as ChineseVocabulary).hanzi === 'string'
      && typeof (entry as ChineseVocabulary).pinyin === 'string'
      && typeof (entry as ChineseVocabulary).english === 'string'
      && typeof (entry as ChineseVocabulary).portuguese === 'string'
      && typeof (entry as ChineseVocabulary).hsk_level === 'string')
    if (!validEntries.length || validEntries.length !== entries.length) return Response.json({ error: 'Envie entradas chinesas válidas.' }, { status: 400 })
    const ids = new Set<string>()
    const terms = new Set<string>()
    for (const entry of validEntries) {
      const termKey = `${entry.type}\u0000${entry.hanzi}`
      if (ids.has(entry.id)) return Response.json({ error: `O CSV repete o id "${entry.id}".` }, { status: 400 })
      if (terms.has(termKey)) return Response.json({ error: `O CSV repete o vocabulário "${entry.hanzi}" (${entry.type}).` }, { status: 400 })
      ids.add(entry.id)
      terms.add(termKey)
    }

    const { results: storedVocabulary } = await env.DB.prepare('SELECT id, type, hanzi FROM chinese_vocabulary_catalog').all<StoredChineseVocabulary>()
    const storedById = new Map(storedVocabulary.map((stored) => [stored.id, stored]))
    const storedByTerm = new Map(storedVocabulary.map((stored) => [`${stored.type}\u0000${stored.hanzi}`, stored]))
    const catalog = validEntries.map((entry) => ({ entry, existing: [storedById.get(entry.id), storedByTerm.get(`${entry.type}\u0000${entry.hanzi}`)].filter((stored): stored is StoredChineseVocabulary => Boolean(stored)) }))
    const changedIdentity = catalog.find(({ entry, existing }) => existing.some((stored) => stored.id === entry.id && (stored.type !== entry.type || stored.hanzi !== entry.hanzi)))
    if (changedIdentity) return Response.json({ error: `O id "${changedIdentity.entry.id}" já pertence a outro vocabulário. Use um novo id.` }, { status: 400 })

    const now = new Date().toISOString()
    let created = 0
    let updated = 0
    let skippedDuplicates = 0
    const statements: D1PreparedStatement[] = []
    for (const { entry, existing } of catalog) {
      const sameId = existing.some((stored) => stored.id === entry.id)
      const sameTermWithOtherId = existing.some((stored) => stored.id !== entry.id && stored.type === entry.type && stored.hanzi === entry.hanzi)
      if (sameTermWithOtherId) {
        skippedDuplicates += 1
        continue
      }
      statements.push(env.DB.prepare(
        `INSERT INTO chinese_vocabulary_catalog (id, type, hanzi, pinyin, english, portuguese, hsk_level)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET type = excluded.type, hanzi = excluded.hanzi, pinyin = excluded.pinyin,
           english = excluded.english, portuguese = excluded.portuguese, hsk_level = excluded.hsk_level`,
      ).bind(entry.id, entry.type, entry.hanzi, entry.pinyin, entry.english, entry.portuguese, entry.hsk_level))
      if (sameId) updated += 1
      else created += 1
    }
    try {
      if (statements.length) await env.DB.batch(statements)
    } catch (cause) {
      console.error('Vocabulary import failed', cause)
      return Response.json({ error: cause instanceof Error ? cause.message : 'Não foi possível salvar o vocabulário.' }, { status: 500 })
    }
    return Response.json({ received: validEntries.length, imported: created + updated, created, updated, skipped_duplicates: skippedDuplicates, imported_at: now })
  } catch (cause) {
    console.error('Vocabulary import request failed', cause)
    return Response.json({ error: 'Não foi possível importar o vocabulário.' }, { status: 500 })
  }
  }

  if (url.pathname === '/api/chinese/curation' && request.method === 'GET') {
    const { results } = await env.DB.prepare(curationTermQuery).all<CurationTerm>()
    const terms = results.map((term) => ({ ...term, occurrences: Number(term.occurrences), reading_count: Number(term.reading_count) }))
    const unseen = terms.filter((term) => term.occurrences === 0)
    const lowExposure = terms.filter((term) => term.occurrences > 0 && term.occurrences <= 2).sort((a, b) => a.occurrences - b.occurrences || a.hsk_level.localeCompare(b.hsk_level)).slice(0, 12)
    const recurring = terms.filter((term) => term.occurrences > 0).sort((a, b) => b.occurrences - a.occurrences || a.hsk_level.localeCompare(b.hsk_level)).slice(0, 12)
    return Response.json({ summary: { total_terms: terms.length, used_terms: terms.length - unseen.length, unseen_terms: unseen.length }, unseen: unseen.slice(0, 12), low_exposure: lowExposure, recurring })
  }

  if (url.pathname === '/api/chinese/curation/export.csv' && request.method === 'GET') {
    const { results } = await env.DB.prepare(curationTermQuery).all<CurationTerm>()
    const rows = results.map((term) => [term.hanzi, term.pinyin, term.portuguese, term.hsk_level, Number(term.occurrences), Number(term.reading_count)].map(csvCell).join(',')).join('\n')
    return new Response(`\uFEFFhanzi,pinyin,portuguese,hsk_level,occurrences,readings\n${rows}`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="orbe-curadoria-chines.csv"' } })
  }

  return null
}
