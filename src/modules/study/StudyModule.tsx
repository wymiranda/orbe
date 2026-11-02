import { useEffect, useRef, useState } from 'react'
import '../../App.css'
import { newCardsIntroducedToday, nextReview, recordCardPresentation, recordStudyActivity, setCardLearned, setVocabularyLearned, type DeviceCard, type DeviceProgress, type Rating } from './engine/progress-store'
import { completeDeckStep, dailyNewCardLimit, dropDeckCard, extraDeckSession, nextDeckStep, planDeckSession, type DeckSession } from './engine/deck-session'
import type { FlashcardDashboardContext, FlashcardFace, FlashcardSource } from './flashcard-source'
import { declareModuleKnowledge, recordModuleActivity } from '../../learning-paths/module-bridge'
import type { ActivityRequest, ActivityResult, ContentAssessment } from '../../learning-paths/types'

type StudyPhase = 'review-due' | 'learn-new' | 'review-new' | 'complete'
/** `deck` is set for the deck's own sessions (flashcards tab), where the cards follow the deck session plan. */
type StudySession = { phase: StudyPhase; ready: boolean; answerVisible: boolean; pendingIds: string[]; batchIds: string[]; introducedCardIds: string[]; reviewed: number; deck?: DeckSession }
type Item = { id: string }

function visualSource(visual: NonNullable<FlashcardFace['visual']>) { return visual.kind === 'svg' ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(visual.value)}` : visual.value }
function CardVisual({ visual }: { visual: FlashcardFace['visual'] }) {
  if (!visual?.value) return null
  return visual.kind === 'emoji'
    ? <span className="focus-vocabulary-visual focus-vocabulary-emoji" aria-hidden="true">{visual.value}</span>
    : <img className="focus-vocabulary-visual" src={visualSource(visual)} alt="" />
}

const ratings: { id: Rating; label: string; className: string }[] = [
  { id: 'easy', label: 'Fácil', className: 'easy' },
  { id: 'good', label: 'Normal', className: 'good' },
  { id: 'hard', label: 'Difícil', className: 'hard' },
  { id: 'again', label: 'Muito difícil', className: 'again' },
]

function reviewLabel(card: DeviceCard, rating: Rating) {
  const { intervalDays } = nextReview(card, rating)
  if (rating === 'again') return '10 min'
  return intervalDays === 1 ? 'amanhã' : `${intervalDays} dias`
}

function studyStreak(activity: DeviceProgress['activity']) {
  let streak = 0
  for (let offset = 0; offset < 30; offset += 1) {
    const date = new Date()
    date.setDate(date.getDate() - offset)
    const day = activity[date.toISOString().slice(0, 10)]
    if (!day?.reviews && !day?.learned) break
    streak += 1
  }
  return streak
}

/** A word offered to the deck without a card yet: the card is created when it is introduced. */
function offeredCard(vocabularyId: string): DeviceCard { return { vocabularyId, dueAt: '', intervalDays: 0, ease: 2.5, isNew: true, updatedAt: 0 } }

/**
 * The flashcard engine's screen, shared by every language.
 *
 * `vocabulary` replaces the source catalogue with the words to study now (one
 * level, one deck…); with `offerVocabulary` every one of them without a card
 * can be introduced as new, its card created at that moment.
 */
/** Delays before a new word is read aloud on its own, in milliseconds (see the effect in StudyModule). */
const firstWordAutoPlayDelay = 600
const nextWordAutoPlayDelay = 350

function StudyModule<T extends Item>({ source, vocabulary: givenVocabulary, offerVocabulary = false, embedded = false, activity, activityStage, skipActivityIntroduction = false, onComplete, onExit }: { source: FlashcardSource<T>; vocabulary?: T[]; offerVocabulary?: boolean; embedded?: boolean; activity?: ActivityRequest | null; activityStage?: 'learn' | 'review'; skipActivityIntroduction?: boolean; onComplete?: (result: ActivityResult) => void | Promise<void>; onExit?: () => void | Promise<void> }) {
  const { store } = source
  const [progress, setProgress] = useState<DeviceProgress>(() => store.load())
  const [loadedVocabulary, setLoadedVocabulary] = useState<T[]>(() => givenVocabulary ? [] : source.cachedVocabulary())
  const vocabulary = givenVocabulary ?? loadedVocabulary
  const [session, setSession] = useState<StudySession | null>(null)
  const [error, setError] = useState('')
  const [activityIntroductionSeen, setActivityIntroductionSeen] = useState(false)
  const autoStartedActivity = useRef<string | null>(null)
  const activityAssessments = useRef<ContentAssessment[]>([])
  const completedActivity = useRef<string | null>(null)
  function saveAndSync(next: DeviceProgress) { store.save(next); setProgress(next) }
  function refresh() { setProgress(store.load()) }

  function speak(text: string) { if (!source.speak(text)) setError('Este navegador não oferece leitura em voz alta.') }

  useEffect(() => {
    if (!givenVocabulary) void source.loadVocabulary().then((catalogue) => {
      setLoadedVocabulary(catalogue)
      setError('')
    }).catch((cause: unknown) => {
      const cachedVocabulary = source.cachedVocabulary()
      if (cachedVocabulary.length) {
        setLoadedVocabulary(cachedVocabulary)
        setError('Modo offline: usando o catálogo salvo neste dispositivo.')
      } else setError(cause instanceof Error ? cause.message : 'Conecte-se uma vez para baixar o catálogo de flashcards.')
    })
    const refreshVocabulary = () => setLoadedVocabulary(source.cachedVocabulary())
    window.addEventListener(store.changeEvent, refresh)
    if (source.vocabularyEvent) window.addEventListener(source.vocabularyEvent, refreshVocabulary)
    return () => { window.removeEventListener(store.changeEvent, refresh); if (source.vocabularyEvent) window.removeEventListener(source.vocabularyEvent, refreshVocabulary) }
  // The source is fixed for the life of the screen; a new one remounts it (key).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => window.speechSynthesis?.cancel(), [])
  useEffect(() => { autoStartedActivity.current = null; activityAssessments.current = []; completedActivity.current = null; setSession(null); setActivityIntroductionSeen(false) }, [activity?.id])

  const vocabularyById = new Map(vocabulary.map((item) => [item.id, item]))
  /** Cards that can be studied now: the deck's cards of this vocabulary, then the words offered without one. */
  function studyCards(current: DeviceProgress) {
    const inDeck = new Set(current.cards.map((card) => card.vocabularyId))
    const offered = offerVocabulary ? vocabulary.filter((item) => !inDeck.has(item.id) && current.studyTombstones[item.id] === undefined && current.vocabulary[item.id] !== 'learned').map((item) => offeredCard(item.id)) : []
    return [...current.cards.filter((card) => vocabularyById.has(card.vocabularyId)), ...offered]
  }

  const activityContentIds = new Set(activity?.content.map((content) => content.id) ?? [])
  const activityOrder = new Map((activity?.content ?? []).map((content, index) => [content.id, index]))
  const cards = studyCards(progress).flatMap((card) => !activity || activityContentIds.has(card.vocabularyId) ? [{ ...card, vocabulary: vocabularyById.get(card.vocabularyId)! }] : [])
  const deckSize = cards.filter((card) => card.updatedAt > 0).length
  const now = new Date().toISOString()
  const activityCardOrder = (left: typeof cards[number], right: typeof cards[number]) => (activityOrder.get(left.vocabularyId) ?? Number.MAX_SAFE_INTEGER) - (activityOrder.get(right.vocabularyId) ?? Number.MAX_SAFE_INTEGER)
  const due = cards.filter((card) => !card.isNew && (activity ? true : card.dueAt <= now)).sort(activity ? activityCardOrder : (a, b) => a.dueAt.localeCompare(b.dueAt))
  // Offered words (updatedAt 0) keep the order of the vocabulary, after the cards already in the deck.
  const newCards = cards.filter((card) => card.isNew).sort(activity ? activityCardOrder : (a, b) => (a.updatedAt === 0 || b.updatedAt === 0) ? Number(a.updatedAt === 0) - Number(b.updatedAt === 0) : a.updatedAt - b.updatedAt)
  const learned = Object.values(progress.vocabulary).filter((value) => value === 'learned').length
  const streak = studyStreak(progress.activity)
  const learning = Object.values(progress.vocabulary).filter((value) => value === 'learning').length
  const canStudy = due.length > 0 || (newCards.length > 0 && newCardsIntroducedToday(progress) < dailyNewCardLimit)

  const cardsById = new Map(cards.map((card) => [card.vocabularyId, card]))
  const sessionCard = session?.ready ? cardsById.get(session.pendingIds[0]) ?? null : null
  const face = sessionCard ? source.face(sessionCard.vocabulary) : null
  // A new word is heard as soon as the learner can take it in. The first card waits for the whole
  // screen to change (about 600 ms to settle on a new layout); the next ones for the card to be read
  // (about 350 ms: noticing the change, then looking at the word). ▶ still plays it again.
  const autoPlayedCard = useRef<string | null>(null)
  const learningCardId = session?.phase === 'learn-new' && face?.speech ? sessionCard?.vocabularyId ?? null : null
  useEffect(() => {
    if (!learningCardId || !face?.speech) { if (!session) autoPlayedCard.current = null; return }
    const delay = autoPlayedCard.current === null ? firstWordAutoPlayDelay : nextWordAutoPlayDelay
    autoPlayedCard.current = learningCardId
    const text = face.speech
    const timer = window.setTimeout(() => { source.speak(text) }, delay)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learningCardId])

  function deckCards() { return studyCards(store.load()) }
  function showDeckStep(deck: DeckSession) {
    const step = nextDeckStep(deck, deckCards(), new Date().toISOString())
    setSession(step
      ? { phase: step.kind === 'introduce' ? 'learn-new' : 'review-due', ready: true, answerVisible: false, pendingIds: [step.vocabularyId], batchIds: [], introducedCardIds: [], reviewed: 0, deck }
      : { phase: 'complete', ready: false, answerVisible: false, pendingIds: [], batchIds: [], introducedCardIds: [], reviewed: 0, deck })
  }
  function startSession() { showDeckStep(planDeckSession(deckCards(), new Date().toISOString(), newCardsIntroducedToday(store.load()))) }
  function studyMore() { if (session?.deck) showDeckStep(extraDeckSession(session.deck)) }
  function leaveSession() { setSession(null); refresh(); void onExit?.() }
  useEffect(() => {
    if (!activity || (!skipActivityIntroduction && !activityIntroductionSeen) || autoStartedActivity.current === activity.id || session || (!due.length && !newCards.length)) return
    autoStartedActivity.current = activity.id
    const batchIds = cards.map((card) => card.vocabularyId)
    const phase = activityStage === 'review' ? 'review-new' : 'learn-new'
    setSession({ phase, ready: true, answerVisible: false, pendingIds: batchIds, batchIds, introducedCardIds: activityStage === 'review' ? batchIds : [], reviewed: 0 })
  }, [activity?.id, activityIntroductionSeen, activityStage, cards, due.length, newCards.length, session, skipActivityIntroduction])
  function startNewBatch(current: StudySession) {
    const batchIds = newCards.filter((card) => !current.introducedCardIds.includes(card.vocabularyId)).slice(0, 10).map((card) => card.vocabularyId)
    setSession(batchIds.length ? { ...current, phase: 'learn-new', ready: true, answerVisible: false, pendingIds: batchIds, batchIds } : { ...current, phase: 'complete', ready: false, answerVisible: false, pendingIds: [], batchIds: [] })
  }
  function advanceReview(current: StudySession, counted = true) {
    const pendingIds = current.pendingIds.slice(1)
    if (pendingIds.length) { setSession({ ...current, answerVisible: false, pendingIds, reviewed: current.reviewed + (counted ? 1 : 0) }); return }
    if (current.phase === 'review-due') { setSession({ ...current, phase: 'learn-new', ready: false, answerVisible: false, pendingIds: [], batchIds: [], reviewed: current.reviewed + (counted ? 1 : 0) }); return }
    if (activity && current.phase === 'review-new' && completedActivity.current !== activity.id) {
      completedActivity.current = activity.id
      void onComplete?.({ requestId: activity.id, moduleId: 'study', language: activity.language, completedAt: Date.now(), assessments: activityAssessments.current })
    }
    setSession({ ...current, phase: 'complete', ready: false, answerVisible: false, pendingIds: [], reviewed: current.reviewed + (counted ? 1 : 0) })
  }
  function review(rating: Rating) {
    if (!sessionCard || !session || (session.phase !== 'review-due' && session.phase !== 'review-new')) return
    store.rateCard(store.load(), sessionCard.vocabularyId, rating)
    const score = rating === 'again' ? 0 : rating === 'hard' ? .55 : rating === 'good' ? .82 : 1
    if (activity) activityAssessments.current.push({ contentId: sessionCard.vocabularyId, skill: activity.skill, score, usedHint: false })
    else void recordModuleActivity({ moduleId: 'study', language: source.language, completedAt: Date.now(), assessments: [{ contentId: sessionCard.vocabularyId, skill: 'recognition', score, usedHint: false }, { contentId: sessionCard.vocabularyId, skill: 'retention', score, usedHint: false }] })
    const nextProgress = store.load()
    recordCardPresentation(nextProgress, sessionCard.vocabularyId)
    saveAndSync(nextProgress)
    if (session.deck) { showDeckStep(completeDeckStep(session.deck, { kind: 'review', vocabularyId: sessionCard.vocabularyId })); return }
    advanceReview(session)
  }
  function finishIntroduction() {
    if (!sessionCard || !session || session.phase !== 'learn-new') return
    const introducedCardIds = [...session.introducedCardIds, sessionCard.vocabularyId]
    if (activity) activityAssessments.current.push({ contentId: sessionCard.vocabularyId, skill: 'exposure' })
    else void recordModuleActivity({ moduleId: 'study', language: source.language, completedAt: Date.now(), assessments: [{ contentId: sessionCard.vocabularyId, skill: 'exposure' }] })
    // An offered word joins the deck the moment it is introduced.
    if (sessionCard.updatedAt === 0) store.createCard(store.load(), sessionCard.vocabularyId)
    const presented = store.load()
    recordCardPresentation(presented, sessionCard.vocabularyId, Boolean(session.deck))
    saveAndSync(presented)
    if (session.deck) { showDeckStep(completeDeckStep(session.deck, { kind: 'introduce', vocabularyId: sessionCard.vocabularyId })); return }
    const pendingIds = session.pendingIds.slice(1)
    if (pendingIds.length) { setSession({ ...session, pendingIds, introducedCardIds }); return }
    if (activity && activityStage === 'learn' && completedActivity.current !== activity.id) {
      completedActivity.current = activity.id
      void onComplete?.({ requestId: activity.id, moduleId: 'study', language: activity.language, completedAt: Date.now(), assessments: activityAssessments.current })
      setSession({ ...session, phase: 'complete', ready: false, answerVisible: false, pendingIds: [], introducedCardIds })
      return
    }
    setSession({ ...session, phase: 'review-new', ready: false, answerVisible: false, pendingIds: session.batchIds, introducedCardIds })
  }
  function markCardAsLearned() {
    if (!sessionCard) return
    const nextProgress = store.load()
    const wasLearned = nextProgress.vocabulary[sessionCard.vocabularyId] === 'learned'
    setVocabularyLearned(nextProgress, sessionCard.vocabularyId)
    if (!wasLearned) recordStudyActivity(nextProgress, { learned: 1 })
    setCardLearned(nextProgress, sessionCard.vocabularyId)
    void declareModuleKnowledge(sessionCard.vocabularyId, 'known')
    saveAndSync(nextProgress)
  }
  function removeCurrentCard() {
    if (!sessionCard || !session) return
    store.removeCard(store.load(), sessionCard.vocabularyId)
    refresh()
    if (session.deck) { showDeckStep(dropDeckCard(session.deck, sessionCard.vocabularyId)); return }
    if (session.phase === 'learn-new') finishIntroduction()
    else advanceReview(session, false)
  }

  if (activity?.introduction && !skipActivityIntroduction && !activityIntroductionSeen) return <main className="study-session" aria-label="Introdução da trilha"><section className="study-session-content"><div className="study-phase-banner"><p className="eyebrow">PRÓXIMA ETAPA</p><h1>{activity.introduction.title}</h1><p>{activity.introduction.description}</p><button type="button" onClick={() => setActivityIntroductionSeen(true)}>Começar</button></div></section></main>

  if (session) {
    const introducedWords = session.deck?.introduced.flatMap((id) => vocabularyById.get(id) ?? []) ?? []
    const completeExtra = session.deck && introducedWords.length > 0 ? source.sessionComplete?.(introducedWords, vocabulary) : null
    return <main className="study-session" aria-label="Sessão de estudo">
      <header><div><span>FLASHCARDS</span><strong>Meu ritmo</strong></div><button type="button" className="secondary" onClick={leaveSession}>Encerrar sessão</button></header>
      <section className="study-session-content">{!session.deck && <p className="session-counter">{session.phase === 'learn-new' && 'APRENDER · '}{session.reviewed} {session.reviewed === 1 ? 'card revisado nesta sessão' : 'cards revisados nesta sessão'}</p>}
        {session.phase === 'complete' && session.deck ? <div className="session-complete"><p className="eyebrow">TUDO CERTO</p><h1>Sessão concluída.</h1>{completeExtra && <div className="session-complete-wall">{completeExtra}</div>}<div className="session-complete-actions stacked">{due.length > 0 && <button type="button" onClick={studyMore}>Estudar mais</button>}<button type="button" className="secondary" onClick={leaveSession}>Sair</button></div></div> : session.phase === 'complete' && activity ? <div className="session-game-loading" aria-busy="true" /> : session.phase === 'complete' ? <div className="session-complete"><p className="eyebrow">TUDO CERTO</p><h1>Sessão concluída.</h1><p>{newCards.length ? 'Você pode encerrar por hoje ou aprender mais dez cards.' : 'Você concluiu tudo o que estava disponível hoje.'}</p><div className="session-complete-actions"><button type="button" onClick={() => setSession(null)}>Finalizar por hoje</button>{newCards.length > 0 && <button type="button" className="secondary" onClick={() => startNewBatch(session)}>Estudar mais 10</button>}</div></div> : !sessionCard || !face ? <div className="session-complete"><p>Não há cards disponíveis nesta etapa.</p><button type="button" onClick={() => setSession(null)}>Voltar aos flashcards</button></div> : <article className={`focus-card${face.visual?.value ? ' focus-card-has-visual' : ''}`}><div className="focus-card-presentation">
          <p className={face.frontClassName ? `focus-hanzi ${face.frontClassName}` : 'focus-hanzi'}>{face.front}</p>
          <CardVisual visual={face.visual} />
          {session.phase === 'learn-new' ? <div className="focus-answer">
            {face.reading && <p>{face.reading}</p>}{face.speech && <button type="button" className="secondary focus-speak" onClick={() => speak(face.speech!)} aria-label="Ouvir pronúncia" title="Ouvir pronúncia">▶</button>}<h2 className={face.meaningClassName}>{face.meaning}</h2>{face.detail && <small>{face.detail}</small>}
            {face.explanation && <div className="focus-explanation"><p>{face.explanation.text}</p><ul>{face.explanation.examples.map((example) => <li key={example.text}><button type="button" className="secondary focus-speak" onClick={() => speak(example.text)} aria-label="Ouvir pronúncia" title="Ouvir pronúncia">▶</button><span><strong lang="zh-Hans">{example.text}</strong><small>{example.reading}</small><em>{example.meaning}</em></span></li>)}</ul></div>}
            <div className="focus-card-actions"><button type="button" onClick={finishIntroduction}>OK, estudar este card</button></div>
          </div> : !session.answerVisible ? <div className="focus-reveal-actions">{face.speech && <button type="button" className="secondary focus-speak" onClick={() => speak(face.speech!)} aria-label="Ouvir pronúncia" title="Ouvir pronúncia">▶</button>}<button type="button" className="reveal-answer" onClick={() => setSession({ ...session, answerVisible: true })}>Mostrar resposta</button></div> : <div className="focus-answer">
            {face.reading && <p>{face.reading}</p>}<h2 className={face.meaningClassName}>{face.meaning}</h2>{face.detail && <small>{face.detail}</small>}
            <div className="focus-ratings">{ratings.map((rating) => <button key={rating.id} type="button" className={rating.className} onClick={() => review(rating.id)}><span>{rating.label}</span><small>{reviewLabel(sessionCard, rating.id)}</small></button>)}</div>
            <div className="focus-card-actions"><button type="button" className={progress.vocabulary[sessionCard.vocabularyId] === 'learned' ? 'card-learned' : 'secondary'} aria-pressed={progress.vocabulary[sessionCard.vocabularyId] === 'learned'} onClick={markCardAsLearned}>{progress.vocabulary[sessionCard.vocabularyId] === 'learned' ? 'Marcada como aprendida' : 'Marcar como aprendida'}</button><button type="button" className="card-remove" onClick={removeCurrentCard}>Remover do baralho</button></div>
          </div>}
        </div></article>}
      </section>
    </main>
  }

  // An activity opens its first card by itself: the deck's dashboard is never shown in between.
  if (activity && (due.length > 0 || newCards.length > 0) && (skipActivityIntroduction || activityIntroductionSeen)) return <main className="study-session session-game-session" aria-busy="true"><section className="study-session-content"><div className="session-game-loading" /></section></main>
  const dashboard: FlashcardDashboardContext<T> = { vocabulary, progress, canStudy, dueCount: due.length, newCount: newCards.length, learningCount: learning, startSession, refresh }
  return <main className={embedded ? 'workspace-view' : 'app-shell'}>
    {!embedded && <header className="app-header"><a className="brand" href="/">orb<span>e</span></a></header>}
    <section className="welcome study-page study-dashboard">
      <header className="study-dashboard-hero"><div><h1>Flashcards</h1><p>Revise, aprenda e consolide seu vocabulário</p></div><button type="button" onClick={startSession} disabled={!canStudy}>Estudar cards <span aria-hidden="true">→</span></button></header>
      {source.dashboardTop?.(dashboard)}
      {error && <p className="study-status" role="status">{error}</p>}
      <section className="study-dashboard-metrics" aria-label="Resumo dos flashcards"><article><span className="study-metric-icon review">▣</span><div><strong>{due.length}</strong><p>para revisar hoje</p><i><em style={{ width: `${Math.min(100, due.length * 8)}%` }} /></i></div></article><article><span className="study-metric-icon deck">◒</span><div><strong>{deckSize}</strong><p>no seu baralho</p><i><em style={{ width: `${Math.min(100, deckSize / Math.max(1, vocabulary.length) * 100)}%` }} /></i></div></article><article><span className="study-metric-icon learned">♜</span><div><strong>{learned}</strong><p>itens aprendidos</p><i><em style={{ width: `${Math.min(100, learned / Math.max(1, vocabulary.length) * 100)}%` }} /></i></div></article><article><span className="study-metric-icon streak">▦</span><div><strong>{streak}</strong><p>{streak === 1 ? 'dia de sequência' : 'dias de sequência'}</p><i><em style={{ width: `${Math.min(100, streak * 14)}%` }} /></i></div></article></section>
      {source.dashboardBottom?.(dashboard)}
    </section>
  </main>
}

export default StudyModule
