import type { ChineseSentenceDifficulty, ChineseSentenceForm, ChineseSentenceLevel, ChineseSentenceOpportunity, StoredChineseSentence } from '../chinese/sentence-corpus.js'

export type SentenceDifficulty = ChineseSentenceDifficulty
export type SentenceForm = ChineseSentenceForm
export type SentenceRequirement = { tokens: string[] }
export type SentenceOpportunity = { card: string; chains: string[][]; label: string }
export type ApprovedSentenceRound = {
  id: string
  level: ChineseSentenceLevel
  difficulty: SentenceDifficulty
  mission: string
  answer: string[]
  requirements: SentenceRequirement[]
  form?: SentenceForm
  opportunity?: SentenceOpportunity
}

const punctuation = new Set(['。', '？'])
export const sentenceOptionCount: Record<SentenceDifficulty, number> = { easy: 4, medium: 8, hard: 12, brutal: 16 }
const shuffle = <T,>(items: T[]) => {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

function approved(id: string, level: ChineseSentenceLevel, difficulty: SentenceDifficulty, answer: string[], mission: string, extras: Partial<Pick<ApprovedSentenceRound, 'requirements' | 'form' | 'opportunity'>> = {}): ApprovedSentenceRound {
  const meaningful = answer.filter((token) => !punctuation.has(token))
  // A mission must always expose a playable path from its first card.  Requiring
  // only the end of the model sentence (for example 很 + 好) could leave its
  // subject (她) out of the opening hand, even when the prompt explicitly asks
  // for it.  Keeping the whole canonical sequence makes the next necessary
  // card available on every turn, beginning with the subject.
  const requirements = extras.requirements ?? [{ tokens: meaningful }]
  return { id, level, difficulty, mission, answer, requirements, form: extras.form, opportunity: extras.opportunity }
}

const opportunityWant: SentenceOpportunity = { card: '想', chains: [['喝', '水'], ['喝', '茶'], ['看', '书'], ['看', '电影'], ['去', '学校']], label: 'Oportunidade de ganhar mais pontos: use 想.' }
const opportunityAt: SentenceOpportunity = { card: '在', chains: [['在', '学校'], ['在', '家'], ['在', '中国']], label: 'Oportunidade de ganhar mais pontos: use 在.' }
const opportunityLike: SentenceOpportunity = { card: '喜欢', chains: [['喜欢', '喝', '茶'], ['喜欢', '看', '电影'], ['喜欢', '吃', '米饭']], label: 'Oportunidade de ganhar mais pontos: use 喜欢.' }

// Bonus rules of this game. Each sentence of the catalogue names its rule by key.
const opportunities: Record<ChineseSentenceOpportunity, SentenceOpportunity> = { want: opportunityWant, at: opportunityAt, like: opportunityLike }

// Sentences come from the Chinese domain; a sentence with a mission is a round of this game.
export function roundsFromSentences(sentences: StoredChineseSentence[]): ApprovedSentenceRound[] {
  return sentences.flatMap((sentence) => sentence.mission ? [approved(sentence.id, sentence.level, sentence.difficulty, sentence.tokens, sentence.mission, { form: sentence.form, opportunity: sentence.opportunity ? opportunities[sentence.opportunity] : undefined })] : [])
}

export function roundsForDifficulty(rounds: ApprovedSentenceRound[], difficulty: SentenceDifficulty, level: string, recentlyPlayedMissions: string[] = []) {
  const allowedLevels = level === '2' ? new Set(['1', '2']) : new Set(['1'])
  const eligible = rounds.filter((round) => allowedLevels.has(round.level) && (difficulty === 'easy' ? round.difficulty === 'easy' : difficulty === 'medium' ? ['easy', 'medium'].includes(round.difficulty) : ['easy', 'medium', 'hard'].includes(round.difficulty)))
  const fresh = eligible.filter((round) => !recentlyPlayedMissions.some((mission) => mission.startsWith(round.mission)))
  return shuffle(fresh.length >= 10 ? fresh : eligible).slice(0, 10)
}

const people = ['我', '你', '他', '她', '我们', '妈妈', '爸爸']
const timeWords = ['今天', '明天', '上午', '下午', '现在']
const placeWords = ['学校', '家', '中国', '商场', '医院']
const connectors = ['想', '喝', '喜欢', '在', '去', '看', '吃', '不', '很', '学习', '坐', '已经', '一起']
const objects = ['水', '茶', '咖啡', '书', '电影', '中国', '学校', '家', '米饭', '中文', '商场', '运动', '报纸', '旅游']

// Context can be deliberately narrow (吃 currently accepts 米饭, for example).
// These are still familiar, mission-relevant cards to complete a full hand
// without ever hiding the next card required to build a sentence.
export const sentenceVocabulary = [...new Set([...people, ...timeWords, ...placeWords, ...connectors, ...objects])]

/** Splits a sentence into the words of the given references (longest words first). */
export function tokenizeSentenceReference(sentence: string, references: string[][]) {
  const referenceVocabulary = [...new Set(references.flat())].sort((left, right) => right.length - left.length)
  const compact = sentence.replace(/\s/g, '')
  const tokens: string[] = []
  for (let position = 0; position < compact.length;) {
    const token = referenceVocabulary.find((candidate) => compact.startsWith(candidate, position))
    if (!token) return null
    tokens.push(token)
    position += token.length
  }
  return tokens
}

export function coherentNextOptions(tokens: string[], references: string[][]) {
  return [...new Set(references
    .filter((reference) => tokens.length < reference.length && tokens.every((token, index) => reference[index] === token))
    .map((reference) => reference[tokens.length]))]
}

export function sentenceOptions(tokens: string[], references: string[][] = []) {
  const last = tokens.at(-1)
  const context = !tokens.length ? [...people, ...timeWords] : timeWords.includes(last ?? '') ? people : people.includes(last ?? '') ? connectors : ['想', '喜欢'].includes(last ?? '') ? ['喝', '看', '去', '吃', '学习'] : last === '在' ? placeWords : last === '喝' ? ['水', '茶', '咖啡'] : last === '看' ? ['书', '电影', '报纸'] : last === '去' ? ['中国', '学校', '商场', '旅游'] : last === '吃' ? ['米饭'] : last === '坐' ? ['地铁', '出租车'] : last === '学习' ? ['中文'] : last === '不' ? ['喝', '看', '去', '吃'] : last === '很' ? ['好', '忙', '高兴'] : [...connectors, ...objects, ...timeWords, ...placeWords]
  return shuffle([...new Set([...coherentNextOptions(tokens, references), ...context])])
}

function containsSequence(tokens: string[], sequence: string[]) { return tokens.join('').includes(sequence.join('')) }
function trailingProgress(tokens: string[], sequence: string[]) {
  const max = Math.min(tokens.length, sequence.length - 1)
  for (let size = max; size > 0; size -= 1) if (tokens.slice(-size).join('') === sequence.slice(0, size).join('')) return size
  return 0
}
export function requiredMissionOptions(round: ApprovedSentenceRound | undefined, tokens: string[]) {
  if (!round) return []
  for (const requirement of round.requirements) {
    if (containsSequence(tokens, requirement.tokens)) continue
    const progress = trailingProgress(tokens, requirement.tokens)
    return [requirement.tokens[progress] ?? requirement.tokens[0]]
  }
  return []
}
export function opportunityOptions(round: ApprovedSentenceRound | undefined, tokens: string[]) {
  if (!round?.opportunity) return []
  const cardIndex = tokens.lastIndexOf(round.opportunity.card)
  if (cardIndex < 0) return [round.opportunity.card]
  const following = tokens.slice(cardIndex)
  if (round.opportunity.chains.some((chain) => containsSequence(following, chain))) return []
  const next = new Set<string>()
  for (const chain of round.opportunity.chains) {
    const progress = trailingProgress(following, chain)
    if (progress < chain.length) next.add(chain[progress])
  }
  return [...next]
}
export function missionMatches(round: ApprovedSentenceRound, tokens: string[]) { return round.requirements.every((requirement) => containsSequence(tokens, requirement.tokens)) }
export function opportunityMatches(round: ApprovedSentenceRound | undefined, tokens: string[]) { return Boolean(round?.opportunity && round.opportunity.chains.some((chain) => containsSequence(tokens, chain))) }
export function formMatches(form: SentenceForm | undefined, tokens: string[]) {
  if (!form) return true
  if (form === 'question') return tokens.includes('吗') || tokens.includes('？')
  if (form === 'negative') return tokens.includes('不')
  if (form === 'time-place') return tokens.some((token) => timeWords.includes(token)) || tokens.some((token) => placeWords.includes(token))
  return tokens.length >= 6
}
export function expansionScore(tokens: string[], round: ApprovedSentenceRound | undefined) {
  const time = tokens.some((token) => timeWords.includes(token)) ? 4 : 0
  const place = tokens.some((token) => placeWords.includes(token)) ? 4 : 0
  const extra = round && tokens.length >= round.answer.length + 2 ? 5 : 0
  const opportunity = opportunityMatches(round, tokens) ? 7 : 0
  return { time, place, extra, opportunity, total: time + place + extra + opportunity }
}
