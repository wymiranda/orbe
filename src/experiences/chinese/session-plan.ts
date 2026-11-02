import type { KnowledgeSnapshot } from '../../learning-paths/types'

/**
 * Pedagogical rules of the daily session, kept apart from the UI.
 *
 * - Words the learner keeps getting wrong (under 70% across everything they
 *   played) open any session with a short review: their card and their writing.
 * - Once the learner can build about ten sentences, one session in four is a
 *   practice session: no new words, no flashcards, no guided writing, only
 *   games with what they already know. The other sessions keep adding words.
 */
export const weakAccuracy = 0.7
export const weakMinimumAttempts = 2
export const weakReviewLimit = 5
export const practiceMinimumSentences = 10
export const practiceEvery = 4

const sentencePrefix = 'zh-hans:sentence:'
/**
 * Word-level evidence only: "exposure" is merely having seen the word and
 * "comprehension" comes from whole sentences, where one mistake would count
 * against every word of the sentence.
 */
const wordEvidence = new Set(['recognition', 'production', 'retention'])

/** Words (never whole sentences) answered correctly less than 70% of the time, worst first. */
export function weakWords(snapshot: KnowledgeSnapshot | null, limit = weakReviewLimit) {
  if (!snapshot) return []
  return Object.entries(snapshot.contents)
    .filter(([id]) => !id.startsWith(sentencePrefix))
    .map(([id, content]) => {
      const skills = Object.entries(content.skills).filter(([skill, value]) => wordEvidence.has(skill) && value !== undefined).map(([, value]) => value!)
      const attempts = skills.reduce((total, skill) => total + skill.attempts, 0)
      const successes = skills.reduce((total, skill) => total + skill.successes, 0)
      return { id, attempts, accuracy: attempts ? successes / attempts : 1, updatedAt: content.updatedAt }
    })
    .filter((word) => word.attempts >= weakMinimumAttempts && word.accuracy < weakAccuracy)
    .sort((left, right) => left.accuracy - right.accuracy || right.updatedAt - left.updatedAt)
    .slice(0, limit)
    .map((word) => word.id)
}

/** Sentences whose every word (punctuation aside) has been studied. */
export function buildableSentences<T extends { tokens: string[] }>(sentences: T[], studied: (hanzi: string) => boolean) {
  return sentences.filter((sentence) => sentence.tokens.filter((token) => !/^[。？！，]$/.test(token)).every(studied))
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
export function nextSessionKind(buildable: number, storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage): 'regular' | 'practice' {
  if (buildable < practiceMinimumSentences) return 'regular'
  const regularSinceLastPractice = loadCadence(storage)
  if (regularSinceLastPractice >= practiceEvery - 1) { storage.setItem(cadenceKey, '0'); return 'practice' }
  storage.setItem(cadenceKey, String(regularSinceLastPractice + 1))
  return 'regular'
}
