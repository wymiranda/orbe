import type { KnowledgeSnapshot } from '../../learning-paths/types'

/**
 * Pedagogical rules of the daily session, kept apart from the UI.
 *
 * - Words the learner keeps getting wrong (under 70% across everything they
 *   played) open the session with a short review: their card and their writing.
 *   Only words still weak lately and due again are shown, the weakest first, so the
 *   review comes whenever there is something to review, and only then.
 * - Once the guided trail is over, every regular session teaches a few new words
 *   of the learner's level: those that let them build the most sentences of the
 *   difficulty they play, and the session games then play those sentences first.
 * - Once the learner knows nine words and can build ten sentences, one session in four is a
 *   practice session: no new words, no flashcards, no guided writing, only
 *   games with what they already know. The other sessions keep adding words.
 */
export const weakAccuracy = 0.7
export const weakMinimumAttempts = 2
export const weakReviewLimit = 5
/** Recent strength (0–100) from which a word that used to be missed counts as recovered. */
export const weakRecoveredStrength = 60
export const newWordsPerSession = 3
export const practiceMinimumSentences = 10
/** Review-only (practice) sessions come only once the learner knows this many words. */
export const practiceMinimumWords = 9
/**
 * Words taught right after the trail, in this order (docs/hsk1-nucleo-inicial.md): chosen for how
 * much they combine, each with several sentences of the catalogue. The automatic choice follows.
 */
export const starterWords = ['你', '吗', '她', '喜欢', '很', '好', '呢', '是', '老师', '学生', '在', '家', '妈妈']
export const practiceEvery = 4

const sentencePrefix = 'zh-hans:sentence:'
/**
 * Word-level evidence only: "exposure" is merely having seen the word and
 * "comprehension" comes from whole sentences, where one mistake would count
 * against every word of the sentence.
 */
const wordEvidence = new Set(['recognition', 'production', 'retention'])

/**
 * Words (never whole sentences) answered correctly less than 70% of the time that
 * still need it, the weakest first:
 * - a word answered right lately (recent strength of 60 or more) has recovered;
 * - a word is shown only once it is due again, and never while its flashcard is
 *   scheduled for later (`scheduledLater`: marked easy, it waits its interval).
 */
export function weakWords(snapshot: KnowledgeSnapshot | null, { limit = weakReviewLimit, now = Date.now(), scheduledLater = () => false }: { limit?: number; now?: number; scheduledLater?: (id: string) => boolean } = {}) {
  if (!snapshot) return []
  return Object.entries(snapshot.contents)
    .filter(([id]) => !id.startsWith(sentencePrefix))
    .map(([id, content]) => {
      const skills = Object.entries(content.skills).filter(([skill, value]) => wordEvidence.has(skill) && value !== undefined).map(([, value]) => value!)
      const attempts = skills.reduce((total, skill) => total + skill.attempts, 0)
      const successes = skills.reduce((total, skill) => total + skill.successes, 0)
      const strength = skills.length ? Math.min(...skills.map((skill) => skill.strength)) : 100
      return { id, attempts, accuracy: attempts ? successes / attempts : 1, strength, due: skills.some((skill) => skill.dueAt <= now), updatedAt: content.updatedAt }
    })
    .filter((word) => word.attempts >= weakMinimumAttempts && word.accuracy < weakAccuracy && word.strength < weakRecoveredStrength && word.due && !scheduledLater(word.id))
    .sort((left, right) => left.strength - right.strength || left.accuracy - right.accuracy || right.updatedAt - left.updatedAt)
    .slice(0, limit)
    .map((word) => word.id)
}

type PlannedSentence = { tokens: string[]; level: string; difficulty: 'easy' | 'medium' | 'hard' | 'brutal' }
const difficultyWeight = { easy: 4, medium: 3, hard: 2, brutal: 1 }

/**
 * New words for a session once the guided trail is over: words of the learner's
 * level (or below) not studied yet, chosen one at a time for the sentences they
 * complete (a sentence whose only missing word it is) and then for how often they
 * appear, easier sentences first. Words in no sentence follow in catalogue order.
 */
export function nextWordsToLearn({ vocabulary, sentences, level, studied, limit = newWordsPerSession }: { vocabulary: { id: string; hsk_level: string }[]; sentences: PlannedSentence[]; level: number; studied: (id: string) => boolean; limit?: number }) {
  const candidates = vocabulary.filter((term) => Number(term.hsk_level) <= level && !studied(term.id)).map((term) => term.id)
  // The starter core comes first, in its order.
  const chosen: string[] = starterWords.filter((word) => candidates.includes(word)).slice(0, limit)
  // A one-word sentence (不客气。) gives nothing to build: the games need two words or more.
  const words = sentences.filter((sentence) => Number(sentence.level) <= level).map((sentence) => ({ weight: difficultyWeight[sentence.difficulty] ?? 1, words: [...new Set(sentence.tokens.filter((token) => !/^[。？！，]$/.test(token)))] }))
    .filter((sentence) => sentence.words.length >= 2)
  while (chosen.length < limit) {
    const known = (id: string) => studied(id) || chosen.includes(id)
    const missing = words.map((sentence) => ({ weight: sentence.weight, missing: sentence.words.filter((word) => !known(word)) }))
    let best: string | null = null; let bestScore = 0
    for (const candidate of candidates) {
      if (chosen.includes(candidate)) continue
      const score = missing.reduce((total, sentence) => !sentence.missing.includes(candidate) ? total : total + sentence.weight * (sentence.missing.length === 1 ? 100 : 1), 0)
      if (score > bestScore) { best = candidate; bestScore = score }
    }
    const next = best ?? candidates.find((candidate) => !chosen.includes(candidate))
    if (!next) break
    chosen.push(next)
  }
  return chosen
}

/**
 * Order of what the session games play, lowest first:
 * 0–1. with a new word of the session (`focus`): those are practised first;
 * 2. with a word the learner finds hard (`difficult`), not played lately;
 * 3. the others, not played lately;
 * 4. with a hard word, played lately;
 * 5. the others, played lately.
 * Hard words come first, but never at the cost of variety: a hard sentence just played waits
 * behind any sentence not seen lately.
 */
export function practiceRank({ focus, difficult, recent }: { focus: boolean; difficult: boolean; recent: boolean }) {
  if (focus) return recent ? 1 : 0
  if (recent) return difficult ? 4 : 5
  return difficult ? 2 : 3
}

/** The sentences in practiceRank order, at random within a rank. */
export function focusFirst<T extends { id?: string; tokens: string[] }>(sentences: T[], focus: string[], random = Math.random, recent: string[] = [], difficult: string[] = []) {
  const rank = (sentence: T) => practiceRank({ focus: sentence.tokens.some((token) => focus.includes(token)), difficult: sentence.tokens.some((token) => difficult.includes(token)), recent: Boolean(sentence.id && recent.includes(sentence.id)) })
  return sentences.map((sentence) => ({ sentence, rank: rank(sentence), key: random() })).sort((left, right) => left.rank - right.rank || left.key - right.key).map((item) => item.sentence)
}

/**
 * A learner who jumped to a level (placement) is taken to know the words up to it; the sentence
 * games then show it, word by word, from how each word did in sentences (building and hearing):
 * - proven: used in 3 sentences or more, 75% of them right: it becomes a learned word;
 * - failed: 3 sentences or more under 50%: it is taught again the normal way;
 * - otherwise still to prove.
 * One wrong sentence counts against each of its words, so the thresholds leave room for that.
 */
export const provenUses = 3
export const provenAccuracy = 0.75
export const failedAccuracy = 0.5
const sentenceEvidence = ['production', 'comprehension']

export function sentenceUse(snapshot: KnowledgeSnapshot | null, id: string) {
  const skills = Object.entries(snapshot?.contents[id]?.skills ?? {}).filter(([skill, value]) => sentenceEvidence.includes(skill) && value !== undefined).map(([, value]) => value!)
  const attempts = skills.reduce((total, skill) => total + skill.attempts, 0)
  return { attempts, accuracy: attempts ? skills.reduce((total, skill) => total + skill.successes, 0) / attempts : 0 }
}
export function placementStatus(snapshot: KnowledgeSnapshot | null, id: string): 'proven' | 'failed' | 'unproven' {
  const use = sentenceUse(snapshot, id)
  if (use.attempts < provenUses) return 'unproven'
  return use.accuracy >= provenAccuracy ? 'proven' : use.accuracy < failedAccuracy ? 'failed' : 'unproven'
}

/** The words of a placement up to its level, not learned yet: those still taken as known, and those that failed. */
export function placementWords({ vocabulary, placement, learned, snapshot }: { vocabulary: { id: string; hsk_level: string }[]; placement: number; learned: (id: string) => boolean; snapshot: KnowledgeSnapshot | null }) {
  const open = vocabulary.filter((term) => Number(term.hsk_level) <= placement && !learned(term.id))
  return {
    assumed: open.filter((term) => placementStatus(snapshot, term.id) !== 'failed').map((term) => term.id),
    failed: open.filter((term) => placementStatus(snapshot, term.id) === 'failed').map((term) => term.id),
  }
}

/**
 * Order of the sentences for a learner who jumped to `level`: that level's sentences, and one
 * sentence of an earlier level after every three, only when it holds a word still to prove that
 * no sentence of the level has. Earlier sentences with nothing to prove come last.
 */
export function placementSentenceOrder<T extends { level: string; tokens: string[] }>(ordered: T[], level: string, assumed: string[]) {
  const current = ordered.filter((sentence) => sentence.level === level)
  const coveredAtLevel = new Set(current.flatMap((sentence) => sentence.tokens))
  const earlier = ordered.filter((sentence) => sentence.level !== level)
  const useful = earlier.filter((sentence) => sentence.tokens.some((token) => assumed.includes(token) && !coveredAtLevel.has(token)))
  const result: T[] = []
  for (let index = 0, extra = 0; index < current.length || extra < useful.length;) {
    for (let count = 0; count < 3 && index < current.length; count += 1) result.push(current[index++])
    if (extra < useful.length) result.push(useful[extra++])
  }
  return [...result, ...earlier.filter((sentence) => !useful.includes(sentence))]
}

/** Flashcard ease under this: the card was marked "Difícil" or "Errei" more than "Fácil" lifted it back. */
export const hardEase = 2.4

/**
 * Words the learner finds hard, the hardest first: flashcards they keep marking hard (low ease),
 * then words they keep missing in the activities and have not recovered yet (see weakWords).
 */
export function difficultWords(cards: { vocabularyId: string; isNew: boolean; ease: number }[], snapshot: KnowledgeSnapshot | null) {
  const byEase = cards.filter((card) => !card.isNew && card.ease < hardEase).sort((left, right) => left.ease - right.ease).map((card) => card.vocabularyId)
  const missed = weakWords(snapshot, { limit: Number.POSITIVE_INFINITY, now: Number.POSITIVE_INFINITY })
  return [...new Set([...byEase, ...missed])]
}

const recentRoundsKey = 'niorb:chinese:recent-session-sentences:v1'
const recentRoundsLimit = 30

/** Sentences played lately in the sessions' sentence game, oldest first. */
export function recentSessionSentences(storage: Pick<Storage, 'getItem'> = window.localStorage): string[] {
  try { const value = JSON.parse(storage.getItem(recentRoundsKey) ?? '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [] } catch { return [] }
}
export function rememberSessionSentences(ids: string[], storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage) {
  const kept = recentSessionSentences(storage).filter((id) => !ids.includes(id))
  storage.setItem(recentRoundsKey, JSON.stringify([...kept, ...ids].slice(-recentRoundsLimit)))
}

/** Sentences whose every word (punctuation aside) has been studied. */
export function buildableSentences<T extends { tokens: string[] }>(sentences: T[], studied: (hanzi: string) => boolean) {
  return sentences.filter((sentence) => sentence.tokens.filter((token) => !/^[。？！，]$/.test(token)).every(studied))
}

/**
 * Overdue flashcards reviewed in the session's "Revisar" step, after the session's own words:
 * - nothing overdue: nothing is added;
 * - up to 10 overdue: all of them;
 * - more: the 10 most overdue, or 20 in a catch-up session. A catch-up session comes only when
 *   over 30 cards are overdue, at most one session in three, and never while the overdue cards
 *   are mostly ones the learner keeps marking hard (median ease under 1.9): more of the same
 *   reviews would only pile up again. The session itself always goes on.
 */
export const overdueReviewTarget = 10
export const overdueCatchUpTarget = 20
export const overdueCatchUpBacklog = 30
export const catchUpEvery = 3
export const strugglingEase = 1.9

type ReviewCard = { vocabularyId: string; dueAt: string; isNew: boolean; ease: number }

export function overdueReview(cards: ReviewCard[], { now = new Date().toISOString(), exclude = [], catchUpTurn = false }: { now?: string; exclude?: string[]; catchUpTurn?: boolean } = {}) {
  const overdue = cards.filter((card) => !card.isNew && card.dueAt <= now && !exclude.includes(card.vocabularyId)).sort((left, right) => left.dueAt.localeCompare(right.dueAt))
  const eases = overdue.map((card) => card.ease).sort((left, right) => left - right)
  const medianEase = eases.length ? eases[Math.floor(eases.length / 2)] : Infinity
  const catchUp = catchUpTurn && overdue.length > overdueCatchUpBacklog && medianEase >= strugglingEase
  return { ids: overdue.slice(0, catchUp ? overdueCatchUpTarget : overdueReviewTarget).map((card) => card.vocabularyId), catchUp }
}

/**
 * Words used correctly in a sentence game ("Construam uma frase", "Ouça e monte") whose flashcard
 * is overdue: the right use counts as their review, rated "good". Only overdue cards: a card not
 * due keeps its schedule, as a flashcard rating would.
 */
export const sentenceGameModules = new Set(['multiplayer', 'listen-build'])
export function wordsReviewedBySentences(result: { moduleId: string; assessments: { contentId?: string; correct?: boolean; score?: number }[] }, cards: Pick<ReviewCard, 'vocabularyId' | 'dueAt' | 'isNew'>[], now = new Date().toISOString()) {
  if (!sentenceGameModules.has(result.moduleId)) return []
  const right = new Set(result.assessments.filter((assessment) => assessment.correct === true || (assessment.correct === undefined && (assessment.score ?? 0) >= 1)).flatMap((assessment) => assessment.contentId ? [assessment.contentId] : []))
  return cards.filter((card) => right.has(card.vocabularyId) && !card.isNew && card.dueAt <= now).map((card) => card.vocabularyId)
}

/**
 * How many new words a session after the trail teaches, and what it works on when it teaches none.
 * - While the starter core is not learned: 3, to build the first repertoire quickly.
 * - Then, in this order:
 *   - after a session with no new word, at least 1: the sessions always move on;
 *   - 3 or more weak words: none, the session works on the weak words;
 *   - the last session's new words still fragile (recent strength under 50): none, it works on them;
 *   - otherwise fewer words the more sentences the learner can build and has not practised yet
 *     (12 or more: 1; 6 or more: 2; fewer: 3), and at most 2 from 60 known words on.
 */
export const paceFragileStrength = 50
export function sessionPace({ starterLeft, weakCount, lastNewWords, lastWordsFragile, freshSentences, knownWords }: { starterLeft: number; weakCount: number; lastNewWords: number | null; lastWordsFragile: boolean; freshSentences: number; knownWords: number }): { newWords: number; focus: 'weak' | 'recent' | null } {
  if (starterLeft > 0) return { newWords: newWordsPerSession, focus: null }
  const byRepertoire = Math.min(freshSentences >= 12 ? 1 : freshSentences >= 6 ? 2 : 3, knownWords >= 60 ? 2 : 3)
  if (lastNewWords === 0) return { newWords: byRepertoire, focus: null }
  if (weakCount >= 3) return { newWords: 0, focus: 'weak' }
  if (lastWordsFragile) return { newWords: 0, focus: 'recent' }
  return { newWords: byRepertoire, focus: null }
}

const paceKey = 'niorb:chinese:session-pace:v1'

/** The new words of the last session after the trail (none for a session that taught none). */
export function lastSessionWords(storage: Pick<Storage, 'getItem'> = window.localStorage): string[] | null {
  try { const value = JSON.parse(storage.getItem(paceKey) ?? 'null'); return Array.isArray(value?.words) ? value.words.filter((id: unknown): id is string => typeof id === 'string') : null } catch { return null }
}
export function rememberSessionWords(words: string[], storage: Pick<Storage, 'setItem'> = window.localStorage) { storage.setItem(paceKey, JSON.stringify({ words })) }

/** A word not consolidated yet: its weakest recent strength (recognition, production, retention) is under 50. */
export function fragileWord(snapshot: KnowledgeSnapshot | null, id: string) {
  const skills = Object.entries(snapshot?.contents[id]?.skills ?? {}).filter(([skill, value]) => wordEvidence.has(skill) && value !== undefined).map(([, value]) => value!.strength)
  return skills.length > 0 && Math.min(...skills) < paceFragileStrength
}

const catchUpKey = 'niorb:chinese:review-catch-up:v1'

/** Whether this session may be a catch-up one (two sessions at least since the last); `record` after deciding. */
export function reviewCatchUpTurn(storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage) {
  const stored = Number(storage.getItem(catchUpKey))
  const since = Number.isFinite(stored) && storage.getItem(catchUpKey) !== null ? stored : catchUpEvery - 1
  return { due: since >= catchUpEvery - 1, record: (caughtUp: boolean) => storage.setItem(catchUpKey, String(caughtUp ? 0 : since + 1)) }
}

const cadenceKey = 'niorb:chinese:practice-cadence:v1'

function loadCadence(storage: Pick<Storage, 'getItem'>) {
  const value = Number(storage.getItem(cadenceKey))
  return Number.isFinite(value) && value >= 0 ? value : 0
}

/**
 * Decides the kind of the session that is starting and records it.
 * The count only advances once practice is unlocked, so the first practice
 * session comes three regular sessions after the learner reaches ten sentences.
 */
export function nextSessionKind(buildable: number, storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage, knownWords = practiceMinimumWords): 'regular' | 'practice' {
  if (buildable < practiceMinimumSentences || knownWords < practiceMinimumWords) return 'regular'
  const regularSinceLastPractice = loadCadence(storage)
  if (regularSinceLastPractice >= practiceEvery - 1) { storage.setItem(cadenceKey, '0'); return 'practice' }
  storage.setItem(cadenceKey, String(regularSinceLastPractice + 1))
  return 'regular'
}
