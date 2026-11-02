import type { DeviceCard } from './device-progress'

/**
 * Order of the cards shown by one flashcard session of the deck, kept apart from the UI.
 *
 * A session is built around 5 new cards, 10 old reviews and 5 recent reviews
 * (the first review of each new card) and never goes past 20 presentations.
 * - Due reviews come first: each one beyond ten takes the two places of a new
 *   card, so a backlog reduces or suspends new cards until it is cleared.
 * - At most five new cards are introduced per day; later sessions only review.
 * - A card is shown only once its review is due: nothing is anticipated to fill
 *   the session, which ends early when nothing else is eligible.
 * - A card answered wrong follows the SRS (due again in ten minutes) and comes
 *   back in the same session only if it becomes due while there is room left.
 * - The first review of a new card waits a few other cards, and a card is never
 *   shown twice in a row while anything else can be shown.
 *
 * After a full session, "extra" sessions review whatever is still due, with no
 * limit and no new cards.
 */
export const sessionPresentationLimit = 20
export const dueReviewTarget = 10
export const dailyNewCardLimit = 5
/** Presentations between the introduction of a new card and its first review. */
export const recentReviewGap = 3
/** Due reviews shown between two introductions of new cards. */
const reviewsBetweenNewCards = 2

type SchedulableCard = Pick<DeviceCard, 'vocabularyId' | 'dueAt' | 'isNew'>
export type DeckStep = { kind: 'introduce' | 'review'; vocabularyId: string }
export type DeckSession = {
  mode: 'regular' | 'extra'
  presentations: number
  /** Cards in the order they were shown; the same card may appear more than once. */
  history: string[]
  /** New cards still to be introduced in this session. */
  newPlanned: number
  lastIntroducedAt: number
  /** Cards introduced in this session that still wait for their first review. */
  awaitingReview: { vocabularyId: string; introducedAt: number }[]
  /** New cards introduced in this session, in order (shown on its end screen). */
  introduced: string[]
}

function dueCards(cards: SchedulableCard[], now: string) {
  return cards.filter((card) => !card.isNew && card.dueAt <= now).sort((left, right) => left.dueAt.localeCompare(right.dueAt))
}

export function dueCount(cards: SchedulableCard[], now: string) { return dueCards(cards, now).length }

/** Number of new cards for a session that starts with this many due reviews. */
export function plannedNewCards(due: number, available: number, introducedToday: number) {
  const roomLeftByReviews = Math.floor(Math.max(0, sessionPresentationLimit - Math.max(due, dueReviewTarget)) / 2)
  return Math.max(0, Math.min(dailyNewCardLimit - introducedToday, available, roomLeftByReviews))
}

export function planDeckSession(cards: SchedulableCard[], now: string, introducedToday: number): DeckSession {
  const available = cards.filter((card) => card.isNew).length
  return { mode: 'regular', presentations: 0, history: [], newPlanned: plannedNewCards(dueCount(cards, now), available, introducedToday), lastIntroducedAt: -1, awaitingReview: [], introduced: [] }
}

/** Reviews everything still due after a full session; the history avoids repeating its last card. */
export function extraDeckSession(previous: DeckSession): DeckSession {
  return { mode: 'extra', presentations: 0, history: previous.history.slice(-1), newPlanned: 0, lastIntroducedAt: -1, awaitingReview: [], introduced: [] }
}

/** The next card to show, or null when the session is over. */
export function nextDeckStep(session: DeckSession, cards: SchedulableCard[], now: string): DeckStep | null {
  const remaining = session.mode === 'extra' ? Number.POSITIVE_INFINITY : sessionPresentationLimit - session.presentations
  if (remaining <= 0) return null
  const existing = new Set(cards.map((card) => card.vocabularyId))
  const awaiting = session.awaitingReview.filter((item) => existing.has(item.vocabularyId))
  const awaitingIds = new Set(awaiting.map((item) => item.vocabularyId))
  const lastShown = session.history.at(-1)
  const newCards = cards.filter((card) => card.isNew && !awaitingIds.has(card.vocabularyId))
  const newPlanned = Math.min(session.newPlanned, newCards.length)
  // Places kept for the new cards still to come and for the first review of each one.
  const reserved = newPlanned * 2 + awaiting.length
  const due = dueCards(cards, now).filter((card) => !awaitingIds.has(card.vocabularyId) && card.vocabularyId !== lastShown)
  const dueAllowed = remaining > reserved && due.length > 0

  const ready = awaiting.find((item) => session.presentations - item.introducedAt > recentReviewGap)
  if (ready) return { kind: 'review', vocabularyId: ready.vocabularyId }
  if (newPlanned > 0 && (session.presentations - session.lastIntroducedAt > reviewsBetweenNewCards || !dueAllowed)) return { kind: 'introduce', vocabularyId: newCards[0].vocabularyId }
  if (dueAllowed) return { kind: 'review', vocabularyId: due[0].vocabularyId }
  // Nothing else to show: a recent card is reviewed before its gap, the
  // last card shown only when it is the very last one left.
  const early = awaiting.find((item) => item.vocabularyId !== lastShown) ?? awaiting[0]
  return early ? { kind: 'review', vocabularyId: early.vocabularyId } : null
}

/** Records that the step was shown and answered. */
export function completeDeckStep(session: DeckSession, step: DeckStep): DeckSession {
  const introduced = step.kind === 'introduce'
  return {
    ...session,
    presentations: session.presentations + 1,
    history: [...session.history, step.vocabularyId],
    newPlanned: introduced ? Math.max(0, session.newPlanned - 1) : session.newPlanned,
    lastIntroducedAt: introduced ? session.presentations : session.lastIntroducedAt,
    awaitingReview: introduced
      ? [...session.awaitingReview, { vocabularyId: step.vocabularyId, introducedAt: session.presentations }]
      : session.awaitingReview.filter((item) => item.vocabularyId !== step.vocabularyId),
    introduced: introduced ? [...session.introduced, step.vocabularyId] : session.introduced,
  }
}

/** The card was removed from the deck: it is no longer waited for and does not count. */
export function dropDeckCard(session: DeckSession, vocabularyId: string): DeckSession {
  return { ...session, awaitingReview: session.awaitingReview.filter((item) => item.vocabularyId !== vocabularyId), introduced: session.introduced.filter((id) => id !== vocabularyId) }
}
