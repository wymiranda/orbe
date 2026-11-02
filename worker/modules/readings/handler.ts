export type ReadingSummary = {
  id: string
  title: string
  category: string | null
  cover_url: string | null
  created_at: string
  chapter_count: number
  tags: string[]
}

type ChapterLine = {
  id: string
  position: number
  top_text: string | null
  text: string
  bottom_text: string | null
  terms: ChapterLineTerm[]
  kind?: 'reading' | 'curiosity'
  curiosity_title?: string | null
  curiosity_text?: string | null
  curiosity_image_url?: string | null
}

type ChapterLineTerm = {
  vocabulary_id: string
  start_index: number
  length: number
  hanzi: string
  pinyin: string
  english: string
  portuguese: string
  hsk_level: string
}

type Chapter = {
  id: string
  position: number
  title: string
  content: string
  layout: 'plain' | 'layered'
  lines: ChapterLine[]
}

type ChapterSummary = Pick<Chapter, 'id' | 'position' | 'title' | 'layout'>

export type ReadingsEnv = { DB: D1Database }

type ParsedTerm = Pick<ChapterLineTerm, 'vocabulary_id' | 'start_index' | 'length'> & { hanzi: string }
type ParsedChapterLine = Omit<ChapterLine, 'id' | 'position' | 'terms'> & { terms: ParsedTerm[]; forcedTerms: ParsedTerm[] }
type CuriosityContent = { title: string; text: string; image_url: string | null }

const curiosityPrefix = '__niorb_curiosity__:'
const legacyCuriosityPrefix = '__orbe_curiosity__:'
const maxChapterCharacters = 60_000
const maxChapterLines = 1_000
const maxTags = 20

function serializeCuriosity(content: CuriosityContent) {
  return `${curiosityPrefix}${JSON.stringify(content)}`
}

function parseCuriosity(text: string): CuriosityContent | null {
  const prefix = text.startsWith(curiosityPrefix)
    ? curiosityPrefix
    : text.startsWith(legacyCuriosityPrefix)
      ? legacyCuriosityPrefix
      : null
  if (!prefix) return null
  try {
    const content = JSON.parse(text.slice(prefix.length)) as Partial<CuriosityContent>
    return typeof content.title === 'string' && typeof content.text === 'string' && (typeof content.image_url === 'string' || content.image_url === null)
      ? { title: content.title, text: content.text, image_url: content.image_url }
      : null
  } catch { return null }
}

function coverUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch { return null }
}

function cachedJson(request: Request, body: unknown, revision: string) {
  const etag = `"${revision}"`
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'private, max-age=0, must-revalidate' } })
  return Response.json(body, { headers: { ETag: etag, 'Cache-Control': 'private, max-age=0, must-revalidate' } })
}

function parseAnnotatedText(text: string): { text: string; terms: ParsedTerm[] } | null {
  const marker = /\{\{([^{}|]+)(?:\|([^{}|]+))?\}\}/g
  const terms: ParsedTerm[] = []
  let cleanText = ''
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = marker.exec(text)) !== null) {
    const before = text.slice(cursor, match.index)
    if (before.includes('{') || before.includes('}')) return null
    const hanzi = match[1]
    if (!hanzi.trim()) return null
    cleanText += before
    terms.push({ vocabulary_id: match[2] ?? hanzi, start_index: cleanText.length, length: hanzi.length, hanzi })
    cleanText += hanzi
    cursor = marker.lastIndex
  }
  const remaining = text.slice(cursor)
  if (remaining.includes('{') || remaining.includes('}')) return null
  cleanText += remaining
  return { text: cleanText, terms }
}

function parseLayeredContent(content: string): ParsedChapterLine[] | null {
  const blocks = content.trim().split(/\n\s*\n/).filter(Boolean)
  const lines: Array<ParsedChapterLine | null> = blocks.map((block) => {
    const fields: { top_text: string | null; text: string | null; bottom_text: string | null; curiosity_title: string | null; curiosity_text: string | null; curiosity_image_url: string | null } = { top_text: null, text: null, bottom_text: null, curiosity_title: null, curiosity_text: null, curiosity_image_url: null }
    for (const sourceLine of block.split('\n')) {
      const match = sourceLine.match(/^\s*(above|text|below|curiosity-title|curiosity-text|curiosity-image)\s*:\s*(.+?)\s*$/i)
      if (!match) return null
      const field = match[1].toLocaleLowerCase()
      const key = field === 'above' ? 'top_text' : field === 'below' ? 'bottom_text' : field === 'curiosity-title' ? 'curiosity_title' : field === 'curiosity-text' ? 'curiosity_text' : field === 'curiosity-image' ? 'curiosity_image_url' : 'text'
      if (fields[key] !== null) return null
      fields[key] = match[2]
    }
    if (fields.curiosity_text !== null || fields.curiosity_title !== null || fields.curiosity_image_url !== null) {
      if (fields.top_text !== null || fields.text !== null || fields.bottom_text !== null || !fields.curiosity_text) return null
      const imageUrl = fields.curiosity_image_url ? coverUrl(fields.curiosity_image_url) : null
      if (fields.curiosity_image_url && !imageUrl) return null
      return { kind: 'curiosity' as const, top_text: null, text: serializeCuriosity({ title: fields.curiosity_title || 'Você sabia?', text: fields.curiosity_text, image_url: imageUrl }), bottom_text: null, terms: [], forcedTerms: [], curiosity_title: fields.curiosity_title || 'Você sabia?', curiosity_text: fields.curiosity_text, curiosity_image_url: imageUrl }
    }
    const parsedText = fields.text ? parseAnnotatedText(fields.text) : null
    return parsedText ? { kind: 'reading' as const, top_text: fields.top_text, text: parsedText.text, bottom_text: fields.bottom_text, terms: parsedText.terms, forcedTerms: parsedText.terms } : null
  })
  return lines.every((line): line is ParsedChapterLine => line !== null) ? lines : null
}

function serializedAnnotatedText(text: string, forcedTerms: ParsedTerm[]) {
  let serialized = ''
  let cursor = 0
  for (const term of [...forcedTerms].sort((a, b) => a.start_index - b.start_index)) {
    if (term.start_index < cursor) continue
    serialized += text.slice(cursor, term.start_index)
    serialized += `{{${text.slice(term.start_index, term.start_index + term.length)}}}`
    cursor = term.start_index + term.length
  }
  return serialized + text.slice(cursor)
}

function serializedLayeredContent(lines: ParsedChapterLine[]) {
  return lines.map((line) => line.kind === 'curiosity'
    ? [
        `curiosity-title: ${line.curiosity_title || 'Você sabia?'}`,
        `curiosity-text: ${line.curiosity_text || ''}`,
        line.curiosity_image_url ? `curiosity-image: ${line.curiosity_image_url}` : null,
      ].filter((value): value is string => value !== null).join('\n')
    : [
        line.top_text ? `above: ${line.top_text}` : null,
        `text: ${serializedAnnotatedText(line.text, line.forcedTerms)}`,
        line.bottom_text ? `below: ${line.bottom_text}` : null,
      ].filter((value): value is string => value !== null).join('\n')).join('\n\n')
}

async function resolveTerms(lines: ParsedChapterLine[], env: ReadingsEnv): Promise<string[]> {
  const { results: catalog } = await env.DB.prepare('SELECT id, hanzi FROM chinese_vocabulary_catalog ORDER BY length(hanzi) DESC, id ASC').all<{ id: string; hanzi: string }>()
  const catalogByFirstCharacter = new Map<string, { id: string; hanzi: string }[]>()
  for (const entry of catalog) {
    const firstCharacter = entry.hanzi[0]
    catalogByFirstCharacter.set(firstCharacter, [...(catalogByFirstCharacter.get(firstCharacter) ?? []), entry])
  }
  const requestedUnknown = new Set<string>()
  const unreferencedHan = new Set<string>()

  for (const line of lines) {
    if (line.kind === 'curiosity') continue
    const forcedByStart = new Map(line.forcedTerms.map((term) => [term.start_index, term]))
    for (const term of line.forcedTerms) if (!(catalogByFirstCharacter.get(term.hanzi[0]) ?? []).some((entry) => entry.hanzi === term.hanzi)) requestedUnknown.add(term.hanzi)
    const terms: ParsedTerm[] = []
    for (let index = 0; index < line.text.length;) {
      const forced = forcedByStart.get(index)
      const candidates = catalogByFirstCharacter.get((forced?.hanzi ?? line.text[index])) ?? []
      const entry = forced
        ? candidates.find((candidate) => candidate.hanzi === forced.hanzi)
        : candidates.find((candidate) => line.text.startsWith(candidate.hanzi, index))
      if (entry) {
        terms.push({ vocabulary_id: entry.id, start_index: index, length: entry.hanzi.length, hanzi: entry.hanzi })
        index += entry.hanzi.length
      } else {
        if (forced) {
          index += forced.length
          continue
        }
        if (/[一-龥]/.test(line.text[index])) unreferencedHan.add(line.text[index])
        index += 1
      }
    }
    line.terms = terms
  }

  const warnings: string[] = []
  if (requestedUnknown.size) warnings.push(`Sem referência no catálogo: ${[...requestedUnknown].join(', ')}. Elas foram salvas como texto normal.`)
  if (unreferencedHan.size) warnings.push(`Caracteres sem referência no catálogo: ${[...unreferencedHan].join(', ')}. Eles foram salvos como texto normal.`)
  return warnings
}

async function loadChapter(readingId: string, chapterId: string, env: ReadingsEnv): Promise<Chapter | null> {
  const chapter = await env.DB.prepare('SELECT id, position, title, content, layout, updated_at FROM chapters WHERE id = ? AND reading_id = ?')
    .bind(chapterId, readingId).first<Omit<Chapter, 'lines'> & { updated_at: string }>()
  if (!chapter) return null

  const [lineResult, termResult] = await Promise.all([
    env.DB.prepare(`SELECT id, position, top_text, text, bottom_text FROM chapter_lines
      WHERE chapter_id = ? ORDER BY position ASC`).bind(chapterId).all<Omit<ChapterLine, 'terms'>>(),
    env.DB.prepare(`SELECT terms.chapter_line_id, terms.start_index, terms.length,
        catalog.id AS vocabulary_id, catalog.hanzi, catalog.pinyin, catalog.english, catalog.portuguese, catalog.hsk_level
      FROM chinese_chapter_line_terms AS terms
      JOIN chinese_vocabulary_catalog AS catalog ON catalog.id = terms.vocabulary_id
      JOIN chapter_lines AS lines ON lines.id = terms.chapter_line_id
      WHERE lines.chapter_id = ? ORDER BY terms.chapter_line_id, terms.start_index ASC`).bind(chapterId).all<ChapterLineTerm & { chapter_line_id: string }>(),
  ])
  const termsByLine = new Map<string, ChapterLineTerm[]>()
  for (const { chapter_line_id, ...term } of termResult.results) termsByLine.set(chapter_line_id, [...(termsByLine.get(chapter_line_id) ?? []), term])
  return {
    ...chapter,
    lines: lineResult.results.map((line) => {
      const curiosity = parseCuriosity(line.text)
      if (curiosity) return { ...line, kind: 'curiosity' as const, curiosity_title: curiosity.title, curiosity_text: curiosity.text, curiosity_image_url: curiosity.image_url, terms: [] }
      return { ...line, kind: 'reading' as const, terms: termsByLine.get(line.id) ?? [] }
    }),
  }
}

export async function handleReadingsRequest(request: Request, env: ReadingsEnv): Promise<Response | null> {
    const url = new URL(request.url)

    if (url.pathname === '/api/readings' && request.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT readings.id, readings.title, readings.category, readings.cover_url, readings.created_at,
          (SELECT COUNT(*) FROM chapters WHERE chapters.reading_id = readings.id) AS chapter_count
         FROM readings ORDER BY readings.updated_at DESC`,
      ).all<Omit<ReadingSummary, 'tags'>>()
      const { results: tagRows } = await env.DB.prepare(
        `SELECT reading_tags.reading_id, tags.name FROM reading_tags
         JOIN tags ON tags.id = reading_tags.tag_id ORDER BY tags.name COLLATE NOCASE`,
      ).all<{ reading_id: string; name: string }>().catch(() => ({ results: [] as { reading_id: string; name: string }[] }))
      const tagsByReading = new Map<string, string[]>()
      for (const tag of tagRows) tagsByReading.set(tag.reading_id, [...(tagsByReading.get(tag.reading_id) ?? []), tag.name])
      return Response.json(results.map((reading) => ({ ...reading, tags: tagsByReading.get(reading.id) ?? [] })))
    }

    if (url.pathname === '/api/readings' && request.method === 'POST') {
      const body = await request.json<{ readingId?: unknown; title?: unknown; category?: unknown; coverUrl?: unknown; tags?: unknown; chapterTitle?: unknown; content?: unknown; layout?: unknown }>()
      const readingId = typeof body.readingId === 'string' ? body.readingId : ''
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      const category = typeof body.category === 'string' ? body.category.trim() : ''
      const readingCoverUrl = coverUrl(body.coverUrl)
      const tags = Array.isArray(body.tags)
        ? [...new Set(body.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim().replace(/\s+/g, ' ').toLocaleLowerCase()).filter(Boolean))]
        : []
      const chapterTitle = typeof body.chapterTitle === 'string' ? body.chapterTitle.trim() : ''
      const content = typeof body.content === 'string' ? body.content.trim() : ''
      const layout = body.layout === 'layered' ? 'layered' : 'plain'
      const layeredLines = layout === 'layered' ? parseLayeredContent(content) : null
      if (content.length > maxChapterCharacters || (layeredLines && layeredLines.length > maxChapterLines)) return Response.json({ error: 'O capítulo excede o limite de tamanho.' }, { status: 400 })
      if (tags.length > maxTags) return Response.json({ error: 'Use no máximo 20 tags.' }, { status: 400 })
      if (!content) return Response.json({ error: 'O texto é obrigatório.' }, { status: 400 })
      if (layout === 'layered' && !layeredLines) return Response.json({ error: 'Use blocos com "text:" e, opcionalmente, "above:" e "below:".' }, { status: 400 })
      const vocabularyWarnings = layeredLines ? await resolveTerms(layeredLines, env) : []
      const storedContent = layeredLines ? serializedLayeredContent(layeredLines) : content

      const now = new Date().toISOString()
      const existingReading = readingId
        ? await env.DB.prepare('SELECT id, title, category, cover_url FROM readings WHERE id = ?').bind(readingId).first<{ id: string; title: string; category: string | null; cover_url: string | null }>()
        : null
      if (readingId && !existingReading) return Response.json({ error: 'A leitura escolhida não existe.' }, { status: 404 })

      const id = existingReading?.id ?? crypto.randomUUID()
      const readingTitle = (existingReading?.title ?? title) || 'Sem título'
      const chapterCount = existingReading
        ? await env.DB.prepare('SELECT COUNT(*) AS count FROM chapters WHERE reading_id = ?').bind(id).first<{ count: number }>()
        : null
      const nextPosition = chapterCount ? chapterCount.count + 1 : 1
      const chapterId = crypto.randomUUID()
      const statements = [
        ...(!existingReading ? [
          env.DB.prepare('INSERT INTO readings (id, title, category, cover_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, readingTitle, category || null, readingCoverUrl, now, now),
          ...tags.flatMap((tag) => [
            env.DB.prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(name) DO NOTHING').bind(crypto.randomUUID(), tag, now),
            env.DB.prepare('INSERT OR IGNORE INTO reading_tags (reading_id, tag_id) SELECT ?, id FROM tags WHERE name = ? COLLATE NOCASE').bind(id, tag),
          ]),
        ] : []),
        env.DB.prepare('INSERT INTO chapters (id, reading_id, position, title, content, layout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(chapterId, id, nextPosition, chapterTitle || `Capítulo ${nextPosition}`, storedContent, layout, now, now),
        ...(layeredLines ?? []).flatMap((line, index) => {
          const lineId = crypto.randomUUID()
          return [
            env.DB.prepare('INSERT INTO chapter_lines (id, chapter_id, position, top_text, text, bottom_text) VALUES (?, ?, ?, ?, ?, ?)').bind(lineId, chapterId, index + 1, line.top_text, line.text, line.bottom_text),
            ...line.terms.map((term) => env.DB.prepare('INSERT INTO chinese_chapter_line_terms (id, chapter_line_id, vocabulary_id, start_index, length, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), lineId, term.vocabulary_id, term.start_index, term.length, now)),
          ]
        }),
        env.DB.prepare('UPDATE readings SET updated_at = ? WHERE id = ?').bind(now, id),
      ]
      await env.DB.batch(statements)
      const { results: savedTags } = await env.DB.prepare(
        `SELECT tags.name FROM reading_tags JOIN tags ON tags.id = reading_tags.tag_id
         WHERE reading_tags.reading_id = ? ORDER BY tags.name COLLATE NOCASE`,
      ).bind(id).all<{ name: string }>()
      return Response.json({ id, title: readingTitle, category: (existingReading?.category ?? category) || null, cover_url: existingReading?.cover_url ?? readingCoverUrl, tags: savedTags.map((tag) => tag.name), created_at: now, chapter_count: nextPosition, warnings: vocabularyWarnings }, { status: 201 })
    }

    const chapterMatch = url.pathname.match(/^\/api\/chapters\/([^/]+)$/)
    if (chapterMatch && request.method === 'PATCH') {
      const chapterId = decodeURIComponent(chapterMatch[1])
      const body = await request.json<{ title?: unknown; content?: unknown; layout?: unknown }>()
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      const content = typeof body.content === 'string' ? body.content.trim() : ''
      const layout = body.layout === 'layered' ? 'layered' : 'plain'
      const chapter = await env.DB.prepare('SELECT id, reading_id, position, title FROM chapters WHERE id = ?').bind(chapterId).first<{ id: string; reading_id: string; position: number; title: string }>()
      if (!chapter) return Response.json({ error: 'Capítulo não encontrado.' }, { status: 404 })
      if (!content) return Response.json({ error: 'O texto é obrigatório.' }, { status: 400 })
      const layeredLines = layout === 'layered' ? parseLayeredContent(content) : null
      if (content.length > maxChapterCharacters || (layeredLines && layeredLines.length > maxChapterLines)) return Response.json({ error: 'O capítulo excede o limite de tamanho.' }, { status: 400 })
      if (layout === 'layered' && !layeredLines) return Response.json({ error: 'Use blocos com "text:" e, opcionalmente, "above:" e "below:".' }, { status: 400 })
      const vocabularyWarnings = layeredLines ? await resolveTerms(layeredLines, env) : []
      const storedContent = layeredLines ? serializedLayeredContent(layeredLines) : content

      const now = new Date().toISOString()
      const statements = [
        env.DB.prepare('DELETE FROM chinese_chapter_line_terms WHERE chapter_line_id IN (SELECT id FROM chapter_lines WHERE chapter_id = ?)').bind(chapterId),
        env.DB.prepare('DELETE FROM chapter_lines WHERE chapter_id = ?').bind(chapterId),
        env.DB.prepare('UPDATE chapters SET title = ?, content = ?, layout = ?, updated_at = ? WHERE id = ?')
          .bind(title || chapter.title, storedContent, layout, now, chapterId),
        ...(layeredLines ?? []).flatMap((line, index) => {
          const lineId = crypto.randomUUID()
          return [
            env.DB.prepare('INSERT INTO chapter_lines (id, chapter_id, position, top_text, text, bottom_text) VALUES (?, ?, ?, ?, ?, ?)')
              .bind(lineId, chapterId, index + 1, line.top_text, line.text, line.bottom_text),
            ...line.terms.map((term) => env.DB.prepare('INSERT INTO chinese_chapter_line_terms (id, chapter_line_id, vocabulary_id, start_index, length, created_at) VALUES (?, ?, ?, ?, ?, ?)')
              .bind(crypto.randomUUID(), lineId, term.vocabulary_id, term.start_index, term.length, now)),
          ]
        }),
        env.DB.prepare('UPDATE readings SET updated_at = ? WHERE id = ?').bind(now, chapter.reading_id),
      ]
      await env.DB.batch(statements)
      return Response.json({ id: chapterId, title: title || chapter.title, layout, content: storedContent, warnings: vocabularyWarnings })
    }

    const readingUpdateMatch = url.pathname.match(/^\/api\/readings\/([^/]+)$/)
    if (readingUpdateMatch && request.method === 'PATCH') {
      const id = decodeURIComponent(readingUpdateMatch[1])
      const body = await request.json<{ title?: unknown; category?: unknown; coverUrl?: unknown; tags?: unknown }>()
      const reading = await env.DB.prepare('SELECT id, title, cover_url, created_at FROM readings WHERE id = ?').bind(id).first<{ id: string; title: string; cover_url: string | null; created_at: string }>()
      if (!reading) return Response.json({ error: 'Leitura não encontrada.' }, { status: 404 })
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      const category = typeof body.category === 'string' ? body.category.trim() : ''
      const readingCoverUrl = coverUrl(body.coverUrl)
      const tags = Array.isArray(body.tags)
        ? [...new Set(body.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim().replace(/\s+/g, ' ').toLocaleLowerCase()).filter(Boolean))]
        : []
      if (tags.length > maxTags) return Response.json({ error: 'Use no máximo 20 tags.' }, { status: 400 })
      const now = new Date().toISOString()
      await env.DB.prepare('UPDATE readings SET title = ?, category = ?, cover_url = ?, updated_at = ? WHERE id = ?').bind(title || reading.title, category || null, readingCoverUrl, now, id).run()
      await env.DB.prepare('DELETE FROM reading_tags WHERE reading_id = ?').bind(id).run()
      for (const tag of tags) {
        await env.DB.prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(name) DO NOTHING').bind(crypto.randomUUID(), tag, now).run()
        const savedTag = await env.DB.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE').bind(tag).first<{ id: string }>()
        if (savedTag) await env.DB.prepare('INSERT OR IGNORE INTO reading_tags (reading_id, tag_id) VALUES (?, ?)').bind(id, savedTag.id).run()
      }
      const chapterCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM chapters WHERE reading_id = ?').bind(id).first<{ count: number }>()
      return Response.json({ id, title: title || reading.title, category: category || null, cover_url: readingCoverUrl, tags, created_at: reading.created_at, chapter_count: chapterCount?.count ?? 0 })
    }

    if (readingUpdateMatch && request.method === 'DELETE') {
      const id = decodeURIComponent(readingUpdateMatch[1])
      const reading = await env.DB.prepare('SELECT id FROM readings WHERE id = ?').bind(id).first<{ id: string }>()
      if (!reading) return Response.json({ error: 'Leitura não encontrada.' }, { status: 404 })
      await env.DB.batch([
        env.DB.prepare('DELETE FROM chinese_chapter_line_terms WHERE chapter_line_id IN (SELECT chapter_lines.id FROM chapter_lines JOIN chapters ON chapters.id = chapter_lines.chapter_id WHERE chapters.reading_id = ?)').bind(id),
        env.DB.prepare('DELETE FROM chapter_lines WHERE chapter_id IN (SELECT id FROM chapters WHERE reading_id = ?)').bind(id),
        env.DB.prepare('DELETE FROM chapters WHERE reading_id = ?').bind(id),
        env.DB.prepare('DELETE FROM reading_tags WHERE reading_id = ?').bind(id),
        env.DB.prepare('DELETE FROM readings WHERE id = ?').bind(id),
      ])
      return new Response(null, { status: 204 })
    }

    const chapterDeleteMatch = url.pathname.match(/^\/api\/chapters\/([^/]+)$/)
    if (chapterDeleteMatch && request.method === 'DELETE') {
      const chapterId = decodeURIComponent(chapterDeleteMatch[1])
      const chapter = await env.DB.prepare('SELECT id, reading_id FROM chapters WHERE id = ?').bind(chapterId).first<{ id: string; reading_id: string }>()
      if (!chapter) return Response.json({ error: 'Capitulo nao encontrado.' }, { status: 404 })
      const remaining = await env.DB.prepare('SELECT COUNT(*) AS count FROM chapters WHERE reading_id = ?').bind(chapter.reading_id).first<{ count: number }>()
      if ((remaining?.count ?? 0) <= 1) return Response.json({ error: 'Uma leitura precisa manter ao menos um capitulo.' }, { status: 400 })
      const now = new Date().toISOString()
      await env.DB.batch([
        env.DB.prepare('DELETE FROM chinese_chapter_line_terms WHERE chapter_line_id IN (SELECT id FROM chapter_lines WHERE chapter_id = ?)').bind(chapterId),
        env.DB.prepare('DELETE FROM chapter_lines WHERE chapter_id = ?').bind(chapterId),
        env.DB.prepare('DELETE FROM chapters WHERE id = ?').bind(chapterId),
        env.DB.prepare('UPDATE readings SET updated_at = ? WHERE id = ?').bind(now, chapter.reading_id),
      ])
      return new Response(null, { status: 204 })
    }

    const readingSummaryMatch = url.pathname.match(/^\/api\/readings\/([^/]+)\/summary$/)
    if (readingSummaryMatch && request.method === 'GET') {
      const id = decodeURIComponent(readingSummaryMatch[1])
      const [reading, chapterResult, tagResult] = await Promise.all([
        env.DB.prepare('SELECT id, title, category, cover_url, updated_at FROM readings WHERE id = ?').bind(id).first<{ id: string; title: string; category: string | null; cover_url: string | null; updated_at: string }>(),
        env.DB.prepare('SELECT id, position, title, layout FROM chapters WHERE reading_id = ? ORDER BY position ASC').bind(id).all<ChapterSummary>(),
        env.DB.prepare(`SELECT tags.name FROM reading_tags JOIN tags ON tags.id = reading_tags.tag_id
          WHERE reading_tags.reading_id = ? ORDER BY tags.name COLLATE NOCASE`).bind(id).all<{ name: string }>(),
      ])
      if (!reading) return Response.json({ error: 'Leitura não encontrada.' }, { status: 404 })
      return cachedJson(request, { ...reading, tags: tagResult.results.map((tag) => tag.name), chapters: chapterResult.results }, reading.updated_at)
    }

    const readingChapterMatch = url.pathname.match(/^\/api\/readings\/([^/]+)\/chapters\/([^/]+)$/)
    if (readingChapterMatch && request.method === 'GET') {
      const readingId = decodeURIComponent(readingChapterMatch[1])
      const chapterId = decodeURIComponent(readingChapterMatch[2])
      const chapter = await loadChapter(readingId, chapterId, env)
      if (!chapter) return Response.json({ error: 'Capítulo não encontrado.' }, { status: 404 })
      return cachedJson(request, chapter, (chapter as Chapter & { updated_at: string }).updated_at)
    }

    const readingMatch = url.pathname.match(/^\/api\/readings\/([^/]+)$/)
    if (readingMatch && request.method === 'GET') {
      const id = decodeURIComponent(readingMatch[1])
      const reading = await env.DB.prepare('SELECT id, title, category, cover_url FROM readings WHERE id = ?').bind(id).first<{ id: string; title: string; category: string | null; cover_url: string | null }>()
      if (!reading) return Response.json({ error: 'Leitura não encontrada.' }, { status: 404 })
      const { results: chapterRows } = await env.DB.prepare('SELECT id, position, title, content, layout FROM chapters WHERE reading_id = ? ORDER BY position ASC')
        .bind(id).all<Omit<Chapter, 'lines'>>()
      const chapters = (await Promise.all(chapterRows.map((chapter) => loadChapter(id, chapter.id, env)))).filter((chapter): chapter is Chapter => chapter !== null)
      const { results: tags } = await env.DB.prepare(
        `SELECT tags.name FROM reading_tags JOIN tags ON tags.id = reading_tags.tag_id
         WHERE reading_tags.reading_id = ? ORDER BY tags.name COLLATE NOCASE`,
      ).bind(id).all<{ name: string }>()
      return Response.json({ ...reading, tags: tags.map((tag) => tag.name), chapters })
    }

    return null
}
