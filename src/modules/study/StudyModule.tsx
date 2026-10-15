import { useEffect, useState } from 'react'
import '../../App.css'
import { loadDeviceProgress, nextReview, rateCard, removeCard, type DeviceCard, type DeviceProgress, type Rating } from '../../experiences/chinese/device-progress'

type Vocabulary = { id: string; hanzi: string; pinyin: string; english: string; portuguese: string; hsk_level: string }
type StudyCard = DeviceCard & { vocabulary: Vocabulary }

const ratings: { id: Rating; label: string; className: string }[] = [
  { id: 'again', label: 'Muito difícil', className: 'again' },
  { id: 'hard', label: 'Difícil', className: 'hard' },
  { id: 'good', label: 'Normal', className: 'good' },
  { id: 'easy', label: 'Fácil', className: 'easy' },
]

function reviewLabel(card: DeviceCard, rating: Rating) {
  const { intervalDays } = nextReview(card, rating)
  if (rating === 'again') return '10 min'
  return intervalDays === 1 ? 'amanhã' : `${intervalDays} dias`
}

function StudyModule({ embedded = false }: { embedded?: boolean }) {
  const [progress, setProgress] = useState<DeviceProgress>(() => loadDeviceProgress())
  const [vocabulary, setVocabulary] = useState<Vocabulary[]>([])
  const [session, setSession] = useState<{ card: StudyCard | null; answerVisible: boolean; reviewed: number } | null>(null)
  const [error, setError] = useState('')
  const [now] = useState(() => new Date().toISOString())

  useEffect(() => {
    void fetch('/api/chinese/vocabulary').then(async (response) => {
      if (!response.ok) throw new Error('Não foi possível carregar o catálogo.')
      setVocabulary(await response.json() as Vocabulary[])
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o catálogo.'))
    const refresh = () => setProgress(loadDeviceProgress())
    window.addEventListener('orbe:chinese-progress', refresh)
    return () => window.removeEventListener('orbe:chinese-progress', refresh)
  }, [])

  const cards = progress.cards.flatMap((card) => {
    const entry = vocabulary.find((item) => item.id === card.vocabularyId)
    return entry ? [{ ...card, vocabulary: entry }] : []
  })
  const due = cards.filter((card) => card.dueAt <= now).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const learned = Object.values(progress.vocabulary).filter((value) => value === 'learned').length

  function nextCard(reviewed = 0) { setSession({ card: due[0] ?? null, answerVisible: false, reviewed }) }
  function nextDueCard(nextProgress: DeviceProgress) {
    return nextProgress.cards.flatMap((card) => {
      const entry = vocabulary.find((item) => item.id === card.vocabularyId)
      return entry ? [{ ...card, vocabulary: entry }] : []
    }).filter((card) => card.dueAt <= new Date().toISOString()).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0] ?? null
  }
  function review(rating: Rating) {
    if (!session?.card) return
    rateCard(progress, session.card.id, rating)
    const nextProgress = loadDeviceProgress()
    setProgress(nextProgress)
    setSession({ card: nextDueCard(nextProgress), answerVisible: false, reviewed: session.reviewed + 1 })
  }
  function finishCard(markLearned: boolean) {
    if (!session?.card) return
    const nextProgress = loadDeviceProgress()
    if (markLearned) nextProgress.vocabulary[session.card.vocabularyId] = 'learned'
    removeCard(nextProgress, session.card.id)
    const saved = loadDeviceProgress()
    setProgress(saved)
    setSession({ card: nextDueCard(saved), answerVisible: false, reviewed: session.reviewed + 1 })
  }

  if (session) return <main className="study-session" aria-label="Sessão de estudo">
    <header><div><span>ESTUDAR</span><strong>Meu dispositivo</strong></div><button type="button" className="secondary" onClick={() => { setSession(null); setProgress(loadDeviceProgress()) }}>Encerrar sessão</button></header>
    <section className="study-session-content"><p className="session-counter">{session.reviewed} {session.reviewed === 1 ? 'card revisado nesta sessão' : 'cards revisados nesta sessão'}</p>
      {!session.card ? <div className="session-complete"><p className="eyebrow">TUDO CERTO</p><h1>Sessão concluída.</h1><button type="button" onClick={() => setSession(null)}>Voltar aos flashcards</button></div> : <article className="focus-card">
        <p className="focus-hanzi">{session.card.vocabulary.hanzi}</p>
        {!session.answerVisible ? <button type="button" className="reveal-answer" onClick={() => setSession({ ...session, answerVisible: true })}>Mostrar resposta</button> : <div className="focus-answer">
          <p>{session.card.vocabulary.pinyin}</p><h2>{session.card.vocabulary.portuguese}</h2><small>{session.card.vocabulary.english} · HSK {session.card.vocabulary.hsk_level}</small>
          <div className="focus-ratings">{ratings.map((rating) => <button key={rating.id} type="button" className={rating.className} onClick={() => review(rating.id)}><span>{rating.label}</span><small>{reviewLabel(session.card!, rating.id)}</small></button>)}</div>
          <div className="focus-card-actions"><button type="button" className="secondary" onClick={() => finishCard(true)}>Marcar como aprendido</button><button type="button" className="card-remove" onClick={() => finishCard(false)}>Remover do baralho</button></div>
        </div>}
      </article>}
    </section>
  </main>

  return <main className={embedded ? 'workspace-view' : 'app-shell'}>
    {!embedded && <header className="app-header"><a className="brand" href="/">orb<span>e</span></a></header>}
    <section className="welcome study-page"><p className="eyebrow">FLASHCARDS</p><h1>Lembre do que importa.</h1><p className="intro">Cards e revisões ficam neste dispositivo.</p>{error && <p className="error">{error}</p>}
      <section className="study-summary"><div><strong>{learned}</strong><span>itens aprendidos</span></div><div><strong>{cards.length}</strong><span>cards criados</span></div><div><strong>{due.length}</strong><span>cards para revisar</span></div></section>
      <section className="study-launch"><div><p className="eyebrow">SESSÃO DE HOJE</p><h2>{due.length ? `${due.length} ${due.length === 1 ? 'card espera' : 'cards esperam'} por você` : 'Nenhum card pendente'}</h2></div><button type="button" onClick={() => nextCard()} disabled={!due.length}>Estudar agora</button></section>
      <section className="library"><h2>Todos os cards</h2>{cards.length === 0 ? <p className="empty">Crie cards a partir de uma leitura chinesa.</p> : <ul>{cards.map((card) => <li key={card.id} className="card-item"><strong>{card.vocabulary.hanzi}</strong><span>{card.vocabulary.portuguese}</span></li>)}</ul>}</section>
    </section>
  </main>
}

export default StudyModule
