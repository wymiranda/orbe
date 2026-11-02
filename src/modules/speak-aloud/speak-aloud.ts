/*
 * Rules of "Solte a Voz", kept apart from the UI: how a transcript is
 * normalized, compared with the expected answer and scored.
 *
 * The comparison is about what the recognizer understood, never about
 * pronunciation or tones: a transcript alone cannot measure those.
 */

/** Characters compare one by one (Chinese, Japanese…); words compare as whole words. */
export type SpeakingSegmentation = 'characters' | 'words'

export type SpeakingItem = {
  id: string
  /** What the learner has to say, as written in the studied language. */
  text: string
  /** Pronunciation aid (pinyin, IPA…). */
  reading?: string
  /** Meaning in the interface language, shown after an attempt. */
  meaning?: string
  /** Knowledge ids the attempt counts for (the word, or the sentence and its words). */
  contentIds: string[]
  /** Lower first: the learner's studied content comes before the rest. */
  priority?: number
}

/** One unit of the comparison: a character or a word, and whether it was matched. */
export type ComparedUnit = { text: string; matched: boolean }
export type SpeakingComparison = {
  expected: ComparedUnit[]
  /** Recognized units; unmatched ones were said but not expected. */
  recognized: ComparedUnit[]
  /** Share of the expected units that were recognized, 0–1. */
  accuracy: number
  correct: boolean
  transcript: string
}

const chineseDigits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 0–99 as read in Chinese (12 → 十二, 20 → 二十); larger numbers are read digit by digit. */
function chineseNumber(digits: string) {
  const value = Number(digits)
  if (digits.length > 2 || digits.length === 2 && digits.startsWith('0')) return Array.from(digits, (digit) => chineseDigits[Number(digit)]).join('')
  if (value < 10) return chineseDigits[value]
  const tens = Math.floor(value / 10)
  const units = value % 10
  return `${tens === 1 ? '' : chineseDigits[tens]}十${units ? chineseDigits[units] : ''}`
}

/**
 * Formatting a recognizer may choose freely is made equal: width (ＡＢ → AB),
 * case, punctuation, spaces and, for characters, Arabic digits.
 * Different characters always stay different.
 */
export function normalizeTranscript(text: string, segmentation: SpeakingSegmentation): string[] {
  const plain = text.normalize('NFKC').toLowerCase()
  if (segmentation === 'characters') {
    const withNumerals = plain.replace(/\d+/g, (digits) => chineseNumber(digits))
    return Array.from(withNumerals.replace(/[\p{P}\p{S}\s]/gu, ''))
  }
  return plain.replace(/[^\p{L}\p{N}'\s-]/gu, ' ').replace(/(^|\s)['-]+|['-]+(?=\s|$)/g, ' ').split(/\s+/).filter(Boolean)
}

/** The recognizer writes "2" for both 二 and 两: either is accepted where a digit was spoken. */
function sameUnit(expected: string, recognized: string) {
  return expected === recognized || recognized === '二' && expected === '两'
}

/** Longest common subsequence: which expected and recognized units line up. */
export function compareUnits(expected: string[], recognized: string[]) {
  const table = Array.from({ length: expected.length + 1 }, () => new Array<number>(recognized.length + 1).fill(0))
  for (let left = expected.length - 1; left >= 0; left -= 1)
    for (let right = recognized.length - 1; right >= 0; right -= 1)
      table[left][right] = sameUnit(expected[left], recognized[right]) ? table[left + 1][right + 1] + 1 : Math.max(table[left + 1][right], table[left][right + 1])
  const expectedMatched = new Array<boolean>(expected.length).fill(false)
  const recognizedMatched = new Array<boolean>(recognized.length).fill(false)
  let left = 0
  let right = 0
  while (left < expected.length && right < recognized.length) {
    if (sameUnit(expected[left], recognized[right])) { expectedMatched[left] = true; recognizedMatched[right] = true; left += 1; right += 1 }
    else if (table[left + 1][right] >= table[left][right + 1]) left += 1
    else right += 1
  }
  return { expectedMatched, recognizedMatched }
}

/** Compares one transcript with the expected text. */
export function compareTranscript(expectedText: string, transcript: string, segmentation: SpeakingSegmentation): SpeakingComparison {
  const expected = normalizeTranscript(expectedText, segmentation)
  const recognized = normalizeTranscript(transcript, segmentation)
  const { expectedMatched, recognizedMatched } = compareUnits(expected, recognized)
  const matched = expectedMatched.filter(Boolean).length
  return {
    expected: expected.map((text, index) => ({ text, matched: expectedMatched[index] })),
    recognized: recognized.map((text, index) => ({ text, matched: recognizedMatched[index] })),
    accuracy: expected.length ? matched / expected.length : 0,
    // Right only when everything expected, and nothing else, was recognized.
    correct: expected.length > 0 && matched === expected.length && recognized.length === expected.length,
    transcript,
  }
}

/** The recognizer's alternatives are all considered; the closest one to the answer counts. */
export function bestComparison(expectedText: string, alternatives: string[], segmentation: SpeakingSegmentation): SpeakingComparison | null {
  const comparisons = alternatives.filter((text) => text.trim()).map((text) => compareTranscript(expectedText, text, segmentation))
  if (!comparisons.length) return null
  const better = (current: SpeakingComparison, best: SpeakingComparison) => current.correct !== best.correct ? current.correct : current.accuracy > best.accuracy
  return comparisons.reduce((best, current) => better(current, best) ? current : best)
}

/** Score of one item: full when right at the first attempt, less after retries, nothing when never right. */
export function speakingScore(correct: boolean, attempts: number) {
  return correct ? Math.max(.4, 1 - .2 * Math.max(0, attempts - 1)) : 0
}

function shuffle<T>(items: T[], random: () => number) {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) { const swap = Math.floor(random() * (index + 1)); [next[index], next[swap]] = [next[swap], next[index]] }
  return next
}

/** Picks the items of a game: lower priority first, at random within each priority. */
export function pickSpeakingItems(items: SpeakingItem[], count: number, random = Math.random) {
  const priorities = [...new Set(items.map((item) => item.priority ?? 0))].sort((left, right) => left - right)
  return priorities.flatMap((priority) => shuffle(items.filter((item) => (item.priority ?? 0) === priority), random)).slice(0, count)
}
