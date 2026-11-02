import { loadChineseSentences, publicSentence } from './sentence-corpus.js'
type ChineseVocabulary = {
  id: string
  type: 'character' | 'word'
  hanzi: string
  pinyin: string
  english: string
  portuguese: string
  hsk_level: string
  visual_kind: 'emoji' | 'svg' | 'image' | null
  visual_value: string | null
  visual_asset_id?: string | null
}

type StoredChineseVocabulary = Pick<ChineseVocabulary, 'id' | 'type' | 'hanzi'>
type QuizChoice = { id: string; text: string }
type StoredQuizQuestion = { id: string; hsk_level: string; mode: 'recognition' | 'hsk-mock'; question_type: 'single_choice' | 'fill_blank'; prompt: string; choices_json: string; answer_id: string; created_at: string; updated_at: string }
type QuizQuestionInput = { hsk_level?: unknown; mode?: unknown; question_type?: unknown; prompt?: unknown; choices?: unknown; answer_id?: unknown }
type QuizSyntaxInput = { id?: unknown; hsk_level?: unknown; mode?: unknown; type?: unknown; prompt?: unknown; choices?: unknown; answer?: unknown }
type HskMockFormat = 'listening_picture_true_false' | 'listening_picture_choice' | 'listening_dialogue_picture_choice' | 'listening_dialogue_choice' | 'reading_picture_true_false' | 'reading_picture_choice' | 'reading_match' | 'reading_fill_blank' | 'reading_statement_true_false'
type HskMockQuestion = { id: string; hsk_level: '1' | '2'; section: 'listening' | 'reading'; part: number; format: HskMockFormat; definition_json: string; status: 'active' | 'inactive'; position: number; created_at: string; updated_at: string }

export type ChineseEnv = { DB: D1Database; CHINESE_DB: D1Database; MEDIA: R2Bucket }

type VocabularyVisualInput = { kind?: unknown; value?: unknown; assetId?: unknown }

type CurationTerm = { id: string; hanzi: string; pinyin: string; portuguese: string; hsk_level: string; occurrences: number; reading_count: number; learned?: number }

const curationTermQuery = `SELECT chinese_vocabulary_catalog.id, chinese_vocabulary_catalog.hanzi, chinese_vocabulary_catalog.pinyin, chinese_vocabulary_catalog.portuguese, chinese_vocabulary_catalog.hsk_level, COUNT(chinese_chapter_line_terms.id) AS occurrences, COUNT(DISTINCT chapters.reading_id) AS reading_count FROM chinese_vocabulary_catalog LEFT JOIN chinese_chapter_line_terms ON chinese_chapter_line_terms.vocabulary_id = chinese_vocabulary_catalog.id LEFT JOIN chapter_lines ON chapter_lines.id = chinese_chapter_line_terms.chapter_line_id LEFT JOIN chapters ON chapters.id = chapter_lines.chapter_id GROUP BY chinese_vocabulary_catalog.id`

function csvCell(value: string | number) { return `"${String(value).replaceAll('"', '""')}"` }
function validQuizChoices(value: unknown): value is QuizChoice[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 6 && value.every((choice) => typeof choice === 'object' && choice !== null && typeof (choice as QuizChoice).id === 'string' && (choice as QuizChoice).id.trim() && typeof (choice as QuizChoice).text === 'string' && (choice as QuizChoice).text.trim()) && new Set(value.map((choice) => choice.id)).size === value.length
}
function validHskOption(value: unknown): value is { id: string; text?: string; image?: { src: string; alt: string } } {
  if (typeof value !== 'object' || value === null || typeof (value as { id?: unknown }).id !== 'string' || !(value as { id: string }).id.trim()) return false
  const option = value as { text?: unknown; image?: { src?: unknown; alt?: unknown } }
  return Boolean((typeof option.text === 'string' && option.text.trim()) || (typeof option.image?.src === 'string' && option.image.src && typeof option.image.alt === 'string'))
}
function validHskOptions(value: unknown): value is { id: string; text?: string; image?: { src: string; alt: string } }[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 6 && value.every(validHskOption) && new Set(value.map((item) => item.id)).size === value.length
}
function quizQuestionResponse(question: StoredQuizQuestion) {
  let choices: QuizChoice[]
  try { choices = JSON.parse(question.choices_json) as QuizChoice[] } catch { choices = [] }
  return { id: question.id, hsk_level: question.hsk_level, mode: question.mode, question_type: question.question_type, prompt: question.prompt, choices, answer_id: question.answer_id, created_at: question.created_at, updated_at: question.updated_at }
}
function questionFromSyntax(value: unknown): StoredQuizQuestion | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as QuizSyntaxInput
  const hskLevel = typeof input.hsk_level === 'string' ? input.hsk_level.trim() : ''
  const mode = input.mode === 'recognition' || input.mode === 'hsk-mock' ? input.mode : ''
  const questionType = input.type === 'single_choice' || input.type === 'fill_blank' ? input.type : ''
  const prompt = typeof input.prompt === 'object' && input.prompt !== null && typeof (input.prompt as { text?: unknown }).text === 'string' ? (input.prompt as { text: string }).text.trim() : ''
  const answerId = typeof input.answer === 'string' ? input.answer : ''
  if (!hskLevel || !mode || !questionType || !prompt || !validQuizChoices(input.choices) || !input.choices.some((choice) => choice.id === answerId)) return null
  const now = new Date().toISOString()
  return { id: typeof input.id === 'string' && input.id.trim() ? input.id : crypto.randomUUID(), hsk_level: hskLevel, mode, question_type: questionType, prompt, choices_json: JSON.stringify(input.choices.map((choice) => ({ id: choice.id, text: choice.text.trim() }))), answer_id: answerId, created_at: now, updated_at: now }
}

const hskFormatTypes: Record<HskMockFormat, 'true_false' | 'single_choice' | 'match' | 'fill_blank'> = {
  listening_picture_true_false: 'true_false', listening_picture_choice: 'single_choice', listening_dialogue_picture_choice: 'single_choice', listening_dialogue_choice: 'single_choice', reading_picture_true_false: 'true_false', reading_picture_choice: 'single_choice', reading_match: 'match', reading_fill_blank: 'fill_blank', reading_statement_true_false: 'true_false',
}
function hskMockResponse(question: HskMockQuestion) {
  try { return { ...question, definition: JSON.parse(question.definition_json) } } catch { return null }
}
function hskMockFromSyntax(value: unknown): HskMockQuestion | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as Record<string, unknown>
  const level = input.hsk_level === '1' || input.hsk_level === '2' ? input.hsk_level : null
  const section = input.section === 'listening' || input.section === 'reading' ? input.section : null
  const format = typeof input.format === 'string' && input.format in hskFormatTypes ? input.format as HskMockFormat : null
  const part = typeof input.part === 'number' && Number.isInteger(input.part) && input.part >= 1 && input.part <= 4 ? input.part : null
  const definition = typeof input.definition === 'object' && input.definition !== null ? input.definition as Record<string, unknown> : null
  const expectedType = format ? hskFormatTypes[format] : null
  if (!level || !section || !format || !part || !definition || definition.type !== expectedType || typeof definition.id !== 'string' || !definition.id.trim() || typeof definition.prompt !== 'object' || definition.prompt === null || !('answer' in definition)) return null
  if ((expectedType === 'single_choice' || expectedType === 'fill_blank') && (!validHskOptions(definition.choices) || typeof definition.answer !== 'string' || !definition.choices.some((choice) => choice.id === definition.answer))) return null
  if (expectedType === 'true_false' && typeof definition.answer !== 'boolean') return null
  if (expectedType === 'match' && (!Array.isArray(definition.pairs) || !definition.pairs.every(validHskOption) || !validHskOptions(definition.choices) || typeof definition.answer !== 'object' || definition.answer === null)) return null
  const now = new Date().toISOString()
  return { id: typeof input.id === 'string' && input.id.trim() ? input.id : crypto.randomUUID(), hsk_level: level, section, part, format, definition_json: JSON.stringify(definition), status: input.status === 'inactive' ? 'inactive' : 'active', position: typeof input.position === 'number' && Number.isInteger(input.position) ? input.position : 0, created_at: now, updated_at: now }
}

export async function handleChineseRequest(request: Request, env: ChineseEnv): Promise<Response | null> {
  const url = new URL(request.url)

  if (url.pathname === '/api/chinese/hsk-mock-questions' && request.method === 'GET') {
    const level = url.searchParams.get('level')
    const section = url.searchParams.get('section')
    const filters = ["status = 'active'"]
    const bindings: string[] = []
    if (level === '1' || level === '2') { filters.push('hsk_level = ?'); bindings.push(level) }
    if (section === 'listening' || section === 'reading') { filters.push('section = ?'); bindings.push(section) }
    const { results } = await env.DB.prepare(`SELECT id, hsk_level, section, part, format, definition_json, status, position, created_at, updated_at FROM chinese_hsk_mock_questions WHERE ${filters.join(' AND ')} ORDER BY hsk_level, section, part, position, id`).bind(...bindings).all<HskMockQuestion>()
    return Response.json(results.map(hskMockResponse).filter(Boolean))
  }

  if (url.pathname === '/api/chinese/hsk-mock-questions/import' && request.method === 'POST') {
    let body: unknown
    try { body = await request.json() } catch { return Response.json({ error: 'Cole uma questão HSK em JSON válido.' }, { status: 400 }) }
    const values = Array.isArray(body) ? body : [body]
    const questions = values.map(hskMockFromSyntax)
    if (!questions.length || questions.some((question) => question === null)) return Response.json({ error: 'Use nível, seção, parte, formato e uma definição válida do Quiz.' }, { status: 400 })
    const validQuestions = questions as HskMockQuestion[]
    if (new Set(validQuestions.map((question) => question.id)).size !== validQuestions.length) return Response.json({ error: 'Cada questão precisa ter um ID único.' }, { status: 400 })
    await env.DB.batch(validQuestions.map((question) => env.DB.prepare('INSERT INTO chinese_hsk_mock_questions (id, hsk_level, section, part, format, definition_json, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(question.id, question.hsk_level, question.section, question.part, question.format, question.definition_json, question.status, question.position, question.created_at, question.updated_at)))
    return Response.json(validQuestions.map(hskMockResponse), { status: 201 })
  }

  if (url.pathname === '/api/chinese/vocabulary' && request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare(`SELECT vocabulary.id, vocabulary.type, vocabulary.hanzi, vocabulary.pinyin, vocabulary.english, vocabulary.portuguese, vocabulary.hsk_level, vocabulary.visual_kind, CASE WHEN media_asset_links.asset_id IS NOT NULL THEN '/api/media/images/' || media_asset_links.asset_id || '/file' ELSE vocabulary.visual_value END AS visual_value, media_asset_links.asset_id AS visual_asset_id FROM chinese_vocabulary_catalog AS vocabulary LEFT JOIN media_asset_links ON media_asset_links.owner_type = 'chinese_vocabulary_visual' AND media_asset_links.owner_id = vocabulary.id ORDER BY vocabulary.hsk_level, vocabulary.hanzi`).all<ChineseVocabulary>()
      return Response.json(results)
    } catch (cause) {
      // A device can briefly run new client code against a database that has
      // not yet received the additive visual-columns migration. Vocabulary
      // remains usable while the migration is applied.
      if (!(cause instanceof Error) || !cause.message.includes('no such column: visual_kind')) throw cause
      const { results } = await env.DB.prepare('SELECT id, type, hanzi, pinyin, english, portuguese, hsk_level FROM chinese_vocabulary_catalog ORDER BY hsk_level, hanzi').all<Omit<ChineseVocabulary, 'visual_kind' | 'visual_value'>>()
      return Response.json(results.map((term) => ({ ...term, visual_kind: null, visual_value: null })))
    }
  }

  if (url.pathname.startsWith('/api/chinese/vocabulary/') && url.pathname.endsWith('/visual') && request.method === 'PATCH') {
    const id = decodeURIComponent(url.pathname.slice('/api/chinese/vocabulary/'.length, -'/visual'.length))
    let body: VocabularyVisualInput
    try { body = await request.json<VocabularyVisualInput>() } catch { return Response.json({ error: 'Envie a representação visual em JSON válido.' }, { status: 400 }) }
    const kind = body.kind === 'emoji' || body.kind === 'svg' || body.kind === 'image' ? body.kind : null
    const value = typeof body.value === 'string' ? body.value.trim() : ''
    const assetId = typeof body.assetId === 'string' ? body.assetId : ''
    if (!id || (kind && kind !== 'image' && !value) || (!kind && (value || assetId)) || (kind === 'image' && !assetId)) return Response.json({ error: 'Escolha um tipo visual e informe seu valor, ou selecione uma imagem da biblioteca.' }, { status: 400 })
    if (kind === 'emoji' && [...value].length > 32) return Response.json({ error: 'O emoji pode ter no máximo 32 caracteres.' }, { status: 400 })
    if (kind === 'svg' && (value.length > 65_536 || !/^<svg[\s>]/i.test(value) || /<script|<foreignObject|\son\w+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|javascript:)/i.test(value))) return Response.json({ error: 'Use um SVG simples, sem scripts, eventos ou recursos externos.' }, { status: 400 })
    if (kind === 'image') {
      const asset = await env.DB.prepare('SELECT id FROM media_assets WHERE id = ?').bind(assetId).first()
      if (!asset) return Response.json({ error: 'A imagem selecionada não existe mais na biblioteca.' }, { status: 404 })
    }
    const result = await env.DB.prepare('UPDATE chinese_vocabulary_catalog SET visual_kind = ?, visual_value = ? WHERE id = ?').bind(kind, kind === 'image' ? null : kind ? value : null, id).run()
    if (!result.meta.changes) return Response.json({ error: 'Vocabulário não encontrado.' }, { status: 404 })
    await env.DB.prepare("DELETE FROM media_asset_links WHERE owner_type = 'chinese_vocabulary_visual' AND owner_id = ?").bind(id).run()
    if (kind === 'image') await env.DB.prepare('INSERT INTO media_asset_links (asset_id, owner_type, owner_id, created_at) VALUES (?, ?, ?, ?)').bind(assetId, 'chinese_vocabulary_visual', id, new Date().toISOString()).run()
    return Response.json({ id, visual_kind: kind, visual_value: kind === 'image' ? `/api/media/images/${assetId}/file` : kind ? value : null, visual_asset_id: kind === 'image' ? assetId : null })
  }

  if (url.pathname === '/api/chinese/vocabulary/visuals/autofill' && request.method === 'POST') {
    try {
      const { results } = await env.DB.prepare('SELECT id, hanzi FROM chinese_vocabulary_catalog WHERE visual_kind IS NULL OR visual_value IS NULL').all<{ id: string; hanzi: string }>()
      const updates = results.flatMap((term) => {
        const emoji = knownVocabularyEmoji(term.hanzi)
        return emoji ? [env.DB.prepare('UPDATE chinese_vocabulary_catalog SET visual_kind = ?, visual_value = ? WHERE id = ?').bind('emoji', emoji, term.id)] : []
      })
      if (updates.length) await env.DB.batch(updates)
      return Response.json({ updated: updates.length, skipped: results.length - updates.length })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Não foi possível preencher os visuais.'
      return Response.json({ error: message.includes('no such column') ? 'A migração de visuais ainda não foi aplicada neste banco.' : message }, { status: 400 })
    }
  }

  if (url.pathname === '/api/chinese/quiz-questions' && request.method === 'GET') {
    const level = url.searchParams.get('level')
    const mode = url.searchParams.get('mode')
    const filters: string[] = []
    const bindings: string[] = []
    if (level) { filters.push('hsk_level = ?'); bindings.push(level) }
    if (mode === 'recognition' || mode === 'hsk-mock') { filters.push('mode = ?'); bindings.push(mode) }
    const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : ''
    const { results } = await env.DB.prepare(`SELECT id, hsk_level, mode, question_type, prompt, choices_json, answer_id, created_at, updated_at FROM chinese_quiz_questions${where} ORDER BY hsk_level, mode, created_at DESC`).bind(...bindings).all<StoredQuizQuestion>()
    return Response.json(results.map(quizQuestionResponse))
  }

  if (url.pathname === '/api/chinese/quiz-questions/import' && request.method === 'POST') {
    let body: unknown
    try { body = await request.json() } catch { return Response.json({ error: 'Cole uma questão em JSON válido.' }, { status: 400 }) }
    const values = Array.isArray(body) ? body : [body]
    const questions = values.map(questionFromSyntax)
    if (!questions.length || questions.some((question) => question === null)) return Response.json({ error: 'Use a sintaxe de questão com hsk_level, mode, type, prompt.text, choices e answer.' }, { status: 400 })
    const validQuestions = questions as StoredQuizQuestion[]
    if (new Set(validQuestions.map((question) => question.id)).size !== validQuestions.length) return Response.json({ error: 'Cada questão importada precisa ter um id único.' }, { status: 400 })
    try {
      await env.DB.batch(validQuestions.map((question) => env.DB.prepare('INSERT INTO chinese_quiz_questions (id, hsk_level, mode, question_type, prompt, choices_json, answer_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(question.id, question.hsk_level, question.mode, question.question_type, question.prompt, question.choices_json, question.answer_id, question.created_at, question.updated_at)))
    } catch (cause) { return Response.json({ error: cause instanceof Error ? cause.message : 'Não foi possível importar as questões.' }, { status: 400 }) }
    return Response.json(validQuestions.map(quizQuestionResponse), { status: 201 })
  }

  if (url.pathname === '/api/chinese/quiz-questions' && request.method === 'POST') {
    let body: QuizQuestionInput
    try { body = await request.json<QuizQuestionInput>() } catch { return Response.json({ error: 'Envie uma questão em JSON válido.' }, { status: 400 }) }
    const hskLevel = typeof body.hsk_level === 'string' ? body.hsk_level.trim() : ''
    const mode = body.mode === 'recognition' || body.mode === 'hsk-mock' ? body.mode : ''
    const questionType = body.question_type === 'single_choice' || body.question_type === 'fill_blank' ? body.question_type : ''
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    const answerId = typeof body.answer_id === 'string' ? body.answer_id : ''
    if (!hskLevel || !mode || !questionType || !prompt || !validQuizChoices(body.choices) || !body.choices.some((choice) => choice.id === answerId)) return Response.json({ error: 'Preencha nível, modo, tipo, enunciado, alternativas e gabarito corretamente.' }, { status: 400 })
    const now = new Date().toISOString()
    const question: StoredQuizQuestion = { id: crypto.randomUUID(), hsk_level: hskLevel, mode, question_type: questionType, prompt, choices_json: JSON.stringify(body.choices.map((choice) => ({ id: choice.id, text: choice.text.trim() }))), answer_id: answerId, created_at: now, updated_at: now }
    await env.DB.prepare('INSERT INTO chinese_quiz_questions (id, hsk_level, mode, question_type, prompt, choices_json, answer_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(question.id, question.hsk_level, question.mode, question.question_type, question.prompt, question.choices_json, question.answer_id, question.created_at, question.updated_at).run()
    return Response.json(quizQuestionResponse(question), { status: 201 })
  }

  if (url.pathname.startsWith('/api/chinese/quiz-questions/') && request.method === 'DELETE') {
    const id = url.pathname.slice('/api/chinese/quiz-questions/'.length)
    if (!id) return Response.json({ error: 'Questão não encontrada.' }, { status: 404 })
    const result = await env.DB.prepare('DELETE FROM chinese_quiz_questions WHERE id = ?').bind(id).run()
    if (!result.meta.changes) return Response.json({ error: 'Questão não encontrada.' }, { status: 404 })
    return new Response(null, { status: 204 })
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
    if (validEntries.some((entry) => entry.id !== entry.hanzi)) return Response.json({ error: 'O id de cada entrada deve ser exatamente igual ao hanzi.' }, { status: 400 })
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
    const mappedVocabularyIds: string[] = []
    for (const { entry, existing } of catalog) {
      const sameId = existing.some((stored) => stored.id === entry.id)
      const sameTermWithOtherId = existing.some((stored) => stored.id !== entry.id && stored.type === entry.type && stored.hanzi === entry.hanzi)
      if (sameTermWithOtherId) {
        skippedDuplicates += 1
        continue
      }
      const emoji = knownVocabularyEmoji(entry.hanzi)
      statements.push(env.DB.prepare(
        `INSERT INTO chinese_vocabulary_catalog (id, type, hanzi, pinyin, english, portuguese, hsk_level, visual_kind, visual_value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET type = excluded.type, hanzi = excluded.hanzi, pinyin = excluded.pinyin,
           english = excluded.english, portuguese = excluded.portuguese, hsk_level = excluded.hsk_level,
           visual_kind = COALESCE(chinese_vocabulary_catalog.visual_kind, excluded.visual_kind),
           visual_value = COALESCE(chinese_vocabulary_catalog.visual_value, excluded.visual_value)`,
      ).bind(entry.id, entry.type, entry.hanzi, entry.pinyin, entry.english, entry.portuguese, entry.hsk_level, emoji ? 'emoji' : null, emoji))
      mappedVocabularyIds.push(entry.id)
      if (sameId) updated += 1
      else created += 1
    }
    try {
      if (statements.length) await env.DB.batch(statements)
      if (mappedVocabularyIds.length) await env.DB.batch(mappedVocabularyIds.map((id) => env.DB.prepare('INSERT OR IGNORE INTO chinese_vocabulary_study_ids (vocabulary_id) VALUES (?)').bind(id)))
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

  // Shared, read-only sentence catalogue used by the sentence games.
  if (url.pathname === '/api/chinese/sentences' && request.method === 'GET') return Response.json((await loadChineseSentences(env.CHINESE_DB)).map(publicSentence))

  if (url.pathname === '/api/chinese/curation/export.csv' && request.method === 'GET') {
    const { results } = await env.DB.prepare(curationTermQuery).all<CurationTerm>()
    const rows = results.map((term) => [term.hanzi, term.pinyin, term.portuguese, term.hsk_level, Number(term.occurrences), Number(term.reading_count)].map(csvCell).join(',')).join('\n')
    return new Response(`\uFEFFhanzi,pinyin,portuguese,hsk_level,occurrences,readings\n${rows}`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="niorb-curadoria-chines.csv"' } })
  }

  return null
}
import { knownVocabularyEmoji } from './vocabulary-visuals.js'
