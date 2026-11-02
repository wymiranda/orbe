/**
 * Approved HSK sentences owned by the Chinese domain, stored in the Chinese
 * workspace database (table `chinese_sentences`).
 *
 * Games read these sentences through this contract (or through
 * GET /api/chinese/sentences on the client) instead of keeping their own copy.
 * Game-specific rules such as bonus chains and scoring stay in each game; the
 * sentence game's mission prompt and bonus rule key are stored with the sentence
 * so the catalogue can be managed in one place.
 */
export type ChineseSentenceLevel = '1' | '2' | '3' | '4' | '5' | '6'
export type ChineseSentenceDifficulty = 'easy' | 'medium' | 'hard' | 'brutal'
export type ChineseSentenceForm = 'question' | 'negative' | 'time-place' | 'expansion'
export type ChineseSentenceOpportunity = 'want' | 'at' | 'like'
export type ChineseSentenceStatus = 'active' | 'inactive'
/** Public shape of GET /api/chinese/sentences. */
export type ChineseSentence = {
  id: string
  level: ChineseSentenceLevel
  difficulty: ChineseSentenceDifficulty
  /** Catalogue words in order, including the final punctuation. */
  tokens: string[]
  translation?: string
  form?: ChineseSentenceForm
}
/** A sentence with everything the catalogue stores about it. */
export type StoredChineseSentence = ChineseSentence & {
  mission: string | null
  opportunity: ChineseSentenceOpportunity | null
  status: ChineseSentenceStatus
  position: number
}

type SentenceRow = { id: string; hsk_level: ChineseSentenceLevel; difficulty: ChineseSentenceDifficulty; tokens_json: string; translation: string | null; form: ChineseSentenceForm | null; mission: string | null; opportunity: ChineseSentenceOpportunity | null; status: ChineseSentenceStatus; position: number }

function parseTokens(json: string) {
  try {
    const tokens = JSON.parse(json) as unknown
    return Array.isArray(tokens) && tokens.length && tokens.every((token) => typeof token === 'string' && token) ? tokens as string[] : null
  } catch { return null }
}

/** Sentences in catalogue order; only active ones unless asked otherwise. A malformed row is skipped, never served. */
export async function loadChineseSentences(db: D1Database, options: { includeInactive?: boolean } = {}): Promise<StoredChineseSentence[]> {
  const { results } = await db.prepare(`SELECT id, hsk_level, difficulty, tokens_json, translation, form, mission, opportunity, status, position FROM chinese_sentences ${options.includeInactive ? '' : "WHERE status = 'active' "}ORDER BY position, id`).all<SentenceRow>()
  return results.flatMap((row) => {
    const tokens = parseTokens(row.tokens_json)
    if (!tokens) return []
    return [{ id: row.id, level: row.hsk_level, difficulty: row.difficulty, tokens, ...(row.translation ? { translation: row.translation } : {}), ...(row.form ? { form: row.form } : {}), mission: row.mission, opportunity: row.opportunity, status: row.status, position: row.position }]
  })
}

/** The public contract: the fields every game may rely on. */
export function publicSentence(sentence: StoredChineseSentence): ChineseSentence {
  return { id: sentence.id, level: sentence.level, difficulty: sentence.difficulty, tokens: sentence.tokens, ...(sentence.translation ? { translation: sentence.translation } : {}), ...(sentence.form ? { form: sentence.form } : {}) }
}
