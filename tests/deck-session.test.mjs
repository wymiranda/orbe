import assert from 'node:assert/strict'
import test from 'node:test'
import { completeDeckStep, extraDeckSession, nextDeckStep, planDeckSession, plannedNewCards, sessionPresentationLimit } from '../src/experiences/chinese/deck-session.ts'

const now = '2026-10-29T12:00:00.000Z'
const past = (minutes) => new Date(Date.parse(now) - minutes * 60_000).toISOString()
const future = (days) => new Date(Date.parse(now) + days * 86_400_000).toISOString()
const dueCard = (id, minutesAgo = 60) => ({ vocabularyId: id, dueAt: past(minutesAgo), isNew: false })
const newCard = (id) => ({ vocabularyId: id, dueAt: past(1), isNew: true })
const futureCard = (id) => ({ vocabularyId: id, dueAt: future(3), isNew: false })

/** Plays a session, answering every review with `answer` (a new card's first review makes it non-new). */
function play(cards, session, answer = () => 'good') {
  const steps = []
  let step
  while ((step = nextDeckStep(session, cards, now))) {
    steps.push(step)
    session = completeDeckStep(session, step)
    if (step.kind === 'review') {
      const card = cards.find((item) => item.vocabularyId === step.vocabularyId)
      card.isNew = false
      card.dueAt = answer(step.vocabularyId) === 'again' ? past(0) : future(2)
    }
    assert.ok(steps.length <= 200, 'the session must end')
  }
  return { steps, session }
}

test('a balanced session is 5 new, 10 old reviews and 5 recent reviews', () => {
  const cards = [...Array.from({ length: 10 }, (_, index) => dueCard(`old${index}`, 100 - index)), futureCard('later'), ...Array.from({ length: 30 }, (_, index) => newCard(`new${index}`))]
  const { steps } = play(cards, planDeckSession(cards, now, 0))
  assert.equal(steps.length, sessionPresentationLimit)
  assert.equal(steps.filter((step) => step.kind === 'introduce').length, 5)
  const introduced = new Set(steps.filter((step) => step.kind === 'introduce').map((step) => step.vocabularyId))
  assert.equal(steps.filter((step) => step.kind === 'review' && introduced.has(step.vocabularyId)).length, 5)
  assert.equal(steps.filter((step) => step.vocabularyId.startsWith('old')).length, 10)
  // The most overdue reviews come first.
  assert.deepEqual(steps.filter((step) => step.vocabularyId.startsWith('old')).map((step) => step.vocabularyId), Array.from({ length: 10 }, (_, index) => `old${index}`))
})

test('due reviews take the places of new cards and suspend them when piled up', () => {
  assert.equal(plannedNewCards(10, 50, 0), 5)
  assert.equal(plannedNewCards(14, 50, 0), 3)
  assert.equal(plannedNewCards(20, 50, 0), 0)
  assert.equal(plannedNewCards(80, 50, 0), 0)
  const cards = [...Array.from({ length: 25 }, (_, index) => dueCard(`old${index}`)), newCard('new')]
  const { steps } = play(cards, planDeckSession(cards, now, 0))
  assert.equal(steps.length, 20)
  assert.ok(steps.every((step) => step.kind === 'review' && step.vocabularyId.startsWith('old')))
})

test('no more than five new cards a day, later sessions only review', () => {
  assert.equal(plannedNewCards(0, 50, 3), 2)
  assert.equal(plannedNewCards(0, 50, 5), 0)
  const cards = [dueCard('old'), ...Array.from({ length: 10 }, (_, index) => newCard(`new${index}`))]
  const { steps } = play(cards, planDeckSession(cards, now, 5))
  assert.deepEqual(steps, [{ kind: 'review', vocabularyId: 'old' }])
})

test('future reviews are never anticipated: the session ends early', () => {
  const cards = [dueCard('old1'), dueCard('old2'), futureCard('later1'), futureCard('later2')]
  const { steps } = play(cards, planDeckSession(cards, now, 5))
  assert.deepEqual(steps.map((step) => step.vocabularyId), ['old1', 'old2'])
  assert.equal(nextDeckStep(planDeckSession([futureCard('later')], now, 0), [futureCard('later')], now), null)
})

test('a new card is reviewed a few cards after it was introduced and never twice in a row', () => {
  const cards = [...Array.from({ length: 10 }, (_, index) => dueCard(`old${index}`)), ...Array.from({ length: 5 }, (_, index) => newCard(`new${index}`))]
  const { steps } = play(cards, planDeckSession(cards, now, 0))
  for (let index = 1; index < steps.length; index += 1) assert.notEqual(steps[index].vocabularyId, steps[index - 1].vocabularyId)
  for (const step of steps.filter((item) => item.kind === 'introduce')) {
    const introducedAt = steps.indexOf(step)
    const reviewedAt = steps.findIndex((item, index) => index > introducedAt && item.vocabularyId === step.vocabularyId)
    assert.ok(reviewedAt - introducedAt > 3, `${step.vocabularyId} waits other cards`)
  }
})

test('a single new card is still introduced and reviewed', () => {
  const cards = [newCard('only')]
  const { steps } = play(cards, planDeckSession(cards, now, 0))
  assert.deepEqual(steps, [{ kind: 'introduce', vocabularyId: 'only' }, { kind: 'review', vocabularyId: 'only' }])
})

test('a card answered wrong comes back only once due, never right after itself', () => {
  // `play` makes a card answered wrong due at once, as if its ten minutes had passed.
  const cards = [dueCard('old0', 30), dueCard('old1', 20), dueCard('old2', 10)]
  const { steps } = play(cards, planDeckSession(cards, now, 5), (id) => id === 'old0' && !cards[0].failed && (cards[0].failed = true) ? 'again' : 'good')
  assert.deepEqual(steps.map((step) => step.vocabularyId), ['old0', 'old1', 'old2', 'old0'])
  // Still due in ten minutes: not shown again.
  const waiting = [{ vocabularyId: 'again', dueAt: future(10 / 1440), isNew: false }]
  assert.equal(nextDeckStep(planDeckSession(waiting, now, 5), waiting, now), null)
})

test('relearning respects the session limit', () => {
  const cards = Array.from({ length: 30 }, (_, index) => dueCard(`old${index}`, 100 - index))
  const { steps } = play(cards, planDeckSession(cards, now, 5), () => 'again')
  assert.equal(steps.length, sessionPresentationLimit)
})

test('studying more reviews everything still due, and nothing else', () => {
  const cards = [...Array.from({ length: 33 }, (_, index) => dueCard(`old${index}`)), newCard('new'), futureCard('later')]
  const first = play(cards, planDeckSession(cards, now, 0))
  assert.equal(first.steps.length, 20)
  const extra = play(cards, extraDeckSession(first.session))
  assert.equal(extra.steps.length, 33 - 20)
  assert.ok(extra.steps.every((step) => step.kind === 'review' && step.vocabularyId.startsWith('old')))
})

test('the session remembers the new cards it introduced, for its end screen', () => {
  const cards = [dueCard('old'), newCard('a'), newCard('b')]
  const { session } = play(cards, planDeckSession(cards, now, 0))
  assert.deepEqual(session.introduced, ['a', 'b'])
  assert.deepEqual(extraDeckSession(session).introduced, [])
})
