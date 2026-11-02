import { useEffect, useRef, useState } from 'react'
import '../../App.css'
import { createCardsForVocabulary, loadDeviceProgress, loadOfflineVocabulary, newCardsIntroducedToday, nextReview, rateCard, recordCardPresentation, recordStudyActivity, removeCard, saveDeviceProgress, saveOfflineVocabulary, setCardLearned, setVocabularyLearned, type DeviceCard, type DeviceProgress, type OfflineVocabulary, type Rating } from '../../experiences/chinese/device-progress'
import { completeDeckStep, dailyNewCardLimit, dropDeckCard, extraDeckSession, nextDeckStep, planDeckSession, type DeckSession } from '../../experiences/chinese/deck-session'
import { NewWordsWall } from '../../experiences/chinese/workspace/session-summary'
import { declareModuleKnowledge, recordModuleActivity } from '../../learning-paths/module-bridge'
import type { ActivityRequest, ActivityResult, ContentAssessment } from '../../learning-paths/types'

type Vocabulary = OfflineVocabulary
type StudyPhase = 'review-due' | 'learn-new' | 'review-new' | 'complete'
/** `deck` is set for the deck's own sessions (flashcards tab), where the cards follow the deck session plan. */
type StudySession = { phase: StudyPhase; ready: boolean; answerVisible: boolean; pendingIds: string[]; batchIds: string[]; introducedCardIds: string[]; reviewed: number; deck?: DeckSession }

function vocabularyVisualSource(kind: Vocabulary['visual_kind'], value: string) { return kind === 'svg' ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}` : value }
function VocabularyVisual({ vocabulary }: { vocabulary: Vocabulary }) {
  if (!vocabulary.visual_kind || !vocabulary.visual_value) return null
  return vocabulary.visual_kind === 'emoji'
    ? <span className="focus-vocabulary-visual focus-vocabulary-emoji" aria-hidden="true">{vocabulary.visual_value}</span>
    : <img className="focus-vocabulary-visual" src={vocabularyVisualSource(vocabulary.visual_kind, vocabulary.visual_value)} alt="" />
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

/** `wallLevel`: HSK level of the wall the new cards fly to at the end of a deck study (none without it). */
function StudyModule({ embedded = false, activity, activityStage, skipActivityIntroduction = false, wallLevel, onComplete, onExit }: { embedded?: boolean; activity?: ActivityRequest | null; activityStage?: 'learn' | 'review'; skipActivityIntroduction?: boolean; wallLevel?: string; onComplete?: (result: ActivityResult) => void | Promise<void>; onExit?: () => void | Promise<void> }) {
  const [progress, setProgress] = useState<DeviceProgress>(() => loadDeviceProgress())
  const [vocabulary, setVocabulary] = useState<Vocabulary[]>(() => loadOfflineVocabulary())
  const [session, setSession] = useState<StudySession | null>(null)
  const [error, setError] = useState('')
  const [selectedHskLevel, setSelectedHskLevel] = useState('')
  const [bulkAddMessage, setBulkAddMessage] = useState('')
  const [activityIntroductionSeen, setActivityIntroductionSeen] = useState(false)
  const activeUtterance = useRef<SpeechSynthesisUtterance | null>(null)
  const autoStartedActivity = useRef<string | null>(null)
  const activityAssessments = useRef<ContentAssessment[]>([])
  const completedActivity = useRef<string | null>(null)
  function saveAndSync(next: DeviceProgress) { saveDeviceProgress(next); setProgress(next) }

  function speak(text: string) {
    if (!('speechSynthesis' in window)) { setError('Este navegador não oferece leitura em voz alta.'); return }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'; utterance.rate = 0.8
    activeUtterance.current = utterance
    window.speechSynthesis.speak(utterance)
  }

  useEffect(() => {
    void fetch('/api/chinese/vocabulary').then(async (response) => {
      if (!response.ok) throw new Error('Não foi possível atualizar o catálogo.')
      const catalogue = await response.json() as Vocabulary[]
      saveOfflineVocabulary(catalogue)
      setVocabulary(catalogue)
      setError('')
    }).catch((cause: unknown) => {
      const cachedVocabulary = loadOfflineVocabulary()
      if (cachedVocabulary.length) {
        setVocabulary(cachedVocabulary)
        setError('Modo offline: usando o catálogo salvo neste dispositivo.')
      } else setError(cause instanceof Error ? cause.message : 'Conecte-se uma vez para baixar o catálogo de flashcards.')
    })
    const refresh = () => setProgress(loadDeviceProgress())
    const refreshVocabulary = () => setVocabulary(loadOfflineVocabulary())
    window.addEventListener('niorb:chinese-progress', refresh)
    window.addEventListener('niorb:chinese-vocabulary', refreshVocabulary)
    return () => { window.removeEventListener('niorb:chinese-progress', refresh); window.removeEventListener('niorb:chinese-vocabulary', refreshVocabulary) }
  }, [])

  useEffect(() => () => window.speechSynthesis?.cancel(), [])
  useEffect(() => { autoStartedActivity.current = null; activityAssessments.current = []; completedActivity.current = null; setSession(null); setActivityIntroductionSeen(false) }, [activity?.id])

  const activityContentIds = new Set(activity?.content.map((content) => content.id) ?? [])
  const activityOrder = new Map((activity?.content ?? []).map((content, index) => [content.id, index]))
  const cards = progress.cards.flatMap((card) => {
    const entry = vocabulary.find((item) => item.id === card.vocabularyId)
    return entry && (!activity || activityContentIds.has(card.vocabularyId)) ? [{ ...card, vocabulary: entry }] : []
  })
  const now = new Date().toISOString()
  const activityCardOrder = (left: typeof cards[number], right: typeof cards[number]) => (activityOrder.get(left.vocabularyId) ?? Number.MAX_SAFE_INTEGER) - (activityOrder.get(right.vocabularyId) ?? Number.MAX_SAFE_INTEGER)
  const due = cards.filter((card) => !card.isNew && (activity ? true : card.dueAt <= now)).sort(activity ? activityCardOrder : (a, b) => a.dueAt.localeCompare(b.dueAt))
  const newCards = cards.filter((card) => card.isNew).sort(activity ? activityCardOrder : (a, b) => a.updatedAt - b.updatedAt)
  const learned = Object.values(progress.vocabulary).filter((value) => value === 'learned').length
  const streak = studyStreak(progress.activity)
  const learning = Object.values(progress.vocabulary).filter((value) => value === 'learning').length
  const hskLevels = [...new Set(vocabulary.map((item) => item.hsk_level))].sort((first, second) => Number(first) - Number(second))
  const selectedHskVocabulary = vocabulary.filter((item) => item.hsk_level === selectedHskLevel)
  const existingVocabularyIds = new Set(progress.cards.map((card) => card.vocabularyId))
  const cardsToAdd = selectedHskVocabulary.filter((item) => !existingVocabularyIds.has(item.id))
  const canStudy = due.length > 0 || (newCards.length > 0 && newCardsIntroducedToday(progress) < dailyNewCardLimit)

  const cardsById = new Map(cards.map((card) => [card.vocabularyId, card]))
  const sessionCard = session?.ready ? cardsById.get(session.pendingIds[0]) ?? null : null

  const catalogueIds = new Set(vocabulary.map((item) => item.id))
  function deckCards() { return loadDeviceProgress().cards.filter((card) => catalogueIds.has(card.vocabularyId)) }
  function showDeckStep(deck: DeckSession) {
    const step = nextDeckStep(deck, deckCards(), new Date().toISOString())
    setSession(step
      ? { phase: step.kind === 'introduce' ? 'learn-new' : 'review-due', ready: true, answerVisible: false, pendingIds: [step.vocabularyId], batchIds: [], introducedCardIds: [], reviewed: 0, deck }
      : { phase: 'complete', ready: false, answerVisible: false, pendingIds: [], batchIds: [], introducedCardIds: [], reviewed: 0, deck })
  }
  function startSession() { showDeckStep(planDeckSession(deckCards(), new Date().toISOString(), newCardsIntroducedToday(loadDeviceProgress()))) }
  function studyMore() { if (session?.deck) showDeckStep(extraDeckSession(session.deck)) }
  function leaveSession() { setSession(null); setProgress(loadDeviceProgress()); void onExit?.() }
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
    rateCard(progress, sessionCard.vocabularyId, rating)
    const score = rating === 'again' ? 0 : rating === 'hard' ? .55 : rating === 'good' ? .82 : 1
    if (activity) activityAssessments.current.push({ contentId: sessionCard.vocabularyId, skill: activity.skill, score, usedHint: false })
    else void recordModuleActivity({ moduleId: 'study', language: 'zh-Hans', completedAt: Date.now(), assessments: [{ contentId: sessionCard.vocabularyId, skill: 'recognition', score, usedHint: false }, { contentId: sessionCard.vocabularyId, skill: 'retention', score, usedHint: false }] })
    const nextProgress = loadDeviceProgress()
    recordCardPresentation(nextProgress, sessionCard.vocabularyId)
    saveAndSync(nextProgress)
    if (session.deck) { showDeckStep(completeDeckStep(session.deck, { kind: 'review', vocabularyId: sessionCard.vocabularyId })); return }
    advanceReview(session)
  }
  function finishIntroduction() {
    if (!sessionCard || !session || session.phase !== 'learn-new') return
    const introducedCardIds = [...session.introducedCardIds, sessionCard.vocabularyId]
    if (activity) activityAssessments.current.push({ contentId: sessionCard.vocabularyId, skill: 'exposure' })
    else void recordModuleActivity({ moduleId: 'study', language: 'zh-Hans', completedAt: Date.now(), assessments: [{ contentId: sessionCard.vocabularyId, skill: 'exposure' }] })
    const presented = loadDeviceProgress()
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
    const nextProgress = loadDeviceProgress()
    const wasLearned = nextProgress.vocabulary[sessionCard.vocabularyId] === 'learned'
    setVocabularyLearned(nextProgress, sessionCard.vocabularyId)
    if (!wasLearned) recordStudyActivity(nextProgress, { learned: 1 })
    setCardLearned(nextProgress, sessionCard.vocabularyId)
    void declareModuleKnowledge(sessionCard.vocabularyId, 'known')
    saveAndSync(nextProgress)
  }
  function removeCurrentCard() {
    if (!sessionCard || !session) return
    const nextProgress = loadDeviceProgress()
    removeCard(nextProgress, sessionCard.vocabularyId)
    const saved = loadDeviceProgress()
    setProgress(saved)
    if (session.deck) { showDeckStep(dropDeckCard(session.deck, sessionCard.vocabularyId)); return }
    if (session.phase === 'learn-new') finishIntroduction()
    else advanceReview(session, false)
  }
  function addHskLevel() {
    if (!selectedHskLevel) return
    const added = createCardsForVocabulary(loadDeviceProgress(), selectedHskVocabulary.map((item) => item.id))
    const next = loadDeviceProgress(); setProgress(next)
    setBulkAddMessage(added ? `${added} ${added === 1 ? 'card foi adicionado' : 'cards foram adicionados'} do HSK ${selectedHskLevel}.` : `Todos os cards do HSK ${selectedHskLevel} já estão no seu baralho.`)
  }


  if (activity?.introduction && !skipActivityIntroduction && !activityIntroductionSeen) return <main className="study-session" aria-label="Introdução da trilha"><section className="study-session-content"><div className="study-phase-banner"><p className="eyebrow">PRÓXIMA ETAPA</p><h1>{activity.introduction.title}</h1><p>{activity.introduction.description}</p><button type="button" onClick={() => setActivityIntroductionSeen(true)}>Começar</button></div></section></main>

  if (session) return <main className="study-session" aria-label="Sessão de estudo">
    <header><div><span>FLASHCARDS</span><strong>Meu ritmo</strong></div><button type="button" className="secondary" onClick={leaveSession}>Encerrar sessão</button></header>
    <section className="study-session-content">{!session.deck && <p className="session-counter">{session.phase === 'learn-new' && 'APRENDER · '}{session.reviewed} {session.reviewed === 1 ? 'card revisado nesta sessão' : 'cards revisados nesta sessão'}</p>}
      {session.phase === 'complete' && session.deck ? <div className="session-complete"><p className="eyebrow">TUDO CERTO</p><h1>Sessão concluída.</h1>{wallLevel && session.deck.introduced.length > 0 && <div className="session-complete-wall"><NewWordsWall newWords={session.deck.introduced.flatMap((id) => vocabulary.filter((item) => item.id === id))} level={wallLevel} vocabulary={vocabulary} /></div>}<div className="session-complete-actions stacked">{due.length > 0 && <button type="button" onClick={studyMore}>Estudar mais</button>}<button type="button" className="secondary" onClick={leaveSession}>Sair</button></div></div> : session.phase === 'complete' && activity ? <div className="session-game-loading" aria-busy="true" /> : session.phase === 'complete' ? <div className="session-complete"><p className="eyebrow">TUDO CERTO</p><h1>Sessão concluída.</h1><p>{newCards.length ? 'Você pode encerrar por hoje ou aprender mais dez cards.' : 'Você concluiu tudo o que estava disponível hoje.'}</p><div className="session-complete-actions"><button type="button" onClick={() => setSession(null)}>Finalizar por hoje</button>{newCards.length > 0 && <button type="button" className="secondary" onClick={() => startNewBatch(session)}>Estudar mais 10</button>}</div></div> : !sessionCard ? <div className="session-complete"><p>Não há cards disponíveis nesta etapa.</p><button type="button" onClick={() => setSession(null)}>Voltar aos flashcards</button></div> : <article className={`focus-card${sessionCard.vocabulary.visual_value ? ' focus-card-has-visual' : ''}`}><div className="focus-card-presentation">
        <p className="focus-hanzi">{sessionCard.vocabulary.hanzi}</p>
        <VocabularyVisual vocabulary={sessionCard.vocabulary} />
        {session.phase === 'learn-new' ? <div className="focus-answer">
          <p>{sessionCard.vocabulary.pinyin}</p><button type="button" className="secondary focus-speak" onClick={() => speak(sessionCard.vocabulary.hanzi)} aria-label="Ouvir pronúncia" title="Ouvir pronúncia">▶</button><h2>{sessionCard.vocabulary.portuguese}</h2><small>{sessionCard.vocabulary.english} · HSK {sessionCard.vocabulary.hsk_level}</small>
          <div className="focus-card-actions"><button type="button" onClick={finishIntroduction}>OK, estudar este card</button></div>
        </div> : !session.answerVisible ? <div className="focus-reveal-actions"><button type="button" className="secondary focus-speak" onClick={() => speak(sessionCard.vocabulary.hanzi)} aria-label="Ouvir pronúncia" title="Ouvir pronúncia">▶</button><button type="button" className="reveal-answer" onClick={() => setSession({ ...session, answerVisible: true })}>Mostrar resposta</button></div> : <div className="focus-answer">
          <p>{sessionCard.vocabulary.pinyin}</p><h2>{sessionCard.vocabulary.portuguese}</h2><small>{sessionCard.vocabulary.english} · HSK {sessionCard.vocabulary.hsk_level}</small>
          <div className="focus-ratings">{ratings.map((rating) => <button key={rating.id} type="button" className={rating.className} onClick={() => review(rating.id)}><span>{rating.label}</span><small>{reviewLabel(sessionCard, rating.id)}</small></button>)}</div>
          <div className="focus-card-actions"><button type="button" className={progress.vocabulary[sessionCard.vocabularyId] === 'learned' ? 'card-learned' : 'secondary'} aria-pressed={progress.vocabulary[sessionCard.vocabularyId] === 'learned'} onClick={markCardAsLearned}>{progress.vocabulary[sessionCard.vocabularyId] === 'learned' ? 'Marcada como aprendida' : 'Marcar como aprendida'}</button><button type="button" className="card-remove" onClick={removeCurrentCard}>Remover do baralho</button></div>
        </div>}
      </div></article>}
    </section>
  </main>

  return <main className={embedded ? 'workspace-view' : 'app-shell'}>
    {!embedded && <header className="app-header"><a className="brand" href="/">orb<span>e</span></a></header>}
    <section className="welcome study-page study-dashboard">
      <header className="study-dashboard-hero"><div><h1>Flashcards</h1><p>Revise, aprenda e consolide seu vocabulário</p></div><button type="button" onClick={startSession} disabled={!canStudy}>Estudar cards <span aria-hidden="true">→</span></button></header>
      {error && <p className="study-status" role="status">{error}</p>}
      <section className="study-dashboard-metrics" aria-label="Resumo dos flashcards"><article><span className="study-metric-icon review">▣</span><div><strong>{due.length}</strong><p>para revisar hoje</p><i><em style={{ width: `${Math.min(100, due.length * 8)}%` }} /></i></div></article><article><span className="study-metric-icon deck">◒</span><div><strong>{cards.length}</strong><p>no seu baralho</p><i><em style={{ width: `${Math.min(100, cards.length / Math.max(1, vocabulary.length) * 100)}%` }} /></i></div></article><article><span className="study-metric-icon learned">♜</span><div><strong>{learned}</strong><p>itens aprendidos</p><i><em style={{ width: `${Math.min(100, learned / Math.max(1, vocabulary.length) * 100)}%` }} /></i></div></article><article><span className="study-metric-icon streak">▦</span><div><strong>{streak}</strong><p>{streak === 1 ? 'dia de sequência' : 'dias de sequência'}</p><i><em style={{ width: `${Math.min(100, streak * 14)}%` }} /></i></div></article></section>
      <section className="bulk-card-add" aria-labelledby="bulk-card-add-title"><div><p className="eyebrow">ADICIONAR EM LOTE</p><h2 id="bulk-card-add-title">Estude um HSK inteiro</h2><p>Inclua todos os termos de um nível no seu baralho de uma vez.</p></div><div className="bulk-card-controls"><label>Nível HSK<select value={selectedHskLevel} onChange={(event) => { setSelectedHskLevel(event.target.value); setBulkAddMessage('') }}><option value="">Escolha um nível</option>{hskLevels.map((level) => <option key={level} value={level}>HSK {level}</option>)}</select></label><button type="button" onClick={addHskLevel} disabled={!selectedHskLevel || !cardsToAdd.length}>Adicionar {selectedHskLevel ? `HSK ${selectedHskLevel}` : 'cards'}</button></div>{selectedHskLevel && <p className="bulk-card-status">{cardsToAdd.length ? `${cardsToAdd.length} de ${selectedHskVocabulary.length} termos serão adicionados.` : `Todos os ${selectedHskVocabulary.length} termos deste nível já estão no seu baralho.`}</p>}{bulkAddMessage && <p className="bulk-card-status" role="status">{bulkAddMessage}</p>}</section>
      <section className="study-options" aria-labelledby="study-options-title"><h2 id="study-options-title">Opções de estudo</h2><div><article><span className="study-option-icon play">▷</span><h3>Revisão inteligente</h3><p>Veja os cards que precisam ser revisados agora.</p><button type="button" onClick={startSession} disabled={!canStudy}>Revisar agora →</button></article><article><span className="study-option-icon bolt">ϟ</span><h3>Estudo focado</h3><p>Adicione um HSK inteiro ou escolha um nível para praticar.</p><a href="#adicionar-hsk">Escolher tema</a></article><article><span className="study-option-icon shuffle">↝</span><h3>Seu baralho</h3><p>{learning} itens em aprendizagem e {newCards.length} novos para conhecer.</p><a href="#seu-baralho">Ver baralho</a></article></div></section>
    </section>
  </main>
}

export default StudyModule
