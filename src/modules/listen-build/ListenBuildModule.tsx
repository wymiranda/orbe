import { useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import '../../App.css'
import { recordModuleActivity } from '../../learning-paths/module-bridge'
import type { ActivityRequest, ActivityResult } from '../../learning-paths/types'
import { answerIsCorrect, buildRound, buildRounds, type ListeningRound, type ListeningSentence } from './listen-build'

/*
 * Ouça e monte (听写): hear a sentence and rebuild it with word cards.
 * It trains listening; the module knows nothing about a specific language:
 * an experience hands it a ListeningSource with sentences and a voice.
 */

export const listeningGameName = 'Ouça e monte'
export type { ListeningSentence } from './listen-build'
export type ListeningVoiceStatus = 'available' | 'missing' | 'unknown' | 'unsupported'
/** A choice of the setup screen (level, difficulty…); its value is handed back to loadSentences. */
export type ListeningFilter = { id: string; label: string; options: { value: string; label: string }[]; initial: string }

export type ListeningSource = {
  /** BCP-47 language of the sentences, reported with the activity result. */
  language: string
  /** Shown in the session header when no trail objective is available. */
  label: string
  /** Setup screen description. */
  intro: string
  /** Shown instead of the game when the device cannot speak the language. */
  missingVoiceMessage: string
  /** Optional choices of the setup screen; the sentences are reloaded whenever one changes. */
  filters?: ListeningFilter[]
  loadSentences: (selection?: Record<string, string>) => Promise<ListeningSentence[]>
  /** Rare high-stakes round injected into an otherwise ordinary session. */
  loadBrutalSentences?: () => Promise<ListeningSentence[]>
  voiceStatus: () => Promise<ListeningVoiceStatus>
  speak: (text: string) => void
}

type Attempt = { sentence: ListeningSentence; correct: boolean; responseMs: number }

const counts = [5, 10]
const sessionCount = 3
const brutalSurpriseChance = .01

function ListenBuildModule({ source, embedded = false, activity, sessionMode = false, onComplete, onExit, onUnavailable }: {
  source: ListeningSource
  embedded?: boolean
  activity?: ActivityRequest | null
  /** Played as one step of the daily session: starts at once and hands control back at the end. */
  sessionMode?: boolean
  onComplete?: (result: ActivityResult) => void | Promise<void>
  onExit?: () => void | Promise<void>
  /** Session mode only: there is nothing to play (no sentences or no voice). Defaults to onExit. */
  onUnavailable?: () => void | Promise<void>
}) {
  const [sentences, setSentences] = useState<ListeningSentence[] | null>(null)
  const [voice, setVoice] = useState<ListeningVoiceStatus | null>(null)
  const [count, setCount] = useState(5)
  const [selection, setSelection] = useState<Record<string, string>>(() => Object.fromEntries((source.filters ?? []).map((filter) => [filter.id, filter.initial])))
  const [rounds, setRounds] = useState<ListeningRound[]>([])
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState<string[]>([])
  const [checked, setChecked] = useState(false)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [finished, setFinished] = useState(false)
  const [brutalRoundIndex, setBrutalRoundIndex] = useState<number | null>(null)
  const [brutalAlert, setBrutalAlert] = useState(false)
  const [error, setError] = useState('')
  const startedAt = useRef(0)
  const autoStarted = useRef(false)

  useEffect(() => {
    let active = true
    void source.loadSentences(selection)
      .then((items) => { if (active) setSentences(items) })
      .catch((cause: unknown) => { if (active) { setSentences([]); setError(cause instanceof Error ? cause.message : 'Não foi possível preparar o jogo.') } })
    return () => { active = false }
  }, [source, selection])
  useEffect(() => {
    let active = true
    void source.voiceStatus().then((status) => { if (active) setVoice(status) })
    return () => { active = false }
  }, [source])

  const available = useMemo(() => {
    if (!sentences) return []
    if (!activity) return sentences
    const ids = new Set(activity.content.map((content) => content.id))
    return sentences.filter((sentence) => sentence.contentIds.some((id) => ids.has(id)))
  }, [activity, sentences])
  const voiceBlocked = voice === 'missing' || voice === 'unsupported'
  const playable = Boolean(available.length && voice && !voiceBlocked)
  const current = rounds[index]
  const correct = Boolean(current && checked && answerIsCorrect(current, chosen))
  const hits = attempts.filter((attempt) => attempt.correct).length
  const seconds = attempts.length ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.responseMs, 0) / attempts.length / 1000) : 0

  async function start(amount = count) {
    if (!sentences || !voice) return
    if (voiceBlocked) { setError(source.missingVoiceMessage); return }
    if (!available.length) { setError('Ainda não há frases suficientes para jogar.'); return }
    let nextRounds = buildRounds(available, amount)
    let nextBrutalIndex: number | null = null
    if (source.loadBrutalSentences && Math.random() < brutalSurpriseChance) {
      try {
        const brutalSentences = (await source.loadBrutalSentences()).filter((sentence) => sentence.tokens.length >= 2)
        const surprise = brutalSentences[Math.floor(Math.random() * brutalSentences.length)]
        if (surprise && nextRounds.length) {
          nextBrutalIndex = Math.floor(Math.random() * nextRounds.length)
          nextRounds[nextBrutalIndex] = buildRound(surprise, [...available, ...brutalSentences].flatMap((sentence) => sentence.tokens))
        }
      } catch {
        // A normal session must never fail because a surprise round is unavailable.
      }
    }
    setError(''); setRounds(nextRounds); setBrutalRoundIndex(nextBrutalIndex); setBrutalAlert(false); setIndex(0); setChosen([]); setChecked(false); setAttempts([]); setFinished(false); startedAt.current = performance.now()
  }

  useEffect(() => {
    if (!sessionMode || !sentences || !voice || autoStarted.current) return
    autoStarted.current = true
    if (playable) void start(sessionCount)
    else void (onUnavailable ?? onExit)?.()
  }, [sessionMode, sentences, voice])

  useEffect(() => {
    if (!current || finished || index !== brutalRoundIndex) return
    setBrutalAlert(true)
    window.navigator.vibrate?.([50, 35, 50])
    const timeout = window.setTimeout(() => setBrutalAlert(false), 1500)
    return () => window.clearTimeout(timeout)
  }, [current, finished, index, brutalRoundIndex])

  // Each new sentence is spoken once on arrival; the learner can replay it.
  useEffect(() => { if (current && !finished && !brutalAlert) source.speak(current.sentence.text) }, [current, finished, brutalAlert])
  useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel() }, [])

  function choose(cardId: string) { if (!checked && !chosen.includes(cardId)) setChosen((items) => [...items, cardId]) }
  function remove(cardId: string) { if (!checked) setChosen((items) => items.filter((item) => item !== cardId)) }

  function check() {
    if (!current || checked || !chosen.length) return
    setChecked(true)
    setAttempts((items) => [...items, { sentence: current.sentence, correct: answerIsCorrect(current, chosen), responseMs: Math.round(performance.now() - startedAt.current) }])
  }

  function next() {
    if (!current || !checked) return
    if (index + 1 < rounds.length) { setIndex((value) => value + 1); setChosen([]); setChecked(false); startedAt.current = performance.now(); return }
    const result: ActivityResult = {
      requestId: activity?.id,
      moduleId: 'listen-build',
      language: activity?.language ?? source.language,
      completedAt: Date.now(),
      assessments: attempts.flatMap((attempt) => attempt.sentence.contentIds.map((contentId) => ({ contentId, skill: 'comprehension' as const, correct: attempt.correct, score: attempt.correct ? 1 : 0, usedHint: false }))),
    }
    if (activity || sessionMode) void onComplete?.(result)
    else void recordModuleActivity(result)
    if (!sessionMode) setFinished(true)
  }

  function leave() { setRounds([]); setFinished(false); void onExit?.() }

  if (current && !finished) {
    const cardText = (id: string) => current.cards.find((card) => card.id === id)?.text
    return <main className="scene-certa-session listen-build" aria-label={`Jogo ${listeningGameName}`}>
      {brutalAlert && <div className="brutal-surprise" role="alert"><strong>BRUTAL</strong></div>}
      <header><div><span>{listeningGameName.toUpperCase()}</span><strong>{sessionMode ? 'Sessão de hoje' : activity?.objective ?? source.label}</strong></div><button type="button" className="secondary" onClick={leave}>Sair</button></header>
      <section className="scene-certa-content">
        <p className="session-counter">{index + 1} de {rounds.length} · {hits} {hits === 1 ? 'acerto' : 'acertos'}</p>
        <article className="listen-build-prompt">
          <button type="button" className="listen-build-play" onClick={() => source.speak(current.sentence.text)} aria-label="Ouvir pronúncia"><Play aria-hidden="true" size={30} strokeWidth={2} fill="currentColor" /></button>
          {checked && <div className="listen-build-reveal"><p lang={source.language}>{current.sentence.text}</p>{current.sentence.reading && <small>{current.sentence.reading}</small>}</div>}
        </article>
        <div className="quiz-order-answer listen-build-answer" lang={source.language}>
          {chosen.length
            ? chosen.map((id) => <button type="button" key={id} disabled={checked} onClick={() => remove(id)}>{cardText(id)}</button>)
            : <span>Monte a resposta abaixo.</span>}
        </div>
        <div className="listen-build-cards" lang={source.language}>
          {current.cards.map((card) => <button type="button" key={card.id} className="secondary" disabled={checked || chosen.includes(card.id)} onClick={() => choose(card.id)}>{card.text}</button>)}
        </div>
        {!checked && <div className="listen-build-actions"><button type="button" onClick={check} disabled={!chosen.length}>Confirmar resposta</button></div>}
        {checked && <div className={correct ? 'scene-certa-feedback correct' : 'scene-certa-feedback incorrect'}>
          <span>{correct ? 'Correto.' : `Era: ${current.sentence.text}`}</span>
          <button type="button" onClick={next}>{index + 1 === rounds.length ? (sessionMode ? 'Continuar' : 'Ver resultado') : 'Próxima'}</button>
        </div>}
      </section>
    </main>
  }

  if (finished) return <main className="scene-certa-session listen-build"><section className="scene-certa-content"><div className="scene-certa-complete">
    <p className="eyebrow">{listeningGameName.toUpperCase()}</p>
    <h1>{hits} de {rounds.length}</h1>
    <p>{rounds.length - hits} {rounds.length - hits === 1 ? 'erro' : 'erros'} · {seconds}s por resposta, em média</p>
    <button type="button" onClick={() => void start()}>Jogar novamente</button>
    {onExit && <button type="button" className="secondary" onClick={leave}>Voltar</button>}
  </div></section></main>

  if (sessionMode) return <main className="study-session session-game-session" aria-busy="true"><section className="study-session-content"><div className="session-game-loading" /></section></main>

  const message = error || (voiceBlocked ? source.missingVoiceMessage : '')
  return <main className={embedded ? 'workspace-view' : 'app-shell'}><section className="welcome scene-certa-setup">
    <p className="eyebrow">JOGO</p>
    <h1>{listeningGameName}</h1>
    <p className="intro">{source.intro}</p>
    {message && <p className="error" role="alert">{message}</p>}
    {source.filters?.map((filter) => <label key={filter.id} className="quiz-picker">{filter.label}<select value={selection[filter.id] ?? filter.initial} onChange={(event) => { setError(''); setSelection((current) => ({ ...current, [filter.id]: event.target.value })) }}>{filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
    <label className="quiz-picker">Quantidade<select value={count} onChange={(event) => setCount(Number(event.target.value))}>{counts.map((value) => <option key={value} value={value}>{value} frases</option>)}</select></label>
    <div className="picture-game-actions">
      <button type="button" onClick={() => void start()} disabled={!playable}>Jogar</button>
      {onExit && <button type="button" className="secondary" onClick={() => void onExit()}>Voltar</button>}
    </div>
  </section></main>
}

export default ListenBuildModule
