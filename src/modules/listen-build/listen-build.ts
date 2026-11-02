/**
 * Pure rules of the "Ouça e monte" game: no React, no browser, no language.
 * Kept apart from the component so they can be tested on their own.
 */
export type ListeningSentence = {
  id: string
  /** Words to assemble, in order, without punctuation. */
  tokens: string[]
  /** Exact text that is spoken and revealed after answering. */
  text: string
  /** Optional pronunciation aid revealed after answering (pinyin, IPA…). */
  reading?: string
  /** Catalogue IDs credited with the result (sentence and its words). */
  contentIds: string[]
  /** Lower plays first (0 = only words the learner already knows). Defaults to 0. */
  priority?: number
}

export type ListeningCard = { id: string; text: string }
export type ListeningRound = { sentence: ListeningSentence; cards: ListeningCard[] }

type Random = () => number

export function shuffle<T>(items: T[], random: Random = Math.random) {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[next[index], next[swap]] = [next[swap], next[index]]
  }
  return next
}

/**
 * The hand holds every word of the sentence plus a few distractors taken from
 * other sentences. A distractor never repeats a word of the answer, so the
 * correct sequence is always the only one that uses exactly the spoken words.
 */
export function buildRound(sentence: ListeningSentence, pool: string[], distractorCount = 2, random: Random = Math.random): ListeningRound {
  const answerWords = new Set(sentence.tokens)
  const distractors = shuffle([...new Set(pool)].filter((word) => word.trim() && !answerWords.has(word)), random).slice(0, distractorCount)
  const cards = [...sentence.tokens, ...distractors].map((text, index) => ({ id: `${sentence.id}:${index}`, text }))
  return { sentence, cards: shuffle(cards, random) }
}

/** Picks sentences by priority (random within each level), so lower levels always come first. */
export function buildRounds(sentences: ListeningSentence[], count: number, distractorCount = 2, random: Random = Math.random) {
  const playable = sentences.filter((sentence) => sentence.tokens.length >= 2)
  const pool = playable.flatMap((sentence) => sentence.tokens)
  const levels = [...new Set(playable.map((sentence) => sentence.priority ?? 0))].sort((left, right) => left - right)
  const ordered = levels.flatMap((level) => shuffle(playable.filter((sentence) => (sentence.priority ?? 0) === level), random))
  return ordered.slice(0, count).map((sentence) => buildRound(sentence, pool, distractorCount, random))
}

/** Compares by text, so two identical cards are interchangeable. */
export function answerIsCorrect(round: ListeningRound, chosenCardIds: string[]) {
  const chosen = chosenCardIds.map((id) => round.cards.find((card) => card.id === id)?.text)
  return chosen.length === round.sentence.tokens.length && chosen.every((text, index) => text === round.sentence.tokens[index])
}
