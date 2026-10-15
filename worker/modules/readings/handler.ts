export type ReadingSummary = {
  id: string
  title: string
  category: string | null
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

export type ReadingsEnv = { DB: D1Database }

type ParsedTerm = Pick<ChapterLineTerm, 'vocabulary_id' | 'start_index' | 'length'> & { hanzi: string }
type ParsedChapterLine = Omit<ChapterLine, 'id' | 'position' | 'terms'> & { terms: ParsedTerm[] }

function parseAnnotatedText(text: string): { text: string; terms: ParsedTerm[] } | null {
  const marker = /\{\{([^{}|]+)\|([a-zA-Z0-9][a-zA-Z0-9_-]*)\}\}/g
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
    terms.push({ vocabulary_id: match[2], start_index: cleanText.length, length: hanzi.length, hanzi })
    cleanText += hanzi
    cursor = marker.lastIndex
  }
  const remaining = text.slice(cursor)
  if (remaining.includes('{') || remaining.includes('}')) return null
  cleanText += remaining
  for (let index = 0; index < cleanText.length; index += 1) {
    if (/[一-龥]/.test(cleanText[index]) && !terms.some((term) => index >= term.start_index && index < term.start_index + term.length)) return null
  }
  return { text: cleanText, terms }
}

function parseLayeredContent(content: string): ParsedChapterLine[] | null {
  const blocks = content.trim().split(/\n\s*\n/).filter(Boolean)
  const lines = blocks.map((block) => {
    const fields: { top_text: string | null; text: string | null; bottom_text: string | null } = { top_text: null, text: null, bottom_text: null }
    for (const sourceLine of block.split('\n')) {
      const match = sourceLine.match(/^\s*(above|text|below)\s*:\s*(.+?)\s*$/i)
      if (!match) return null
      const field = match[1].toLocaleLowerCase()
      const key = field === 'above' ? 'top_text' : field === 'below' ? 'bottom_text' : 'text'
      if (fields[key] !== null) return null
      fields[key] = match[2]
    }
    const parsedText = fields.text ? parseAnnotatedText(fields.text) : null
    return parsedText ? { top_text: fields.top_text, text: parsedText.text, bottom_text: fields.bottom_text, terms: parsedText.terms } : null
  })
  return lines.every((line): line is ParsedChapterLine => line !== null) ? lines : null
}

async function validateTerms(lines: ParsedChapterLine[], env: ReadingsEnv): Promise<string | null> {
  const terms = lines.flatMap((line) => line.terms)
  const ids = [...new Set(terms.map((term) => term.vocabulary_id))]
  if (!ids.length) return null
  const entries = await Promise.all(ids.map((id) => env.DB.prepare('SELECT id, hanzi FROM chinese_vocabulary_catalog WHERE id = ?').bind(id).first<{ id: string; hanzi: string }>()))
  const catalog = new Map(entries.filter((entry): entry is { id: string; hanzi: string } => entry !== null).map((entry) => [entry.id, entry.hanzi]))
  for (const term of terms) {
    const hanzi = catalog.get(term.vocabulary_id)
    if (!hanzi) return `O vocabulário "${term.vocabulary_id}" não existe no catálogo.`
    if (hanzi !== term.hanzi) return `"${term.hanzi}" não corresponde ao vocabulário "${term.vocabulary_id}".`
  }
  return null
}

export async function handleReadingsRequest(request: Request, env: ReadingsEnv): Promise<Response | null> {
    const url = new URL(request.url)

    if (url.pathname === '/api/readings' && request.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT readings.id, readings.title, readings.category, readings.created_at,
          (SELECT COUNT(*) FROM chapters WHERE chapters.reading_id = readings.id) AS chapter_count
         FROM readings ORDER BY readings.updated_at DESC`,
      ).all<Omit<ReadingSummary, 'tags'>>()
      const { results: tagRows } = await env.DB.prepare(
        `SELECT reading_tags.reading_id, tags.name FROM reading_tags
         JOIN tags ON tags.id = reading_tags.tag_id ORDER BY tags.name COLLATE NOCASE`,
      ).all<{ reading_id: string; name: string }>()
      const tagsByReading = new Map<string, string[]>()
      for (const tag of tagRows) tagsByReading.set(tag.reading_id, [...(tagsByReading.get(tag.reading_id) ?? []), tag.name])
      return Response.json(results.map((reading) => ({ ...reading, tags: tagsByReading.get(reading.id) ?? [] })))
    }

    if (url.pathname === '/api/readings' && request.method === 'POST') {
      const body = await request.json<{ readingId?: unknown; title?: unknown; category?: unknown; tags?: unknown; chapterTitle?: unknown; content?: unknown; layout?: unknown }>()
      const readingId = typeof body.readingId === 'string' ? body.readingId : ''
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      const category = typeof body.category === 'string' ? body.category.trim() : ''
      const tags = Array.isArray(body.tags)
        ? [...new Set(body.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim().replace(/\s+/g, ' ').toLocaleLowerCase()).filter(Boolean))]
        : []
      const chapterTitle = typeof body.chapterTitle === 'string' ? body.chapterTitle.trim() : ''
      const content = typeof body.content === 'string' ? body.content.trim() : ''
      const layout = body.layout === 'layered' ? 'layered' : 'plain'
      const layeredLines = layout === 'layered' ? parseLayeredContent(content) : null
      if (!content) return Response.json({ error: 'O texto é obrigatório.' }, { status: 400 })
      if (layout === 'layered' && !layeredLines) return Response.json({ error: 'Use blocos com "text:" e, opcionalmente, "above:" e "below:". Todo hanzi em "text:" precisa usar {{hanzi|id-do-catálogo}}.' }, { status: 400 })
      if (layeredLines) {
        const termsError = await validateTerms(layeredLines, env)
        if (termsError) return Response.json({ error: termsError }, { status: 400 })
      }

      const now = new Date().toISOString()
      const existingReading = readingId
        ? await env.DB.prepare('SELECT id, title, category FROM readings WHERE id = ?').bind(readingId).first<{ id: string; title: string; category: string | null }>()
        : null
      if (readingId && !existingReading) return Response.json({ error: 'A leitura escolhida não existe.' }, { status: 404 })

      const id = existingReading?.id ?? crypto.randomUUID()
      const readingTitle = (existingReading?.title ?? title) || 'Sem título'
      const chapterCount = existingReading
        ? await env.DB.prepare('SELECT COUNT(*) AS count FROM chapters WHERE reading_id = ?').bind(id).first<{ count: number }>()
        : null
      const nextPosition = chapterCount ? chapterCount.count + 1 : 1
      if (!existingReading) {
        await env.DB.prepare('INSERT INTO readings (id, title, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, readingTitle, category || null, now, now).run()
        for (const tag of tags) {
          await env.DB.prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(name) DO NOTHING').bind(crypto.randomUUID(), tag, now).run()
          const savedTag = await env.DB.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE').bind(tag).first<{ id: string }>()
          if (savedTag) await env.DB.prepare('INSERT OR IGNORE INTO reading_tags (reading_id, tag_id) VALUES (?, ?)').bind(id, savedTag.id).run()
        }
      }

      const chapterId = crypto.randomUUID()
      await env.DB.prepare('INSERT INTO chapters (id, reading_id, position, title, content, layout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(chapterId, id, nextPosition, chapterTitle || `Capítulo ${nextPosition}`, content, layout, now, now).run()
      if (layeredLines) {
        for (const [index, line] of layeredLines.entries()) {
          const lineId = crypto.randomUUID()
          await env.DB.prepare('INSERT INTO chapter_lines (id, chapter_id, position, top_text, text, bottom_text) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(lineId, chapterId, index + 1, line.top_text, line.text, line.bottom_text).run()
          for (const term of line.terms) {
            await env.DB.prepare('INSERT INTO chinese_chapter_line_terms (id, chapter_line_id, vocabulary_id, start_index, length, created_at) VALUES (?, ?, ?, ?, ?, ?)')
              .bind(crypto.randomUUID(), lineId, term.vocabulary_id, term.start_index, term.length, now).run()
          }
        }
      }
      await env.DB.prepare('UPDATE readings SET updated_at = ? WHERE id = ?').bind(now, id).run()
      const { results: savedTags } = await env.DB.prepare(
        `SELECT tags.name FROM reading_tags JOIN tags ON tags.id = reading_tags.tag_id
         WHERE reading_tags.reading_id = ? ORDER BY tags.name COLLATE NOCASE`,
      ).bind(id).all<{ name: string }>()
      return Response.json({ id, title: readingTitle, category: (existingReading?.category ?? category) || null, tags: savedTags.map((tag) => tag.name), created_at: now, chapter_count: nextPosition }, { status: 201 })
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
      if (layout === 'layered' && !layeredLines) return Response.json({ error: 'Use blocos com "text:" e, opcionalmente, "above:" e "below:". Todo hanzi em "text:" precisa usar {{hanzi|id-do-catálogo}}.' }, { status: 400 })
      if (layeredLines) {
        const termsError = await validateTerms(layeredLines, env)
        if (termsError) return Response.json({ error: termsError }, { status: 400 })
      }

      const now = new Date().toISOString()
      await env.DB.prepare('DELETE FROM chinese_chapter_line_terms WHERE chapter_line_id IN (SELECT id FROM chapter_lines WHERE chapter_id = ?)').bind(chapterId).run()
      await env.DB.prepare('DELETE FROM chapter_lines WHERE chapter_id = ?').bind(chapterId).run()
      await env.DB.prepare('UPDATE chapters SET title = ?, content = ?, layout = ?, updated_at = ? WHERE id = ?')
        .bind(title || chapter.title, content, layout, now, chapterId).run()
      if (layeredLines) {
        for (const [index, line] of layeredLines.entries()) {
          const lineId = crypto.randomUUID()
          await env.DB.prepare('INSERT INTO chapter_lines (id, chapter_id, position, top_text, text, bottom_text) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(lineId, chapterId, index + 1, line.top_text, line.text, line.bottom_text).run()
          for (const term of line.terms) {
            await env.DB.prepare('INSERT INTO chinese_chapter_line_terms (id, chapter_line_id, vocabulary_id, start_index, length, created_at) VALUES (?, ?, ?, ?, ?, ?)')
              .bind(crypto.randomUUID(), lineId, term.vocabulary_id, term.start_index, term.length, now).run()
          }
        }
      }
      await env.DB.prepare('UPDATE readings SET updated_at = ? WHERE id = ?').bind(now, chapter.reading_id).run()
      return Response.json({ id: chapterId, title: title || chapter.title, layout, content })
    }

    const readingUpdateMatch = url.pathname.match(/^\/api\/readings\/([^/]+)$/)
    if (readingUpdateMatch && request.method === 'PATCH') {
      const id = decodeURIComponent(readingUpdateMatch[1])
      const body = await request.json<{ title?: unknown; category?: unknown; tags?: unknown }>()
      const reading = await env.DB.prepare('SELECT id, title, created_at FROM readings WHERE id = ?').bind(id).first<{ id: string; title: string; created_at: string }>()
      if (!reading) return Response.json({ error: 'Leitura não encontrada.' }, { status: 404 })
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      const category = typeof body.category === 'string' ? body.category.trim() : ''
      const tags = Array.isArray(body.tags)
        ? [...new Set(body.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim().replace(/\s+/g, ' ').toLocaleLowerCase()).filter(Boolean))]
        : []
      const now = new Date().toISOString()
      await env.DB.prepare('UPDATE readings SET title = ?, category = ?, updated_at = ? WHERE id = ?').bind(title || reading.title, category || null, now, id).run()
      await env.DB.prepare('DELETE FROM reading_tags WHERE reading_id = ?').bind(id).run()
      for (const tag of tags) {
        await env.DB.prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(name) DO NOTHING').bind(crypto.randomUUID(), tag, now).run()
        const savedTag = await env.DB.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE').bind(tag).first<{ id: string }>()
        if (savedTag) await env.DB.prepare('INSERT OR IGNORE INTO reading_tags (reading_id, tag_id) VALUES (?, ?)').bind(id, savedTag.id).run()
      }
      const chapterCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM chapters WHERE reading_id = ?').bind(id).first<{ count: number }>()
      return Response.json({ id, title: title || reading.title, category: category || null, tags, created_at: reading.created_at, chapter_count: chapterCount?.count ?? 0 })
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

    const readingMatch = url.pathname.match(/^\/api\/readings\/([^/]+)$/)
    if (readingMatch && request.method === 'GET') {
      const id = decodeURIComponent(readingMatch[1])
      const reading = await env.DB.prepare('SELECT id, title, category FROM readings WHERE id = ?').bind(id).first<{ id: string; title: string; category: string | null }>()
      if (!reading) return Response.json({ error: 'Leitura não encontrada.' }, { status: 404 })
      const { results: chapterRows } = await env.DB.prepare('SELECT id, position, title, content, layout FROM chapters WHERE reading_id = ? ORDER BY position ASC')
        .bind(id).all<Omit<Chapter, 'lines'>>()
      const { results: lineRows } = await env.DB.prepare(
        `SELECT chapter_lines.id, chapter_lines.chapter_id, chapter_lines.position, chapter_lines.top_text, chapter_lines.text, chapter_lines.bottom_text
         FROM chapter_lines JOIN chapters ON chapters.id = chapter_lines.chapter_id
         WHERE chapters.reading_id = ? ORDER BY chapter_lines.position ASC`,
      ).bind(id).all<Omit<ChapterLine, 'terms'> & { chapter_id: string }>()
      const linesByChapter = new Map<string, ChapterLine[]>()
      const { results: termRows } = await env.DB.prepare(
        `SELECT chinese_chapter_line_terms.chapter_line_id, chinese_chapter_line_terms.vocabulary_id, chinese_chapter_line_terms.start_index, chinese_chapter_line_terms.length,
          chinese_vocabulary_catalog.hanzi, chinese_vocabulary_catalog.pinyin, chinese_vocabulary_catalog.english, chinese_vocabulary_catalog.portuguese, chinese_vocabulary_catalog.hsk_level
         FROM chinese_chapter_line_terms JOIN chinese_vocabulary_catalog ON chinese_vocabulary_catalog.id = chinese_chapter_line_terms.vocabulary_id
         JOIN chapter_lines ON chapter_lines.id = chinese_chapter_line_terms.chapter_line_id
         JOIN chapters ON chapters.id = chapter_lines.chapter_id
         WHERE chapters.reading_id = ? ORDER BY chinese_chapter_line_terms.start_index ASC`,
      ).bind(id).all<ChapterLineTerm & { chapter_line_id: string }>()
      const termsByLine = new Map<string, ChapterLineTerm[]>()
      for (const term of termRows) {
        const { chapter_line_id, ...chapterLineTerm } = term
        termsByLine.set(chapter_line_id, [...(termsByLine.get(chapter_line_id) ?? []), chapterLineTerm])
      }
      for (const line of lineRows) {
        const { chapter_id, ...chapterLine } = line
        linesByChapter.set(chapter_id, [...(linesByChapter.get(chapter_id) ?? []), { ...chapterLine, terms: termsByLine.get(chapterLine.id) ?? [] }])
      }
      const chapters = chapterRows.map((chapter) => ({ ...chapter, lines: linesByChapter.get(chapter.id) ?? [] }))
      const { results: tags } = await env.DB.prepare(
        `SELECT tags.name FROM reading_tags JOIN tags ON tags.id = reading_tags.tag_id
         WHERE reading_tags.reading_id = ? ORDER BY tags.name COLLATE NOCASE`,
      ).bind(id).all<{ name: string }>()
      return Response.json({ ...reading, tags: tags.map((tag) => tag.name), chapters })
    }

    return null
}
