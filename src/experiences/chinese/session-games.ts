/**
 * The game step of the daily session plays one game, drawn by weight. The
 * sentence games matter most; the picture game appears less often.
 */
export type SessionGame = 'sentence' | 'listening' | 'picture'

/** Also the fallback order when the drawn game has nothing to play. */
export const sessionGameWeights: [SessionGame, number][] = [
  ['sentence', 0.4],
  ['listening', 0.4],
  ['picture', 0.2],
]

/** The drawn game first, then the others as fallbacks, most important first. */
export function sessionGameOrder(roll = Math.random()): SessionGame[] {
  let accumulated = 0
  const chosen = sessionGameWeights.find(([, weight]) => (accumulated += weight) > roll)?.[0] ?? sessionGameWeights[0][0]
  return [chosen, ...sessionGameWeights.map(([game]) => game).filter((game) => game !== chosen)]
}

/** Rough minutes one session run of each game takes (picture: 5 questions, listening: 3 sentences, sentence: 2 rounds). */
export const sessionGameMinutes: Record<SessionGame, number> = { picture: 1, listening: 1.5, sentence: 3 }

/**
 * Games of a practice session, chosen when it starts: drawn at random, each at
 * most once, keeping only those whose estimated time fits the learner's
 * session length (always at least one). Once the time is up, no other game
 * starts, but the one under way is played to the end.
 */
export function practiceGamePlan(minutes: number, random = Math.random): SessionGame[] {
  const remaining = sessionGameWeights.map(([game]) => game)
  const drawn: SessionGame[] = []
  while (remaining.length) {
    const total = remaining.reduce((sum, game) => sum + sessionGameWeights.find(([candidate]) => candidate === game)![1], 0)
    let roll = random() * total
    const index = remaining.findIndex((game) => (roll -= sessionGameWeights.find(([candidate]) => candidate === game)![1]) < 0)
    drawn.push(...remaining.splice(index < 0 ? remaining.length - 1 : index, 1))
  }
  let used = 0
  return drawn.filter((game, index) => {
    if (index > 0 && used + sessionGameMinutes[game] > minutes) return false
    used += sessionGameMinutes[game]
    return true
  })
}
