/**
 * Grammar quiz of the English workspace, stored in the English database
 * (tables `english_quiz_topics` and `english_quiz_questions`).
 *
 * Questions are served in the shape of the shared quiz module
 * (src/modules/quiz/QuizModule.tsx). Options and ordering tokens are shuffled
 * on every request, so the right answer is never in a predictable place.
 */
type Choice = { id: string; text: string }
type TopicRow = { id: string; cefr_level: string; label: string }
type QuestionRow = { id: string; type: 'single_choice' | 'fill_blank' | 'ordering'; prompt: string | null; choices_json: string; answer_json: string }
export type GrammarQuizQuestion =
  | { id: string; type: 'single_choice' | 'fill_blank'; prompt: { text: string }; choices: Choice[]; answer: string }
  | { id: string; type: 'ordering'; prompt: Record<string, never>; tokens: Choice[]; answer: string[] }

function shuffle<T>(items: T[]) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

function parse<T>(json: string): T | null { try { return JSON.parse(json) as T } catch { return null } }

export async function loadGrammarTopics(db: D1Database, level: string) {
  const { results } = await db.prepare("SELECT id, cefr_level, label FROM english_quiz_topics WHERE status = 'active' AND cefr_level = ? ORDER BY position, id").bind(level).all<TopicRow>()
  return results.map((topic) => ({ id: topic.id, level: topic.cefr_level, label: topic.label }))
}

/** The active questions of a topic, shuffled, at most `count`. A malformed row is skipped, never served. */
export async function loadGrammarQuestions(db: D1Database, topicId: string, count: number): Promise<GrammarQuizQuestion[]> {
  const { results } = await db.prepare("SELECT id, type, prompt, choices_json, answer_json FROM english_quiz_questions WHERE topic_id = ? AND status = 'active' ORDER BY position, id").bind(topicId).all<QuestionRow>()
  const questions = results.flatMap((row): GrammarQuizQuestion[] => {
    const choices = parse<Choice[]>(row.choices_json)
    const answer = parse<string | string[]>(row.answer_json)
    if (!Array.isArray(choices) || !choices.length) return []
    if (row.type === 'ordering') return Array.isArray(answer) && answer.length === choices.length ? [{ id: row.id, type: 'ordering', prompt: {}, tokens: shuffle(choices), answer }] : []
    return typeof answer === 'string' && row.prompt && choices.some((choice) => choice.id === answer) ? [{ id: row.id, type: row.type, prompt: { text: row.prompt }, choices: shuffle(choices), answer }] : []
  })
  return shuffle(questions).slice(0, count)
}
