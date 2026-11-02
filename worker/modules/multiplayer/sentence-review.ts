import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib'

export type SentenceReview = { grammatical: boolean; natural: boolean; coherent: boolean; meetsMission: boolean | null; translationPt: string | null; reasonPt: string; suggestion: string | null }
export type SentenceReviewOutcome = { review: SentenceReview | null; unavailable: 'daily-limit' | 'unavailable' | null }
type ReviewResponse = { response?: unknown; choices?: { message?: { content?: unknown } }[] }
type CompactReview = { result_flags: number; payload: ArrayBuffer }
type ReviewPayload = { t: string | null; r: string; s: string | null }
const rubricVersion = 1
const brotliOptions = { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }

async function contextHash(mission?: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(mission ?? 'free'))
  return new Uint8Array(digest).slice(0, 16)
}
function reviewFlags(review: SentenceReview) { return (review.grammatical ? 1 : 0) | (review.natural ? 2 : 0) | (review.coherent ? 4 : 0) | (review.meetsMission === true ? 8 : 0) | (review.meetsMission !== null ? 16 : 0) }
function encodeReview(review: SentenceReview) { return brotliCompressSync(new TextEncoder().encode(JSON.stringify({ t: review.translationPt, r: review.reasonPt, s: review.suggestion } satisfies ReviewPayload)), brotliOptions) }
function decodeReview(row: CompactReview): SentenceReview | null {
  try {
    const payload = JSON.parse(new TextDecoder().decode(brotliDecompressSync(new Uint8Array(row.payload)))) as Partial<ReviewPayload>
    if (typeof payload.r !== 'string') return null
    return { grammatical: (row.result_flags & 1) !== 0, natural: (row.result_flags & 2) !== 0, coherent: (row.result_flags & 4) !== 0, meetsMission: (row.result_flags & 16) === 0 ? null : (row.result_flags & 8) !== 0, translationPt: typeof payload.t === 'string' ? payload.t : null, reasonPt: payload.r, suggestion: typeof payload.s === 'string' ? payload.s : null }
  } catch { return null }
}

function parseReview(value: unknown): SentenceReview | null {
  const text = (typeof value === 'string' ? value : JSON.stringify(value)).replace(/<think>[\s\S]*?<\/think>/gi, '')
  const candidates = text.match(/\{[^{}]*\}/g) ?? []
  for (const candidate of candidates.reverse()) try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>
    if (typeof parsed.grammatical !== 'boolean' || typeof parsed.natural !== 'boolean' || typeof parsed.coherent !== 'boolean' || typeof parsed.reason_pt !== 'string') continue
    const meetsMission = parsed.meets_mission === null || typeof parsed.meets_mission === 'boolean' ? parsed.meets_mission : undefined
    if (meetsMission === undefined) continue
    return { grammatical: parsed.grammatical, natural: parsed.natural, coherent: parsed.coherent, meetsMission, translationPt: typeof parsed.translation_pt === 'string' ? parsed.translation_pt : null, reasonPt: parsed.reason_pt, suggestion: typeof parsed.suggestion === 'string' ? parsed.suggestion : null }
  } catch { continue }
  return null
}

export async function reviewChineseSentence(ai: Ai, db: D1Database, sentence: string, mission?: string): Promise<SentenceReviewOutcome> {
  const context = await contextHash(mission)
  try {
    const compact = await db.prepare('SELECT result_flags, payload FROM multiplayer_sentence_review_cache WHERE sentence = ? AND context_hash = ? AND rubric_version = ?').bind(sentence, context, rubricVersion).first<CompactReview>()
    if (compact) { const review = decodeReview(compact); if (review) return { review, unavailable: null } }
  } catch { /* A migração compacta ainda pode não ter sido aplicada durante desenvolvimento local. */ }
  try {
    const response = await ai.run('@cf/qwen/qwen3-30b-a3b-fp8', {
      messages: [
        { role: 'system', content: 'Avalie uma frase em mandarim. Responda somente JSON: {"grammatical":boolean,"natural":boolean,"coherent":boolean,"meets_mission":boolean|null,"translation_pt":string|null,"reason_pt":string,"suggestion":string|null}. Verifique gramática, naturalidade e coerência semântica. Se houver objetivo, verifique também se a frase o cumpre; sem objetivo, meets_mission deve ser null. Em reason_pt e suggestion, fale somente da frase em chinês: nunca mencione missão, objetivo, rodada, regras, instruções, JSON, modelo ou processo de avaliação. A explicação deve ser curta e em português.' },
        // Qwen3 reasons before answering unless told not to: the reasoning alone
        // used up a 250-token limit and the review came back empty ("não consegue verificar").
        // The generous limit keeps an answer coming even if it reasons anyway.
        { role: 'user', content: `Frase: ${sentence}\n${mission ? `Sentido desejado: ${mission}` : 'Não há um sentido adicional exigido.'} /no_think` },
      ], response_format: { type: 'json_object' }, temperature: 0, max_tokens: 2_000,
    }) as ReviewResponse
    const review = parseReview(response.response ?? response.choices?.[0]?.message?.content)
    if (review) await db.prepare('INSERT OR REPLACE INTO multiplayer_sentence_review_cache (sentence, context_hash, rubric_version, result_flags, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(sentence, context, rubricVersion, reviewFlags(review), encodeReview(review), Math.floor(Date.now() / 1_000)).run().catch(() => {})
    return { review, unavailable: review ? null : 'unavailable' }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return { review: null, unavailable: message.includes('3036') || message.includes('daily free allocation') ? 'daily-limit' : 'unavailable' }
  }
}
